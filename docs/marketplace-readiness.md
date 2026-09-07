# Zabelie — préparer les premières ventes réelles

État de cette proposition : 7 septembre 2026. Branche `feat/marketplace-readiness`.

## Décision produit

Zabelie met en relation vendeurs et acheteurs et porte le parcours de commande. Elle ne possède pas d’entrepôt et n’effectue pas les livraisons. La promesse doit préciser qui remet le produit, comment obtenir une réponse et comment signaler une non-réception.

Le catalogue ne doit jamais être rempli artificiellement. Les migrations 0100 et 0101 ont volontairement retiré les offres d’essai et isolé les comptes de test. Les boutiques, avis, messages, stocks, galeries et vidéos produit existent déjà : le prochain investissement doit les rendre utiles avec de vrais vendeurs.

## Changements de cette branche

- Page de création physique : explique le brouillon et la revue, guide les photos, la description, les stocks et la remise, conserve la destination après connexion.
- Description visible avec conseils sur l’état, le contenu et la zone de remise. L’adresse exacte reste à partager en privé.
- En cas d’échec HTTP ou réseau de la photo après création, conserve l’identifiant du brouillon et permet de renvoyer la photo. Aucun second POST de création pendant cette reprise. Une sortie mène au produit dans l’espace vendeur.
- Fiche physique : lieu, disponibilité, délai et frais éventuels à convenir avant paiement ; accès à la messagerie avant l’achat. Un visiteur se connecte avec un retour à la même fiche ; le vendeur voit un texte adapté.
- Aide non-réception accessible depuis Mes achats, qui décrit les actions existantes et leur disponibilité. Les contacts ne sont affichés que s’ils sont configurés.
- Nouveaux textes en français, kreyòl, anglais et espagnol. La dette de traduction des anciens champs physiques demeure distincte.

Ces changements ne publient aucun produit, ne changent ni les règles de revue, ni les fonds, ni les migrations, ni les paramètres des paiements.

## Ordre recommandé pour devenir une référence

| Priorité | Livrable | Preuve de réussite |
|---|---|---|
| 1 — Offre réelle | Accompagner un premier groupe de vendeurs dans quelques rayons cohérents, avec photos et stocks réels | Fiches revues et publiées, parcours vendeur utilisable sans assistance |
| 1 — Paiement | Vérifier l’état actuel de MonCash dans l’outil administrateur existant, puis éprouver une transaction réelle autorisée et son rapprochement | Confirmation opérateur, commande et écritures concordantes ; le seul clic de paiement ne compte pas |
| 1 — Assistance | Confirmer les contacts disponibles, les responsables et le traitement des signalements | Un incident peut être retrouvé, suivi et résolu sans promesse de remboursement automatique |
| 2 — Remise | Ajouter un accord structuré par commande : zone, modalité, délai, frais, acceptation des deux parties | Accord consultable avant paiement et conservé avec les échanges ; intégration au total décidée et testée séparément |
| 2 — Réputation | Exposer les mesures réelles du vendeur : avis d’achats, commandes abouties et réponses ; définir les critères avant tout badge | Aucun badge sans contrôle ni statistique sur un échantillon insuffisant |
| 3 — Commerce vidéo | Exploiter les vidéos réelles des vendeurs avec un lien produit, puis tester un programme créateurs sur les ventes confirmées | Vidéo → fiche → achat confirmé mesurables ; commissions définies, traçables et protégées contre l’auto-achat |
| 3 — Découverte | Étendre les filtres utiles et les recommandations à partir du catalogue réel | Moins de recherches sans résultat et davantage de fiches pertinentes consultées |

Les nombres de vendeurs ou de produits sont des objectifs de travail à fixer, jamais des statistiques à afficher comme acquises. Les rapports récents d’OPS_TODO décrivent des paiements MonCash échoués et des prérequis d’exploitation : revérifier l’état actuel, sans transformer une note historique en diagnostic temps réel.

## Différenciation proposée

Construire le parcours « voir un vrai produit en vidéo → parler au vendeur → convenir de la remise → payer → suivre et donner un avis ». Miser sur le kreyòl, le français, les gourdes, les zones locales et un site léger sur mobile. Les métriques directrices sont les commandes effectivement abouties et le réachat ; vues et inscriptions ne suffisent pas.

Le modèle TikTok Shop inspire la découverte vidéo et les liens vers les produits. Il ne faut pas en déduire que les règles logistiques ou de paiement de TikTok s’appliquent à Zabelie. Références consultées :

- [TikTok Shop : vidéos avec liens produit](https://seller-us.tiktok.com/university/essay?default_language=en&identity=1&knowledge_id=6160394680010539)
- [eBay : standards de performance vendeur](https://www.ebay.com/help/policies/selling-policies/seller-performance-policy?id=4347)

## Validation

Les scénarios `e2e/parcours-physique-confiance.spec.ts` utilisent exclusivement le stub local : reprise photo HTTP/réseau sans seconde création, création refusée avec conservation du formulaire, connexion et retour à la fiche, accès à la messagerie, aide dans quatre langues et vues mobile/ordinateur. Ils ne prouvent pas le fonctionnement d’un compte ou d’un paiement en production.

Résultats locaux : compilation réussie ; lint sans erreur (9 avertissements) ; 31 tests ciblés réussis ; 30 scénarios Chrome réussis. La suite unitaire complète donne 996 réussites et 19 échecs, exactement comme la mesure avant modification sur le même poste Windows. Les captures mobile et ordinateur ont été examinées. Les résultats CI Linux restent à consulter sur la pull request.
