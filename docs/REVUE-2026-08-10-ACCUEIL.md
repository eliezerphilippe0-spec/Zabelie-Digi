# Rapport de revue — Zabelie, page d'accueil — 2026-08-10

**Mode** : CIBLÉ · **Périmètre** : `app/page.tsx` et ses composants (`site-nav`,
`category-sidebar`, `trust-bar`, `hero-carousel`), les clés i18n rendues par
l'accueil, les tokens de thème · **Stack** : Next.js 16 App Router · Tailwind v4
· Supabase · Vercel.

**Base de l'observation** : le code du dépôt (lu), quatre captures d'écran du
porteur (production, langue FR, desktop), et deux mesures exécutées — les ratios
de contraste et le QC contraste du dépôt.

---

## Résumé exécutif

L'accueil est structurellement sain : les sections se masquent à vide, le
bandeau de confiance ne promet que des mécanismes réels, la taxonomie vient de
la base, les liens internes mènent tous quelque part. Les défauts trouvés ne
sont pas des pannes, ce sont des **écarts entre ce que la page affirme et ce que
la plateforme fait** — plus une couche d'instruments périmés qui empêchent de
les voir.

Trois choses à traiter en priorité :

1. **La page se contredit sur son propre mécanisme d'argent.** Le bandeau dit
   « le vendeur n'est payé qu'après la **remise** » ; trois sections plus bas,
   « chaque paiement reste en escrow jusqu'à la **livraison** ». Le second est
   faux (`0043` libère sur *déclaration*, pas sur livraison observée) et il est
   écrit dans les quatre langues. Le garde qui interdit exactement cette phrase
   existe — il ne regarde que les dix clés `trust.*`.
2. **La colonne des rayons est sous le seuil de lisibilité** : 2,82:1 mesuré,
   pour 4,5:1 requis, sur les seize rangées. Le même défaut a déjà été corrigé
   une fois sur la pastille NatCash ; la colonne, seize fois plus exposée, ne
   l'a pas été.
3. **L'instrument censé attraper le point 2 mesure une palette qui n'existe
   plus.** `scripts/zabelie-contrast.mjs` teste du violet et du marron ; le site
   est noir et orange depuis le 2026-07-25. Il annonce sept échecs, sort en 0,
   et n'est appelé par aucune CI.

---

## Tableau de bord par axe

| Axe | Posture | 🔴 / 🟠 / 🟡 / 🔵 |
|-----|---------|-------------------|
| Sécurité | Correcte (hors périmètre de cette revue : rien de neuf sur l'accueil) | 0 / 0 / 0 / 0 |
| UX | À améliorer | 0 / 3 / 3 / 0 |
| UI | À améliorer | 0 / 2 / 3 / 3 |
| Responsivité | Correcte — un point à confirmer au rendu | 0 / 0 / 0 / 0 |

---

## Constats détaillés

### 🟠 Élevés

#### [UX-01] La page se contredit sur ce qui libère l'argent

- **Axe** : UX (contenu — promesse)
- **Emplacement** : `lib/i18n.ts:316` (fr), `:767` (kr), `:1210` (en),
  `:1663` (es) — clé `why.1.b`, rendue par `app/page.tsx:715`.
- **Constat** : la section « Pourquoi choisir Zabelie » affirme « Chaque
  paiement reste en escrow **jusqu'à la livraison** » (kr « jiska livrezon »,
  en « until delivery », es « hasta la entrega »). Le bandeau de confiance, à
  trois sections de distance sur la même page, dit « Le vendeur n'est payé
  qu'après **la remise** » (`trust.2.b`).
- **Impact** : deux affirmations différentes sur le même mécanisme, et la plus
  visible des deux est fausse. `0043` libère l'escrow sur **déclaration** de
  remise par l'acheteur, ou par auto-réception après `auto_receive_days` —
  Zabelie n'observe aucune livraison et n'en détient aucune preuve. En cas de
  litige, c'est la phrase que l'acheteur citera.
