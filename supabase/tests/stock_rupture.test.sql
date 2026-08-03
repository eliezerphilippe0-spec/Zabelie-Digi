-- Tests du correctif de survente (0038).
-- Usage : psql "$DATABASE_URL" -f supabase/tests/stock_rupture.test.sql
--
-- Scénario réel visé : TTL de réservation dépassé pendant que l'acheteur est
-- sur la page de l'opérateur (réseau instable haïtien).
--
--   SR1. Réservation expirée MAIS stock encore là → RÉ-ACQUISITION, vente OK.
--   SR2. Réservation expirée ET unité prise par un autre → RUPTURE :
--        commande `disputed`, vendeur NON crédité, motif inscrit.
--   SR3. Aucune survente : le stock ne descend jamais sous zéro.
--   SR4. Rejeu après rupture → toujours pas de crédit vendeur.
--   SR5. Commande multi-lignes : rupture sur UNE ligne ⇒ AUCUNE ligne
--        consommée (pas de consommation partielle).
--   SR6. Remboursement après vente → PAS de restock automatique.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000cc01'::uuid, 'sr.seller@test.local'),
  ('00000000-0000-0000-0000-00000000cc02'::uuid, 'sr.buyer@test.local');

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, display_name, role, tier) values
  ('00000000-0000-0000-0000-00000000cc01'::uuid, 'Vendeur SR', 'creator', 'standard'),
  ('00000000-0000-0000-0000-00000000cc02'::uuid, 'Acheteur SR', 'buyer', 'standard');
insert into products (id, seller_id, slug, title, description, price_htg, kind, status, category)
values ('00000000-0000-0000-0000-00000000cc03'::uuid,
        '00000000-0000-0000-0000-00000000cc01'::uuid,
        'filtre-sr', 'Filtre', 'Test', 1000, 'physical', 'published', 'Design');
insert into zabelie_product_variants (id, product_id, sku, price_htg) values
  ('00000000-0000-0000-0000-00000000cc04'::uuid, '00000000-0000-0000-0000-00000000cc03'::uuid, 'SKU-SR-A', 1000),
  ('00000000-0000-0000-0000-00000000cc05'::uuid, '00000000-0000-0000-0000-00000000cc03'::uuid, 'SKU-SR-B', 1000);
insert into zabelie_stock (variant_id, quantity_available) values
  ('00000000-0000-0000-0000-00000000cc04'::uuid, 1),
  ('00000000-0000-0000-0000-00000000cc05'::uuid, 1);

do $$
declare
  v_a     uuid := '00000000-0000-0000-0000-00000000cc04';
  v_b     uuid := '00000000-0000-0000-0000-00000000cc05';
  v_prod  uuid := '00000000-0000-0000-0000-00000000cc03';
  v_buyer uuid := '00000000-0000-0000-0000-00000000cc02';
  v_o     uuid;
  v_avail integer;
  v_resv  integer;
  v_pend  bigint;
