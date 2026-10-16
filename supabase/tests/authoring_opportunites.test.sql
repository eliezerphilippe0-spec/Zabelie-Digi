-- Studio de création éditoriale — opportunités (0143 ; tasks/plan.md, tâche T.4).
-- Transaction annulée. Rôles réels ; chaque absence attendue a son témoin présent.
--
--   OP1  anon n'exécute pas ; un compte suspendu est refusé ;
--   OP2  sans données au-dessus des seuils : deux listes vides, seuils et durée rendus ;
--   OP3  un terme cherché par assez de personnes, sur assez de jours : présent, compté par personne ;
--   OP4  sous le seuil de personnes, ou sur un seul jour : absent ;
--   OP5  chiffres, adresse, lien : jamais affichés ; un terme exclu par l'administration non plus ;
--   OP6  un rayon avec assez de ventes réelles de produits digitaux venant d'assez de vendeurs : présent ;
--   OP7  ce qui n'est pas une vente réelle ne compte pas (paiement non confirmé, compte d'essai,
--        bac à sable, produit non digital) ; un seul vendeur ne fait jamais un rayon ;
--   OP8  le vendeur ne lit ni le capteur, ni la liste d'exclusion, en direct ;
--   OP9  la liste est plafonnée.
begin;

insert into auth.users (id, email)
  select ('00000000-0000-0000-0000-0000000b43' || lpad(i::text, 2, '0'))::uuid, 'opp-' || i || '@test.local'
    from generate_series(1, 12) i
  on conflict do nothing;
delete from profiles where id::text like '00000000-0000-0000-0000-0000000b43%';
insert into profiles (id, role, display_name)
  select id, 'creator', 'Opportunites test' from auth.users where id::text like '00000000-0000-0000-0000-0000000b43%';
-- 01 : le créateur qui consulte. 02, 03 : vendeurs de produits digitaux. 04 : vendeur d'essai.
-- 05 à 12 : acheteurs.
update profiles set is_test = true where id = '00000000-0000-0000-0000-0000000b4304';

create temporary table t_res (cle text primary key, r jsonb) on commit drop;
grant all on t_res to authenticated, anon;

-- Lecture sous la session d'un vendeur.
create function pg_temp.lire(p_cle text, p_vendeur uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_vendeur::text, true);
  set local role authenticated;
  insert into t_res values (p_cle, zabelie_authoring_opportunites())
    on conflict (cle) do update set r = excluded.r;
  reset role;
end $$;
grant execute on function pg_temp.lire(text, uuid) to authenticated;

-- ── OP1 ──────────────────────────────────────────────────────────────────
do $$
begin
  set local role anon;
  begin
    perform zabelie_authoring_opportunites();
    raise exception 'OP1 KO : anon execute';
  exception when insufficient_privilege then null;
  end;
  reset role;
  update profiles set suspended_at = now() where id = '00000000-0000-0000-0000-0000000b4301';
  begin
    perform pg_temp.lire('suspendu', '00000000-0000-0000-0000-0000000b4301');
    raise exception 'OP1 KO : compte suspendu accepte';
  exception when insufficient_privilege then
    if sqlerrm <> 'authoring_compte_inactif' then raise; end if;
  end;
  reset role;
  update profiles set suspended_at = null where id = '00000000-0000-0000-0000-0000000b4301';
  raise notice 'OP1 OK — anon refuse, compte suspendu refuse';
end $$;

-- ── OP2 ──────────────────────────────────────────────────────────────────
select pg_temp.lire('vide', '00000000-0000-0000-0000-0000000b4301');
do $$
declare v jsonb := (select r from t_res where cle = 'vide');
begin
  if v -> 'recherches' <> '[]'::jsonb or v -> 'ventes' <> '[]'::jsonb then
    raise exception 'OP2 KO : listes non vides sans donnees : %', v;
  end if;
  if (v ->> 'jours')::int <> 30 or (v -> 'seuils' ->> 'personnes')::int <> 5
     or (v -> 'seuils' ->> 'ventes')::int <> 3 or (v -> 'seuils' ->> 'vendeurs')::int <> 2 then
    raise exception 'OP2 KO : seuils rendus %', v;
  end if;
  raise notice 'OP2 OK — etat vide honnete, seuils rendus';
end $$;

