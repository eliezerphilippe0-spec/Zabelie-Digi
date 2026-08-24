# Zabelie — Architecture de paiement (EPIC 4)

> Détail technique du module le plus critique. Découle de `00-CONTEXTE.md §8–§11`.
> Les **trois invariants** sont des contraintes dures, non négociables.

---

## 1. Rails

| Rail | Statut | Vague |
|------|--------|-------|
| **MonCash** (Digicel) | ✅ Ouvert — rail du MVP | 1 |
| **NatCash** | ⛔ Bloqué — en attente d'accès | 2 |
| **Stripe** (carte, diaspora USD) | 🟡 Construit (V-10) — ⚠️ exige une **entité US** (Haïti non supporté comme pays marchand) ; mode test dès maintenant | 1.5 |
| **Zelle** (diaspora USD) | 🟡 Construit (V-10) — flux **semi-manuel** (pas d'API Zelle) : instructions + mémo, confirmation admin. ⚠️ Exige, **comme Stripe**, un compte bancaire **US** enrôlé Zelle (`ZELLE_RECIPIENT`) : les fonds diaspora atterrissent aux États-Unis, donc **même prérequis d'entité étrangère / *merchant of record*** | 1.5 |
| **Wallet interne** | ✅ Crédit après confirmation | 1 |

## 2. Les trois invariants (NON NÉGOCIABLES)

1. **Idempotence garantie en base** — clé d'idempotence avec contrainte d'unicité
   PostgreSQL. Rejeu sans effet de bord.
2. **Confirmation serveur-à-serveur obligatoire** — la vérité du paiement vient du
   webhook/vérification opérateur, jamais du retour navigateur seul.
3. **Réconciliation totale** — chaque transaction est rapprochable ; aucun paiement
   orphelin.

## 3. Flux nominal MonCash

```
Acheteur
  │  1. Clique "Payer"
  ▼
App (Next.js)
  │  2. Crée order (status=pending) + payment (idempotency_key unique)
  │  3. Demande à MonCash une session de paiement
  ▼
MonCash  ──redirect──►  Acheteur paie  ──redirect retour──►  App (NON fiable)
  │
  │  4. Webhook serveur-à-serveur ──►  App
  ▼
App
  │  5. Vérifie + applique (idempotent) : order=paid, crédit wallet, livraison
  ▼
Acheteur reçoit le fichier / la mise en relation
```

> Le **retour de redirection navigateur (étape 3 bis)** ne déclenche RIEN de définitif.
> Seul le **webhook (4)** ou le **réconciliateur** confirme.

## 4. Idempotence (niveau base)

- Chaque `payment` porte une `idempotency_key` **UNIQUE** (contrainte DB).
- L'application du paiement (crédit wallet + livraison) est **idempotente** : un même
  événement appliqué deux fois ne produit qu'un seul effet.
- `[INFÉRÉ]` Implémentation : `INSERT ... ON CONFLICT DO NOTHING` / transaction +
  vérification d'état, à détailler à l'implémentation.

## 5. Réconciliateur

Job périodique qui :
- liste les paiements `pending` / ambigus,
- interroge l'état réel chez l'opérateur,
- applique (idempotent) la confirmation ou l'annulation,
- alerte sur les cas non résolus.

## 6. Critères d'acceptation (= specs de test)

- [x] Rejouer la confirmation 3× ne crée qu'un seul crédit (idempotence).
      → `supabase/tests/payment_idempotency.test.sql` (scénario A).
- [x] **Montant falsifié → rejeté** : si l'opérateur rapporte un montant ≠ commande,
      `confirm_payment` met le paiement en `failed`, la commande en `disputed`,
      aucun crédit/livraison. → garde-fou DB + `supabase/tests/...` (scénario B)
      + `tests/payment.test.ts` (`amountMatches`).
- [x] **Redirect coupé** : le réconciliateur (`/api/reconcile`, cron) rattrape les
      paiements `pending` orphelins via vérification serveur-à-serveur.
      → logique isolée dans `lib/reconcile.ts`, **testée** dans
      `tests/reconcile.test.ts` (orphelin rattrapé, encore pending, montant
      rejeté, erreurs non bloquantes, rejeu idempotent).
- [x] **Commission par tier** : le vendeur est crédité du NET (10 % standard /
      6 % Elite, arrondis) ; la plateforme enregistre sa part dans
      `platform_earnings`. Calcul **uniquement** dans `confirm_payment` (SQL = seul
      calculateur d'argent ; `lib/commission.ts` = oracle/affichage).
      → `tests/commission.test.ts` + `supabase/tests/...` (scénarios A et C).
- [x] **Maturation J+7** : le net est crédité **en attente** puis devient
      **disponible** après 7 jours (`mature_wallets`, cron). Retrait possible
      seulement sur le solde disponible.
- [x] **Remboursement avant maturité = aucun solde fantôme** : `refund_order`
      annule l'escrow `maturing` (pending réduit, jamais crédité en disponible),
      même après passage du job de maturation. Idempotent.
      → `supabase/tests/escrow_maturation.test.sql` + `tests/escrow.test.ts`.
- [x] **Plafonds par rail** : montant > plafond (MonCash 25k / NatCash 20k)
      bloqué au checkout (422) avant création de commande. → `tests/payment.test.ts`.
- [x] Aucune livraison/crédit sans confirmation serveur-à-serveur.
- [x] Parcours navigateur (checkout → redirection MonCash, pages de résultat) :
      `e2e/money-path.spec.ts` (Playwright, exécuté en CI).
- [ ] Tout paiement est rapprochable dans le back-office (`/admin`). ✅ vue en place.

## 7. Implémentation (code)

| Brique | Fichier |
|--------|---------|
| Client MonCash (OAuth, CreatePayment, Retrieve*) | `lib/moncash.ts` |
| Client Supabase service role (serveur) | `lib/supabase/admin.ts` |
| Checkout (order + payment pending → redirect) | `app/api/checkout/route.ts` |
| Retour navigateur (vérif + confirm) | `app/api/moncash/return/route.ts` |
| Réconciliateur (cron, rattrape les pending) | `app/api/reconcile/route.ts` |
| Livraison (URL signée si payé) | `app/api/download/route.ts` |
| Confirmation idempotente (DB) | `supabase/migrations/0003_payment_functions.sql` |

Flux : `BuyButton` → `/api/checkout` → MonCash → retour `/api/moncash/return`
(vérif serveur-à-serveur → `confirm_payment`). En cas de retour coupé,
`/api/reconcile` (cron) interroge MonCash par `orderId` et confirme. La
livraison passe par `/api/download` qui exige une commande `paid`.

> ⚠️ Nécessite des identifiants MonCash (sandbox) et un projet Supabase lié pour
> fonctionner de bout en bout. La logique d'idempotence est garantie en base
> (cf. §4) indépendamment des identifiants.

### Rails diaspora USD — Stripe & Zelle (V-10, migration `0009`)

> ⚠️ **Prérequis commun aux DEUX rails, pas seulement à Stripe.** La contrainte
> d'entité étrangère n'était écrite que sur la ligne Stripe, alors qu'elle porte
> sur les deux : `ZELLE_RECIPIENT` est un **e-mail ou téléphone US enrôlé
> Zelle**, adossé à un compte bancaire américain. Encaisser la diaspora par ce
> canal fait donc atterrir les fonds aux États-Unis exactement comme Stripe, et
> appelle le même *merchant of record*. La différence entre les deux rails est
> **opérationnelle** (API contre confirmation manuelle), pas juridique.
>
> Conséquence pratique : **ouvrir Zelle ne contourne pas le blocage Stripe.**
> C'est la lecture que la ligne « ✅ Construit » laissait faire, et elle était
> fausse. Tant que l'entité n'existe pas, les deux rails sont au même point.
> Ce prérequis est distinct du dossier `docs/17` (rétention BRH) : celui-ci
> porte sur *où* les fonds atterrissent, l'autre sur *qui* les retient.

Principe : **le ledger reste en HTG**. Net vendeur, commission et escrow J+7
sont calculés sur `orders.amount_htg`, identiques pour tous les rails. Le
montant USD est converti au taux `USD_HTG_RATE`, **figé au checkout** dans
`payments.expected_usd_cents`, puis **vérifié en base** par `confirm_payment`
(param `p_usd_cents`) : USD reçu ≠ USD figé → `payment failed` +
`order disputed`, aucun crédit (même garde-fou que MonCash).

| Brique | Fichier |
|--------|---------|
| Client Stripe (Checkout Session + vérif signature webhook) | `lib/stripe.ts` |
| Webhook Stripe (`checkout.session.completed` → `confirm_payment`) | `app/api/stripe/webhook/route.ts` |
| Zelle : activation + destinataire | `lib/zelle.ts` |
| Zelle : instructions acheteur (montant, destinataire, mémo `ZD-XXXXXXXX`) | `app/paiement/zelle/[orderId]/page.tsx` |
| Zelle : « j'ai envoyé » (référence acheteuse, déclaratif) | `app/api/zelle/reference/route.ts` |
| Zelle : confirmation ADMIN (relevé vérifié → `confirm_payment`) | `app/api/admin/confirm-zelle/route.ts` + section back-office |
| Conversion HTG→cents USD, mémo | `lib/payment-utils.ts` |

- **Stripe** : seule la notification **signée** (webhook) confirme — le retour
  navigateur envoie vers « en attente ». Un 500 côté webhook fait rejouer
  Stripe sans risque (idempotence en base).
- **Zelle** : aucune API ⇒ **aucune livraison automatique**. L'admin confirme
  après vérification du relevé (montant exact + mémo) ; la confirmation passe
  par le même `confirm_payment` idempotent.
- **Réconciliateur** : limité au rail `moncash` (les autres rails ont leur
  propre voie de confirmation).
- Rails proposés au checkout seulement si configurés (`STRIPE_SECRET_KEY`,
  `ZELLE_RECIPIENT`, et `USD_HTG_RATE` dans les deux cas).
- Tests : scénarios **D** (USD falsifié → rejet) et **E** (USD exact, rejoué →
  un seul crédit net HTG) dans `supabase/tests/payment_idempotency.test.sql`.

## 8. Conformité BRH (différée)

Les **retraits** et l'intégration **NatCash** dépendent des règles BRH (KYC, plafonds,
reporting). ⛔ Bloqué — voir `00-CONTEXTE.md §11` et `§14`.

## 9. Ajouter un rail de paiement — checklist obligatoire

> Issue de la revue `REVUE-2026-07-22-rails-paiement.md` (SEC-03/SEC-04/SEC-06).
> Tout nouveau rail suit ces étapes DANS L'ORDRE. L'étape 0 est éliminatoire :
> tant qu'elle n'est pas verte, **aucune ligne de code** (règle dure n°2,
> `CLAUDE.md` — celle qui tient NatCash et BRH en attente).

### Étape 0 — Fiche de constructibilité (éliminatoire)

À remplir et faire valider par le porteur AVANT tout code :

- [ ] Le prestataire **existe** (site officiel, entité identifiée — attention
      aux homonymes : **Htipay** (htipay.com) ≠ **HaitiPay** (haitipay.com,
      portail dev `devportal.haitipay.com`) ; consigner ici lequel on vise).
- [ ] **API publique documentée** (lien vers la doc) + **sandbox** accessible
      (identifiants de test obtenus).
- [ ] **Mécanisme de confirmation vérifiable** : webhook **signé** OU API de
      vérification d'état serveur-à-serveur. Sans l'un des deux, le rail ne
      peut pas respecter l'invariant 2 → ⛔ (au mieux flux semi-manuel type
      Zelle, décision porteur).
