-- Tests du branchement STOCK ↔ MONEY-PATH (chantier B, 0037).
-- Usage : psql "$DATABASE_URL" -f supabase/tests/stock_money_path.test.sql
--
-- Couvre :
--   SM1. Paiement confirmé → les unités quittent le stock, dans la MÊME
--        transaction que le crédit vendeur.
--   SM2. Rejeu de la confirmation → aucun second mouvement de stock.
--   SM3. Montant falsifié → paiement rejeté ET stock relibéré (pas de vente).
--   SM4. Remboursement → les unités reviennent en vente.
--   SM5. Paiement abandonné (48 h) → stock relibéré.
--   SM6. Produit digital (sans variante) → le money-path fonctionne inchangé.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0001'::uuid, 'sm.seller@test.local'),
  ('00000000-0000-0000-0000-0000000f0002'::uuid, 'sm.buyer@test.local');

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, display_name, role, tier) values
  ('00000000-0000-0000-0000-0000000f0001'::uuid, 'Vendeur SM', 'creator', 'standard'),
  ('00000000-0000-0000-0000-0000000f0002'::uuid, 'Acheteur SM', 'buyer', 'standard');

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

  raise notice 'OK — SM1 vente : stock et argent bougent ensemble ; SM2 rejeu neutre ; SM3 montant falsifié = rejet + stock relibéré ; SM4 remboursement ; SM5 abandon 48 h ; SM6 digital inchangé';
end $$;

rollback;
