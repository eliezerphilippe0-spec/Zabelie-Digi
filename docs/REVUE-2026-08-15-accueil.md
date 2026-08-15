# Rapport de revue — Zabelie (accueil) — 2026-08-15

**Mode** : CIBLÉ (UI + Responsivité) · **Périmètre** : page d'accueil `/` et
tous ses éléments cliquables · **Stack** : Next.js App Router + Tailwind +
Supabase.

**Méthode** : application construite et lancée en local (mode démo,
`ZABELIE_DEMO_FIXTURES=true`, stub Supabase de `e2e/fixtures`), pilotée par
Playwright/Chromium à six largeurs — 360, 390, 768, 820, 1280, 1440 px. Les
mesures ci-dessous sont **relevées dans le navigateur**, pas déduites du code.

## Résumé exécutif

**Tous les boutons de l'accueil fonctionnent** : 28 éléments cliquables
recensés, **zéro lien cassé**, zéro erreur console, aucun débordement
horizontal à aucune des six largeurs. Le système de couleurs est sain — les 23
paires de `scripts/zabelie-contrast.mjs` passent WCAG AA, certaines très
largement.

Les trois problèmes réels sont ailleurs. **Les cibles tactiles sont trop
petites** : 31 éléments sous 44 px de haut sur mobile, dont le CTA principal
« Voir le catalogue » (40 px) et surtout « Commencer à vendre » à **16 px** —
sur un marché où tout se fait au pouce sur Android d'entrée de gamme. **Le
héros est un rectangle vide** : un bloc 16:9 réservé pour un visuel qui
n'existe pas, rempli d'un dégradé et centré, ce qui laisse ~230 px de vide.
Et **une bande blanche pleine largeur** coupe un thème entièrement sombre.

Aucun de ces trois-là n'est cassé. Tous les trois font « inachevé » — ce qui,
sur un marché méfiant, coûte la même chose qu'un bug.

## Tableau de bord par axe

| Axe | Posture | Constats (🔴/🟠/🟡/🔵) |
|-----|---------|------------------------|
| UI             | Correcte  | 0 / 0 / 3 / 2 |
| Responsivité   | À améliorer | 0 / 1 / 1 / 0 |
| Sécurité       | *hors périmètre* | — |
| UX             | *hors périmètre* | — |

## Ce qui a été VÉRIFIÉ et qui fonctionne

C'était la question posée, elle mérite sa réponse chiffrée.

| Contrôle | Résultat |
|---|---|
| Liens internes de l'accueil réellement demandés (HTTP) | **28 éléments, 0 cassé** |
| Boutons sans libellé ni `aria-label` | **0** |
| Erreurs console (6 largeurs) | **0** |
| Débordement horizontal (`scrollWidth > viewport`) | **aucun**, 360 → 1440 px |
| Contraste WCAG AA (`npm run check:contrast`) | **23/23 paires**, aucune opacité interdite |

⚠️ **Un faux positif écarté en cours de route** : sans Supabase joignable,
`/catalogue` rend **500** et deux boutons de l'accueil semblaient cassés.
C'est un artefact de l'environnement, pas un défaut — et la panne simulée a
appris quelque chose d'utile : `lib/products.ts:257` **jette** délibérément
(BL-116, « masquer une panne derrière des produits inachetables détruirait la
confiance ») pendant que la taxonomie et les zones dégradent en journalisant.
Le choix est raisonné et `app/error.tsx` existe pour l'habiller.

## Constats détaillés

### 🟠 Élevés

#### [RES-01] Cibles tactiles sous 44 px — jusqu'à 16 px sur le CTA vendeur

- **Axe** : Responsivité
- **Emplacement** : `app/page.tsx:854` (lien vendeur) · `components/site-nav.tsx`
  (sélecteur de langue, liens de navigation) · `components/hero-carousel.tsx:110`
- **Constat** : 24 éléments sous 44 px de haut à 360 px de large, 31 à 768 px.
  Mesures relevées : « Commencer à vendre » **16 × 316 px**, liens de
  navigation **20–28 px**, sélecteur de langue FR/KR/EN/ES **32 px**, CTA
  principal « Voir le catalogue » **40 px**.
- **Impact** : le seuil de 44 px n'est pas cosmétique — c'est la taille d'un
  pouce. Un lien de 16 px de haut se rate une fois sur deux sur un écran
  d'entrée de gamme, et c'est précisément le lien qui recrute les vendeurs.