- [ ] Plafonds par transaction / par jour documentés (sinon les demander).
- [ ] Statut réglementaire (licence/agrément BRH le cas échéant) et modalités
      de règlement (settlement) vers notre compte.
- [ ] Frais du rail connus (impact sur la commission / le prix affiché).

### Étapes 1→8 — Intégration (une PR par étape logique)

1. **Migration SQL** : `alter type payment_rail add value '<rail>'` (cf.
   `0009_rails_diaspora.sql:11-12`). Si le rail n'encaisse pas du HTG,
   prévoir l'équivalent de `expected_usd_cents` (montant figé + vérifié par
   `confirm_payment`).
2. **Adapter** `lib/<rail>.ts` : création de session + vérification d'état,
   secrets lus via `process.env` au moment de l'usage, fonction
   `is<Rail>Enabled()` (rail masqué si non configuré), minimisation RGPD du
   payload stocké (cf. `lib/moncash.ts::redactPayment`).
3. **Checkout** (`app/api/checkout/route.ts`) : ajouter à `RAILS`,
   `railEnabled()`, et la branche de création. Plafonds : `RAIL_CAPS`, pays
   implicite : `RAIL_COUNTRY` (`lib/payment-utils.ts`).
4. **Confirmation** selon le mode établi à l'étape 0 : route de retour S2S
   (modèle `app/api/moncash/return`), webhook signé fail-closed (modèle
   `app/api/stripe/webhook`), ou confirmation admin (modèle
   `app/api/admin/confirm-zelle`). TOUJOURS via `confirm_payment` — jamais de
   crédit direct.
