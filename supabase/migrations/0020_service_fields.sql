-- Zabelie Digi — Page service (délai + inclus)
-- Champs d'AFFICHAGE uniquement, ajoutés à products existant : aucune nouvelle
-- logique financière, aucun nouveau prix. price_htg reste l'unique source de
-- vérité du montant (inchangé), vérifiée au checkout comme avant.

alter table products
  add column delivery_days integer
    check (delivery_days is null or delivery_days > 0),
  add column service_includes text[];
