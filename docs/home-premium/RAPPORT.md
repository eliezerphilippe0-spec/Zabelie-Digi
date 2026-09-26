# Accueil premium — Rapport final (Phase 5)

Chantier du 2026-09-04, brief « Page d'accueil Zabelie, niveau premium ».
Cinq PR empilées, aucune fusionnée par l'agent, aucune écriture en production :

| Phase | PR | Base |
|---|---|---|
| 0 — Mesure et plan | [#200](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/pull/200) | `feat/home-premium` |
| 1 — Tokens | [#201](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/pull/201) | `feat/home-premium` |
| 2 — En-tête + chips | [#202](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/pull/202) | `home-premium/1-tokens` |
| 3 — Bannière, structure, seuils | [#203](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/pull/203) | `home-premium/2-header` |
| 4 — Cartes, squelettes, mouvement | [#204](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/pull/204) | `home-premium/3-structure` |
| 5 — Vérification (ce rapport) | [#205](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/pull/205) | `home-premium/4-cards-motion` |

Ordre de fusion : #201 → #202 → #203 → #204 → #205 dans `feat/home-premium`, puis
`feat/home-premium` → `main`. #200 (documents seuls) peut se fusionner à tout
moment ; ses fichiers sont aussi repris dans #205.

## ⚠️ Ce que la mesure a pu être

**zabelie.com et Supabase ne sont pas joignables depuis l'exécuteur** (proxy
d'egress : `403`, `Host not in allowlist`). Toutes les mesures sont prises sur
un **build de production local** du code de chaque phase :

- **mode réel** (clés publiques Supabase posées, hôte injoignable) : l'accueil
  rend son état « catalogue vide » — valide pour l'en-tête, la bannière, les
  polices, les couleurs, la structure, l'accessibilité ;
- **mode fixtures** (`ZABELIE_DEMO_FIXTURES=true`, sans clés) : le catalogue
  d'essai du dépôt rend douze cartes — utilisé UNE fois, pour A1 et la carte,
  et nommé comme tel (`phase4/lighthouse-phase4-fixtures.json`).

Ce qui exige le vrai domaine est marqué ⚠️ dans le tableau.

## Critères d'acceptation — A1 à A15

| # | Critère | Cible | Résultat | Preuve |
|---|---|---|---|---|
| A1 | Première rangée de produits visible sans scroll | 375×812 | **✓** première carte y = 418 → ≈ 690 px, rangée entière au-dessus de 812 (fixtures) | `phase4/home-mobile-viewport.png`, `phase4/mesures.json` |
| A2 | Hauteur de l'en-tête au chargement | ≤ 100 px | **✓ 98 px** (avant : 250) | `after/mesures.json` `headerHauteur` |
| A3 | LCP mobile (Slow 4G) | ≤ 2,5 s | **✗ 2,8 s** (avant : 2,7) — voir `docs/REVUE-2026-09-04.md` § Performance | `lighthouse-after.json` |
| A4 | CLS | ≤ 0,1 | **✓ 0** | idem |
| A5 | Lighthouse Performance mobile | ≥ 90 | **✓ 96** sans produits · 94 avec 12 cartes | idem, `phase4/lighthouse-phase4-fixtures.json` |
| A6 | Lighthouse Accessibilité | ≥ 95 | **✓ 100** (avant : 97, `skip-link` + `landmark-one-main`) | idem |
| A7 | Poids polices total | ≤ 90 Ko | **✓ 73,0 Ko** (avant : 84,9 ; avec `latin-ext` : 169) | `phase1/mesures.json`, `app/layout.tsx:22-29` |
| A8 | JS ajouté par la refonte | ≤ 10 Ko gzip | **✓** 141,4 Ko transférés sans cartes (avant 142,4) ; 147,4 avec 12 cartes → +5 Ko bruts ≈ +1,5 Ko gzip | `after/mesures.json`, `phase4/mesures.json` |
| A9 | Contraste AA sur tous les textes | script vert | **✓** `npm run check:contrast` : toutes les paires, deux palettes, 0 opacité interdite ; Lighthouse `color-contrast` vert | sortie CI, `lighthouse-after.json` |
| A10 | Aucune section vide, aucune URL brute, aucun « bientôt » | grep + capture | **✓ sections / URL** (`urlLabels: []`) · **✗ un « bientôt »** : « NatCash — bientôt » au pied de page, **zone d'arrêt** (`OPS_TODO`, promesse commerciale, options a/b/c) — non touché sans arbitrage | `after/mesures.json` `bientot: 1` |
| A11 | Aucune animation > 300 ms ; reduced-motion respecté | grep | **✓** tokens `--motion-*` ≤ 300 ms, à 0 ms sous `prefers-reduced-motion` ; `tests/theme.test.ts` T8 refuse toute durée > 300 ms en dur | `app/zabelie-theme.css`, `app/globals.css` |
| A12 | Orange uniquement sur CTA et prix | grep | **✓ sur l'accueil** : `bg-brand` (CTA), `text-accent` (prix, lien « Vendre » du menu, badge « 0 HTG » passé en encre après mesure). ⚠️ Hors accueil : 7 `text-brand`, ~30 `border-brand` préexistants (fiche, panier, admin) — hors périmètre, listés dans #201 | `grep -rn "text-brand\|border-brand" app components` |
| A13 | Zones tactiles ≥ 44 px | audit | **✓** Lighthouse `target-size` vert ; `min-h-11 min-w-11` sur chips, loupe, panier, compte, FAB 48 px ; `tests/cibles-tactiles`, `home-premium-header` H6 | `lighthouse-after.json` |
| A14 | Zéro régression visuelle sur `/catalogue`, `/produit/*`, `/vendre`, `/aide` | captures | **✓ `/vendre`, `/aide`** (en-tête partagé, contenu intact ; `/aide` gagne un `<main>`) · ⚠️ **`/catalogue` et `/produit/*` : page d'erreur / 404 avant COMME après** (Supabase hors egress) — à revoir sur zabelie.com | `before/*.png`, `after/*.png` |
| A15 | Tests verts, `npm run build` sans warning nouveau | sortie | **✓ 942/942**, `tsc` et `eslint` propres, build sans avertissement (`grep -ci warn` = 0) | CI des cinq PR |

**Bilan : 12 critères tenus, 1 non tenu (A3), 2 partiels et dits (A10 : un
mot en zone d'arrêt ; A14 : deux pages non mesurables hors ligne).**

### A1 revu — 2026-09-26 (mobile)

A1 n'était plus tenu sur `main` : mesuré avec le même jeu d'essai
(`ZABELIE_DEMO_FIXTURES=true`), la première carte commençait à **y = 1 055**
en 375 × 812. Ce qui passait devant : en-tête 167 px (A2 visait ≤ 100),
état des paiements 119, bannière 467 dont carte vedette 161, confiance 66,
« Eksplore òf yo » 112, titre de rangée 116.

Choix fait par délégation (« fait le meilleur choix ») : **mobile seulement**,
la première rangée passe juste sous la bannière, avant la confiance et
« Eksplore òf yo ». L'ordre du document ne change pas ; en-tête, bandeau des
paiements et ordinateur non touchés.

⚠️ **Première version fausse, corrigée avant fusion.** Elle masquait aussi la
carte vedette sur mobile, en la croyant redondante avec la rangée. C'est faux :
`allocateHomeRows` exclut le produit vedette de toutes les rangées — masqué, il
disparaissait de l'accueil mobile. L'e2e `decouverte-sans-doublons` l'a révélé
en CI ; reproduit localement (390 px rouge, 1 440 vert), puis corrigé.
`tests/home-premier-ecran.test.ts` P3 interdit désormais ce masquage.

| Écran | Première carte de la rangée, avant | Après |
|---|---|---|
| 375 × 812 | y = 1 055 | y = 869 (toujours sous l'écran) |
| 390 × 844 | y = 1 013 | y = 827 (17 px visibles) |
| 1 440 × 900 | y = 939 | y = 939 (identique, bloc par bloc) |

Dans les deux cas, **un produit est visible au premier écran : la carte
vedette** (y = 568 → 729 en 375 × 812), comme avant ce lot. Le gain réel est
donc modeste : la rangée remonte de 186 px, juste sous la bannière.

⚠️ **A1 reste non tenu pour la rangée.** Les cartes font ~350 px de haut ;
en-tête (167) et bandeau des paiements (119) occupent 286 px. Sur ordinateur
aussi, la rangée commence sous l'écran (y = 939 sur 900). Ces leviers restent
au porteur. Captures : `a1-2026-09-26/avant-390.png`,
`a1-2026-09-26/apres-390.png`.

### A2 revu — 2026-09-26 (en-tête, accueil mobile)

L'en-tête mobile mesurait **167 px** (A2 : ≤ 100 ; 98 le 2026-09-05). Trois
rangées : logo + icônes, recherche pleine largeur (choix du porteur du
2026-09-15, gardé), rubriques. Choix fait par délégation : **sur l'accueil
mobile seulement**, la barre de rubriques prend dès le chargement l'état
qu'elle a déjà au défilement (masquée) ; l'accueil a sa propre navigation vers
les rubriques. CSS seul, dans `app/home-discovery.css`.

| Page / largeur | Avant | Après |
|---|---|---|
| Accueil 320 → 767 px | 167 px | **101 px** |
| Accueil ≥ 768 px, `/catalogue`, `/aide` | 167 / 115 / 158 px | inchangé |
| Première carte de la rangée, 375 × 812 | y = 869 | **y = 803** |
| Première carte de la rangée, 390 × 844 | y = 827 | **y = 761** |

Un e2e dépendait de la rubrique « Digital » de l'en-tête mobile
(`e2e/appearance.spec.ts`) : sur mobile il suit désormais le lien Digital de
l'accueil, sur ordinateur toujours celui de l'en-tête. Garde :
`tests/home-premier-ecran.test.ts` P4 (trois mutations, trois rouges).
Captures : `a2-2026-09-26/avant-390.png`, `a2-2026-09-26/apres-390.png`.

## Avant / après

| Mesure (mobile 375×812) | Phase 0 | Phase 5 |
|---|---|---|
| En-tête | 250 px, 3 rangées, recherche dupliquée | 98 px, une ligne + chips, se replie au défilement |
| Premier produit | absent du premier écran | rangée entière au-dessus du pli (dès 4 produits) |
| `h1` | y = 274, titre séparé, serif | y = 153, dans la bannière, Manrope 800 |
| Hauteur de page | 6 453 px (16 blocs possibles) | 1 985 px sans produits (5 sections) |
| « MonCash » au premier écran | 3 fois | 1 fois (h1) + 1 repère de confiance |
| Carrousel | auto-play 6 s | aucun |
| Polices | Inter + Playfair, 84,9 Ko | Inter + Manrope, 73,0 Ko |
| Palette | sombre par défaut, bruns chauds | crème par défaut, indigo, un accent ; sombre sur cookie |
| Thème sombre | — | vérifié, capture `after/home-mobile-sombre.png` |
| Accessibilité Lighthouse | 97 (2 échecs) | 100 |
| Clés i18n mortes retirées | — | 46 (×4 langues) |
| Fichiers retirés | — | `hero-carousel`, `landing-slides`, `category-sidebar`, `category-menu` |

Captures côte à côte : `before/home-mobile-viewport.png` ↔
`after/home-mobile-viewport.png` (réel) et `phase4/home-mobile-viewport.png`
(fixtures) ; desktop `before/home-desktop-viewport.png` ↔
`after/home-desktop-viewport.png`.

## Poids

| | Avant | Après |
|---|---|---|
| Polices préchargées | 84 892 o | **73 008 o** |
| JS transféré, accueil sans produits | 142 424 o | 141 447 o |
| JS transféré, accueil avec 12 cartes | — | 147 438 o |
| Poids total de la page (Lighthouse, sans produits) | 298 Ko | ≈ 290 Ko |

## Données de test à réviser
`test-data-to-review.md` : 3 produits publiés (dont `fxccxfdf`, 0 HTG), 7
brouillons, 2 vendeurs, 0 vente payée — identifiants et requête. Rien n'a été
modifié en base. Avec la règle des seuils, ces données **ne s'affichent plus**
sur l'accueil ; elles restent dans le catalogue.

## Décisions prises (par délégation — docs/02 V-20)
1. Français par défaut (V-18 tenue).
2. Manrope + Inter ; Playfair retirée.
3. Palette du brief, clair par défaut, sombre conservé sur cookie.
4. Quatre valeurs du brief ajustées **par la porte de contraste** : brand clair
   `#e0580f` (le `#f26a21` rend 2,89:1 sur crème), accent texte `#b8500c`,
   surface `#fffdf9` (pas de blanc pur), pas de troisième orange `#fdb868`.
5. `latin` seul pour les polices (les diacritiques kreyòl y sont ; `latin-ext`
   coûtait 96 Ko de plus).
6. Photo du hero : rendue seulement si `public/brand/hero-accueil.jpg` existe.

## Décisions laissées ouvertes au porteur
- **Langue dans l'URL** (`/ht/`, `/fr/`) — seule voie pour indexer le kreyòl (`docs/47` §3).
- **Hex exact de la marque en clair** : `#e0580f` passe la porte ; `#f26a21` la fait tomber. Réversible en une valeur (`app/zabelie-theme.css`), le favicon suit.
- **« NatCash — bientôt »** au pied de page (A10) : options a/b/c d'`OPS_TODO`.
- **Accueil sous 4 produits** (UX-03 de la revue) : silence, ou compte dans le CTA.
- **Photo du hero à fournir** : JPEG/WebP 1600 × 900, ≤ 120 Ko, sujet au tiers médian, sans texte incrusté, à poser en `public/brand/hero-accueil.jpg`.
- **`text-brand` / `border-brand` hors accueil** (~37 sites) : réassigner en `accent`/`line` pour étendre « orange = CTA et prix » au reste du site.
- Les dix constats de `docs/REVUE-2026-09-04.md`, dont neuf tiennent en moins d'une heure.

## Ce qui est à refaire sur zabelie.com, une fois fusionné
Lighthouse mobile sur `/`, `/catalogue`, `/produit/<slug>` ; captures des
quatre pages secondaires ; vérification des chips avec le vrai rayon non vide ;
LCP avec la photo du hero.
