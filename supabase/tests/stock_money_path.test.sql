-- Tests du branchement STOCK ↔ MONEY-PATH (chantier B, 0037).
-- Usage : psql "$DATABASE_URL" -f supabase/tests/stock_money_path.test.sql
--
-- Couvre :
--   SM1. Paiement confirmé → les unités quittent le stock, dans la MÊME
--        transaction que le crédit vendeur.
--   SM2. Rejeu de la confirmation → aucun second mouvement de stock.
--   SM3. Montant falsifié → paiement rejeté ET stock relibéré (pas de vente).
--   SM4. Annulation comptable → aucune remise en stock d'unités consommées.
--   SM5. Paiement abandonné (48 h) → stock relibéré.
--   SM6. Produit digital (sans variante) → le money-path fonctionne inchangé.
--   SM7. Confirmation opérateur → remise vendeur → réception acheteur →
--        annulation comptable idempotente → justificatif externe sans argent.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0001'::uuid, 'sm.seller@test.local'),
  ('00000000-0000-0000-0000-0000000f0002'::uuid, 'sm.buyer@test.local'),
  ('00000000-0000-0000-0000-0000000f0005'::uuid, 'sm.admin@test.local');

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, display_name, role, tier) values
  ('00000000-0000-0000-0000-0000000f0001'::uuid, 'Vendeur SM', 'creator', 'standard'),
  ('00000000-0000-0000-0000-0000000f0002'::uuid, 'Acheteur SM', 'buyer', 'standard'),
  ('00000000-0000-0000-0000-0000000f0005'::uuid, 'Admin SM', 'admin', 'standard');

insert into products (id, seller_id, slug, title, description, price_htg, kind, status, category)
values
  ('00000000-0000-0000-0000-0000000f0003'::uuid,
   '00000000-0000-0000-0000-0000000f0001'::uuid,
   'filtre-huile-sm', 'Filtre à huile', 'Test', 1000, 'physical', 'published', 'Design'),
  ('00000000-0000-0000-0000-0000000f0009'::uuid,
   '00000000-0000-0000-0000-0000000f0001'::uuid,
   'ebook-sm', 'E-book', 'Digital', 1000, 'fichier', 'published', 'Design');

insert into zabelie_product_variants (id, product_id, sku, price_htg)
values ('00000000-0000-0000-0000-0000000f0004'::uuid,
        '00000000-0000-0000-0000-0000000f0003'::uuid, 'SKU-SM-1', 1000);
insert into zabelie_stock (variant_id, quantity_available) values
  ('00000000-0000-0000-0000-0000000f0004'::uuid, 5);

do $$
declare
  v_variant uuid := '00000000-0000-0000-0000-0000000f0004';
  v_product uuid := '00000000-0000-0000-0000-0000000f0003';
  v_digital uuid := '00000000-0000-0000-0000-0000000f0009';
  v_buyer   uuid := '00000000-0000-0000-0000-0000000f0002';
  v_order   uuid;
  v_avail   integer;
  v_resv    integer;
  v_pend    bigint;
  v_result  jsonb;
  v_lines   bigint;