- **Preuve** : `components/trust-bar.tsx:1-23` énumère les promesses refusées et
  pourquoi. `tests/accueil-maquette.test.ts:28-35` porte le détecteur
  `PROMESSES_NON_TENUES`, qui contient bien `livraison|livré|delivery` — mais
  `CLES_CONFIANCE` ne liste que les dix clés `trust.*`. Le garde ne regarde pas
  `why.*`, qui est sur le même écran.
- **Correctif proposé** : aligner `why.1.b` sur le vocabulaire de `0043`
  (« jusqu'à ce que l'acheteur confirme la remise ») dans les quatre langues, et
  **étendre `CLES_CONFIANCE` à toutes les clés de promesse de l'accueil**
  (`why.*`, `home.b*`, `home.s*`) — sinon la prochaine section réintroduira la
  même phrase.
- **Effort** : S

#### [UX-02] « NatCash — bientôt » annonce un rail interdit par les règles dures

- **Axe** : UX (contenu — promesse commerciale)
- **Emplacement** : `app/page.tsx:515-517`, clé `footer.natcash` —
  `lib/i18n.ts:49` (« NatCash — bientôt »), `:510` (« NatCash — talè konsa »),
  `:948` (« coming soon »), `:1401` (« próximamente »).
- **Constat** : le bandeau de paiement place NatCash à côté de MonCash et Zelle
  avec la mention « bientôt », dans les quatre langues.
- **Impact** : `CLAUDE.md` règle dure n°2 classe **NatCash ⛔ — aucune API
  publique**, et « ne pas coder un rail qui ne peut pas exister ». « Bientôt »
  est un engagement de calendrier sur un rail dont l'étape 0 de la checklist
  `docs/03-PAIEMENTS.md` §9 (prouver que l'API existe) n'est pas franchie et ne
  dépend pas de nous. Un acheteur qui attend NatCash n'achètera pas avec
  MonCash entre-temps.
- **Preuve** : `CLAUDE.md` §« Règles dures » n°2 ; la pastille est rendue sans
  condition, contrairement aux cartes WhatsApp qui se masquent sans numéro.
- **Correctif proposé** : ⛔ **arbitrage porteur — zone d'arrêt** (promesse
  commerciale, `docs/25` §4). Trois options, je ne tranche pas :
  (a) retirer la pastille NatCash ;
  (b) remplacer « bientôt » par une formulation sans calendrier
      (« NatCash — pas encore disponible ») ;
  (c) la garder telle quelle en l'assumant comme signal de demande.
- **Effort** : S

#### [UI-01] La colonne des rayons est sous le seuil de contraste, sur ses seize rangées

- **Axe** : UI (accessibilité)
- **Emplacement** : `components/category-sidebar.tsx:61` (`text-mist/50`) et
  `:64` (`text-mist/60`).
- **Constat** : le libellé d'un rayon vide est rendu en `text-mist/50` et son
  badge « bientôt » en `text-mist/60`, sur le fond `bg-surface/40`.
- **Impact** : **2,82:1** et **3,54:1** mesurés, pour un seuil WCAG AA de 4,5:1.
  Comme les seize rayons sont vides aujourd'hui, **toute** la colonne est
  concernée — sur le terrain visé (Android d'entrée de gamme, écrans bon marché,
  lumière du jour), elle devient difficilement lisible. C'est aussi le seul
  endroit qui porte l'information « ce rayon est vide », et cette information est
  portée **par la couleur en plus du texte**, dans une teinte sous le seuil.
- **Preuve** : mesuré avec les tokens réellement servis
  (`--color-mist: #a6a6a6`, fond `#121212` à 40 % sur `#0a0a0a`) :

  | Utilitaire | Ratio | Seuil |
  |---|---|---|
  | `text-mist/40` | 2,19:1 | ❌ |
  | `text-mist/50` | 2,82:1 | ❌ |
  | `text-mist/60` | 3,54:1 | ❌ |
  | `text-mist/70` | 4,40:1 | ❌ |
  | `text-mist/80` | 5,41:1 | ✅ |
  | `text-mist` (plein) | 7,98:1 | ✅ |

  Contrôle de l'instrument : ma mesure rend 3,54:1 pour `text-mist/60`, et
  `app/page.tsx:508-514` porte 3,56:1 relevé à la main sur le rendu pour la même
  paire. Les deux concordent.
