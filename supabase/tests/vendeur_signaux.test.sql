-- Tests des signaux de demande vendeur (0156). Transaction annulée à la fin.
--
--   S1. Connu-POSITIF : abonnés, paniers (30 jours, hors panier du vendeur),
--       recherches ratées (≥ 5 sessions distinctes, son rayon d'abord).
--   S2. Seuils : sous 3 paniers, la valeur exacte ne sort pas ; pour les
--       recherches, les règles de 0143 — sous 5 sessions, sur un seul jour,
--       avec 3 chiffres en série, @, / ou lien, ou exclu : jamais rendu.
--   S3. Rien n'identifie personne : aucun identifiant d'acheteur, de panier
--       ou de session dans la réponse.
--   S4. Isolation : B ne voit rien de A ; anon ne peut pas appeler ; une
--       session absente ou un compte suspendu lève.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c5601', 'sig.a@test.local'),
  ('00000000-0000-0000-0000-0000000c5602', 'sig.b@test.local'),
  ('00000000-0000-0000-0000-0000000c5603', 'sig.sispann@test.local'),
  ('00000000-0000-0000-0000-0000000c5611', 'sig.k1@test.local'),
  ('00000000-0000-0000-0000-0000000c5612', 'sig.k2@test.local'),
  ('00000000-0000-0000-0000-0000000c5613', 'sig.k3@test.local'),
  ('00000000-0000-0000-0000-0000000c5614', 'sig.k4@test.local'),
  ('00000000-0000-0000-0000-0000000c5615', 'sig.k5@test.local');
insert into profiles (id, display_name)
select id, 'Sig ' || right(id::text, 2) from auth.users where id::text like '00000000-0000-0000-0000-0000000c56%'
on conflict (id) do nothing;

insert into products (id, seller_id, slug, title, description, price_htg, kind, status, category) values
  ('00000000-0000-0000-0000-0000000c5701', '00000000-0000-0000-0000-0000000c5601', 'sig-panno', 'Panno solè 100 W', 'Test', 9000, 'fichier', 'published', 'Enèji'),
  ('00000000-0000-0000-0000-0000000c5702', '00000000-0000-0000-0000-0000000c5601', 'sig-batri', 'Batri 12 V', 'Test', 7000, 'fichier', 'published', 'Enèji'),
  ('00000000-0000-0000-0000-0000000c5703', '00000000-0000-0000-0000-0000000c5602', 'sig-rad', 'Rad fiktif B', 'Test', 1000, 'fichier', 'published', 'Mòd');

-- Paniers : P1 chez k1..k4 (4) + chez le vendeur lui-même (exclu) ; P2 chez k5
-- seulement (1, sous le seuil) + un ajout vieux de 40 jours (exclu).
insert into zabelie_carts (id, buyer_id) values
  ('00000000-0000-0000-0000-0000000c5801', '00000000-0000-0000-0000-0000000c5611'),
  ('00000000-0000-0000-0000-0000000c5802', '00000000-0000-0000-0000-0000000c5612'),
  ('00000000-0000-0000-0000-0000000c5803', '00000000-0000-0000-0000-0000000c5613'),
  ('00000000-0000-0000-0000-0000000c5804', '00000000-0000-0000-0000-0000000c5614'),
  ('00000000-0000-0000-0000-0000000c5805', '00000000-0000-0000-0000-0000000c5615'),
  ('00000000-0000-0000-0000-0000000c5806', '00000000-0000-0000-0000-0000000c5601');
insert into zabelie_cart_items (cart_id, product_id, added_at) values
  ('00000000-0000-0000-0000-0000000c5801', '00000000-0000-0000-0000-0000000c5701', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000c5802', '00000000-0000-0000-0000-0000000c5701', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000c5803', '00000000-0000-0000-0000-0000000c5701', now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000c5804', '00000000-0000-0000-0000-0000000c5701', now() - interval '4 days'),
  ('00000000-0000-0000-0000-0000000c5806', '00000000-0000-0000-0000-0000000c5701', now()),
  ('00000000-0000-0000-0000-0000000c5805', '00000000-0000-0000-0000-0000000c5702', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000c5804', '00000000-0000-0000-0000-0000000c5702', now() - interval '40 days');

insert into zabelie_shop_follows (user_id, seller_id) values
  ('00000000-0000-0000-0000-0000000c5611', '00000000-0000-0000-0000-0000000c5601'),
  ('00000000-0000-0000-0000-0000000c5612', '00000000-0000-0000-0000-0000000c5601'),
  ('00000000-0000-0000-0000-0000000c5613', '00000000-0000-0000-0000-0000000c5602');

-- Recherches ratées, sur DEUX jours sauf mention (règles de 0143) :
-- « jeneratè » 6 sessions sans rayon ; « konvètisè » 5 sessions dans le rayon
-- de A ; « tikè » 4 sessions (sous le seuil) ; un numéro, un e-mail, un lien
-- et « modèl 123 » (3 chiffres) 7 sessions chacun, jamais rendus ; « mo
-- eksklu » 7 sessions mais sur la liste d'exclusion ; « yon sèl jou » 7
-- sessions le MÊME jour ; « ansyen » 9 sessions vieilles de 40 jours.
insert into zabelie_authoring_termes_exclus (term, raison)
values (zabelie_search_normalize('mo eksklu'), 'test 0156 : terme exclu')
on conflict do nothing;
insert into zabelie_search_misses (term, department, session_hash, day, created_at)
select t.term, t.dept, 'sig-' || t.term || '-' || g,
       current_date - case when t.un_jour then 0 else g % 2 end,
       now() - make_interval(days => t.age)
  from (values ('jeneratè', null::text, 6, 1, false), ('konvètisè', 'Enèji', 5, 2, false), ('tikè', null, 4, 1, false),
               ('50937001234', null, 7, 1, false), ('mari@exemple.ht', null, 7, 1, false), ('www.lyen.ht', null, 7, 1, false),
               ('modèl 123', null, 7, 1, false), (zabelie_search_normalize('mo eksklu'), null, 7, 1, false), ('yon sèl jou', null, 7, 1, true),
               ('ansyen', null, 9, 40, false)) as t(term, dept, n, age, un_jour),
       generate_series(1, t.n) g;

do $$
declare j jsonb;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c5601';
  j := zabelie_vendeur_signaux();
  reset role;

  if (j->>'abonnes')::int <> 2 then raise exception 'S1 KO : % abonnés, attendu 2', j->>'abonnes'; end if;
  if jsonb_array_length(j->'paniers') <> 2 then raise exception 'S1 KO : paniers %', j->'paniers'; end if;
  if j->'paniers'->0 <> '{"titre":"Panno solè 100 W","paniers":4,"moins_de_3":false}'::jsonb then
    raise exception 'S1 KO : premier panier %, attendu 4 sans le panier du vendeur', j->'paniers'->0;
  end if;
  if j->'paniers'->1 <> '{"titre":"Batri 12 V","paniers":null,"moins_de_3":true}'::jsonb then
    raise exception 'S2 KO : sous 3 paniers, la valeur exacte est sortie : %', j->'paniers'->1;
  end if;
  if j->'recherches' <> '[{"terme":"konvètisè","sessions":5,"mon_rayon":true},{"terme":"jeneratè","sessions":6,"mon_rayon":false}]'::jsonb then
    raise exception 'S1/S2 KO : recherches %', j->'recherches';
  end if;
  raise notice 'S1 OK — abonnés, paniers et recherches ; S2 OK — seuils tenus';

  if j::text ~ '0000000c56(1[1-5])|0000000c58|sig-' then
    raise exception 'S3 KO : un identifiant d''acheteur, de panier ou de session est sorti : %', j;
  end if;
  raise notice 'S3 OK — aucun identifiant dans la réponse';
end $$;

do $$
declare j jsonb;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c5602';
  j := zabelie_vendeur_signaux();
  reset role;
  if (j->>'abonnes')::int <> 1 or jsonb_array_length(j->'paniers') <> 0 then
    raise exception 'S4 KO : B voit % abonné(s) et % panier(s)', j->>'abonnes', jsonb_array_length(j->'paniers');
  end if;
  if (select bool_or((r->>'mon_rayon')::boolean) from jsonb_array_elements(j->'recherches') r) then
    raise exception 'S4 KO : le rayon de A est compté comme celui de B';
  end if;

  if has_function_privilege('anon', 'public.zabelie_vendeur_signaux()', 'execute') then
    raise exception 'S4 KO : anon peut appeler';
  end if;
  set local role anon;
  begin
    perform zabelie_vendeur_signaux();
    raise exception 'S4 KO : anon a obtenu des signaux';
  exception when insufficient_privilege then null;
  end;
  reset role;

  set local role authenticated;
  set local request.jwt.claim.sub = '';
  begin
    perform zabelie_vendeur_signaux();
    raise exception 'S4 KO : sans session, la fonction a répondu';
  exception when insufficient_privilege or invalid_text_representation then null;
  end;
  reset role;

  update profiles set suspended_at = now() where id = '00000000-0000-0000-0000-0000000c5603';
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c5603';
  begin
    perform zabelie_vendeur_signaux();
    raise exception 'S4 KO : un compte suspendu obtient des signaux';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'S4 OK — isolation, anon refusé, session active requise';
end $$;

rollback;
