# Rapport de revue — Zabelie — 2026-07-22

**Mode** : CIBLÉ · **Périmètre** : surfaces d'intégration paiement (adapters,
checkout, confirmation, réconciliation, secrets, migrations) en vue d'ajouter
trois rails haïtiens : **Dhecash, Zappp, Htipay** · **Stack** : Next.js (App
Router, TS) + Supabase — détectée, non demandée.

> Revue demandée via le skill `revi-app`. Axe unique : Sécurité/architecture
> d'intégration. UX/UI/responsivité hors périmètre (déjà couverts par
> `REVUE-2026-07-15-team-agents.md`).

## Résumé exécutif

Le cœur money-path est **sain et rail-agnostique** : idempotence en base,
confirmation serveur-à-serveur unique (`confirm_payment`), ledger append-only,
plafonds par rail, montant USD figé et revérifié en base — les invariants des
`docs/03-PAIEMENTS.md` sont mutualisés côté SQL et ne dépendent d'aucun rail
particulier. **Le risque n'est pas dans l'existant, il est dans le projet
d'ajout** : (1) **aucun des trois prestataires visés n'est aujourd'hui démontré
constructible** — Dhecash et Zappp sont introuvables publiquement, Htipay existe
mais sans API développeur publique confirmée — or la règle dure n°2 du projet
interdit de coder un rail qui ne peut pas encore exister ; (2) côté code, il
n'existe **pas d'interface commune** pour les rails produits (contrairement aux
recharges) : chaque ajout retouche ~8 points non documentés, ce qui multiplie
la surface d'erreur par rail ajouté.

## Tableau de bord par axe

| Axe | Posture | Constats (🔴/🟠/🟡/🔵) |
|-----|---------|------------------------|
| Sécurité (intégration paiement) | **Correcte** — solide sur l'existant, à outiller avant extension | 0 / 1 / 3 / 2 |

## Constats détaillés

### 🔴 Critiques

Aucun. Les invariants critiques sont en place et vérifiés sur les trois rails
existants (MonCash S2S, Stripe webhook signé, Zelle confirmation admin).

### 🟠 Élevés

