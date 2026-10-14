select zabelie_migration_garde('0142_zabelie_pg_trgm_extensions.sql');

-- 0142 — `pg_trgm` quitte le schéma `public` pour `extensions`.
--
-- Installée en `public` par 0028, l'extension exposait ses fonctions dans
-- l'API au même titre que les nôtres (conseiller Supabase, lint 0014). Le
-- remède documenté par Supabase est un déplacement, pas une réinstallation :
-- les cinq index trigrammes suivent leur classe d'opérateurs et restent
-- valides, sans reconstruction.
--
-- ⚠️ UNE SEULE FONCTION DÉPEND DE L'EXTENSION À L'EXÉCUTION : `zabelie_search_fuzzy`
-- (0047 : `word_similarity`, `<%`), mesuré en production le 2026-10-14.
-- Son `search_path` valait `public, pg_temp` : sans `extensions`, la
-- recherche approximative casserait au premier appel. Même panne, même remède
-- que `pgcrypto` le 2026-09-03 (0093 → 0094, `order_ref.test.sql` OR0).
-- Toute nouvelle fonction qui appelle un opérateur trigramme devra porter
-- `extensions` dans son `search_path`.

create schema if not exists extensions;

alter extension pg_trgm set schema extensions;

alter function public.zabelie_search_fuzzy(text, integer)
  set search_path = public, extensions, pg_temp;

do $$
declare v_invalides text;
begin
  if (select extnamespace::regnamespace::text from pg_extension where extname = 'pg_trgm') is distinct from 'extensions' then
    raise exception '0142: pg_trgm n''est pas dans le schéma extensions';
  end if;
  if not exists (select 1 from pg_proc
                  where proname = 'zabelie_search_fuzzy' and pronamespace = 'public'::regnamespace
                    and 'search_path=public, extensions, pg_temp' = any (proconfig)) then
    raise exception '0142: zabelie_search_fuzzy ne voit pas le schéma extensions';
  end if;
  select string_agg(i.indexrelid::regclass::text, ', ') into v_invalides
    from pg_index i
   where i.indexrelid::regclass::text like '%trgm%' and not (i.indisvalid and i.indisready);
  if v_invalides is not null then
    raise exception '0142: index trigrammes invalides : %', v_invalides;
  end if;
  -- La preuve qui compte : la recherche approximative s'exécute.
  perform * from public.zabelie_search_fuzzy('zabelie', 1);
end $$;
