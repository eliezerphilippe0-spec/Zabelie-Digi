-- Tests des durcissements P0 (0024) — revue Team Agents 2026-07-15.
-- Usage : psql "$DATABASE_URL" -f supabase/tests/p0_hardening.test.sql
--
-- Couvre :
--   H1. BL-102 : un vendeur authentifié ne peut PLUS écrire products
--       (sales_count/rating falsifiables avant 0024) — insert/update refusés.
--   H2. BL-101 : pending >48 h → expiré (failed) + commande annulée + raison tracée.
--   H3. BL-101 : no-op sur un paiement confirmé (jamais touché).
--   H4. BL-101 : no-op sur un pending récent (<48 h) — confirmation tardive possible.
--   H5. BL-101 : la fonction d'expiration est révoquée du client.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'seller@p0.test'),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'buyer@p0.test');

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'creator', 'Vendeur P0'),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'buyer', 'Acheteur P0');

insert into products (id, seller_id, slug, title, kind, price_htg, status, sales_count)
values ('00000000-0000-0000-0000-000000000a10'::uuid,
        '00000000-0000-0000-0000-0000000000a1'::uuid,
        'produit-p0', 'Produit P0', 'fichier', 1000, 'published', 2);

-- 3 commandes/paiements : vieux pending (à expirer), confirmé, pending récent.
insert into orders (id, buyer_id, product_id, amount_htg, status) values
  ('00000000-0000-0000-0000-000000000a21'::uuid, '00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0000-000000000a10'::uuid, 1000, 'pending'),
  ('00000000-0000-0000-0000-000000000a22'::uuid, '00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0000-000000000a10'::uuid, 1000, 'paid'),
  ('00000000-0000-0000-0000-000000000a23'::uuid, '00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0000-000000000a10'::uuid, 1000, 'pending');

insert into payments (order_id, idempotency_key, status, created_at) values
  ('00000000-0000-0000-0000-000000000a21'::uuid, 'p0-old-pending', 'pending',   now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000000a22'::uuid, 'p0-confirmed',   'confirmed', now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000000a23'::uuid, 'p0-recent',      'pending',   now() - interval '1 hour');

-- H1 : écriture directe products refusée au rôle authenticated (BL-102).
do $$
declare v_denied integer := 0;
begin
  set local role authenticated;
  begin
    update products set sales_count = 9999
     where id = '00000000-0000-0000-0000-000000000a10';
  exception when insufficient_privilege then v_denied := v_denied + 1;
  end;
  begin
    insert into products (seller_id, slug, title, kind, price_htg, sales_count)
    values ('00000000-0000-0000-0000-0000000000a1', 'hack', 'Hack', 'fichier', 1, 9999);
  exception when insufficient_privilege then v_denied := v_denied + 1;
  end;
  reset role;
  assert v_denied = 2,
    format('H1: écritures products auraient dû être refusées (refus=%s/2)', v_denied);
  raise notice 'OK — H1 preuve sociale verrouillée (update/insert refusés au client)';
end $$;

-- H2/H3/H4 : expiration des pending abandonnés (BL-101).
do $$
declare
  v_pay payments;
  v_order_status order_status;
begin
  -- H2 : vieux pending → failed, raison tracée, commande annulée.
  v_pay := zabelie_expire_stale_payment('p0-old-pending', 'moncash_unknown_48h');
  assert v_pay.status = 'failed',
    format('H2: statut attendu failed, obtenu %s', v_pay.status);
  assert v_pay.raw->>'expired_reason' = 'moncash_unknown_48h',
    'H2: la raison d''expiration doit être tracée dans raw';
  select status into v_order_status from orders
   where id = '00000000-0000-0000-0000-000000000a21';
  assert v_order_status = 'cancelled',
    format('H2: commande attendue cancelled, obtenue %s', v_order_status);

  -- H2bis : rejeu → no-op (déjà terminal).
  v_pay := zabelie_expire_stale_payment('p0-old-pending', 'rejeu');
  assert v_pay.status = 'failed' and v_pay.raw->>'expired_reason' = 'moncash_unknown_48h',
    'H2bis: le rejeu ne doit rien réécrire';

  -- H3 : paiement confirmé → JAMAIS touché.
  v_pay := zabelie_expire_stale_payment('p0-confirmed', 'tentative');
  assert v_pay.status = 'confirmed',
    format('H3: un paiement confirmé ne doit jamais être expiré (obtenu %s)', v_pay.status);
  select status into v_order_status from orders
   where id = '00000000-0000-0000-0000-000000000a22';
  assert v_order_status = 'paid', 'H3: la commande payée ne doit pas bouger';

  -- H4 : pending récent → no-op (une confirmation tardive reste possible).
  v_pay := zabelie_expire_stale_payment('p0-recent', 'tentative');
  assert v_pay.status = 'pending',
    format('H4: un pending récent ne doit pas être expiré (obtenu %s)', v_pay.status);

  raise notice 'OK — H2 expiré+annulé+tracé ; H2bis rejeu no-op ; H3 confirmé intouchable ; H4 récent préservé';
end $$;

-- H5 : la fonction d'expiration n'est pas exécutable par le client.
do $$
declare v_denied boolean := false;
begin
  set local role authenticated;
  begin
    perform zabelie_expire_stale_payment('p0-recent', 'hack');
  exception when insufficient_privilege then v_denied := true;
  end;
  reset role;
  assert v_denied, 'H5: authenticated a pu exécuter zabelie_expire_stale_payment !';
  raise notice 'OK — H5 expiration réservée au serveur';
end $$;

rollback;
