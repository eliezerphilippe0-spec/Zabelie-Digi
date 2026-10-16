-- Studio de création éditoriale — exports PDF et approbation de l'export exact
-- (0145 ; tâche 4.3 ; PRD T18, T28). Transaction annulée. Rôles réels ; chaque
-- refus attendu est un connu-négatif, chaque acceptation un connu-positif.
--
--   EX1  le service role enregistre l'export d'une révision approuvée : chemin calculé, non approuvé ;
--   EX2  les mêmes octets pour la même révision : la même ligne, aucune en double ;
--   EX3  révision non approuvée, périmée, projet d'un autre, archivé, vendeur suspendu : refus ;
--   EX4  un vendeur n'enregistre aucun export et n'écrit aucune ligne, même la sienne ;
--   EX5  le vendeur B ne voit pas les exports de A ; anon ne lit rien ;
--   EX6  T28 : une empreinte différente est refusée ; l'exacte est approuvée, une seule fois ;
--   EX7  T18 : après une modification, l'ancien export ne s'approuve plus ; le nouveau, si ;
--   EX8  un export est immuable et son approbation ne se réécrit pas, même par le propriétaire de la base ;
--   EX9  le vendeur B n'approuve pas l'export de A ;
--   EX10 le bucket est privé et n'accepte que le PDF.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a1701', 'export-a@test.local'),
  ('00000000-0000-0000-0000-0000000a1702', 'export-b@test.local')
  on conflict do nothing;
delete from profiles where id in ('00000000-0000-0000-0000-0000000a1701', '00000000-0000-0000-0000-0000000a1702');
insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-0000000a1701', 'creator', 'Auteur export A'),
  ('00000000-0000-0000-0000-0000000a1702', 'creator', 'Auteur export B');

-- G : guide complet de A, plan approuvé, révision approuvée par A lui-même.
insert into zabelie_authoring_projects (id, seller_id, titre, langue, public_vise) values
  ('00000000-0000-0000-0000-0000000a17f1', '00000000-0000-0000-0000-0000000a1701', 'Gid ekspò', 'ht', 'haiti'),
  ('00000000-0000-0000-0000-0000000a17f2', '00000000-0000-0000-0000-0000000a1701', 'Gid san apwobasyon', 'ht', 'haiti');
update zabelie_authoring_projects
   set contenu = '{"objectif": "Lanse", "sections": [{"id": "00000000-0000-4000-8000-0000000000f1", "titre": "Kòmanse", "resultat": "", "corps": "Premye tèks."}]}'
 where id in ('00000000-0000-0000-0000-0000000a17f1', '00000000-0000-0000-0000-0000000a17f2');
update zabelie_authoring_projects set plan_approuve_revision = revision
 where id in ('00000000-0000-0000-0000-0000000a17f1', '00000000-0000-0000-0000-0000000a17f2');

create temporary table t_ex (cle text primary key, id uuid, rev int) on commit drop;
grant all on t_ex to authenticated, anon, service_role;

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

create function pg_temp.enregistrer(p_seller uuid, p_projet uuid, p_rev int, p_empreinte text)
returns text language sql as $$
  select format(
    'select zabelie_authoring_enregistrer_export(%L, %L, %s, %L, %L, 84000, 34, %L, 14000, 7)',
    p_seller, p_projet, coalesce(p_rev::text, 'null'), 'zabelie-pdf-1', p_empreinte, repeat('e', 64));
$$;

-- A approuve sa révision courante (0144).
do $$
declare v_rev int := (select revision from zabelie_authoring_projects where id = '00000000-0000-0000-0000-0000000a17f1');
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1701', true);
  set local role authenticated;
  perform zabelie_authoring_approuver_revision('00000000-0000-0000-0000-0000000a17f1', v_rev, true);
  reset role;
  insert into t_ex values ('rev', null, v_rev);
end $$;

-- ── EX1. Enregistrement par le service role ────────────────────────────────
do $$
declare
  v_rev int := (select rev from t_ex where cle = 'rev');
  e zabelie_authoring_exports%rowtype;
