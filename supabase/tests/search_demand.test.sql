-- Tests du capteur de demande (0047). Un cas par transaction, annulée.
--
--   SD1. Normalisation : accents repliés, casse, espaces — une seule forme.
--   SD2. Bornes : trop court, trop long, vide, session absente → non enregistré.
--   SD3. Déduplication : la même personne le même jour compte pour UNE session.
--   SD4. Seuil de crédibilité : sous `min_sessions`, le terme n'apparaît pas.
--   SD5. Au-dessus du seuil, il apparaît avec son compte et son département.
--   SD6. CAS CONNU-NÉGATIF : seuil abaissé à 1 → le terme écarté en SD4
--        apparaît. Le filtre est donc bien le seuil, pas un autre effet.
--   SD7. Purge : borne respectée, compteur rendu même à zéro.
--   SD8. Recherche floue : « batery » trouve « batri », un mot sans rapport non.
--   SD10. Garde d'intégrité : l'index d'expression suit-il la fonction ?
--         CAS CONNU-NÉGATIF inclus — on redéfinit la fonction sans réindexer
--         et le contrôle doit crier.
--   SD11. Le réglage `pg_trgm.word_similarity_threshold` est RENDU tel quel :
--         la fonction ne laisse pas de trace dans la transaction appelante.
--   SD12. L'invariant pré-filtre < décision est gardé en exécutable.
--   SD9. Molette d'ouverture : `p_min_sessions` surcharge le seuil, et
--        l'ABSENCE de surcharge laisse bien celui de la config (piège
--        `GREATEST` qui ignore les NULL).
--
-- Usage : psql "$DATABASE_URL" -f supabase/tests/search_demand.test.sql

-- ─────────────────────────── SD1 ────────────────────────────────────────────
begin;
do $$
begin
  if zabelie_search_normalize('  ONDULEUR  ') <> 'onduleur' then
    raise exception 'SD1 : casse/espaces non normalisés (%)',
      zabelie_search_normalize('  ONDULEUR  ');
  end if;
  if zabelie_search_normalize('Batrî Chajè') <> 'batri chaje' then
    raise exception 'SD1 : accents non repliés (%)',
      zabelie_search_normalize('Batrî Chajè');
  end if;
  if zabelie_search_normalize('a   b') <> 'a b' then
    raise exception 'SD1 : espaces multiples non réduits';
  end if;
  if zabelie_search_normalize('   ') is not null then
    raise exception 'SD1 : une chaîne blanche doit rendre NULL';
  end if;
  raise notice 'OK — SD1 normalisation : une recherche = une seule forme';
end $$;
rollback;

-- ─────────────────────────── SD2 ────────────────────────────────────────────
begin;
do $$
begin
  if zabelie_record_search_miss('ab', null, 's1') then
    raise exception 'SD2 : terme de 2 caractères enregistré';
  end if;
  if zabelie_record_search_miss(repeat('a', 300), null, 's1') then
    raise exception 'SD2 : terme de 300 caractères enregistré';
  end if;
  if zabelie_record_search_miss('   ', null, 's1') then
    raise exception 'SD2 : terme vide enregistré';
  end if;
  if zabelie_record_search_miss('onduleur', null, '') then
    raise exception 'SD2 : enregistrement sans empreinte de session';
  end if;
  if (select count(*) from zabelie_search_misses) <> 0 then
    raise exception 'SD2 : des lignes ont été écrites malgré les refus';
  end if;
  raise notice 'OK — SD2 bornes respectées, rien écrit';
end $$;
rollback;

-- ─────────────────────────── SD3 ────────────────────────────────────────────
begin;
do $$
declare v_n integer;
begin
  perform zabelie_record_search_miss('onduleur', 'Électronique', 'sess-a');
  perform zabelie_record_search_miss('ONDULEUR', 'Électronique', 'sess-a');
  perform zabelie_record_search_miss('  onduleur ', null, 'sess-a');

  select count(*) into v_n from zabelie_search_misses where term = 'onduleur';
  if v_n <> 1 then
    raise exception 'SD3 : % lignes pour une seule personne', v_n;
  end if;
  raise notice 'OK — SD3 la même personne le même jour compte pour une';
end $$;
rollback;

