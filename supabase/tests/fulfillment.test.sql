-- Tests de l'état d'expédition (0043). Transaction annulée à la fin.
-- Usage : psql "$DATABASE_URL" -f supabase/tests/fulfillment.test.sql
--
--   F1. Produit DIGITAL → aucun suivi ouvert, escrow NON verrouillé.
--   F2. Produit PHYSIQUE → suivi ouvert, escrow verrouillé.
--   F3. LE test central — escrow verrouillé NE MÛRIT PAS au chronomètre,
--       même échéance dépassée. C'est « payé au chronomètre » qui meurt ici.
--   F4. Un tiers ne peut pas déclarer la remise ; le vendeur oui.
--   F5. L'acheteur ne peut pas confirmer une remise NON déclarée.
--   F6. Réception → commande `delivered`, escrow déverrouillé, PUIS il mûrit.
--   F7. Silence de l'acheteur → auto-réception par le cron.
--   F8. Silence du VENDEUR → `action_required` + commande `disputed`.
--   F9. Idempotence : déclarer/confirmer deux fois ne double rien.
--   F10. L'identité comptable de 0033 tient à chaque étape.
--   F11. Déclaration de remise → DEUX avis acheteur créés dans la même
--        transaction (immédiat + rappel à mi-délai).
--   F12. LÉGITIMITÉ : tant qu'un avis n'est pas parti, PAS d'auto-réception.
--        Un acheteur qu'on n'a pas pu joindre n'a pas gardé le silence.
--   F13. « Je n'ai pas reçu » avant l'échéance → litige, escrow TOUJOURS
--        verrouillé, et l'auto-réception ne peut plus l'emporter.
--   F14. Avis en échec → escalade en file admin, par l'UN OU L'AUTRE des deux
--        déclencheurs : tentatives épuisées, ou échéance d'auto-réception
--        atteinte avec avis en attente. Et pas avant l'un des deux.
--   F15. Borne TEMPORELLE de l'escalade : atteinte à l'échéance
--        d'auto-réception alors que les tentatives sont loin du plafond —
--        et pas avant elle.
--
-- LE FILET STRUCTUREL (chantier 1) — F1→F15 éprouvent la machine à états une
-- fois le suivi OUVERT ; ils ne disent rien du cas où personne ne l'ouvre.
--   F16. Appel absent → suivi ouvert, escrow verrouillé, `created_at` ancré
--        sur la confirmation du PAIEMENT et non sur l'heure de la réparation.
--   F17. Escrow déjà mûri → action requise + file admin, et AUCUNE écriture
--        sur `escrow_entries` (instantané champ par champ, avant/après).
--   F18. Quatre cas que le filet ne doit PAS toucher : (a) digital réparable,
--        (b) commande encore dans la fenêtre de grâce, (c) suivi déjà
--        `shipped`, (d) DIGITAL à escrow mûri — seul endroit où l'absence de
--        filtre `kind` se voit, la branche tardive insérant sans passer par
--        `zabelie_open_fulfillment`.
--   F19. La fenêtre part de min(confirmed_at) : plusieurs paiements possibles
--        sur une commande. Jumeau connu-négatif inclus.
--   F20. Les DEUX causes de `orders.disputed` (garde-fou de montant / remise)
--        restent distinguables par la présence d'une ligne de suivi.
--   F21. Identité comptable 0033 inchangée : le filet ne déplace aucun argent.
--   F22. Appel MAL ORDONNÉ (avant `confirm_payment`) : la ligne existe mais
--        rien n'est gelé. Le cas qu'un filet cherchant « pas de ligne de
--        suivi » laisserait passer entièrement.
--   F23. Commande HONORÉE : après réception le drapeau retombe à faux et
--        l'escrow reste `maturing`. Sans exclusion des états clos, le filet
--        reposerait le verrou et le vendeur ne serait JAMAIS payé.
--   A1.  Balayage à vide : les deux compteurs EXISTENT et valent 0.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0001', 'f.vendeur@test.local'),
  ('00000000-0000-0000-0000-0000000f0002', 'f.acheteur@test.local'),
  ('00000000-0000-0000-0000-0000000f0003', 'f.tiers@test.local');

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-0000000f0001', 'Vendeur F', 'creator'),
  ('00000000-0000-0000-0000-0000000f0002', 'Acheteur F', 'buyer'),
  ('00000000-0000-0000-0000-0000000f0003', 'Tiers F', 'buyer');
insert into wallets (owner_id) values ('00000000-0000-0000-0000-0000000f0001');

insert into products (id, seller_id, slug, title, price_htg, kind, status) values
  ('00000000-0000-0000-0000-0000000f0010', '00000000-0000-0000-0000-0000000f0001',
   'ebook-f', 'E-book F', 1000, 'fichier', 'published'),
  ('00000000-0000-0000-0000-0000000f0011', '00000000-0000-0000-0000-0000000f0001',
   'filtre-f', 'Filtre F', 2000, 'physical', 'published');

do $$
declare
  v_wallet   uuid;
  v_o_dig    uuid := '00000000-0000-0000-0000-0000000f0020';
  v_o_phy    uuid := '00000000-0000-0000-0000-0000000f0021';
  v_res      jsonb;
  v_status   text;
  v_gated    boolean;
  v_matured  integer;
  v_pending  bigint;
  v_balance  bigint;
  v_ledger   bigint;
