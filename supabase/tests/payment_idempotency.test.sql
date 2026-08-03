-- Tests du chemin de l'argent (EPIC 4 / EPIC 5) — invariants exécutables.
-- À exécuter sur une base avec les migrations appliquées, dans une transaction
-- annulée à la fin (rollback) pour ne rien laisser.
--
-- Usage : psql "$DATABASE_URL" -f supabase/tests/payment_idempotency.test.sql
--
-- Couvre :
--   A. Idempotence + commission standard (10 %) : confirm_payment rejoué 3× →
--      un seul crédit du NET (2250 sur 2500), une seule ligne platform_earnings.
--   B. Montant falsifié : montant ≠ commande → REJET (payment failed, order
--      disputed, aucun crédit, aucune livraison).
--   C. Commission Elite (6 %) : net 940 sur 1000.
--   D. Rail USD (Zelle/Stripe, 0009) : montant USD reçu ≠ figé → REJET.
--   E. Rail USD, montant exact : confirmation + crédit net HTG, idempotente.
--   F. BL-133 (0027) : coupon consommé PAR confirm_payment, pas avant ; rejeu
--      idempotent → une seule consommation.
--   G. BL-133 : quota déjà épuisé au moment de la confirmation (course perdue
--      entre deux checkouts) → paiement CONFIRMÉ quand même (déjà facturé au
--      prix remisé), consommation en best-effort silencieux.

begin;

-- Vendeurs --------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'seller@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'elite@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'diaspora@test.local')
  on conflict do nothing;

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, role, display_name, tier) values
  ('00000000-0000-0000-0000-000000000001', 'creator', 'Vendeur Standard', 'standard'),
  ('00000000-0000-0000-0000-000000000002', 'creator', 'Vendeur Elite', 'elite'),
  ('00000000-0000-0000-0000-000000000003', 'creator', 'Vendeur Diaspora', 'standard');

-- ════════════════════ Scénario A : idempotence + commission 10 % ════════════════════
insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000001',
          'produit-a', 'Produit A', 'fichier', 2500, 'published');
insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-0000000000a1', 2500, 'pending');
insert into payments (order_id, rail, idempotency_key, status)
  values ('00000000-0000-0000-0000-0000000000b1', 'moncash',
          '00000000-0000-0000-0000-0000000000b1', 'pending');

-- Confirmation appelée TROIS FOIS, montant correct.
select confirm_payment('00000000-0000-0000-0000-0000000000b1', 'TX1', '{}'::jsonb, 2500);
select confirm_payment('00000000-0000-0000-0000-0000000000b1', 'TX1', '{}'::jsonb, 2500);
select confirm_payment('00000000-0000-0000-0000-0000000000b1', 'TX1', '{}'::jsonb, 2500);

-- ═══════════════════ Scénario B : montant falsifié ═══════════════════
insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-000000000001',
          'produit-b', 'Produit B', 'fichier', 4000, 'published');
insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000000b2',
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-0000000000a2', 4000, 'pending');
insert into payments (order_id, rail, idempotency_key, status)
  values ('00000000-0000-0000-0000-0000000000b2', 'moncash',
          '00000000-0000-0000-0000-0000000000b2', 'pending');

-- Montant rapporté (1000) ≠ commande (4000) → doit être REJETÉ.
select confirm_payment('00000000-0000-0000-0000-0000000000b2', 'TX2', '{}'::jsonb, 1000);

-- ═══════════════════ Scénario C : commission Elite 6 % ═══════════════════
insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000000a3',
          '00000000-0000-0000-0000-000000000002',
          'produit-c', 'Produit C', 'fichier', 1000, 'published');
insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000000b3',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-0000000000a3', 1000, 'pending');
insert into payments (order_id, rail, idempotency_key, status)
  values ('00000000-0000-0000-0000-0000000000b3', 'moncash',
          '00000000-0000-0000-0000-0000000000b3', 'pending');

select confirm_payment('00000000-0000-0000-0000-0000000000b3', 'TX3', '{}'::jsonb, 1000);

