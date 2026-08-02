-- ============================================================================
-- 0051 — Rayon « Klerin / Clairin » sous Produits locaux
-- ============================================================================
-- ⚠️ NON APPLIQUÉE. À exécuter par le porteur, et **pas avant** d'avoir lu la
--    section ci-dessous sur ce qu'elle engage.
--
-- ⚠️ ÉTAT DE LA BASE AU MOMENT DE L'ÉCRITURE — constaté, pas déduit
--    (`zabelie_schema_migrations` + catalogue, 2026-08-02) :
--    dernière migration appliquée `0050`. `0043` et `0044` sont écrites mais
--    NON appliquées ; cette `0051` ne dépend d'aucune des deux.
--
-- CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE N'OUVRE PAS
-- ------------------------------------------------------
-- Elle ajoute UNE ligne de niveau 3 sous `pwodwi-lokal` (Produits locaux),
-- lui-même sous `manje-machandiz` (Alimentation & épicerie). Elle ne rend
-- visible ni le rayon ni ses parents : `active = false`, comme les 12 autres
-- départements en attente de vague (`docs/16`). Ouvrir le rayon est un second
-- geste, délibérément séparé.
--
-- POURQUOI LE NIVEAU 3 ET PAS UN DÉPARTEMENT
-- Le clairin est un produit, pas une famille de produits. Lui donner un
-- département le mettrait au même rang qu'« Électronique » — et il faudrait
-- alors en faire autant pour le rhum, les liqueurs, le sirop. `pwodwi-lokal`
-- existe déjà et c'est exactement sa raison d'être.
--
-- ⚠️ CE QUE LE PORTEUR ENGAGE EN L'APPLIQUANT
-- Le clairin est un SPIRITUEUX. La politique produits interdits v1 ne disait
-- rien de l'alcool — ni pour l'autoriser, ni pour l'interdire. Un silence
-- n'est pas une autorisation, et il n'est surtout pas opposable à un vendeur.
-- La section « 9. Alcool » a donc été ajoutée et `POLICY_VERSION` est passée
-- à `v2` (`lib/policy.ts`).
--
-- Ce que cette section dit, et qu'il faut assumer avant d'ouvrir le rayon :
--   • Zabelie NE VÉRIFIE PAS l'âge de l'acheteur ;
--   • Zabelie NE LIVRE PAS — le contrôle a lieu à la remise, en main propre,
--     et il appartient au vendeur ;
--   • si une vérification d'âge devient obligatoire, la politique change de
--     version et les vendeurs doivent ré-accepter.
--
-- Aucune acceptation `v1` n'était enregistrée au moment du changement (vérifié
-- en base : `zabelie_policy_acceptances` est vide). Aucun vendeur n'est donc
-- tenu à un texte qu'il n'a pas lu — c'est précisément ce que `0046` existe
-- pour garantir le jour où il y en aura.
-- ============================================================================

-- Idempotent sur le slug : rejouer cette migration ne crée pas de doublon et
-- ne réactive pas un rayon que le porteur aurait volontairement refermé.
insert into zabelie_categories (parent_id, slug, level, label_kr, label_fr, label_en, active, position)
select p.id, 'klerin', 3, 'Klerin', 'Clairin', 'Clairin', false, 10
  from zabelie_categories p
 where p.slug = 'pwodwi-lokal'
on conflict (slug) do nothing;

-- Contrôle : la ligne existe et elle est bien RATTACHÉE, pas orpheline. Un
-- `insert ... select` sur un parent introuvable n'insère rien ET ne lève pas —
-- il rendrait « 0 ligne » en silence, ce qui ressemble à un succès.
do $$
declare v_parent text;
begin
  select p.slug into v_parent
    from zabelie_categories c
    join zabelie_categories p on p.id = c.parent_id
   where c.slug = 'klerin';

  if v_parent is null then
    raise exception
      'Rayon « klerin » absent ou orphelin : le parent « pwodwi-lokal » '
      'existe-t-il ? (0035 appliquée ?)'
      using errcode = 'ZB051';
  end if;

  raise notice 'OK — rayon klerin rattaché à %, inactif', v_parent;
end $$;