begin
  select id into v_wallet from wallets
   where owner_id = '00000000-0000-0000-0000-0000000f0001';

  -- Deux commandes payées, escrow ouvert à la main (on teste 0043, pas
  -- confirm_payment dont le branchement est décrit en §6 de la migration).
  insert into orders (id, buyer_id, product_id, amount_htg, status) values
    (v_o_dig, '00000000-0000-0000-0000-0000000f0002',
     '00000000-0000-0000-0000-0000000f0010', 1000, 'paid'),
    (v_o_phy, '00000000-0000-0000-0000-0000000f0002',
     '00000000-0000-0000-0000-0000000f0011', 2000, 'paid');

  -- Escrow ÉCHU (matures_at dans le passé) : sans verrou, il mûrirait au
  -- prochain passage du cron.
  insert into escrow_entries (order_id, wallet_id, amount_htg, matures_at) values
    (v_o_dig, v_wallet, 900,  now() - interval '1 day'),
    (v_o_phy, v_wallet, 1800, now() - interval '1 day');
  update wallets set pending_htg = 2700 where id = v_wallet;
  insert into wallet_transactions (wallet_id, type, amount_htg, idempotency_key) values
    (v_wallet, 'credit', 900,  'test_f_dig'),
    (v_wallet, 'credit', 1800, 'test_f_phy');

  -- ── F1 — produit digital : rien ne change pour lui ──────────────────────
  if zabelie_open_fulfillment(v_o_dig) then
    raise exception 'F1: un suivi a été ouvert pour un produit DIGITAL';
  end if;
  if exists (select 1 from zabelie_fulfillment where order_id = v_o_dig) then
    raise exception 'F1: ligne de suivi créée pour un digital';
  end if;
  select gated_on_delivery into v_gated from escrow_entries where order_id = v_o_dig;
  if v_gated then
    raise exception 'F1: escrow du digital verrouillé — le flux digital doit être intact';
  end if;

  -- ── F2 — produit physique : suivi ouvert, escrow verrouillé ─────────────
  if not zabelie_open_fulfillment(v_o_phy) then
    raise exception 'F2: aucun suivi ouvert pour un produit PHYSIQUE';
  end if;
  select status::text into v_status from zabelie_fulfillment where order_id = v_o_phy;
  if v_status <> 'awaiting_shipment' then
    raise exception 'F2: état initial inattendu: %', v_status;
  end if;
  select gated_on_delivery into v_gated from escrow_entries where order_id = v_o_phy;
  if not v_gated then
    raise exception 'F2: escrow du physique NON verrouillé';
  end if;

  -- ── F3 — LE test central : le chronomètre ne paie plus ──────────────────
  -- Les deux échéances sont dépassées. Seul le digital doit mûrir.
  v_matured := mature_wallets();
  if v_matured <> 1 then
    raise exception 'F3: % entrée(s) mûrie(s), 1 attendue (le digital seul)', v_matured;
  end if;
  if (select status from escrow_entries where order_id = v_o_phy) <> 'maturing' then
    raise exception 'F3: l''escrow du PHYSIQUE a mûri sans remise — « payé au chronomètre » persiste';
  end if;
  select balance_htg, pending_htg into v_balance, v_pending from wallets where id = v_wallet;
  if v_balance <> 900 or v_pending <> 1800 then
    raise exception 'F3: soldes inattendus après maturation (dispo=%, attente=%)', v_balance, v_pending;
  end if;

  -- ── F4 — seul le vendeur déclare la remise ──────────────────────────────
  v_res := zabelie_declare_shipment(v_o_phy, '00000000-0000-0000-0000-0000000f0003', 'tentative');
  if (v_res->>'ok')::boolean then
    raise exception 'F4: un TIERS a pu déclarer la remise';
  end if;
  v_res := zabelie_declare_shipment(v_o_phy, '00000000-0000-0000-0000-0000000f0002', 'tentative');
  if (v_res->>'ok')::boolean then
    raise exception 'F4: l''ACHETEUR a pu déclarer la remise';
  end if;

  -- ── F5 — l'acheteur ne confirme pas une remise non déclarée ─────────────
  v_res := zabelie_mark_received(v_o_phy, '00000000-0000-0000-0000-0000000f0002');
  if (v_res->>'ok')::boolean then
    raise exception 'F5: réception acceptée avant toute déclaration de remise';
  end if;
  if v_res->>'reason' <> 'pas_encore_expedie' then
    raise exception 'F5: motif inattendu: %', v_res->>'reason';
  end if;

  -- Le vendeur déclare pour de bon.
  v_res := zabelie_declare_shipment(v_o_phy, '00000000-0000-0000-0000-0000000f0001',
                                    'Remis en main propre à Delmas 33');
  if not (v_res->>'ok')::boolean then
    raise exception 'F4: le VENDEUR n''a pas pu déclarer (%)', v_res->>'reason';
  end if;

  -- Un tiers ne confirme pas davantage.
  v_res := zabelie_mark_received(v_o_phy, '00000000-0000-0000-0000-0000000f0003');
  if (v_res->>'ok')::boolean then
    raise exception 'F5: un TIERS a pu confirmer la réception';
  end if;

  -- ── F6 — réception : delivered, déverrouillage, PUIS maturation ─────────
  v_res := zabelie_mark_received(v_o_phy, '00000000-0000-0000-0000-0000000f0002');
  if not (v_res->>'ok')::boolean then
    raise exception 'F6: l''acheteur n''a pas pu confirmer (%)', v_res->>'reason';
  end if;
  if (select status::text from orders where id = v_o_phy) <> 'delivered' then
    raise exception 'F6: la commande n''atteint pas `delivered` — l''impasse reste ouverte';
  end if;
  select gated_on_delivery into v_gated from escrow_entries where order_id = v_o_phy;
  if v_gated then
    raise exception 'F6: escrow encore verrouillé après réception';
  end if;
  v_matured := mature_wallets();
  if v_matured <> 1 then
    raise exception 'F6: % entrée(s) mûrie(s) après réception, 1 attendue', v_matured;
  end if;
  select balance_htg, pending_htg into v_balance, v_pending from wallets where id = v_wallet;
  if v_balance <> 2700 or v_pending <> 0 then
    raise exception 'F6: soldes inattendus (dispo=%, attente=%)', v_balance, v_pending;
  end if;

  -- ── F9 — idempotence ────────────────────────────────────────────────────
  v_res := zabelie_declare_shipment(v_o_phy, '00000000-0000-0000-0000-0000000f0001', 'rejeu');
  if not (v_res->>'duplicate')::boolean then
    raise exception 'F9: seconde déclaration non signalée comme rejeu';
  end if;
  v_res := zabelie_mark_received(v_o_phy, '00000000-0000-0000-0000-0000000f0002');
  if not (v_res->>'duplicate')::boolean then
    raise exception 'F9: seconde confirmation non signalée comme rejeu';
  end if;

  -- ── F10 — identité comptable de 0033, après tout ça ─────────────────────
  select coalesce(sum(amount_htg), 0) into v_ledger
    from wallet_transactions where wallet_id = v_wallet;
  select balance_htg + pending_htg into v_balance from wallets where id = v_wallet;
  if v_ledger <> v_balance then
    raise exception 'F10: identité rompue — ledger=%, soldes=%', v_ledger, v_balance;
  end if;

  raise notice 'OK — F1 digital intact · F2 verrou · F3 le chronomètre ne paie plus · F4/F5 autorisations · F6 réception → maturation · F9 idempotence · F10 identité';
