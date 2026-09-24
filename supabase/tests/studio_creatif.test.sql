-- Studio Créatif, Phase 3 (0118, docs/62 §5).
-- Usage : psql "$DATABASE_URL" -f supabase/tests/studio_creatif.test.sql
--
--   S1. Connu-positif : une génération, generating puis completed.
--   S2. Idempotence : la même clé du même vendeur est refusée (unique), et ne
--       compte pas comme un dépassement de quota.
--   S3. Quotas : vendeur puis plateforme, lus en configuration.
--   S4. Transitions : completed sans generating, generating après la fin,
--       deux états finaux, incohérences de colonnes → refusés.
--   S5. Append-only : update, delete, truncate refusés tant que le parent vit.
--   S6. Cascade : supprimer le produit (et donc le compte) emporte tout, sans
--       être bloqué par l'append-only.
--   S7. Rôles : anon et authenticated n'ont rien ; le service lit et insère.

begin;

insert into auth.users(id, email) values
 ('11800000-0000-4000-8000-000000000001', 'studio-a@test.local'),
 ('11800000-0000-4000-8000-000000000002', 'studio-b@test.local');
update profiles set role = 'creator' where id in
 ('11800000-0000-4000-8000-000000000001', '11800000-0000-4000-8000-000000000002');
insert into products(id, seller_id, slug, title, kind, price_htg, status) values
 ('11800000-0000-4000-8000-000000000010', '11800000-0000-4000-8000-000000000001', 'studio-a', 'Studio A', 'physical', 1000, 'published'),
 ('11800000-0000-4000-8000-000000000011', '11800000-0000-4000-8000-000000000002', 'studio-b', 'Studio B', 'physical', 1000, 'published');

-- Quotas d'essai : 2 par vendeur, 3 pour la plateforme.
update zabelie_studio_config set quota_vendeur_jour = 2, quota_global_jour = 3;

do $$
declare
  a uuid := '11800000-0000-4000-8000-000000000001';
  b uuid := '11800000-0000-4000-8000-000000000002';
  pa uuid := '11800000-0000-4000-8000-000000000010';
  pb uuid := '11800000-0000-4000-8000-000000000011';
  k1 uuid := '11800000-0000-4000-8000-0000000000a1';
  g1 uuid; g2 uuid; g3 uuid;
  n bigint;
