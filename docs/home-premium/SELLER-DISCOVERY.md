# Accueil : découverte des vendeurs et remise directe

Demande du porteur, 2026-09-05 : appliquer les améliorations de l’accueil en tenant compte du modèle actuel inspiré de TikTok Shop. Zabelie ne possède pas d’entrepôt et n’assure pas la livraison.

Base : `20d187404f3204a53553bd7012685dce2f9ae536` (PR 209 fusionnée).

## Comportement

La sélection principale affiche les offres publiées dès le premier produit, sur mobile comme sur ordinateur. Les rangées secondaires gardent leurs seuils et les meilleurs vendeurs restent conditionnés à des ventes payées. Aucun produit, avis ou vendeur fictif n’est ajouté au catalogue public.

La bannière présente les offres des vendeurs haïtiens. Un texte explique les produits, fichiers numériques et services. Avant le bloc fondateur et l’ouverture de boutique, un parcours en trois étapes explique l’achat, et précise que la remise physique se convient avec le vendeur avant paiement. Zabelie est explicitement décrite comme intermédiaire, sans stockage ni livraison. Les quatre langues sont mises à jour.

Cette modification concerne l’accueil. Elle n’ajoute pas de flux vidéo, de live ni d’intégration TikTok, et ne modifie ni le paiement, ni les commandes, ni les données de production.

## Vérification

- Chrome installé, via Playwright et agent-browser, sur un serveur local et la base simulée du dépôt.
- Un seul produit physique : visible à 390 px et 1440 px ; aucun débordement horizontal ; accès à sa fiche vérifié par les deux tests `e2e/parcours-physique-accueil.spec.ts`.
- 30 tests ciblés passent : accueil, cartes, parité des traductions et garde des promesses commerciales.
- Compilation et typage vérifiés ; les captures locales utilisent un produit simulé et ne représentent pas le catalogue de production.
- La suite complète est comparée à un worktree inchangé du commit de base. Sous Windows, la base compte 943 tests, dont 926 passent et 17 échouent. Plusieurs contrôles dépendent des séparateurs de chemins ou des fins de ligne. La version modifiée compte 944 tests : 927 passent et les mêmes 17 échouent, sans échec supplémentaire.

La mise en production doit être distinguée de cette préparation et de la vérification locale.


## Refonte visuelle complémentaire

À la demande du porteur de pousser la qualité de l’accueil, la composition utilise désormais une offre publiée dans la bannière (photo réelle lorsqu’elle existe), des liens vers les catégories réellement présentes et une présentation plus généreuse de la sélection. Avec une seule offre, la carte devient horizontale. Les cartes sans image affichent explicitement une absence de photo. Aucun avis, vidéo, volume de ventes ou badge de vérification n’est inventé.

Le catalogue vide et le catalogue indisponible ont désormais des messages et des actions distincts. Les blocs d’achat, d’aide et d’ouverture de boutique suivent une hiérarchie plus lisible. La mise en page utilise les tokens et polices existants, avec CSS responsive et prise en compte du mouvement réduit, sans dépendance supplémentaire.

Validation complémentaire : compilation réussie ; lint sans erreur (10 avertissements inchangés) ; 30 tests ciblés réussis ; 927/944 tests complets réussis, mêmes 17 échecs que la base. Les deux tests du parcours produit passent sur la version compilée. Un harnais local Chrome a aussi validé 19 scénarios : 360, 768 et 1440 px pour cinq états (normal, sans photo, trois offres, vide, indisponible), puis quatre langues en thème sombre. Aucun débordement horizontal ni erreur JavaScript détecté. Le contrôle des paires de contraste de la marque passe. Ces mesures utilisent la base simulée, pas la production.

Le premier build a été interrompu par un disque plein. Le cache `.next` créé par cette tâche a été nettoyé, puis la compilation a réussi. Les premières captures utilisent la photo orange de la fixture existante ; les captures sans photo montrent le véritable état de repli.

Une note de design reste une appréciation. La qualité commerciale devra être validée avec les vraies photos, offres et retours des clients ; cette refonte n’est pas une mesure de conversion.