end;
$$;

-- ── F7 / F8 — les deux silences, via le cron ────────────────────────────────
do $$
declare
  v_wallet uuid;
  v_o_mut  uuid := '00000000-0000-0000-0000-0000000f0030'; -- acheteur muet
  v_o_abs  uuid := '00000000-0000-0000-0000-0000000f0031'; -- vendeur absent
  v_res    jsonb;
  v_sweep  jsonb;
begin
  select id into v_wallet from wallets
   where owner_id = '00000000-0000-0000-0000-0000000f0001';

  insert into orders (id, buyer_id, product_id, amount_htg, status) values
    (v_o_mut, '00000000-0000-0000-0000-0000000f0002',
     '00000000-0000-0000-0000-0000000f0011', 2000, 'paid'),
    (v_o_abs, '00000000-0000-0000-0000-0000000f0002',
     '00000000-0000-0000-0000-0000000f0011', 2000, 'paid');
  perform zabelie_open_fulfillment(v_o_mut);
  perform zabelie_open_fulfillment(v_o_abs);

  -- Remise déclarée il y a longtemps, acheteur silencieux.
  v_res := zabelie_declare_shipment(v_o_mut, '00000000-0000-0000-0000-0000000f0001', 'envoyé');
  update zabelie_fulfillment set shipped_at = now() - interval '30 days'
   where order_id = v_o_mut;
  -- Les avis sont partis : l'acheteur a bien été prévenu, son silence compte.
  update zabelie_fulfillment_notices set sent_at = now() where order_id = v_o_mut;
  -- Vendeur qui n'a jamais rien déclaré, commande ancienne.
  update zabelie_fulfillment set created_at = now() - interval '30 days'
   where order_id = v_o_abs;

  v_sweep := zabelie_fulfillment_sweep();

  -- F7
  if (v_sweep->>'auto_recus')::integer <> 1 then
    raise exception 'F7: % auto-réception(s), 1 attendue', v_sweep->>'auto_recus';
  end if;
  if (select status::text from zabelie_fulfillment where order_id = v_o_mut) <> 'received' then
    raise exception 'F7: l''acheteur muet n''a pas déclenché l''auto-réception';
  end if;
  if not (select auto_received from zabelie_fulfillment where order_id = v_o_mut) then
    raise exception 'F7: auto_received non marqué — on ne saurait plus qui a tranché';
  end if;
  if (select received_by from zabelie_fulfillment where order_id = v_o_mut) is not null then
    raise exception 'F7: une auto-réception ne doit attribuer aucun auteur';
  end if;

  -- F8 — la moitié qu'on oublie : la sortie côté acheteur.
  if (v_sweep->>'action_requise')::integer <> 1 then
    raise exception 'F8: % commande(s) en action requise, 1 attendue', v_sweep->>'action_requise';
  end if;
  if (select status::text from zabelie_fulfillment where order_id = v_o_abs) <> 'action_required' then
    raise exception 'F8: le silence du VENDEUR ne débouche sur aucune sortie';
  end if;
  if (select status::text from orders where id = v_o_abs) <> 'disputed' then
    raise exception 'F8: la commande non honorée reste invisible côté commande';
  end if;
  if not exists (select 1 from zabelie_fulfillment_overdue where order_id = v_o_abs) then
    raise exception 'F8: absente de la file admin — personne ne la verra';
  end if;

  raise notice 'OK — F7 acheteur muet → auto-réception · F8 vendeur absent → action requise + file admin';
end;
$$;

-- ── F11 / F12 / F13 — avis, légitimité, et le chemin « pa resevwa » ─────────
do $$
declare
  v_o_avis uuid := '00000000-0000-0000-0000-0000000f0040';
  v_o_muet uuid := '00000000-0000-0000-0000-0000000f0041';
  v_o_lit  uuid := '00000000-0000-0000-0000-0000000f0042';
  v_res    jsonb;
  v_sweep  jsonb;
  v_n      integer;
  v_due    timestamptz;
