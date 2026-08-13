# Rapport de revue — Zabelie, parité des kinds — 2026-08-13

**Mode** : CIBLÉ (axe fonctionnel : couverture des trois kinds sur le cycle de vie complet, profondeur COMPLET sur cet axe) · **Périmètre** : `app/`, `lib/`, `components/`, `supabase/migrations/`, `e2e/`, + mesures sur la base de production · **Stack** : Next.js App Router / Supabase (RLS, ledger append-only) / Vercel · **Document gouvernant** : `docs/26-CAHIER-DES-CHARGES-MARKETPLACE.md` v3.2

> Règle appliquée : chaque constat cite un `fichier:ligne` réellement lu, ou une
> mesure exécutée contre la production le 2026-08-13. Ce qui n'a pas pu être
> vérifié est marqué `⚠️ À vérifier`. Aucun fichier de l'app n'a été modifié.

## Résumé exécutif

La discipline `product-kind` est **exemplaire côté TypeScript** — un module
unique, des `switch` exhaustifs, un garde d'exécution à la frontière réseau, et
un recensement complet montre **zéro littéral de kind hors du module** hors
tests. Le déséquilibre est ailleurs, et il est **inversé par rapport à
l'intuition** : le kind le plus outillé (`physical` — machine d'états, stock,
variantes, sweep, e2e dédié) n'a **aucun produit en production**, tandis que le
kind le moins couvert (`service` — aucun état d'exécution, aucun filet SQL,
maturation aveugle) est **le seul qui ait des commandes réelles** (4, aucune
payée). Les trois risques de tête : **(1)** le chemin de téléversement est mort
pour les trois kinds (0 policy storage, 0 objet, 4/4 `cover_url` NULL) — tout le
reste de ce rapport est théorique tant qu'aucune image ni aucun livrable ne peut
entrer ; **(2)** un service payé paierait son vendeur à J+7 sans qu'aucune trace
d'exécution n'existe ni ne puisse exister — risque *accepté* par l'arbitrage
B(i), mais **la condition de sortie que le cahier exige n'a jamais été posée** ;
**(3)** la seule fiche `fichier` publiée n'a pas de livrable : la porte est
fermée au checkout (409), mais la fiche reste au catalogue et le parcours
d'achat meurt en erreur.

## Verdicts sur les hypothèses du brief

| Hypothèse | Verdict | Preuve |
|---|---|---|
| Le sweep filtre `kind = 'physical'` | ✅ **Confirmé** | `supabase/migrations/0043_fulfillment.sql:518` |
| …donc les commandes digitales/services sont des orphelins indétectables | ⚠️ **Partiellement infirmé** | `fichier` a son propre filet depuis `0059` (`0059:70,104`), appelé par le cron (`app/api/fulfillment/sweep/route.ts:122-124`). **`service` reste sans aucun filet** — aucun `WHERE kind = 'service'` n'existe dans tout `supabase/migrations/` (recensement exhaustif) |
| Ancre du sweep = `min(payments.confirmed_at)` | ✅ **Confirmé** | `0043:513-516` (`cross join lateral (select min(pay.confirmed_at) …)`) ; le délai vendeur repart de cette ancre, pas de l'heure de réparation (`0043:534-537`) |
| « cours du créole » publié sans asset et **achetable** | ⚠️ **Infirmé aujourd'hui** | Le produit existe (mesure prod : 1 `fichier` publié sans asset) mais le checkout **refuse** — 409 `produit_incomplet` (`app/api/checkout/route.ts:131-144`) — et la re-publication est gardée en 422 (`app/api/admin/product-status/route.ts:65-88`). Reste le constat DIG-01 : la fiche est visible et le parcours meurt en erreur |
| Tous les `cover_url` NULL, storage sans policies | ✅ **Confirmé** | Mesure prod 2026-08-13 : `cover_url` NULL **4/4**, `pg_policies` sur `storage.objects` : **0**, objets en storage : **0**. Le bucket est créé `public` sans aucune policy (`0039_product_covers_bucket.sql:14`) |
| Arbitrage B « recommandé mais non tranché » | ❌ **Infirmé** | **Tranché le 2026-08-08** : « services CONFIRMÉS » (`docs/26:100-101`). L'exposition est documentée mot pour mot (`docs/26:103-109`)… et le cahier exige une **condition de sortie** qui n'a jamais été posée (`docs/26:117-127`) → SRV-01 |
| Littéraux de kind éparpillés | ❌ **Infirmé côté TS**, ✅ **structurel côté SQL** | TS : tous les littéraux vivent dans `lib/product-kind.ts` (+ tests/commentaires) — recensement Grep exhaustif. SQL : `0043:518` (`physical`), `0059:70,104` (`fichier`), et **aucune occurrence `service`** — le kind absent des `WHERE` n'est pas un oubli de style, c'est le trou fonctionnel |