begin
  set local role service_role;
  select * into e from zabelie_authoring_enregistrer_export(
    '00000000-0000-0000-0000-0000000a1701', '00000000-0000-0000-0000-0000000a17f1', v_rev, 'zabelie-pdf-1',
    repeat('a', 64), 84000, 34, repeat('b', 64), 14000, 7);
  reset role;
  assert e.id is not null, 'EX1 KO : aucune ligne rendue';
  assert e.chemin = '00000000-0000-0000-0000-0000000a1701/00000000-0000-0000-0000-0000000a17f1/' || repeat('a', 64) || '.pdf', 'EX1 KO : chemin ' || e.chemin;
  assert e.extrait_chemin like '%/' || repeat('b', 64) || '-extrait.pdf', 'EX1 KO : chemin de l''extrait';
  assert e.approuve_le is null and e.approuve_empreinte is null, 'EX1 KO : ne nait pas approuve';
  assert e.revision = v_rev and e.taille = 84000 and e.pages = 34, 'EX1 KO : valeurs';
  insert into t_ex values ('a', e.id, v_rev);
  raise notice 'EX1 OK — export enregistre, chemin calcule par la base, non approuve';
end $$;

-- ── EX2. Mêmes octets, même révision : la même ligne ───────────────────────
do $$
declare v_rev int := (select rev from t_ex where cle = 'rev'); v_id uuid; v_n int;
begin
  set local role service_role;
  select id into v_id from zabelie_authoring_enregistrer_export(
    '00000000-0000-0000-0000-0000000a1701', '00000000-0000-0000-0000-0000000a17f1', v_rev, 'zabelie-pdf-1',
    repeat('a', 64), 84000, 34, repeat('b', 64), 14000, 7);
  reset role;
  assert v_id = (select id from t_ex where cle = 'a'), 'EX2 KO : une autre ligne pour les memes octets';
  select count(*) into v_n from zabelie_authoring_exports where project_id = '00000000-0000-0000-0000-0000000a17f1';
  assert v_n = 1, format('EX2 KO : %s lignes', v_n);
  raise notice 'EX2 OK — regenerer rend la ligne existante';
end $$;

-- ── EX3. Refus de l'enregistrement ─────────────────────────────────────────
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000a1701';
  b uuid := '00000000-0000-0000-0000-0000000a1702';
  g uuid := '00000000-0000-0000-0000-0000000a17f1';
  v_rev int := (select rev from t_ex where cle = 'rev');
  v_r text;
begin
  v_r := pg_temp.essayer('service_role', null, pg_temp.enregistrer(a, '00000000-0000-0000-0000-0000000a17f2',
           (select revision from zabelie_authoring_projects where id = '00000000-0000-0000-0000-0000000a17f2'), repeat('c', 64)));
  assert v_r = 'P0001 authoring_guide_non_approuve', 'EX3 KO non approuve — ' || v_r;
  v_r := pg_temp.essayer('service_role', null, pg_temp.enregistrer(a, g, v_rev - 1, repeat('c', 64)));
  assert v_r = '40001 authoring_revision_perimee', 'EX3 KO perimee — ' || v_r;
  v_r := pg_temp.essayer('service_role', null, pg_temp.enregistrer(a, g, null, repeat('c', 64)));
  assert v_r = '40001 authoring_revision_perimee', 'EX3 KO revision nulle — ' || v_r;
  v_r := pg_temp.essayer('service_role', null, pg_temp.enregistrer(b, g, v_rev, repeat('c', 64)));
  assert v_r = '42501 authoring_projet_introuvable', 'EX3 KO autre vendeur — ' || v_r;
  v_r := pg_temp.essayer('service_role', null, pg_temp.enregistrer(a, g, v_rev, 'pas-une-empreinte'));
  assert v_r like '23514 %', 'EX3 KO empreinte mal formee — ' || v_r;
  update profiles set suspended_at = now() where id = a;
  v_r := pg_temp.essayer('service_role', null, pg_temp.enregistrer(a, g, v_rev, repeat('c', 64)));
  assert v_r = '42501 authoring_compte_inactif', 'EX3 KO suspendu — ' || v_r;
  update profiles set suspended_at = null where id = a;
  update zabelie_authoring_projects set archived_at = now() where id = g;
  v_r := pg_temp.essayer('service_role', null, pg_temp.enregistrer(a, g, v_rev, repeat('c', 64)));
  assert v_r = 'P0001 authoring_projet_archive', 'EX3 KO archive — ' || v_r;
  update zabelie_authoring_projects set archived_at = null where id = g;
  assert (select count(*) from zabelie_authoring_exports where project_id = g) = 1, 'EX3 KO : un refus a ecrit';
  raise notice 'EX3 OK — sept refus, rien d''ecrit';
end $$;

-- ── EX4. Le vendeur n'écrit rien ───────────────────────────────────────────
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000a1701';
  v_ex uuid := (select id from t_ex where cle = 'a');
  v_sql text;
  v_r text;
  v_n int := 0;
