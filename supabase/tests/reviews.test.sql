-- Tests avis vérifiés (0008). Transaction annulée (rollback).
-- Usage : psql "$DATABASE_URL" -f supabase/tests/reviews.test.sql
--
-- Couvre :
--   A. Un avis sur commande payée → agrégats produits à jour (count/sum).
--   B. UN SEUL avis par commande : le doublon est rejeté par la contrainte UNIQUE.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'seller@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'buyer@test.local')
  on conflict do nothing;

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-000000000001', 'creator', 'Vendeur'),
  ('00000000-0000-0000-0000-000000000002', 'buyer', 'Acheteur');

insert into products (id, seller_id, slug, title, kind, price_htg, status)
  values ('00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000001',
          'prod-avis', 'Prod Avis', 'fichier', 1000, 'published');
insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-0000000000a1', 1000, 'paid');

-- A : premier avis
insert into product_reviews (product_id, buyer_id, order_id, rating, comment)
  values ('00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-0000000000b1', 4, 'Très bon produit');

do $$
declare
  v_count integer; v_sum integer; v_dup boolean := false;
begin
  select rating_count, rating_sum into v_count, v_sum
    from products where id = '00000000-0000-0000-0000-0000000000a1';
  assert v_count = 1, format('A: rating_count attendu 1, obtenu %s', v_count);
  assert v_sum = 4, format('A: rating_sum attendu 4, obtenu %s', v_sum);

  -- B : doublon sur la même commande → doit violer UNIQUE(order_id)
  begin
    insert into product_reviews (product_id, buyer_id, order_id, rating)
      values ('00000000-0000-0000-0000-0000000000a1',
              '00000000-0000-0000-0000-000000000002',
              '00000000-0000-0000-0000-0000000000b1', 5);
  exception when unique_violation then
    v_dup := true;
  end;
  assert v_dup, 'B: le doublon d''avis aurait dû être rejeté (UNIQUE order_id)';

  -- Les agrégats n'ont pas bougé après le rejet.
  select rating_count, rating_sum into v_count, v_sum
    from products where id = '00000000-0000-0000-0000-0000000000a1';
  assert v_count = 1 and v_sum = 4, 'B: agrégats modifiés par un doublon rejeté';

  raise notice 'OK — avis vérifié unique par commande (count=%, sum=%)', v_count, v_sum;
end $$;

rollback;