begin
  -- ── SM1 : vente confirmée ───────────────────────────────────────────────
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_product, 1000, 'pending') returning id into v_order;
  insert into payments (order_id, rail, idempotency_key, status)
  values (v_order, 'moncash', v_order::text, 'pending');
  perform zabelie_reserve_stock(v_variant, v_order, 2);

  select quantity_available, quantity_reserved into v_avail, v_resv
    from zabelie_stock where variant_id = v_variant;
  assert v_avail = 3 and v_resv = 2,
    format('SM1: après réservation attendu 3/2, obtenu %s/%s', v_avail, v_resv);

  perform confirm_payment(v_order::text, 'REF-SM1', null, 1000);

  select quantity_available, quantity_reserved into v_avail, v_resv
    from zabelie_stock where variant_id = v_variant;
  assert v_avail = 3 and v_resv = 0,
    format('SM1: après vente attendu 3/0, obtenu %s/%s', v_avail, v_resv);
  -- L'argent a bougé dans la même transaction.
  select pending_htg into v_pend from wallets
   where owner_id = '00000000-0000-0000-0000-0000000f0001';
  assert v_pend = 900, format('SM1: net vendeur attendu 900, obtenu %s', v_pend);

  -- ── SM2 : rejeu de la confirmation ──────────────────────────────────────
  perform confirm_payment(v_order::text, 'REF-SM1', null, 1000);
  select quantity_available, quantity_reserved into v_avail, v_resv
    from zabelie_stock where variant_id = v_variant;
  assert v_avail = 3 and v_resv = 0,
    format('SM2: rejeu ne doit rien bouger, obtenu %s/%s', v_avail, v_resv);

  -- ── SM3 : montant falsifié → rejet ET stock relibéré ────────────────────
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_product, 1000, 'pending') returning id into v_order;
  insert into payments (order_id, rail, idempotency_key, status)
  values (v_order, 'moncash', v_order::text, 'pending');
  perform zabelie_reserve_stock(v_variant, v_order, 1);
  select quantity_available into v_avail from zabelie_stock where variant_id = v_variant;
  assert v_avail = 2, format('SM3: après réservation attendu 2, obtenu %s', v_avail);

  -- L'opérateur rapporte 999 au lieu de 1000.
  perform confirm_payment(v_order::text, 'REF-SM3', null, 999);
  assert (select status from orders where id = v_order) = 'disputed',
    'SM3: la commande devait passer en disputed';
  select quantity_available, quantity_reserved into v_avail, v_resv
    from zabelie_stock where variant_id = v_variant;
  assert v_avail = 3 and v_resv = 0,
    format('SM3: stock devait être relibéré (3/0), obtenu %s/%s', v_avail, v_resv);

  -- ── SM4 : remboursement → retour en vente ───────────────────────────────
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_product, 1000, 'pending') returning id into v_order;
  insert into payments (order_id, rail, idempotency_key, status)
  values (v_order, 'moncash', v_order::text, 'pending');
  perform zabelie_reserve_stock(v_variant, v_order, 3);
  perform confirm_payment(v_order::text, 'REF-SM4', null, 1000);
  select quantity_available into v_avail from zabelie_stock where variant_id = v_variant;
  assert v_avail = 0, format('SM4: stock épuisé attendu 0, obtenu %s', v_avail);

  perform refund_order(v_order);
  select quantity_available, quantity_reserved into v_avail, v_resv
    from zabelie_stock where variant_id = v_variant;
  -- Les unités consommées ne reviennent PAS (déjà sorties du stock) : le
  -- remboursement libère ce qui est encore « held », rien de plus. C'est le
  -- comportement voulu — un retour physique se ré-approvisionne à la main.
  assert v_avail = 0 and v_resv = 0,
    format('SM4: attendu 0/0 après remboursement, obtenu %s/%s', v_avail, v_resv);

  -- ── SM5 : paiement abandonné → stock relibéré ───────────────────────────
  update zabelie_stock set quantity_available = 4, quantity_reserved = 0
   where variant_id = v_variant;
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_product, 1000, 'pending') returning id into v_order;
  insert into payments (order_id, rail, idempotency_key, status, created_at)
  values (v_order, 'moncash', v_order::text, 'pending', now() - interval '72 hours');
  perform zabelie_reserve_stock(v_variant, v_order, 2);
  select quantity_available into v_avail from zabelie_stock where variant_id = v_variant;
  assert v_avail = 2, format('SM5: après réservation attendu 2, obtenu %s', v_avail);

  perform zabelie_expire_stale_payment(v_order::text, 'test');
  select quantity_available, quantity_reserved into v_avail, v_resv
    from zabelie_stock where variant_id = v_variant;
  assert v_avail = 4 and v_resv = 0,
    format('SM5: stock relibéré attendu 4/0, obtenu %s/%s', v_avail, v_resv);

  -- ── SM6 : produit digital, sans variante → money-path inchangé ──────────
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_digital, 1000, 'pending') returning id into v_order;
  insert into payments (order_id, rail, idempotency_key, status)
  values (v_order, 'moncash', v_order::text, 'pending');
  perform confirm_payment(v_order::text, 'REF-SM6', null, 1000);
  assert (select status from orders where id = v_order) = 'paid',
    'SM6: un produit sans stock doit se payer normalement';

  -- SM7 : cycle complet sur les fonctions réellement en service, distinct
  -- d'un opérateur réel et annulé par le rollback de cette fixture.
  insert into orders(buyer_id,product_id,amount_htg) values(v_buyer,v_product,1000)
    returning id into v_order;
  insert into payments(order_id,rail,idempotency_key) values(v_order,'moncash',v_order::text);
  perform zabelie_reserve_stock(v_variant,v_order,1);
  perform confirm_payment(v_order::text,'REF-SM7',null,1000);
  perform zabelie_open_fulfillment(v_order);
  assert (select status from orders where id=v_order)='paid','SM7: operator confirmation absent';
  assert (select bool_and(gated_on_delivery) from escrow_entries where order_id=v_order),'SM7: seller handover not gated';
  assert (zabelie_solvency_report()->>'ok')::boolean,'SM7: incoherent confirmed credit';
  v_result:=zabelie_declare_shipment(v_order,'00000000-0000-0000-0000-0000000f0001','Retrait chez le vendeur — fixture');
  assert (v_result->>'ok')::boolean,'SM7: seller handover rejected';
  v_result:=zabelie_mark_received(v_order,v_buyer);
  assert (v_result->>'ok')::boolean,'SM7: buyer receipt rejected';
  assert (select status from orders where id=v_order)='delivered','SM7: buyer receipt did not close handover';
  assert not (select bool_or(gated_on_delivery) from escrow_entries where order_id=v_order),'SM7: receipt did not release handover hold';
  perform refund_order(v_order);
  assert (select status from orders where id=v_order)='refunded','SM7: reversal absent';
  assert (select count(*) from wallet_transactions where order_id=v_order and type='credit')=1,'SM7: initial credit disappeared';
  assert (select count(*) from wallet_transactions where order_id=v_order and type='debit')=1,'SM7: compensating entry absent';
  assert (select sum(amount_htg) from wallet_transactions where order_id=v_order)=0,'SM7: reversal does not compensate credit';
  select count(*) into v_lines from wallet_transactions;
  assert refund_order(v_order)='already_reversed','SM7: replay not idempotent';
  assert (select count(*) from wallet_transactions)=v_lines,'SM7: duplicate reversal moved money';
  assert exists(select 1 from jsonb_array_elements(zabelie_operations_queue(100,0)->'rows') r
    where r->>'kind'='refund' and r->>'order_id'=v_order::text),'SM7: unexecuted external refund missing from queue';
  begin
    perform zabelie_record_refund_receipt(v_order,'00000000-0000-0000-0000-0000000f0005','stripe','RE-SM7-WRONG',now());
    raise exception 'SM7: accepted refund to another payment method';
  exception when invalid_parameter_value then null; end;
  perform zabelie_record_refund_receipt(v_order,'00000000-0000-0000-0000-0000000f0005','moncash','RE-SM7',now());
  v_result:=zabelie_record_refund_receipt(v_order,'00000000-0000-0000-0000-0000000f0005','moncash','RE-SM7',now());
  assert (v_result->>'duplicate')::boolean,'SM7: receipt replay not idempotent';
  assert (select count(*) from wallet_transactions)=v_lines,'SM7: external evidence created money';
  assert not exists(select 1 from jsonb_array_elements(zabelie_operations_queue(100,0)->'rows') r
    where r->>'kind'='refund' and r->>'order_id'=v_order::text),'SM7: receipt left refund unresolved';
  assert (zabelie_solvency_report()->>'ok')::boolean,'SM7: incoherent after full cycle';

  raise notice 'OK — SM1 vente : stock et argent bougent ensemble ; SM2 rejeu neutre ; SM3 montant falsifié = rejet + stock relibéré ; SM4 remboursement ; SM5 abandon 48 h ; SM6 digital inchangé';
end $$;

rollback;
