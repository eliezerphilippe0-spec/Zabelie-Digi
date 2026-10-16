-- Studio de création éditoriale — opérations d'IA (0142 ; docs/70, tâche 3.1).
-- Transaction annulée. Rôles réels ; chaque refus attendu est un connu-négatif.
--
--   O1  une demande crée une opération en attente et un instantané de la révision courante ;
--   O2  même clé, même entrée : la même opération, rien de plus (T06) ;
--   O3  même clé après modification du projet : conflit (T07) ; l'instantané reste figé (T29) ;
--   O4  section avant approbation du plan, section inconnue, demande mal formée : refusées ;
--   O5  le vendeur B ne voit ni ne demande rien sur le projet de A (T01) ;
--   O6  anon ne lit ni n'exécute rien ;
--   O7  A ne forge ni état, ni résultat, ni jeton, ni instantané, ni liste pilote (T31) ;
--   O8  bail : un second exécuteur n'entre pas, un ancien jeton n'écrit rien (T10) ;
--   O9  une opération terminée ne se réécrit pas, même par le propriétaire de la base ;
--   O10 bail expiré APRÈS l'envoi : `uncertain`, aucune reprise (T09) ;
--   O11 bail expiré AVANT l'envoi : reprise avec un nouveau jeton, l'ancien est mort ;
--   O12 vendeur suspendu entre la demande et l'envoi : rien ne part, quota rendu (T30) ;
--   O13 hors liste pilote : rien ne part ;
--   O14 quota vendeur, rendu par l'annulation d'une demande non partie ;
--   O15 opérations simultanées plafonnées ; une opération en cours ne s'annule pas ;
--   O16 quota de la plateforme ;
--   O17 une transition interdite est refusée par la base ;
--   O18 le compteur du vendeur suit la règle de la base, sous sa propre RLS.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a1501', 'ia-a@test.local'),
  ('00000000-0000-0000-0000-0000000a1502', 'ia-b@test.local')
  on conflict do nothing;
delete from profiles where id in ('00000000-0000-0000-0000-0000000a1501', '00000000-0000-0000-0000-0000000a1502');
insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-0000000a1501', 'creator', 'Auteur IA A'),
  ('00000000-0000-0000-0000-0000000a1502', 'creator', 'Auteur IA B');

-- P1 : projet de A, une section, plan approuvé. P2 : projet de A sans plan approuvé. PB : projet de B.
insert into zabelie_authoring_projects (id, seller_id, titre, langue, public_vise) values
  ('00000000-0000-0000-0000-0000000a15f1', '00000000-0000-0000-0000-0000000a1501', 'Gid IA', 'ht', 'haiti'),
  ('00000000-0000-0000-0000-0000000a15f2', '00000000-0000-0000-0000-0000000a1501', 'Gid san plan', 'ht', 'haiti'),
  ('00000000-0000-0000-0000-0000000a15fb', '00000000-0000-0000-0000-0000000a1502', 'Gid B', 'fr', 'haiti');
update zabelie_authoring_projects
   set contenu = '{"objectif": "", "sections": [{"id": "00000000-0000-4000-8000-0000000000d1", "titre": "Kòmanse", "resultat": "", "corps": "Tèks"}]}'
 where id in ('00000000-0000-0000-0000-0000000a15f1', '00000000-0000-0000-0000-0000000a15f2');
update zabelie_authoring_projects set plan_approuve_revision = revision where id = '00000000-0000-0000-0000-0000000a15f1';
insert into zabelie_authoring_pilotes (seller_id) values ('00000000-0000-0000-0000-0000000a1501');
update zabelie_authoring_config set suggestions_vendeur_jour = 50, suggestions_global_jour = 500, operations_simultanees = 5 where id;

create temporary table t_op (cle text primary key, id uuid) on commit drop;
grant all on t_op to authenticated, anon, service_role;

