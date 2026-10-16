-- Studio de création éditoriale — projets (0141 ; docs/70, tâche 2.1).
-- Transaction annulée. Éprouvé sous les rôles réels ; chaque refus attendu est
-- un connu-négatif, chaque acceptation un connu-positif.
--
--   P1  le vendeur A crée un projet par la fonction : révision 1, propriétaire = session ;
--   P2  anon ne lit rien et n'exécute rien ;
--   P3  le vendeur B ne voit, ne modifie, n'approuve ni n'archive le projet de A (T01) ;
--   P4  sauvegarde par révision : une ligne puis zéro sur la même révision (T04) ;
--   P5  A ne peut forger ni révision, ni approbation, ni archivage, ni propriétaire,
--       ni insérer ou supprimer directement (T31) ;
--   P6  limites lues dans la config, y compris après un changement de config ;
--   P7  approbation du plan : révision exacte, plan non vide, révision inchangée ;
--   P8  un projet archivé reste lisible et devient non modifiable ;
--   P9  plafond de projets actifs, lu en base ;
--   P10 un vendeur suspendu ne crée pas de projet ;
--   P11 config absente : tout est refusé (fail-closed).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a1401', 'auteur-a@test.local'),
  ('00000000-0000-0000-0000-0000000a1402', 'auteur-b@test.local')
  on conflict do nothing;
delete from profiles where id in ('00000000-0000-0000-0000-0000000a1401', '00000000-0000-0000-0000-0000000a1402');
insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-0000000a1401', 'creator', 'Auteur A'),
  ('00000000-0000-0000-0000-0000000a1402', 'creator', 'Auteur B');

create temporary table t_ids (cle text primary key, id uuid) on commit drop;
grant all on t_ids to authenticated, anon;

-- ── P1. Création par la fonction ───────────────────────────────────────────
do $$
declare p zabelie_authoring_projects%rowtype;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1401', true);
  set local role authenticated;
  select * into p from zabelie_authoring_creer_projet('Gid vann manje', 'ht', 'both', 'Miami');
  reset role;
  assert p.id is not null, 'P1 KO : aucun projet rendu';
  assert p.seller_id = '00000000-0000-0000-0000-0000000a1401', 'P1 KO : proprietaire faux';
  assert p.revision = 1 and p.plan_approuve_revision is null and p.archived_at is null, 'P1 KO : etat initial';
  insert into t_ids values ('a', p.id);
  raise notice 'P1 OK — creation sous la session, revision 1';
end $$;

-- ── P2. anon ───────────────────────────────────────────────────────────────
do $$
declare v_etapes int := 0;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    set local role anon;
    perform count(*) from zabelie_authoring_projects;
    raise exception 'P2 KO : anon lit les projets';
  exception when insufficient_privilege then v_etapes := v_etapes + 1;
  end;
  begin
    set local role anon;
    perform zabelie_authoring_creer_projet('x', 'fr', 'haiti', '');
    raise exception 'P2 KO : anon cree un projet';
  exception when insufficient_privilege then v_etapes := v_etapes + 1;
  end;
  reset role;
  assert v_etapes = 2, 'P2 KO';
  raise notice 'P2 OK — anon ne lit ni n''execute rien';
end $$;

-- ── P3. Isolation entre vendeurs (T01) ─────────────────────────────────────
do $$
declare v_a uuid := (select id from t_ids where cle = 'a'); v_n int; v_refus int := 0;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1402', true);
  set local role authenticated;
  select count(*) into v_n from zabelie_authoring_projects where id = v_a;
  assert v_n = 0, 'P3 KO : B voit le projet de A';
  update zabelie_authoring_projects set titre = 'vole' where id = v_a;
  get diagnostics v_n = row_count;
  assert v_n = 0, 'P3 KO : B modifie le projet de A';
  begin
    perform zabelie_authoring_approuver_plan(v_a, 1);
  exception when insufficient_privilege then v_refus := v_refus + 1;
  end;
  begin
    perform zabelie_authoring_archiver(v_a);
  exception when insufficient_privilege then v_refus := v_refus + 1;
  end;
  reset role;
  assert v_refus = 2, 'P3 KO : B approuve ou archive le projet de A';
  assert (select titre from zabelie_authoring_projects where id = v_a) = 'Gid vann manje', 'P3 KO : titre altere';
  raise notice 'P3 OK — B ne voit ni ne touche le projet de A';
end $$;