- **Correctif proposé** : appliquer à la colonne le correctif **déjà décidé et
  appliqué** pour la pastille NatCash (`app/page.tsx:508-517`) — supprimer
  l'opacité, laisser le mot « bientôt » porter seul l'information. Et retirer
  toute opacité inférieure à `/80` sur du texte : 23 occurrences dans
  `app/` + `components/`, dont 17 sous le seuil.
- **Effort** : S

#### [UI-02] « Paiement sécurisé avec MonCash » est rendu deux fois, mot pour mot

- **Axe** : UI (redondance)
- **Emplacement** : `app/page.tsx:338` (`badge.pay`) et `app/page.tsx:488`
  (`trust.1.t`) — `lib/i18n.ts:133` et `:452` portent la **même chaîne**.
- **Constat** : la phrase apparaît sous le carrousel, puis à nouveau en première
  case du bandeau de confiance, séparées d'environ 200 px.
- **Impact** : c'est le troisième doublon d'affilée sur cet écran (après « Vendez
  sur Zabelie » ×3 et « Aide » ×2, tous deux signalés par le porteur et
  corrigés). Le motif se répète parce que rien ne le détecte.
- **Preuve** : `grep -n '"badge.pay"\|"trust.1.t"' lib/i18n.ts` → deux clés,
  valeur identique en fr, kr, en et es.
- **Correctif proposé** : supprimer la ligne `badge.pay` sous le carrousel — le
  bandeau de confiance la porte mieux et avec sa preuve. Puis **câbler un test
  de doublon** : aucune paire de clés rendues par l'accueil ne doit avoir la même
  valeur dans une même langue. Sans ce croisement, le quatrième doublon arrivera.
- **Effort** : S

#### [UX-03] Le bouton le plus fort de la page mène à un mur de connexion, en français seulement

- **Axe** : UX (hiérarchie des actions)
- **Emplacement** : `components/site-nav.tsx:212-217` (`bg-cloud`, le seul
  bouton plein blanc de l'écran) → `app/mes-achats/page.tsx:73-85`.
- **Constat** : le CTA visuellement dominant est « Voir mes achats », affiché
  **aussi aux visiteurs non connectés** (la capture 1 montre « Connexion » dans
  l'en-tête). Sa destination rend « Connecte-toi pour voir tes achats » /
  « Se connecter » — deux chaînes **écrites en dur en français**, hors i18n.
- **Impact** : sur une marketplace dont le catalogue est vide, le geste le plus
  mis en avant pour un primo-visiteur est de consulter des achats qu'il n'a pas
  faits, derrière un mur d'authentification, dans une langue qui n'est pas
  forcément la sienne. Le vrai geste acheteur — « Voir le catalogue » — est
  enfoui dans le carrousel. Un utilisateur kreyòl reçoit du français au bout du
  bouton principal du site.
- **Preuve** : `app/mes-achats/page.tsx:73-85`, chaînes littérales sans `t(lang, …)`.
- **Correctif proposé** : deux gestes distincts —
  (a) n'afficher « Voir mes achats » que si `user` existe, et donner la place au
      catalogue sinon ;
  (b) passer les deux chaînes de `/mes-achats` par i18n.
  Noter aussi que `pay.ok.cta` est la clé du **CTA de fin de paiement** :
  la réutiliser dans la navigation permanente couple deux surfaces sans rapport,
  et reformuler l'une reformulera l'autre en silence.
- **Effort** : S

### 🟡 Moyens

#### [UI-03] Deux sections porteront le même titre dès qu'un produit sera publié

- **Emplacement** : `app/page.tsx:421` et `app/page.tsx:564` — les deux rendent
  `t(lang, "sec.cats")`.
- **Constat** : la grille de rayons (permanente) et les pastilles de catégories
  du catalogue (conditionnées à `categories.length > 0`) portent le titre
  identique « Catégories principales ».
- **Impact** : latent aujourd'hui — le catalogue est vide, donc une seule
  s'affiche (c'est celle de la capture 2). Au **premier produit publié**, la page
  affichera deux fois « Catégories principales », à quelques centaines de pixels
  d'écart, avec des contenus différents. Le défaut apparaîtra exactement le jour
  de la première vente réelle (`docs/22`).
- **Correctif proposé** : donner sa propre clé à la section 2 (ex. `sec.cats.cat`
  → « Explorer par catégorie »), ou fusionner les deux sections.
- **Effort** : S

#### [UX-04] « Talents » atterrit sur « Fichiers digitaux »

- **Emplacement** : ancre `app/page.tsx:605` ; liens `components/site-nav.tsx:177`
  et `:198`, plus le pied de page.
- **Constat** : l'ancre `#talents` est posée juste avant la rangée **Fichiers
  digitaux** (`:609`), et non avant **Services** (`:623`).
- **Impact** : trois liens « Talents » de la navigation déposent le visiteur sur
  une section qui parle de fichiers téléchargeables. Le commentaire du code
  (`:598-604`) dit lui-même que l'ancre doit désigner les services.
- **Preuve** : `tests/ancres-navigation.test.ts` vérifie que l'ancre **existe**,
  pas qu'elle est au bon endroit — l'instrument est vert et la cible est fausse.
- **Correctif proposé** : déplacer le `<div id="talents">` entre les deux
  `HomeRow`, et ajouter au test l'assertion de position (l'ancre doit précéder la
  section `sec.services`).
