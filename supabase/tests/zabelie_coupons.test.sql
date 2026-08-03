-- Tests des codes promo (V-13) — consommation ATOMIQUE du quota.
-- Usage : psql "$DATABASE_URL" -f supabase/tests/zabelie_coupons.test.sql
--
-- Couvre :
--   C1. Dernier usage : max_uses=1 → 1er consume TRUE, 2e consume FALSE.
--       (zabelie_coupon_consume est un UPDATE conditionnel unique — pas de
--        SELECT-puis-UPDATE : deux checkouts simultanés sur le dernier usage
--        sont sérialisés par le verrou de ligne de l'UPDATE, un seul gagne.)
--   C2. Expiré → FALSE, sans toucher au compteur.
--   C3. Désactivé → FALSE ; réactivé → TRUE.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d9'::uuid, 'coupon-seller@test.local')
  on conflict do nothing;

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-0000000000d9'::uuid, 'creator', 'Vendeur Coupon');

insert into zabelie_coupons (id, seller_id, code, percent, max_uses) values
  ('00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d9'::uuid, 'DERNIER', 20, 1);
insert into zabelie_coupons (id, seller_id, code, percent, expires_at) values
  ('00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-0000000000d9'::uuid, 'EXPIRE', 20,
   now() - interval '1 hour');
insert into zabelie_coupons (id, seller_id, code, percent, active) values
  ('00000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-0000000000d9'::uuid, 'INACTIF', 20, false);

do $$
declare
  v_ok   boolean;
  v_uses integer;
begin
  -- C1 : le DERNIER usage ne peut être consommé qu'une fois.
  select zabelie_coupon_consume('00000000-0000-0000-0000-0000000000a1') into v_ok;
  assert v_ok, 'C1: le premier consume aurait dû réussir';
  select zabelie_coupon_consume('00000000-0000-0000-0000-0000000000a1') into v_ok;
  assert not v_ok, 'C1: le second consume aurait dû échouer (quota épuisé)';
  select uses into v_uses from zabelie_coupons
   where id = '00000000-0000-0000-0000-0000000000a1';
  assert v_uses = 1, format('C1: uses attendu 1, obtenu %s', v_uses);

  -- C2 : expiré → refus, compteur intact.
  select zabelie_coupon_consume('00000000-0000-0000-0000-0000000000a2') into v_ok;
  assert not v_ok, 'C2: un code expiré ne doit pas se consommer';
  select uses into v_uses from zabelie_coupons
   where id = '00000000-0000-0000-0000-0000000000a2';
  assert v_uses = 0, format('C2: uses attendu 0, obtenu %s', v_uses);

  -- C3 : désactivé → refus ; réactivé → OK.
  select zabelie_coupon_consume('00000000-0000-0000-0000-0000000000a3') into v_ok;
  assert not v_ok, 'C3: un code désactivé ne doit pas se consommer';
  update zabelie_coupons set active = true
   where id = '00000000-0000-0000-0000-0000000000a3';
  select zabelie_coupon_consume('00000000-0000-0000-0000-0000000000a3') into v_ok;
  assert v_ok, 'C3: réactivé, le consume doit réussir';

  raise notice 'OK — C1 dernier usage atomique ; C2 expiré refusé ; C3 inactif refusé/réactivé OK';
end $$;

rollback;
