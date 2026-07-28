-- ============================================================================
-- 0047 — Capteur de demande : les recherches sans résultat
-- ============================================================================
-- ⚠️ NON APPLIQUÉE. À exécuter par le porteur (docs/14).
--
-- LE RENVERSEMENT
-- ---------------
-- Une recherche sans résultat n'est pas un échec à corriger, c'est le seul
-- signal d'offre manquante que produise une marketplace vide. « 23 personnes
-- ont cherché un onduleur cette semaine, nous n'en avons aucun » est la phrase
-- qu'on pose devant un commerçant pour le recruter. Cette table est donc un
-- outil de SOURCING dont la recherche n'est que l'interface.
--
-- CE QU'ON N'ENREGISTRE PAS — règle, pas préférence
-- -------------------------------------------------
-- Ni `user_id`, ni adresse IP, ni agent utilisateur. Une suite de requêtes en
-- dit plus long sur quelqu'un qu'un profil : « klinik avòtman », « tès VIH »,
-- « avoka pou divòs ». Seule une EMPREINTE non réversible est stockée, et elle
-- tourne chaque jour — elle sert à ne pas compter dix fois la même personne,
-- jamais à la suivre d'un jour sur l'autre.
--
-- POURQUOI LA NORMALISATION EST ICI ET NULLE PART AILLEURS
-- --------------------------------------------------------
-- Un miroir TypeScript finirait par diverger, et deux orthographes de la même
-- recherche compteraient pour deux termes — ce qui fausserait exactement le
-- chiffre qu'on va montrer à un commerçant. Une seule implémentation.
-- ============================================================================

