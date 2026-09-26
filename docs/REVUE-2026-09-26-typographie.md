# Rapport de revue — Zabelie — 2026-09-26 — Typographie

**Mode** : CIBLÉ (axe UI, typographie seule) · **Périmètre** : `/catalogue` et
`/tableau-de-bord`, plus ce qu'ils partagent (`app/layout.tsx`,
`app/globals.css`, `app/zabelie-theme.css`) · **Stack** : Next.js 16 (App
Router, `next/font/google`), Tailwind v4 · **Base** : `main` à `6f76eac`

> ⚠️ **`zabelie.com` n'a pas été ouvert** : le site est bloqué par le proxy de
> sortie de la session (`EGRESS_BLOCKED`). Tout ce qui suit est mesuré sur un
> **build de production** de `main`, servi localement et rendu dans Chromium,
> adossé au stub Supabase des tests E2E (`e2e/fixtures/stub-supabase.mjs`),
> en kreyòl, à 390 px et 1 440 px. Le code est le même que celui déployé ;
> les **données** sont celles du stub.

---

## Résumé exécutif

Le socle technique est **bon, et mesuré comme tel** : 73 008 octets de police
par page et pas un de plus, **aucun décalage de mise en page** au chargement
(CLS 0,0000), couverture **complète** du kreyòl, du français et de l'espagnol,
polices variables sans faux gras. Le défaut n'est pas le choix des polices —
c'est leur **application**, qui s'est dispersée. Les trois constats qui
comptent :

1. **Les appels à l'action sont coupés en deux polices** : 36 liens stylés en
   bouton sortent en Inter, 34 vrais boutons en Manrope. Deux pastilles
   orange identiques, côte à côte, n'ont pas la même typographie (UI-01).
2. **Les titres de section du tableau de bord ont trois tailles et deux
   graisses** ; deux d'entre eux sont indiscernables d'un libellé de bouton
   (UI-02).
3. **Les symboles d'interface ne sont pas dans la police** : `✓` ×51,
   `←` ×16, `→` ×12, `★` ×7, `⚠` ×4… sont dessinés par la police du
   téléphone, parce que l'Inter servie par Google est amputée (UI-03, UI-04).

**Recommandation « meilleure police »** : garder Inter — c'est la bonne — mais
dans sa **version 4.1 complète, auto-hébergée et découpée pour Zabelie**
(50 876 octets, mesuré). Elle corrige UI-03 et UI-04 d'un coup. Remplacer
aussi Manrope par elle est un choix de marque, chiffré plus bas.

## Tableau de bord par axe

| Axe | Posture | Constats (🔴/🟠/🟡/🔵) |
|-----|---------|------------------------|
| Sécurité | hors périmètre | — |
| UX | hors périmètre | — |
| **UI — typographie** | **Correcte** : socle solide, application incohérente | 0 / 0 / 3 / 4 |
| Responsivité | hors périmètre (CLS mesuré : 0) | — |

---

## Constats détaillés

### 🔴 Critiques

Aucun. Rien n'est cassé : les polices se chargent, couvrent les quatre
langues, et ne font rien bouger.

### 🟠 Élevés

Aucun.

### 🟡 Moyens

#### [UI-01] Les liens-boutons sont en Inter, les boutons en Manrope

- **Axe** : UI
- **Emplacement** : `app/globals.css:42-47`
- **Constat** : la règle qui donne Manrope 700 aux « libellés de boutons »
  (brief accueil premium §3.2) cible l'**élément** `button`, pas le **rôle**.
  Tout `<Link>` ou `<a>` habillé en bouton lui échappe et reste en Inter.
- **Impact** : sur un même écran, deux boutons visuellement identiques n'ont
  pas la même police. C'est le signe le plus visible d'un produit « assemblé »
  plutôt que dessiné.