begin
  -- S1
  insert into zabelie_creative_generations(seller_id, product_id, idempotency_key, brief_index, format, prompt, rule_version, provider)
  values (a, pa, k1, 0, '1:1', 'p', 'R-STUDIO-01', 'higgsfield') returning id into g1;
  insert into zabelie_creative_events(generation_id, etat, provider_ref) values (g1, 'generating', 'req_1');
  insert into zabelie_creative_events(generation_id, etat, image_url) values (g1, 'completed', 'https://cdn.test/1.png');
  select count(*) into n from zabelie_creative_events where generation_id = g1;
  assert n = 2, format('S1: 2 événements attendus, %s', n);

  -- S2 : rejeu de la clé → unique_violation, pas un refus de quota.
  begin
    insert into zabelie_creative_generations(seller_id, product_id, idempotency_key, brief_index, format, prompt, rule_version, provider)
    values (a, pa, k1, 1, '3:4', 'p', 'R-STUDIO-01', 'higgsfield');
    raise exception 'S2: clé rejouée acceptée';
  exception when unique_violation then null; end;
  -- La même clé chez un AUTRE vendeur est une autre génération.
  insert into zabelie_creative_generations(seller_id, product_id, idempotency_key, brief_index, format, prompt, rule_version, provider)
  values (b, pb, k1, 0, '1:1', 'p', 'R-STUDIO-01', 'mock') returning id into g2;

  -- S3 : vendeur a → 2e passe, 3e refusée (quota vendeur) ; la plateforme est
  -- alors à 3 : vendeur b (1 sur 2) est refusé par le quota GLOBAL.
  insert into zabelie_creative_generations(seller_id, product_id, idempotency_key, brief_index, format, prompt, rule_version, provider)
  values (a, pa, gen_random_uuid(), 1, '3:4', 'p', 'R-STUDIO-01', 'higgsfield') returning id into g3;
  begin
    insert into zabelie_creative_generations(seller_id, product_id, idempotency_key, brief_index, format, prompt, rule_version, provider)
    values (a, pa, gen_random_uuid(), 2, '9:16', 'p', 'R-STUDIO-01', 'higgsfield');
    raise exception 'S3a: quota vendeur franchi';
  exception when raise_exception then
    assert sqlerrm = 'studio_quota_vendeur', 'S3a: mauvais refus : ' || sqlerrm;
  end;
  begin
    insert into zabelie_creative_generations(seller_id, product_id, idempotency_key, brief_index, format, prompt, rule_version, provider)
    values (b, pb, gen_random_uuid(), 1, '3:4', 'p', 'R-STUDIO-01', 'mock');
    raise exception 'S3b: quota global franchi';
  exception when raise_exception then
    assert sqlerrm = 'studio_quota_global', 'S3b: mauvais refus : ' || sqlerrm;
  end;
  -- Format hors Studio (4:5 n'existe pas chez Higgsfield) refusé.
  update zabelie_studio_config set quota_global_jour = 100;
  begin
    insert into zabelie_creative_generations(seller_id, product_id, idempotency_key, brief_index, format, prompt, rule_version, provider)
    values (b, pb, gen_random_uuid(), 1, '4:5', 'p', 'R-STUDIO-01', 'mock');
    raise exception 'S3c: format 4:5 accepté';
  exception when check_violation then null; end;

  -- S4 : transitions.
  begin
    insert into zabelie_creative_events(generation_id, etat, image_url) values (g2, 'completed', 'https://cdn.test/2.png');
    raise exception 'S4a: completed sans generating';
  exception when raise_exception then
    -- Le test lève le MÊME code (P0001) : sans ce contrôle il avalerait son propre échec.
    assert sqlerrm = 'studio_transition_interdite', 'S4a: ' || sqlerrm;
  end;
  insert into zabelie_creative_events(generation_id, etat, detail) values (g2, 'failed', 'http_422');
  begin
    insert into zabelie_creative_events(generation_id, etat, provider_ref) values (g2, 'generating', 'req_2');
    raise exception 'S4b: generating après la fin';
  exception when raise_exception then
    -- Le test lève le MÊME code (P0001) : sans ce contrôle il avalerait son propre échec.
    assert sqlerrm = 'studio_transition_interdite', 'S4b: ' || sqlerrm;
  end;
  begin
    insert into zabelie_creative_events(generation_id, etat, detail) values (g1, 'failed', 'delai_depasse');
    raise exception 'S4c: second état final';
  exception when unique_violation then null; end;
  begin
    insert into zabelie_creative_events(generation_id, etat) values (g3, 'generating');
    raise exception 'S4d: generating sans référence';
  exception when check_violation then null; end;
  begin
    insert into zabelie_creative_events(generation_id, etat, detail) values (g3, 'failed', 'Texte libre 509');
    raise exception 'S4e: détail en texte libre';
  exception when check_violation then null; end;
  begin
    insert into zabelie_creative_events(generation_id, etat, provider_ref) values (g3, 'generating', 'req_3');
    insert into zabelie_creative_events(generation_id, etat, image_url) values (g3, 'completed', 'http://cdn.test/3.png');
    raise exception 'S4f: image non https';
  exception when check_violation then null; end;

  -- S5 : append-only tant que les parents vivent.
  begin
    update zabelie_creative_generations set brief_index = 3 where id = g1;
    raise exception 'S5a: update accepté';
  exception when insufficient_privilege then null; end;
  begin
    delete from zabelie_creative_generations where id = g1;
    raise exception 'S5b: delete accepté';
  exception when insufficient_privilege then null; end;
  begin
    delete from zabelie_creative_events where generation_id = g1;
    raise exception 'S5c: delete d''événement accepté';
  exception when insufficient_privilege then null; end;
  begin
    truncate zabelie_creative_events;
    raise exception 'S5d: truncate accepté';
  exception when insufficient_privilege then null; end;

  -- S6 : la suppression du produit emporte générations et événements.
  delete from products where id = pa;
  select count(*) into n from zabelie_creative_generations where seller_id = a;
  assert n = 0, format('S6: %s génération(s) survivent au produit', n);
  select count(*) into n from zabelie_creative_events where generation_id in (g1, g3);
  assert n = 0, format('S6: %s événement(s) survivent', n);

  -- S7 : rôles.
  assert not has_table_privilege('anon', 'zabelie_creative_generations', 'select'), 'S7: anon lit';
  assert not has_table_privilege('authenticated', 'zabelie_creative_generations', 'select'), 'S7: authenticated lit';
  assert not has_table_privilege('authenticated', 'zabelie_creative_events', 'insert'), 'S7: authenticated écrit';
  assert not has_table_privilege('authenticated', 'zabelie_studio_config', 'select'), 'S7: authenticated lit la config';
  assert has_table_privilege('service_role', 'zabelie_creative_generations', 'insert'), 'S7: le service ne peut pas insérer';
  assert not has_table_privilege('service_role', 'zabelie_creative_generations', 'update'), 'S7: le service peut réécrire';
  assert not has_table_privilege('service_role', 'zabelie_studio_config', 'update'), 'S7: le service modifie les quotas';
  assert (select bool_and(relrowsecurity) from pg_class where relname in
          ('zabelie_creative_generations', 'zabelie_creative_events', 'zabelie_studio_config')), 'S7: RLS inactive';

  raise notice 'OK — S1 cycle ; S2 idempotence ; S3 quotas ; S4 transitions ; S5 append-only ; S6 cascade ; S7 rôles';
end $$;

-- S6 bis : la suppression d'un compte sans vente n'est pas bloquée.
do $$
declare n bigint;
begin
  delete from auth.users where id = '11800000-0000-4000-8000-000000000002';
  select count(*) into n from zabelie_creative_generations where seller_id = '11800000-0000-4000-8000-000000000002';
  assert n = 0, format('S6b: %s génération(s) survivent au compte', n);
end $$;

rollback;
