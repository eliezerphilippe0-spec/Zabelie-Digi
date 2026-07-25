-- Tests de l'exclusion catalogue des produits en rupture (0040).
-- Usage : psql "$DATABASE_URL" -f supabase/tests/in_stock_flag.test.sql
--
--   IS1. Produit DIGITAL (sans variante) → in_stock reste true.
--   IS2. Création d'un physique avec stock → true ; avec 0 → false.
--   IS3. Une RÉSERVATION ne déliste pas ; seule la VENTE le fait.
--   IS4. Panier abandonné puis expiré : le produit reste visible en continu.
--   IS5. Désactiver la dernière variante en stock → false.
--   IS6. Multi-variantes : une seule en stock suffit à rester listé.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000aa001'::uuid, 'is.seller@test.local'),
  ('00000000-0000-0000-0000-0000000aa002'::uuid, 'is.buyer@test.local');
insert into profiles (id, display_name, role, tier) values
  ('00000000-0000-0000-0000-0000000aa001'::uuid, 'Vendeur IS', 'creator', 'standard'),
  ('00000000-0000-0000-0000-0000000aa002'::uuid, 'Acheteur IS', 'buyer', 'standard');

insert into products (id, seller_id, slug, title, description, price_htg, kind, status, category)
values
  ('00000000-0000-0000-0000-0000000aa003'::uuid, '00000000-0000-0000-0000-0000000aa001'::uuid,
   'ebook-is', 'E-book', 'digital', 1000, 'fichier', 'published', 'Design'),
  ('00000000-0000-0000-0000-0000000aa004'::uuid, '00000000-0000-0000-0000-0000000aa001'::uuid,
   'filtre-is', 'Filtre', 'physique', 1000, 'fichier', 'published', 'Design'),
  ('00000000-0000-0000-0000-0000000aa005'::uuid, '00000000-0000-0000-0000-0000000aa001'::uuid,
   'vide-is', 'Produit vide', 'physique', 1000, 'fichier', 'published', 'Design');

do $$
declare
  v_digital uuid := '00000000-0000-0000-0000-0000000aa003';
  v_prod    uuid := '00000000-0000-0000-0000-0000000aa004';
  v_vide    uuid := '00000000-0000-0000-0000-0000000aa005';
  v_buyer   uuid := '00000000-0000-0000-0000-0000000aa002';
  v_v1      uuid;
  v_v2      uuid;
  v_vv      uuid;
  v_o       uuid;
  v_flag    boolean;
begin
  -- IS1 : le digital n'est jamais touché.
  select in_stock into v_flag from products where id = v_digital;
  assert v_flag, 'IS1: un produit digital doit rester listé';

  -- IS2 : physique avec stock → true.
  insert into zabelie_product_variants (product_id, sku, price_htg)
  values (v_prod, 'SKU-IS-1', 1000) returning id into v_v1;
  insert into zabelie_stock (variant_id, quantity_available) values (v_v1, 2);
  select in_stock into v_flag from products where id = v_prod;
  assert v_flag, 'IS2: produit avec stock devait être listé';

  -- IS2 bis : physique à 0 → false.
  insert into zabelie_product_variants (product_id, sku, price_htg)
  values (v_vide, 'SKU-IS-0', 1000) returning id into v_vv;
  insert into zabelie_stock (variant_id, quantity_available) values (v_vv, 0);
  select in_stock into v_flag from products where id = v_vide;
  assert not v_flag, 'IS2bis: produit sans stock ne doit pas être listé';

  -- IS3 : UNE RÉSERVATION NE DÉLISTE PAS. C'est le point le plus important de
  -- ce test — le flag suit le stock PHYSIQUE, pas le disponible. Sinon un
  -- panier abandonné rendrait le produit invisible pendant tout le TTL
  -- (120 min), pour tous les acheteurs, sur un vendeur qui n'a qu'une unité.
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_prod, 1000, 'pending') returning id into v_o;
  insert into payments (order_id, rail, idempotency_key, status)
  values (v_o, 'moncash', v_o::text, 'pending');
  perform zabelie_reserve_stock(v_v1, v_o, 2);   -- réserve TOUT le disponible
  select in_stock into v_flag from products where id = v_prod;
  assert v_flag,
    'IS3: RÉGRESSION — une réservation ne doit PAS délister (stock physique inchangé)';

  -- Seule la VENTE fait sortir les unités du stock physique → délistage.
  perform confirm_payment(v_o::text, 'REF-IS3', null, 1000);
  select in_stock into v_flag from products where id = v_prod;
  assert not v_flag, 'IS3bis: après vente réelle, le produit est délisté';

  -- IS4 : panier abandonné puis expiré — le produit reste listé du début à la
  -- fin. Aucun clignotement dans le catalogue.
  update zabelie_stock set quantity_available = 1, quantity_reserved = 0
   where variant_id = v_v1;
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_prod, 1000, 'pending') returning id into v_o;
  insert into zabelie_stock_reservations (variant_id, order_id, quantity, expires_at)
  values (v_v1, v_o, 1, now() - interval '1 minute');
  update zabelie_stock set quantity_available = 0, quantity_reserved = 1
   where variant_id = v_v1;
  select in_stock into v_flag from products where id = v_prod;
  assert v_flag, 'IS4: panier en cours ⇒ le produit reste visible';
  perform zabelie_expire_stock_reservations();
  select in_stock into v_flag from products where id = v_prod;
  assert v_flag, 'IS4bis: après expiration, toujours visible';

  -- IS5 : désactiver la dernière variante en stock.
  update zabelie_product_variants set active = false where id = v_v1;
  select in_stock into v_flag from products where id = v_prod;
  assert not v_flag, 'IS5: variante désactivée ⇒ produit délisté';

  -- IS6 : multi-variantes — une seule en stock suffit.
  insert into zabelie_product_variants (product_id, sku, price_htg)
  values (v_prod, 'SKU-IS-2', 1200) returning id into v_v2;
  insert into zabelie_stock (variant_id, quantity_available) values (v_v2, 5);
  select in_stock into v_flag from products where id = v_prod;
  assert v_flag, 'IS6: une variante en stock suffit à rester listé';

  update zabelie_stock set quantity_available = 0 where variant_id = v_v2;
  select in_stock into v_flag from products where id = v_prod;
  assert not v_flag, 'IS6bis: plus aucune variante en stock ⇒ délisté';

  raise notice 'OK — IS1 digital intouché ; IS2 stock/0 ; IS3 réservation NE déliste pas, vente oui ; IS4 panier abandonné sans clignotement ; IS5 variante désactivée ; IS6 multi-variantes';
end $$;

rollback;