begin
  insert into orders (id, buyer_id, product_id, amount_htg, status) values
    (v_o_avis, '00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0011', 2000, 'paid'),
    (v_o_muet, '00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0011', 2000, 'paid'),
    (v_o_lit,  '00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0011', 2000, 'paid');
  perform zabelie_open_fulfillment(v_o_avis);
  perform zabelie_open_fulfillment(v_o_muet);
  perform zabelie_open_fulfillment(v_o_lit);

  -- ── F11 — deux avis créés à la déclaration ────────────────────────────────
  perform zabelie_declare_shipment(v_o_avis, '00000000-0000-0000-0000-0000000f0001', 'envoyé');
  select count(*) into v_n from zabelie_fulfillment_notices where order_id = v_o_avis;
  if v_n <> 2 then
    raise exception 'F11: % avis créé(s), 2 attendus (immédiat + rappel)', v_n;
  end if;
  if not exists (select 1 from zabelie_fulfillment_notices
                  where order_id = v_o_avis and kind = 'shipped_buyer' and due_at <= now()) then
    raise exception 'F11: avis immédiat absent ou différé';
  end if;
  select due_at into v_due from zabelie_fulfillment_notices
   where order_id = v_o_avis and kind = 'reminder_buyer';
  if v_due <= now() then
    raise exception 'F11: le rappel doit être PROGRAMMÉ, pas immédiat (%)', v_due;
  end if;

  -- ── F12 — avis non parti → JAMAIS d'auto-réception ────────────────────────
  -- Note : depuis la borne temporelle (F15), une commande dont les avis
  -- traînent au-delà de l'échéance escalade en file admin. Le point de F12
  -- reste entier et se formule en négatif : quoi qu'il arrive, elle
  -- n'atteint PAS `received`.
  perform zabelie_declare_shipment(v_o_muet, '00000000-0000-0000-0000-0000000f0001', 'envoyé');
  update zabelie_fulfillment set shipped_at = now() - interval '30 days'
   where order_id = v_o_muet;
  -- On NE marque PAS les avis envoyés : l'acheteur n'a jamais été joint.
  v_sweep := zabelie_fulfillment_sweep();
  if (select status::text from zabelie_fulfillment where order_id = v_o_muet) = 'received' then
    raise exception 'F12: auto-réception prononcée alors qu''AUCUN avis n''est parti — expropriation sur un silence non informé';
  end if;
  if (select gated_on_delivery from escrow_entries where order_id = v_o_muet) is false then
    raise exception 'F12: escrow déverrouillé sans réception';
  end if;

  -- SENS INVERSE, sur une commande propre : avis partis AVANT l'échéance,
  -- puis échéance atteinte → l'auto-réception a bien lieu. C'est le chemin
  -- nominal, celui qui doit rester possible.
  insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000f0043',
          '00000000-0000-0000-0000-0000000f0002',
          '00000000-0000-0000-0000-0000000f0011', 2000, 'paid');
  perform zabelie_open_fulfillment('00000000-0000-0000-0000-0000000f0043');
  perform zabelie_declare_shipment('00000000-0000-0000-0000-0000000f0043',
                                   '00000000-0000-0000-0000-0000000f0001', 'envoyé');
  update zabelie_fulfillment_notices set sent_at = now()
   where order_id = '00000000-0000-0000-0000-0000000f0043';
  update zabelie_fulfillment set shipped_at = now() - interval '30 days'
   where order_id = '00000000-0000-0000-0000-0000000f0043';
  v_sweep := zabelie_fulfillment_sweep();
  if (select status::text from zabelie_fulfillment
       where order_id = '00000000-0000-0000-0000-0000000f0043') <> 'received' then
    raise exception 'F12: avis partis, l''auto-réception aurait dû avoir lieu';
  end if;
  if not exists (select 1 from zabelie_fulfillment_notices
                  where order_id = '00000000-0000-0000-0000-0000000f0043'
                    and kind = 'auto_received') then
    raise exception 'F12: aucun avis final — l''acheteur ne saura pas que le délai a tranché';
  end if;

  -- ── F13 — « je n'ai pas reçu », avant l'échéance ──────────────────────────
  perform zabelie_declare_shipment(v_o_lit, '00000000-0000-0000-0000-0000000f0001', 'envoyé');
  v_res := zabelie_report_not_received(v_o_lit, '00000000-0000-0000-0000-0000000f0003', 'test');
  if (v_res->>'ok')::boolean then
    raise exception 'F13: un TIERS a pu déclarer une non-réception';
  end if;
  v_res := zabelie_report_not_received(v_o_lit, '00000000-0000-0000-0000-0000000f0002', 'rien reçu');
  if not (v_res->>'ok')::boolean then
    raise exception 'F13: l''acheteur n''a pas pu signaler (%)', v_res->>'reason';
  end if;
  if (select status::text from zabelie_fulfillment where order_id = v_o_lit) <> 'disputed_by_buyer' then
    raise exception 'F13: état de litige non atteint';
  end if;
  if (select gated_on_delivery from escrow_entries where order_id = v_o_lit) is false then
    raise exception 'F13: escrow déverrouillé malgré le litige — le vendeur serait payé';
  end if;
  -- Et l'auto-réception ne peut plus l'emporter, même délai dépassé.
  update zabelie_fulfillment set shipped_at = now() - interval '30 days' where order_id = v_o_lit;
  update zabelie_fulfillment_notices set sent_at = now() where order_id = v_o_lit;
  v_sweep := zabelie_fulfillment_sweep();
  if (select status::text from zabelie_fulfillment where order_id = v_o_lit) = 'received' then
    raise exception 'F13: l''auto-réception a écrasé un litige déclaré';
  end if;
  if not exists (select 1 from zabelie_fulfillment_overdue where order_id = v_o_lit) then
    raise exception 'F13: litige absent de la file admin';
  end if;

  raise notice 'OK — F11 deux avis · F12 pas d''auto-réception sans avis parti (et l''inverse) · F13 « pa resevwa » avant échéance, escrow verrouillé';
end;
$$;

-- ── F14 — l'échec permanent d'envoi ne laisse pas la commande en limbe ──────
do $$
declare
  v_o uuid := '00000000-0000-0000-0000-0000000f0050';
  v_sweep jsonb;
