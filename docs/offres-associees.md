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

## Suggestions automatiques fondées sur les achats — 22 septembre 2026

Le même bloc est complété par des recommandations de la même boutique. Les choix explicites du vendeur passent en premier ; chaque produit n’apparaît qu’une fois et l’ensemble reste limité à trois cartes. « Également achetés dans cette boutique » distingue les suggestions calculées. Cette mention ne prétend pas que les commandes ont été réglées ensemble, ni que des accessoires sont techniquement compatibles.

Le moteur exige au moins **5 acheteurs distincts** ayant acheté les deux produits à moins de **30 jours** d’intervalle, dans un historique de **180 jours**. La paire doit concerner au moins **20 %** des acheteurs de la source. Les paramètres sont bornés dans `zabelie_recommendation_config`, accessible exclusivement au serveur. Le classement utilise la similarité cosinus des co-achats (au carré), puis le nombre d’acheteurs et un départage stable ; un produit populaire dans toute la boutique ne gagne donc pas par son seul volume.

Les commandes doivent être payées/livrées, avoir un montant positif, un paiement confirmé et le marqueur serveur de paiement réel. Sont exclus les essais, les comptes de test/suspendus, les achats du vendeur lui-même, les remboursements, les litiges et les paiements non confirmés. Plusieurs commandes ou confirmations d’un acheteur ne lui donnent pas plusieurs voix. Les anciens achats dont le mode réel n’est pas attesté ne sont pas réétiquetés. Le marqueur existant `zabelie_payment_is_live` est désormais enregistré au checkout indépendamment de l’activation des tarifs vendeurs ; aucune tarification n’est activée par ce changement.

La disponibilité utilise la même fonction que les offres manuelles. Le calcul s’effectue en lecture à la demande, avec des index ciblés et une fenêtre bornée : remboursements, stock et préférences sont donc pris en compte immédiatement, sans nouvelle tâche planifiée ni fournisseur externe. Aucun identifiant d’acheteur ni nombre exact d’acheteurs n’est renvoyé dans les cartes. Aucun cookie de suivi supplémentaire.

Dans l’éditeur existant, le vendeur peut décocher « Autoriser les suggestions basées sur les achats ». La préférence et les offres choisies sont enregistrées dans la même transaction. Désactiver les suggestions conserve les offres manuelles.

Le lien automatique transmet seulement le produit source. Le serveur vérifie que la cible est encore recommandable avant d’enregistrer `orders.zabelie_recommendation_source_id` ; un lien devenu invalide est ignoré sans changer le montant. Le vendeur dispose d’un compteur séparé des achats réels confirmés issus de ces liens, hors remboursements. Il s’agit d’attribution par lien, pas d’une preuve de clic humain ni d’une mesure causale d’augmentation des ventes. Les impressions, tests A/B et paiements groupés restent hors de cette livraison.

**Démarrage sans historique :** si le seuil n’est pas atteint, aucun message de popularité ni suggestion automatique n’est affiché ; les associations manuelles restent utilisables. Au précontrôle de production du 22 septembre, la base contenait zéro achat confirmé et zéro produit publié. Les scénarios positifs sont donc vérifiés sur données synthétiques en CI, jamais fabriqués en production.

Migration additive `0111_purchase_recommendations.sql`, après CI SQL verte et avant le déploiement. Contrôles : historique insuffisant, répétitions, mode test, gratuité, confirmation serveur, fenêtres de dates, popularité, choix vendeur, préférence, stock, prix et attribution ; Chrome à 390/1280 px, sauvegarde et achat explicite. Browser plugin absent : Playwright et Chrome local sont utilisés.