-- Demande sous la session de A ; rend l'identifiant de l'opération.
create function pg_temp.demander(p_vendeur uuid, p_projet uuid, p_type text, p_section uuid, p_cle uuid) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  perform set_config('request.jwt.claim.sub', p_vendeur::text, true);
  set local role authenticated;
  select id into v_id from zabelie_authoring_demander(p_projet, p_type, p_section, p_cle);
  reset role;
  return v_id;
end $$;
grant execute on function pg_temp.demander(uuid, uuid, text, uuid, uuid) to authenticated;

-- ── O1, O2. Demande et rejeu ───────────────────────────────────────────────
do $$
declare v_a uuid := '00000000-0000-0000-0000-0000000a1501'; v1 uuid; v2 uuid; o zabelie_authoring_operations%rowtype; v_num int;
begin
  v1 := pg_temp.demander(v_a, '00000000-0000-0000-0000-0000000a15f1', 'plan', null, '00000000-0000-4000-9000-000000000001');
  select * into o from zabelie_authoring_operations where id = v1;
  assert o.etat = 'queued' and o.soumis_le is null and o.empreinte ~ '^[0-9a-f]{64}$', 'O1 KO : operation mal formee';
  select numero into v_num from zabelie_authoring_revisions where id = o.revision_id;
  assert v_num = (select revision from zabelie_authoring_projects where id = '00000000-0000-0000-0000-0000000a15f1'), 'O1 KO : instantane d''une autre revision';
  v2 := pg_temp.demander(v_a, '00000000-0000-0000-0000-0000000a15f1', 'plan', null, '00000000-0000-4000-9000-000000000001');
  assert v1 = v2, 'O2 KO : le rejeu a cree une seconde operation';
  assert (select count(*) from zabelie_authoring_operations where seller_id = v_a) = 1, 'O2 KO : compte';
  insert into t_op values ('op1', v1);
  raise notice 'O1/O2 OK — demande en attente, instantane, rejeu identique';
end $$;

-- ── O3. Clé rejouée sur une autre entrée ; instantané figé ─────────────────
do $$
declare v_a uuid := '00000000-0000-0000-0000-0000000a1501'; v_titre text; v_ok boolean := false;
begin
  update zabelie_authoring_projects set titre = 'Gid IA chanje' where id = '00000000-0000-0000-0000-0000000a15f1';
  begin
    perform pg_temp.demander(v_a, '00000000-0000-0000-0000-0000000a15f1', 'plan', null, '00000000-0000-4000-9000-000000000001');
  exception when raise_exception then
    if sqlerrm <> 'authoring_cle_conflit' then raise; end if;
    v_ok := true;
  end;
  assert v_ok, 'O3 KO : meme cle, autre entree, acceptee';
  select r.titre into v_titre from zabelie_authoring_revisions r join zabelie_authoring_operations o on o.revision_id = r.id
   where o.id = (select id from t_op where cle = 'op1');
  assert v_titre = 'Gid IA', format('O3 KO : l''instantane a suivi le document (%s)', v_titre);
  begin
    update zabelie_authoring_revisions set titre = 'triche';
    raise exception 'O3 KO : instantane modifiable';
  exception when insufficient_privilege then null;
  end;
  raise notice 'O3 OK — conflit de cle, instantane fige et immuable';
end $$;

-- ── O4. Demandes refusées avant toute inscription ──────────────────────────
do $$
declare v_a uuid := '00000000-0000-0000-0000-0000000a1501'; v_refus int := 0; v_avant int;
begin
  select count(*) into v_avant from zabelie_authoring_operations;
  begin
    perform pg_temp.demander(v_a, '00000000-0000-0000-0000-0000000a15f2', 'draft', '00000000-0000-4000-8000-0000000000d1', gen_random_uuid());
  exception when raise_exception then
    if sqlerrm <> 'authoring_plan_non_approuve' then raise; end if; v_refus := v_refus + 1;
  end;
  begin
    perform pg_temp.demander(v_a, '00000000-0000-0000-0000-0000000a15f1', 'draft', '00000000-0000-4000-8000-0000000000ff', gen_random_uuid());
  exception when raise_exception then
    if sqlerrm <> 'authoring_section_introuvable' then raise; end if; v_refus := v_refus + 1;
  end;
  begin
    perform pg_temp.demander(v_a, '00000000-0000-0000-0000-0000000a15f1', 'plan', '00000000-0000-4000-8000-0000000000d1', gen_random_uuid());
  exception when invalid_parameter_value then v_refus := v_refus + 1;
  end;
  assert v_refus = 3, format('O4 KO : %s refus sur 3', v_refus);
  assert (select count(*) from zabelie_authoring_operations) = v_avant, 'O4 KO : une demande refusee a laisse une ligne';
  raise notice 'O4 OK — plan non approuve, section inconnue, demande mal formee';
