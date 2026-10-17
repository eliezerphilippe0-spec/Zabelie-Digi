-- Studio de création éditoriale — approbation d'une révision exacte (0146 ; tâche 4.2).
-- Transaction annulée. Rôles réels ; chaque refus attendu est un connu-négatif,
-- chaque acceptation un connu-positif.
--
--   AP1  A approuve la révision courante, responsabilité confirmée : inscrite, révision inchangée ;
--   AP2  une écriture après approbation avance la révision : l'approbation ne vaut plus ;
--        une nouvelle approbation porte sur la nouvelle révision ;
--   AP3  responsabilité absente, fausse ou nulle : refus ;
--   AP4  révision périmée ou nulle : refus ;
--   AP5  plan jamais approuvé : refus ;
--   AP6  guide sans section, titre vide, texte vide : refus ;
--   AP7  marqueur de simulation resté dans le texte (ht ou fr) : refus ;
--   AP8  le vendeur B n'approuve pas le projet de A ; anon n'exécute rien ;
--   AP9  A ne forge pas son approbation ; une création ne naît jamais approuvée ;
--   AP10 projet archivé : refus ;
--   AP11 vendeur suspendu : refus ;
--   AP12 approbation et date vont ensemble (contrainte).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a1601', 'approbation-a@test.local'),
  ('00000000-0000-0000-0000-0000000a1602', 'approbation-b@test.local')
  on conflict do nothing;
delete from profiles where id in ('00000000-0000-0000-0000-0000000a1601', '00000000-0000-0000-0000-0000000a1602');
insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-0000000a1601', 'creator', 'Auteur approbation A'),
  ('00000000-0000-0000-0000-0000000a1602', 'creator', 'Auteur approbation B');

-- G1 : guide complet de A, plan approuvé. G2 : guide de A, plan jamais approuvé.
insert into zabelie_authoring_projects (id, seller_id, titre, langue, public_vise) values
  ('00000000-0000-0000-0000-0000000a16f1', '00000000-0000-0000-0000-0000000a1601', 'Gid konplè', 'ht', 'haiti'),
  ('00000000-0000-0000-0000-0000000a16f2', '00000000-0000-0000-0000-0000000a1601', 'Gid san plan', 'ht', 'haiti');
update zabelie_authoring_projects
   set contenu = '{"objectif": "Lanse", "sections": [{"id": "00000000-0000-4000-8000-0000000000e1", "titre": "Kòmanse", "resultat": "", "corps": "Premye tèks."}, {"id": "00000000-0000-4000-8000-0000000000e2", "titre": "Kontinye", "resultat": "", "corps": "Dezyèm tèks."}]}'
 where id in ('00000000-0000-0000-0000-0000000a16f1', '00000000-0000-0000-0000-0000000a16f2');
update zabelie_authoring_projects set plan_approuve_revision = revision where id = '00000000-0000-0000-0000-0000000a16f1';

-- Rejoue une approbation sous la session de A et rend le code d'erreur, ou 'ok'.
create function pg_temp.approuver_comme(p_qui uuid, p_projet uuid, p_revision integer, p_resp boolean)
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_qui::text, ''), true);
  if p_qui is null then set local role anon; else set local role authenticated; end if;
  perform zabelie_authoring_approuver_revision(p_projet, p_revision, p_resp);
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end;
$$;

-- ── AP1. Approbation de la révision courante ───────────────────────────────
do $$
declare v_g uuid := '00000000-0000-0000-0000-0000000a16f1'; v_rev int; v_ok int; p zabelie_authoring_projects%rowtype;
begin
  select revision into v_rev from zabelie_authoring_projects where id = v_g;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1601', true);
  set local role authenticated;
  v_ok := zabelie_authoring_approuver_revision(v_g, v_rev, true);
  select * into p from zabelie_authoring_projects where id = v_g;
  reset role;
  assert v_ok = v_rev, 'AP1 KO : revision rendue';
  assert p.revision_approuvee = v_rev and p.revision_approuvee_le is not null, 'AP1 KO : approbation non inscrite ou illisible';
  assert p.revision = v_rev, 'AP1 KO : approuver a change la revision';
  raise notice 'AP1 OK — revision % approuvee, lisible par A, revision inchangee', v_rev;
