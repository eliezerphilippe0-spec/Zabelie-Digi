-- Test de la purge de rétention (0010) — anti-régression RGPD.
-- Transaction annulée (rollback). ON_ERROR_STOP.
--
-- purge_payment_raw(90) doit effacer payments.raw UNIQUEMENT pour les paiements
-- clôturés (confirmed/failed) ET anciens (> 90 j), et laisser intacts :
--   - un paiement confirmé récent,
--   - un paiement encore 'pending' (même très ancien).

begin;

insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-0000000000e1', 'seller@test.local');

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, role, display_name)
  values ('00000000-0000-0000-0000-0000000000e1', 'creator', 'Vendeur');
insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000e1',
          'p', 'P', 'fichier', 100, 'published');

-- Helper local : crée order + payment avec un raw non nul.
insert into orders (id, buyer_id, product_id, amount_htg, status) values
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1',100,'paid'),
  ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1',100,'paid'),
  ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1',100,'pending'),
  ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1',100,'disputed');

-- p1 : confirmé, ANCIEN (100 j) → raw doit être purgé.
insert into payments (order_id, rail, idempotency_key, status, raw, confirmed_at)
  values ('00000000-0000-0000-0000-0000000000d1','moncash','k1','confirmed',
          '{"payer_present":true}'::jsonb, now() - interval '100 days');
-- p2 : confirmé, RÉCENT (10 j) → raw conservé.
insert into payments (order_id, rail, idempotency_key, status, raw, confirmed_at)
  values ('00000000-0000-0000-0000-0000000000d2','moncash','k2','confirmed',
          '{"payer_present":true}'::jsonb, now() - interval '10 days');
-- p3 : encore pending, TRÈS ancien (200 j) → raw conservé (pas clôturé).
insert into payments (order_id, rail, idempotency_key, status, raw, created_at)
  values ('00000000-0000-0000-0000-0000000000d3','moncash','k3','pending',
          '{"payer_present":true}'::jsonb, now() - interval '200 days');
-- p4 : failed, ancien, confirmed_at NULL → coalesce(created_at) → purgé.
insert into payments (order_id, rail, idempotency_key, status, raw, created_at)
  values ('00000000-0000-0000-0000-0000000000d4','moncash','k4','failed',
          '{"payer_present":true}'::jsonb, now() - interval '120 days');

select purge_payment_raw(90);

do $$
declare
  v_purged int;
begin
  assert (select raw from payments where idempotency_key = 'k1') is null,
    'p1 (confirmé ancien) : raw aurait dû être purgé';
  assert (select raw from payments where idempotency_key = 'k2') is not null,
    'p2 (confirmé récent) : raw ne doit PAS être purgé';
  assert (select raw from payments where idempotency_key = 'k3') is not null,
    'p3 (pending) : raw ne doit PAS être purgé';
  assert (select raw from payments where idempotency_key = 'k4') is null,
    'p4 (failed ancien) : raw aurait dû être purgé';

  -- Rejeu : idempotent (0 ligne à purger la 2e fois).
  select purge_payment_raw(90) into v_purged;
  assert v_purged = 0, format('rejeu : 0 purge attendue, obtenu %s', v_purged);
end $$;

rollback;