end $$;

-- ── O5. Isolation (T01) ────────────────────────────────────────────────────
do $$
declare v_n int; v_ok boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1502', true);
  set local role authenticated;
  select count(*) into v_n from zabelie_authoring_operations;
  assert v_n = 0, 'O5 KO : B voit les operations de A';
  select count(*) into v_n from zabelie_authoring_revisions;
  assert v_n = 0, 'O5 KO : B voit les instantanes de A';
  begin
    perform zabelie_authoring_demander('00000000-0000-0000-0000-0000000a15f1', 'plan', null, gen_random_uuid());
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  assert v_ok, 'O5 KO : B demande sur le projet de A';
  raise notice 'O5 OK — B ne voit ni ne demande rien chez A';
end $$;

-- ── O6. anon ───────────────────────────────────────────────────────────────
do $$
declare v_refus int := 0;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    set local role anon;
    perform count(*) from zabelie_authoring_operations;
  exception when insufficient_privilege then v_refus := v_refus + 1;
  end;
  begin
    set local role anon;
    perform zabelie_authoring_demander('00000000-0000-0000-0000-0000000a15f1', 'plan', null, gen_random_uuid());
  exception when insufficient_privilege then v_refus := v_refus + 1;
  end;
  reset role;
  assert v_refus = 2, 'O6 KO';
  raise notice 'O6 OK — anon ne lit ni n''execute rien';
end $$;

-- ── O7. Forgeries refusées au vendeur (T31) ────────────────────────────────
do $$
declare v_op uuid := (select id from t_op where cle = 'op1'); v_sql text; v_refus int := 0;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1501', true);
  foreach v_sql in array array[
    format('update zabelie_authoring_operations set etat = ''succeeded'' where id = %L', v_op),
    format('update zabelie_authoring_operations set resultat = ''{}'' where id = %L', v_op),
    format('delete from zabelie_authoring_operations where id = %L', v_op),
    'insert into zabelie_authoring_operations (seller_id, project_id, revision_id, type, idempotency_key, empreinte) select seller_id, project_id, revision_id, type, gen_random_uuid(), empreinte from zabelie_authoring_operations limit 1',
    format('select bail_jeton from zabelie_authoring_operations where id = %L', v_op),
    format('select zabelie_authoring_prendre_bail(%L, gen_random_uuid())', v_op),
    format('select zabelie_authoring_marquer_soumis(%L, gen_random_uuid(), ''mock'')', v_op),
    format('select zabelie_authoring_conclure(%L, gen_random_uuid(), ''succeeded'', ''{}'', null, 0, 0)', v_op),
    'update zabelie_authoring_revisions set titre = ''triche''',
    'insert into zabelie_authoring_pilotes (seller_id) values (auth.uid())',
    'update zabelie_authoring_config set suggestions_vendeur_jour = 200'
  ] loop
    begin
      set local role authenticated;
      execute v_sql;
      raise exception 'O7 KO : accepte — %', v_sql;
    exception when insufficient_privilege then v_refus := v_refus + 1;
    end;
  end loop;
  reset role;
  assert v_refus = 11, format('O7 KO : %s refus sur 11', v_refus);
  raise notice 'O7 OK — onze forgeries refusees';
end $$;

-- ── O8, O9. Bail, ancien jeton, opération terminée ─────────────────────────
do $$
declare v_op uuid := (select id from t_op where cle = 'op1'); v_n int; o zabelie_authoring_operations%rowtype;
  j1 uuid := gen_random_uuid(); j2 uuid := gen_random_uuid();