- **Effort** : S

#### [UI-04] Le QC contraste mesure une palette qui n'existe plus

- **Emplacement** : `scripts/zabelie-contrast.mjs:31-50` (table `T`) vs
  `app/zabelie-theme.css:10-63`.
- **Constat** : le script teste `bg3: "#17123A"` (violet), `surfaceMaroon:
  "#3E262B"`, `text: "#F4EEE8"`, `muted: "#B3A39B"`, `ink: "#17123A"`. Les
  tokens réellement servis depuis la décision du 2026-07-25 sont
  `--color-bg-3: #000000`, `--color-surface-maroon: #181818`,
  `--color-cloud: #ffffff`, `--color-mist: #a6a6a6`, `--color-ink: #0a0a0a`.
- **Impact** : chaque ratio imprimé porte sur un thème qui n'est plus déployé.
  Le script **annonce 7 paires sous le seuil et sort en 0** ; aucun workflow ne
  l'appelle (`grep -rn "zabelie-contrast" .github/` → rien ; seulement
  `package.json:14`). `app/zabelie-theme.css:7` et `docs/18:114` le désignent
  pourtant comme la vérification de référence. Il ne voit par ailleurs aucun
  utilitaire `text-*/NN`, c'est-à-dire précisément la forme de UI-01.
- **Preuve** : exécuté ; sortie complète des 23 paires, `EXIT=0`.
- **Correctif proposé** : synchroniser `T` sur les tokens réels, faire sortir le
  script en **1** quand une paire échoue, l'appeler en CI, et lui faire lire les
  utilitaires `text-*/NN` effectivement présents dans `app/` et `components/`
  plutôt qu'une liste de paires écrite à la main. **Éprouver l'instrument
  corrigé sur un cas connu-positif et un cas connu-négatif** avant de lui faire
  confiance (`CLAUDE.md`, « Un instrument non éprouvé ne prouve rien »).
- **Effort** : M

#### [UI-05] La barre système Android reste violette

- **Emplacement** : `app/layout.tsx:52` — `themeColor: "#17123a"`.
- **Constat** : couleur de l'**ancienne** palette (identique au `bg3` périmé de
  UI-04), alors que le site est noir `#000000`.
- **Impact** : sur Chrome Android — le terrain principal — la barre d'adresse
  s'affiche violette au-dessus d'un site noir et orange.
- **Correctif proposé** : `themeColor: "#0a0a0a"`.
- **Effort** : S

