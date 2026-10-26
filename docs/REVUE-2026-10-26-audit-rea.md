# Audit REA — Zabelie (2026-10-26)

> **RAPPORT VIVANT — tenu à jour.** L'audit initial (étape 1) était un constat
> sans code ; l'étape 2 (correctifs, sur « go » du porteur) est suivie dans la
> section **Avancement** ci-dessous, et chaque entrée des 10 problèmes porte
> son état en tête.
>
> **Étape 1 (origine) : constat. Aucune modification de code, aucune écriture
> base, aucune décision tranchée.** Les recommandations qui touchent l'argent,
> la conformité BRH, la base ou le positionnement sont des **options rendues au
> porteur** (zones d'arrêt, `docs/25` §4) — elles attendent son « go ».
>
> **Méthode.** Trois explorations parallèles du code (parcours acheteur,
> parcours vendeur + design, transversal perf/résilience/i18n/confiance), puis
> recoupement des sept affirmations les plus lourdes contre le code réel.
>
> **REA.** Les principes de Jumia (marché émergent, mobile money, 3G) et
> d'Amazon (fiche produit, recherche, confiance) sont extraits de leur
> fonctionnement **public et connu** — aucun outil REA lancé, aucune capture,
> aucune décompilation (zone d'arrêt). On en tire le POURQUOI, jamais
> l'apparence, et on n'adapte que ce qui vaut pour un utilisateur haïtien.
>
> **Statut par problème** : `vérifié` = ligne lue dans ce tour · `rapporté` =
> observé par l'exploration, cohérent, non relu ligne à ligne ici · `supposé` =
> inféré sans preuve directe.

## Avancement (mis à jour 2026-10-26)

Branche `claude/sweet-hawking-tgyl8g`. Chaque correctif : `tsc 0 · tests verts
· eslint 0 · next build OK`.

| # | Priorité | État | Commit / note |
|---|---|---|---|
| 2 | 🔴 | ✅ **FAIT** | `da9934f` — bloc d'achat en 4 langues |
| 3 | 🔴 | ◑ **PARTIEL** | `b5cffb8` — échec d'upload journalisé ; la métrique de tunnel vendeur reste à faire |
| 6 | 🟠 | ✅ **FAIT** | `111fb15` — ≈USD sur le prix flash |
| 7 | 🟠 | ✅ **FAIT** | `c67477d` — fuzzy dès « peu de résultats », **en code, sans migration** |
| 9a | 🟡 | ✅ **FAIT** | `4085fc8` — statut « archivé » au tableau de bord |
| 5 | 🟠 | ✍️ **MIGRATION RÉDIGÉE** | `7db9df8` — `0153` **non appliquée** (code livré) ; à appliquer par le porteur |
| 1 | 🔴 | ⏳ **OUVERT** | variable d'env (plan Supabase) — décision porteur |
| 4 | 🔴 | ⏳ **OUVERT** | checkout groupé + quantité — zone d'arrêt argent |
| 8 | 🟠 | ⏳ **OUVERT** | dépend de la migration `0043` non appliquée |
| 9b | 🟡 | ⏳ **OUVERT** | KYC dans l'onboarding — copy/positionnement |
| 10 | 🟡 | ⏳ **OUVERT** | sonde de connectivité (coût data) + cache ISR — arbitrage |

## Principes REA retenus

| Réf | Principe (le POURQUOI) | Modèle |
|---|---|---|
| P1 | L'accueil est un **annuaire** de confiance et de catégories, pas une vitrine éditoriale : chaque pixel ouvre une intention ou rassure | Jumia |
| P2 | La recherche tolère la **langue réelle** de l'utilisateur (fautes, accents, kreyòl), pas la langue « propre » | Jumia |
| P3 | La fiche produit est une **machine à lever le doute** : chaque bloc répond à une peur (livré ? remboursé ? vrai ?) ; prix + CTA dominent | Jumia + Amazon |
| P4 | Réduire le **risque perçu** au paiement. Pas de cash à la livraison possible (BRH) → l'escrow/séquestre joue ce rôle et doit être **visible** | Jumia |
| P5 | Après paiement, un **statut lisible** vaut une assurance | Jumia |
| P6 | La performance sur **3G** n'est pas une optimisation, c'est une condition d'accès : chaque Mo est un acheteur perdu | Jumia |
| P7 | Le vendeur informel est **tenu par la main** ; chaque friction = un catalogue perdu, et ses échecs doivent être **visibles ET récupérables** | Jumia |
| A1 | La **preuve sociale vérifiée** (note + volume + ancienneté) est le moteur de confiance ; sans volume, l'identité vérifiée + l'escrow prennent le relais | Amazon |
| A2 | Les **facettes** transforment un grand catalogue en réponses | Amazon |
| A3 | Chaque **étape** de checkout perd des acheteurs : réduire les écrans, pré-remplir | Amazon |
| A4 | La **cohérence** EST un signal de confiance ; l'incohérence se lit comme de l'amateurisme, donc du risque | Amazon |

## Les 10 problèmes, par priorité

### 🔴 CRITIQUE

---

**1. ⏳ OUVERT — Images produit : aucun chemin de réduction actif par défaut.**
- **Localisation.** `lib/product-image.ts:23` (`ENABLED = …IMAGE_TRANSFORM === "1"`) et `:46` (`if (!ENABLED) return url;` → URL d'origine) ; `.env.example:138` vide ; cartes et galerie en `<img>` brut sans `srcset`/`sizes` (`components/card-image.tsx:41-53`, `components/galerie-produit.tsx:50-90`).
- **Pourquoi (haïtien).** Le compresseur navigateur tolère jusqu'à ~1,5 Mo (`lib/image-limits.ts`). Transform éteinte + pas de `srcset` = une grille de 60 cartes peut tirer 60 × jusqu'à 1,5 Mo sur 3G. « Le poste le plus cher de la page » (`docs/41:347`). Latent aujourd'hui (0 image en base), **armé dès le premier upload vendeur**.
- **Principe REA.** P6 — chaque Mo est un acheteur perdu.
- **Solution (option).** Vérifier le plan Supabase puis activer `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM=1` (⚠️ **variable d'environnement = zone d'arrêt**, à poser par le porteur), et/ou servir `next/image` avec `sizes` sur les cartes. Le code de transformation existe déjà (`coverUrlAt`) — réutiliser, ne pas réécrire.
- **Statut.** `vérifié` (`product-image.ts` lu) ; `<img>`/`.env.example` `rapporté`.

**2. ✅ FAIT (`da9934f`) — Le bloc d'achat est en dur en français — servi aussi aux utilisateurs kreyòl.**
- **Localisation.** `app/produit/[slug]/page.tsx:629-635` : `stockLabels={{ chooseVariant:"Choisir", outOfStock:"Rupture de stock", lastUnits:"Plus que {n} en stock", inStock:"{n} en stock", variantOut:"Indisponible" }}` — aucun `t(lang,…)`. Aussi : variante sans libellé → `"Standard"` (`components/buy-button.tsx:473`) ; compatibilité véhicule en dur (`app/produit/[slug]/page.tsx:450,463-466`).
- **Pourquoi (haïtien).** Ces libellés pilotent le badge de stock et le bouton qui **décide l'achat**. Un acheteur kreyòl voit « Rupture de stock », « Plus que 2 en stock » en français, sur l'élément le plus sensible. Violation directe du kreyòl-first.
- **Principe REA.** P3 — la fiche lève le doute ; ici elle le crée, dans la mauvaise langue.
- **Solution (option).** Passer ces chaînes par `lib/i18n.ts` (4 langues) comme le reste de la fiche.
- **Statut.** `vérifié` (lignes 629-635 lues) ; variante/compat `rapporté`.

**3. ◑ PARTIEL (`b5cffb8`) — L'échec d'upload photo est muet côté ops.**
- **Localisation.** `app/api/products/media/route.ts:173-175` : `if (upErr) { return …("api.upload.failed"), status 502 }` — **aucun `console.error`**, contrairement au cas « table absente » juste au-dessus (`:155`). Idem `app/api/products/cover/route.ts:143-145`.
- **Pourquoi (haïtien).** Si un bucket manque ou la clé service-role est fausse/périmée, **chaque vendeur** voit « Envoi de l'image échoué » et **l'équipe n'a aucun signal**. C'est la cicatrice du 2026-08-11 sous une autre forme : l'upload lui-même est réparé (compression navigateur, erreurs lisibles), mais le chemin vendeur reste non instrumenté — `lib/storage-buckets.ts` le dit déjà de lui-même.
- **Principe REA.** P7 — les échecs vendeur doivent être visibles.
- **Solution (option).** Journaliser l'échec de stockage (sans donnée personnelle) + une métrique de tunnel vendeur (création OK/KO, upload OK/KO), à côté de `lib/metrics.ts` qui ne suit aujourd'hui que `sell_cta_clicked`.
- **Statut.** `vérifié` (media/route.ts lu) ; cover/route.ts `rapporté`.

**4. ⏳ OUVERT — Le panier n'a pas de checkout unique par défaut, ni de quantité.**
- **Localisation.** `app/panier/page.tsx:110-120` (paiement groupé derrière un drapeau base `payerTout`), `:186` (sinon chaque ligne = un `<Link>` vers la fiche pour payer), `:164-193` (aucun contrôle de quantité) ; `components/buy-button.tsx:239` (`quantity: 1`).
- **Pourquoi (haïtien).** L'acheteur multi-articles paie **fiche par fiche**, et ne peut pas commander 3 unités d'un même article sans 3 achats. Chaque aller-retour perd des acheteurs sur 3G.
- **Principe REA.** A3 — réduire les étapes entre désir et achat.
- **Solution (option).** Activer/câbler le checkout groupé par défaut et un sélecteur de quantité. ⚠️ Touche au **calcul de prix serveur** → zone d'arrêt argent : à cadrer avec le porteur avant tout code.
- **Statut.** `rapporté` (structure cohérente avec le drapeau et `quantity:1` vérifié).

### 🟠 ÉLEVÉE

---

**5. ✍️ MIGRATION `0153` RÉDIGÉE, NON APPLIQUÉE (`7db9df8`) — La vitrine boutique n'a aucun signal de confiance.**
- **Localisation.** `components/boutique-vue.tsx:70-84` n'affiche que nom + nombre de produits + badge éventuel ; le modèle `lib/creators.ts:8-24` (`CreatorProfile`) **ne porte ni note, ni ancienneté, ni ventes totales**, et la vue publique `zabelie_boutik_public` n'expose pas ces colonnes.
- **Pourquoi (haïtien).** Sur un marché « trust-first » sans réputation établie, l'acheteur décide **à l'aveugle** : ni avis, ni « membre depuis », ni volume de ventes. Le seul signal fort (le badge Identité vérifiée) n'apparaît que s'il existe, et rien n'indique qu'une vérification existe quand elle manque.
- **Principe REA.** A1 — preuve sociale vérifiée ; faute de volume, l'ancienneté et l'identité portent la confiance.
- **Solution (option).** Exposer « membre depuis » + note agrégée + ventes de la boutique. ⚠️ Exige des **colonnes/vue base** (`zabelie_boutik_public`) → zone d'arrêt base : migration **rédigée non appliquée**, validée par le porteur.
- **Statut.** `rapporté` (type et composant cités par l'exploration).

**6. ✅ FAIT (`111fb15`) — Incohérence de devise pendant une vente flash.**
- **Localisation.** `app/produit/[slug]/page.tsx:565-568` : le prix HTG affiché est bien `flash.prixFlashHtg`, mais l'équivalent `≈ usdHint(product.priceHTG)` reçoit **toujours le prix plein**, jamais le prix flash.
- **Pourquoi (haïtien/diaspora).** En promo, le HTG baisse mais l'« ≈ USD » reste au prix fort, **côte à côte** : contradiction à l'écran, au moment le plus sensible, lisible comme une arnaque. Le bouton MonCash, lui, prend bien le prix flash (`:627,636`) — donc l'affichage ment par rapport à ce qui sera débité.
- **Principe REA.** P4 + A4 — cohérence = confiance ; une incohérence de prix détruit la réassurance.
- **Solution (option).** Passer `flash ? flash.prixFlashHtg : product.priceHTG` à `usdHint`. Correctif d'affichage (pas un calcul de prix serveur), mais **touche un montant montré** → faire valider.
- **Statut.** `vérifié` (lignes 565-568 lues).

**7. ✅ FAIT (`c67477d`, en code, sans migration) — La recherche kreyòl est faible.**
- **Localisation.** Couche littérale `ilike '%terme%'` **sensible aux accents** (`lib/recherche-synonymes.ts:180-185`, appelée `lib/products.ts:318,534`) ; le rattrapage trigramme ne se déclenche **que si zéro résultat** (`app/catalogue/page.tsx:111`) ; les « suggestions » ne portent que sur des libellés de rayons, pas sur les produits (`components/search-box.tsx:58-64`).
- **Pourquoi (haïtien).** « vandè »/« vande », « batri »/« batery » ne s'alignent pas ; dès qu'un seul résultat littéral existe, le fuzzy ne tourne jamais et les variantes restent invisibles. Même famille que le piège `\b`/accents de `CLAUDE.md` (ici côté données, pas regex). Sur un marché kreyòl mobile, beaucoup de requêtes à l'oreille ratent leur cible.
- **Principe REA.** P2 (langue réelle) + A2 (facettes/suggestions).
- **Solution — ✅ CORRIGÉ en CODE (commit `c67477d`), AUCUNE migration.** Correction d'une erreur de ce rapport : il n'y a pas de « zone d'arrêt base » ici. Le dépôt résout **déjà** l'insensibilité aux accents — `zabelie_search_normalize` (via `translate`, et `0047` **interdit explicitement** `unaccent`, qui est `STABLE` et corromprait silencieusement les index d'expression), et `zabelie_search_fuzzy` est déjà accent-insensible sur index trigramme. Le seul gap était côté code : le fuzzy ne se déclenchait qu'à **zéro** résultat littéral. Correctif livré : déclenchement dès « moins de 3 » résultats, approchants **dédoublonnés** contre les exacts, libellé adapté (`catalog.fuzzy.more`), capteur de demande (`manque`) réservé au vrai zéro. Reste ouvert (non fait, sans migration) : l'autocomplétion produit pendant la frappe.
- **Statut.** `vérifié` et **corrigé** (`app/catalogue/page.tsx`, i18n 4 langues ; `tsc`/tests/build verts).

**8. ⏳ OUVERT — Pas d'estimation de livraison/zone pour un produit physique.**
- **Localisation.** Le badge délai (`⏱️`) n'existe **que** pour un service (`app/produit/[slug]/page.tsx:375-384`) ; la zone de livraison est toujours nulle (`:293-299`, repli « à convenir »).
- **Pourquoi (haïtien).** L'acheteur d'un bien physique ne sait **ni quand ni où** il reçoit, seulement « à convenir avec le vendeur ». Trust-gap sur tout le segment physique, au moment de décider.
- **Principe REA.** P3/P5 — lever le doute sur la livraison.
- **Solution (option).** Afficher une estimation zone/délai pour le physique (données déjà partiellement présentes côté expédition `0043` — à croiser). Touche le modèle produit → cadrer.
- **Statut.** `rapporté`.

### 🟡 MOYENNE

---

**9. ◑ PARTIEL — Deux statuts trompeurs côté vendeur.** *(a) statut archivé ✅ FAIT (`4085fc8`) ; (b) KYC onboarding ⏳ OUVERT.*
- **Localisation.** (a) Produit **archivé affiché « en revue »** au tableau de bord : `app/tableau-de-bord/page.tsx:718-722` range tout ce qui n'est pas `published` dans `status.review` — alors que `/vendre` a précisément corrigé ça (`app/vendre/page.tsx:362-363`, `estArchivee(s)` → `status.archived`, UX-01 du 2026-10-19). Le correctif n'a jamais été porté au tableau de bord. (b) **KYC absent de l'onboarding** : ni `/ouvrir-ma-boutique` ni `/vendre` ne mentionnent la vérification d'identité (enterrée dans `app/tableau-de-bord/compte/page.tsx`).
- **Pourquoi (haïtien).** (a) Le vendeur retiré par la modération croit être encore en examen et attend. (b) Le chemin vers le badge « Identité vérifiée » — le **principal levier de confiance côté acheteur** — est invisible au moment où le vendeur s'engage.
- **Principe REA.** P5 (statut lisible) + P7/A1 (onboarding qui construit la confiance).
- **Solution (option).** Porter le libellé `status.archived` au tableau de bord (correctif local, réutilise `estArchivee`) ; mentionner le KYC et son bénéfice dès l'onboarding.
- **Statut.** `vérifié` (dashboard:718-722 et vendre:362-363 lus) ; KYC absent `rapporté` (grep de l'exploration).

**10. ⏳ OUVERT — Résilience et perf serveur sur le vrai terrain.**
- **Localisation.** (a) Connectivité via `navigator.onLine` seul (`components/connectivity-notice.tsx:10`, `lib/use-poll.ts:40`). (b) Accueil et catalogue en `force-dynamic` sans cache (`app/page.tsx:34`, `app/catalogue/page.tsx:28`), l'accueil lisant jusqu'à 5000 commandes par requête (`app/page.tsx:113-116`).
- **Pourquoi (haïtien).** (a) `navigator.onLine` ne voit que l'interface réseau : sur une coupure Digicel où la radio reste attachée mais ne passe plus de paquets — **le mode de panne réel** — le bandeau hors-ligne ne s'affiche jamais et le polling continue. (b) Les deux pages les plus visitées rendent côté serveur à chaque hit : TTFB élevé sur infra faible, zéro mise en cache des pages publiques.
- **Principe REA.** P6 — accès au marché sur réseau faible.
- **Solution (option).** Compléter `navigator.onLine` par une sonde de débit réel (échec de fetch) ; envisager ISR/revalidation sur accueil et catalogue publics.
- **Statut.** `vérifié` (connectivity-notice lu) ; cache/cascade `rapporté`.

## Confrontation REA — synthèse

| Principe | Zabelie | Écart |
|---|---|---|
| P1 accueil = annuaire | partiel | le CTA plein cadre du bas est **vendeur**, pas acheteur (`app/page.tsx:431-447`) — **positionnement = zone d'arrêt** |
| P2 recherche langue réelle | corrigé (fuzzy élargi) | #7 ✅ ; autocomplétion produit encore absente |
| P3 fiche lève le doute | **bon** | fuite kreyòl #2 ✅ ; livraison physique #8 ⏳ |
| P4 risque perçu / escrow visible | **bon** (escrow dit sur la fiche et le panier) | incohérence flash #6 ✅ |
| P5 suivi lisible | **bon** côté acheteur (`mes-achats`) | statut vendeur : #9a ✅ ; #9b ⏳ |
| P6 data-light / 3G | à risque | #1 ⏳, #10 ⏳ |
| P7 vendeur tenu, échecs visibles | partiel | upload muet #3 ◑ (journalisé ; métrique à faire) ; litiges invisibles au vendeur (annexe) ⏳ |
| A1 preuve sociale vérifiée | vitrine enrichie | #5 ✍️ (migration `0153` à appliquer) |
| A2 facettes | filtres présents ; rattrapage fuzzy #7 ✅ | suggestions produits encore absentes ⏳ |
| A3 checkout minimal | — | #4 ⏳ |
| A4 cohérence = confiance | incohérence flash #6 ✅ | divergences de format de date (annexe) ⏳ |

## Ce qui est DÉJÀ solide (ne pas refaire)

- **Confiance** : badge identité fail-closed (`lib/identite-verifiee.ts:23-31`), qui dit ce qu'il n'est PAS ; gardes `tests/promesse-vendeur.test.ts` / `tests/accueil-maquette.test.ts` avec frontières accent-sûres `(?<!\p{L})…(?!\p{L})` ; escrow énoncé là où on hésite (fiche + panier).
- **Argent vendeur** : tableau de bord complet (solde dispo, en attente avec date de maturité, net cumulé, retrait).
- **PWA/offline** : `CHEMINS_JAMAIS_CACHES` (paiement/panier/produit) en `NetworkOnly`, repli `/hors-ligne`, sortie de secours `/sw-desinstaller`, `reloadOnOnline:false`.
- **Écrans d'erreur** : reload unique sur chunk coupé, `global-error` à styles inline.
- **Polices** : auto-hébergées, 76,7 Ko, `preload:false` mesuré.
- **A11y** : `:focus-visible` unique, lien d'évitement, `<html lang>` dynamique, `min-h-dvh`, `alt`=titre, animations sous `prefers-reduced-motion`.
- **Design system** : tokens source unique, porte de contraste CI, orange réservé CTA/prix, mode sombre par `data-theme`.
- **i18n** : ~1330 clés × 4 langues, parité testée ; URL `/ht/ /fr/` (l'ancien « tout indexé en français » est résolu).
- **Images cartes** : lazy-load, CLS 0, `alt`=titre, redimensionnement CDN *quand* la transform est active.

## Annexe — autres constats vérifiés/rapportés (hors top 10)

- **Garde i18n aveugle** : `tests/i18n-chaines-en-dur.test.ts:66` ne scanne que le texte JSX avec accents **français** (classe sans `ò`, ignore `aria-label`/`placeholder`/`title`/`alt`) — ne peut pas attraper le kreyòl en dur. 28 segments FR inventoriés rendus à un utilisateur kreyòl ; **le kreyòl n'a jamais été relu par un locuteur natif** (`lib/i18n.ts:3`, risque de lancement). `rapporté`.
- **Litiges invisibles au vendeur** : l'alerte « À traiter » ne compte que `awaiting_shipment` (`app/tableau-de-bord/page.tsx:249-254`), aucun compteur de contestations. `rapporté`.
- **`etal.css` recopie la palette en dur** (`app/ouvrir-ma-boutique/etal.css:22-34`) hors tokens, **hors porte de contraste CI**, et ignore le mode sombre de l'utilisateur. `rapporté`.
- **`fulfillment-actions.tsx:81-82`** : accusé de réception rendu en `✓` seul, sans libellé traduit (a11y). `rapporté`.
- **Tri « meilleures ventes »** sur `sales_count` applicatif non adossé au paiement (`app/catalogue/page.tsx:273`, `lib/products.ts:543`) → ordre potentiellement trompeur. `rapporté`.
- **Pas de squelette** sur accueil, panier, mes-achats (3G) ; formats de date `fr-HT`/locale incohérents (`flash-manager.tsx:103`, `mes-achats` échéance). `rapporté`.
- **Mode `/decouvrir`** : selon `seller-pricing`, les cartes pointent vers `/decouvrir/[slug]` et non `/produit/[slug]` (`components/product-card.tsx:77-79`) — fiche réellement vue non auditée. `supposé`.

## Décisions / gestes qui restent au porteur (zones d'arrêt)

*Mis à jour : #6 (argent/affichage) est désormais FAIT et retiré de cette
liste ; #7 n'y a jamais eu sa place (corrigé en code — le dépôt interdit la
migration `unaccent` et porte déjà la normalisation).*

1. **Appliquer la migration `0153`** (#5) — rédigée, non appliquée ; son bloc
   `do $$` s'auto-vérifie à l'exécution. *Débloque : les signaux de confiance
   de la vitrine, dont le code est déjà déployable.*
2. **Variable d'env** `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM` (#1) — vérifier le
   plan Supabase, puis poser la variable. *Bloque : la perf image de tout le
   catalogue.*
3. **Argent** : checkout groupé par défaut + quantité (#4). *Bloque : la
   conversion multi-articles ; touche le calcul de prix serveur — à cadrer
   avant tout code.*
4. **Positionnement / copy** : le CTA plein cadre du bas d'accueil est vendeur,
   pas acheteur (`app/page.tsx:431-447`) ; et mention du KYC dans l'onboarding
   vendeur (#9b). *Arbitrage acheteur/vendeur et promesse — à trancher.*
5. **Arbitrages produit** : estimation de livraison physique (#8, dépend de
   `0043` non appliquée) ; sonde de connectivité réelle vs coût data sur 3G, et
   cache ISR accueil/catalogue (#10).

---

*Protocole en cours (à la demande du porteur, « j'attends le résultat final ») :
les correctifs SANS zone d'arrêt sont livrés en autonomie, un par un, chacun
prouvé (`tsc`, tests, `next build`) et annoncé dans son commit. Les gestes
ci-dessus ne s'exécutent pas sans décision explicite ; en particulier,
**appliquer une migration reste un geste du porteur** (règle dure n°5).*