-- ═══════════ Scénario D : rail USD, montant falsifié (garde-fou 0009) ═══════════
insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000000a4',
          '00000000-0000-0000-0000-000000000003',
          'produit-d', 'Produit D', 'fichier', 2640, 'published');
insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000000b4',
          '00000000-0000-0000-0000-000000000003',
          '00000000-0000-0000-0000-0000000000a4', 2640, 'pending');
-- 2640 HTG à 132 HTG/USD = 2000 cents figés au checkout.
insert into payments (order_id, rail, idempotency_key, status, expected_usd_cents)
  values ('00000000-0000-0000-0000-0000000000b4', 'zelle',
          '00000000-0000-0000-0000-0000000000b4', 'pending', 2000);

-- USD reçu (1500) ≠ figé (2000) → doit être REJETÉ.
select confirm_payment('00000000-0000-0000-0000-0000000000b4', 'ZELLE:ref-d',
                       '{}'::jsonb, null, 1500);

-- ═══════════ Scénario E : rail USD, montant exact, rejoué 2× ═══════════
insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000000a5',
          '00000000-0000-0000-0000-000000000003',
          'produit-e', 'Produit E', 'fichier', 2640, 'published');
insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000000b5',
          '00000000-0000-0000-0000-000000000003',
          '00000000-0000-0000-0000-0000000000a5', 2640, 'pending');
insert into payments (order_id, rail, idempotency_key, status, expected_usd_cents)
  values ('00000000-0000-0000-0000-0000000000b5', 'zelle',
          '00000000-0000-0000-0000-0000000000b5', 'pending', 2000);

select confirm_payment('00000000-0000-0000-0000-0000000000b5', 'ZELLE:ref-e',
                       '{}'::jsonb, null, 2000);
select confirm_payment('00000000-0000-0000-0000-0000000000b5', 'ZELLE:ref-e',
                       '{}'::jsonb, null, 2000);

-- ═══════════ Scénario F : coupon consommé PAR confirm_payment, rejoué ═══════════
-- Vendeur dédié (…0003) : son wallet n'est vérifié par AUCUNE assertion en
-- valeur absolue ailleurs dans ce fichier (seulement E, scoping par
-- idempotency_key) — évite de fausser les agrégats pending_htg de A/B (…0001).
insert into zabelie_coupons (id, seller_id, code, percent, max_uses)
  values ('00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-000000000003', 'BL133F', 20, 5);
insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000000a6',
          '00000000-0000-0000-0000-000000000003',
          'produit-f', 'Produit F', 'fichier', 1000, 'published');
insert into orders (id, buyer_id, product_id, amount_htg, status, coupon_id, coupon_code, discount_htg)
  values ('00000000-0000-0000-0000-0000000000b6',
          '00000000-0000-0000-0000-000000000003',
          '00000000-0000-0000-0000-0000000000a6', 800, 'pending',
          '00000000-0000-0000-0000-0000000000c1', 'BL133F', 200);
insert into payments (order_id, rail, idempotency_key, status)
  values ('00000000-0000-0000-0000-0000000000b6', 'moncash',
          '00000000-0000-0000-0000-0000000000b6', 'pending');

-- Rejoué 2× (retour navigateur + réconciliateur) : une seule consommation.
select confirm_payment('00000000-0000-0000-0000-0000000000b6', 'TX6', '{}'::jsonb, 800);
select confirm_payment('00000000-0000-0000-0000-0000000000b6', 'TX6', '{}'::jsonb, 800);

-- ═══════════ Scénario G : quota déjà épuisé à la confirmation ═══════════
insert into zabelie_coupons (id, seller_id, code, percent, max_uses, uses)
  values ('00000000-0000-0000-0000-0000000000c2',
          '00000000-0000-0000-0000-000000000003', 'BL133G', 20, 1, 1); -- déjà à quota
insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000000a7',
          '00000000-0000-0000-0000-000000000003',
          'produit-g', 'Produit G', 'fichier', 1000, 'published');
