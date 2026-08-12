-- ============================================================================
-- 0065 — GARDE DE REJEU : une migration déjà appliquée refuse de tourner
-- ============================================================================
-- Mesuré le 2026-08-11, et c'est le fait qui ouvre le dossier : `apply_migration`
-- écrit dans `supabase_migrations.schema_migrations`, le registre interne de
-- Supabase, et **ne consulte JAMAIS `zabelie_schema_migrations`**. Deux
-- journaux indépendants, aucun ne gardant l'autre. Rien, techniquement,
-- n'empêche de rejouer une migration déjà appliquée.
--
-- ─── CE QUE ÇA NE CORRIGE PAS, ET IL FAUT LE DIRE ───────────────────────────
-- Mesuré avant d'écrire une ligne, comme pour le bail de `0060` :
--
--   • **aucun rejeu n'a jamais eu lieu** — 51 noms au journal interne, zéro
--     doublon ;
--   • 29 migrations sur 64 rejoueraient en SILENCE (pas de `create table` pour
--     lever), mais **aucune ne serait endommagée** : ce sont des
--     `create or replace function`, idempotents. Les deux seules qui mutent
--     des données — `0038` (`zabelie_stock_limits` à 120) et `0053`
--     (`retention_days` à 90) — posent une valeur ABSOLUE, donc rejouables
--     sans dégât.
--
-- Ce garde ne répare donc RIEN aujourd'hui, et le présenter autrement serait
-- un filet posé sur un chemin déjà sûr.
--
-- ─── CE QUE ÇA APPORTE ──────────────────────────────────────────────────────
-- Ces 64 innocuités sont 64 propriétés ACCIDENTELLES, pas une garantie. La
-- soixante-cinquième migration — écrite dans six mois, par quelqu'un qui
-- n'aura pas relu celles-ci — contiendra peut-être un `insert` sans
-- `on conflict`, ou un `update … set x = x + 1`. Elle n'hérite de rien.
--
-- C'est le même raisonnement que `0060` sur les crons, et c'est délibérément
-- le même : on transforme une discipline en garantie structurelle.
--
-- ─── LA LIMITE, ÉCRITE ICI PARCE QU'ELLE EST RÉELLE ─────────────────────────
-- Ce garde lit `zabelie_schema_migrations`, qui est renseigné **à la main,
-- après coup**. Donc :
--
--   appliquer → inscrire → rejouer   : le garde LÈVE.          ✅
--   appliquer → oublier d'inscrire → rejouer : le garde SE TAIT. ❌
--
-- Il vaut exactement ce que vaut la discipline d'inscription. Ce n'est pas un
-- défaut qu'on cache : c'est la raison pour laquelle `0062` a rendu `statut`
-- obligatoire et `0063` a complété le registre — sans un registre complet,
-- ce garde n'aurait aucune prise.
--
-- ─── POURQUOI PAS LE JOURNAL INTERNE, QUI SERAIT PLUS SÛR ───────────────────
-- `supabase_migrations.schema_migrations` est écrit AUTOMATIQUEMENT par
-- `apply_migration` : y lire un doublon ne dépendrait d'aucune discipline
-- humaine. Ce serait strictement meilleur.
--
-- **Sauf qu'on ignore une chose, et qu'on ne va pas la deviner** : cette ligne
-- est-elle insérée AVANT ou APRÈS l'exécution des instructions ? Si c'est
-- avant, le garde verrait sa propre ligne et lèverait à chaque première
-- application — il serait pire qu'inutile, il bloquerait tout. La donnée
-- n'existe nulle part dans ce dépôt, et la mesurer demanderait une écriture en
-- production faite exprès.
--
-- Le garde s'abstient donc d'agir sur ce journal — et il le COMPTE, en
-- journalisant ce qu'il voit. À la première migration gardée, la trace dira
-- l'ordre d'insertion, et un `0066` pourra le renforcer sur une mesure au lieu
-- d'une hypothèse. C'est le corollaire d'observabilité appliqué à une
-- inconnue : on ne devine pas, on instrumente et on attend le passage.
-- ============================================================================

/**
 * À appeler en PREMIÈRE instruction exécutable de chaque migration, avec son
 * propre nom de fichier :
 *
 *     select zabelie_migration_garde('0066_ma_migration.sql');
 *
 * Première instruction, et pas ailleurs : appliquée par `psql` (la CI), chaque
 * instruction est sa propre transaction, donc tout ce qui précède l'appel
 * serait déjà COMMITÉ quand le garde lève.
 */
create function zabelie_migration_garde(p_fichier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut  text;
  v_journal integer;
begin
  if p_fichier is null or p_fichier !~ '^\d{4}_[a-z0-9_]+\.sql$' then
    raise exception 'ZB065 : nom de fichier de migration invalide (%)', p_fichier
      using errcode = 'ZB065';
  end if;

  select statut into v_statut
    from zabelie_schema_migrations where filename = p_fichier;

  if v_statut = 'appliquee' then
    raise exception
      'ZB065 : % est deja inscrite comme appliquee au registre — rejeu refuse. Si l''inscription est fausse, corrigez le registre AVANT de rejouer, jamais l''inverse.',
      p_fichier using errcode = 'ZB065';
  end if;

  -- OBSERVATION SANS ACTION — voir l'en-tête. On ne sait pas si
  -- `apply_migration` inscrit sa ligne avant ou après l'exécution ; on
  -- l'apprend en regardant, plutôt qu'en pariant.
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute format(
      'select count(*) from supabase_migrations.schema_migrations where name = %L',
      replace(p_fichier, '.sql', '')
    ) into v_journal;
    raise notice
      'ZB065 observation : % — journal interne Supabase = % ligne(s) PENDANT l''execution (0 = inscrit apres, >=1 = inscrit avant)',
      p_fichier, v_journal;
  end if;
end;
$$;

revoke all on function zabelie_migration_garde(text) from public, anon, authenticated;

comment on function zabelie_migration_garde(text) is
  'Garde de rejeu, à appeler en première instruction exécutable de chaque migration à partir de 0066. Lève ZB065 si le fichier est déjà inscrit `appliquee` au registre. Ne corrige aucun défaut existant — aucun rejeu n''a jamais eu lieu et aucune des 64 migrations ne serait endommagée par un — mais rend la sûreté structurelle pour celles à venir. Vaut ce que vaut la discipline d''inscription : appliquer sans inscrire le rend muet.';

-- ⚠️ `0065` est la DERNIÈRE migration non gardée, et c'est mécanique : elle
-- crée la fonction, elle ne peut pas s'appeler elle-même. À partir de `0066`,
-- `tests/migration-garde-rejeu.test.ts` échoue si l'appel manque ou s'il porte
-- un autre nom de fichier que le sien.