end $$;

-- ── AP2. Une écriture après approbation la périme ──────────────────────────
do $$
declare v_g uuid := '00000000-0000-0000-0000-0000000a16f1'; v_avant int; p zabelie_authoring_projects%rowtype; v_r text;
begin
  select revision into v_avant from zabelie_authoring_projects where id = v_g;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1601', true);
  set local role authenticated;
  update zabelie_authoring_projects set titre = 'Gid konplè, vèsyon 2' where id = v_g;
  select * into p from zabelie_authoring_projects where id = v_g;
  reset role;
  assert p.revision = v_avant + 1, 'AP2 KO : la revision n''a pas avance';
  assert p.revision_approuvee = v_avant, 'AP2 KO : l''ancienne approbation a ete deplacee';
  assert p.revision_approuvee <> p.revision, 'AP2 KO : le guide modifie passe pour approuve';
  -- L'ancienne révision ne se réapprouve pas ; la nouvelle, si.
  v_r := pg_temp.approuver_comme('00000000-0000-0000-0000-0000000a1601', v_g, v_avant, true);
  assert v_r like '40001 authoring_revision_perimee', 'AP2 KO : ancienne revision reapprouvee — ' || v_r;
  v_r := pg_temp.approuver_comme('00000000-0000-0000-0000-0000000a1601', v_g, v_avant + 1, true);
  assert v_r = 'ok', 'AP2 KO : nouvelle approbation refusee — ' || v_r;
  assert (select revision_approuvee from zabelie_authoring_projects where id = v_g) = v_avant + 1, 'AP2 KO : nouvelle approbation non inscrite';
  raise notice 'AP2 OK — modifier perime l''approbation ; la nouvelle revision s''approuve';
end $$;

-- ── AP3 à AP7. Refus, chacun avec son code ─────────────────────────────────
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000a1601';
  v_g uuid := '00000000-0000-0000-0000-0000000a16f1';
  v_rev int := (select revision from zabelie_authoring_projects where id = '00000000-0000-0000-0000-0000000a16f1');
  v_plan int := (select revision from zabelie_authoring_projects where id = '00000000-0000-0000-0000-0000000a16f2');
  v_cas text[];
  v_r text;
  v_contenu jsonb;
  v_n int := 0;