-- ── Données : recherches sans résultat ───────────────────────────────────
-- « aprann angle » : 5 personnes sur 2 jours (présent). « kwafi tres » : 5 personnes,
-- un seul jour (absent). « koud rad » : 4 personnes sur 3 jours (absent).
-- « 3712 4455 », « moun@mail.ht », « www lien ht » : 6 personnes sur 2 jours (absents).
-- « mo blese » : 6 personnes sur 2 jours, exclu par l'administration (absent).
insert into zabelie_search_misses (term, session_hash, day, created_at)
  select t.term, 'h' || t.term || i, (now() - make_interval(days => t.j0 + (i % t.jours)))::date,
         now() - make_interval(days => t.j0 + (i % t.jours))
    from (values
      ('aprann angle', 5, 2, 1), ('kwafi tres', 5, 1, 1), ('koud rad', 4, 3, 1),
      ('3712 4455', 6, 2, 1), ('moun@mail.ht', 6, 2, 1), ('www lien ht', 6, 2, 1), ('mo blese', 6, 2, 1)
    ) t(term, n, jours, j0),
    lateral generate_series(1, t.n) i;
-- Hors fenêtre : 9 personnes il y a 60 jours (absent).
insert into zabelie_search_misses (term, session_hash, day, created_at)
  select 'vye rechech', 'v' || i, (now() - interval '60 days')::date, now() - interval '60 days' - make_interval(days => i % 2)
    from generate_series(1, 9) i;
insert into zabelie_authoring_termes_exclus (term, raison) values ('mo blese', 'terme blessant, retire a la main');

-- ── Données : ventes ─────────────────────────────────────────────────────
-- Produits digitaux de 02 et 03 dans le sous-rayon « Pwodwi dijital » ; un produit
-- digital de 02 rangé au seul département « Dijital & Sèvis » ; un service de 02 ;
-- un produit digital du vendeur d'essai 04.
insert into products (id, seller_id, slug, title, kind, price_htg, status, category, category_id) values
  ('00000000-0000-0000-0000-0000000b43a1', '00000000-0000-0000-0000-0000000b4302', 'opp-a1', 'Gid A', 'fichier', 500, 'published', 'Digital & services',
     (select id from zabelie_categories where slug = 'pwodwi-dijital')),
  ('00000000-0000-0000-0000-0000000b43a2', '00000000-0000-0000-0000-0000000b4303', 'opp-a2', 'Gid B', 'fichier', 500, 'published', 'Digital & services',
     (select id from zabelie_categories where slug = 'pwodwi-dijital')),
  ('00000000-0000-0000-0000-0000000b43a3', '00000000-0000-0000-0000-0000000b4302', 'opp-a3', 'Gid C', 'fichier', 500, 'published', 'Digital & services', null),
  ('00000000-0000-0000-0000-0000000b43a4', '00000000-0000-0000-0000-0000000b4302', 'opp-a4', 'Sevis', 'service', 500, 'published', 'Digital & services',
     (select id from zabelie_categories where slug = 'sevis-pwofesyonel')),
  ('00000000-0000-0000-0000-0000000b43a5', '00000000-0000-0000-0000-0000000b4304', 'opp-a5', 'Gid essai', 'fichier', 500, 'published', 'Digital & services',
     (select id from zabelie_categories where slug = 'pwodwi-dijital'));

create function pg_temp.vendre(p_acheteur int, p_produit uuid, p_confirme boolean default true, p_live boolean default true) returns void
language plpgsql as $$
declare v_ord uuid;
begin
  insert into orders (buyer_id, product_id, amount_htg, status, zabelie_payment_is_live)
  values (('00000000-0000-0000-0000-0000000b43' || lpad(p_acheteur::text, 2, '0'))::uuid, p_produit, 500, 'paid', p_live)
  returning id into v_ord;
  insert into payments (order_id, idempotency_key, status, confirmed_at)
  values (v_ord, v_ord::text, case when p_confirme then 'confirmed' else 'pending' end::payment_status,
          case when p_confirme then now() - interval '2 days' end);
end $$;

-- Pwodwi dijital : 2 ventes de 02, 1 de 03 → 3 ventes, 2 vendeurs (présent).
select pg_temp.vendre(5, '00000000-0000-0000-0000-0000000b43a1');
select pg_temp.vendre(6, '00000000-0000-0000-0000-0000000b43a1');
select pg_temp.vendre(7, '00000000-0000-0000-0000-0000000b43a2');
-- Ne comptent pas : paiement non confirmé, bac à sable, vendeur d'essai, service.
select pg_temp.vendre(8, '00000000-0000-0000-0000-0000000b43a2', false);
select pg_temp.vendre(9, '00000000-0000-0000-0000-0000000b43a2', true, false);
select pg_temp.vendre(10, '00000000-0000-0000-0000-0000000b43a5');
select pg_temp.vendre(11, '00000000-0000-0000-0000-0000000b43a4');
select pg_temp.vendre(12, '00000000-0000-0000-0000-0000000b43a4');
select pg_temp.vendre(5, '00000000-0000-0000-0000-0000000b43a4');
-- Département seul : 3 ventes, mais d'UN seul vendeur (absent).
select pg_temp.vendre(10, '00000000-0000-0000-0000-0000000b43a3');
select pg_temp.vendre(11, '00000000-0000-0000-0000-0000000b43a3');
select pg_temp.vendre(12, '00000000-0000-0000-0000-0000000b43a3');

