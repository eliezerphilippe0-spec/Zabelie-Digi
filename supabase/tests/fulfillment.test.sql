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

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0001', 'f.vendeur@test.local'),
  ('00000000-0000-0000-0000-0000000f0002', 'f.acheteur@test.local'),
  ('00000000-0000-0000-0000-0000000f0003', 'f.tiers@test.local');
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
  if (v_sweep->>'a_rembourser')::integer <> 1 then
    raise exception 'F8: % commande(s) à rembourser, 1 attendue', v_sweep->>'a_rembourser';
  end if;
  if (select status::text from zabelie_fulfillment where order_id = v_o_abs) <> 'refund_required' then
    raise exception 'F8: le silence du VENDEUR ne débouche sur aucune sortie';
  end if;
  if (select status::text from orders where id = v_o_abs) <> 'disputed' then
    raise exception 'F8: la commande non honorée reste invisible côté commande';
  end if;
  if not exists (select 1 from zabelie_fulfillment_overdue where order_id = v_o_abs) then
    raise exception 'F8: absente de la file admin — personne ne la verra';
  end if;

  raise notice 'OK — F7 acheteur muet → auto-réception · F8 vendeur absent → remboursement requis + file admin';
end;
$$;

rollback;