- **Preuve** : mesure du moteur de rendu (CDP) sur `/tableau-de-bord` —
  « Pataje sou WhatsApp », « Gade boutik mwen », « Exporter mes données » sont
  des `<a>` en **Inter 600**, pendant que « Dekonekte », « Demander un
  retrait » sont des `<button>` en **Manrope 700**. Décompte statique sur tout
  le site : **36 liens** à fond plein + coins arrondis + rembourrage, dans
  **22 fichiers**, contre **34 `<button>`** au même habillage. Visible en haut
  de `revue-typographie-2026-09-26/planche-comparative.png` : les deux
  boutons « Pataje sou WhatsApp » de la ligne « Aujourd'hui » diffèrent.
  *(Décompte corrigé à la correction : **43** liens-boutons, et non 36 — celui-ci
  comptait aussi des puces de filtre. Voir « Suite donnée — UI-01 » ci-dessous.)*
- **Correctif proposé** : porter la famille et la graisse par une **classe de
  rôle** (ou un composant `Bouton`) appliquée aux deux éléments, plutôt que
  par le sélecteur `button`. Le cas échéant, un test qui croise les deux
  familles d'éléments — c'est la même classe de défaut que le « piège de
  sous-chaîne » de `CLAUDE.md` : la règle vise ce qui est **présent**, pas ce
  qui **commande** l'apparence.
- **Effort** : M

#### [UI-02] Titres de section du tableau de bord : trois tailles, deux graisses

- **Axe** : UI
- **Emplacement** : `app/tableau-de-bord/page.tsx:494,577,665,748,763,833`
  (`text-lg font-semibold`) · `components/vendeur-premier-pas.tsx:53`
  (`text-xl font-semibold`) · `components/digital-seller-metrics.tsx:10` ·
  `components/kyc-form.tsx:84` et `components/delivery-info-form.tsx:64`
  (`text-sm font-semibold`) · `components/seller-pricing-panel.tsx:10,44`
- **Constat** : dix `h2` de même niveau, sur la même page, en quatre styles.
  La base (`app/globals.css:32-36`) les veut en Manrope **700** ; chaque
  composant l'écrase en `font-semibold` (600) et choisit sa taille.
- **Impact** : la hiérarchie se lit mal ; les deux `h2` en 14 px ont
  **exactement** le rendu d'un libellé de bouton (« Enregistrer » : 14 px,
  600) et ne se distinguent plus comme titres.
- **Preuve** (styles calculés, 390 px) :

  | Titre | Taille | Graisse |
  |---|---|---|
  | « Pèfòmans pwodui dijital yo » | 20 px | 700 |
  | « Boutik ou louvri » | 20 px | 600 |
  | « Boutik mwen », « Dènye vant yo », « Mes produits », « Codes promo »… | 18 px | 600 |
  | « Verifikasyon idantite w », « Livrezon — non, telefòn, adrès » | **14 px** | 600 |

- **Correctif proposé** : une taille et une graisse uniques pour le titre de
  section (par exemple 18 px / 700), portées par une classe partagée ; retirer
  les `font-semibold` qui annulent la règle de base.
- **Effort** : S

#### [UI-03] Les symboles d'interface sont dessinés par la police du téléphone

- **Axe** : UI
- **Emplacement** : partout où un symbole Unicode sert d'icône — par exemple
  `app/produit/[slug]/page.tsx:196-197` (étoiles de notation `★`),
  `app/catalogue/page.tsx:197` (`≥`), `lib/i18n.ts:2088` (`→` de « Gade pwofil
  mwen → »)
- **Constat** : le sous-ensemble `latin` d'Inter servi par Google **ne contient
  aucun** de ces symboles. Chaque appareil les dessine avec sa propre police.
- **Impact** : épaisseur, taille et alignement qui changent d'un symbole à
  l'autre ; sur Android, `⚠` s'affiche fréquemment en **emoji couleur**. Les
  étoiles de notation — un signal de confiance sur la fiche produit — sont
  dans ce cas.
- **Preuve** :
  - moteur de rendu : glyphes dessinés par **DejaVu Sans (système)** sur les
    deux pages (`≥` au catalogue, `→` au tableau de bord) ;
  - `fontTools` sur le fichier servi : `→ ← ✓ ★ ≥ ≈ ↗ ✕ ⚠` **absents** ;
  - décompte dans le code qui atteint l'écran (commentaires exclus) : `✓` ×51
    (11 fichiers), `←` ×16, `→` ×12, `↗` ×9, `★` ×7, `≈` ×5, `⚠` ×4, `✕` ×4,
    `≥` ×3.