select pg_temp.lire('plein', '00000000-0000-0000-0000-0000000b4301');

-- ── OP3, OP4, OP5 ────────────────────────────────────────────────────────
do $$
declare
  v jsonb := (select r from t_res where cle = 'plein');
  termes text[] := array(select x ->> 'terme' from jsonb_array_elements(v -> 'recherches') x);
begin
  if termes <> array['aprann angle'] then
    raise exception 'OP3/OP4/OP5 KO : termes rendus %', termes;
  end if;
  if (v -> 'recherches' -> 0 ->> 'personnes')::int <> 5 then
    raise exception 'OP3 KO : compte par personne %', v -> 'recherches';
  end if;
  raise notice 'OP3 OK — terme au-dessus des seuils present, compte par personne';
  raise notice 'OP4 OK — sous le seuil de personnes ou sur un seul jour : absent';
  raise notice 'OP5 OK — chiffres, adresse, lien et terme exclu jamais affiches';
end $$;

-- ── OP6, OP7 ─────────────────────────────────────────────────────────────
do $$
declare v jsonb := (select r from t_res where cle = 'plein');
begin
  if jsonb_array_length(v -> 'ventes') <> 1 then
    raise exception 'OP6/OP7 KO : rayons rendus %', v -> 'ventes';
  end if;
  if v -> 'ventes' -> 0 ->> 'rayon_fr' <> 'Produits digitaux' or (v -> 'ventes' -> 0 ->> 'ventes')::int <> 3
     or v -> 'ventes' -> 0 ->> 'rayon_ht' <> 'Pwodwi dijital' then
    raise exception 'OP6 KO : %', v -> 'ventes';
  end if;
  raise notice 'OP6 OK — rayon avec assez de ventes reelles et de vendeurs present';
  raise notice 'OP7 OK — paiement non confirme, bac a sable, essai, service, vendeur unique : ne comptent pas';
end $$;

-- Témoin de OP7 : un second vendeur sur le département le fait apparaître.
insert into products (id, seller_id, slug, title, kind, price_htg, status, category) values
  ('00000000-0000-0000-0000-0000000b43a6', '00000000-0000-0000-0000-0000000b4303', 'opp-a6', 'Gid D', 'fichier', 500, 'published', 'Digital & services');
select pg_temp.vendre(6, '00000000-0000-0000-0000-0000000b43a6');
select pg_temp.lire('temoin', '00000000-0000-0000-0000-0000000b4301');
do $$
declare v jsonb := (select r from t_res where cle = 'temoin');
begin
  if not exists (select 1 from jsonb_array_elements(v -> 'ventes') x where x ->> 'rayon_fr' = 'Digital & services' and (x ->> 'ventes')::int = 4) then
    raise exception 'OP7 KO : le temoin a deux vendeurs devrait apparaitre : %', v -> 'ventes';
  end if;
  raise notice 'OP7 OK — temoin : deux vendeurs sur le departement, le rayon apparait';
end $$;

-- ── OP8 ──────────────────────────────────────────────────────────────────
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000b4301', true);
  set local role authenticated;
  begin
    perform 1 from zabelie_search_misses limit 1;
    raise exception 'OP8 KO : capteur lisible';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from zabelie_authoring_termes_exclus limit 1;
    raise exception 'OP8 KO : liste d''exclusion lisible';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into zabelie_authoring_termes_exclus (term, raison) values ('aprann angle', 'tentative du vendeur');
    raise exception 'OP8 KO : liste d''exclusion modifiable';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'OP8 OK — ni le capteur ni la liste d''exclusion ne se lisent en direct';
end $$;

-- ── OP9 ──────────────────────────────────────────────────────────────────
update zabelie_authoring_config set opportunites_personnes_min = 3, opportunites_jours_distincts_min = 1, opportunites_max = 2 where id;
select pg_temp.lire('plafond', '00000000-0000-0000-0000-0000000b4301');
do $$
declare v jsonb := (select r from t_res where cle = 'plafond');
begin
  if jsonb_array_length(v -> 'recherches') <> 2 then
    raise exception 'OP9 KO : plafond non tenu %', v -> 'recherches';
  end if;
  if exists (select 1 from jsonb_array_elements(v -> 'recherches') x where x ->> 'terme' ~ '[0-9]{3,}|@|www') then
    raise exception 'OP9 KO : un terme filtre est revenu avec des seuils bas';
  end if;
  raise notice 'OP9 OK — liste plafonnee, filtres tenus meme avec des seuils bas';
end $$;

rollback;
