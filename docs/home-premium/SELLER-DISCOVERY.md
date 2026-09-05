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