- **Correctif proposé** : auto-héberger **Inter 4.1** découpée pour Zabelie
  (voir la recommandation) — elle contient tous ces symboles sauf `✕`, à
  remplacer par `×` (U+00D7). Alternative : icônes SVG.
- **Effort** : M

### 🔵 Faibles

#### [UI-04] L'Inter servie par Google n'a ni zéro barré ni `l` distinct

- **Axe** : UI
- **Emplacement** : `app/layout.tsx:35-39`
- **Constat** : fonctionnalités OpenType présentes dans le fichier servi :
  `calt ccmp dnom frac locl numr pnum tnum`. Absentes : `zero` (zéro barré),
  `cv05` (`l` à queue), `case`.
- **Impact** : `0`/`O` et `l`/`I`/`1` se confondent là où l'on recopie des
  caractères. ⚠️ **Portée réelle limitée, et c'est mesuré** : les références de
  commande sont **déjà protégées** — l'alphabet de `zabelie_order_ref_candidate`
  exclut `0 1 8 B I L O U` (`supabase/migrations/0042_order_ref.sql:49`). Le
  cas exposé est le **code promo**, composé librement par le vendeur
  (`lib/zabelie-coupons.ts:10` : `[A-Z0-9-]`, donc `PROMO50` et `PR0MO50`
  coexistent).
- **Preuve** : `fontTools` (liste ci-dessus) ; planche comparative, ligne
  « MonCash 3701 0O10 · Il1| O0 ».
- **Correctif proposé** : même geste que UI-03, puis
  `font-feature-settings: "zero", "cv05"` sur les codes affichés.
- **Effort** : S (une fois UI-03 fait)

#### [UI-05] Boutons secondaires en 12 px / 500

- **Emplacement** : `components/share-buttons.tsx:48,54`
- **Constat** : « Pataje sou WhatsApp » (secondaire) et « Kopye lyen an » en
  `text-xs font-medium` ; ailleurs les boutons sont en 14 px / 600–700. Trois
  styles de bouton coexistent (14/700, 14/600, 12/500).
- **Correctif proposé** : aligner sur la classe de rôle de UI-01.
- **Effort** : S

#### [UI-06] Tailles arbitraires de 10 et 11 px