-- ── P4. Sauvegarde par révision (T04) ──────────────────────────────────────
do $$
declare v_a uuid := (select id from t_ids where cle = 'a'); v_n int; v_rev int; v_jeton uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1401', true);
  set local role authenticated;
  update zabelie_authoring_projects set titre = 'Gid 2', derniere_sauvegarde = v_jeton
   where id = v_a and revision = 1;
  get diagnostics v_n = row_count;
  assert v_n = 1, 'P4 KO : la premiere sauvegarde n''a rien ecrit';
  update zabelie_authoring_projects set titre = 'Gid 2 bis', derniere_sauvegarde = gen_random_uuid()
   where id = v_a and revision = 1;
  get diagnostics v_n = row_count;
  assert v_n = 0, 'P4 KO : une revision perimee a ecrit (ecriture gagnante silencieuse)';
  select revision into v_rev from zabelie_authoring_projects where id = v_a;
  reset role;
  assert v_rev = 2, format('P4 KO : revision %s au lieu de 2', v_rev);
  assert (select derniere_sauvegarde from zabelie_authoring_projects where id = v_a) = v_jeton, 'P4 KO : jeton';
  raise notice 'P4 OK — une sauvegarde, puis un conflit sur la meme revision';
end $$;

-- ── P5. Forgeries refusées (T31) ───────────────────────────────────────────
do $$
declare v_a uuid := (select id from t_ids where cle = 'a'); v_refus int := 0; v_sql text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1401', true);
  foreach v_sql in array array[
    format('update zabelie_authoring_projects set revision = 99 where id = %L', v_a),
    format('update zabelie_authoring_projects set plan_approuve_revision = 2 where id = %L', v_a),
    format('update zabelie_authoring_projects set archived_at = now() where id = %L', v_a),
    format('update zabelie_authoring_projects set seller_id = %L where id = %L', '00000000-0000-0000-0000-0000000a1402', v_a),
    format('update zabelie_authoring_projects set created_at = now() where id = %L', v_a),
    'insert into zabelie_authoring_projects (seller_id, titre, langue, public_vise) values (auth.uid(), ''x'', ''fr'', ''haiti'')',
    format('delete from zabelie_authoring_projects where id = %L', v_a),
    'update zabelie_authoring_config set sections_max = 40'
  ] loop
    begin
      set local role authenticated;
      execute v_sql;
      raise exception 'P5 KO : accepte — %', v_sql;
    exception when insufficient_privilege then v_refus := v_refus + 1;
    end;
  end loop;
  reset role;
  assert v_refus = 8, format('P5 KO : %s refus sur 8', v_refus);
  assert (select revision from zabelie_authoring_projects where id = v_a) = 2, 'P5 KO : revision touchee';
  raise notice 'P5 OK — huit forgeries refusees';
end $$;

-- ── P6. Limites lues dans la config ────────────────────────────────────────
do $$
declare v_a uuid := (select id from t_ids where cle = 'a'); v_refus int := 0; v_n int;
  v_deux jsonb := '{"objectif": "", "sections": [{"id": "00000000-0000-4000-8000-000000000001", "titre": "Un", "resultat": "", "corps": ""}, {"id": "00000000-0000-4000-8000-000000000002", "titre": "De", "resultat": "", "corps": ""}]}';
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1401', true);
  begin
    set local role authenticated;
    update zabelie_authoring_projects set titre = repeat('x', 161) where id = v_a;
    raise exception 'P6 KO : titre de 161 caracteres accepte';
  exception when check_violation then
    if sqlerrm <> 'authoring_titre_trop_long' then raise; end if;
    v_refus := v_refus + 1;
  end;
  begin
    set local role authenticated;
    update zabelie_authoring_projects
       set contenu = jsonb_build_object('objectif', '', 'sections',
             (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'titre', 'S', 'resultat', '', 'corps', ''))
                from generate_series(1, 13)))
     where id = v_a;
    raise exception 'P6 KO : 13 sections acceptees';
  exception when check_violation then
    if sqlerrm <> 'authoring_trop_de_sections' then raise; end if;
    v_refus := v_refus + 1;
  end;
  -- Deux sections passent avec la config d'origine…
  set local role authenticated;
  update zabelie_authoring_projects set contenu = v_deux where id = v_a;
  get diagnostics v_n = row_count;
  reset role;
  assert v_n = 1, 'P6 KO : deux sections refusees';
  -- … et sont refusées dès que la config l'impose : la limite est LUE.
  update zabelie_authoring_config set sections_max = 1 where id;
  begin
    set local role authenticated;
    update zabelie_authoring_projects set contenu = v_deux, titre = 'Gid 3' where id = v_a;
    raise exception 'P6 KO : la limite de la config n''est pas relue';
  exception when check_violation then v_refus := v_refus + 1;
  end;
  reset role;
  update zabelie_authoring_config set sections_max = 12 where id;
  assert v_refus = 3, 'P6 KO';
  raise notice 'P6 OK — titre, sections et config relue';
end $$;