#### [SEC-01] Constructibilité non établie des trois rails visés (Dhecash, Zappp, Htipay)
- **Axe** : Sécurité / dépendances bloquantes (règle dure n°2, `CLAUDE.md`)
- **Emplacement** : n/a (vérification externe, 2026-07-22)
- **Constat** : recherches web (FR + variantes d'orthographe) :
  **Dhecash** — aucune trace publique (site, app store, doc API) ;
  **Zappp** — aucune trace publique ;
  **Htipay** — existe (htipay.com, support.htipay.com : P2P, recharges, swap
  MonCash/NatCash, marketplace « Sabotay »), mais **aucun portail développeur
  public confirmé** (le site bloque la consultation automatisée — ⚠️ à vérifier
  auprès d'eux directement). ⚠️ Piège d'homonymie : **HaitiPay**
  (haitipay.com, portail dev `devportal.haitipay.com`, « Acceptor API ») est
  une **autre fintech** — ne pas confondre les interlocuteurs.
- **Impact** : coder un rail sans sandbox ni doc = violation de la règle qui a
  déjà mis NatCash/BRH en attente ; pire, un rail intégré sans mécanisme de
  confirmation serveur-à-serveur vérifiable (webhook signé ou API de statut)
  ne peut **pas** respecter l'invariant 2 — on créerait un rail structurellement
  non réconciliable.
- **Preuve** : `payment_rail` ne connaît que `moncash/stripe/zelle`
  (`supabase/migrations/0001_schema.sql:18`, `0009_rails_diaspora.sql:11-12`) ;
  le commentaire de 0001 documente déjà le blocage NatCash.
- **Correctif proposé** : avant toute ligne de code, dérouler une **checklist de
  constructibilité** par prestataire (existe ? API publique ? sandbox ? création
  de session de paiement + vérification S2S ou webhook signé ? plafonds ?
  licence BRH ?) — sur le modèle de la checklist BRH de `docs/07-TOPUP.md`. Le
  porteur fournit les contacts/sources (Dhecash et Zappp sont peut-être des
  services très récents ou des orthographes différentes).
- **Effort** : S (vérification, pas de code)

### 🟡 Moyens

#### [SEC-02] Pas d'interface `PaymentProvider` commune côté produits
- **Axe** : Sécurité (surface d'erreur) / architecture
- **Emplacement** : `lib/moncash.ts`, `lib/stripe.ts`, `lib/zelle.ts` (modules
  ad-hoc) vs `lib/zabelie-topup/provider.ts:50-56` (vrai contrat `TopupProvider`)
- **Constat** : les recharges ont une abstraction fournisseur propre
  (interface + adapter Reloadly), mais les rails produits sont trois modules
  hétérogènes, chacun avec son mode de confirmation (S2S polling / webhook /
  admin), branchés en dur dans `app/api/checkout/route.ts:246-279`.
- **Impact** : chaque nouveau rail réimplémente à la main la portion TS des
  invariants (création de session, vérification, rattachement
  `idempotency_key`) — 3 rails ajoutés = 3 occasions de rater un garde-fou.
- **Preuve** : `app/api/checkout/route.ts:39-46` (liste `RAILS` + `railEnabled`
  codés en dur), `:246-279` (branches par rail).
- **Correctif proposé** : extraire un contrat commun minimal (« créer la
  session », « vérifier l'état S2S », « mode de confirmation : webhook | s2s |
  admin ») AVANT d'intégrer un 4ᵉ rail — pas de refactor tant qu'aucun rail
  n'est constructible (YAGNI sinon).
- **Effort** : M

#### [SEC-03] Réconciliateur mono-rail : tout nouveau rail S2S doit y être branché explicitement
- **Axe** : Sécurité (invariant 1c — aucun paiement orphelin)
- **Emplacement** : `app/api/reconcile/route.ts:38-49` (`.eq("rail", "moncash")`)
- **Constat** : le scan des pendings est volontairement limité à MonCash
  (commentaire justifié : Stripe = webhook, Zelle = admin). Or les agrégateurs
  haïtiens type Htipay fonctionneront très probablement comme MonCash
  (redirection + vérification d'état) : un rail ajouté sans extension du
  réconciliateur produirait des paiements encaissés jamais confirmés.
- **Impact** : violation silencieuse de l'invariant « réconciliation totale »
  — le pire type de bug : invisible jusqu'au premier retour navigateur perdu.
- **Preuve** : `lib/reconcile.ts:54-95` orchestre uniquement `retrieve` MonCash.
- **Correctif proposé** : inscrire « brancher le réconciliateur (ou justifier
  par écrit pourquoi pas) » dans la checklist nouveau-rail de SEC-04 ; le jour
  du 1ᵉʳ rail S2S supplémentaire, paramétrer `listPending`/`retrieve` par rail.
- **Effort** : S (doc maintenant) · M (générique, le moment venu)

#### [SEC-04] Aucune checklist « ajouter un rail de paiement »
- **Axe** : Sécurité (processus)
- **Emplacement** : `docs/03-PAIEMENTS.md` (décrit MonCash, pas la procédure
  d'extension)
- **Constat** : l'ajout d'un rail touche ~8 points : enum SQL
  (`payment_rail`), adapter `lib/<rail>.ts`, `RAILS`/`railEnabled` + branche de
  création (`app/api/checkout/route.ts`), flux de confirmation (return S2S /
  webhook / admin), réconciliateur (SEC-03), `RAIL_CAPS`/`RAIL_COUNTRY`
  (`lib/payment-utils.ts:51-54,72-75`), UI checkout + admin, `.env.example` +
  `docs/11-SECRETS.md`. Rien de tout cela n'est écrit.
- **Impact** : oubli quasi garanti sous pression (le plus probable : caps,
  réconciliateur, ou registre de secrets).
- **Correctif proposé** : section « Ajouter un rail — checklist » dans
  `docs/03-PAIEMENTS.md`, avec la constructibilité (SEC-01) en étape 0.
- **Effort** : S

### 🔵 Faibles

#### [SEC-05] Dérive possible entre les registres TS et l'enum SQL des rails
- **Axe** : Cohérence
- **Emplacement** : `lib/payment-utils.ts:51-54` (`RAIL_CAPS` contient
  `natcash: 20000`) vs `supabase/migrations/0001_schema.sql:18` (enum sans
  `natcash`)
- **Constat** : `natcash` existe côté TS (préparation Vague 2) mais pas dans
  l'enum : les deux registres peuvent diverger sans erreur de compilation.
  Inoffensif aujourd'hui (un rail inconnu de l'enum ne peut pas s'insérer),
  mais avec 3 rails de plus la liste vit à deux endroits.
- **Correctif proposé** : au moment du prochain rail, dériver les registres TS
  d'une source unique (type union `Rail` exporté) — pas d'action avant.
- **Effort** : S

#### [SEC-06] Documenter l'homonymie Htipay / HaitiPay
- **Axe** : Processus / conformité
- **Emplacement** : documentation fournisseurs (à créer, cf. SEC-01)
- **Constat** : deux fintechs haïtiennes aux noms quasi identiques
  (htipay.com vs haitipay.com) ; seule la seconde a un portail développeur
  public identifié. Une négociation ou une intégration avec le mauvais
  interlocuteur est un risque réel de perte de temps, voire de confusion
  contractuelle.
- **Correctif proposé** : consigner les deux entités (site, contact, statut
  API) dans la fiche de constructibilité de SEC-01.
- **Effort** : S

## Plan d'action priorisé

| Ordre | Constat | Action concrète | Sévérité | Effort |
|-------|---------|-----------------|----------|--------|
| 1 | SEC-01 | Établir la fiche de constructibilité des 3 prestataires (sources du porteur : d'où viennent « Dhecash » et « Zappp » ? contact direct Htipay pour doc API/sandbox) | 🟠 | S |
| 2 | SEC-04 | Écrire la checklist « Ajouter un rail » dans `docs/03-PAIEMENTS.md` (inclut SEC-03 et SEC-06) | 🟡 | S |
| 3 | SEC-03 | Inscrire le branchement du réconciliateur comme étape obligatoire de cette checklist | 🟡 | S |
| 4 | SEC-02 | LE MOMENT VENU (1ᵉʳ rail constructible confirmé) : extraire le contrat `PaymentProvider` commun avant d'intégrer | 🟡 | M |
| 5 | SEC-05 | LE MOMENT VENU : unifier les registres TS des rails sur une source unique | 🔵 | S |

**Par quoi commencer aujourd'hui** : SEC-01 — c'est une conversation, pas du
code, et elle conditionne tout le reste. **Premier point de contrôle humain** :
aucun code de rail n'est écrit tant que la fiche de constructibilité d'au moins
un prestataire n'est pas verte (API + sandbox + mécanisme de confirmation
vérifiable), conformément à la règle dure n°2.

## Quick wins (< 30 min chacun)

- SEC-01 (poser les questions au porteur / contacter Htipay)
- SEC-04 + SEC-03 (checklist dans `docs/03-PAIEMENTS.md`)

## Annexe — Couverture

- **Vérifié (lu intégralement)** : `lib/moncash.ts`, `lib/zelle.ts`,
  `lib/payment-utils.ts`, `lib/reconcile.ts`, `lib/zabelie-topup/provider.ts`,
  `app/api/checkout/route.ts`, `app/api/reconcile/route.ts` (extraits ciblés),
  `.env.example`, `docs/11-SECRETS.md`, migrations `0001:18` et `0009:11-12`.
  Arborescence `app/api/` (routes moncash/return, stripe/webhook,
  admin/confirm-zelle).
- **Non vérifié / à confirmer** :
  - Existence et API de **Dhecash** et **Zappp** — introuvables en ligne le
    2026-07-22 ; il faut la source du porteur.
  - Portail développeur **Htipay** — site inaccessible aux outils automatisés
    (403) ; à confirmer par contact direct.
  - `lib/stripe.ts` non relu ligne à ligne dans cette passe (couvert par
    l'audit du 2026-07-15 et le test CI `api-auth-coverage`).
  - Le fichier `docs/API_KEYS_REGISTRY.md` mentionné dans la demande
    **n'existe pas** dans le repo — l'équivalent réel est `docs/11-SECRETS.md`.