- **Emplacement** : `components/product-card.tsx:87` (10 px, libellé « photo
  manquante » en mode boutique), `components/product-card.tsx:93,98` (11 px, pastilles « Fizik »
  sur l'image), `app/tableau-de-bord/page.tsx:713` (10 px),
  `components/site-nav.tsx:130` (11 px, compteur du panier)
- **Constat** : hors échelle Tailwind ; mesuré une fois sous 12 px au
  catalogue (« Fizik », 11 px). Le compteur du panier est un cas légitime
  (chiffre dans une pastille). Contraste non en cause : le gris secondaire
  `#5c5a57` fait **6,48:1** sur crème (`app/zabelie-theme.css:102`).
- **Correctif proposé** : 12 px minimum pour le texte courant ; garder
  l'exception du compteur, la nommer.
- **Effort** : S

#### [UI-07] Deux commentaires décrivent une configuration qui n'existe plus

- **Emplacement** : `app/zabelie-theme.css:131` et `app/globals.css:1-2`
- **Constat** : le premier annonce « sous-ensembles latin + latin-ext » —
  `app/layout.tsx:36,41` ne déclare que `latin`, et `layout.tsx:27-34` explique
  pourquoi. Le second annonce « Inter 400/500 » — la police est variable,
  100 à 900.
- **Impact** : nul à l'écran ; mais un agent qui croirait le commentaire
  « rajouterait » `latin-ext` — soit **100 512 octets** de plus, préchargés sur
  chaque page (Inter 85 272 + Manrope 15 240, mesurés dans le build).
- **Correctif proposé** : corriger les deux commentaires.
- **Effort** : S

---

## Plan d'action priorisé

| Ordre | Constat | Action concrète | Sévérité | Effort |
|-------|---------|-----------------|----------|--------|
| 1 | UI-02 | Définir une classe unique de titre de section (18 px / 700) et remplacer les dix `className` de `h2` du tableau de bord | 🟡 | S |
| 2 | UI-01 | Porter la typographie des boutons par une classe de rôle appliquée aux `<button>` **et** aux liens-boutons ; retirer la règle sur l'élément `button` | 🟡 | M |
| 3 | UI-03 | Auto-héberger Inter 4.1 découpée pour Zabelie via `next/font/local`, avec `LICENSE.txt` (OFL 1.1) et la commande de découpe versionnée ; remplacer `✕` par `×` | 🟡 | M |
| 4 | UI-04 | Activer `zero` et `cv05` sur les codes promo affichés | 🔵 | S |
| 5 | UI-07 | Corriger les commentaires de `zabelie-theme.css:131` et `globals.css:1-2` | 🔵 | S |
| 6 | UI-05 | Aligner les boutons secondaires de partage sur la classe de rôle | 🔵 | S |
| 7 | UI-06 | Relever les tailles 10–11 px à 12 px (sauf compteur du panier) | 🔵 | S |

**Par quoi commencer** : UI-02 — trente minutes, et c'est le constat le plus
visible du tableau de bord. **Premier point de contrôle humain** : la décision
Manrope ci-dessous, **avant** l'étape 3, parce qu'elle détermine si l'on
auto-héberge une police ou deux. Aucune de ces actions ne touche la base ni
l'argent.

## Quick wins (< 30 min chacun)

- UI-02 — une classe, dix `className`.
- UI-07 — deux commentaires.
- UI-06 — cinq tailles.

---

## Recommandation — la meilleure police pour Zabelie

**Garder Inter. Changer de version, pas de police.**

Inter est la bonne réponse aux contraintes de Zabelie, et c'est mesuré :

- **hauteur d'x de 0,546 em** — parmi les plus grandes qui existent ; c'est
  ce qui garde un texte lisible à 12–14 px sur un écran Android d'entrée de
  gamme ;
- **couverture intégrale** du kreyòl, du français et de l'espagnol, y compris
  le kreyòl saisi en forme décomposée (`o` + accent combinant) — vérifié glyphe
  par glyphe ;
- **chiffres tabulaires** (`tnum`) : les colonnes de prix s'alignent ;
- **variable** : toutes les graisses dans un seul fichier.

Ce qui ne va pas, c'est la **version Google** : elle est amputée des
symboles et des variantes qui comptent ici. **Inter 4.1** (licence SIL OFL
1.1, auto-hébergement et découpe permis) les a, plus un axe de **taille
optique** qui contient sa propre version « titrage ».

Découpée pour Zabelie — latin, accent combinant, symboles d'interface,
fonctionnalités `tnum zero cv05 case frac` — et **pesée** :

| Option | Fichiers préchargés | Octets | vs aujourd'hui |
|---|---|---|---|
| Aujourd'hui — Inter (Google) + Manrope | 2 | 73 008 | — |
| **1.** Inter 4.1 Zabelie + Manrope conservée | 2 | 75 452 | +3 % |
| **2.** Inter 4.1 Zabelie seule, graisse seule | **1** | **50 876** | **−30 %** |
| 3. Inter 4.1 Zabelie seule, graisse + taille optique | 1 | 78 140 | +7 % |

Les options 2 et 3 sont **quasi indiscernables à taille mobile** (planche
`revue-typographie-2026-09-26/planche-comparative.png`) : la 3 coûte 27 Ko de
plus pour une finesse que l'écran visé ne rend pas.

**Ma recommandation : l'option 1 tout de suite, l'option 2 si vous acceptez
de perdre Manrope.**

- **L'option 1 est un gain pur** : +2 444 octets pour des symboles cohérents,
  un zéro barré, un `l` distinct. Elle ne change rien à l'identité.
  *(Mise en œuvre : +3 656 octets — huit symboles de plus inclus, voir
  « Suite donnée » ci-dessous.)*
- **L'option 2 est un choix de marque**, et il vous revient (`docs/25` §4 :
  positionnement). Elle gagne 22 Ko et un préchargement — sensible sur 3G au
  premier affichage — et elle **supprime UI-01 par construction** (une seule
  famille, plus de coupure possible). Ce qu'elle retire : l'arrondi
  géométrique de Manrope sur les titres et les prix, choisi pour l'accueil
  premium (`docs/02` V-20). Sur la planche, c'est la différence entre la
  première ligne et la troisième : plus neutre, plus compacte.