## Tableau de bord

| Kind | Posture | Constats (🔴/🟠/🟡/🔵) |
|---|---|---|
| Transversal | **Bloqué à l'étape 1** (téléversement mort) | 1 / 1 / 1 / 1 |
| `physical` | Chaîne la plus complète du dépôt — jamais exercée (0 produit en prod) | 0 / 1 / 1 / 1 |
| `fichier` | Correcte — gardes en série, manque les pratiques d'accès du standard | 0 / 1 / 1 / 1 |
| `service` | **Structurellement incomplète** — et seul kind avec des commandes réelles | 1 / 0 / 1 / 1 |

## Matrice de parité des kinds

| Étape du cycle | `physical` | `fichier` | `service` | Réf. |
|---|---|---|---|---|
| 1. Création / publication | ✅ route dédiée, poids ≤ 200 kg, stock, variantes (`0036:27-62`) · ⚠️ **aucune photo exigée** | ✅ formulaire + porte livrable 422/503 (`product-status/route.ts:65-88`) · livrable ≤ 50 Mo (`asset/route.ts:10`) | ✅ formulaire, `deliveryDays`, `serviceIncludes` (`publish-form.tsx:73-74`) | TRV-01, PHY-01 |
| — téléversement d'assets | ❌ **mort** (0 policy, clé HS) | ❌ **mort** | (sans objet) | TRV-01 🔴 |
| 2. Catalogue / fiche | ✅ badge, mention livraison attribuée au vendeur (`product-kind.ts:247-262`) · repli sans cover propre (`product-card.tsx:57-69`) | ✅ idem · ⚠️ 1 fiche publiée **sans livrable** visible | ✅ badge, délai déclaré · ⚠️ exclu de l'API v1, délibéré (`product-kind.ts:283-297`) | DIG-01, SRV-03 |
| 3. Checkout / paiement | ✅ prix serveur (`checkout/route.ts:114,153`), réservation stock (`:266`) | ✅ prix serveur + **double porte** sans-livrable 409 (`:131-144`) | ✅ prix serveur | — |
| — Zelle USD | ⚠️ `expected_usd_cents` figé (`:205-209`) mais rail bloqué (`USD_HTG_RATE` absent) | ⚠️ idem | ⚠️ idem | DIG-03 |
| 4. Fulfillment | ✅ machine d'états complète, sweep + orphelins, ancre paiement (`0043:186-556`) | ⚠️ filet structurel seul — détection sans verrou, choix documenté (`0059:37-51`) | ❌ **rien** : `open_fulfillment` rend `false` (`0043:202-204`), aucun sweep | SRV-01 🔴 |
| 5. Post-achat | ⚠️ suivi déclaré par les parties, litiges D-10→D-14 **ouverts** (`docs/28`) | ✅ URL signée 5 min (`download/route.ts:84`), `delivered` au 1ᵉʳ téléchargement (`:96`), re-téléchargement possible (`:42`) · ⚠️ ni limite, ni watermark | ❌ libellé statique (`mes-achats/page.tsx:259-263`), **aucun état d'exécution** | DIG-02, SRV-01 |
| — notation | ✅ `ReviewForm` (`mes-achats/page.tsx:265-269`) | ✅ idem | ✅ idem — seule vraie parité post-achat | — |
| 6. Payout vendeur | ✅ J+7 **verrouillé** par la remise (`0043:160-166` + gate `0043:212`) | ⚠️ J+7 non verrouillé — assumé, compensé par `0059` | ❌ J+7 **aveugle** : payé sans preuve d'exécution | SRV-01 🔴 |
| — commission | ✅ 10 %/6 % en table de config, écran câblé (`0054`/`0066`, vérifié en prod le 2026-08-12) | ✅ idem | ✅ idem | — |
| — e2e | ✅ `e2e/parcours-physique.spec.ts` | ✅ `e2e/money-path.spec.ts` (produit démo `KIND_FILE`, `lib/sample-data.ts:29`) | ❌ aucun | TRV-03 |

