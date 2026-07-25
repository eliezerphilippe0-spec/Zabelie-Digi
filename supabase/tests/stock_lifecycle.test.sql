-- Tests du cycle de vie du stock (chantier B, 0036).
-- Usage : psql "$DATABASE_URL" -f supabase/tests/stock_lifecycle.test.sql
--
-- Couvre :
--   SL1. Réservation : disponible −q, réservé +q (stock total inchangé).
--   SL2. Rejeu de la réservation (double-clic) → idempotent, pas de double débit.
--   SL3. Paiement confirmé : réservé −q, l'unité quitte le stock.
--   SL4. Annulation : le stock est relibéré et re-vendable.
--   SL5. Expiration (cron) : réservation échue relibérée.
--   SL6. Stock insuffisant → refus propre, aucun mouvement.
--   SL7. L'arbre de catégories refuse un niveau incohérent.
--   SL8. Expiration PARESSEUSE : une réservation échue est reprise par le
--        prochain acheteur sans attendre le cron (quotidien sur Vercel Hobby).

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e0001'::uuid, 'stock.life@test.local');
insert into profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-0000000e0001'::uuid, 'Vendeur Stock', 'creator');

insert into products (id, seller_id, slug, title, description, price_htg, kind, status, category)
values ('00000000-0000-0000-0000-0000000e0002'::uuid,
        '00000000-0000-0000-0000-0000000e0001'::uuid,
        'plaquettes-frein-test', 'Plaquettes de frein', 'Test', 2500,
        'fichier', 'published', 'Design');

insert into zabelie_product_variants (id, product_id, sku, price_htg)
values ('00000000-0000-0000-0000-0000000e0003'::uuid,
        '00000000-0000-0000-0000-0000000e0002'::uuid, 'SKU-LIFE-1', 2500);

insert into zabelie_stock (variant_id, quantity_available) values
  ('00000000-0000-0000-0000-0000000e0003'::uuid, 10);

do $$
declare
  v_variant uuid := '00000000-0000-0000-0000-0000000e0003';
  v_product uuid := '00000000-0000-0000-0000-0000000e0002';
  v_buyer   uuid := '00000000-0000-0000-0000-0000000e0001';
  v_order1  uuid;
  v_order2  uuid;
  v_res     jsonb;
  v_avail   integer;
  v_resv    integer;
  v_n       integer;
