# 30 — Audit des patterns Izikit — Phase 0

**Date** : 2026-08-10 · **Statut : audit, rien d'implémenté.** Phase 1
conditionnée au « go » du porteur, pattern par pattern.
**Source auditée** : `https://github.com/faratasn-pixel/izikit.git`, clone
`--depth 1` en lecture seule dans `/tmp/izikit-ref` — aucun fichier copié,
aucun code repris (le dépôt est sans licence ; seuls les *mécanismes* sont
décrits ici).
**Méthode** : lecture croisée des deux dépôts, chaque affirmation sur Zabelie
ancrée `fichier:ligne` et revérifiée contre le fichier exécutant avant
rédaction.

---

## 0. Écarts entre le brief du chantier et l'état réel du dépôt

Signalés plutôt que résolus en silence (`CLAUDE.md`, Méthode) :

1. **« dernier connu : `0043` »** — c'est l'état *appliqué en production*
   (2026-08-09). L'état *rédigé* va jusqu'à **`0054`**
   (`supabase/migrations/0054_commission_config.sql`). Tout nouveau numéro
   part donc de **`0055`**, registre `zabelie_schema_migrations` faisant foi.
2. **`MASTER_PROMPT_ZABELIE_AI.md` n'existe pas dans le dépôt.** La seule
   constitution en vigueur ici est `CLAUDE.md` (+ `docs/25` pour la boucle,
   `docs/26` pour le cahier des charges). Le présent audit s'y conforme.