begin
  -- AP3 : responsabilité.
  foreach v_r in array array[
    pg_temp.approuver_comme(a, v_g, v_rev, false),
    pg_temp.approuver_comme(a, v_g, v_rev, null)
  ] loop
    assert v_r = '22023 authoring_responsabilite_requise', 'AP3 KO — ' || v_r;
    v_n := v_n + 1;
  end loop;
  -- AP4 : révision périmée, future ou nulle.
  foreach v_r in array array[
    pg_temp.approuver_comme(a, v_g, v_rev - 1, true),
    pg_temp.approuver_comme(a, v_g, v_rev + 1, true),
    pg_temp.approuver_comme(a, v_g, null, true)
  ] loop
    assert v_r = '40001 authoring_revision_perimee', 'AP4 KO — ' || v_r;
    v_n := v_n + 1;
  end loop;
  -- AP5 : plan jamais approuvé.
  v_r := pg_temp.approuver_comme(a, '00000000-0000-0000-0000-0000000a16f2', v_plan, true);
  assert v_r = 'P0001 authoring_guide_sans_plan', 'AP5 KO — ' || v_r;
  v_n := v_n + 1;

  -- AP6 et AP7 : chaque contenu fautif, écrit par A, puis soumis à l'approbation.
  foreach v_cas slice 1 in array array[
    array['{"objectif": "x", "sections": []}', 'authoring_guide_incomplet'],
    array['{"objectif": "x", "sections": [{"id": "00000000-0000-4000-8000-0000000000e1", "titre": "  ", "resultat": "", "corps": "Tèks."}]}', 'authoring_guide_incomplet'],
    array['{"objectif": "x", "sections": [{"id": "00000000-0000-4000-8000-0000000000e1", "titre": "Kòmanse", "resultat": "", "corps": " "}]}', 'authoring_guide_incomplet'],
    array['{"objectif": "x", "sections": [{"id": "00000000-0000-4000-8000-0000000000e1", "titre": "Kòmanse", "resultat": "", "corps": "Tèks."}, {"id": "00000000-0000-4000-8000-0000000000e2", "titre": "Kontinye"}]}', 'authoring_guide_incomplet'],
    array['{"objectif": "x", "sections": [{"id": "00000000-0000-4000-8000-0000000000e1", "titre": "Kòmanse", "resultat": "", "corps": "[SIMULASYON] Bouyon."}]}', 'authoring_marqueur_simulation'],
    array['{"objectif": "[SIMULATION] x", "sections": [{"id": "00000000-0000-4000-8000-0000000000e1", "titre": "Kòmanse", "resultat": "", "corps": "Tèks."}]}', 'authoring_marqueur_simulation']
  ] loop
    v_contenu := v_cas[1]::jsonb;
    perform set_config('request.jwt.claim.sub', a::text, true);
    set local role authenticated;
    update zabelie_authoring_projects set contenu = v_contenu where id = v_g;
    reset role;
    v_rev := (select revision from zabelie_authoring_projects where id = v_g);
    v_r := pg_temp.approuver_comme(a, v_g, v_rev, true);
    assert v_r = 'P0001 ' || v_cas[2], format('AP6/AP7 KO — %s : %s', v_cas[1], v_r);
    v_n := v_n + 1;
  end loop;
  assert v_n = 12, format('AP3-AP7 KO : %s refus sur 12', v_n);
  -- Aucun de ces refus n'a laissé d'approbation sur une révision courante.
  assert (select revision_approuvee <> revision from zabelie_authoring_projects where id = v_g), 'AP3-AP7 KO : un refus a approuve';
  raise notice 'AP3-AP7 OK — responsabilite, revision, plan, guide incomplet, simulation : 12 refus';
end $$;

-- ── AP8. Autre vendeur, anon ───────────────────────────────────────────────
do $$
declare v_g uuid := '00000000-0000-0000-0000-0000000a16f1'; v_rev int; v_r text;
begin
  -- Rend le guide de nouveau approuvable, pour que seul l'appelant soit en cause.
  update zabelie_authoring_projects
     set contenu = '{"objectif": "Lanse", "sections": [{"id": "00000000-0000-4000-8000-0000000000e1", "titre": "Kòmanse", "resultat": "", "corps": "Premye tèks."}]}'
   where id = v_g;
  v_rev := (select revision from zabelie_authoring_projects where id = v_g);
  v_r := pg_temp.approuver_comme('00000000-0000-0000-0000-0000000a1602', v_g, v_rev, true);
  assert v_r = '42501 authoring_projet_introuvable', 'AP8 KO : B approuve le guide de A — ' || v_r;
  v_r := pg_temp.approuver_comme(null, v_g, v_rev, true);
  assert v_r like '42501 %', 'AP8 KO : anon execute l''approbation — ' || v_r;
  assert (select revision_approuvee <> revision from zabelie_authoring_projects where id = v_g), 'AP8 KO : approuve par un tiers';
  raise notice 'AP8 OK — B et anon refuses';
end $$;