5. **Réconciliateur** (`app/api/reconcile/route.ts:38-49`) : si le rail est
   S2S (session + vérification d'état), le **brancher** au scan des pendings ;
   sinon, justifier par écrit ici pourquoi pas (cf. Stripe = webhook rejoué,
   Zelle = admin). Un rail S2S non branché = paiements orphelins silencieux.
6. **UI** : option au checkout (`app/produit/[slug]`), page d'attente/statut,
   section admin si confirmation manuelle. Parité FR/KR obligatoire.
7. **Secrets** : variables dans `.env.example` (valeurs vides + commentaire),
   liste de référence de `docs/11-SECRETS.md`, puis Vercel.
8. **Tests** : scénario d'idempotence SQL (modèle scénarios D/E de
   `payment_idempotency.test.sql` pour un rail non-HTG) + garde
   `api-auth-coverage` pour toute nouvelle route.

### Rails candidats — état des fiches (2026-07-22)

| Prestataire | Étape 0 | Notes |
|-------------|---------|-------|
| Dhecash | ⛔ Introuvable en ligne | Source du porteur attendue |
| Zappp | ⛔ Introuvable en ligne | Source du porteur attendue |
| Htipay (htipay.com) | ⚠️ Existe, API non confirmée | Contact direct requis ; ne pas confondre avec HaitiPay |
| HaitiPay (haitipay.com) | ⚠️ Portail dev public (`devportal.haitipay.com`, « Acceptor API ») | Non demandé par le porteur à ce stade |
| **Kobara (kobara.app)** | ⚠️ **Fiche OUVERTE le 2026-08-23, 1 case sur 6** | Passerelle MonCash **et NatCash**. Voir §9.1 ci-dessous. |

