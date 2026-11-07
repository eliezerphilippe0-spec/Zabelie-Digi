# Rapport final : chantier design et typographie

Brief `PROMPT-ZABELIE-DESIGN-TYPO` du 2026-11-06, mené du 6 au 7 novembre 2026 en six phases, chacune arrêtée pour validation. Point de départ : `bfc52fb` (`main` avant le chantier). Point d'arrivée : la branche `design/typo-phase-5`. Référence durable : `docs/design/DESIGN-SYSTEM.md`.

| Phase | Contenu | PR | Décision |
|---|---|---|---|
| 0 | Audit en lecture seule | [#473](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/pull/473) | |
| 1 | Tokens, échelle de texte, police d'accent, prix, rayons, ombres, plans | [#474](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/pull/474) | V-25, V-26 |
| 2 | Boutons, champs, carte produit, étiquettes, états, icônes | [#475](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/pull/475) | |
| 3 | Hero à mot d'accent, preuve sociale sous seuil, rythme de l'accueil | [#476](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/pull/476) | V-27 |
| 4 | Connexion, panier, fiche produit, barre de navigation mobile | [#477](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/pull/477) | V-28 |
| 5 | Accessibilité, contraste, performance, documentation | ce rapport | |

## L'essentiel

Le site a maintenant un seul système : des tokens dans un seul fichier, une échelle de texte, un style de `h1` et un style de `h2`, trois variantes de bouton, un champ, un état vide, une famille d'icônes, et une police d'accent posée sur un mot à la fois. Sur mobile, une barre en bas donne l'accueil, les rayons, le panier et le compte. Les tests tiennent chacune de ces règles, et chaque garde a été passé sur un cas qui devait le faire échouer.

Ce qui n'est pas atteint, et pourquoi. **Le LCP de 2,5 s ne l'est pas** : l'accueil tourne autour de 3 s en 4G lente simulée, avant comme après, et la police d'accent y ajoute environ 100 ms que le porteur a choisi de garder (V-27). Le chemin de l'argent garde sa présentation, faute d'accord. Les photos produit ne sont pas redimensionnées (A11, arrêt ferme).

La Phase 5 a trouvé trois défauts que rien ne signalait : un nom de lien panier qui échouait à WCAG sur toutes les pages connectées, des titres de grille qui sautaient un niveau, et un instrument de contraste qui laissait passer un texte à 4,04:1 depuis que le thème clair est devenu le défaut.

## Avant et après

### Budget du brief

| Mesure | Cible | Avant (`bfc52fb`) | Après (Phase 5) | Verdict |
|---|---|---|---|---|
| LCP de l'accueil | 2,5 s en 3G lente | 3G lente : 9 756 ms simulé, 6 060 ms observé ; 4G lente : 2 922 ms simulé, 2 556 ms observé | 3G lente : 9 853 ms simulé, 5 904 ms observé ; 4G lente : 3 048 ms simulé, 2 580 ms observé | Non tenu |
| CLS | 0,05 | 0 | 0 | Tenu |
| Poids des polices | 90 Ko | 75,9 Kio | 87,6 Kio (police d'accent comprise) | Tenu |
| JavaScript ajouté | 5 Ko gzip | 179,5 Kio transférés à l'accueil | 179,3 Kio : rien d'ajouté, sur les quatre pages mesurées | Tenu |
| Image LCP : priorité, dimensions | Oui | Différée, sans dimensions | Photo principale de la fiche en `fetchPriority="high"`, 800 × 600 (`components/galerie-produit.tsx:58`) ; photos non redimensionnées (A11) | Partiel |

Lighthouse 12.8.2, mobile, builds locaux de `bfc52fb` et de la Phase 5, mêmes données de démonstration, passages entrelacés sur la même machine. 4G lente simulée, médiane de trois passages :

| Page | LCP (ms) | FCP (ms) | TBT (ms) | Accessibilité | JS (Kio) | Polices (Kio) | Page (Kio) |
|---|---|---|---|---|---|---|---|
| Accueil | 2 922 → 3 048 | 1 678 → 1 832 | 158 → 93 | 100 → 100 | 179,5 → 179,3 | 75,9 → 87,6 | 352 → 372 |
| Catalogue | 2 827 → 2 751 | 1 537 → 1 528 | 92 → 120 | 98 → **100** | 171,3 → 171,1 | 75,9 → 75,9 | 359 → 363 |
| Fiche produit | 2 974 → 2 978 | 1 530 → 1 527 | 89 → 115 | 98 → **100** | 171,3 → 171,1 | 75,9 → 75,9 | 328 → 332 |
| Connexion | 2 916 → **3 297** | 1 518 → 1 663 | 86 → 101 | 100 → 100 | 237,9 → 237,7 | 75,9 → 87,6 | 368 → 382 |

3G lente (RTT 400 ms, 400 kbit/s, CPU ×4), un passage : accueil 9 756 → 9 853 ms, catalogue 9 421 → 9 353, fiche 9 800 → 9 764, connexion 9 770 → 11 360. Un seul passage par page : ces chiffres se lisent comme un ordre de grandeur.

Ces mesures locales ne se comparent pas à celles de l'audit (`docs/design/AUDIT-0.md`, prises sur zabelie.com, 3 548 ms à l'accueil) : la production ajoute le temps du serveur et du réseau réels.

### Interface et accessibilité

| Mesure | Avant | Après | Preuve |
|---|---|---|---|
| Styles de `h1` et de `h2` | 7 et plus | 1 et 1 | `app/globals.css` (`@layer base`), `tests/titres-role.test.ts` |
| Écritures de bouton | 74, sans variante commune | 3 variantes, 3 tailles | `app/globals.css` (`.bouton`), `tests/boutons-variantes.test.ts` |
| Familles d'icônes | 3 jeux, 7 épaisseurs | 1 jeu, trait 1,75 | `components/icone.tsx:20`, `tests/icones.test.ts` |
| Cibles sous 44 px, 360 px | 13 (mesure de la Phase 2) | 1, sur le chemin des versements : « Mande yon retrè », 38 px | `docs/design/PHASE-2.md`, `tests/cibles-tactiles.test.ts` |
| Violations WCAG (axe), 25 pages dont 10 connectées | 11, sur les 10 pages connectées : nom du lien panier (WCAG 2.5.3) partout, contraste de deux indications | 0 | `tests/accessibilite-phase5.test.ts` A1, `scripts/zabelie-contrast.mjs:170` |
| Règles « best-practice » d'axe | 8 : fiches sans `<main>`, donc sans cible d'évitement ; titres du catalogue | 0 | `tests/parcours-phase4.test.ts` P5, A3 |
| Arrêts clavier sans anneau de focus visible (30 premiers par page) | 28, sur 24 pages : la recherche de l'en-tête, les champs de connexion | 0 | `.champ` et anneau global, `app/globals.css` |
| Sauts de niveau de titre | 2 (catalogue, en kreyòl et en français) | 0 | A2, A3 |
| Animations actives sous mouvement réduit | 0 | 0 | `--motion-*` à 0 ms |
| Paires de contraste du thème | Toutes vertes | Toutes vertes | `npm run check:contrast` |
| Texte translucide sous 4,5:1 | 3 emplois vus comme conformes | 0, une exception nommée sur le chemin de l'argent | `scripts/zabelie-contrast.mjs:170` |
| Tests | 2 768 sur 2 769 | 2 843 sur 2 844, même échec de séparateur de chemin | `npm test` sous Windows |

## Phase 5

### Accessibilité

Sonde dédiée, hors dépôt (`Zabelie-notes/design-typo-outils/a11y-p5.cjs`), éprouvée à chaque passage sur une page jetable qui porte chacun des défauts cherchés. Pour chaque page : langue du `<html>` contre la langue servie, ordre des titres, `tabindex` positifs, images sans `alt` pertinent, règles « best-practice » d'axe, anneau de focus sur les trente premiers arrêts du clavier, animations actives sous `prefers-reduced-motion: reduce`, lien d'évitement et sa cible, redirection éventuelle. 25 pages, publiques et connectées, en kreyòl et en français.

Ce qu'elle a trouvé, et qui est corrigé :

1. **Le lien panier échouait à WCAG 2.5.3 sur toutes les pages connectées.** Son nom, « Panyen (3) », ne reprenait pas le texte visible. Présent avant le chantier dans l'en-tête, et recopié en Phase 4 dans la barre. La CI ne pouvait pas le voir : son garde axe tourne sans session ni panier. Un essai dans Chrome a montré que « Panyen 3 » échouait aussi, axe comparant le texte visible collé. Le nom vient désormais du contenu (`components/barre-navigation.tsx:96`) ; dans l'en-tête, le libellé caché sous 1 024 px reste lu (`components/site-nav.tsx:211`), sans quoi le lien n'avait plus de nom entre 768 et 1 023 px.
2. **Catalogue et favoris sautaient un niveau de titre**, du `h1` aux `h3` des cartes. Un `h2` lu et non affiché ouvre la grille (`app/catalogue/page.tsx:464`, `components/collection-page.tsx:44`).
3. **La sonde elle-même s'est trompée une fois** : avec une session refusée, `/vendre/physique` redirigeait vers l'étape légale de la connexion, et elle a mesuré cette page-là. Elle contrôle désormais l'URL finale ; remesurée avec une session valide, la page est conforme.

Les pages sans en-tête de navigation (connexion, inscription, mot de passe oublié, hors-ligne) n'ont pas de lien d'évitement : aucun bloc répété à contourner, le formulaire suit le logo et le choix de langue.

### Contraste

`npm run check:contrast` passait, et axe mesurait 4,14:1 sur deux indications de `/tableau-de-bord/boutique` en `text-mist/80`. La règle du script, « sous /80 interdit », avait été mesurée sur le fond le plus **sombre** (5,41:1), avant que le thème clair ne devienne le défaut le 2026-09-04. Pour un texte foncé, le pire cas est le fond le plus clair : 4,04:1. Le test de l'instrument gravait l'erreur (« /80 passe »).

Chaque `text-mist/NN`, `text-cloud/NN` et `text-on-chrome/NN` est maintenant composé sur ses fonds, dans les deux palettes, et doit tenir 4,5:1 au pire (`scripts/zabelie-contrast.mjs:154`, `:170`). Les deux indications passent en `text-mist` (`components/profile-form.tsx:182`, `:209`). Une exception reste nommée, avec sa raison : la mention légale de `app/rechaj/page.tsx` (4,0:1), sur le chemin de l'argent. Une exception devenue inutile, ou hors du chemin de l'argent, fait échouer le script. Quatre mutations de l'instrument, quatre échecs.

### Performance

Ce que montrent les chiffres ci-dessus. **Le chantier n'a ajouté aucun JavaScript transféré** (budget de 5 Ko tenu). Le CLS reste à 0 partout. Les polices passent de 75,9 à 87,6 Kio sur les seules pages qui emploient le mot d'accent (accueil, connexion), sous les 90 Ko du budget. L'accessibilité Lighthouse du catalogue et de la fiche passe de 98 à 100.

Le LCP reste piloté par le titre `h1`, donc par l'arrivée des polices : il bouge peu sur le catalogue et la fiche, prend 126 ms à l'accueil et 381 ms à la connexion, deux coûts de la police d'accent acceptés par le porteur (V-27, V-28). Le TBT varie de 93 à 158 ms selon la page et le passage, sans tendance que trois passages permettent d'affirmer.

En Phase 5, la photo principale d'une fiche, élément LCP quand elle existe, est demandée en priorité et réserve sa place (`components/galerie-produit.tsx:58`, garde A4). Le produit de démonstration n'a pas de photo : ce gain ne se voit pas dans ces mesures. Les autres images restent en `<img>` avec leurs propres URL de rendu : passer par `next/image` ferait travailler l'optimiseur d'images de Vercel, une dépense possible, donc un choix qui revient au porteur avec A11. Les deux `next/image` du site sont conformes : aucune n'est en `fill` sans `sizes`.

### Appareil bas de gamme

Chargement réel dans Chrome, réseau bridé par le navigateur, processeur ralenti ×4, contexte neuf à chaque passage, 360 × 800, médiane de trois passages entrelacés (`Zabelie-notes/design-typo-outils/observe-p5.cjs`, bridage éprouvé au démarrage : 360 ms sans, 4 952 ms avec).

| Page | LCP 4G lente | FCP 4G lente | LCP 3G lente | FCP 3G lente | Poids |
|---|---|---|---|---|---|
| Accueil | 2 556 → 2 580 ms | 1 640 → 1 668 ms | 6 060 → 5 904 ms | 4 972 → 4 948 ms | 287 → 300 Kio |
| Catalogue | 2 272 → 2 252 | 1 604 → 1 688 | 5 576 → 5 724 | 4 852 → 5 012 | 275 → 276 |
| Fiche produit | 2 540 → 2 540 | 1 608 → 1 652 | 5 764 → 5 808 | 5 016 → 5 020 | 286 → 288 |
| Connexion | 1 788 → 2 204 | 1 684 → 1 588 | 4 916 → 5 344 | 4 916 → 4 960 | 351 → 365 |

Observations :

- L'élément LCP est le titre `h1` sur les quatre pages, avant comme après. Le texte est lisible dès le premier affichage dans la police de repli ajustée ; le LCP marque l'arrivée de la police finale.
- En 3G lente, il faut environ 5 s pour voir la page et 6 s pour le titre définitif, avant comme après : le chantier ne l'a ni aggravé ni corrigé. Le poids des pages (de 276 à 365 Kio) et leur JavaScript (de 171 à 238 Kio) restent le levier, hors design.
- La connexion paie la police d'accent : environ 420 ms de LCP, en 4G comme en 3G, pour 14 Kio de plus.
- Aucun décalage : CLS 0 partout ; la fiche passe de 0,004 à 0. La barre inférieure arrive avec le HTML et la feuille de style, sans bouger la page.

### Documentation

`docs/design/DESIGN-SYSTEM.md` : tokens, échelle, règles du mot d'accent, composants, à faire et à ne pas faire, chaque règle rattachée au fichier ou au test qui la tient. `CLAUDE.md:63` : les règles qui se cassent le plus facilement, à l'usage des prochains agents.

### Specs de bout en bout

La Phase 4 a été validée sur ses tests unitaires seulement, et sa CI a échoué. Les specs lisaient encore l'ancien titre de la connexion, l'ancienne place du menu du compte et l'ancienne place du prix. La CI s'arrêtant au premier échec, chaque correction en révélait une suivante : quatre allers-retours. J'ai alors rejoué en local les dix configurations Playwright que la CI enchaîne (`ci.yml`), ce qui a trouvé d'un coup les trois dernières.

| Spec | Ce qu'elle attendait | Correction |
|---|---|---|
| `e2e/account-legal-acceptance.spec.ts`, `e2e/seller-entry.spec.ts`, `e2e-auth/connexion.spec.ts` | Un `h1` égal au libellé de l'onglet | Les clés `auth.title.*` |
| `e2e-pricing/header-menu.spec.ts`, `e2e-boutique/boutique.spec.ts` | Le menu du compte dans l'en-tête à 390 et 320 px | La barre inférieure sous 768 px, mêmes exigences |
| `e2e-boutique/boutique.spec.ts`, `e2e-flash/flash.spec.ts` | Le prix et la vente flash dans la carte d'achat | Le bloc de prix sous le titre, repéré par `data-zone-prix` |

Toutes ont été réécrites sur la branche de la Phase 4 puis reprises ici. En local, la configuration par défaut passe 378 tests sur 379 ; l'aléa restant, `parcours-physique-ancres`, passe 9 fois sur 9 en isolé. `CLAUDE.md` garde la leçon.

## Une correction au rapport de la Phase 1

`docs/design/PHASE-1.md` dit que les rayons du chemin de l'argent suivaient le thème « sans y toucher ». C'est inexact pour deux composants : la Phase 1 (`9b59cc1`, `0c6a37d`) a changé `rounded-2xl` en `rounded-xl` dans `components/business/pro-console.tsx` et `components/zelle-reference-form.tsx`, et retiré la taille et la graisse écrites à côté de trois `h2` de la console Pro. Présentation seule, aucune logique ; c'était avant que la liste `tests/helpers/chemin-argent.ts` existe (Phase 2). Le changement est en ligne depuis #474. Je ne l'annule pas : ce serait toucher une seconde fois ces fichiers. Depuis la Phase 2, aucun fichier de la liste n'a bougé.

## Fichiers modifiés

300 fichiers depuis `bfc52fb` (6 107 lignes ajoutées, 1 672 retirées), cette phase comprise. Liste complète : `git diff --stat bfc52fb..design/typo-phase-5`.

| Zone | Fichiers | Ce qui change |
|---|---|---|
| `components/` | 117 | Boutons, champs, icônes, états vides, titre à mot d'accent, prix, barre de navigation, menu du compte |
| `app/` | 70 | Pages, et les feuilles du thème, de la base et de l'en-tête |
| `docs/design/` | 55 | Audit, rapports de phase, système de design, captures |
| `tests/` | 43 | Gardes du chantier, tests mis à jour avec le code qu'ils tiennent |
| Specs e2e | 6 | Titre de la connexion, place du menu du compte, place du prix |
| `lib/` | 4 | Traductions (`i18n.ts`), seuils de l'accueil, barre de navigation, données de démonstration |
| `scripts/` | 2 | Découpe de la police d'accent, contrôle des contrastes |
| `CLAUDE.md`, `OPS_TODO.md`, `docs/02-DECISIONS.md` | 3 | Règles des agents, registre du porteur, décisions V-25 à V-28 |

Aucun fichier sous `app/api` ni `supabase`. Aucune dépendance ajoutée.

## Points restants

| Point | Pourquoi il reste | À qui |
|---|---|---|
| A11, transformation d'images Supabase | Variable d'environnement, peut-être une dépense : arrêt ferme | Porteur |
| A13, phrase de paiement près des boutons | Promesse commerciale : arrêt ferme | Porteur |
| A14, ordre mobile de l'accueil | Attend A13 | Porteur |
| Présentation du chemin de l'argent | `h1` à 24 px au lieu de 28, « Mande yon retrè » à 38 px, mention légale de la recharge à 4,0:1 | Accord du porteur, puis une PR |
| LCP de l'accueil à 2,5 s | Hors d'atteinte sans précharger les polices, ce qui a déjà coûté 1,2 s de premier affichage | À reprendre avec les photos (A11) |
| TBT de la fiche et de `/vendre` | JavaScript des pages, hors design | Chantier performance |
| Fondus de survol sur la couleur, la bordure ou l'ombre | Invariant « transform et opacity » non tenu hors des boutons : 49 utilitaires `transition` nus et quelques règles CSS. Coût faible, mais à ne pas étendre | Lot dédié |
| Formulaire vendeur physique | Une trentaine de textes en dur, français et kreyòl mêlés (`components/physical-product-form.tsx`), contre l'invariant kreyòl d'abord | Lot dédié |
| Libellés de rayons non traduits | Ils viennent de la base (`zabelie_categories`) : une écriture en production | Porteur |
| « pwodui » ou « pwodwi » | Les deux coexistent (70 et 58 occurrences en kreyòl) | Porteur, locuteur natif |
| Relecture native du kreyòl | Les textes du chantier ont été écrits par l'agent | Porteur |

## Recommandations

1. Trancher A11 en premier : c'est lui qui débloque le poids des photos, donc le LCP des pages qui en ont.
2. Ajouter au garde axe de la CI un passage avec une session et un panier non vide : c'est là que le défaut de la Phase 5 se cachait.
3. Ouvrir un lot pour le formulaire vendeur physique, avec relecture kreyòl.
4. Garder `docs/design/DESIGN-SYSTEM.md` à jour dans la même PR que le code qu'il décrit.