## Constats détaillés

### 🔴 Critiques

#### [TRV-01] Le chemin de téléversement est mort pour les trois kinds — tout le cycle 1 est impraticable
- **Axe** : Fonctionnel / Sécurité (root cause)
- **Emplacement** : `supabase/migrations/0039_product_covers_bucket.sql:14` (bucket créé `public`, **aucune** `create policy` dans la migration) · mesure prod 2026-08-13 : `pg_policies` sur `storage.objects` = **0**, objets = **0**, `cover_url` NULL = **4/4**
- **Constat** : `storage.objects` a la RLS active et zéro policy, donc toute écriture passe par service-role — et la clé de service en production est hors d'usage (fait externe connu, `OPS_TODO.md`). Aucun vendeur n'a jamais pu franchir l'étape photo, aucun livrable n'a jamais été téléversé.
- **Impact** : le catalogue n'a aucune image ; le kind `fichier` est structurellement invendable (pas de livrable possible) ; `physical` ne peut pas respecter le standard photo du marché. **Tous les autres constats de ce rapport sont théoriques tant que celui-ci tient.**
- **Preuve** : le code aval est propre — upload cover borné 5 Mo/formats avec erreurs distinctes 422/502/500 (`app/api/products/cover/route.ts:49,56,74-79,89-91`), livrable borné 50 Mo (`app/api/products/asset/route.ts:10,71-74`), repli d'affichage sans cover (`components/product-card.tsx:57-69`, `app/produit/[slug]/page.tsx:150`). Le défaut n'est pas dans le code : il est dans la clé et l'absence de policies.
- **Correctif proposé** : (a) geste porteur — remplacer `SUPABASE_SERVICE_ROLE_KEY` dans Vercel (Production + Preview) + redéploiement ; (b) migration `0068` : policies storage minimales (lecture publique du bucket covers ; écriture réservée service-role explicite) pour que la sécurité cesse de reposer sur « RLS sans policy » ; (c) premier téléversement réel = preuve de bout en bout, à coller dans `docs/22` étape 0.
- **Effort** : S (clé, porteur) + M (policies + preuve)