-- ── AP9. Forgeries ─────────────────────────────────────────────────────────
do $$
declare v_g uuid := '00000000-0000-0000-0000-0000000a16f1'; v_refus int := 0; v_sql text; v_neuf zabelie_authoring_projects%rowtype;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1601', true);
  foreach v_sql in array array[
    format('update zabelie_authoring_projects set revision_approuvee = revision where id = %L', v_g),
    format('update zabelie_authoring_projects set revision_approuvee_le = now() where id = %L', v_g),
    format('update zabelie_authoring_projects set revision_approuvee = revision, revision_approuvee_le = now() where id = %L', v_g)
  ] loop
    begin
      set local role authenticated;
      execute v_sql;
      raise exception 'AP9 KO : accepte — %', v_sql;
    exception when insufficient_privilege then v_refus := v_refus + 1;
    end;
  end loop;
  reset role;
  assert v_refus = 3, format('AP9 KO : %s refus sur 3', v_refus);
  -- Même une insertion directe (propriétaire de la base) ne naît pas approuvée.
  insert into zabelie_authoring_projects (seller_id, titre, langue, public_vise, revision_approuvee, revision_approuvee_le)
  values ('00000000-0000-0000-0000-0000000a1601', 'Forje', 'fr', 'haiti', 1, now())
  returning * into v_neuf;
  assert v_neuf.revision_approuvee is null and v_neuf.revision_approuvee_le is null, 'AP9 KO : une creation nait approuvee';
  raise notice 'AP9 OK — trois forgeries refusees, creation jamais approuvee';
end $$;

-- ── AP10. Projet archivé ───────────────────────────────────────────────────
do $$
declare v_g uuid := '00000000-0000-0000-0000-0000000a16f1'; v_rev int := (select revision from zabelie_authoring_projects where id = '00000000-0000-0000-0000-0000000a16f1'); v_r text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1601', true);
  set local role authenticated;
  perform zabelie_authoring_archiver(v_g);
  reset role;
  v_r := pg_temp.approuver_comme('00000000-0000-0000-0000-0000000a1601', v_g, v_rev, true);
  assert v_r = 'P0001 authoring_projet_archive', 'AP10 KO — ' || v_r;
  update zabelie_authoring_projects set archived_at = null where id = v_g;
  raise notice 'AP10 OK — archive refuse';
end $$;

-- ── AP11. Vendeur suspendu ─────────────────────────────────────────────────
do $$
declare v_g uuid := '00000000-0000-0000-0000-0000000a16f1'; v_rev int := (select revision from zabelie_authoring_projects where id = '00000000-0000-0000-0000-0000000a16f1'); v_r text;
begin
  update profiles set suspended_at = now() where id = '00000000-0000-0000-0000-0000000a1601';
  v_r := pg_temp.approuver_comme('00000000-0000-0000-0000-0000000a1601', v_g, v_rev, true);
  assert v_r = '42501 authoring_compte_inactif', 'AP11 KO — ' || v_r;
  update profiles set suspended_at = null where id = '00000000-0000-0000-0000-0000000a1601';
  -- Témoin : levée la suspension, la même approbation passe.
  v_r := pg_temp.approuver_comme('00000000-0000-0000-0000-0000000a1601', v_g, v_rev, true);
  assert v_r = 'ok', 'AP11 KO : temoin refuse — ' || v_r;
  raise notice 'AP11 OK — suspendu refuse, temoin accepte';
end $$;

-- ── AP12. Approbation et date ensemble ─────────────────────────────────────
do $$
declare v_g uuid := '00000000-0000-0000-0000-0000000a16f1';
begin
  begin
    update zabelie_authoring_projects set revision_approuvee_le = null where id = v_g;
    raise exception 'AP12 KO : approbation sans date acceptee';
  exception when check_violation then null;
  end;
  begin
    update zabelie_authoring_projects set revision_approuvee = null where id = v_g;
    raise exception 'AP12 KO : date sans approbation acceptee';
  exception when check_violation then null;
  end;
  raise notice 'AP12 OK — contrainte d''ensemble';
end $$;

rollback;
