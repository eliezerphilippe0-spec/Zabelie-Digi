# 35 — CHANTIERS VENDEUR : la liste du 2026-08-15, triée

Liste porteur (session du 2026-08-15, verbatim résumé) : multi photos/vidéos ·
fiche produit riche (dimensions, poids…) · toutes les sous-catégories ·
rabais avec ancien prix visible · nom + adresse à la création de compte ·
KYC vendeur (2 pièces d'identité) « système d'authentification haïtien ».

Ce document trie, dimensionne, et marque les zones d'arrêt. L'ordre proposé
va du moins bloqué au plus lourd d'arbitrages. **Un chantier à la fois**
(`docs/25` §1) ; chaque migration reste rédigée-non-appliquée jusqu'au signal.

## V-1 — Multi photos et vidéos par produit

**Tranche A (EN COURS) : jusqu'à 6 photos par produit.** Réutilise la filière
couverture (`/api/products/cover` : multipart ≤ 5 Mo, formats fermés, nom de
fichier serveur, bucket public `product-covers`, propriété vérifiée).
Nouvelle table `zabelie_product_media` (0073, **rédigée non appliquée**) —
position ordonnée, plafond par trigger ZB073, RLS lecture publiée-ou-vendeur,
écriture service-role. Galerie sur la fiche produit, gestionnaire côté
vendeur. Dormant sans 0073 : la fiche montre la couverture seule, comme
aujourd'hui.

**Tranche B : la vidéo — ARBITRÉE le 2026-08-15 (« 60s et 50 Mo ok »), livrée.**
Lien de téléversement **signé** (client → stockage direct, une route
serverless ne porte pas 50 Mo), puis **confirmation serveur** qui vérifie
l'objet réellement téléversé (existence, ≤ 50 Mo, type vidéo) avant
d'inscrire la ligne — un fichier hors contrat est supprimé, jamais inscrit.
La durée (60 s) se vérifie côté client avant l'envoi (métadonnées, zéro
octet transféré en cas de refus) ; la borne DURE reste le poids, côté
serveur. Une vidéo par produit (ZB073). Affichage : vignette ▶ dans la
galerie, lecture sur tap, `preload="none"`, jamais d'autoplay.

## V-2 — Fiche produit riche (dimensions, poids, attributs)

Attributs STRUCTURÉS par kind physique : poids (g, entier), dimensions
L×l×H (mm, entiers — jamais de flottants), marque, matière, état
(nèf/dezyèm-men). Migration colonnes + formulaire + affichage fiche façon
tableau « Caractéristiques ». S'articule avec le champ « détails réels » de
l'aide IA (les attributs remplis nourrissent la génération). Pas de zone
d'arrêt — chantier direct après V-1.

## V-3 — Sous-catégories complètes — ARBITRÉ le 2026-08-15, livré

Arbitrage porteur : « **ok pour tout seeder et activer par vagues** » —
l'option (a), compatible avec docs/16. Livré par `0077` : les **468
sous-catégories de niveau 3** du document (le niveau 2, 74 rayons, était
déjà complet en base), toutes `active = false` — l'ouverture d'un rayon est
désormais un simple `UPDATE ... set active = true`, sans migration.
FR = docs/16 (qui fait foi) ; **KR et EN produits par l'agent, best-effort,
en attente de relecture native** (même statut que le seed des zones). Les
~45 sous-catégories de la vague 1 gardent leur ligne et leur état
(`on conflict do nothing`) ; 16.3 (Digicel/Natcom) exclu — catalogue
Reloadly. Post-conditions : plancher 450 lignes (une collision de slugs
avalée en masse casserait), zéro activation par le seed.

## V-4 — Rabais vendeur, ancien prix visible

Champ `compare_at_htg` + règles d'honnêteté NON NÉGOCIABLES (la classe
« promesse commerciale » de `docs/25` §4) : l'ancien prix affiché doit être
un prix RÉELLEMENT pratiqué — au moment où le vendeur pose un rabais, c'est
son prix courant qui devient l'ancien prix, jamais une saisie libre (le
« barré gonflé » est le dark pattern n°1 du e-commerce). Baisse seulement ;
retirer le rabais rend le prix courant sans barré. Tout calcul reste serveur
(règle dure n°3). Migration + formulaire + affichage barré catalogue/fiche.

## V-5 — Nom + adresse à l'inscription, adresse au moment de l'expédition

Carnet d'adresses acheteur (rue, ville, département — réutilise les ZONES de
0069 pour la structure), demandé à l'inscription et modifiable au profil,
montré au vendeur À L'EXPÉDITION seulement (0043 fulfillment). ⚠️ Deux
implications : la **politique de confidentialité** doit décrire cette
collecte (mise à jour `lib/policy-privacy.ts` dans le même chantier), et le
téléphone de contact est probablement plus important que l'adresse postale
sur ce terrain (les livraisons haïtiennes se coordonnent par téléphone) —
le formulaire portera les deux.

## V-6 — KYC vendeur : deux pièces d'identité avec photo

⚠️ **ZONE D'ARRÊT double.**
1. « Installer un système d'authentification haïtien » : **aucune API
   publique de vérification d'identité haïtienne (CIN/NIF) n'existe** —
   checklist `docs/03` §9, étape 0 éliminatoire : on ne code pas un rail
   dont l'API n'existe pas. La v1 réaliste est : téléversement en bucket
   **PRIVÉ** (jamais public — ce sont des pièces d'identité), revue MANUELLE
   par l'admin, badge « vendeur vérifié ».
2. Données ultra-sensibles : rétention à borner (purge après décision ?),
   politique de confidentialité à amender, et le dossier BRH (`docs/17`)
   y gagne un pilier KYC — à documenter dans le même geste.
Arbitrages porteur avant construction : quelles pièces acceptées (CIN,
passeport, permis), rétention des images après vérification, obligatoire
pour vendre ou pour RETIRER (recommandation : bloquer le retrait, pas la
publication — l'argent sort seulement vers un compte vérifié).

## Ordre proposé

V-1A (en cours) → V-2 → V-4 → V-5 → V-1B (après arbitrages) → V-3 (après
arbitrage vagues) → V-6 (après arbitrages KYC). Les arbitrages de V-3/V-6
peuvent être rendus à tout moment et remonter leur chantier dans la file.