begin
  insert into orders (id, buyer_id, product_id, amount_htg, status) values
    (v_o, '00000000-0000-0000-0000-0000000f0002',
     '00000000-0000-0000-0000-0000000f0011', 2000, 'paid');
  perform zabelie_open_fulfillment(v_o);
  perform zabelie_declare_shipment(v_o, '00000000-0000-0000-0000-0000000f0001', 'envoyé');

  -- Cas NÉGATIF d'abord : ni tentatives épuisées, ni échéance atteinte →
  -- rien ne bouge. Escalader trop tôt serait crier au loup.
  update zabelie_fulfillment_notices set attempts = 4 where order_id = v_o;
  v_sweep := zabelie_fulfillment_sweep();
  if (select status::text from zabelie_fulfillment where order_id = v_o) <> 'shipped' then
    raise exception 'F14: escaladé alors qu''AUCUN des deux déclencheurs n''est atteint';
  end if;

  -- Cas POSITIF : tentatives épuisées → file admin, commande disputed,
  -- escrow toujours verrouillé mais VISIBLE.
  update zabelie_fulfillment_notices set attempts = 5 where order_id = v_o;
  v_sweep := zabelie_fulfillment_sweep();
  if (v_sweep->>'avis_en_echec')::integer <> 1 then
    raise exception 'F14: % commande(s) escaladée(s), 1 attendue', v_sweep->>'avis_en_echec';
  end if;
  if (select status::text from zabelie_fulfillment where order_id = v_o) <> 'action_required' then
    raise exception 'F14: la commande reste en limbe malgré l''échec permanent — rétention n°3';
  end if;
  if (select status::text from orders where id = v_o) <> 'disputed' then
    raise exception 'F14: la commande n''est pas signalée côté orders';
  end if;
  if not exists (select 1 from zabelie_fulfillment_overdue where order_id = v_o) then
    raise exception 'F14: absente de la file admin — un limbe VISIBLE reste un limbe';
  end if;
  if (select gated_on_delivery from escrow_entries where order_id = v_o) is false then
    raise exception 'F14: escrow déverrouillé — l''échec d''envoi aurait payé le vendeur';
  end if;

  raise notice 'OK — F14a tentatives épuisées → file admin (et pas avant)';
end;
$$;

-- ── F15 — la borne TEMPORELLE, indépendante du nombre de tentatives ─────────
-- Avec un recul exponentiel et un cron quotidien, 5 tentatives peuvent
-- dépasser la fenêtre d'auto-réception : le vendeur d'une commande honorée
-- attendrait deux semaines avant qu'un humain voie seulement le dossier.
do $$
declare
  v_o uuid := '00000000-0000-0000-0000-0000000f0051';
  v_sweep jsonb;
begin
  insert into orders (id, buyer_id, product_id, amount_htg, status) values
    (v_o, '00000000-0000-0000-0000-0000000f0002',
     '00000000-0000-0000-0000-0000000f0011', 2000, 'paid');
  perform zabelie_open_fulfillment(v_o);
  perform zabelie_declare_shipment(v_o, '00000000-0000-0000-0000-0000000f0001', 'envoyé');

  -- UNE SEULE tentative — très loin du plafond de 5. Sans borne temporelle,
  -- cette commande resterait `shipped` indéfiniment.
  update zabelie_fulfillment_notices set attempts = 1 where order_id = v_o;

  -- Échéance PAS encore atteinte : rien ne bouge.
  update zabelie_fulfillment set shipped_at = now() - interval '2 days' where order_id = v_o;
  v_sweep := zabelie_fulfillment_sweep();
  if (select status::text from zabelie_fulfillment where order_id = v_o) <> 'shipped' then
    raise exception 'F15: escaladé avant l''échéance d''auto-réception';
  end if;

  -- Échéance dépassée, avis toujours en attente → escalade, sans que le
  -- plafond de tentatives soit approché.
  update zabelie_fulfillment set shipped_at = now() - interval '30 days' where order_id = v_o;
  v_sweep := zabelie_fulfillment_sweep();
  if (select status::text from zabelie_fulfillment where order_id = v_o) <> 'action_required' then
    raise exception 'F15: avis bloqué au-delà de l''échéance et AUCUNE escalade — le vendeur attend sans que personne voie le dossier';
  end if;
  if (select attempts from zabelie_fulfillment_notices
       where order_id = v_o and kind = 'shipped_buyer') >= 5 then
    raise exception 'F15: le test s''appuie sur le plafond de tentatives, pas sur le temps';
  end if;
  -- Et l'auto-réception n'a PAS eu lieu : l'acheteur n'a toujours pas été joint.
  if (select gated_on_delivery from escrow_entries where order_id = v_o) is false then
    raise exception 'F15: escrow déverrouillé — un échec d''envoi aurait payé le vendeur';
  end if;

  raise notice 'OK — F15 borne temporelle : escalade à l''échéance, tentatives loin du plafond';
end;
$$;

-- ── F16→F23 — LE FILET STRUCTUREL (chantier 1) ──────────────────────────────
-- Ce que ces huit cas ajoutent à F1→F15 : ceux-là éprouvent la machine à états
-- UNE FOIS le suivi ouvert. Ils ne disent rien du cas où PERSONNE ne l'ouvre —
-- or `zabelie_open_fulfillment` n'a eu, jusqu'à ce chantier, aucun appelant :
-- le branchement dans `confirm_payment` est resté une note d'application. Tout
-- 0043 était donc inerte en production, avec quinze tests verts. C'est ce
-- trou-là que le filet ferme et que ces cas mesurent.
--
-- Les fixtures F1→F15 ne créent AUCUNE ligne `payments` : elles ne peuvent
-- donc pas être ramassées par le filet, qui exige une confirmation de
-- paiement. Aucune interférence entre les deux moitiés du fichier.
do $$
declare
  v_wallet uuid;
  -- Réparables — l'argent est encore gelable.
  v_o16  uuid := '00000000-0000-0000-0000-0000000f0060';  -- appel ABSENT
  v_o22  uuid := '00000000-0000-0000-0000-0000000f0061';  -- appel MAL ORDONNÉ
  v_o19a uuid := '00000000-0000-0000-0000-0000000f0062';  -- 2 paiements, 1er ancien
  -- Tardif — l'argent est déjà sorti.
  v_o17  uuid := '00000000-0000-0000-0000-0000000f0063';
  -- À NE PAS toucher.
  v_o18a uuid := '00000000-0000-0000-0000-0000000f0064';  -- produit DIGITAL
  v_o18b uuid := '00000000-0000-0000-0000-0000000f0065';  -- dans la grâce
  v_o18c uuid := '00000000-0000-0000-0000-0000000f0066';  -- déjà `shipped`
  v_o18d uuid := '00000000-0000-0000-0000-0000000f006a';  -- DIGITAL + escrow mûri
  v_o19b uuid := '00000000-0000-0000-0000-0000000f0067';  -- 2 paiements, 1er récent
  v_o20  uuid := '00000000-0000-0000-0000-0000000f0068';  -- litige de MONTANT
  v_o23  uuid := '00000000-0000-0000-0000-0000000f0069';  -- déjà REÇU
  v_sweep  jsonb;
  v_gated  boolean;
  v_status text;
  v_bal0   bigint; v_pend0 bigint; v_led0 bigint;
  v_bal1   bigint; v_pend1 bigint; v_led1 bigint;
  -- Instantané de l'escrow tardif, champ par champ.
  v_e_gated0 boolean; v_e_mat0 timestamptz; v_e_st0 text;
  v_e_gated1 boolean; v_e_mat1 timestamptz; v_e_st1 text;
  v_created  timestamptz; v_conf timestamptz;
  v_n        integer;