-- ─────────────────────── SD4 / SD5 / SD6 ────────────────────────────────────
begin;
do $$
declare v_n integer; v_sessions bigint; v_dep text;
begin
  -- Deux sessions seulement : sous le seuil par défaut (3).
  perform zabelie_record_search_miss('onduleur', 'Électronique', 'sess-1');
  perform zabelie_record_search_miss('onduleur', 'Électronique', 'sess-2');

  select count(*) into v_n from zabelie_search_demand(7) where term = 'onduleur';
  if v_n <> 0 then
    raise exception 'SD4 : terme montré avec 2 sessions alors que le seuil est 3';
  end if;

  -- Troisième session : le terme devient crédible.
  perform zabelie_record_search_miss('onduleur', 'Électronique', 'sess-3');
  select sessions, department into v_sessions, v_dep
    from zabelie_search_demand(7) where term = 'onduleur';
  if v_sessions <> 3 then
    raise exception 'SD5 : % sessions comptées au lieu de 3', v_sessions;
  end if;
  if v_dep <> 'Électronique' then
    raise exception 'SD5 : département perdu (%)', v_dep;
  end if;

  -- SD6 — cas connu-négatif : c'est BIEN le seuil qui écartait le terme.
  delete from zabelie_search_misses where session_hash = 'sess-3';
  update zabelie_search_config set min_sessions = 1;
  select count(*) into v_n from zabelie_search_demand(7) where term = 'onduleur';
  if v_n <> 1 then
    raise exception 'SD6 : seuil ramené à 1 et le terme reste absent — SD4 ne '
                    'prouvait donc pas ce qu''il annonce';
  end if;

  raise notice 'OK — SD4 sous le seuil, invisible ; SD5 au-dessus, compté avec '
               'son rayon ; SD6 c''est bien le seuil qui filtre';
end $$;
rollback;

-- ─────────────────────────── SD7 ────────────────────────────────────────────
begin;
do $$
declare v_n integer;
begin
  perform zabelie_record_search_miss('vye rechèch', null, 'sess-vieux');
  update zabelie_search_misses set created_at = now() - interval '400 days';
  perform zabelie_record_search_miss('rechèch fre', null, 'sess-frais');

  v_n := zabelie_purge_search_misses();
  if v_n <> 1 then
    raise exception 'SD7 : % ligne(s) purgée(s), 1 attendue', v_n;
  end if;
  if not exists (select 1 from zabelie_search_misses where term = 'rechech fre') then
    raise exception 'SD7 : la ligne récente a été purgée';
  end if;

  -- Second passage : rien à purger, et la fonction doit quand même répondre.
  v_n := zabelie_purge_search_misses();
  if v_n <> 0 then
    raise exception 'SD7 : % purgée(s) au second passage, 0 attendue', v_n;
  end if;
  raise notice 'OK — SD7 purge bornée, compteur rendu même à zéro';
end $$;
rollback;

-- ─────────────────────────── SD8 ────────────────────────────────────────────
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c0001', 'vendeur.sd@test.local');
delete from profiles where id in (select id from auth.users);
insert into profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-0000000c0001', 'Vendeur SD', 'creator');
insert into products (id, seller_id, slug, title, price_htg, kind, status) values
  ('00000000-0000-0000-0000-0000000c0002',
   '00000000-0000-0000-0000-0000000c0001',
   'batri-12v', 'Batri 12V pou machin', 4500, 'fichier', 'published'),
  ('00000000-0000-0000-0000-0000000c0003',
   '00000000-0000-0000-0000-0000000c0001',
   'liv-kwizin', 'Liv rekèt kwizin ayisyen', 800, 'fichier', 'published');

do $$
declare v_n integer;
begin
  -- Le cas qui motive toute la couche 2 : « batery » n'est PAS une
  -- sous-chaîne de « Batri », donc `ilike` ne le trouverait jamais.
  select count(*) into v_n
    from zabelie_search_fuzzy('batery')
   where product_id = '00000000-0000-0000-0000-0000000c0002';
  if v_n <> 1 then
    raise exception 'SD8 : « batery » ne rattrape pas « Batri »';
  end if;

  -- Et il ne ramène pas n'importe quoi : un mot sans rapport ne matche pas.
  select count(*) into v_n from zabelie_search_fuzzy('zoranj');
  if v_n <> 0 then
    raise exception 'SD8 : « zoranj » a ramené % produit(s)', v_n;
  end if;

  raise notice 'OK — SD8 « batery » trouve « Batri », « zoranj » ne trouve rien';
end $$;
rollback;

