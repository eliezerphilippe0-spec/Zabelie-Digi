# Offres associées : upsell, complément et alternative

Le vendeur configure au plus une offre de chaque type dans **Vendre → Mes produits → Offres associées**. Les offres viennent de ses produits publiés. Une cible ne peut pas occuper deux emplacements sur une même fiche.

- Version supérieure : même type de produit, prix courant strictement supérieur.
- Produit complémentaire : produit distinct de la même boutique ; il se commande séparément.
- Alternative économique : même type, prix courant strictement inférieur ; affichée lorsque l’acheteur ouvre « Voir une option plus accessible ».

Les propositions mènent à une fiche produit. La navigation ne crée aucune commande ; le bouton Payer existant reste nécessaire et le serveur relit toujours le prix, la variante, le stock et les promotions. Aucun paiement groupé ni débit automatique n’est ajouté.

Après paiement, seul le complément est présenté, uniquement quand la base confirme une commande payée ou livrée appartenant à l’utilisateur connecté. Les pages d’échec ne déclenchent pas de downsell : une erreur réseau ne prouve pas un refus de prix.

## Disponibilité et mesure

La base masque automatiquement une association désactivée, un produit non publié, un vendeur suspendu ou de test, une recharge téléphonique, une cible physique sans stock et une montée/descente de gamme devenue incohérente après un changement de prix. Pendant une vente flash sur la source ou la cible, la proposition est masquée pour éviter un prix indicatif périmé. Un produit digital déjà acheté par cet acheteur n’est pas reproposé.

Les ventes confirmées sont comptées par lien d’offre depuis le champ nullable orders.zabelie_offer_id. Ce champ n’influence aucun prix ni commission. Le trigger vérifie que le lien correspond au produit commandé et ignore une attribution périmée ou falsifiée. Les commandes en attente, annulées et remboursées ne sont pas comptées. Ce compteur mesure une attribution par lien, pas l’incrément de ventes causé par la proposition. Les associations sont désactivées plutôt que supprimées pour conserver leur historique.

Les achats déjà existants restent sans attribution ; aucun historique commercial n’est inventé. Aucune offre n’est préconfigurée pour les vendeurs.

## Livraison et validation

Migration additive 0110_product_offers.sql avant déploiement. Table protégée par RLS ; lecture du paramétrage réservée au propriétaire et mutations exclusivement via le serveur authentifié. Fonctions privilégiées révoquées pour anon/authenticated et enregistrées dans la sonde de schéma.

Validation : tests unitaires de configuration, cohérence et traductions ; tests SQL de propriété, absence de doublons, visibilité, attribution, statistiques et RLS ; parcours Chrome mobile/ordinateur de sauvegarde, navigation sans achat automatique, montant réellement enregistré, suppression et complément après achat confirmé. Le Browser plugin n’est pas disponible dans cette session : Playwright utilise Chrome local. Les paiements des essais restent simulés.