begin
  select id into v_wallet from wallets
   where owner_id = '00000000-0000-0000-0000-0000000f0001';

  -- ── Fixtures ──────────────────────────────────────────────────────────────
  insert into orders (id, buyer_id, product_id, amount_htg, status) values
    (v_o16,  '00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0011', 2000, 'paid'),
    (v_o22,  '00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0011', 2000, 'paid'),
    (v_o19a, '00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0011', 2000, 'paid'),
    (v_o17,  '00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0011', 2000, 'paid'),
    (v_o18a, '00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0010', 1000, 'paid'),
    (v_o18b, '00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0011', 2000, 'paid'),
    (v_o18c, '00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0011', 2000, 'paid'),
    (v_o19b, '00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0011', 2000, 'paid'),
    (v_o20,  '00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0011', 2000, 'disputed'),
    (v_o23,  '00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0011', 2000, 'paid'),
    (v_o18d, '00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0010', 1000, 'paid');

  insert into payments (order_id, rail, idempotency_key, status, confirmed_at) values
    (v_o16,  'moncash', 'net_16',  'confirmed', now() - interval '7 hours'),
    (v_o22,  'moncash', 'net_22',  'confirmed', now() - interval '7 hours'),
    -- F19 : DEUX paiements. La fenêtre se mesure sur le PREMIER.
    (v_o19a, 'moncash', 'net_19a1','confirmed', now() - interval '8 hours'),
    (v_o19a, 'moncash', 'net_19a2','confirmed', now() - interval '1 hour'),
    (v_o19b, 'moncash', 'net_19b1','confirmed', now() - interval '5 hours'),
    (v_o19b, 'moncash', 'net_19b2','confirmed', now() - interval '1 hour'),
    (v_o17,  'moncash', 'net_17',  'confirmed', now() - interval '7 hours'),
    (v_o18a, 'moncash', 'net_18a', 'confirmed', now() - interval '7 hours'),
    (v_o18b, 'moncash', 'net_18b', 'confirmed', now() - interval '2 hours'),
    (v_o18c, 'moncash', 'net_18c', 'confirmed', now() - interval '7 hours'),
    (v_o18d, 'moncash', 'net_18d', 'confirmed', now() - interval '7 hours'),
    (v_o23,  'moncash', 'net_23',  'confirmed', now() - interval '7 hours'),
    -- F20 : le garde-fou de MONTANT (0044) — paiement rejeté, aucun escrow.
    (v_o20,  'moncash', 'net_20',  'failed',    null);

  insert into escrow_entries (order_id, wallet_id, amount_htg, matures_at, status, gated_on_delivery) values
    (v_o16,  v_wallet, 1800, now() + interval '7 days', 'maturing', false),
    (v_o22,  v_wallet, 1800, now() + interval '7 days', 'maturing', false),
    (v_o19a, v_wallet, 1800, now() + interval '7 days', 'maturing', false),
    (v_o19b, v_wallet, 1800, now() + interval '7 days', 'maturing', false),
    (v_o18a, v_wallet,  900, now() + interval '7 days', 'maturing', false),
    (v_o18b, v_wallet, 1800, now() + interval '7 days', 'maturing', false),
    (v_o18c, v_wallet, 1800, now() + interval '7 days', 'maturing', true),
    -- F23 : commande HONORÉE — `mark_received` a remis le drapeau à faux et
    -- l'escrow reste `maturing` jusqu'au passage de `mature_wallets()`.
    (v_o23,  v_wallet, 1800, now() + interval '7 days', 'maturing', false),
    -- F17 : l'argent est DÉJÀ SORTI.
    (v_o17,  v_wallet, 1800, now() - interval '1 day',  'matured',  false),
    -- F18d : DIGITAL dont l'escrow a mûri. Seul cas où un filtre `kind`
    -- manquant se VOIT : la branche tardive insère en direct et n'hérite pas
    -- du garde de type de `zabelie_open_fulfillment` (la branche réparable,
    -- elle, passe par lui et serait protégée sans rien faire).
    (v_o18d, v_wallet,  900, now() - interval '1 day',  'matured',  false);

  -- Suivis préexistants : l'ordre inversé (F22), le colis parti (F18c), la
  -- commande reçue (F23).
  insert into zabelie_fulfillment (order_id, status) values (v_o22, 'awaiting_shipment');
  insert into zabelie_fulfillment (order_id, status, shipped_at)
    values (v_o18c, 'shipped', now());
  insert into zabelie_fulfillment (order_id, status, received_at, received_by)
    values (v_o23, 'received', now(), '00000000-0000-0000-0000-0000000f0002');

  -- L'identité de 0033 doit tenir AVANT le balayage, sinon F21 mesurerait le
  -- désordre de sa propre fixture.
  insert into wallet_transactions (wallet_id, type, amount_htg, order_id, idempotency_key)
  select v_wallet, 'credit', e.amount_htg, e.order_id, 'net_' || e.order_id
    from escrow_entries e
   where e.order_id in (v_o16, v_o22, v_o19a, v_o19b, v_o17, v_o18a, v_o18b, v_o18c, v_o23, v_o18d);
  update wallets set
    pending_htg = pending_htg + (select coalesce(sum(amount_htg), 0) from escrow_entries
                                  where order_id in (v_o16, v_o22, v_o19a, v_o19b, v_o18a, v_o18b, v_o18c, v_o23)),
    balance_htg = balance_htg + (select coalesce(sum(amount_htg), 0) from escrow_entries
                                  where order_id in (v_o17, v_o18d))
   where id = v_wallet;

  select balance_htg, pending_htg into v_bal0, v_pend0 from wallets where id = v_wallet;
  select coalesce(sum(amount_htg), 0) into v_led0 from wallet_transactions where wallet_id = v_wallet;
  if v_led0 <> v_bal0 + v_pend0 then
    raise exception 'F21: la FIXTURE elle-même rompt 0033 (ledger=%, soldes=%) — le cas ne mesurerait rien',
      v_led0, v_bal0 + v_pend0;
  end if;

  select gated_on_delivery, matures_at, status::text
    into v_e_gated0, v_e_mat0, v_e_st0 from escrow_entries where order_id = v_o17;

  -- ── Le balayage ───────────────────────────────────────────────────────────
  v_sweep := zabelie_fulfillment_sweep();

  -- ── F16 · F19a · F22 — les trois réparables ──────────────────────────────
  select gated_on_delivery into v_gated from escrow_entries where order_id = v_o16;
  if v_gated is not true then
    raise exception 'F16: appel absent NON rattrapé — l''escrow mûrira au chronomètre';
  end if;
  select status::text into v_status from zabelie_fulfillment where order_id = v_o16;
  if v_status is distinct from 'awaiting_shipment' then
    raise exception 'F16: suivi absent ou dans un état inattendu (%)', v_status;
  end if;
  -- L'ANCRE : le délai vendeur part de la confirmation du paiement, pas de
  -- l'heure de la réparation.
  select created_at into v_created from zabelie_fulfillment where order_id = v_o16;
  select min(confirmed_at) into v_conf from payments
   where order_id = v_o16 and status = 'confirmed';
  if v_created <> v_conf then
    raise exception 'F16: created_at ancré sur la réparation (%) et non sur le paiement (%) — le vendeur gagnerait le retard de la plateforme',
      v_created, v_conf;
  end if;

  select gated_on_delivery into v_gated from escrow_entries where order_id = v_o22;
  if v_gated is not true then
    raise exception 'F22: appel MAL ORDONNÉ non rattrapé — la ligne de suivi existe mais rien n''est gelé. C''est le cas qu''un filet cherchant « pas de ligne de suivi » laisserait passer entièrement';
  end if;

  select gated_on_delivery into v_gated from escrow_entries where order_id = v_o19a;
  if v_gated is not true then
    raise exception 'F19: fenêtre mesurée sur max(confirmed_at) — un paiement tardif rajeunit l''orphelin indéfiniment';
  end if;

  -- ── F17 — le tardif : AUCUNE écriture sur l'escrow ───────────────────────
  select gated_on_delivery, matures_at, status::text
    into v_e_gated1, v_e_mat1, v_e_st1 from escrow_entries where order_id = v_o17;
  if (v_e_gated1, v_e_mat1, v_e_st1) is distinct from (v_e_gated0, v_e_mat0, v_e_st0) then
    raise exception 'F17: escrow MÛRI modifié par le filet — avant (%, %, %), après (%, %, %). L''argent est parti : re-verrouiller ne récupère rien et rompt 0033',
      v_e_gated0, v_e_mat0, v_e_st0, v_e_gated1, v_e_mat1, v_e_st1;
  end if;
  select status::text into v_status from zabelie_fulfillment where order_id = v_o17;
  if v_status is distinct from 'action_required' then
    raise exception 'F17: le tardif n''atterrit pas en action requise (%)', v_status;
  end if;
  if (select status::text from orders where id = v_o17) <> 'disputed' then
    raise exception 'F17: le tardif reste invisible côté commande';
  end if;
  if not exists (select 1 from zabelie_fulfillment_overdue where order_id = v_o17) then
    raise exception 'F17: absent de la file admin — personne ne le verra';
  end if;

  -- ── F18 — les trois que le filet ne doit PAS toucher ─────────────────────
  -- (a) DIGITAL. La branche tardive INSÈRE directement et n'hérite donc pas
  --     du garde de type de `zabelie_open_fulfillment` : c'est ici que se voit
  --     un filtre `kind` manquant.
  if exists (select 1 from zabelie_fulfillment where order_id = v_o18a) then
    raise exception 'F18a: suivi ouvert sur un produit DIGITAL — le flux digital n''est plus intact';
  end if;
  if (select gated_on_delivery from escrow_entries where order_id = v_o18a) is true then
    raise exception 'F18a: escrow d''un DIGITAL verrouillé par le filet';
  end if;
  -- (b) DANS LA GRÂCE. `/api/reconcile` ne passe qu'une fois par jour : une
  --     commande de deux heures n'est pas un oubli.
  if exists (select 1 from zabelie_fulfillment where order_id = v_o18b) then
    raise exception 'F18b: commande de 2 h traitée en orphelin — la fenêtre de grâce ne joue pas';
  end if;
  -- (c) DÉJÀ EXPÉDIÉE, escrow correctement verrouillé.
  select status::text into v_status from zabelie_fulfillment where order_id = v_o18c;
  if v_status is distinct from 'shipped' then
    raise exception 'F18c: suivi `shipped` recalé par le filet (%)', v_status;
  end if;
  -- (d) DIGITAL À ESCROW MÛRI — la branche TARDIVE insère sans passer par
  --     `zabelie_open_fulfillment` : c'est le seul endroit du filet où
  --     l'absence de filtre `kind` produit un effet observable.
  if exists (select 1 from zabelie_fulfillment where order_id = v_o18d) then
    raise exception 'F18d: suivi de remise ouvert sur un produit DIGITAL par la branche tardive — le filtre `kind` ne protège que la branche réparable';
  end if;
  if (select status::text from orders where id = v_o18d) <> 'paid' then
    raise exception 'F18d: commande DIGITALE passée en litige de remise par le filet';
  end if;
  -- (e) F19b — les deux paiements récents : min = 5 h < 6 h de grâce.
  if exists (select 1 from zabelie_fulfillment where order_id = v_o19b) then
    raise exception 'F19b: orphelin déclaré alors que la PREMIÈRE confirmation date de 5 h';
  end if;

  -- ── F23 — le garde qui empêche de ne JAMAIS payer le vendeur ─────────────
  select gated_on_delivery into v_gated from escrow_entries where order_id = v_o23;
  if v_gated is not false then
    raise exception 'F23: commande HONORÉE re-verrouillée par le filet. Après réception, `mark_received` remet le drapeau à faux et l''escrow reste `maturing` — sans l''exclusion des états clos, le filet repose le verrou à chaque passage et le vendeur n''est JAMAIS payé';
  end if;
  select status::text into v_status from zabelie_fulfillment where order_id = v_o23;
  if v_status is distinct from 'received' then
    raise exception 'F23: état de réception écrasé par le filet (%)', v_status;
  end if;

  -- ── F20 — les DEUX causes de `orders.disputed` restent distinguables ──────
  -- Le garde-fou de montant (0044) pose `disputed` sans jamais créer d'escrow
  -- ni de suivi. Le désambiguïsateur est la présence d'une ligne de suivi.
  if exists (select 1 from zabelie_fulfillment where order_id = v_o20) then
    raise exception 'F20: le filet a ouvert un suivi sur un litige de MONTANT';
  end if;
  if exists (select 1 from zabelie_fulfillment_overdue where order_id = v_o20) then
    raise exception 'F20: un litige de MONTANT apparaît dans la file des remises — les deux causes de `disputed` sont confondues';
  end if;

  -- ── F21 — aucune écriture d'argent (cadre BRH) ───────────────────────────
  select balance_htg, pending_htg into v_bal1, v_pend1 from wallets where id = v_wallet;
  select coalesce(sum(amount_htg), 0) into v_led1 from wallet_transactions where wallet_id = v_wallet;
  if v_led1 <> v_bal1 + v_pend1 then
    raise exception 'F21: identité 0033 rompue après le filet — ledger=%, soldes=%', v_led1, v_bal1 + v_pend1;
  end if;
  if (v_bal1, v_pend1, v_led1) is distinct from (v_bal0, v_pend0, v_led0) then
    raise exception 'F21: le filet a DÉPLACÉ de l''argent — avant (%, %, %), après (%, %, %)',
      v_bal0, v_pend0, v_led0, v_bal1, v_pend1, v_led1;
  end if;

  -- ── Les compteurs, EN DERNIER — et c'est le harnais de mutation qui l'a
  -- imposé. Placés en tête, ils rougissaient les premiers sur QUATRE des six
  -- mutations et masquaient le cas précis : « 4 orphelins réparés, 3 attendus »
  -- dit qu'un garde a sauté, jamais lequel. Un compteur est un fil-piège, pas
  -- un diagnostic : il passe après les assertions qui nomment le défaut, et
  -- ne sert plus qu'à attraper ce qu'aucune d'elles ne couvre.
  if (v_sweep->>'orphelins_repares')::integer <> 3 then
    raise exception 'F16/F19/F22: % orphelin(s) réparé(s), 3 attendus — %',
      v_sweep->>'orphelins_repares', v_sweep::text;
  end if;
  if (v_sweep->>'orphelins_tardifs')::integer <> 1 then
    raise exception 'F17: % orphelin(s) tardif(s), 1 attendu', v_sweep->>'orphelins_tardifs';
  end if;

  -- ── Idempotence — un second passage ne recompte rien ─────────────────────
  -- Sans elle, le filet republierait les mêmes orphelins chaque jour : les
  -- compteurs du journal deviendraient du bruit, et la branche tardive
  -- repasserait une commande déjà chez un humain en `action_required`.
  v_sweep := zabelie_fulfillment_sweep();
  if (v_sweep->>'orphelins_repares')::integer <> 0
     or (v_sweep->>'orphelins_tardifs')::integer <> 0 then
    raise exception 'F16/F17: second passage non idempotent — %', v_sweep::text;
  end if;

  raise notice 'OK — F16 appel absent · F17 tardif sans écriture escrow · F18 quatre négatifs (dont F18d digital tardif) · F19 min(confirmed_at) · F20 disputed distinguable · F21 zéro argent · F22 appel mal ordonné · F23 commande honorée intacte';
end;
$$;

-- ── Absence de signal — le balayage à vide DOIT porter ses compteurs ────────
-- « n'a pas tourné » et « a tourné, rien trouvé » ne doivent pas produire le
-- même vide. L'assertion porte sur l'EXISTENCE de la clé : une clé oubliée
-- dans `jsonb_build_object` rend `null`, et un compteur absent se lit comme
-- « rien à faire ».
do $$
declare
  v_sweep jsonb;
begin
  delete from zabelie_fulfillment;
  delete from escrow_entries;
  delete from payments;
  v_sweep := zabelie_fulfillment_sweep();
  if not (v_sweep ? 'orphelins_repares') or not (v_sweep ? 'orphelins_tardifs') then
    raise exception 'A1: compteurs du filet ABSENTS du journal du cron — %', v_sweep::text;
  end if;
  if (v_sweep->>'orphelins_repares')::integer <> 0
     or (v_sweep->>'orphelins_tardifs')::integer <> 0 then
    raise exception 'A1: base vide et compteurs non nuls — %', v_sweep::text;
  end if;
  raise notice 'OK — A1 balayage à vide : les deux compteurs existent et valent 0';
end;
$$;

rollback;