-- ── P7. Approbation du plan ────────────────────────────────────────────────
do $$
declare v_a uuid := (select id from t_ids where cle = 'a'); v_rev int; v_ok int; v_refus int := 0;
begin
  select revision into v_rev from zabelie_authoring_projects where id = v_a;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1401', true);
  begin
    set local role authenticated;
    perform zabelie_authoring_approuver_plan(v_a, v_rev - 1);
    raise exception 'P7 KO : revision perimee approuvee';
  exception when serialization_failure then v_refus := v_refus + 1;
  end;
  set local role authenticated;
  v_ok := zabelie_authoring_approuver_plan(v_a, v_rev);
  reset role;
  assert v_ok = v_rev, 'P7 KO : revision approuvee rendue';
  assert (select plan_approuve_revision from zabelie_authoring_projects where id = v_a) = v_rev, 'P7 KO : approbation non inscrite';
  assert (select revision from zabelie_authoring_projects where id = v_a) = v_rev, 'P7 KO : approuver a change la revision';
  -- Un plan vide ne s'approuve pas (projet neuf de A).
  begin
    set local role authenticated;
    perform zabelie_authoring_approuver_plan(
      (select id from zabelie_authoring_creer_projet('Vid', 'fr', 'haiti', '')), 1);
    raise exception 'P7 KO : plan vide approuve';
  exception when raise_exception then
    if sqlerrm <> 'authoring_plan_vide' then raise; end if;
    v_refus := v_refus + 1;
  end;
  reset role;
  assert v_refus = 2, 'P7 KO';
  raise notice 'P7 OK — revision exacte, plan non vide, revision inchangee';
end $$;

-- ── P8. Archivage ──────────────────────────────────────────────────────────
do $$
declare v_a uuid := (select id from t_ids where cle = 'a'); v_n int; v_rev int;
begin
  select revision into v_rev from zabelie_authoring_projects where id = v_a;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1401', true);
  set local role authenticated;
  perform zabelie_authoring_archiver(v_a);
  update zabelie_authoring_projects set titre = 'apres archivage' where id = v_a;
  get diagnostics v_n = row_count;
  assert v_n = 0, 'P8 KO : un projet archive se modifie';
  select count(*) into v_n from zabelie_authoring_projects where id = v_a;
  reset role;
  assert v_n = 1, 'P8 KO : un projet archive n''est plus lisible';
  assert (select revision from zabelie_authoring_projects where id = v_a) = v_rev, 'P8 KO : archiver a change la revision';
  raise notice 'P8 OK — archive lisible, non modifiable';
end $$;

-- ── P9. Plafond de projets actifs ──────────────────────────────────────────
do $$
declare v_actifs int;
begin
  -- A n'a plus aucun projet actif : le sien est archivé (P8), et « Vid » (P7)
  -- a été annulé avec le bloc d'exception qui l'a créé. Plafond fixé à 1.
  update zabelie_authoring_config set projets_actifs_max = 1 where id;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1401', true);
  set local role authenticated;
  perform zabelie_authoring_creer_projet('Dezyem', 'fr', 'diaspora', 'Montreal');
  begin
    perform zabelie_authoring_creer_projet('Twazyem', 'fr', 'haiti', '');
    raise exception 'P9 KO : plafond de projets actifs depasse';
  exception when raise_exception then
    if sqlerrm <> 'authoring_projets_max' then raise; end if;
  end;
  select count(*) into v_actifs from zabelie_authoring_projects where archived_at is null;
  reset role;
  assert v_actifs = 1, format('P9 KO : %s projets actifs', v_actifs);
  raise notice 'P9 OK — plafond lu en base';
end $$;

-- ── P10. Vendeur suspendu ──────────────────────────────────────────────────
do $$
begin
  update profiles set suspended_at = now() where id = '00000000-0000-0000-0000-0000000a1402';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1402', true);
  begin
    set local role authenticated;
    perform zabelie_authoring_creer_projet('Suspendu', 'fr', 'haiti', '');
    raise exception 'P10 KO : un vendeur suspendu cree un projet';
  exception when insufficient_privilege then null;
  end;
  reset role;
  update profiles set suspended_at = null where id = '00000000-0000-0000-0000-0000000a1402';
  raise notice 'P10 OK — suspendu refuse';
end $$;

-- ── P11. Config absente : fail-closed ──────────────────────────────────────
do $$
declare v_refus int := 0;
begin
  delete from zabelie_authoring_config;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1402', true);
  begin
    set local role authenticated;
    perform zabelie_authoring_creer_projet('Sans config', 'fr', 'haiti', '');
    raise exception 'P11 KO : creation sans config';
  exception when raise_exception then
    if sqlerrm <> 'authoring_config_absente' then raise; end if;
    v_refus := v_refus + 1;
  end;
  reset role;
  assert v_refus = 1, 'P11 KO';
  raise notice 'P11 OK — config absente, tout est refuse';
end $$;

rollback;