#### [UX-05] « bientôt » est le mot le plus présent du premier écran

- **Emplacement** : `lib/i18n.ts:26` (`menu.empty`) × 16 rangées +
  `footer.natcash` × 1.
- **Constat** : les seize rayons ont été activés en base le 2026-08-10 à la
  demande du porteur, sans aucun produit publié. Chaque rangée porte donc son
  badge « bientôt » (capture 1).
- **Impact** : c'est la conséquence mesurée de l'arbitrage, pas un défaut de
  code — mais elle mérite d'être vue : la promesse dominante de la page d'accueil
  est aujourd'hui l'attente. Le compromis assumé était « montrer l'ampleur du
  projet » contre « montrer qu'il est vide ».
- **Correctif proposé** : ⛔ **arbitrage porteur**. Le SQL de retour à 4 rayons
  est journalisé dans `OPS_TODO.md`. Alternative sans retour arrière : publier
  un premier produit réel (`docs/22`), ce qui éteint les badges du rayon concerné.
- **Effort** : S (SQL) — l'arbitrage n'est pas technique.

#### [UI-06] Deux surfaces montrent les mêmes rayons, une seule dit qu'ils sont vides

- **Emplacement** : `components/category-sidebar.tsx:61-66` (marque `r.vide`)
  vs `app/page.tsx:431-445` (ne le marque pas).
- **Constat** : la colonne de gauche affiche « Auto & Moto — bientôt » ; la
  tuile « Auto & Moto » de la grille des huit, au centre du même écran, n'affiche
  rien de tel et paraît remplie.
- **Impact** : le visiteur qui clique la tuile atterrit sur un rayon en ouverture
  sans avoir été prévenu, alors que l'information existait à 40 cm à gauche.
- **Correctif proposé** : porter `r.vide` sur la tuile, avec le même libellé.
- **Effort** : S

#### [UX-06] Deux champs de recherche sur la même page

- **Emplacement** : `components/site-nav.tsx:86-92` (en-tête collant) et
  `app/page.tsx:464-476` (capteur de demande).
- **Constat** : le capteur de demande réaffiche un champ + un bouton identiques
  à ceux de l'en-tête, qui reste visible au défilement (`sticky top-0`).
- **Impact** : mineur — mais les deux ont le même placeholder et le même libellé
  de bouton, donc rien ne dit au visiteur qu'ils font la même chose.