begin
  set local role service_role;
  select count(*) into v_n from zabelie_authoring_prendre_bail(v_op, j1);
  assert v_n = 1, 'O8 KO : bail non pris';
  select count(*) into v_n from zabelie_authoring_prendre_bail(v_op, j2);
  assert v_n = 0, 'O8 KO : un second executeur a pris un bail valide';
  assert not zabelie_authoring_marquer_soumis(v_op, j2, 'mock'), 'O8 KO : un jeton etranger soumet';
  assert zabelie_authoring_marquer_soumis(v_op, j1, 'mock'), 'O8 KO : le bon jeton ne soumet pas';
  assert not zabelie_authoring_conclure(v_op, j2, 'succeeded', '{"texte": "x"}', null, 1, 1), 'O8 KO : un ancien jeton conclut';
  assert zabelie_authoring_conclure(v_op, j1, 'succeeded', '{"texte": "Bouyon"}', null, 10, 20), 'O8 KO : le bon jeton ne conclut pas';
  reset role;
  select * into o from zabelie_authoring_operations where id = v_op;
  assert o.etat = 'succeeded' and o.bail_jeton is null and o.termine_le is not null and o.soumis_le is not null, 'O8 KO : etat final';
  assert not exists (select 1 from zabelie_authoring_operations where id = v_op and resultat ->> 'texte' <> 'Bouyon'), 'O8 KO : resultat';
  begin
    update zabelie_authoring_operations set etat = 'running', bail_jeton = gen_random_uuid(), bail_expire = now() where id = v_op;
    raise exception 'O9 KO : une operation terminee repart';
  exception when insufficient_privilege then
    if sqlerrm <> 'authoring_operation_terminee' then raise; end if;
  end;
  raise notice 'O8/O9 OK — bail unique, ancien jeton sans effet, operation terminee figee';
end $$;

