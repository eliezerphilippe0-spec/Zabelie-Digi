-- Journal du triage Jev en observation (0117, docs/61 §8).
-- Usage : psql "$DATABASE_URL" -f supabase/tests/jev_decisions.test.sql
--
--   J1. Connu-positif : une décision entière et un échec nommé s'inscrivent.
--   J2. Connu-négatif : ligne incohérente (classée sans intention, échec avec
--       probabilités), intention hors taxonomie, probabilité > 1, mode autre
--       que `observation`, raison d'échec en texte libre → refusées.
--   J3. Append-only : update, delete et truncate refusés.
--   J4. Confinement : anon et authenticated ne lisent ni n'écrivent ; le
--       service le peut.
--   J5. Aucune colonne ne peut porter le texte du message.

begin;

insert into auth.users(id, email) values
 ('11400000-0000-4000-8000-000000000001', 'jev-seller@test.local'),
 ('11400000-0000-4000-8000-000000000002', 'jev-buyer@test.local');
update profiles set role = 'creator' where id = '11400000-0000-4000-8000-000000000001';
insert into products(id, seller_id, slug, title, kind, price_htg, status) values
 ('11400000-0000-4000-8000-000000000010', '11400000-0000-4000-8000-000000000001',
  'jev-fixture', 'Jev fixture', 'physical', 1000, 'published');
insert into orders(id, buyer_id, product_id, amount_htg) values
 ('11400000-0000-4000-8000-000000000020', '11400000-0000-4000-8000-000000000002',
  '11400000-0000-4000-8000-000000000010', 1000);
insert into zabelie_support_cases(id, order_id, opened_by, reason, response_due_at) values
 ('11400000-0000-4000-8000-000000000030', '11400000-0000-4000-8000-000000000020',
  '11400000-0000-4000-8000-000000000002', 'debited', now() + interval '48 hours');

do $$
declare
  c uuid := '11400000-0000-4000-8000-000000000030';
  n bigint;
begin
  -- J1 : connu-positif.
  insert into zabelie_jev_decisions(case_id, request_id, outcome, entansyon, confidence, eskalade_p, ijans_p,
                                    model_demande, model_rendu, latency_ms, attempts, masquages)
  values (c, gen_random_uuid(), 'classe', 'pwoblem_peman', 0.82, 0.91, 0.4, 'jev-latest', 'jev-1.13', 640, 1,
          '{"nimewo":1,"komand":1}');
  insert into zabelie_jev_decisions(case_id, request_id, outcome, failure_reason, model_demande, latency_ms, attempts)
  values (c, gen_random_uuid(), 'echec', 'timeout', 'jev-latest', 8003, 1);
  select count(*) into n from zabelie_jev_decisions where case_id = c;
  assert n = 2, format('J1: 2 lignes attendues, %s', n);

  -- J2 : connu-négatif, une par contrainte.
  begin
    insert into zabelie_jev_decisions(case_id, request_id, outcome, model_demande, latency_ms, attempts)
    values (c, gen_random_uuid(), 'classe', 'jev-latest', 1, 1);
    raise exception 'J2a: classée sans intention acceptée';
  exception when check_violation then null; end;
  begin
    insert into zabelie_jev_decisions(case_id, request_id, outcome, failure_reason, entansyon, confidence,
                                      eskalade_p, ijans_p, model_demande, latency_ms, attempts)
    values (c, gen_random_uuid(), 'echec', 'timeout', 'lot', 0.5, 0.5, 0.5, 'jev-latest', 1, 1);
    raise exception 'J2b: échec portant des probabilités accepté';
  exception when check_violation then null; end;
  begin
    insert into zabelie_jev_decisions(case_id, request_id, outcome, entansyon, confidence, eskalade_p, ijans_p,
                                      model_demande, latency_ms, attempts)
    values (c, gen_random_uuid(), 'classe', 'release_funds', 0.9, 0.1, 0.1, 'jev-latest', 1, 1);
    raise exception 'J2c: intention hors taxonomie acceptée';
  exception when check_violation then null; end;
  begin
    insert into zabelie_jev_decisions(case_id, request_id, outcome, entansyon, confidence, eskalade_p, ijans_p,
                                      model_demande, latency_ms, attempts)
    values (c, gen_random_uuid(), 'classe', 'lot', 1.5, 0.1, 0.1, 'jev-latest', 1, 1);
    raise exception 'J2d: probabilité > 1 acceptée';
  exception when check_violation or numeric_value_out_of_range then null; end;
  begin
    insert into zabelie_jev_decisions(case_id, request_id, mode, outcome, entansyon, confidence, eskalade_p, ijans_p,
                                      model_demande, latency_ms, attempts)
    values (c, gen_random_uuid(), 'auto', 'classe', 'lot', 0.9, 0.1, 0.1, 'jev-latest', 1, 1);
    raise exception 'J2e: mode autre qu''observation accepté';
  exception when check_violation then null; end;
  begin
    insert into zabelie_jev_decisions(case_id, request_id, outcome, failure_reason, model_demande, latency_ms, attempts)
    values (c, gen_random_uuid(), 'echec', 'Mwen peye 37376615', 'jev-latest', 1, 1);
    raise exception 'J2f: texte libre accepté comme raison d''échec';
  exception when check_violation then null; end;

  -- J3 : append-only.
  begin
    -- Colonne neutre : l'update ne doit échouer QUE par le trigger, pas par une contrainte.
    update zabelie_jev_decisions set latency_ms = latency_ms + 1 where case_id = c and outcome = 'classe';
    raise exception 'J3a: update accepté';
  exception when insufficient_privilege then null; end;
  begin
    delete from zabelie_jev_decisions where case_id = c;
    raise exception 'J3b: delete accepté';
  exception when insufficient_privilege then null; end;
  begin
    truncate zabelie_jev_decisions;
    raise exception 'J3c: truncate accepté';
  exception when insufficient_privilege then null; end;

  -- J4 : confinement des rôles.
  assert not has_table_privilege('anon', 'zabelie_jev_decisions', 'select'), 'J4: anon lit le journal';
  assert not has_table_privilege('authenticated', 'zabelie_jev_decisions', 'select'), 'J4: authenticated lit le journal';
  assert not has_table_privilege('authenticated', 'zabelie_jev_decisions', 'insert'), 'J4: authenticated écrit le journal';
  assert has_table_privilege('service_role', 'zabelie_jev_decisions', 'insert'), 'J4: le service ne peut pas écrire';
  assert not has_table_privilege('service_role', 'zabelie_jev_decisions', 'update'), 'J4: le service peut réécrire';
  assert (select relrowsecurity from pg_class where oid = 'zabelie_jev_decisions'::regclass), 'J4: RLS inactive';

  -- J5 : aucune colonne texte libre hormis les identifiants de modèle et la raison bornée.
  assert not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'zabelie_jev_decisions'
       and column_name ~ '(body|message|text|contenu|raw)'
  ), 'J5: une colonne peut porter le texte du message';

  raise notice 'OK — J1 inscriptions ; J2 six refus ; J3 append-only ; J4 rôles ; J5 aucun texte';
end $$;

-- J4 bis : sous le rôle authenticated réel, la lecture échoue.
set local role authenticated;
set local request.jwt.claim.sub = '11400000-0000-4000-8000-000000000002';
do $$
begin
  perform count(*) from zabelie_jev_decisions;
  raise exception 'J4b: authenticated a lu le journal';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