#### [SRV-01] Un service payé paie son vendeur à J+7 sans qu'aucune preuve d'exécution n'existe — et la condition de sortie exigée par le cahier n'a jamais été posée
- **Axe** : Fonctionnel / Argent
- **Emplacement** : `supabase/migrations/0043_fulfillment.sql:202-204` (`if v_kind is distinct from 'physical' then return false`) · `0043:160-166` (`mature_wallets` : seule `not gated_on_delivery` retient la paie) · recensement SQL : **aucun** `WHERE kind = 'service'` dans `supabase/migrations/` · `app/mes-achats/page.tsx:259-263` (l'acheteur d'un service ne voit qu'un libellé statique) · `docs/26:100-127`
- **Constat** : la chaîne complète, mesurée : paiement confirmé → escrow `maturing` non verrouillé → aucun état de remise n'existe ni ne peut être créé pour un service → `mature_wallets()` paie à J+7 → aucun sweep ne regarde jamais ce kind → l'acheteur n'a aucun état où accrocher un litige. Le cahier documente cette exposition **mot pour mot** et l'accepte (arbitrage B(i), 2026-08-08) *sous condition* d'un seuil de sortie écrit — déclencheur, conséquence, inscription dans `OPS_TODO` (`docs/26:117-127`). **Ce seuil n'existe nulle part** : ni dans `docs/26` au-delà de sa formulation, ni dans `OPS_TODO.md`.
- **Impact** : mesuré en prod — le seul produit publié acheté est un `service` (4 commandes : 1 `pending`, 3 `cancelled`, **0 payée, 0 escrow**). Aucun argent n'a encore été exposé. Mais le premier paiement de service déroulera la chaîne ci-dessus intégralement, et le contrôle qui borne le risque aujourd'hui (publication manuelle par le porteur) « ne passe pas à l'échelle et se dégrade en silence » — c'est la formulation du cahier lui-même.
- **Preuve** : lignes citées lues ; mesure des 4 commandes exécutée le 2026-08-13.
- **Correctif proposé** : deux niveaux, distincts. **(a) S, décision porteur, aujourd'hui** : poser le seuil de sortie dans `docs/26` + `OPS_TODO` (proposition conforme au motif `dispute_weekly_ceiling` : déclencheur = 3 services publiés OU première délégation de la publication ; conséquence = gel des nouvelles publications de service). **(b) L, chantier** : « qu'est-ce que *rendu* pour une prestation » — acte de livraison vendeur + acceptation acheteur avec timeout, sur le modèle Fiverr (acceptation ou auto-complétion J+3, cf. benchmark P3.1-P3.2), en réutilisant la mécanique `gated_on_delivery`/`0043` existante plutôt qu'une seconde machine.
- **Effort** : S (seuil) puis L (chantier)

### 🟠 Élevés

#### [PHY-01] La publication d'un produit physique n'exige aucune photo — le standard du marché la rend obligatoire sous peine de dépublication
- **Axe** : Fonctionnel / UX vendeur
- **Emplacement** : `app/api/admin/product-status/route.ts:65` — la porte de publication ne conditionne que `isDownloadable(...)` (livrable des `fichier`) ; aucun contrôle de `cover_url` pour aucun kind
- **Constat** : un `physical` (et un `service`, et un `fichier`) peut être publié sans aucune image. Le benchmark est sans ambiguïté : Jumia impose fond blanc, un produit par photo, première image en vue de face, **produit désactivé** en cas de non-conformité (VendorHub, sourcé).
- **Impact** : sur une marketplace de produits physiques, une fiche sans photo ne vend pas et dégrade la confiance dans tout le catalogue. Mesure prod : 4/4 fiches sans image — indistinguable aujourd'hui de TRV-01.
- **Correctif proposé** : étendre la porte de publication : `cover_url` non NULL exigé pour `published`, tous kinds (ou a minima `physical`), même motif fail-closed que le garde livrable (422 nommant le manque, 503 sur erreur de lecture). ⚠️ **Séquencement obligatoire : APRÈS TRV-01** — l'exiger aujourd'hui interdirait toute publication, puisqu'aucune image ne peut entrer.
- **Effort** : S (une fois TRV-01 levé)

#### [DIG-01] La seule fiche `fichier` publiée n'a pas de livrable : le parcours d'achat meurt en 409 après la fiche
- **Axe** : Fonctionnel / UX acheteur
- **Emplacement** : mesure prod 2026-08-13 (1 `fichier` publié, 0 asset) · refus aval : `app/api/checkout/route.ts:131-144` (409 `produit_incomplet`) · porte amont : `app/api/admin/product-status/route.ts:65-88` (422 à la re-publication) · filet : `0059` (détection post-paiement, appliquée en prod le 2026-08-12)
- **Constat** : les trois gardes existent et fonctionnent — mais l'objet legacy, publié avant eux, reste au catalogue. Un acheteur voit la fiche, clique acheter, et reçoit une erreur.
- **Impact** : aucun risque d'argent (le 409 précède tout paiement). Coût de confiance : le premier parcours d'achat digital du site aboutit à une erreur.
- **Correctif proposé** : geste porteur, pas de code — dépublier « cours du créole » (la porte ne le laissera revenir qu'avec un livrable), ou téléverser son livrable (bloqué par TRV-01). Puis vérifier : `select count(*) from products p where kind='fichier' and status='published' and not exists (select 1 from product_assets a where a.product_id = p.id)` doit rendre 0.
- **Effort** : S

#### [TRV-02] Aucun contact acheteur structuré — les notifications et litiges de tous les kinds n'ont pas de destinataire fiable
- **Axe** : Fonctionnel
- **Emplacement** : `docs/28` M0/D-10 (`docs/28:15-28`) — décisions **ouvertes** ; l'outbox (`0061`, en prod) résout l'email à la vente depuis `auth.users` mais rien n'existe pour un contact de remise (téléphone/WhatsApp)
- **Constat** : le suivi physique (`0043`) et le futur suivi service (SRV-01b) supposent de joindre l'acheteur ; le canal n'est pas défini (D-10 : champ obligatoire ou optionnel, formulation kreyòl — décision porteur).
- **Impact** : les avis de remise et les litiges reposent sur le seul email d'inscription — sur le terrain visé, souvent moins vivant que WhatsApp.
- **Correctif proposé** : trancher D-10→D-14 (`docs/28`) — décisions porteur, préalables au chantier litiges et à `0056`.
- **Effort** : M (après décisions)

### 🟡 Moyens

#### [DIG-02] L'accès au fichier acheté est en dessous du standard : ni bibliothèque nommée, ni limite, ni marquage
- **Axe** : Fonctionnel
- **Emplacement** : `app/api/download/route.ts:42` (re-téléchargement possible — `paid` ou `delivered` acceptés), `:84` (URL signée 5 min ✅), `:96` (`delivered` au premier téléchargement) — 99 lignes, lues ; aucune colonne de comptage de téléchargements dans `product_assets` (`0043`/`0059` lus)
- **Constat** : la base est saine (URL signée courte, re-téléchargement depuis `mes-achats` = bibliothèque de fait). Manquent, vs le standard : un **compteur de téléchargements** (observabilité anti-abus), et le **marquage à l'email de l'acheteur** (Gumroad « PDF stamping », Chariow — présenté comme dissuasion, pas DRM ; pratiqué par l'acteur francophone africain de référence). La re-téléchargeabilité illimitée est par ailleurs le bon choix pour le terrain (un lien unique qui meurt en pleine coupure réseau est l'anti-pattern local).
- **Correctif proposé** : (a) S — colonne `download_count` incrémentée dans la route (observabilité d'abord, limite éventuelle ensuite, en table de config jamais en dur) ; (b) L — watermark PDF à l'email, chantier séparé, après la première vente réelle.
- **Effort** : S puis L

#### [SRV-02] Aucune notion de réservation/planification pour les services — le délai est purement déclaratif
- **Axe** : Fonctionnel
- **Emplacement** : `lib/products.ts:28-29` (`deliveryDays`, `serviceIncludes` — seuls champs propres au kind), `components/publish-form.tsx:73-74`
- **Constat** : le standard services (SweepSouth : date + lead time 24 h + récurrence ; Fiverr : commande datée avec délais formels) repose sur des étapes horodatées à comportement par défaut. Zabelie n'a que le délai affiché sur la fiche.
- **Impact** : nul tant que SRV-01b n'existe pas — la planification sans état d'exécution serait une promesse de plus sans mécanique dessous.
- **Correctif proposé** : à intégrer au chantier SRV-01b, pas avant. La brique minimale du benchmark n'est pas le calendrier, c'est **le délai avec comportement à expiration**.
- **Effort** : L (dans SRV-01b)

#### [PHY-02] Pas de flux de retour acheteur — seule la mécanique de remboursement existe
- **Axe** : Fonctionnel
- **Emplacement** : `refund_order` (`0037`, fingerprint vérifié en prod le 2026-08-11) relibère le stock ; aucun écran ni état « retour demandé » ; litiges suspendus aux décisions `docs/28`
- **Constat** : le standard du marché est une fenêtre courte et explicite (Jumia 7 j, Konga 7 j, Takealot 30 j — sourcé). Zabelie n'a ni fenêtre ni flux ; la logistique inverse n'est de toute façon pas transposable telle quelle (lentille haïtienne : dépôt en point de retrait plutôt que collecte).
- **Correctif proposé** : dans le chantier litiges (D-10→D-14) : une fenêtre écrite en table de config + un état `retour demandé` accroché à `zabelie_fulfillment` — pas un système logistique.
- **Effort** : M (après D-10→D-14)

#### [TRV-03] Aucun test e2e ne traverse le kind `service`
- **Axe** : Qualité
- **Emplacement** : `e2e/` — trois specs : `money-path.spec.ts` (produit démo `pack-presets-lightroom-afro`, `KIND_FILE` via `lib/sample-data.ts:29`), `parcours-physique.spec.ts` (dont l'en-tête raconte précisément le bug d'un flux jamais traversé), `partage-fiche.spec.ts`
- **Constat** : le kind qui a le moins de gardes a aussi zéro parcours automatisé — la combinaison exacte qui a déjà coûté (l'en-tête de `parcours-physique.spec.ts:7-8` documente qu'aucun `physical` n'avait jamais traversé le flux avant lui).
- **Correctif proposé** : un `e2e/parcours-service.spec.ts` sur le modèle du parcours physique : fiche → checkout → (mock passerelle) → mes-achats affiche le bon libellé. À étendre quand SRV-01b existera.
- **Effort** : S/M

### 🔵 Faibles

#### [PHY-03] Pas de numéro de suivi ni de points de retrait — écart benchmark assumé par le modèle
- **Emplacement** : `lib/product-kind.ts:247-262` (`deliveryNoticeKey` : zone + délai déclarés par le vendeur, attribués à lui)
- **Constat** : Jumia/Bumpa offrent du tracking parce qu'ils ont (ou agrègent) des transporteurs. Zabelie ne livre pas — le choix du déclaratif attribué est documenté et cohérent. La piste transposable du benchmark, à garder pour plus tard : des **points de retrait nommés** (modèle pickup station), qui ne demandent aucune flotte.
- **Effort** : L (hors périmètre actuel)

#### [DIG-04] Pas de prévisualisation/extrait sur les fiches `fichier`
- **Emplacement** : `app/produit/[slug]/page.tsx` (fiche lue : description, badges, prix — aucun mécanisme d'extrait)
- **Constat** : Gumroad sépare contenu public et contenu livré (cover + préview). Sans image possible (TRV-01), la question est prématurée.
- **Effort** : M (après TRV-01)

#### [SRV-03] Les services sont exclus de l'API v1 — délibéré et documenté, à ne pas « corriger »
- **Emplacement** : `lib/product-kind.ts:283-297` (`isSearchableByApiV1` : décision porteur 2026-08-01, écart avec le catalogue web assumé et documenté)
- **Constat** : noté ici uniquement pour que la matrice de parité ne se lise pas comme un oubli.
- **Effort** : —

#### [TRV-04] « Avis déposé ✓ » en dur dans `mes-achats`
- **Emplacement** : `app/mes-achats/page.tsx:266`
- **Constat** : chaîne française hors i18n sur un écran quatre langues — même classe que les libellés du pied de page corrigés le 2026-08-13 ; rejoint la tâche ouverte « garde des chaînes en dur ».
- **Effort** : S

## Écart benchmark — les 3 manques par kind, classés par impact lancement

*(Benchmark sourcé par recherche web du 2026-08-13 — sources dans l'annexe. Lentille haïtienne appliquée : seuls les manques transposables sans infrastructure physique sont classés.)*

**`physical`**
1. **Photos obligatoires avec sanction de visibilité** (Jumia VendorHub : fond neutre, un produit/photo, désactivation sinon) → PHY-01. Préalable : TRV-01.
2. **Fenêtre de retour courte et écrite** (7 j Jumia/Konga ; variante praticable : dépôt en point convenu, pas de collecte) → PHY-02.
3. **Chaque étape porte un délai + un comportement à expiration** — déjà le motif de `0043` (`shipment_deadline_days`, `auto_receive_days`) : Zabelie est **au standard** ici ; le manque est l'exercice réel du chemin, pas la mécanique.

**`fichier`**
1. **Bibliothèque d'achats persistante** — partiellement au standard (re-téléchargement depuis `mes-achats`, `download/route.ts:42`) ; manque le compteur d'observabilité → DIG-02a.
2. **Marquage à l'identité de l'acheteur** (Gumroad stamping, Chariow watermark email — la pratique de l'acteur francophone africain le plus comparable) → DIG-02b.
3. **Livraison duale redirection + email** (Paystack : page de téléchargement ET lien dans le reçu) — l'outbox `0061` porte le reçu ; le lien de téléchargement dans l'email de confirmation est le chaînon manquant. ⚠️ À vérifier : contenu exact des gabarits d'email de `lib/zabelie-notify.ts` (non relu dans cet audit).

**`service`**
1. **Acte formel de livraison + acceptation avec timeout** (Fiverr : delivered → acceptation ou auto-complétion J+3 ; KongaPay : escrow jusqu'à complétion) → SRV-01b. **Le manque n°1 du rapport.**
2. **Confirmation croisée / notation mutuelle double-aveugle** (SweepSouth bilatéral ; Fiverr publication simultanée — le détail qui compte sur un petit marché où tout le monde se connaît) → extension de SRV-01b ; la notation acheteur existe déjà (`mes-achats:265-269`).
3. **Réservation avec lead time** (SweepSouth 24 h) → SRV-02, après SRV-01b.

## Plan d'action priorisé

| Ordre | Constat | Action concrète | Sévérité | Effort |
|---|---|---|---|---|
| 1 | TRV-01a | **Geste porteur** : remplacer `SUPABASE_SERVICE_ROLE_KEY` (Vercel Production + Preview), redéployer, téléverser une première image — la preuve va dans `docs/22` étape 0 | 🔴 | S |
| 2 | SRV-01a | **Décision porteur** : poser le seuil de sortie de l'arbitrage B(i) dans `docs/26` + `OPS_TODO` (déclencheur, conséquence) — la formulation est prête dans le constat | 🔴 | S |
| 3 | DIG-01 | **Geste porteur** : dépublier « cours du créole » (ou lui téléverser son livrable une fois TRV-01a fait) | 🟠 | S |
| 4 | TRV-01b | Écrire `0068_storage_policies` : lecture publique du bucket covers, écriture service-role explicite — avec répétition prod-conforme et sondes négatives, comme les migrations de cette semaine | 🔴 | M |
| 5 | PHY-01 | Étendre la porte de publication : `cover_url` exigé pour `published` (fail-closed, 422 nommé) — **après** TRV-01 | 🟠 | S |
| 6 | TRV-03 | Écrire `e2e/parcours-service.spec.ts` sur le modèle du parcours physique | 🟡 | S/M |
| 7 | DIG-02a | Colonne `download_count` + incrément dans `download/route.ts` (observabilité, pas de limite en dur) | 🟡 | S |
| 8 | TRV-04 | Passer « Avis déposé ✓ » par `t(lang, …)` (rejoint la tâche i18n ouverte) | 🔵 | S |
| 9 | TRV-02 | Trancher D-10→D-14 (`docs/28`) — décisions porteur — puis chantier contact acheteur | 🟠 | M |
| 10 | SRV-01b | Chantier « rendu pour une prestation » : livraison vendeur + acceptation acheteur + timeout, sur la mécanique `0043` existante (modèle Fiverr J+3) | 🔴* | L |
| 11 | PHY-02 | Fenêtre de retour en table de config + état `retour demandé` — dans le chantier litiges | 🟡 | M |
| 12 | DIG-02b | Watermark PDF à l'email acheteur — après la première vente réelle | 🟡 | L |

*\* SRV-01b est 🔴 par nature mais vient après les S : le seuil (ordre 2) borne le risque en attendant, exactement comme le cahier le prévoit.*

**Par quoi commencer aujourd'hui** : les ordres 1 à 3 sont trois gestes porteur
sans une ligne de code — la clé, le seuil, la dépublication. Le premier point de
contrôle humain avant toute opération en prod est inchangé : toute écriture
(migration `0068` comprise) se propose et attend son signal, règle dure n°5.

## Quick wins (< 30 min)

- SRV-01a — poser le seuil de sortie (décision + deux lignes de doc)
- DIG-01 — dépublier la fiche sans livrable
- PHY-01 — étendre la porte de publication (dès TRV-01 levé)
- DIG-02a — compteur de téléchargements
- TRV-04 — la chaîne en dur de `mes-achats`

## Annexe — Couverture

**Vérifié (lu intégralement ou aux lignes citées)** :
`lib/product-kind.ts` (intégral) · `lib/products.ts:28-29` · `lib/sample-data.ts:29,41` ·
`lib/fulfillment.ts:180-215` · `app/api/checkout/route.ts:114-209,266` ·
`app/api/download/route.ts` (intégral, 99 l.) · `app/api/admin/product-status/route.ts:65-88` ·
`app/api/products/cover/route.ts:10-95` · `app/api/products/asset/route.ts:10-85` ·
`app/api/fulfillment/sweep/route.ts:105-125` · `app/api/moncash/return/route.ts:109-178` ·
`app/api/stripe/webhook/route.ts:74-75` · `app/api/admin/confirm-zelle/route.ts:88-89` ·
`app/mes-achats/page.tsx:240-277` · `components/product-card.tsx:32-69` ·
`components/publish-form.tsx:68-74` · `app/produit/[slug]/page.tsx:144-155` ·
migrations `0036` (extraits cités), `0039:14`, `0043:142-166,186-228,347,498-556`,
`0059` (intégral, lu le 2026-08-12), `0061` (intégral, lu le 2026-08-12) ·
`docs/26:96-130` · `docs/28:1-33` (en-têtes) · `e2e/money-path.spec.ts:1-25` ·
recensement Grep exhaustif des littéraux de kind (TS et SQL).

**Mesuré en production (2026-08-13)** : produits par kind/statut · `cover_url`
NULL 4/4 · policies `storage.objects` = 0 · objets storage = 0 · 1 `fichier`
publié sans asset · 4 commandes (toutes `service` : 1 `pending`, 3 `cancelled`,
0 escrow).

**Non vérifié / à confirmer** :
- Contenu des gabarits d'email (`lib/zabelie-notify.ts`) — le lien de
  téléchargement figure-t-il dans le reçu ? (DIG, écart benchmark 3)
- Comportement runtime réel des parcours (aucun paiement n'a jamais eu lieu en
  prod ; les e2e mockent la passerelle).
- Benchmark : deux points marqués ⚠️ Non vérifié dans la recherche source
  (règles photos Konga ; limites de téléchargement natives et URLs signées
  documentées première main chez Selar/Chariow).
- `docs/26` au-delà de `:96-130` — seule la section services a été relue en
  intégralité pour cet audit ciblé.

**Intrant benchmark** : recherche web du 2026-08-13 (Jumia, Konga, Takealot,
Bumpa · Selar, Chariow, Paystack, Gumroad · Glovo, Yango, SweepSouth, Fiverr),
sources : jumia.com.ng/sp-returns-refunds · vendorhub.jumia.com.ng/product-images ·
konga.com/content/return-policy · konga.com/help/buyer-safety ·
terms-and-policies.takealot.com · getbumpa.com/blog · selar.com/blog ·
help.gumroad.com (PDF stamping, Library) · paystack.com/blog/product/digital-products ·
chariow.com · help.fiverr.com (order process, reviews) · d3.harvard.edu (SweepSouth) ·
avalon-logistics.pl (Glovo, Glovo Cash) · yango.com.