insert into orders (id, buyer_id, product_id, amount_htg, status, coupon_id, coupon_code, discount_htg)
  values ('00000000-0000-0000-0000-0000000000b7',
          '00000000-0000-0000-0000-000000000003',
          '00000000-0000-0000-0000-0000000000a7', 800, 'pending',
          '00000000-0000-0000-0000-0000000000c2', 'BL133G', 200);
insert into payments (order_id, rail, idempotency_key, status)
  values ('00000000-0000-0000-0000-0000000000b7', 'moncash',
          '00000000-0000-0000-0000-0000000000b7', 'pending');

-- Déjà facturé au prix remisé (800) → doit rester CONFIRMÉ malgré le quota épuisé.
select confirm_payment('00000000-0000-0000-0000-0000000000b7', 'TX7', '{}'::jsonb, 800);

-- ════════════════════════════ Assertions ════════════════════════════
do $$
declare
  v_balance      bigint;
  v_txn_amount   bigint;
  v_txn_count    int;
  v_order_status order_status;
  v_pay_status   payment_status;
  v_sales        integer;
  v_commission   bigint;
  v_pe_count     int;
  -- Scénario B
  v_b_pay_status payment_status;
  v_b_order_st   order_status;
  v_b_credits    int;
  -- Scénario C
  v_c_balance    bigint;
  v_c_commission bigint;
  -- Scénario D (USD falsifié)
  v_d_pay_status payment_status;
  v_d_order_st   order_status;
  v_d_credits    int;
  -- Scénario E (USD exact, rejoué)
  v_e_pay_status payment_status;
  v_e_credit     bigint;
  v_e_txn_count  int;
