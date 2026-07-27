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
--   F8. Silence du VENDEUR → `refund_required` + commande `disputed`.
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

rollback;