### 9.1 Fiche Kobara — ouverte le 2026-08-23, **INCOMPLÈTE**

> ⚠️ Ouverte parce qu'un document de mise en service a été présenté en session.
> Elle n'autorise **aucune ligne de code** : l'étape 0 est éliminatoire et cinq
> cases sur six sont vides. Elle est consignée ici pour que la recherche ne soit
> pas refaite, pas pour valider quoi que ce soit.

**Ce qui EST mesuré** (recherche web, 2026-08-23) :

- [x] **Le prestataire existe.** `kobara.app` se présente comme une passerelle
      de paiement haïtienne pour **MonCash et NatCash** — API, liens de
      paiement, webhooks, tableau de bord marchand, WooCommerce, montants en
      HTG. Une page d'agence haïtienne (Coding Club Haïti) crédite le site à un
      développeur nommé.

⚠️ **CE QUE ÇA CHANGE À UNE PRÉMISSE DU DÉPÔT** : `CLAUDE.md` règle dure n°2
porte « **NatCash ⛔ (aucune API publique)** ». Cette phrase visait NatCash
**en direct**, chez Natcom, et elle reste vraie de ce qu'elle vise. Elle a été
écrite avant que cette passerelle soit connue ici. **Un intermédiaire n'est pas
l'opérateur** : ce qu'il faut vérifier n'est plus « NatCash a-t-il une API »
mais « **cet intermédiaire-ci est-il un tiers à qui confier de l'argent de
vendeurs** ». Ce sont deux questions différentes, et la seconde est plus dure.

