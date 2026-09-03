select zabelie_migration_garde('0094_order_ref_extensions_registre_0093.sql');

-- ============================================================================
-- 0094 — Le numéro de commande retrouve pgcrypto + ligne de 0093 au registre
-- ============================================================================
-- ⚠️ PANNE EN PRODUCTION, mesurée le 2026-09-03 — pas déduite.
--
-- Depuis `0093` (appliquée à 13:11:13 UTC), AUCUNE commande ne peut naître :
-- le porteur a tenté le premier achat réel à 17:40 UTC, trois fois, et a reçu
-- « Création de la commande impossible ». Le journal PostgREST porte trois
-- `POST /rest/v1/orders → 404` à 17:40:12, :15 et :19 ; `orders` n'a aucune
-- ligne postérieure au 22 août.
--
-- LA CAUSE, reproduite en base par deux requêtes :
--
--     set local search_path = public;             select gen_random_bytes(5);
--     → 42883 : function gen_random_bytes(integer) does not exist
--     set local search_path = public, extensions; select gen_random_bytes(5);
--     → 5 octets
--
-- `0093` a épinglé `search_path = public` sur `zabelie_order_ref_candidate`,
-- dont le corps (`0042`) appelle `gen_random_bytes(5)` SANS le qualifier. Sur
-- Supabase, pgcrypto vit dans le schéma `extensions` — mesuré dans
-- `pg_extension` : `pgcrypto@extensions`, `uuid-ossp@extensions`,
-- `pg_trgm@public`. Avant `0093`, la fonction héritait du `search_path` du
-- rôle (`"$user", public, extensions`) et trouvait l'extension. Après, plus.
-- Le trigger `before insert` de `orders` lève donc 42883 à chaque insert.
--
-- ⚠️ ET LA CI ÉTAIT VERTE — c'est le fait qui compte. `0001` fait `create
-- extension if not exists "pgcrypto"` ; sur le Postgres nu du harnais, elle
-- tombe dans `public`. `search_path = public` y résout donc `gen_random_bytes`
-- alors qu'en production il ne le résout pas. `order_ref.test.sql` insère
-- bien dans `orders` (OR1) et n'a jamais pu échouer : l'instrument testait un
-- autre système que celui qu'il prétendait garder. Mesuré ce jour sur un
-- Postgres 16 local : harnais d'avant ce commit → 55 tests verts,
-- `pgcrypto@public`. Le correctif est donc DOUBLE, et la moitié qui compte
-- n'est pas dans ce fichier :
--
--   • ici : `search_path = public, extensions` sur la seule fonction de
--     `public` qui appelle une fonction d'extension (mesuré par `prosrc ~
--     'gen_random_bytes|digest|hmac|crypt|gen_salt|uuid_generate'` : UNE
--     ligne). Le corps de `0042` ne bouge pas. Un schéma absent dans un
--     `search_path` est ignoré sans erreur, donc la forme vaut aussi sur un
--     Postgres sans schéma `extensions`.
--   • dans `supabase/tests/_bootstrap.sql` : le harnais pose pgcrypto DANS
--     `extensions`, comme Supabase, et donne au rôle le même `search_path`.
--     Avec ce seul changement et sans `0094`, `order_ref.test.sql` rougit à
--     OR1 — c'est la panne, reproduite en CI. `OR0` y garde désormais la
--     classe entière : `public` seul DOIT faire échouer l'insert (sinon le
--     harnais a remis pgcrypto dans `public`), `public, extensions` DOIT le
--     laisser passer.
--
-- Pourquoi pas `extensions.gen_random_bytes(5)` qualifié dans le corps : le
-- résultat serait le même, mais il figerait dans une fonction de `public`
-- l'emplacement d'une extension que Supabase administre. Le `search_path`
-- dit la même chose au niveau où Supabase le recommande, et le corps de
-- `0042` reste ce que le registre a haché.
--
-- Cette migration n'inscrit pas sa propre ligne (convention depuis 0063).
-- ============================================================================

-- ── 1. Ligne de 0093 ───────────────────────────────────────────────────────
-- `sha256` = empreinte CANONIQUE (`scripts/zabelie-migration-hash.mjs`,
-- convention 0041). L'empreinte CROISÉE (méthode 0086) est dans la note :
-- SHA-256 BRUT du fichier de `main` = SHA-256 de `statements[1]` du journal
-- Supabase (version 20260903131113). ⚠️ Les lignes de `0091` et `0092`
-- portent l'empreinte BRUTE dans `sha256` (inscrites par `0092` et `0093`) —
-- écart de convention consigné dans `OPS_TODO`, non corrigé ici.
insert into zabelie_schema_migrations
  (filename, sha256, applied_at, applied_by, statut, preuve, note)
values
  ('0093_search_path_gardes_registre_0092.sql',
   'fe5b8e974c1737d40b01cfb59eb94cc0a7c78d83be170ae22285559a569b13d3',
   '2026-09-03 13:11:13+00',
   'porteur — autorisation permanente du 2026-08-17, appliquee par agent via MCP (PR #196, session distincte)',
   'appliquee', 'journal_supabase',
   'Onze search_path epingles a public, ligne de 0092, seller_is_active '
   'documentee. Empreinte croisee (methode 0086) : SHA-256 BRUT du fichier de '
   'main = SHA-256 de statements[1] du journal (version 20260903131113) = '
   '4063c33c5492f006176bc4e546712fce19ae5acb73a486f7c96857bf23dc5f05. '
   'Le signal de la session qui l a appliquee n a pas ete relu par la '
   'presente ; le journal Supabase atteste l application. '
   'REGRESSION : l epinglage a coupe zabelie_order_ref_candidate de pgcrypto '
   '(schema extensions) — aucune commande ne pouvait naitre du 2026-09-03 '
   '13:11 UTC jusqu a 0094. Trois POST /rest/v1/orders en 404 a 17:40 UTC.')
on conflict (filename) do nothing;

-- ── 2. Le numéro de commande retrouve pgcrypto ─────────────────────────────
alter function public.zabelie_order_ref_candidate(date)
  set search_path = public, extensions;

-- ── Post-condition ──────────────────────────────────────────────────────────
-- On assert sur l'EFFET : la fonction rend un numéro conforme, ce qui exige
-- que `gen_random_bytes` se résolve. Le `proconfig` est vérifié en plus, pour
-- que « la fonction marche parce que le rôle a le bon search_path » ne se
-- confonde pas avec « la fonction marche par elle-même ». Et la ligne de 0093
-- se vérifie sur son CONTENU, jamais sur sa seule présence.
do $$
declare
  v_ok_ligne boolean;
  v_epingle  boolean;
  v_ref      text;
begin
  select exists (
    select 1 from zabelie_schema_migrations
     where filename = '0093_search_path_gardes_registre_0092.sql'
       and sha256   = 'fe5b8e974c1737d40b01cfb59eb94cc0a7c78d83be170ae22285559a569b13d3'
       and statut   = 'appliquee'
       and preuve   = 'journal_supabase'
  ) into v_ok_ligne;

  select exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'zabelie_order_ref_candidate'
       and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                    where c = 'search_path=public, extensions')
  ) into v_epingle;

  if not v_ok_ligne then
    raise exception '0094 KO: la ligne de 0093 est absente ou divergente au registre'
      using errcode = 'ZB094';
  end if;
  if not v_epingle then
    raise exception '0094 KO: zabelie_order_ref_candidate n''a pas search_path = public, extensions'
      using errcode = 'ZB094';
  end if;

  -- L'effet : un candidat se génère. Avant 0094, cet appel lève 42883.
  v_ref := public.zabelie_order_ref_candidate(current_date);
  if v_ref !~ '^ZB-[0-9]{6}-[2345679ACDEFGHJKMNPQRSTVWXYZ]{5}$' then
    raise exception '0094 KO: candidat non conforme (%)', v_ref
      using errcode = 'ZB094';
  end if;

  raise notice '0094 OK: 0093 inscrite, order_ref retrouve pgcrypto (candidat %)', v_ref;
end $$;
