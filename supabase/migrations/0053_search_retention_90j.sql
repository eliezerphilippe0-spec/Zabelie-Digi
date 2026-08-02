-- ============================================================================
-- 0053 — Rétention du capteur de demande : 180 jours → 90
-- ============================================================================
-- ⚠️ ÉTAT : **NON APPLIQUÉE**. Écrite pour être exécutée par le porteur, en
-- transaction explicite, après lecture de la section « effet » ci-dessous.
--
-- Vérifier AVANT d'exécuter — le registre déclare, le catalogue atteste :
--   select * from zabelie_schema_migrations where filename like '0047%';
--   select retention_days from zabelie_search_config;   -- doit rendre 180
--
-- POURQUOI CE CHIFFRE CHANGE
-- --------------------------
-- 180 était un défaut, pas une décision : il a été écrit dans `0047` en même
-- temps que `min_sessions`, `min_length` et `max_length`, sans qu'aucune
-- question ne lui soit posée. Il est tranché ici explicitement, parce qu'un
-- défaut qu'on laisse passer devient une règle que personne n'a choisie.
--
-- Ce que la rétention sert à faire : montrer à un commerçant que N personnes
-- ont cherché un onduleur ces dernières semaines. Cette phrase se construit
-- sur des fenêtres de 7, 30 et 90 jours — au-delà, un chiffre de sourcing est
-- périmé : le stock, les prix et la concurrence ont bougé. 90 jours couvrent
-- donc l'INTÉGRALITÉ de l'usage prévu.
--
-- Ce que la rétention coûte : `zabelie_search_misses` stocke `term` EN CLAIR
-- à côté d'un `session_hash`. L'empreinte tourne chaque jour et n'est pas
-- réversible — mais sur un volume faible, ce qui est le cas d'une marketplace
-- qui ouvre, une SUITE de termes reste distinctive même sans identifiant qui
-- traverse les jours. L'en-tête de `0047` nomme les recherches qui font le
-- risque : « klinik avòtman », « tès VIH », « avoka pou divòs ». La fenêtre
-- pendant laquelle ces lignes coexistent est le seul paramètre qu'on contrôle
-- ici, et on la divise par deux.
--
-- LE FAIT QUI TRANCHE, ET IL NE VIENT PAS D'UN ARBITRAGE
-- ------------------------------------------------------
-- Le seul lecteur de cette table est déjà plafonné à 90 jours :
--
--   app/api/admin/search-demand/route.ts:40
--     const jours = Math.min(90, Math.max(1, Number(…) ?? 7));
--
-- C'est la SEULE route qui appelle `zabelie_search_demand`, et la fonction est
-- révoquée pour `anon` et `authenticated` (`0047:248`) : il n'existe aucun
-- autre chemin de lecture. Les jours 91 à 180 étaient donc conservés sans que
-- quiconque puisse les voir — que du risque, aucun usage. On ne choisit pas
-- entre deux compromis ici, on retire de la donnée morte.
--
-- Corollaire à ne pas oublier si le plafond de la route bouge un jour : c'est
-- LUI qui devra alors être discuté, et cette rétention avec.
--
-- EFFET À L'EXÉCUTION — à lire avant de lancer
-- --------------------------------------------
-- Cette migration ne supprime RIEN par elle-même : elle change un paramètre.
-- C'est le prochain passage de `zabelie_purge_search_misses()` qui appliquera
-- la nouvelle borne. Si des lignes de 90 à 180 jours existent, elles partiront
-- à ce moment-là — c'est l'intention, mais ce doit être une surprise pour
-- personne. Le compte est affiché ci-dessous avant le changement.
--
-- À la date d'écriture, la collecte n'est PAS active (`SEARCH_FINGERPRINT_
-- SALT` non posée, `lib/search-demand.ts:63`), donc la table est très
-- probablement vide. « Très probablement » n'est pas « vérifié » : la sonde
-- ci-dessous le dit pour de bon.
-- ============================================================================

-- ── Sonde AVANT : ce que le changement rendra purgeable ─────────────────────
-- Journalisée même à zéro, comme la purge elle-même. Un `notice` qui dit
-- « 0 ligne » est une information ; l'absence de notice n'en est pas une.
do $$
declare
  v_total   integer;
  v_entre   integer;
  v_actuel  integer;
begin
  select retention_days into v_actuel from zabelie_search_config where id;
  select count(*) into v_total from zabelie_search_misses;
  select count(*) into v_entre
    from zabelie_search_misses
   where created_at <  now() - interval '90 days'
     and created_at >= now() - make_interval(days => v_actuel);

  raise notice '0053 — rétention actuelle : % jours', v_actuel;
  raise notice '0053 — lignes en table : %', v_total;
  raise notice '0053 — lignes qui deviendront purgeables (90 à % j) : %', v_actuel, v_entre;
end $$;

update zabelie_search_config set retention_days = 90 where id;

-- ── Garde ZB053 : la post-condition, pas la confiance ───────────────────────
-- Un `update … where id` sur une table à ligne unique ne peut en principe pas
-- rater. « En principe » est exactement ce que ce dépôt a appris à ne pas
-- accepter : quatre fois dans le chantier B, une mutation supposée appliquée
-- ne l'était pas et l'instrument de vérification l'a confirmée quand même.
-- La migration échoue donc si elle n'a pas fait ce qu'elle annonce.
do $$
declare
  v_lignes integer;
  v_valeur integer;
begin
  select count(*) into v_lignes from zabelie_search_config;
  if v_lignes <> 1 then
    raise exception 'ZB053 — zabelie_search_config porte % ligne(s), 1 attendue', v_lignes
      using hint = 'La contrainte `id boolean primary key check (id)` garantit 0 ou 1. Zéro = la ligne d''amorçage de 0047 a disparu.';
  end if;

  select retention_days into v_valeur from zabelie_search_config where id;
  if v_valeur <> 90 then
    raise exception 'ZB053 — retention_days vaut % après l''update, 90 attendu', v_valeur;
  end if;

  raise notice '0053 — OK : retention_days = % jours', v_valeur;
end $$;

comment on column zabelie_search_config.retention_days is
  '90 jours (0053). Tranché, pas hérité : 90 couvre tout l''usage de sourcing '
  '(fenêtres 7/30/90) et divise par deux la période où des termes en clair '
  'coexistent sous une même empreinte de session.';
