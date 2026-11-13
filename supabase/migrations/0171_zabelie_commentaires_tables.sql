select zabelie_migration_garde('0171_zabelie_commentaires_tables.sql');

-- ─────────────────────────────────────────────────────────────────────────────
-- 0171 — DEUX COMMENTAIRES DE TABLE RÉÉCRITS.
--
-- ⚠️ ÉTAT : RÉDIGÉE, NON APPLIQUÉE. Le porteur l'applique.
--
-- POURQUOI. Consigne du porteur du 2026-11-13 : Zabelie s'inspire, elle ne
-- copie pas, et ni le dépôt ni la base ne portent le nom d'une autre place de
-- marché. Deux commentaires de table, posés par `0081` et `0082`, en citaient
-- une. Ces deux fichiers sont appliqués : leur SQL exécutable ne bouge plus.
-- Le commentaire se remplace donc ici, par une migration à la suite.
--
-- LE GESTE. `comment on table`, deux fois. Le sens de chaque commentaire est
-- gardé mot pour mot ; seul le nom cité en sort.
--
-- ─── CE QUE ÇA NE CHANGE PAS ────────────────────────────────────────────────
-- Aucune colonne, aucune contrainte, aucune policy, aucune fonction, aucune
-- donnée. Un commentaire de table ne se lit que dans le catalogue Postgres.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

comment on table zabelie_order_attribution is
  'Attribution FIGÉE à la création de la commande : le taux du moment, pas celui du paiement. Aucune mise à jour possible (ZB081b).';

comment on table zabelie_pickup_points is
  'Points de retrait partenaires (docs/37, modèle station). actif=false à la création : un point s''ouvre quand l''accord avec la boutique est réel, pas quand la ligne existe.';

-- ── Post-conditions ──────────────────────────────────────────────────────────
-- Le texte attendu est comparé en entier : un commentaire resté tel qu'avant,
-- ou réécrit à moitié, fait échouer la migration.
do $$
begin
  if obj_description('public.zabelie_order_attribution'::regclass, 'pg_class') is distinct from
     'Attribution FIGÉE à la création de la commande : le taux du moment, pas celui du paiement. Aucune mise à jour possible (ZB081b).' then
    raise exception '0171 KO: commentaire de zabelie_order_attribution inattendu';
  end if;
  if obj_description('public.zabelie_pickup_points'::regclass, 'pg_class') is distinct from
     'Points de retrait partenaires (docs/37, modèle station). actif=false à la création : un point s''ouvre quand l''accord avec la boutique est réel, pas quand la ligne existe.' then
    raise exception '0171 KO: commentaire de zabelie_pickup_points inattendu';
  end if;
  raise notice '0171 OK — deux commentaires de table réécrits';
end $$;

commit;