- **Preuve** : `getBoundingClientRect()` sur tous les `a[href]` et `button`, six
  viewports. Le seul élément correctement dimensionné est la pagination du
  carrousel (`hero-carousel.tsx:138`, `h-11 w-11` = 44 px) — la bonne pratique
  est donc **déjà dans le dépôt**, elle n'a simplement pas été généralisée.
- **Correctif proposé** : porter les cibles à `min-h-11` avec le padding
  correspondant. Commencer par les deux CTA (« Voir le catalogue », « Commencer
  à vendre ») — ce sont les deux seuls qui portent une conversion.
- **Effort** : **S**

### 🟡 Moyens

#### [UI-01] Le héros réserve un bloc pour un visuel qui n'existe pas

- **Axe** : UI
- **Emplacement** : `components/hero-carousel.tsx:90`
- **Constat** : `aspect-[4/3] … sm:aspect-[16/9]` avec `justify-center` impose
  une hauteur fixée par la largeur, indépendamment du contenu. Le contenu réel
  — un titre et un bouton — occupe environ un tiers du bloc. Le reste est du
  dégradé (`slide.accent`).
- **Impact** : à 1440 px, environ **230 px de vide** au milieu de la zone la
  plus regardée de la page. L'œil lit « il manque quelque chose », ce qui est
  exact : il manque l'image.
- **Preuve** : capture `accueil-desktop-1440.png` et `accueil-mobile-390.png`.
  Le rapport hauteur/contenu est constant aux six largeurs — c'est le ratio qui
  commande, pas le contenu.
- **Correctif proposé** : deux voies, et c'est un arbitrage porteur, pas une
  correction technique. Soit **produire les visuels** (Higgsfield est la voie
  retenue par `CLAUDE.md`) et le bloc reprend son sens ; soit **retirer le
  ratio** en attendant, pour que le héros se dimensionne sur son contenu et
  cesse d'annoncer un vide.
- **Effort** : **S** (retirer le ratio) / **M** (produire les visuels)

#### [UI-02] Une bande claire pleine largeur coupe un thème entièrement sombre

- **Axe** : UI
- **Emplacement** : `app/page.tsx:261` — `overflow-x-auto border-b
  border-black/10 bg-cloud`
- **Constat** : bande de **53 px de haut sur toute la largeur** (mesurée à 390
  et 1440 px), en `bg-cloud`, insérée entre l'en-tête sombre et le héros sombre.
- **Impact** : rupture visuelle au point le plus haut de la page. Elle ne
  signale rien de particulier — son contenu est un rail de raccourcis
  (« Pièces détachées auto · Tout voir → »), pas une alerte.
- **Preuve** : détection programmatique des fonds clairs (`rgb > 230` et
  opacité > 0.5) : **un seul élément** correspond dans toute la page, celui-ci.
  L'anomalie est donc isolée, pas un parti pris de design alterné.
- **Correctif proposé** : passer le rail sur une surface sombre du système
  (`surface-maroon` / `surface-brown`, toutes deux validées AA par le script de
  contraste) et garder la bordure comme séparateur.
- **Effort** : **S**

#### [UI-03] Deux titres concurrents, tous deux sur MonCash

- **Axe** : UI
- **Emplacement** : titre de section au-dessus du carrousel + `hero-carousel.tsx:99`
- **Constat** : « Produits, services et fichiers digitaux — **payez avec
  MonCash** » est immédiatement suivi de « Achetez en sécurité **avec
  MonCash** », dans une taille comparable.
- **Impact** : la hiérarchie s'aplatit — deux `h`-niveaux se disputent le même
  message, et l'argument MonCash est dépensé deux fois en deux lignes au lieu
  d'installer une promesse puis une action.
- **Preuve** : capture `accueil-desktop-1440.png`.
- **Correctif proposé** : garder la promesse en titre de page, et faire porter
  aux diapositives un bénéfice **différent** par diapositive (le carrousel en
  compte trois — il y a la place de dire trois choses).
- **Effort** : **S**

### 🔵 Faibles

#### [UI-04] Le sélecteur de langue flotte hors de l'en-tête

- **Axe** : UI · **Emplacement** : `components/site-nav.tsx`
- **Constat** : la pastille FR/KR/EN/ES est posée au-dessus de l'en-tête, sur
  une surface distincte, sans alignement avec la grille de la barre.
