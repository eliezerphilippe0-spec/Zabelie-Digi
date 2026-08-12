select zabelie_migration_garde('0066_commission_taux_lecture.sql');

-- ============================================================================
-- 0066 — LIRE LE TAUX DE COMMISSION DEPUIS L'ÉCRAN DU VENDEUR
-- ============================================================================
-- ⚠️ PREMIÈRE MIGRATION GARDÉE. L'appel ci-dessus, en première instruction
-- exécutable, vient de `0065` : si ce fichier est déjà inscrit `appliquee` au
-- registre, il refuse de tourner.
--
-- ─── LE TROU QUE `0054` NOMME ELLE-MÊME ─────────────────────────────────────
-- `0054` déplace les taux en table de configuration et garde la signature de
-- `commission_rate_bps` : tous les appelants SQL du chemin d'argent suivent
-- sans redéploiement. Son en-tête nomme pourtant ce qu'elle ne peut pas
-- résoudre seule :
--
--   « `lib/commission.ts` (RATE_BPS) porte les mêmes constantes pour
--     l'ESTIMATION côté écran. […] Tant qu'aucune API n'expose la config au
--     front, tout UPDATE d'un taux DOIT s'accompagner de la mise à jour de
--     `lib/commission.ts`. »
--
-- Autrement dit : appliquer `0054` seule ferait d'un `UPDATE` d'exploitation
-- un geste à DEUX mains — la base d'un côté, un fichier TypeScript et un
-- redéploiement de l'autre — sans que rien ne signale l'oubli. Le vendeur
-- verrait « Vous recevez 900 HTG » et toucherait autre chose. Une estimation
-- fausse a l'air d'un engagement : c'est exactement ce que `ROUNDING_IN_FORCE`
-- documente déjà pour l'arrondi.
--
-- ─── POURQUOI UNE FONCTION, ET PAS UN SIMPLE `GRANT` ────────────────────────
-- `zabelie_commission_config` porte RLS active et `revoke all` pour `anon` et
-- `authenticated` (`0054`), et la page `/vendre` s'exécute avec le client de
-- SESSION (clé anon) — pas avec le service-role. Elle ne peut donc pas lire la
-- table. Trois voies existaient :
--
--   • ouvrir la table en lecture — élargit la surface à ses colonnes futures ;
--   • lire côté serveur avec le service-role — ferait dépendre l'estimation
--     d'un vendeur d'une clé aujourd'hui HORS D'USAGE en production, et qui
--     bloque déjà tout le stockage ;
--   • une fonction `security definer` qui ne rend QUE le couple (tier, taux).
--
-- La troisième est retenue. Ce qu'elle expose n'est pas un secret : 10 % et
-- 6 % sont des conditions commerciales publiques, déjà affichées. Elle est
-- accordée à `authenticated` seulement — `/vendre` exige un compte — et pas à
-- `anon`, par moindre privilège : le jour où une page publique en aura besoin,
-- ce sera une décision, pas un héritage.
--
-- ─── CE QUE CETTE MIGRATION NE FAIT PAS ─────────────────────────────────────
-- Elle ne touche à AUCUN calcul d'argent. `commission_rate_bps` reste le seul
-- taux consommé par `confirm_payment` ; cette fonction-ci ne sert qu'à
-- AFFICHER. La règle du dépôt ne bouge pas d'un pouce : la SQL calcule,
-- l'écran estime.
-- ============================================================================

-- PRÉCONDITION EXPLICITE. Sans elle, la création échouerait sur un message de
-- catalogue (« relation does not exist ») qui n'apprend rien à qui l'exécute.
do $$
begin
  if to_regclass('public.zabelie_commission_config') is null then
    raise exception
      'ZB066 : zabelie_commission_config absente — appliquer 0054 AVANT 0066. Cette migration expose la config, elle ne la crée pas.'
      using errcode = 'ZB066';
  end if;
end $$;

/**
 * Les taux de commission en vigueur, pour AFFICHAGE.
 *
 * `stable` et non `immutable` : elle lit une table. `security definer` parce
 * que la table est fermée aux rôles client — c'est le seul but de cette
 * fonction, et elle ne rend rien d'autre que deux entiers déjà publics.
 */
create function zabelie_commission_taux()
returns table (tier creator_tier, rate_bps integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.tier, c.rate_bps from zabelie_commission_config c order by c.tier;
$$;

revoke all on function zabelie_commission_taux() from public, anon;
grant execute on function zabelie_commission_taux() to authenticated;

comment on function zabelie_commission_taux() is
  'Taux de commission en vigueur, pour AFFICHAGE uniquement (estimation du net vendeur). Le calcul d''argent reste commission_rate_bps + confirm_payment. security definer car zabelie_commission_config est fermée aux rôles client ; accordée à authenticated seulement.';

-- ─────────── POST-CONDITIONS ────────────────────────────────────────────────
do $$
declare
  v_lignes integer;
  v_std    integer;
  v_droits integer;
begin
  select count(*) into v_lignes from zabelie_commission_taux();
  if v_lignes < 2 then
    raise exception 'ZB066 : la fonction rend % ligne(s), au moins 2 attendues (standard, elite)', v_lignes;
  end if;

  -- La fonction doit rendre CE QUE LA TABLE CONTIENT, pas une constante. On
  -- le vérifie en comparant à la table elle-même : une fonction qui
  -- renverrait 1000 en dur passerait n'importe quel contrôle de forme.
  select rate_bps into v_std from zabelie_commission_taux() where tier = 'standard';
  if v_std is distinct from (select rate_bps from zabelie_commission_config where tier = 'standard') then
    raise exception 'ZB066 : le taux rendu (%) ne correspond pas a la table', v_std;
  end if;

  -- `anon` ne doit PAS pouvoir l'exécuter : la moindre privilège est le seul
  -- argument qui justifiait `security definer`.
  select count(*) into v_droits
    from information_schema.role_routine_grants
   where routine_name = 'zabelie_commission_taux' and grantee in ('anon', 'PUBLIC');
  if v_droits > 0 then
    raise exception 'ZB066 : zabelie_commission_taux exposee a anon/PUBLIC';
  end if;

  raise notice 'ZB066 OK — taux lisibles par authenticated, standard = % bps', v_std;
end $$;