-- ── O10. Bail expiré après l'envoi : incertain ─────────────────────────────
do $$
declare v_a uuid := '00000000-0000-0000-0000-0000000a1501'; v_op uuid; v_n int; j uuid := gen_random_uuid();
begin
  v_op := pg_temp.demander(v_a, '00000000-0000-0000-0000-0000000a15f1', 'draft', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-9000-000000000002');
  insert into t_op values ('op2', v_op);
  set local role service_role;
  perform zabelie_authoring_prendre_bail(v_op, j);
  assert zabelie_authoring_marquer_soumis(v_op, j, 'mock'), 'O10 KO : soumission';
  reset role;
  update zabelie_authoring_operations set bail_expire = now() - interval '1 minute' where id = v_op;
  set local role service_role;
  select count(*) into v_n from zabelie_authoring_prendre_bail(v_op, gen_random_uuid());
  reset role;
  assert v_n = 0, 'O10 KO : un bail expire apres envoi a rendu la main';
  assert (select etat || '/' || code_erreur from zabelie_authoring_operations where id = v_op) = 'uncertain/delai_depasse', 'O10 KO : pas incertaine';
  raise notice 'O10 OK — expire apres envoi : incertaine, jamais reprise';
end $$;

-- ── O11. Bail expiré avant l'envoi : reprise, l'ancien jeton est mort ──────
do $$
declare v_a uuid := '00000000-0000-0000-0000-0000000a1501'; v_op uuid; v_n int; j5 uuid := gen_random_uuid(); j6 uuid := gen_random_uuid();
begin
  v_op := pg_temp.demander(v_a, '00000000-0000-0000-0000-0000000a15f1', 'rewrite', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-9000-000000000003');
  set local role service_role;
  perform zabelie_authoring_prendre_bail(v_op, j5);
  reset role;
  update zabelie_authoring_operations set bail_expire = now() - interval '1 minute' where id = v_op;
  set local role service_role;
  select count(*) into v_n from zabelie_authoring_prendre_bail(v_op, j6);
  assert v_n = 1, 'O11 KO : pas de reprise d''un bail expire avant envoi';
  assert not zabelie_authoring_marquer_soumis(v_op, j5, 'mock'), 'O11 KO : l''ancien jeton soumet encore';
  assert zabelie_authoring_marquer_soumis(v_op, j6, 'mock'), 'O11 KO : le nouveau jeton ne soumet pas';
  assert zabelie_authoring_conclure(v_op, j6, 'failed', null, 'fournisseur_refus', null, null), 'O11 KO : echec apres envoi';
  reset role;
  assert (select tentatives from zabelie_authoring_operations where id = v_op) = 2, 'O11 KO : tentatives';
  raise notice 'O11 OK — reprise avant envoi, ancien jeton mort';
end $$;

-- ── O12. Suspendu entre la demande et l'envoi (T30) ────────────────────────
do $$
declare v_a uuid := '00000000-0000-0000-0000-0000000a1501'; v_op uuid; j uuid := gen_random_uuid();
begin
  v_op := pg_temp.demander(v_a, '00000000-0000-0000-0000-0000000a15f1', 'exercise', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-9000-000000000004');
  update profiles set suspended_at = now() where id = v_a;
  set local role service_role;
  perform zabelie_authoring_prendre_bail(v_op, j);
  assert not zabelie_authoring_marquer_soumis(v_op, j, 'mock'), 'O12 KO : un vendeur suspendu a soumis';
  reset role;
  update profiles set suspended_at = null where id = v_a;
  assert (select etat || '/' || code_erreur || '/' || (soumis_le is null)::text from zabelie_authoring_operations where id = v_op)
       = 'cancelled/compte_inactif/true', 'O12 KO : etat';
  raise notice 'O12 OK — suspendu : rien ne part, quota rendu';
end $$;

-- ── O13. Hors liste pilote ─────────────────────────────────────────────────
do $$
declare v_a uuid := '00000000-0000-0000-0000-0000000a1501'; v_op uuid; j uuid := gen_random_uuid();
begin
  delete from zabelie_authoring_pilotes where seller_id = v_a;
  v_op := pg_temp.demander(v_a, '00000000-0000-0000-0000-0000000a15f1', 'plan', null, '00000000-0000-4000-9000-000000000005');
  set local role service_role;
  perform zabelie_authoring_prendre_bail(v_op, j);
  assert not zabelie_authoring_marquer_soumis(v_op, j, 'mock'), 'O13 KO : hors pilote, soumis quand meme';
  reset role;
  assert (select code_erreur from zabelie_authoring_operations where id = v_op) = 'hors_pilote', 'O13 KO : code';
  insert into zabelie_authoring_pilotes (seller_id) values (v_a);
  raise notice 'O13 OK — hors liste pilote : rien ne part';
end $$;

-- ── O14. Quota du vendeur, rendu par une annulation ────────────────────────
do $$
declare v_a uuid := '00000000-0000-0000-0000-0000000a1501'; v_consomme int; v_op uuid; v_ok boolean := false;
begin
  -- Consommées : op1 (succès), op2 (incertaine), O11 (échec après envoi) = 3. O12 et O13 ont rendu les leurs.
  select count(*) into v_consomme from zabelie_authoring_operations
   where seller_id = v_a and not (etat in ('cancelled', 'failed') and soumis_le is null);
  assert v_consomme = 3, format('O14 KO : %s consommees au lieu de 3', v_consomme);
  update zabelie_authoring_config set suggestions_vendeur_jour = 4 where id;
  v_op := pg_temp.demander(v_a, '00000000-0000-0000-0000-0000000a15f1', 'plan', null, '00000000-0000-4000-9000-000000000006');
  begin
    perform pg_temp.demander(v_a, '00000000-0000-0000-0000-0000000a15f1', 'plan', null, '00000000-0000-4000-9000-000000000007');
  exception when raise_exception then
    if sqlerrm <> 'authoring_quota_vendeur' then raise; end if; v_ok := true;
  end;
  assert v_ok, 'O14 KO : quota du vendeur depasse';
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  set local role authenticated;
  assert zabelie_authoring_annuler(v_op) = 'cancelled', 'O14 KO : annulation';
  reset role;
  v_op := pg_temp.demander(v_a, '00000000-0000-0000-0000-0000000a15f1', 'plan', null, '00000000-0000-4000-9000-000000000007');
  assert v_op is not null, 'O14 KO : le quota rendu n''a pas servi';
  insert into t_op values ('op7', v_op);
  raise notice 'O14 OK — quota vendeur, rendu par annulation avant envoi';
end $$;

-- ── O15. Opérations simultanées ; une opération en cours ne s'annule pas ───
do $$
declare v_a uuid := '00000000-0000-0000-0000-0000000a1501'; v_op uuid := (select id from t_op where cle = 'op7'); v_ok int := 0;
begin
  update zabelie_authoring_config set suggestions_vendeur_jour = 50, operations_simultanees = 1 where id;
  begin
    perform pg_temp.demander(v_a, '00000000-0000-0000-0000-0000000a15f1', 'plan', null, gen_random_uuid());
  exception when raise_exception then
    if sqlerrm <> 'authoring_operations_en_cours' then raise; end if; v_ok := v_ok + 1;
  end;
  set local role service_role;
  perform zabelie_authoring_prendre_bail(v_op, gen_random_uuid());
  reset role;
  begin
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    set local role authenticated;
    perform zabelie_authoring_annuler(v_op);
  exception when raise_exception then
    if sqlerrm <> 'authoring_operation_non_annulable' then raise; end if; v_ok := v_ok + 1;
  end;
  reset role;
  assert v_ok = 2, 'O15 KO';
  raise notice 'O15 OK — simultanees plafonnees, operation en cours non annulable';
end $$;

-- ── O16. Quota de la plateforme ────────────────────────────────────────────
do $$
declare v_total int; v_ok boolean := false;
begin
  select count(*) into v_total from zabelie_authoring_operations where not (etat in ('cancelled', 'failed') and soumis_le is null);
  update zabelie_authoring_config set suggestions_global_jour = v_total, operations_simultanees = 5 where id;
  begin
    perform pg_temp.demander('00000000-0000-0000-0000-0000000a1502', '00000000-0000-0000-0000-0000000a15fb', 'plan', null, gen_random_uuid());
  exception when raise_exception then
    if sqlerrm <> 'authoring_quota_global' then raise; end if; v_ok := true;
  end;
  assert v_ok, 'O16 KO : quota de la plateforme depasse';
  raise notice 'O16 OK — quota de la plateforme';
end $$;

-- ── O17. Transition interdite ──────────────────────────────────────────────
do $$
declare v_op uuid;
begin
  update zabelie_authoring_config set suggestions_global_jour = 500 where id;
  v_op := pg_temp.demander('00000000-0000-0000-0000-0000000a1502', '00000000-0000-0000-0000-0000000a15fb', 'plan', null, gen_random_uuid());
  begin
    update zabelie_authoring_operations set etat = 'succeeded', soumis_le = now(), resultat = '{}' where id = v_op;
    raise exception 'O17 KO : en attente vers succes accepte';
  exception when check_violation then
    if sqlerrm <> 'authoring_transition_interdite' then raise; end if;
  end;
  raise notice 'O17 OK — transition interdite refusee par la base';
end $$;

-- ── O18. Compteur du vendeur ───────────────────────────────────────────────
do $$
declare v_attendu int; q record;
begin
  select count(*) into v_attendu from zabelie_authoring_operations
   where seller_id = '00000000-0000-0000-0000-0000000a1501' and not (etat in ('cancelled', 'failed') and soumis_le is null);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1501', true);
  set local role authenticated;
  select * into q from zabelie_authoring_quota();
  reset role;
  assert q.utilisees = v_attendu and q.maximum = (select suggestions_vendeur_jour from zabelie_authoring_config where id),
    format('O18 KO : %s/%s au lieu de %s', q.utilisees, q.maximum, v_attendu);
  assert v_attendu >= 3, 'O18 KO : le compteur regarderait le vide';
  raise notice 'O18 OK — compteur conforme a la regle de la base';
end $$;

rollback;
