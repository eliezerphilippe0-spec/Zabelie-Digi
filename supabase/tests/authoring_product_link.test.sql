-- Studio de création éditoriale — rattachement d'un guide à SA fiche produit
-- (0148 ; tâche 5.2 ; PRD T19, T03, docs/70 §7.4 et §7.6). Transaction
-- annulée. Rôles réels ; chaque refus attendu est un connu-négatif, chaque
-- acceptation un connu-positif.
--
--   PL1 le service role crée la fiche d'un projet de SON vendeur, en brouillon ;
--   PL2 T19 : une seconde fiche pour le même projet est refusée (23505), les fiches sans lien ne sont pas concernées ;
--   PL3 T03 : une fiche ne se rattache pas au projet d'un autre vendeur, ni à l'insertion ni après ;
--   PL4 le lien posé ne se réécrit plus, ni le vendeur de la fiche, même par le propriétaire de la base ;
--   PL5 aucun rôle client n'écrit le lien ; le vendeur lit le sien sous son JWT, B ne voit pas le brouillon de A ;
--   PL6 supprimer le projet garde la fiche et met le lien à null.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a1801', 'lien-a@test.local'),
  ('00000000-0000-0000-0000-0000000a1802', 'lien-b@test.local')
  on conflict do nothing;
delete from profiles where id in ('00000000-0000-0000-0000-0000000a1801', '00000000-0000-0000-0000-0000000a1802');
insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-0000000a1801', 'creator', 'Auteur lien A'),
  ('00000000-0000-0000-0000-0000000a1802', 'creator', 'Auteur lien B');

insert into zabelie_authoring_projects (id, seller_id, titre, langue, public_vise) values
  ('00000000-0000-0000-0000-0000000a18f1', '00000000-0000-0000-0000-0000000a1801', 'Gid fich', 'ht', 'haiti'),
  ('00000000-0000-0000-0000-0000000a18f2', '00000000-0000-0000-0000-0000000a1801', 'Gid fich 2', 'ht', 'haiti'),
  ('00000000-0000-0000-0000-0000000a18f3', '00000000-0000-0000-0000-0000000a1802', 'Gid B', 'fr', 'haiti');

-- Exécute une instruction sous un rôle et une session ; rend 'ok' ou le code d'erreur.
create function pg_temp.essayer(p_role text, p_qui uuid, p_sql text)
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_qui::text, ''), true);
  execute format('set local role %I', p_role);
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end;
$$;

-- Une fiche de vendeur, avec ou sans lien, comme la création partagée l'insère.
create function pg_temp.fiche(p_id uuid, p_vendeur uuid, p_projet uuid)
returns text language sql as $$
  select format(
    'insert into products (id, seller_id, slug, title, description, price_htg, kind, status, category, zabelie_authoring_project_id) '
    || 'values (%L, %L, %L, %L, %L, 750, %L, %L, %L, %s)',
    p_id, p_vendeur, 'gid-fich-' || left(p_id::text, 8) || right(p_id::text, 4), 'Gid fich', 'Test', 'fichier', 'draft', 'Design',
    coalesce(quote_literal(p_projet), 'null'));
$$;

-- ── PL1. Création par le service role ──────────────────────────────────────
do $$
declare v_r text;
begin
  v_r := pg_temp.essayer('service_role', null, pg_temp.fiche(
    '00000000-0000-0000-0000-0000000a1891', '00000000-0000-0000-0000-0000000a1801', '00000000-0000-0000-0000-0000000a18f1'));
  assert v_r = 'ok', 'PL1 KO — ' || v_r;
  assert (select status from products where id = '00000000-0000-0000-0000-0000000a1891') = 'draft', 'PL1 KO statut';
  raise notice 'PL1 OK — fiche du projet creee en brouillon';
end $$;

-- ── PL2. Une seule fiche par projet ────────────────────────────────────────
do $$
declare v_r text;
begin
  v_r := pg_temp.essayer('service_role', null, pg_temp.fiche(
    '00000000-0000-0000-0000-0000000a1892', '00000000-0000-0000-0000-0000000a1801', '00000000-0000-0000-0000-0000000a18f1'));
  assert v_r like '23505 %products_zabelie_authoring_project_unique%', 'PL2 KO doublon — ' || v_r;
  -- Deux fiches sans lien : l'index partiel ne les regarde pas.
  v_r := pg_temp.essayer('service_role', null, pg_temp.fiche(
    '00000000-0000-0000-0000-0000000a1893', '00000000-0000-0000-0000-0000000a1801', null));
  assert v_r = 'ok', 'PL2 KO sans lien 1 — ' || v_r;
  v_r := pg_temp.essayer('service_role', null, pg_temp.fiche(
    '00000000-0000-0000-0000-0000000a1894', '00000000-0000-0000-0000-0000000a1801', null));
  assert v_r = 'ok', 'PL2 KO sans lien 2 — ' || v_r;
  assert (select count(*) from products where zabelie_authoring_project_id = '00000000-0000-0000-0000-0000000a18f1') = 1, 'PL2 KO compte';
  raise notice 'PL2 OK — seconde fiche refusee, fiches sans lien libres';
end $$;