-- ─────────────────── 1. Normalisation (source unique) ───────────────────────
-- `unaccent` n'est pas installée et l'ajouter serait une dépendance de plus :
-- `translate` couvre le français et le Kreyòl écrit à l'oreille, qui est le
-- seul cas réel ici.
create or replace function zabelie_search_normalize(p_raw text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(
    btrim(
      regexp_replace(
        translate(
          lower(coalesce(p_raw, '')),
          'àâäáãåéèêëíìîïóòôöõúùûüçñ',
          'aaaaaaeeeeiiiiooooouuuucn'
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

comment on function zabelie_search_normalize(text) is
  'Forme normalisée d''une recherche : minuscules, accents repliés, espaces '
  'réduits. SOURCE UNIQUE — aucun miroir applicatif. Voir 0047.';

-- ───────────────────────── 2. Réglages ──────────────────────────────────────
-- Paramètres commerciaux déguisés en constantes techniques : ils vivent en
-- table, jamais en dur (règle du dépôt).
create table zabelie_search_config (
  id                     boolean primary key default true check (id),
  -- Seuil de similarité trigramme. Trop bas : le catalogue devient du bruit.
  -- Trop haut : le Kreyòl écrit à l'oreille ne trouve rien. À calibrer sur
  -- des recherches réelles, pas au jugé.
  similarity_threshold   real    not null default 0.30
    check (similarity_threshold > 0 and similarity_threshold < 1),
  -- Un terme ne « compte » qu'au-delà de ce nombre de sessions DISTINCTES :
  -- sans ça un robot ou un vendeur qui teste sa fiche fabrique une demande
  -- qui n'existe pas, et on va recruter un commerçant sur un fantôme.
  min_sessions           integer not null default 3 check (min_sessions >= 1),
  -- Bornes d'enregistrement : en dessous c'est du bruit de frappe, au-dessus
  -- c'est un copier-coller.
  min_length             integer not null default 3 check (min_length >= 1),
  max_length             integer not null default 80 check (max_length <= 200),
  -- Rétention. Un capteur de demande n'a pas besoin de mémoire longue.
  retention_days         integer not null default 180 check (retention_days > 0)
);
insert into zabelie_search_config (id) values (true);

alter table zabelie_search_config enable row level security;
revoke all on zabelie_search_config from anon, authenticated;

-- ─────────────────────── 3. Le journal ──────────────────────────────────────
create table zabelie_search_misses (
  id           uuid primary key default gen_random_uuid(),
  term         text not null,
  -- Département actif au moment de la recherche, s'il y en avait un. Sert au
  -- sourcing : « on cherche ça DANS ce rayon » vaut mieux qu'un terme nu.
  department   text,
  -- Empreinte de session : aléa non réversible, tournant chaque jour. JAMAIS
  -- une IP, jamais un identifiant de compte. Voir l'en-tête.
  session_hash text not null,
  day          date not null default (now() at time zone 'America/Port-au-Prince')::date,
  created_at   timestamptz not null default now(),
  -- Une même personne qui reformule dix fois le même jour compte pour UNE.
  unique (term, session_hash, day)
);

comment on table zabelie_search_misses is
  'Recherches sans résultat — capteur de demande pour le sourcing vendeur. '
  'Aucune donnée de traçage : ni user_id, ni IP, ni user-agent. Voir 0047.';

create index zabelie_search_misses_term_idx on zabelie_search_misses (term, day);
create index zabelie_search_misses_day_idx on zabelie_search_misses (day);

alter table zabelie_search_misses enable row level security;
revoke all on zabelie_search_misses from anon, authenticated;

-- ──────────────────── 4. Enregistrement d'un manque ─────────────────────────
create or replace function zabelie_record_search_miss(
  p_raw          text,
  p_department   text,
  p_session_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg  zabelie_search_config;
  v_term text;
begin
  select * into v_cfg from zabelie_search_config where id;
  v_term := zabelie_search_normalize(p_raw);

  if v_term is null
     or length(v_term) < v_cfg.min_length
     or length(v_term) > v_cfg.max_length
     or coalesce(btrim(p_session_hash), '') = ''
  then
    return false;
  end if;

  insert into zabelie_search_misses (term, department, session_hash)
  values (v_term, nullif(btrim(coalesce(p_department, '')), ''), p_session_hash)
  on conflict (term, session_hash, day) do nothing;

  return true;
end;
$$;

revoke all on function zabelie_record_search_miss(text, text, text)
  from public, anon, authenticated;

-- ───────────────── 5. La demande, prête pour le sourcing ────────────────────
-- Ce que le porteur regarde. Le seuil de sessions distinctes est appliqué ICI
-- et pas à l'écriture : on garde la trace brute, on ne montre que ce qui est
-- crédible. Changer le seuil ne demande donc pas de réécrire l'histoire.
create or replace function zabelie_search_demand(
  p_days         integer default 7,
  -- Surcharge du seuil. `null` = celui de la config.
  --
  -- ⚠️ Indispensable au démarrage, et pas un confort : à faible trafic,
  -- presque aucun terme n'atteindra 3 sessions distinctes en 7 jours. La
  -- sortie serait vide pendant des mois et on conclurait que le capteur ne
  -- capte rien, alors qu'il aurait seulement filtré. Le seuil vivant à la
  -- LECTURE, l'ouvrir ne coûte rien et ne réécrit aucune donnée.
  p_min_sessions integer default null
)
returns table (
  term        text,
  department  text,
  sessions    bigint,
  derniere    timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
  select m.term,
         mode() within group (order by m.department) as department,
         count(distinct m.session_hash)              as sessions,
         max(m.created_at)                           as derniere
    from zabelie_search_misses m
   -- Même piège que `p_min_sessions` : `greatest(null, 1)` rend 1, donc un
   -- appel avec `p_days` explicitement nul donnerait une fenêtre d'UN jour au
   -- lieu de sept, en silence.
   where m.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
   group by m.term
  -- ⚠️ Pas de `coalesce(greatest(p_min_sessions, 1), …)` : en PostgreSQL
  -- `GREATEST` IGNORE les NULL, donc `greatest(null, 1)` rend 1 et le seuil
  -- retomberait à 1 même sans surcharge. Écrit ainsi, le test SD4 est passé
  -- au rouge et l'a montré.
  having count(distinct m.session_hash)
         >= case
              when p_min_sessions is null
                then (select min_sessions from zabelie_search_config where id)
              else greatest(p_min_sessions, 1)
            end
   order by count(distinct m.session_hash) desc, max(m.created_at) desc
   limit 100;
$$;

revoke all on function zabelie_search_demand(integer, integer) from public, anon, authenticated;

-- ─────────────────────────── 6. Purge ───────────────────────────────────────
create or replace function zabelie_purge_search_misses()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  delete from zabelie_search_misses
   where created_at < now() - make_interval(
     days => (select retention_days from zabelie_search_config where id)
   );
  get diagnostics v_n = row_count;
  -- Journalisé même à zéro : sinon « la purge n'a pas tourné » et « elle a
  -- tourné, rien à purger » produisent le même silence (CLAUDE.md).
  raise notice '0047 — purge des recherches : % ligne(s) supprimée(s)', v_n;
  return v_n;
end;
$$;

revoke all on function zabelie_purge_search_misses() from public, anon, authenticated;

-- ─────────────── 7. Recherche floue (couche 2, sans dépendance) ─────────────
-- `pg_trgm` et les index GIN existent depuis `0028` : il ne manquait que la
-- SIMILARITÉ. `ilike '%batri%'` exige la sous-chaîne exacte et ne trouve donc
-- jamais « batery » — c'est le cas courant d'un Kreyòl écrit à l'oreille.
--
-- ─────────── 7bis. Index sur la forme NORMALISÉE (pas le brut) ─────────────
-- Les index de `0028` portent sur `title`/`description` BRUTS. Le pré-filtre
-- `<%` doit s'appliquer à la MÊME expression que la comparaison qui décide,
-- sinon il peut écarter une ligne que la décision aurait acceptée : « Batrî »
-- et « batri » n'ont pas les mêmes trigrammes, et le rattrapage manquerait
-- silencieusement des produits accentués. Deux index de plus, et les deux
-- opérations parlent enfin de la même chaîne.
create index if not exists zabelie_products_title_norm_trgm_idx
  on products using gin (zabelie_search_normalize(title) gin_trgm_ops);
create index if not exists zabelie_products_desc_norm_trgm_idx
  on products using gin (zabelie_search_normalize(coalesce(description, '')) gin_trgm_ops);

-- Appelée seulement quand la recherche littérale ne rend RIEN : la couche 1
-- reste prioritaire, la couche 2 rattrape.
--
-- ⚠️ `word_similarity` et NON `similarity`. Mesuré sur le cas réel : pour
-- « batery » contre « Batri 12V pou machin », `similarity` rend 0,120 — sous
-- n'importe quel seuil utile — parce qu'elle compare la requête au titre
-- ENTIER, si bien qu'un titre long dilue le score et qu'un vendeur est puni
-- d'avoir été précis. `word_similarity` rend 0,429 : elle cherche le meilleur
-- fragment du titre. L'ORDRE DES ARGUMENTS COMPTE — requête d'abord, titre
-- ensuite : inversé, le même cas rend 0,143 et ne rattrape plus rien.
--
-- ⚠️⚠️ NE JAMAIS REMPLACER LA PAIRE `<%` + COMPARAISON PAR L'UN DES DEUX SEUL.
-- Les deux font des choses différentes et il faut les deux :
--
--   * `<%` SEUL serait faux. L'opérateur lit `pg_trgm.word_similarity_threshold`,
--     un GUC distinct de `pg_trgm.similarity_threshold`, dont le défaut est
--     0,6 — mesuré sur cette base. Au-dessus des 0,429 du cas « batery », il
--     ne rattraperait donc RIEN en production, pendant que les tests
--     resteraient verts s'ils appelaient la fonction directement.
--   * La COMPARAISON SEULE serait lente. Un index GIN trigramme ne répond
--     qu'à l'opérateur : `word_similarity(a,b) >= seuil` force un balayage
--     complet du catalogue. Invisible à 100 fiches, douloureux à 10 000.
--
-- D'où la forme retenue : le GUC est posé À LA VOLÉE (transaction courante
-- seulement) SOUS le seuil de configuration, ce qui fait de `<%` un
-- PRÉ-FILTRE LARGE que l'index sait servir ; la comparaison explicite tranche
-- ensuite avec le seuil que le porteur contrôle. L'index filtre, la config
-- décide.
create or replace function zabelie_search_fuzzy(
  p_raw   text,
  p_limit integer default 24
)
returns table (product_id uuid, score real)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_seuil real;
  v_norm  text;
begin
  select similarity_threshold into v_seuil from zabelie_search_config where id;
  v_norm := zabelie_search_normalize(p_raw);
  if v_norm is null then
    return;
  end if;

  -- Marge sous le seuil : le pré-filtre doit être un SUR-ensemble strict de
  -- ce que la comparaison acceptera, jamais l'inverse. `true` = local à la
  -- transaction, donc aucune fuite de réglage vers le reste de la session.
  perform set_config('pg_trgm.word_similarity_threshold',
                     greatest(v_seuil - 0.05, 0.01)::text, true);

  return query
    select p.id,
           greatest(
             word_similarity(v_norm, zabelie_search_normalize(p.title)),
             word_similarity(v_norm, zabelie_search_normalize(coalesce(p.description, '')))
           ) as score
      from products p
     where p.status = 'published'
       -- Pré-filtre servi par l'index GIN de `0028`.
       and (v_norm <% zabelie_search_normalize(p.title)
            or v_norm <% zabelie_search_normalize(coalesce(p.description, '')))
       -- Décision, au seuil de la table de config.
       and greatest(
             word_similarity(v_norm, zabelie_search_normalize(p.title)),
             word_similarity(v_norm, zabelie_search_normalize(coalesce(p.description, '')))
           ) >= v_seuil
     order by score desc
     limit greatest(coalesce(p_limit, 24), 1);
end;
$$;

comment on function zabelie_search_fuzzy(text, integer) is
  'Rattrapage par similarité trigramme (word_similarity) quand la recherche '
  'littérale ne rend rien. `<%` sert de pré-filtre indexé, le seuil de '
  'zabelie_search_config tranche. Ne jamais garder l''un sans l''autre. Voir 0047.';
