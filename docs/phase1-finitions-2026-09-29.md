# Phase 1 — finitions visibles (29 septembre 2026)

Demandée par le porteur (« Vas-y commence par la phase 1 »), première phase du
plan « Zabelie haut de gamme ». Base mesurée : `920be25`, **identique à la
production** — l'empreinte `release` de `/api/deployment` est le SHA-256 de ce
commit, recalculé le jour même.

Quatre corrections faites (1.1 à 1.4), deux rendues au porteur (1.5, 1.6) parce
qu'elles touchent des zones d'arrêt (`docs/25` §4).

## 1. Mesures au rendu, avant → après

Chromium, position horizontale du texte de chaque bloc, en px. **Avant** :
zabelie.com. **Après** : build de production local, même état « lancement »
(catalogue vide). Données brutes : `phase1-finitions-2026-09-29/mesures-*.json`.

| Page, largeur | En-tête (logo) | Bandeau paiements | Bannière (kicker, h1) | Titres de section | Pied de page |
|---|---|---|---|---|---|
| Accueil 390 | 12 → **20** | 12 → **20** | 20 → **20** | 12 → **20** | 20 → **20** |
| Accueil 768 | 12 → **20** | 12 → **20** | 36 → **20** | 12 → **20** | 20 → **20** |
| Accueil 1 440 | 156 → **164** | 156 → **164** | 180 → **164** | 156 → **164** | 164 → **164** |
| Catalogue, catégories, recharges 1 440 | 156 → **164** | — | titre 164 → **164** | — | 164 → **164** |

Avant, **aucune page** n'avait tous ses blocs sur une même ligne : l'accueil en
avait trois (12, 20 et 36 px à 768), et partout ailleurs l'en-tête était décalé
de 8 px du contenu. Après : une seule ligne, sur chaque page mesurée.

Inchangés, et c'est voulu : hauteur de l'en-tête (101 px sur l'accueil mobile,
critère A2 ; 115 px à 1 440) ; aucun débordement horizontal de 320 à 1 440 px ;
écart fil d'Ariane → titre de 40 px.

**Cibles tactiles sous 44 px** (hors pied de page) :

| Page | Avant | Après |
|---|---|---|
| Accueil, 320 px | 1 — logo 32 × 44 | 0 |
| Catalogue, 390 et 1 440 px | 3 — « Accueil » 49 × 20, Département 125 × 37, « Filtrer » 74 × 38 | 0 ⚠️ |
| Catégories, recharges | 1 — « Accueil » 49 × 20 | 0 |

⚠️ Le filtre de zone n'est rendu qu'avec les zones de la base de production :
il n'apparaît pas en local. Son « après » repose sur la classe `min-h-11`
(44 px), gardée par test — **pas mesuré au rendu**.

## 2. Ce qui change

- **1.1 — La bannière de lancement part de la grille.** Sans fond ni bordure,
  elle gardait le retrait d'une carte (24 px, 8 px sur mobile).
  `app/editorial-marketplace.css` — garde `tests/accueil-grille.test.ts`.
- **1.3 — ⚖️ Une seule gouttière, 20 px (`px-5`).** C'était déjà celle du site
  (49 conteneurs, pied de page compris) ; l'en-tête, l'accueil, le bandeau des
  paiements, la barre de confiance et les univers étaient à 12 px (12
  conteneurs). Garde `tests/gouttiere-unique.test.ts`.
  **Arbitrage** : la recherche mobile, pleine largeur (choix du porteur du
  2026-09-15), suit la grille — 366 → 350 px à 390. Le seuil de
  `e2e/marketplace-launch.spec.ts` passe de `largeur − 30` à `largeur − 40`.
  Revenir à 12 px sur l'en-tête seul rendrait les 16 px, et rouvrirait le
  décalage de 8 px sur toutes les pages.
- **1.2 — L'accord en nombre.** « résultat(s) », « avis vérifié(s) »,
  « jour(s) », « produit(s) en ligne » : deux clés par mot, quatre langues, et
  `tn()` aux cinq affichages (catalogue, fiche ×3, boutique) — le compte
  affiché est celui qui choisit la forme. « 0 résultat » est la forme juste en
  français (singulier sous 2). Gardes `tests/pluriel.test.ts` P5 et P6 (plus
  aucun « (s) » dans le dictionnaire) ; `tests/catalogue-compteur.test.ts`
  suit la nouvelle forme.