**Ce qui n'est PAS mesuré — les cinq cases vides** :

- [ ] **Documentation d'API publique + sandbox accessible.** ⛔ Non vérifié :
      `kobara.app` est **bloqué par le proxy de sortie** de l'environnement
      d'agent (`EGRESS_BLOCKED`). Rien de ce qui suit n'a pu être lu à la
      source. Les valeurs citées dans le document de session (endpoints,
      `Idempotency-Key`, `payment.succeeded`) sont **non confirmées**.
- [ ] **Mécanisme de confirmation signé.** Le document annonce un HMAC-SHA256
      sur le corps brut. Non vérifié contre une documentation.
- [ ] **Plafonds.** Le document annonce des plafonds de **retrait** : Free
      2 500 HTG/jour, Pro 20 000, Premium 50 000. ⚠️ **À rapprocher de
      `RAIL_CAPS`** : le plafond MonCash de ce dépôt est de 25 000 HTG **par
      transaction**. Une passerelle plafonnée à 2 500 HTG/jour ne peut pas
      régler les vendeurs d'une marketplace ; le plan n'est pas un détail de
      facturation, c'est une **contrainte de faisabilité**.
- [ ] **Statut réglementaire (BRH).** ⛔ **RIEN.** Aucune mention d'agrément,
      d'entité juridique enregistrée, ni de licence. Voir l'avertissement
      ci-dessous — c'est la case qui commande toutes les autres.
- [ ] **Modalités de règlement** vers notre compte : délai, compte de
      destination, cantonnement éventuel des fonds pendant la détention.
- [ ] **Frais** : le document annonce 4 % (Free) / 2,9 % (payant), prélevés sur
      chaque paiement. Impact direct sur la commission (10 % / 6 % Elite) et
      donc sur le **net vendeur** — paramètre commercial, table de config,
      décision porteur (règle dure n°3).

#### ⛔ L'avertissement qui prime : la rétention, pas la technique

`CLAUDE.md` : *« Ne rien construire qui **aggrave** la rétention sans avis
écrit »* (`docs/17`, dossier ouvert chez HDIT / Cabinet Volmar depuis le
2026-08-21, **sans réponse**).

Aujourd'hui la plateforme encaisse sur un compte marchand unique et retient le
net vendeur jusqu'au règlement — c'est déjà la question posée au conseil.
Faire transiter l'argent des vendeurs par **un intermédiaire supplémentaire qui
détient les fonds**, avec des plafonds de retrait et un statut réglementaire
inconnu, **ajoute un maillon de détention** au montage exact sur lequel un avis
est en cours.

Ce n'est pas un argument technique et il ne se lève pas par du code : il se
lève par l'avis écrit, ou par une question ajoutée au dossier Volmar. Tant
qu'il est ouvert, la fiche reste fermée.