begin
  foreach v_sql in array array[
    pg_temp.enregistrer(a, '00000000-0000-0000-0000-0000000a17f1', (select rev from t_ex where cle = 'rev'), repeat('d', 64)),
    format('update zabelie_authoring_exports set approuve_le = now(), approuve_empreinte = empreinte where id = %L', v_ex),
    format('update zabelie_authoring_exports set taille = 1 where id = %L', v_ex),
    format('delete from zabelie_authoring_exports where id = %L', v_ex),
    format('insert into zabelie_authoring_exports (project_id, seller_id, revision, moteur, chemin, empreinte, taille, pages, extrait_chemin, extrait_empreinte, extrait_taille, extrait_pages) values (%L, %L, 1, %L, %L, %L, 1, 1, %L, %L, 1, 1)',
      '00000000-0000-0000-0000-0000000a17f1', a, 'x', 'x', repeat('d', 64), 'x', repeat('d', 64))
  ] loop
    v_r := pg_temp.essayer('authenticated', a, v_sql);
    assert v_r like '42501 %', 'EX4 KO : accepte — ' || v_sql || ' — ' || v_r;
    v_n := v_n + 1;
  end loop;
  assert v_n = 5, 'EX4 KO';
  assert (select approuve_le is null and taille = 84000 from zabelie_authoring_exports where id = v_ex), 'EX4 KO : ligne alteree';
  raise notice 'EX4 OK — cinq ecritures refusees au vendeur';
end $$;

-- ── EX5. Isolation ─────────────────────────────────────────────────────────
do $$
declare v_n int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1702', true);
  set local role authenticated;
  select count(*) into v_n from zabelie_authoring_exports;
  reset role;
  assert v_n = 0, 'EX5 KO : B voit les exports de A';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1701', true);
  set local role authenticated;
  select count(*) into v_n from zabelie_authoring_exports;
  reset role;
  assert v_n = 1, 'EX5 KO : A ne voit pas son export (temoin)';
  assert pg_temp.essayer('anon', null, 'select count(*) from zabelie_authoring_exports') like '42501 %', 'EX5 KO : anon lit';
  raise notice 'EX5 OK — B ne voit rien, A voit le sien, anon rien';
end $$;

-- ── EX6. T28 : l'empreinte exacte ──────────────────────────────────────────
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000a1701';
  v_ex uuid := (select id from t_ex where cle = 'a');
  v_r text;
  v_le timestamptz;
begin
  v_r := pg_temp.essayer('authenticated', a, format('select zabelie_authoring_approuver_export(%L, %L)', v_ex, repeat('f', 64)));
  assert v_r = '22023 authoring_empreinte_differente', 'EX6 KO empreinte differente — ' || v_r;
  v_r := pg_temp.essayer('authenticated', a, format('select zabelie_authoring_approuver_export(%L, null)', v_ex));
  assert v_r = '22023 authoring_empreinte_differente', 'EX6 KO empreinte nulle — ' || v_r;
  assert (select approuve_le is null from zabelie_authoring_exports where id = v_ex), 'EX6 KO : refus qui approuve';
  v_r := pg_temp.essayer('authenticated', a, format('select zabelie_authoring_approuver_export(%L, %L)', v_ex, repeat('a', 64)));
  assert v_r = 'ok', 'EX6 KO empreinte exacte — ' || v_r;
  select approuve_le into v_le from zabelie_authoring_exports where id = v_ex;
  assert v_le is not null and (select approuve_empreinte from zabelie_authoring_exports where id = v_ex) = repeat('a', 64), 'EX6 KO : approbation non inscrite';
  -- Rejouée : la même date, rien de réécrit.
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  assert zabelie_authoring_approuver_export(v_ex, repeat('a', 64)) = v_le, 'EX6 KO : rejouer change la date';
  reset role;
  raise notice 'EX6 OK — empreinte differente refusee, exacte approuvee une fois';
end $$;

-- ── EX7. T18 : modifier périme l'export ────────────────────────────────────
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000a1701';
  g uuid := '00000000-0000-0000-0000-0000000a17f1';
  v_ancien uuid;
  v_nouveau uuid;
  v_rev int;
  v_r text;