begin
  -- ── SR1 : expirée mais stock encore disponible → ré-acquisition ──────────
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_prod, 1000, 'pending') returning id into v_o;
  insert into payments (order_id, rail, idempotency_key, status)
  values (v_o, 'moncash', v_o::text, 'pending');
  perform zabelie_reserve_stock(v_a, v_o, 1);
  update zabelie_stock_reservations set expires_at = now() - interval '1 min'
   where order_id = v_o;
  perform zabelie_expire_stock_reservations();     -- le cron libère
  -- Personne n'a pris l'unité entre-temps.
  perform confirm_payment(v_o::text, 'REF-SR1', null, 1000);

  assert (select status from orders where id = v_o) = 'paid',
    'SR1: la vente devait aboutir (unité encore disponible)';
  select quantity_available, quantity_reserved into v_avail, v_resv
    from zabelie_stock where variant_id = v_a;
  assert v_avail = 0 and v_resv = 0,
    format('SR1: attendu 0/0 après ré-acquisition, obtenu %s/%s', v_avail, v_resv);
  select pending_htg into v_pend from wallets
   where owner_id = '00000000-0000-0000-0000-00000000cc01';
  assert v_pend = 900, format('SR1: vendeur devait être crédité 900, obtenu %s', v_pend);

  -- ── SR2 : expirée ET unité prise par un autre → RUPTURE ──────────────────
  update zabelie_stock set quantity_available = 1 where variant_id = v_b;
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_prod, 1000, 'pending') returning id into v_o;
  insert into payments (order_id, rail, idempotency_key, status)
  values (v_o, 'moncash', v_o::text, 'pending');
  perform zabelie_reserve_stock(v_b, v_o, 1);
  update zabelie_stock_reservations set expires_at = now() - interval '1 min'
   where order_id = v_o;
  perform zabelie_expire_stock_reservations();
  -- Un AUTRE acheteur emporte l'unité.
  update zabelie_stock set quantity_available = 0 where variant_id = v_b;

  perform confirm_payment(v_o::text, 'REF-SR2', null, 1000);

  assert (select status from orders where id = v_o) = 'disputed',
    'SR2: la commande devait passer en disputed (rupture)';
  assert (select status from payments where order_id = v_o) = 'confirmed',
    'SR2: le paiement RÉEL reste confirmé — l''argent a bien été encaissé';
  assert (select (raw->>'refund_required')::boolean from payments where order_id = v_o),
    'SR2: le motif de remboursement devait être inscrit';
  -- Le vendeur ne doit PAS avoir été crédité pour cette vente.
  select pending_htg into v_pend from wallets
   where owner_id = '00000000-0000-0000-0000-00000000cc01';
  assert v_pend = 900, format('SR2: aucun crédit supplémentaire attendu (900), obtenu %s', v_pend);
  assert not exists (select 1 from escrow_entries where order_id = v_o),
    'SR2: aucun escrow ne devait être créé';

  -- ── SR3 : jamais de stock négatif ────────────────────────────────────────
  select quantity_available, quantity_reserved into v_avail, v_resv
    from zabelie_stock where variant_id = v_b;
  assert v_avail >= 0 and v_resv >= 0,
    format('SR3: stock négatif ! %s/%s', v_avail, v_resv);
  assert v_avail = 0, format('SR3: dispo attendu 0, obtenu %s', v_avail);

  -- ── SR4 : rejeu après rupture ────────────────────────────────────────────
  perform confirm_payment(v_o::text, 'REF-SR2', null, 1000);
  select pending_htg into v_pend from wallets
   where owner_id = '00000000-0000-0000-0000-00000000cc01';
  assert v_pend = 900, format('SR4: rejeu ne doit pas créditer, obtenu %s', v_pend);

  -- ── SR5 : multi-lignes — rupture sur une ligne ⇒ rien de consommé ────────
  update zabelie_stock set quantity_available = 1, quantity_reserved = 0 where variant_id = v_a;
  update zabelie_stock set quantity_available = 1, quantity_reserved = 0 where variant_id = v_b;
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_prod, 1000, 'pending') returning id into v_o;
  insert into payments (order_id, rail, idempotency_key, status)
  values (v_o, 'moncash', v_o::text, 'pending');
  perform zabelie_reserve_stock(v_a, v_o, 1);
  perform zabelie_reserve_stock(v_b, v_o, 1);
  -- Seule la ligne B expire, puis son unité est prise ailleurs.
  update zabelie_stock_reservations set expires_at = now() - interval '1 min'
   where order_id = v_o and variant_id = v_b;
  perform zabelie_expire_stock_reservations();
  update zabelie_stock set quantity_available = 0 where variant_id = v_b;

  perform confirm_payment(v_o::text, 'REF-SR5', null, 1000);
  assert (select status from orders where id = v_o) = 'disputed',
    'SR5: rupture sur une ligne ⇒ commande en litige';
  -- La ligne A ne doit PAS avoir été consommée.
  assert (select status from zabelie_stock_reservations
           where order_id = v_o and variant_id = v_a) = 'held',
    'SR5: consommation partielle interdite — la ligne A devait rester held';

  -- ── SR6 : remboursement après vente → pas de restock ─────────────────────
  update zabelie_stock set quantity_available = 1, quantity_reserved = 0 where variant_id = v_a;
  delete from zabelie_stock_reservations where variant_id = v_a;
  insert into orders (buyer_id, product_id, amount_htg, status)
  values (v_buyer, v_prod, 1000, 'pending') returning id into v_o;
  insert into payments (order_id, rail, idempotency_key, status)
  values (v_o, 'moncash', v_o::text, 'pending');
  perform zabelie_reserve_stock(v_a, v_o, 1);
  perform confirm_payment(v_o::text, 'REF-SR6', null, 1000);
  select quantity_available into v_avail from zabelie_stock where variant_id = v_a;
  assert v_avail = 0, format('SR6: après vente dispo attendu 0, obtenu %s', v_avail);

  perform refund_order(v_o);
  select quantity_available into v_avail from zabelie_stock where variant_id = v_a;
  assert v_avail = 0,
    format('SR6: RESTOCK AUTOMATIQUE INTERDIT après vente — dispo attendu 0, obtenu %s', v_avail);

  raise notice 'OK — SR1 ré-acquisition si stock encore là ; SR2 rupture = disputed + non crédité + motif ; SR3 jamais de stock négatif ; SR4 rejeu neutre ; SR5 pas de consommation partielle ; SR6 pas de restock après vente';
end $$;

rollback;