begin
  -- A : idempotence + commission standard 10 % (net 2250, commission 250).
  -- Depuis l'escrow (0006), le net va en ATTENTE (pending), pas en disponible.
  select pending_htg into v_balance
    from wallets where owner_id = '00000000-0000-0000-0000-000000000001';
  select amount_htg, count(*) over () into v_txn_amount, v_txn_count
    from wallet_transactions
   where idempotency_key = 'order_credit:00000000-0000-0000-0000-0000000000b1';
  select count(*), max(commission_htg) into v_pe_count, v_commission
    from platform_earnings where order_id = '00000000-0000-0000-0000-0000000000b1';
  select status into v_order_status
    from orders where id = '00000000-0000-0000-0000-0000000000b1';
  select status into v_pay_status
    from payments where idempotency_key = '00000000-0000-0000-0000-0000000000b1';
  select sales_count into v_sales
    from products where id = '00000000-0000-0000-0000-0000000000a1';

  assert v_balance = 2250,
    format('A: net en attente attendu 2250, obtenu %s (commission non prélevée ou double crédit ?)', v_balance);
  assert v_txn_amount = 2250, format('A: crédit net attendu 2250, obtenu %s', v_txn_amount);
  assert v_txn_count = 1, format('A: une seule transaction attendue, obtenu %s', v_txn_count);
  assert v_pe_count = 1, format('A: une seule ligne platform_earnings, obtenu %s', v_pe_count);
  assert v_commission = 250, format('A: commission attendue 250, obtenu %s', v_commission);
  assert v_sales = 1, format('A: ventes attendues 1, obtenu %s', v_sales);
  assert v_order_status = 'paid', format('A: order attendu paid, obtenu %s', v_order_status);
  assert v_pay_status = 'confirmed', format('A: payment attendu confirmed, obtenu %s', v_pay_status);

  -- B : montant falsifié rejeté
  select status into v_b_pay_status
    from payments where idempotency_key = '00000000-0000-0000-0000-0000000000b2';
  select status into v_b_order_st
    from orders where id = '00000000-0000-0000-0000-0000000000b2';
  select count(*) into v_b_credits
    from wallet_transactions
   where idempotency_key = 'order_credit:00000000-0000-0000-0000-0000000000b2';

  assert v_b_pay_status = 'failed', format('B: payment attendu failed, obtenu %s', v_b_pay_status);
  assert v_b_order_st = 'disputed', format('B: order attendu disputed, obtenu %s', v_b_order_st);
  assert v_b_credits = 0, format('B: aucun crédit attendu, obtenu %s', v_b_credits);
  assert v_balance = 2250, 'B: le rejet ne doit pas créditer le wallet';

  -- C : commission Elite 6 % (net 940 en attente, commission 60)
  select pending_htg into v_c_balance
    from wallets where owner_id = '00000000-0000-0000-0000-000000000002';
  select max(commission_htg) into v_c_commission
    from platform_earnings where order_id = '00000000-0000-0000-0000-0000000000b3';

  assert v_c_balance = 940, format('C: net Elite attendu 940, obtenu %s', v_c_balance);
  assert v_c_commission = 60, format('C: commission Elite attendue 60, obtenu %s', v_c_commission);

  -- D : USD reçu ≠ figé → rejeté, aucun crédit
  select status into v_d_pay_status
    from payments where idempotency_key = '00000000-0000-0000-0000-0000000000b4';
  select status into v_d_order_st
    from orders where id = '00000000-0000-0000-0000-0000000000b4';
  select count(*) into v_d_credits
    from wallet_transactions
   where idempotency_key = 'order_credit:00000000-0000-0000-0000-0000000000b4';

  assert v_d_pay_status = 'failed', format('D: payment attendu failed, obtenu %s', v_d_pay_status);
  assert v_d_order_st = 'disputed', format('D: order attendu disputed, obtenu %s', v_d_order_st);
  assert v_d_credits = 0, format('D: aucun crédit attendu, obtenu %s', v_d_credits);

  -- E : USD exact → confirmé ; ledger HTG (net 2640-264=2376) ; rejeu = 1 seul crédit
  select status into v_e_pay_status
    from payments where idempotency_key = '00000000-0000-0000-0000-0000000000b5';
  select amount_htg, count(*) over () into v_e_credit, v_e_txn_count
    from wallet_transactions
   where idempotency_key = 'order_credit:00000000-0000-0000-0000-0000000000b5';

  assert v_e_pay_status = 'confirmed', format('E: payment attendu confirmed, obtenu %s', v_e_pay_status);
  assert v_e_credit = 2376, format('E: crédit net HTG attendu 2376, obtenu %s', v_e_credit);
  assert v_e_txn_count = 1, format('E: une seule transaction attendue, obtenu %s', v_e_txn_count);

  -- F : coupon consommé PAR confirm_payment (pas au checkout), rejeu = 1 seule conso
  assert (select uses from zabelie_coupons where id = '00000000-0000-0000-0000-0000000000c1') = 1,
    'F: le coupon devait être consommé exactement une fois par confirm_payment (rejeu inclus)';
  assert (select status from payments where idempotency_key = '00000000-0000-0000-0000-0000000000b6') = 'confirmed',
    'F: le paiement remisé devait être confirmé';

  -- G : quota déjà épuisé à la confirmation → paiement confirmé quand même,
  -- consommation en best-effort silencieuse (uses reste à 1, pas 2).
  assert (select status from payments where idempotency_key = '00000000-0000-0000-0000-0000000000b7') = 'confirmed',
    'G: un paiement déjà facturé au prix remisé ne doit JAMAIS être rejeté pour un quota coupon épuisé';
  assert (select uses from zabelie_coupons where id = '00000000-0000-0000-0000-0000000000c2') = 1,
    'G: la consommation best-effort ne doit pas dépasser le quota (uses doit rester à 1)';

  raise notice 'OK — A (net=%, commission=%, txns=%) ; B rejeté ; C Elite (net=%, commission=%) ; D USD rejeté ; E USD confirmé (net=%) ; F coupon consommé au confirm ; G paiement confirmé malgré quota épuisé',
    v_balance, v_commission, v_txn_count, v_c_balance, v_c_commission, v_e_credit;
end $$;

rollback;