begin
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_product, 2500, 'pending') returning id into v_order1;

  -- SL1 : réservation de 3 unités.
  v_res := zabelie_reserve_stock(v_variant, v_order1, 3);
  assert (v_res->>'ok')::boolean, format('SL1: réservation devait réussir, %s', v_res);
  select quantity_available, quantity_reserved into v_avail, v_resv
    from zabelie_stock where variant_id = v_variant;
  assert v_avail = 7 and v_resv = 3,
    format('SL1: attendu dispo=7 réservé=3, obtenu %s/%s', v_avail, v_resv);

  -- SL2 : rejeu (double-clic / retry réseau) → aucun second débit.
  v_res := zabelie_reserve_stock(v_variant, v_order1, 3);
  assert (v_res->>'duplicate')::boolean, 'SL2: rejeu devait être signalé doublon';
  select quantity_available, quantity_reserved into v_avail, v_resv
    from zabelie_stock where variant_id = v_variant;
  assert v_avail = 7 and v_resv = 3,
    format('SL2: stock devait être inchangé, obtenu %s/%s', v_avail, v_resv);

  -- SL3 : paiement confirmé → les unités quittent définitivement le stock.
  v_n := zabelie_consume_stock(v_order1);
  assert v_n = 1, format('SL3: 1 réservation consommée attendue, obtenu %s', v_n);
  select quantity_available, quantity_reserved into v_avail, v_resv
    from zabelie_stock where variant_id = v_variant;
  assert v_avail = 7 and v_resv = 0,
    format('SL3: attendu dispo=7 réservé=0, obtenu %s/%s', v_avail, v_resv);
  -- Rejeu de la consommation : idempotent.
  assert zabelie_consume_stock(v_order1) = 0, 'SL3: seconde consommation doit être un no-op';

  -- SL4 : nouvelle commande annulée → stock relibéré, re-vendable.
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_product, 2500, 'pending') returning id into v_order2;
  perform zabelie_reserve_stock(v_variant, v_order2, 2);
  select quantity_available into v_avail from zabelie_stock where variant_id = v_variant;
  assert v_avail = 5, format('SL4: dispo attendu 5, obtenu %s', v_avail);

  v_n := zabelie_release_stock(v_order2);
  assert v_n = 1, 'SL4: 1 réservation libérée attendue';
  select quantity_available, quantity_reserved into v_avail, v_resv
    from zabelie_stock where variant_id = v_variant;
  assert v_avail = 7 and v_resv = 0,
    format('SL4: stock relibéré attendu 7/0, obtenu %s/%s', v_avail, v_resv);

  -- SL5 : reprise après libération (session expirée) PUIS expiration par le
  -- cron. La reprise est le cas critique : sans elle, une commande dont la
  -- session de paiement a expiré ne pourrait plus jamais être payée.
  v_res := zabelie_reserve_stock(v_variant, v_order2, 4);
  assert (v_res->>'ok')::boolean and (v_res->>'renewed')::boolean,
    format('SL5: la reprise après libération devait réussir, obtenu %s', v_res);
  select quantity_available into v_avail from zabelie_stock where variant_id = v_variant;
  assert v_avail = 3, format('SL5: dispo attendu 3 après reprise, obtenu %s', v_avail);
  update zabelie_stock_reservations set expires_at = now() - interval '1 minute'
   where order_id = v_order2 and status = 'held';
  v_n := zabelie_expire_stock_reservations();
  assert v_n >= 1, format('SL5: au moins 1 expiration attendue, obtenu %s', v_n);
  select quantity_available, quantity_reserved into v_avail, v_resv
    from zabelie_stock where variant_id = v_variant;
  assert v_avail = 7 and v_resv = 0,
    format('SL5: stock relibéré attendu 7/0, obtenu %s/%s', v_avail, v_resv);

  -- SL6 : demande supérieure au stock → refus propre, rien ne bouge.
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_product, 2500, 'pending') returning id into v_order2;
  v_res := zabelie_reserve_stock(v_variant, v_order2, 99);
  assert not (v_res->>'ok')::boolean and v_res->>'reason' = 'stock_insuffisant',
    format('SL6: refus stock_insuffisant attendu, obtenu %s', v_res);
  select quantity_available into v_avail from zabelie_stock where variant_id = v_variant;
  assert v_avail = 7, format('SL6: stock intact attendu 7, obtenu %s', v_avail);

  -- SL7 : garde de profondeur de l'arbre de catégories.
  begin
    insert into zabelie_categories (parent_id, slug, level, label_kr, label_fr, label_en)
    values ((select id from zabelie_categories where slug = 'otomobil-moto'),
            'niveau-incoherent', 3, 'x', 'x', 'x');
    raise exception 'SL7: un niveau 3 sous un niveau 1 aurait dû être refusé';
  exception
    when others then
      if sqlerrm like 'SL7:%' then raise; end if;
  end;

  -- SL8 : EXPIRATION PARESSEUSE (contrainte cron quotidien Vercel Hobby).
  -- Un panier abandonné détient la dernière unité, TTL échu, le cron n'est pas
  -- passé. Un NOUVEL acheteur doit pouvoir la prendre immédiatement.
  update zabelie_stock set quantity_available = 0, quantity_reserved = 1
   where variant_id = v_variant;
  delete from zabelie_stock_reservations where variant_id = v_variant;
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_product, 2500, 'pending') returning id into v_order1;
  insert into zabelie_stock_reservations (variant_id, order_id, quantity, expires_at)
  values (v_variant, v_order1, 1, now() - interval '5 minutes'); -- échue, cron absent

  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_product, 2500, 'pending') returning id into v_order2;
  v_res := zabelie_reserve_stock(v_variant, v_order2, 1);
  assert (v_res->>'ok')::boolean,
    format('SL8: l''unité détenue par une réservation ÉCHUE devait être reprise sans attendre le cron, obtenu %s', v_res);
  assert (select status from zabelie_stock_reservations where order_id = v_order1) = 'released',
    'SL8: la réservation échue devait être libérée au passage';
  select quantity_available, quantity_reserved into v_avail, v_resv
    from zabelie_stock where variant_id = v_variant;
  assert v_avail = 0 and v_resv = 1,
    format('SL8: attendu 0/1 (unité reprise par le nouvel acheteur), obtenu %s/%s', v_avail, v_resv);

  raise notice 'OK — SL1 réservation ; SL2 rejeu idempotent ; SL3 consommation au paiement ; SL4 libération sur annulation ; SL5 expiration cron ; SL6 refus propre ; SL7 arbre cohérent ; SL8 expiration paresseuse sans cron';
end $$;

rollback;