- **1.4 — Les cibles tactiles.** Fil d'Ariane (7 liens sur 5 pages) :
  `min-h-11` et `-my-3`, la cible grandit sans que le titre bouge. Filtre de
  zone : 3 listes et le bouton à 44 px, listes en 16 px (sous 16 px, Safari sur
  iPhone zoome la page à l'ouverture d'une liste — le tri voisin l'était
  déjà). Logo : `min-w-11`, pour 320 px où son nom est masqué. Gardes
  `tests/cibles-tactiles.test.ts`.

## 3. Rendu au porteur — deux zones d'arrêt

### 1.5 — Les mentions d'avant-lancement (« promesse commerciale »)

Huit mentions sur l'accueil de production. **Aucune n'est écrite en dur** :
toutes lisent l'état réel, et chacune s'efface quand son service ouvre.

| Mention | Lue par | S'efface quand |
|---|---|---|
| Bandeau « Ouverture progressive — MonCash en phase de test » | `components/marketplace-status.tsx:6-7` | MonCash passe en production |
| « Recharges · En test », carte « Recharges actuellement indisponibles » | `components/site-nav.tsx:213`, drapeau des recharges | les recharges ouvrent |
| « D'autres rayons arrivent » | `components/category-chips.tsx:24` | aucun rayon n'est vide |
| « Le catalogue prend forme » | `app/page.tsx` | la première offre est publiée |
| Pied : MonCash « En test », NatCash « Bientôt », Carte bancaire « Bientôt » | `components/site-footer.tsx:48-51` | le rail concerné est activé |

Elles ont été posées délibérément le 2026-09-15
(`docs/navigation-disponibilite-2026-09-15.md`) : dire la disponibilité avant le
clic. Options :

- **(a) Ne rien changer** — elles disparaissent d'elles-mêmes avec la Phase 0
  (MonCash en production, premières offres). *Recommandée.*
- **(b) Un seul bandeau d'état** — l'accueil respire, mais l'information quitte
  l'endroit où elle sert (« Recharges — En test » avant le clic).
- **(c) Masquer les rubriques indisponibles** — moins de « bientôt », mais un
  visiteur qui cherche la recharge ne la trouve plus.

### 1.6 — La moitié droite de la bannière (« positionnement »)

La bannière de lancement parle aux **vendeurs** (h1 « Votre savoir-faire mérite
sa boutique », bouton « Préparer ma boutique »). Y illustrer le parcours
d'**achat** brouillerait le message — l'arbitrage acheteur/vendeur est une
zone d'arrêt. Et aucune offre réelle n'existe : une vitrine d'exemple serait
une fausse offre. Options :

- **(a) Attendre de vraies photos** (Phase 2) — portrait d'un vendeur ou d'une
  vendeuse réel·le, avec son accord. *Recommandée.*
- **(b) Une illustration côté vendeur, sans produit ni prix** — SVG léger aux
  couleurs de la charte (« votre boutique » schématique).
- **(c) Garder le blanc** — choix éditorial actuel ; le texte est désormais
  aligné sur la grille.

## 4. Vérifications

- `npm test` : **1 384 / 1 384** (1 378 avant ce lot, 6 tests ajoutés).
- **23 mutations, 23 rouges** : 7 sur la grille et la gouttière, 8 sur
  l'accord, 1 sur le compteur, 7 sur les cibles tactiles. Chaque mutation
  affichée avant la suite, fichier restauré et relu après.
- `tsc` propre ; lint 0 erreur (8 avertissements préexistants) ; contraste
  vert sur les deux palettes ; build sans avertissement.
- E2E `playwright.config.ts` : **108 / 109**. L'échec
  (`e2e/marketplace-offline.spec.ts:3`, « Offres récemment consultées »
  introuvable hors ligne sur `/mes-achats`) se reproduit **à l'identique sur
  `920be25`**, sans ce lot, dans le même environnement (Chromium 1194 local).
  Il n'est pas dû à ce lot ; la CI de la PR tranchera sur son propre Chromium.

## 5. Ce qui n'est pas vérifié

- Le filtre de zone au rendu (base de production requise).
- Les suites E2E `pricing`, `boutique`, `rabais`, `offers`, `operations`,
  `topup` et `auth` : aucune ne lit un libellé ou une largeur modifiés (relu),
  la CI de la PR les exécute.
- Un appareil réel.

Captures : `phase1-finitions-2026-09-29/{avant,apres}-{accueil,catalogue}-{390,1440}.png`.
La différence de libellé du bandeau (« en phase de test » avant,
« indisponible » après) vient de l'environnement — MonCash en bac à sable en
production, aucune clé en local —, pas de ce lot.