- **Correctif proposé** : garder le champ (c'est lui qui journalise le manque)
  mais différencier son libellé de bouton (ex. « Dites-nous ») pour que le geste
  se distingue d'une recherche ordinaire.
- **Effort** : S

### 🔵 Faibles

#### [UI-07] La page annonce trois langues, le sélecteur en propose quatre

- **Emplacement** : `lib/i18n.ts:320` (fr), `:771` (kr), `:1214` (en) —
  « Interface en kreyòl, en français et en anglais ». La version espagnole
  (`:1667`) est la seule à jour : « kreyòl, francés, inglés y español ».
- **Impact** : un visiteur hispanophone est correctement informé ; les trois
  autres lisent une capacité sous-évaluée du produit.
- **Correctif** : ajouter l'espagnol dans les trois autres langues. **Effort** : S

#### [UI-08] Émojis mélangés aux icônes SVG, et le drapeau haïtien s'affiche « HT »

- **Emplacement** : `app/page.tsx:714-716` (`🛡️`, `🇭🇹`, `⚡`) et `:787` (`🇭🇹`).
- **Constat** : la section « Pourquoi choisir Zabelie » utilise des émojis là où
  le bandeau de confiance et le rail utilisent des `<svg>` à trait orange. Sur la
  capture 4, `🛡️` sort **bleu** (couleur système, hors palette) et `🇭🇹` sort
  **« HT »** — le rendu de repli des drapeaux régionaux sur les plateformes qui
  ne les embarquent pas (Windows notamment).
- **Impact** : cosmétique, mais « HT » en gris à la place du drapeau, dans une
  carte intitulée « Paiement lakay », rate exactement ce qu'elle visait.
- **Correctif** : passer ces trois icônes en SVG comme le reste
  (`components/trust-bar.tsx` porte déjà le gabarit). **Effort** : S

#### [UI-09] La grille des rayons a des tuiles de hauteurs inégales

- **Emplacement** : `app/page.tsx:439-443` — le sous-titre n'est rendu que si
  `r.enfants.length > 0`.
- **Constat** : capture 2 — « Auto & Moto », « Électronique », « Beauté & soins »
  et « Alimentation & épicerie » ont une ligne de sous-catégories ; les quatre
  autres n'en ont pas. Les tuiles ne s'alignent pas.
- **Correctif** : hauteur minimale sur la tuile, ou réserver la ligne.
  **Effort** : S

---

## ⚠️ À vérifier — non conclu

1. **Les titres apparaissent gris dans les captures alors que le CSS dit blanc.**
   `app/globals.css:11-16` fixe `color: var(--color-cloud)` et
   `app/zabelie-theme.css:58` donne `--color-cloud: #ffffff`. Aucun sélecteur du
   dépôt ne recolore `h1`–`h3`. Or sur les captures 1, 2 et 4, « Produits,
   services et fichiers digitaux », « Catégories principales », « Pourquoi
   choisir Zabelie » et « Argent protégé » paraissent nettement plus sombres que
   le texte `text-mist` qui les suit — soit l'inverse de la hiérarchie codée.
   **Je n'ai pas pu reproduire cet écart depuis le code et je ne l'affirme pas.**
   Vérification : ouvrir l'accueil, inspecter un `h2`, lire *Computed → color*.
   Si ce n'est pas `rgb(255, 255, 255)`, l'origine est ailleurs que dans ces deux
   fichiers (extension de navigateur, profil couleur de la capture, ou CSS servi
   plus ancien que le dépôt).

2. **Débordement horizontal éventuel du bandeau de confiance.** Sur la capture 3,
   la cinquième case (« Aide sur WhatsApp ») est coupée au bord droit. Le calcul
   sur `max-w-6xl` + `lg:grid-cols-5` ne produit pas de débordement, et le
   recadrage de la capture est une explication au moins aussi probable.
   Vérification : `document.documentElement.scrollWidth > window.innerWidth` dans
   la console, à 1280 px puis 1440 px.

---

## Plan d'action priorisé

| Ordre | Constat | Action concrète | Sévérité | Effort |
|-------|---------|-----------------|----------|--------|
| 1 | UX-01 | Réécrire `why.1.b` sur le vocabulaire de `0043` (« remise » et non « livraison ») dans les 4 langues, **et** étendre `CLES_CONFIANCE` de `tests/accueil-maquette.test.ts` à `why.*`, `home.b*`, `home.s*` | 🟠 | S |
| 2 | UI-01 | Retirer l'opacité des libellés et badges de `category-sidebar.tsx:61,64` — appliquer le correctif déjà retenu pour la pastille NatCash | 🟠 | S |
| 3 | UI-02 | Supprimer la ligne `badge.pay` de `app/page.tsx:334-339` (doublon exact de `trust.1.t`) et ajouter un test de valeurs i18n dupliquées sur l'accueil | 🟠 | S |
| 4 | UX-03 | Conditionner le CTA « Voir mes achats » à `user`, et passer par i18n les deux chaînes en dur de `app/mes-achats/page.tsx:73-85` | 🟠 | S |
| 5 | UX-02 | ⛔ **Arbitrage porteur** sur « NatCash — bientôt » avant toute modification | 🟠 | S |
| 6 | UI-05 | `themeColor: "#0a0a0a"` dans `app/layout.tsx:52` | 🟡 | S |
| 7 | UX-04 | Déplacer l'ancre `#talents` avant la section Services et verrouiller sa **position** dans le test | 🟡 | S |
| 8 | UI-03 | Donner sa propre clé au titre de la section 2 (`app/page.tsx:564`) | 🟡 | S |
| 9 | UI-06 | Porter la marque « bientôt » sur les tuiles de la grille des rayons | 🟡 | S |
| 10 | UI-07 | Ajouter l'espagnol à `why.4.b` en fr, kr et en | 🔵 | S |
| 11 | UI-08 | Remplacer `🛡️ 🇭🇹 ⚡` par des SVG du gabarit `trust-bar` | 🔵 | S |
| 12 | UI-09 | Aligner la hauteur des tuiles de rayons | 🔵 | S |
| 13 | UI-04 | Resynchroniser `scripts/zabelie-contrast.mjs` sur les tokens réels, sortie ≠ 0 en échec, lecture des `text-*/NN`, appel en CI — éprouvé connu-positif **et** connu-négatif | 🟡 | M |
| 14 | UX-06 | Différencier le libellé du bouton du capteur de demande | 🟡 | S |
| 15 | UX-05 | ⛔ **Arbitrage porteur** : 16 rayons « bientôt » ou repli à 4 | 🟡 | — |

**Par quoi commencer aujourd'hui** : les ordres 1 à 4 forment un lot cohérent —
tous en `S`, tous sur des fichiers déjà ouverts, et les quatre corrigent des
affirmations fausses ou des impasses visibles dès le premier écran. Ils tiennent
dans une seule PR.

**Premier point de contrôle humain** : l'ordre 5 (NatCash). C'est une promesse
commerciale, donc une zone d'arrêt de `docs/25` §4 — j'expose les options, la
décision ne m'appartient pas. Rien de cette revue ne touche à l'argent, aux
migrations, ni aux variables d'environnement : aucune opération en production
n'est requise.

**Constat de méthode** : trois des défauts ci-dessus (UX-01, UX-04, UI-01) sont
couverts par un test qui existe et qui est vert. Le garde des promesses ne lit
que dix clés ; le test d'ancre vérifie l'existence et pas la position ; le QC
contraste mesure une palette morte. C'est le motif que `CLAUDE.md` documente sous
« Un instrument non éprouvé ne prouve rien » — ici sous sa forme la plus discrète :
non pas l'instrument qui ment, mais **l'instrument dont le périmètre est plus
étroit que ce que son nom laisse croire**. Les correctifs 1, 7 et 13 élargissent
le périmètre ; sans eux, les mêmes défauts reviendront par une autre clé.

---

## Annexe — Couverture

**Vérifié (lu ou exécuté)** :
`app/page.tsx` (829 l., intégral) · `app/layout.tsx` · `app/globals.css` ·
`app/zabelie-theme.css` · `components/site-nav.tsx` · `components/trust-bar.tsx` ·
`components/category-sidebar.tsx` (partiel, l. 1-80) ·
`app/mes-achats/page.tsx` (garde anonyme) · `lib/i18n.ts` (clés de l'accueil,
4 langues) · `lib/fulfillment-notices.ts` · `tests/accueil-maquette.test.ts` ·
`tests/liens-internes.test.ts` · `tests/facture-token.test.ts` ·
`scripts/zabelie-contrast.mjs` (**exécuté**) · ratios de contraste
(**mesurés**, concordants avec la mesure manuelle de `app/page.tsx:508`).

**Non vérifié / à confirmer** :
- Rendu réel (aucun navigateur ici) → les deux points de la section
  « ⚠️ À vérifier ».
- Responsivité : analysée sur les classes Tailwind uniquement, jamais mesurée à
  360 px sur un appareil. Aucun constat de responsivité n'est donc affirmé.
- Sécurité : hors périmètre de cette revue ciblée. L'accueil n'introduit ni
  formulaire authentifié, ni RPC, ni calcul de montant — le durcissement de
  `/facture/[token]` (revue précédente) reste en place.
- `components/hero-carousel.tsx`, `components/search-box.tsx`,
  `components/site-footer.tsx` : non relus dans cette passe.
- Le contenu de `getMenuRayons` n'a pas été requêté en base ; l'état « 16 rayons
  vides » vient de la capture 1 et du journal d'activation d'`OPS_TODO.md`.
