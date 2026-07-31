-- ============================================================================
-- 0049 — Retire `zabelie_handle_new_user` de la surface RPC
-- ============================================================================
-- ⚠️ APPLIQUÉE le 2026-07-31, juste après `0045`.
--
-- CE QU'ON CORRIGE
-- ----------------
-- `0045` crée `zabelie_handle_new_user()` en `security definer` mais ne la
-- révoque pas. PostgREST expose alors `/rest/v1/rpc/zabelie_handle_new_user`
-- à `anon` ET à `authenticated` — le linter Supabase le signale en WARN
-- (`anon_security_definer_function_executable`).
--
-- POURQUOI UNE MIGRATION DE PLUS PLUTÔT QU'UNE CORRECTION DE `0045`
-- -----------------------------------------------------------------
-- `0045` est appliquée et son empreinte est inscrite au registre. La modifier
-- ferait diverger le fichier de ce qui tourne, et le registre signalerait un
-- écart dès le lendemain — exactement le signal qu'on apprend à ignorer.
-- Une migration appliquée ne se réécrit pas ; elle se complète.
--
-- CE QUE CE N'ÉTAIT PAS
-- ---------------------
-- Mesuré avant de corriger, pas supposé : l'appel direct échoue déjà en
-- `0A000` — « trigger functions can only be called as triggers ». Il n'y avait
-- donc aucune voie d'exécution réelle. On révoque quand même, pour deux
-- raisons. La règle du dépôt ne dit pas « aucune fonction `security definer`
-- EXPLOITABLE exposée à `anon` », elle dit « aucune exposée sans garde » ; et
-- un avertissement de linter qu'on décide de tolérer est un avertissement que
-- personne ne relira le jour où il désignera autre chose.
-- ============================================================================

revoke all on function zabelie_handle_new_user()
  from public, anon, authenticated;

-- Même traitement pour l'autre fonction de déclencheur introduite par `0045`.
-- Elle n'est pas `security definer` et n'était donc pas signalée, mais elle n'a
-- aucune raison d'être appelable depuis l'API : la révoquer coûte une ligne.
revoke all on function zabelie_sanitize_profile_name()
  from public, anon, authenticated;
