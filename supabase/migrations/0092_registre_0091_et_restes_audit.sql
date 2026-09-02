select zabelie_migration_garde('0092_registre_0091_et_restes_audit.sql');

-- ============================================================================
-- 0092 — Inscription de 0091 au registre + deux restes de l'audit du 2026-09-02
-- ============================================================================
-- Trois gestes, tous mesurés avant d'être écrits :
--
--   1. `0091` n'avait AUCUNE ligne au registre — 91 fichiers sur disque, 90
--      lignes. Le motif exact de `0067` (CLAUDE.md : « un registre qui se
--      déclare complet doit être croisé avec le disque »). Par convention, une
--      migration de registre n'inscrit pas sa propre ligne ; celle de `0091`
--      arrive ici. Empreinte croisée (méthode `0086`) : SHA-256 du fichier de
--      `main` = SHA-256 de `statements[1]` dans le journal Supabase =
--      7198aba015d2737afbce70391b8287d366e87683235af10ccefce9a8e46b8e50.
--      Appliquée le 2026-08-22 19:35:02 UTC (version 20260822193502).
--
--   2. `zabelie_messages_touch_conversation()` (`0090:120`) est `security
--      definer` et EXÉCUTABLE PAR `anon` — mesuré via has_function_privilege.
--      `0049` révoque ce type de fonction-trigger pour toutes les précédentes ;
--      `0090` a oublié la sienne. Risque faible (`returns trigger`, non
--      invocable par PostgREST), mais la règle est la règle : aucune
--      `security definer` exposée à `anon` sans garde.
--
--   3. `product_reviews.buyer_id` est filtrée par la RLS (`0008`) et n'a pas
--      d'index — seule colonne dans ce cas sur 77 tables. Chaque lecture des
--      avis d'un acheteur balaie la table.
--
-- Cette migration n'inscrit pas sa propre ligne (même convention). Entre son
-- application et la passe suivante, le registre est incomplet d'une ligne —
-- c'est la convention, pas un défaut, et `0091` l'avait déjà nommé.
-- ============================================================================

-- ── 1. Ligne de 0091 ───────────────────────────────────────────────────────
insert into zabelie_schema_migrations
  (filename, sha256, applied_at, applied_by, statut, preuve, note)
values
  ('0091_registre_0089_0090.sql',
   '7198aba015d2737afbce70391b8287d366e87683235af10ccefce9a8e46b8e50',
   '2026-08-22 19:35:02+00',
   'porteur — autorisation permanente du 2026-08-17, appliquee par agent via MCP',
   'appliquee', 'journal_supabase',
   'Migration de registre : elle a inscrit 0089 et 0090. Empreinte croisee '
   '(methode 0086) = 7198aba015d2737afbce70391b8287d366e87683235af10ccefce9a8e46b8e50 '
   'des deux cotes. Sa propre ligne arrive ici par convention — trouvee '
   'manquante par l audit du 2026-09-02 (91 fichiers, 90 lignes).')
on conflict (filename) do nothing;

-- ── 2. Révocation oubliée par 0090 ────────────────────────────────────────
revoke all on function zabelie_messages_touch_conversation()
  from public, anon, authenticated;

-- ── 3. Index manquant sous la RLS de 0008 ─────────────────────────────────
create index if not exists reviews_buyer_idx on product_reviews (buyer_id);

-- ── Post-condition ──────────────────────────────────────────────────────────
-- On assert sur le CONTENU et sur l'EFFET, jamais sur la seule présence : un
-- `on conflict do nothing` rend un succès silencieux quand la ligne était
-- déjà là avec autre chose, et un `revoke` sur une fonction déjà révoquée ne
-- dit rien.
do $$
declare
  v_ok_ligne  boolean;
  v_anon_exec boolean;
  v_index     boolean;
begin
  select exists (
    select 1 from zabelie_schema_migrations
     where filename = '0091_registre_0089_0090.sql'
       and sha256   = '7198aba015d2737afbce70391b8287d366e87683235af10ccefce9a8e46b8e50'
       and statut   = 'appliquee'
       and preuve   = 'journal_supabase'
  ) into v_ok_ligne;

  select has_function_privilege('anon', 'zabelie_messages_touch_conversation()', 'EXECUTE')
    into v_anon_exec;

  select exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'product_reviews'
       and indexname = 'reviews_buyer_idx'
  ) into v_index;

  if not v_ok_ligne then
    raise exception '0092 KO: la ligne de 0091 est absente ou divergente au registre'
      using errcode = 'ZB092';
  end if;
  if v_anon_exec then
    raise exception '0092 KO: zabelie_messages_touch_conversation() reste executable par anon'
      using errcode = 'ZB092';
  end if;
  if not v_index then
    raise exception '0092 KO: reviews_buyer_idx absent'
      using errcode = 'ZB092';
  end if;

  raise notice '0092 OK: 0091 inscrite, trigger revoque, index pose';
end $$;