begin
  -- Un second export de l'ancienne révision, jamais approuvé.
  set local role service_role;
  select id into v_ancien from zabelie_authoring_enregistrer_export(a, g, (select rev from t_ex where cle = 'rev'), 'zabelie-pdf-1',
    repeat('9', 64), 84100, 34, repeat('8', 64), 14000, 7);
  reset role;
  -- A modifie son guide : la révision avance, l'approbation du guide ne vaut plus.
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  update zabelie_authoring_projects set titre = 'Gid ekspò, vèsyon 2' where id = g;
  reset role;
  v_rev := (select revision from zabelie_authoring_projects where id = g);
  v_r := pg_temp.essayer('authenticated', a, format('select zabelie_authoring_approuver_export(%L, %L)', v_ancien, repeat('9', 64)));
  assert v_r = '40001 authoring_export_perime', 'EX7 KO : export ancien approuve apres modification — ' || v_r;
  -- Même après une nouvelle approbation du guide : l'ancien export reste périmé.
  v_r := pg_temp.essayer('authenticated', a, format('select zabelie_authoring_approuver_revision(%L, %s, true)', g, v_rev));
  assert v_r = 'ok', 'EX7 KO : nouvelle approbation du guide — ' || v_r;
  v_r := pg_temp.essayer('authenticated', a, format('select zabelie_authoring_approuver_export(%L, %L)', v_ancien, repeat('9', 64)));
  assert v_r = '40001 authoring_export_perime', 'EX7 KO : export d''une revision ancienne approuve — ' || v_r;
  -- Le nouvel export, de la révision courante approuvée, s'approuve.
  set local role service_role;
  select id into v_nouveau from zabelie_authoring_enregistrer_export(a, g, v_rev, 'zabelie-pdf-1',
    repeat('7', 64), 84200, 34, repeat('6', 64), 14000, 7);
  reset role;
  v_r := pg_temp.essayer('authenticated', a, format('select zabelie_authoring_approuver_export(%L, %L)', v_nouveau, repeat('7', 64)));
  assert v_r = 'ok', 'EX7 KO : nouvel export refuse — ' || v_r;
  insert into t_ex values ('nouveau', v_nouveau, v_rev);
  raise notice 'EX7 OK — ancien export perime (T18), nouveau approuve';
end $$;

-- ── EX8. Immuabilité, même pour le propriétaire de la base ─────────────────
do $$
declare v_ex uuid := (select id from t_ex where cle = 'a'); v_n int := 0; v_sql text;
begin
  foreach v_sql in array array[
    format('update zabelie_authoring_exports set empreinte = %L, approuve_empreinte = %L where id = %L', repeat('0', 64), repeat('0', 64), v_ex),
    format('update zabelie_authoring_exports set chemin = %L where id = %L', 'ailleurs.pdf', v_ex),
    -- `now()` est figée dans la transaction (= la date d'EX6) : on décale pour réécrire VRAIMENT.
    format('update zabelie_authoring_exports set approuve_le = approuve_le + interval ''1 day'' where id = %L', v_ex),
    format('update zabelie_authoring_exports set approuve_le = null, approuve_empreinte = null where id = %L', v_ex)
  ] loop
    begin
      execute v_sql;
      raise exception 'EX8 KO : accepte — %', v_sql;
    exception when insufficient_privilege then
      if sqlerrm <> 'authoring_export_immuable' then raise; end if;
      v_n := v_n + 1;
    end;
  end loop;
  assert v_n = 4, 'EX8 KO';
  raise notice 'EX8 OK — quatre reecritures refusees au proprietaire';
end $$;

-- ── EX9. B n'approuve pas l'export de A ────────────────────────────────────
do $$
declare v_r text;
begin
  v_r := pg_temp.essayer('authenticated', '00000000-0000-0000-0000-0000000a1702',
           format('select zabelie_authoring_approuver_export(%L, %L)', (select id from t_ex where cle = 'nouveau'), repeat('7', 64)));
  assert v_r = '42501 authoring_export_introuvable', 'EX9 KO — ' || v_r;
  v_r := pg_temp.essayer('anon', null,
           format('select zabelie_authoring_approuver_export(%L, %L)', (select id from t_ex where cle = 'nouveau'), repeat('7', 64)));
  assert v_r like '42501 %', 'EX9 KO anon — ' || v_r;
  raise notice 'EX9 OK — B et anon refuses';
end $$;

-- ── EX10. Bucket ───────────────────────────────────────────────────────────
do $$
begin
  assert exists (select 1 from storage.buckets where id = 'authoring-exports' and public = false
                   and allowed_mime_types = array['application/pdf'] and file_size_limit = 20971520), 'EX10 KO';
  raise notice 'EX10 OK — bucket prive, PDF seulement, 20 Mo';
end $$;

rollback;