3. **PR #64 (fulfillment) et #71 (AdminShell)** : numéros périmés. Le
   fulfillment est **construit et fusionné** (0043 appliquée, câblage,
   surfaces, expéditeur d'avis — `docs/21` §5), le polissage admin est
   également livré. Les dépendances réelles du découpage §14 sont
   `docs/28` (spec notifications, D-10→D-14 ouvertes) et le registre
   `OPS_TODO.md`.
4. **P4 tel que décrit n'existe pas chez Izikit** : il n'y a *pas* de
   limiteur IP global sous le limiteur par e-mail — l'IP n'y est qu'une clé
   de repli du même limiteur. Corrigé dans la matrice.

## 1. Résumé exécutif

Izikit est un starter Prisma/Neon/Redis dont la **stack entière est hors
périmètre** (interdits n°1-2 du chantier ; `docs/26` : « pas de Redis »). Ce
qui reste transposable, ce sont des mécanismes — et l'audit montre que
Zabelie en possède déjà la moitié, parfois sous une forme plus adaptée à son
terrain (mono-région Vercel, volume naissant, tout-Postgres).

**Trois adoptions valent le coût**, dans cet ordre :

1. **P11 — test structurel du garde admin** (S, 0 migration) :
   `tests/api-auth-coverage.test.ts` impose un garde d'*authentification* à
   toute route, mais **ne vérifie jamais le rôle** — une route
   `/api/admin/*` qui appellerait `getCurrentUser()` sans tester
   `role === "admin"` passerait la CI au vert. Grep vérifié : aucun
   `role`/`admin` dans ce test ; le seul contrôle de rôle testé couvre une
   route sur douze (`tests/admin-menu-counts.test.ts:57`).
2. **P5 — journal d'audit admin** (M, migration `0055`) : **neuf routes
   admin mutantes ne laissent aucune trace** — remboursements, confirmations
   Zelle, règlements de retraits, suspensions de comptes. Le commentaire de
   `app/api/admin/user-status/route.ts:98` renvoie même à des « logs
   d'audit » **qui n'existent pas**. Pour une plateforme sous regard BRH
   dont le ledger est append-only, l'absence d'équivalent côté actes
   d'administration est l'écart le plus sérieux de cet audit.
3. **P10 — `/api/health` + `/api/readyz`** (S, 0 migration) : rien
   n'existe ; c'est le prérequis d'une supervision externe au moment où
   `zabelie.com` passe en production.

**Deux renforcements ciblés** : la purge de rétention des avis envoyés
(P2-lite) et la mise en file persistée des e-mails `order_paid` (P1) — ce
dernier appartient au chantier `docs/28` déjà spécifié, pas à celui-ci.

**Le reste se rejette** — non par défaut de qualité chez Izikit, mais parce
que Zabelie a déjà l'équivalent (P3, P6), a tranché autrement et le documente
(P8), ou parce que la valeur est théorique au volume actuel (P7, P9, P12).

## 2. Matrice d'audit

| # | Pattern | État Zabelie | Valeur prod | Adaptation Supabase | Coût | Recommandation |
|---|---|---|---|---|---|---|
| P1 | Outbox transactionnel | **PARTIEL** — la file d'avis 0043 EST un outbox (inserts dans la tx de la transition, `0043:262-284` ; drain cron + réclamation CAS `lib/fulfillment-notices.ts:172-183`). Mais `notifyOrderPaid` est fire-and-forget sans reprise (`.catch(() => undefined)`, `app/api/stripe/webhook/route.ts:77`, `admin/confirm-zelle/route.ts:74`, `moncash/return/route.ts:166`) | Un e-mail de paiement perdu est perdu (marqueur `zabelie_claim_notification` = anti-doublon, pas reprise) | Généraliser le modèle 0043 (table + `due_at` + CAS sur `attempts`) aux événements de `docs/28` M1 — pas de table « outbox générique » | M · 1 migration | **RENFORCER L'EXISTANT — via le chantier docs/28**, pas ici : M1 y ancre déjà `order_paid`/`order_new` sur `confirm_payment`, et D-10→D-14 sont des décisions porteur ouvertes |
| P2 | File e-mail + purge | **PARTIEL** — file persistée pour les seuls avis de remise ; transport Resend direct best-effort (`lib/zabelie-email.ts:29-32`) ; **aucune purge des avis envoyés** (grep `delete from zabelie_fulfillment_notices` : vide ; seule la cascade sur `orders`, `0043:437`) | Rétention non bornée de lignes liées à des commandes — même classe que ce que `0053` a borné pour la recherche | Fonction `zabelie_purge_sent_notices(p_days)` sur le modèle `purge_payment_raw` (`0016:8`), appelée par le cron sweep existant — `tests/crons-appelants.test.ts` **exigera l'appelant**, c'est le croisement déjà câblé | S · 1 migration | **RENFORCER L'EXISTANT** (purge seule) |
| P3 | Webhook raw-body/HMAC/dedup/anti-replay | **PARTIEL mais structurellement couvert** — Stripe : `req.text()` avant parse (`app/api/stripe/webhook/route.ts:23`), signature + fenêtre replay par le SDK (`lib/stripe.ts:74-81`), 500 volontaire pour rejeu (`:67-70`). MonCash : **pas de webhook du tout** — retour navigateur GET + vérité par appel sortant (`lib/moncash.ts:192-217`) + cron `/api/reconcile`, conforme à l'invariant paiement (b). Dedup au niveau métier : `payments.idempotency_key unique` (`0001:84`) | Le seul manque est une table d'événements webhook (deux événements Stripe distincts sur une même commande ≈ indistinguables d'un rejeu) — inoffensif financièrement grâce à l'idempotence | (sans objet) | — | **REJETER** — l'architecture MonCash sans webhook est un choix d'invariant, pas un manque ; la table d'événements est de l'observabilité sans risque associé aujourd'hui |
| P4 | Rate-limit par e-mail (auth) | **ABSENT — et sans objet** : il n'existe aucune route API d'auth ; l'auth passe par le SDK Supabase côté client (`components/connexion-form.tsx:80,106`) et GoTrue porte son propre freinage, dont les codes sont déjà mappés (`lib/auth-erreurs.ts:51-52`) | Nulle : en construire un exigerait de proxifier l'auth par nos routes — c'est l'interdit n°2 du chantier | (sans objet) | — | **REJETER** — corrigé au passage : chez Izikit même, l'IP n'est qu'une clé de repli, pas une couche sous-jacente |
| P5 | Audit log admin | **ABSENT** — 9 routes admin mutantes, zéro trace (tableau §5 ci-dessous) ; greps `audit`, `admin_log`, `zabelie_audit`, `action_log` : aucune table. `user-status/route.ts:98` référence des logs d'audit inexistants | Remboursements, Zelle, règlements de retraits, suspensions : autant d'actes d'argent ou de droits **sans historique opposable**, sur une plateforme dont le ledger est append-only par posture BRH | Table `zabelie_admin_actions` append-only (modèle `zabelie_topup_ledger`, trigger anti-UPDATE/DELETE, `0010:74-97`), helper `lib/admin-audit.ts`, écrite par les routes ; couverture verrouillée par un test structurel croisé (le pattern `crons-appelants`) | M · 1 migration (`0055`) | **ADOPTER** |
| P6 | `pg_advisory_xact_lock` financier | **EXISTE** — `0030:48` et `0029:50` (verrou par acheteur), `FOR UPDATE` sur tous les chemins d'argent (confirmation `0003:33`, retrait `0034:97`, escrow `0006:55,187`, remise `0043:250,319,392`…), `SKIP LOCKED` pour les balayages (`0043:526,569,602,620`) | — | — | — | **REJETER** — rien à faire, l'existant est plus systématique que la référence |
| P7 | Contexte d'observabilité (`requestId`) | **PARTIEL** — logs JSON structurés sur les 5 sites de maintenance (`app/api/fulfillment/sweep/route.ts:52-54`…), journal-même-à-zéro ; **aucun requestId** (greps `request_id`, `correlation`, `x-request-id` : vides). Nuance Izikit : son contexte ne propage QUE `requestId`, pas `userId`/`route` | Théorique au volume actuel : mono-région, logs Vercel horodatés, 7 crons quotidiens | `AsyncLocalStorage` sans dépendance — possible, mais toucherait toutes les routes | M · 0 migration | **REJETER pour l'instant** — déclencheur nommé : le premier incident où deux requêtes entremêlées sont indiscernables dans les logs |
| P8 | Anti-énumération | **PARTIEL — et c'est un choix documenté** : le reset est générique (« Si un compte existe… », `lib/i18n.ts:443`) ; le signup révèle l'existence et bascule vers la connexion (`components/connexion-form.tsx:141`), choix assumé dans `lib/auth-erreurs.ts:27-31`. Routes admin : 403 uniforme, pas de fuite de ressource (chemins fixes, rien à énumérer) | Faible : le vecteur sérieux (reset) est déjà correct | (sans objet) | — | **REJETER** — renverser le choix signup est une décision produit, pas un correctif ; elle appartient au porteur si un jour il la souhaite |
| P9 | Circuit breaker fournisseur | **ABSENT** — greps `breaker`, `circuit`, `failure_count` : vides. Existant à la place : bornes de tentatives PAR ENTITÉ (`notice_max_attempts`, `lib/fulfillment-notices.ts:159-163` ; Reloadly max 3, `lib/zabelie-topup/fulfill.ts:86-142`) et filets temporels (sweep) | Faible au volume actuel — et en serverless un breaker mémoire est par-instance (Izikit le documente lui-même) ; le porter en Postgres ajouterait une dépendance sur le chemin d'argent | Table de compteurs fenêtrés — possible, non justifié | M · 1 migration | **REJETER** — déclencheur nommé : premier incident fournisseur prolongé où les bornes par entité se révèlent insuffisantes |
| P10 | `/api/health` + `/api/readyz` | **ABSENT** — `ls app/api` : aucune route santé ; le plus proche est `/api/admin/coherence` (contrôle métier, cron) | La mise en production de `zabelie.com` est en cours (runbook OPS_TODO) : sans sonde, « le site est tombé » se découvre par un client | Deux routes : liveness pure (200 constant) ; readiness = `select 1` via client admin sous timeout, 503 sinon. À déclarer dans `PUBLIC_ROUTES` de `tests/api-auth-coverage.test.ts:27-44` avec justification | S · 0 migration | **ADOPTER** |
| P11 | Test structurel garde admin | **PARTIEL** — `tests/api-auth-coverage.test.ts:56-78` impose un garde d'authentification à toute route (avec liste `PUBLIC_ROUTES` justifiée), mais **aucune vérification du rôle** ; 11 des 12 routes admin ne sont couvertes par aucun test de rôle | Une régression silencieuse (garde recopié sans le test de rôle) ouvrirait un refund ou un règlement de retrait à tout utilisateur connecté — la CI resterait verte | Étendre le test existant : toute route sous `app/api/admin/` doit porter un motif de contrôle de rôle (ou `estAdmin`), éprouvé connu-positif/négatif comme les autres croisements du dépôt | S · 0 migration | **ADOPTER** — le meilleur rapport valeur/coût de l'audit |
| P12 | Client fetch avec retry GET-only + codes stables | **ABSENT** (helper, retry) — 25 composants font des `fetch` bruts ; **mais** le besoin est déjà couvert autrement : `lib/use-poll.ts` pour la donnée chère, et des codes `reason` stables par route (`app/api/payouts/route.ts:51-61`, `CauseAuth`) | Un retry automatique n'a de valeur que s'il existe des GET client fréquents — le gros des fetch client est mutant (achat, coupon), où le retry est interdit par principe | (sans objet aujourd'hui) | M-L (refonte 25 composants) | **REJETER** — la discipline « jamais de retry sur verbe mutant » est déjà respectée par construction (aucun retry nulle part) ; unifier pour unifier est du churn |

**Note transverse — codes `ZB0XX`** : ils existent, mais comme **SQLSTATE
indexés sur le numéro de migration** (`ZB042` `0042:81`, `ZB046` `0046:92`,
`ZB047`, `ZB051`-`ZB053`), attrapés par les tests SQL. Côté TypeScript, grep
`ZB0` : vide — les routes exposent des `reason` snake_case. Les patterns
adoptés ci-dessous suivent donc la convention réelle du dépôt (SQLSTATE
`ZB055` pour la migration d'audit ; `reason` côté HTTP), pas une convention
`ZB0XX` applicative qui n'existe pas.

## 3. Détails à l'appui des trois adoptions

### P11 — le trou du garde de rôle, démontré

`tests/api-auth-coverage.test.ts:18-23` reconnaît quatre motifs de garde :
`.auth.getUser()`, `getCurrentUser(`, `authorize(req)`,
`verifyStripeWebhook`. Aucun ne dit *qui a le droit* — seulement que
*quelqu'un est identifié*. Les 12 routes `app/api/admin/*` testent bien le
rôle aujourd'hui (`user.role !== "admin"` → 403), mais une seule est
verrouillée par un test (`tests/admin-menu-counts.test.ts:57`). Le correctif
est un croisement de plus dans la famille existante (`crons-appelants`,
`fulfillment-appelants`) : *toute route sous `app/api/admin/` porte un
contrôle de rôle, et la liste des motifs acceptés est fermée*. Éprouvé par
mutation avant confiance, comme les autres.

### P5 — les neuf actes sans trace

| Route | Acte | Trace actuelle |
|---|---|---|
| `admin/refund/route.ts` | rembourse une commande | aucune |
| `admin/confirm-zelle/route.ts` | confirme un paiement Zelle | aucune |
| `admin/payouts/route.ts` + `settle` | approuve / règle un retrait vendeur | aucune |
| `admin/user-status/route.ts` | suspend / rétablit un compte | aucune (le commentaire `:98` invoque des logs inexistants) |
| `admin/product-status/route.ts` | dépublie un produit | aucune |
| `admin/topup/confirm-zelle`, `topup/refunds`, `topup/sync-catalog` | argent topup / catalogue | aucune |

L'adaptation ne copie pas Izikit : elle suit le modèle **déjà présent** du
dépôt — `zabelie_topup_ledger` (`0010:74-97`), append-only par trigger, RLS,
service-role seul. Contenu d'une ligne : `actor_id`, `action`
(`domaine.verbe`), `target_type`, `target_id`, `reason`, `metadata jsonb`,
`at`. Jamais de donnée personnelle au-delà des ids (la règle de
`last_error` : « le motif dit ce qui a échoué, jamais à qui »).
Migration `0055`, hash canonique au registre, écrite **non appliquée**
jusqu'au geste du porteur.

### P10 — deux sondes, une nuance serverless

`/api/health` : 200 constant, zéro dépendance — « ne ment jamais ».
`/api/readyz` : `select 1` via le client admin sous timeout court, 503 en
échec, `Cache-Control: no-store`. Nuance à documenter dans la route : sur
Vercel, la sonde teste *une* instance éphémère, pas « le serveur » — sa
valeur est la supervision externe (UptimeRobot et consorts pointés sur
`zabelie.com`, action porteur à inscrire à `OPS_TODO` au moment du
rattachement du domaine).

## 4. Proposition de découpage en PRs (Phase 1, après « go »)

Ordre = risque décroissant couvert par euro d'effort. Une PR par ligne, une
branche `feat/izikit-p<N>-<slug>` par PR, un seul chantier à la fois.

| Ordre | PR | Contenu | Coût | Migration | Dépendances |
|---|---|---|---|---|---|
| 1 | `feat/izikit-p11-garde-admin` | Extension de `api-auth-coverage` : contrôle de rôle obligatoire sous `app/api/admin/`, éprouvé par mutation | S | — | aucune |
| 2 | `feat/izikit-p5-audit-admin` | Migration `0055` (`zabelie_admin_actions` append-only + SQLSTATE `ZB055`), helper `lib/admin-audit.ts`, câblage des 9 routes, test structurel de couverture + test SQL append-only | M | `0055` (rédigée, non appliquée) | PR 1 fusionnée (le test de rôle protège les routes qu'on retouche) |
| 3 | `feat/izikit-p10-sondes` | `/api/health` + `/api/readyz`, entrée `PUBLIC_ROUTES` justifiée, ligne `OPS_TODO` (supervision externe à brancher par le porteur) | S | — | aucune |
| 4 | `feat/izikit-p2-purge-avis` | `zabelie_purge_sent_notices(p_days)` (défaut 90), appel depuis le sweep, `crons-appelants` vert par construction, test SQL connu-positif/négatif | S | `0056` (rédigée, non appliquée) | aucune |
| — | P1 (outbox `order_paid`) | **Hors périmètre de ce chantier** : c'est `docs/28` M1, suspendu aux décisions porteur D-10→D-14 | M | 1 | arbitrages `docs/28` |

Ce qui n'ouvre **pas** de PR : P3, P4, P6, P7, P8, P9, P12 — motifs en
matrice, chacun avec son déclencheur nommé quand il y en a un.

## 5. Ce que ce chantier ne touche pas

Supabase Auth, RLS, ledger, registre de migrations, rails de paiement :
inchangés par construction. Aucune des quatre PRs proposées ne modifie un
mécanisme existant qui fonctionne — P5 et P2 *ajoutent* des tables/fonctions
neuves, P10 ajoute deux routes, P11 ajoute un test.

**STOP Phase 0.** Aucune implémentation sans « go » explicite, PR par PR.
