# Inventaire des catégories Zabelie — 7 septembre 2026

Lecture seule de la production `ddditxykopuxxqzgkqwy`. Aucune activation,
écriture de données ou migration effectuée pendant cet audit.

| Niveau | Présentes | Actives | Fermées |
|---|---:|---:|---:|
| Grandes familles | 16 | 16 | 0 |
| Catégories | 74 | 10 | 64 |
| Sous-catégories | 494 | 47 | 447 |
| Total | 584 | 73 | 511 |

Le rapprochement des slugs, niveaux et parents avec les migrations 0035,
0051, 0057, 0077, 0078, 0096 et 0097 retrouve exactement 584 entrées :
zéro manquante, zéro supplémentaire, zéro parent ou niveau divergent.
Les collisions de seed conservées par ON CONFLICT et les sept suppressions
volontaires de 0096 sont prises en compte. La réparation Bagagerie 0078 est présente.

Contrôles SQL : zéro orpheline, zéro profondeur incohérente, zéro enfant actif
sous un parent inactif, zéro doublon exact de libellé français sous un même
parent. Les 74 catégories ont des sous-catégories. Aucun produit publié.

FR, créole et EN sont renseignés sur toutes les entrées. Les 447 nouvelles
sous-catégories fermées n'ont pas de traduction espagnole ; le code prévoit
un repli explicite sur le français. Les 73 entrées actives sont traduites
également en espagnol. Une révision sémantique des traductions n'est pas
incluse dans ce contrôle de présence.

## Correction de navigation

La nouvelle page /categories expose les trois niveaux ACTIFS, y compris
sans produits, avec mention explicite de l'absence d'offres. Recherche
insensible à la casse et aux accents, conservation des parents d'une feuille
trouvée, liens GET utilisant le libellé français du département et le slug
de la sous-catégorie. Accès depuis l'en-tête, l'accueil et le pied de page.

La lecture reste sous RLS, avec le client de session existant. Aucun accès
administrateur ajouté, aucune catégorie fermée rendue publique et aucun
paiement ou service de recharge activé. L'ouverture commerciale des 511
entrées fermées reste une décision distincte de leur présence en base,
conformément à l'ouverture par vagues consignée dans OPS_TODO.

Ce document est un relevé daté, pas une source de configuration du site.