---

## Suite donnée — 2026-09-26 : option 1, choisie par le porteur

Signal : « option 1 ». Le même lot corrige UI-02, UI-03, UI-04 et UI-07.
UI-01, UI-05 et UI-06 restent ouverts.

### Ce qui a été fait

| Constat | Geste |
|---|---|
| UI-03 · UI-04 | `app/fonts/InterZabelie-4.1.1.woff2` chargé par `next/font/local` à la place de l'Inter de Google. Découpe reproductible : `scripts/decouper-police-inter.sh` (source épinglée `inter-ui@4.1.1`, OFL 1.1, licence livrée dans `app/fonts/Inter-LICENSE.txt`). |
| UI-04 | Classe `.code-lisible` (Inter, `zero`, `cv05`, `tnum`) sur les quatre endroits où un code promo s'affiche ou se saisit : l'exemple du tableau de bord, la liste et le champ du vendeur, le champ de l'acheteur. |
| UI-03 | `✕` → `×` (4 occurrences : `✕` n'existe pas dans Inter). `🏍` et `⏱` suivis de U+FE0F : sans lui, la moto s'affichait en noir et blanc à côté d'une voiture en couleur. |
| UI-02 | Classe `.titre-section` (18 px / 700) sur les 12 `h2` de section. `seller-pricing-panel` sert aussi `/vendre` : ses titres y suivent. |
| UI-07 | Commentaires de `app/zabelie-theme.css` et `app/globals.css` corrigés. |

### Mesuré après, même sonde que l'audit

| Page | Octets de police | CLS | Glyphes dessinés par le téléphone (hors emoji) |
|---|---|---|---|
| Catalogue (390 et 1 440) | 73 008 → **76 664** | 0 → **0** | 2 → **0** |
| Tableau de bord (390 et 1 440) | 73 008 → **76 664** | 0 → **0** | 3 → **0** |

- Les dix `h2` rendus du tableau de bord : **tous** Manrope 18 px / 700.
- L'exemple « PROMO50 » : Inter 700, `font-feature-settings: "cv05", "tnum",
  "zero"` au style calculé ; zéro barré visible
  (`revue-typographie-2026-09-26/apres-codes-promo.png`, à comparer avec
  `avant-codes-promo.png`).
- **+3 656 octets (+5 %)**, et non +2 444 comme annoncé : huit symboles
  employés une fois chacun dans le site (`∞ ● ○ ▶ ⊘ ☆ ≤ ≠`) ont été ajoutés à
  la découpe, pour que le compte tombe à zéro. Budget A7 (≤ 90 Ko) tenu :
  76,7 Ko. Les 20 derniers octets sont la licence OFL, gardée DANS le
  fichier (noms 13 et 14) : l'OFL veut qu'elle accompagne chaque copie, et
  servir une police sur le web, c'est la distribuer.

### Ce qui le garde

- `tests/police-inter.test.ts` ouvre le fichier WOFF2 (lecteur maison,
  `tests/woff2-lecteur.ts`, croisé avec fontTools sur trois polices) et
  vérifie glyphe par glyphe : kreyòl, français, espagnol, accents combinants,
  `zero`, `cv05`, budget 56 000 octets, branchement dans `layout.tsx`, et un
  **croisement** — tout caractère non ASCII du code d'interface doit être dans
  la police, ou être un emoji assumé, ou une exemption nommée.
- `tests/titres-section.test.ts` refuse un `h2` de section sans
  `.titre-section`, ou avec une taille ou une graisse à côté.
- Onze mutations passées, chacune vérifiée appliquée avant lecture, chacune
  rouge sur le bon test. **Une a d'abord été VERTE** : `✔` ajouté à un libellé
  passait, parce que la frontière des emoji était `\p{Extended_Pictographic}`,
  qui inclut `✔` alors qu'il ne s'affiche PAS en emoji par défaut. Resserrée à
  « présentation emoji par défaut, ou suivi de U+FE0F » — c'est elle qui a
  débusqué `🏍` et `⏱`.

### Nouveau constat, préexistant

- 🔵 **Le texte indicatif « PROMO50 » du champ Code est tronqué à 390 px**
  (« PROMO5… ») — `components/zabelie-coupon-manager.tsx`, trois champs sur une
  ligne. Déjà le cas avant ce lot : même largeur, même troncature sur la
  capture d'origine.

---

## Suite donnée — 2026-09-26 : UI-01, la PR des boutons

Signal : « Prépare le PR des boutons ». **UI-01 est corrigé.** UI-05 et UI-06
restent ouverts.

### Ce qui a été fait

- `app/globals.css` : la règle qui donne Manrope 700 vise désormais
  `.bouton, button, .numeric, .metric` — **une seule déclaration**, dans la
  couche `base`. Un `font-semibold` posé à côté l'emporte donc de la même façon
  sur un lien et sur un bouton.
- `bouton` ajouté aux **43 liens habillés en bouton**, dans 26 fichiers : 40
  en classe littérale, et **3 cachés derrière une expression** — la condition
  de `app/paiement/echec/page.tsx` (lien principal ou secondaire selon le cas)
  et la constante `lien` de `app/admin/page.tsx` (deux liens). Un contrôle qui
  ne lirait que `className="…"` aurait été vert sur ces trois-là.

### Écart au plan, assumé

Le plan (ordre 2) disait « retirer la règle sur l'élément `button` ». **Elle est
gardée**, à dessein. Retirée, chaque `<button>` du site devrait porter
`.bouton`, et le premier oublié retomberait en Inter sans que rien ne le
signale : le défaut d'origine, déplacé de l'autre côté. Gardée dans la même
déclaration que `.bouton`, elle ne peut plus s'en séparer — c'est ce que
vérifie B1.

### Décompte corrigé

L'audit annonçait **36** liens-boutons « à fond plein ». Ce décompte retenait
tout lien portant un fond : huit n'étaient pas des boutons — six puces de
filtre ou onglets (`rounded-full`), une entrée de menu (`rounded-lg`), le lien
d'évitement (`focus:bg-brand`) — et il laissait de côté les liens-boutons à
**contour**. Trié par la règle des rayons déjà écrite dans
`app/zabelie-theme.css` (`rounded-xl` = boutons et champs, `rounded-full` =
puces, `rounded-lg` = entrées de menu) : **43** — 28 pleins et 12 à contour
en classe littérale, plus les 3 cachés. Aucun des 43 ne portait de famille
explicite : tous étaient en Inter.

### Mesuré après, au moteur de rendu

Build de production de la branche, stub Supabase, kreyòl, 390 px. Police
**effectivement dessinée** (`CSS.getPlatformFontsForNode`) sur chaque lien
en forme de bouton visible :

| Page | Liens-boutons visibles | Dessinés en |
|---|---|---|
| `/` | « Kòmanse vann » | Manrope 700 |
| `/tableau-de-bord` (vendeur) | « Pataje sou WhatsApp », « Gade boutik mwen », « Exporter mes données » | Manrope 600 |
| `/panier` | « Konekte » | Manrope 600 |
| `/paiement/echec` | « Tounen nan katalòg la » | Manrope 600 |
| page 404 | « Ale nan akèy la », « Wè katalòg la » | Manrope 600 |
| `/catalogue` | aucun : ses six liens-boutons n'apparaissent qu'en page hors limites, recherche sans résultat, rayon vide, catalogue vide ou pagination — des états que le stub (un seul produit) ne produit pas ; B2 les couvre | — |

- **Témoin négatif, sur chacune des cinq pages** : le premier de ces liens,
  privé de `.bouton` dans la page, retombe en **Inter**, à la même graisse et
  au même nombre de glyphes. Sans ce témoin, « tout est Manrope » pourrait
  vouloir dire « la sonde ne voit rien ».
- **Aucun lien en forme de bouton sans `.bouton`** trouvé à l'exécution sur
  ces six pages : le contrôle statique et le rendu disent la même chose.
- Le moteur nomme la police « Manrope ExtraLight » : c'est le nom de
  l'instance par défaut du fichier variable (axe `wght` 200 → 800, défaut
  200). La graisse dessinée est celle du style calculé.
- **La graisse ne bouge pas** : un lien en `font-semibold` reste à 600, comme
  un bouton en `font-semibold`. Ce qui séparait un lien-bouton d'un bouton,
  c'était la famille ; ce qui reste, ce sont les utilitaires de taille et de
  graisse posés sur chacun — c'est UI-05 : sur le tableau de bord, le
  `<button>` « 🟢 Pataje sou WhatsApp » est en 500, à côté du lien
  « Pataje sou WhatsApp » en 600.
- **À l'œil**, un même composant (`components/account-actions.tsx`), un lien
  et un bouton côte à côte, tous deux en 600 :
  `revue-typographie-2026-09-26/avant-liens-boutons.png` — « Exporter mes
  données » (lien, Inter) paraît plus gras que « Supprimer mon compte »
  (bouton, Manrope) ; `apres-liens-boutons.png` — les deux identiques. L'avant
  est la même page, `.bouton` retiré dans le DOM : pour la famille, c'est
  exactement l'état d'avant cette PR, la règle `button` n'ayant pas changé.

### Ce qui le garde

`tests/boutons-typographie.test.ts` :

- **B1** — `button` et `.bouton` dans le **même** sélecteur, qui donne la
  famille des titres. Les commentaires sont retirés avant lecture : un
  sélecteur cité dans un commentaire ne compte pas.
- **B2** — chaque `<Link>`/`<a>` en forme de bouton porte `.bouton`. Les
  classes sont **résolues** : littéraux, constantes (celle du fichier d'abord ;
  une constante importée seulement si son nom est unique), chaînes d'une
  condition, fonctions fléchées rendant un gabarit. Deux témoins : au moins 43
  liens-boutons vus, dont au moins 3 derrière une expression — un motif devenu
  aveugle échoue au lieu de passer.
- **B3** — une classe que le test ne sait pas lire échoue, sauf exception
  **nommée** avec sa raison ; l'exception se périme dans les deux sens.
- **B4** — `components/metric-a.tsx` rend un `<a>` avec la classe que lui passe
  son appelant : ses appelants sont vérifiés un par un.

Onze mutations, chacune vérifiée appliquée et affichée avant lecture, chacune
rouge sur le bon test : `.bouton` retiré du sélecteur CSS (B1) · retiré d'un
lien littéral, de la constante de l'admin, d'une branche de la condition de la
page d'échec, ou absent d'un nouveau lien (B2) · une classe composée
irrésoluble, une exception périmée, un nom importé ambigu (B3) · un appelant
de `MetricA` en forme de bouton (B4) · le détecteur aveuglé par une faute dans
le motif (B2, témoin) · un homonyme (B2, ci-dessous).

**Une a d'abord été VERTE.** La table des constantes était « le dernier défini
gagne », et le dépôt a des homonymes (`input`, `TEXT`, `BG`…). Mutation : la
constante `lien` de l'admin privée de `bouton`, plus un
`export const lien = "text-sm"` ajouté dans `lib/`. Le lien d'admin cessait
d'être vu comme un bouton : **B2 vert**. Et le premier essai de cette mutation
avait bien rougi — mais **par le témoin** (41 liens vus au lieu de 43), pas par
la faute : il a fallu rendre au témoin, avec trois liens conformes, ce que
l'homonyme lui prenait, pour voir le test mentir. Corrigé : la constante du
fichier d'abord ; ailleurs, seulement si le nom n'y est défini qu'une fois,
sinon irrésolue et B3 échoue. Rejouée : B2 rouge, et la faute nommée est la
bonne (`app/admin/page.tsx:69` et `:77`).

⚠️ Ce contrôle lit du **texte**, pas du rendu : une classe composée à
l'exécution d'une façon qu'il ne résout pas lui échappe. C'est pourquoi
l'irrésolu échoue (B3) au lieu de passer.

---

## Annexe — Couverture

### Vérifié

- `app/layout.tsx`, `app/globals.css`, `app/zabelie-theme.css` (lus en entier
  sur les passages typographiques).
- `/catalogue` et `/tableau-de-bord` rendus par un build de production de
  `main` (`6f76eac`), stub Supabase, kreyòl, **390 × 844** et **1 440 × 900** :
  styles calculés de chaque élément portant du texte visible (69 à 145 par
  page), polices **effectivement dessinées** par le moteur
  (`CSS.getPlatformFontsForNode`), fichiers téléchargés et leur poids, CLS.
- Les 15 règles `@font-face` du build (famille, fichier, poids, plage
  Unicode).
- Les fichiers de police servis, ouverts avec `fontTools` : caractères, axes,
  fonctionnalités, hauteur d'x.
- Inter 4.1.1 (paquet npm `inter-ui`, OFL 1.1) découpée avec `pyftsubset` ;
  les deux découpes vérifiées complètes (kreyòl/fr/es, accent combinant,
  symboles, fonctionnalités).

### Mesures de référence

| Mesure | Catalogue | Tableau de bord |
|---|---|---|
| Polices téléchargées | 2 fichiers, 73 008 o | 2 fichiers, 73 008 o |
| CLS | 0,0000 | 0,0000 |
| Glyphes Inter / Manrope / système | 1 076 / 76 / 2 | 4 252 / 832 / 3 (+2 emoji) |
| Tailles rendues (px, 390) | 11 · 12 · 14 · 16 · 24 · 32 | 12 · 14 · 16 · 18 · 20 · 24 · 30 · 36 |
| Taille dominante du texte | 14 px (62 éléments) | 14 px (89 éléments) |

Le texte courant est en **14 px** (`text-sm`) plutôt qu'en 16 px. Ce n'est pas
retenu comme constat : la hauteur d'x d'Inter donne à 14 px la lecture d'un
15–16 px dans la plupart des polices. À réexaminer après un essai sur un
téléphone réel.

### Non vérifié / à confirmer

- ⚠️ **Le rendu sur un vrai Android.** Ici, les symboles manquants tombent sur
  DejaVu Sans ; sur Android ce sera Roboto ou Noto, et `⚠` possiblement en
  emoji couleur. La **conclusion** (police étrangère à la marque) tient ; le
  **rendu exact** dépend de l'appareil.
- ⚠️ **Le catalogue réel.** Le stub ne porte qu'un produit. Un nom de vendeur
  ou un titre contenant un caractère `latin-ext` (`ă`, `ş`, `ł`…) déclencherait
  le téléchargement d'Inter `latin-ext` : **85 272 octets**, plus que la
  police principale. Non observé ici ; à vérifier sur la production.

### Observé hors périmètre (non audité)

Deux choses vues en mesurant, qui ne relèvent pas de la typographie mais ne
doivent pas se perdre :

- **Français en interface kreyòl sur le tableau de bord** — « Mes produits »,
  « Codes promo », « Mes données & mon compte »
  (`app/tableau-de-bord/page.tsx:665,748,833`), « Demander un retrait »
  (`:560`), « Enregistrer » (`components/profile-form.tsx:337`), « Supprimer
  mon compte » (`components/account-actions.tsx:55`), et « Bonjour » en tête
  de page (capture `revue-typographie-2026-09-26/tableau-de-bord-mobile.png`).
- **« NaN HTG » possible** — `components/digital-seller-metrics.tsx:9` calcule
  `formatHTG(Number(data.gross_htg))` sans garde : si le champ manque,
  `Number(undefined)` rend `NaN` et l'écran affiche un montant « NaN HTG ».
  Observé avec le stub, qui ne fournit pas `gross_htg` ; en production, cela
  dépend de la réponse de la fonction. Un affichage d'argent ne devrait pas
  pouvoir produire `NaN`.