- **Impact** : sur un produit **kreyòl-first**, le choix de langue est un geste
  de premier ordre ; il est présenté comme un ornement de coin.
- **Correctif proposé** : l'intégrer à la barre principale, à la hauteur du
  bouton « Connexion ».
- **Effort** : **S**

#### [UI-05] Le CTA vendeur disparaît de la navigation sur mobile

- **Axe** : UI · **Emplacement** : `components/site-nav.tsx`
- **Constat** : « Vendez sur Zabelie » (bouton bordé, bien visible à 768 px et
  au-delà) n'apparaît pas dans la barre à 360/390 px, où la navigation se
  réduit à Catalogue · Talents · Aide.
- **Impact** : la moitié vendeur du marché perd son entrée sur le format
  majoritaire du marché visé. Elle reste atteignable plus bas dans la page, par
  le lien de 16 px de [RES-01].
- **Preuve** : captures `accueil-mobile-390.png` vs `accueil-tablette-768.png`.
- **Correctif proposé** : arbitrage porteur — soit le CTA vendeur entre dans la
  barre mobile, soit on assume que l'accueil mobile est acheteur-d'abord. Les
  deux se défendent ; le silence actuel n'est pas un choix, c'est un effet de
  cascade de points de rupture.
- **Effort** : **S**

## Plan d'action priorisé

| Ordre | Constat | Action concrète | Sévérité | Effort |
|-------|---------|-----------------|----------|--------|
| 1 | RES-01 | Porter « Voir le catalogue » et « Commencer à vendre » à `min-h-11` (44 px), puis généraliser aux liens de navigation et au sélecteur de langue | 🟠 | S |
| 2 | UI-02 | Passer le rail de raccourcis de `bg-cloud` à une surface sombre du système | 🟡 | S |
| 3 | UI-03 | Différencier les trois diapositives du carrousel ; ne dire « MonCash » qu'une fois au-dessus | 🟡 | S |
| 4 | UI-01 | **Arbitrage** : produire les visuels de héros, ou retirer `aspect-[…]` en attendant | 🟡 | S/M |
| 5 | UI-04 | Intégrer le sélecteur de langue à la barre principale | 🔵 | S |
| 6 | UI-05 | **Arbitrage** : CTA vendeur dans la barre mobile, ou accueil mobile assumé acheteur-d'abord | 🔵 | S |

**Par quoi commencer aujourd'hui** : RES-01 seul. C'est le seul constat qui
coûte des conversions mesurables, il est en effort **S**, et le dépôt contient
déjà la bonne mesure (`h-11 w-11` sur la pagination du carrousel) — il s'agit
de la généraliser, pas de l'inventer.

**Aucun point de contrôle humain n'est requis avant** : ces six corrections ne
touchent ni la base, ni l'argent, ni une variable d'environnement. Les deux
arbitrages (UI-01, UI-05) sont des choix de positionnement et restent au
porteur.

## Annexe — Couverture

- **Vérifié** : `/` construite et rendue à 360, 390, 768, 820, 1280, 1440 px ;
  28 éléments cliquables recensés et leurs cibles internes réellement
  demandées ; débordement horizontal, cibles tactiles et fonds clairs mesurés
  dans le navigateur ; `npm run check:contrast` (23 paires) ;
  `components/hero-carousel.tsx`, `app/page.tsx:261`, `app/page.tsx:854`,
  `lib/products.ts:257` lus.
- **Non vérifié / à confirmer** :
  - ⚠️ **Le méga-menu « Rayons »** — absent du rendu local : le stub Supabase
    ne sert pas la taxonomie, donc `[taxonomie] menu indisponible` et l'entrée
    ne s'affiche pas. C'est **exactement le panneau visible sur la capture du
    porteur**, où il recouvre le héros. Un panneau déroulant qui se superpose
    est un comportement normal ; ce qui reste à confirmer, c'est son
    comportement au clavier (échappement, piège de focus) et sur petit écran.
    Il faut une base avec la taxonomie chargée pour le juger.
  - Les états **survol / focus / actif / désactivé** des boutons : le harnais
    mesure la géométrie, pas les états. Un balayage clavier reste à faire.
  - Le reste du site (`/catalogue`, `/produit/[slug]`, `/vendre`,
    `/tableau-de-bord`) est **hors périmètre** de cette revue ciblée.
  - Les axes **Sécurité** et **UX** n'ont pas été parcourus.