-- ── PL3. Jamais le projet d'un autre vendeur ───────────────────────────────
do $$
declare v_r text;
begin
  v_r := pg_temp.essayer('service_role', null, pg_temp.fiche(
    '00000000-0000-0000-0000-0000000a1895', '00000000-0000-0000-0000-0000000a1802', '00000000-0000-0000-0000-0000000a18f2'));
  assert v_r = '42501 authoring_lien_autre_vendeur', 'PL3 KO insertion — ' || v_r;
  -- Une fiche sans lien de B ne prend pas après coup le projet de A.
  v_r := pg_temp.essayer('service_role', null, pg_temp.fiche(
    '00000000-0000-0000-0000-0000000a1896', '00000000-0000-0000-0000-0000000a1802', null));
  assert v_r = 'ok', 'PL3 KO fiche B — ' || v_r;
  v_r := pg_temp.essayer('service_role', null,
    $q$update products set zabelie_authoring_project_id = '00000000-0000-0000-0000-0000000a18f2' where id = '00000000-0000-0000-0000-0000000a1896'$q$);
  assert v_r = '42501 authoring_lien_autre_vendeur', 'PL3 KO mise a jour — ' || v_r;
  -- Le projet de A sur une fiche de A sans lien : accepté (même vendeur).
  v_r := pg_temp.essayer('service_role', null,
    $q$update products set zabelie_authoring_project_id = '00000000-0000-0000-0000-0000000a18f2' where id = '00000000-0000-0000-0000-0000000a1893'$q$);
  assert v_r = 'ok', 'PL3 KO meme vendeur — ' || v_r;
  raise notice 'PL3 OK — projet d''un autre vendeur refuse';
end $$;

-- ── PL4. Lien immuable, pour tout rôle ─────────────────────────────────────
do $$
declare
  v_n int := 0;
  v_sql text;
begin
  foreach v_sql in array array[
    $q$update products set zabelie_authoring_project_id = '00000000-0000-0000-0000-0000000a18f2' where id = '00000000-0000-0000-0000-0000000a1891'$q$,
    $q$update products set seller_id = '00000000-0000-0000-0000-0000000a1802' where id = '00000000-0000-0000-0000-0000000a1891'$q$
  ] loop
    begin
      execute v_sql;  -- propriétaire de la base : la garde vaut aussi pour lui
      raise exception 'PL4 KO — reecriture acceptee : %', v_sql;
    exception when insufficient_privilege then
      if sqlerrm <> 'authoring_lien_immuable' then raise; end if;
      v_n := v_n + 1;
    end;
  end loop;
  assert v_n = 2, 'PL4 KO';
  -- Le reste de la fiche reste modifiable : la modération et le vendeur continuent de travailler.
  update products set title = 'Gid fich (revu)', price_htg = 800 where id = '00000000-0000-0000-0000-0000000a1891';
  assert (select zabelie_authoring_project_id from products where id = '00000000-0000-0000-0000-0000000a1891')
         = '00000000-0000-0000-0000-0000000a18f1', 'PL4 KO lien';
  raise notice 'PL4 OK — lien et vendeur figes, le reste modifiable';
end $$;

-- ── PL5. Aucun rôle client n'écrit le lien ; lecture sous le JWT ──────────
do $$
declare v_r text;
begin
  v_r := pg_temp.essayer('authenticated', '00000000-0000-0000-0000-0000000a1801',
    $q$update products set zabelie_authoring_project_id = null where id = '00000000-0000-0000-0000-0000000a1891'$q$);
  assert v_r like '42501 %', 'PL5 KO vendeur ecrit — ' || v_r;
  v_r := pg_temp.essayer('authenticated', '00000000-0000-0000-0000-0000000a1801', pg_temp.fiche(
    '00000000-0000-0000-0000-0000000a1897', '00000000-0000-0000-0000-0000000a1801', '00000000-0000-0000-0000-0000000a18f2'));
  assert v_r like '42501 %', 'PL5 KO vendeur insere — ' || v_r;
  v_r := pg_temp.essayer('anon', null, pg_temp.fiche(
    '00000000-0000-0000-0000-0000000a1898', '00000000-0000-0000-0000-0000000a1801', null));
  assert v_r like '42501 %', 'PL5 KO anon — ' || v_r;

  -- A retrouve sa fiche par le lien, comme la route ; B ne la voit pas.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1801', true);
  set local role authenticated;
  assert (select count(*) from products where zabelie_authoring_project_id = '00000000-0000-0000-0000-0000000a18f1') = 1, 'PL5 KO lecture A';
  reset role;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1802', true);
  set local role authenticated;
  assert (select count(*) from products where zabelie_authoring_project_id = '00000000-0000-0000-0000-0000000a18f1') = 0, 'PL5 KO lecture B';
  reset role;
  raise notice 'PL5 OK — aucun client n''ecrit, lecture bornee au vendeur';
end $$;

-- ── PL6. Supprimer le projet garde la fiche ────────────────────────────────
do $$
begin
  delete from zabelie_authoring_projects where id = '00000000-0000-0000-0000-0000000a18f1';
  assert exists (select 1 from products where id = '00000000-0000-0000-0000-0000000a1891'
                   and zabelie_authoring_project_id is null and title = 'Gid fich (revu)'), 'PL6 KO';
  raise notice 'PL6 OK — fiche conservee, lien a null';
end $$;

rollback;