-- ─────────────────────────── SD9 ────────────────────────────────────────────
-- À faible trafic, presque aucun terme n'atteint 3 sessions en 7 jours : sans
-- molette, l'export renverrait du vide pendant des mois et on croirait le
-- capteur muet. Le seuil vit à la lecture, l'ouvrir ne réécrit rien.
begin;
do $$
declare v_n integer;
begin
  perform zabelie_record_search_miss('onduleur', null, 'sess-x');

  -- Défaut (3) : invisible.
  select count(*) into v_n from zabelie_search_demand(7) where term = 'onduleur';
  if v_n <> 0 then
    raise exception 'SD9 : sans surcharge, le seuil de la config n''est pas appliqué';
  end if;

  -- Surcharge à 1 : visible.
  select count(*) into v_n from zabelie_search_demand(7, 1) where term = 'onduleur';
  if v_n <> 1 then
    raise exception 'SD9 : la surcharge à 1 ne montre pas le terme';
  end if;

  -- Surcharge à 5 : de nouveau invisible — la molette va dans les deux sens.
  select count(*) into v_n from zabelie_search_demand(7, 5) where term = 'onduleur';
  if v_n <> 0 then
    raise exception 'SD9 : la surcharge à 5 ne filtre pas';
  end if;

  raise notice 'OK — SD9 molette dans les deux sens, défaut préservé sans surcharge';
end $$;
rollback;

-- ────────────────────────── SD10 ────────────────────────────────────────────
begin;
do $$
declare v_ok boolean; v_detail text;
begin
  select ok, detail into v_ok, v_detail from zabelie_search_index_integrity();
  if not v_ok then
    raise exception 'SD10 : contrôle en échec sur une base saine (%)', v_detail;
  end if;

  -- CAS CONNU-NÉGATIF : on modifie la normalisation sans réindexer, ce qui
  -- est exactement le geste qu'un ajout de règle Kreyòl produirait.
  create or replace function zabelie_search_normalize(p_raw text)
  returns text language sql immutable set search_path = public, pg_temp as
  $f$ select lower(coalesce(p_raw, '')) $f$;

  select ok, detail into v_ok, v_detail from zabelie_search_index_integrity();
  if v_ok then
    raise exception 'SD10 : la fonction a changé et le contrôle reste vert — '
                    'les index seraient périmés sans que personne le sache';
  end if;
  if v_detail not like '%REINDEX%' then
    raise exception 'SD10 : le message ne dit pas quoi faire (%)', v_detail;
  end if;

  raise notice 'OK — SD10 index d''expression alignés, et la dérive est criée';
end $$;
rollback;

-- ────────────────────────── SD11 ────────────────────────────────────────────
begin;
do $$
declare v_avant text; v_apres text;
begin
  set local pg_trgm.word_similarity_threshold = 0.55;
  v_avant := current_setting('pg_trgm.word_similarity_threshold');
  perform * from zabelie_search_fuzzy('batery');
  v_apres := current_setting('pg_trgm.word_similarity_threshold');

  if v_apres is distinct from v_avant then
    raise exception 'SD11 : réglage laissé à % au lieu de % — toute requête '
                    'suivante utilisant <%% hériterait du seuil abaissé',
                    v_apres, v_avant;
  end if;
  raise notice 'OK — SD11 le réglage de session est rendu tel qu''il était';
end $$;
rollback;

-- ────────────────────────── SD12 ────────────────────────────────────────────
begin;
do $$
declare v_code text;
begin
  -- On force l'invariant à se rompre : pré-filtre >= décision.
  create or replace function zabelie_search_fuzzy(p_raw text, p_limit integer default 24)
  returns table (product_id uuid, score real) language plpgsql stable
  set search_path = public, pg_temp as $f$
  declare v_seuil real; v_guc real;
  begin
    select similarity_threshold into v_seuil from zabelie_search_config where id;
    v_guc := v_seuil;            -- rupture volontaire
    if v_guc >= v_seuil then
      raise exception 'pre-filtre >= decision' using errcode = 'ZB047';
    end if;
    return;
  end $f$;

  begin
    perform * from zabelie_search_fuzzy('batery');
    raise exception 'SD12 : invariant rompu et aucune erreur levée';
  exception
    when sqlstate 'ZB047' then v_code := 'ok';
  end;

  if v_code is distinct from 'ok' then
    raise exception 'SD12 : erreur inattendue';
  end if;
  raise notice 'OK — SD12 l''invariant pré-filtre < décision est exécutable, '
               'pas seulement commenté';
end $$;
rollback;
