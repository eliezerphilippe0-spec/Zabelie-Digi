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

⚠️ **Mesuré à l'application (2026-08-15) : 468 semées, 452 insérées.** Quinze
absences étaient voulues (collisions de concept avec la vague 1, qui garde
ses lignes actives) ; **la seizième ne l'était pas** — « Sacs de voyage »
portait le slug `sak-vwayaj`, déjà celui de son parent de niveau 2
(« Bagagerie »), et le slug est unique sur TOUTE la table. Ligne avalée sans
erreur ni trace. Le contrôle du dépôt vérifiait l'unicité *dans* le seed,
jamais contre les slugs déjà pris aux niveaux 1 et 2 : le croisement est
désormais dans `tests/taxonomie-seed.test.ts`, avec exemption datée qui se
périme dans les deux sens. Réparation : `0078`, appliquée le 2026-08-15 à 13:04:10Z.

**Compte bouclé mécaniquement après réparation** — et c'est ce croisement, pas
une inspection à l'œil, qui clôt la question : les 16 lignes avalées se
décomposent en **13 collisions de concept avec la vague 1 de `0035`**,
**2 avec `0057`** (les catégories de services, sources oubliées au premier
comptage) et **1 collision de niveau**, la seule anormale, réparée. Aucune
ligne perdue sans explication. ⚠️ Le premier croisement, lui, annonçait
« 6 écarts » : il ne connaissait que `0035` comme source de niveau 3. Cinq
étaient des excédents légitimes venus d'ailleurs — un écart n'est pas un
défaut tant qu'on n'a pas vérifié ce que l'instrument ignore.

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

## V-6 — KYC vendeur — ARBITRÉ le 2026-08-15, livré

Arbitrages porteur : « **bloque le retrait** » (pas la publication — l'argent
ne sort que vers un compte vérifié) et « **CIN ou passeport** ». Livré par
`0079`, **rédigée non appliquée**.

**Ce qu'on ne construit pas** : « un système d'authentification haïtien »
n'existe pas — aucune API publique ne vérifie une CIN ou un NIF haïtien
(checklist `docs/03` §9, étape 0 éliminatoire). La vérification est donc
**manuelle** : le vendeur dépose, un humain décide, chaque décision est
journalisée dans `zabelie_admin_actions`. Le jour où une API existe, elle se
branche sur ce même schéma.

**Le blocage est DORMANT à l'application** : `requis_pour_retrait = false`
par défaut, et une post-condition casse la migration si ce défaut change.
Appliquer `0079` ne coupe le retrait de personne ; le porteur arme par
`UPDATE` quand les vendeurs ont eu le temps de se faire vérifier. Couper la
voie de sortie à l'instant d'une migration serait exactement ce que le
dossier BRH (`docs/17`) reproche.

**Les pièces ne sont jamais publiques** : bucket privé sans aucune policy
(service-role seul), l'admin les ouvre par **URL signée de 5 minutes**,
rechargée à chaque consultation. Aucune surface ne rend d'image — vérifié par
test. Rétention bornée et purgée par cron (`/api/kyc/purge`, déclaré dans
`vercel.json` — une purge sans appelant ne purge rien).

⚠️ **La DURÉE de rétention reste à confirmer** : défaut prudent de 90 jours
après décision, en table de config, modifiable par `UPDATE`. C'est le seul
des trois arbitrages qui n'a pas été rendu ; il est au registre.

**Deux pièces avec photo** — la demande initiale — se heurte au marché : seuls
CIN et passeport sont acceptés, et le passeport est peu répandu en Haïti.
Exiger deux pièces *distinctes* bloquerait la majorité des vendeurs. Le
schéma accepte donc `cin`, `paspo` **et `selfie`** (photo du vendeur tenant sa
pièce, standard KYC courant) : la paire reste de deux documents avec photo,
sans exiger de posséder deux titres. Le nombre requis vit en config
(`docs_requis`, défaut 2).

## Ordre proposé

V-1A (en cours) → V-2 → V-4 → V-5 → V-1B (après arbitrages) → V-3 (après
arbitrage vagues) → V-6 (après arbitrages KYC). Les arbitrages de V-3/V-6
peuvent être rendus à tout moment et remonter leur chantier dans la file.
