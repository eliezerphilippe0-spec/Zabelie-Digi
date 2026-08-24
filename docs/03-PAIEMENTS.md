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

**Trois cases passées à « DOCUMENTÉ », le 2026-08-24 — et pas à « testé »**

> ⚠️ **Provenance, et elle est la moitié de la valeur de ces lignes.** Lues
> **à la source**, sur le site du prestataire, dans le navigateur du porteur —
> `kobara.app` est bloqué par le proxy de sortie de l'agent (`EGRESS_BLOCKED`)
> et le restera. Ce ne sont donc **ni des mesures de l'agent, ni un document
> recopié** : c'est une lecture humaine de la documentation officielle.
>
> **Documenté ≠ testé.** Aucun compte n'existe, rien n'a été exécuté, aucun
> appel n'a jamais été émis. Une documentation décrit une intention ; seul un
> aller-retour en bac à sable décrit un comportement. Ce dépôt a déjà payé
> cette confusion — cinq paiements MonCash ont échoué contre un hôte qui
> répondait exactement comme la documentation l'annonçait.

- [x] **API publique documentée.** `POST https://api.kobara.app/api/v1/payments`,
      auth `Bearer kbr_sk_live_…`, header **`Idempotency-Key` documenté
      explicitement** (bon signe : c'est l'invariant 1). Le champ `provider`
      accepte `"natcash"`, `"moncash"` ou `"kobara"` (page de choix unifiée).
      Réponse : `id`, `checkout_url`, `status`.
      - [ ] **Sandbox** : secrets test/live distincts annoncés, mais **aucun
            identifiant de test obtenu**. La case reste ouverte.
- [x] **Mécanisme de confirmation signé.** Webhook `payment.succeeded`, headers
      `Kobara-Signature: t=…,v1=…`, `Kobara-Event`, `Kobara-Environment`,
      `Kobara-Timestamp`. Signature =
      `hex(HMAC-SHA256(secret_endpoint, timestamp + "." + raw_body))`, fenêtre
      de 5 minutes, secrets séparés test/live.
      **C'est la forme correcte** — corps brut, horodatage dans la charge
      signée, anti-rejeu — et c'est le modèle déjà en place pour Stripe ici.
      Elle satisfait l'invariant 2 **sur le papier**.
- [x] **Frais : 4 % (Free) / 2,9 % (plans payants)**, déduits de **chaque
      encaissement**. ⚠️ Ils s'ajoutent à la commission (10 % / 6 % Elite) :
      soit ils rognent le **net vendeur**, soit la **marge plateforme**, et ce
      choix est un **paramètre commercial** — table de config, décision
      porteur (règle dure n°3). Il n'a pas de valeur par défaut acceptable.

**⚠️ Correction du 2026-08-24 sur les plafonds — l'obstacle se DÉPLACE, il ne disparaît pas**

La première version de cette fiche traitait les 2 500 HTG/jour comme un
plafond d'**encaissement**. C'est faux, et la correction vient du porteur :
c'est le **retrait journalier du solde marchand**. On peut donc collecter
davantage ; on ne peut pas **sortir** l'argent plus vite.

Ce que ça change : ce n'est plus une contrainte de **faisabilité** mais de
**trésorerie**. Et elle reste dirimante pour une marketplace, qui doit régler
ses vendeurs à J+7 — un règlement qu'on ne peut pas retirer est un règlement
qu'on ne peut pas faire. Elle s'efface sur le plan **Business** (retraits
illimités, **12 500 HTG/mois** — une **dépense**, donc une décision porteur).

- [ ] **Statut réglementaire (BRH).** ⛔ **RIEN**, et le porteur n'a rien
      trouvé non plus en cherchant à la source. Aucune entité juridique, aucun
      agrément, aucune licence. Voir l'avertissement ci-dessous.
- [ ] **Modalités de règlement / DÉTENTION DES FONDS.** ⛔ **RIEN non plus** :
      la documentation ne dit pas **qui détient l'argent** entre l'encaissement
      et le retrait, ni sur quel compte, ni s'il est cantonné. Pour ce dossier
      c'est la question la plus lourde des six, et c'est celle qu'aucune page
      technique ne traitera jamais.

#### ⛔ Ce qu'il ne faut PAS conclure de `provider: "moncash"`

Kobara encaisse aussi MonCash. **Ce n'est pas une raison d'y faire passer
MonCash.** Le rail direct Digicel existe ici, il est construit, et il est à
quatre gestes de sa première gourde réelle. Le router par un intermédiaire
payant qui détient les fonds serait une régression sur les deux axes qui
comptent : **le coût** (2,9 % qui n'existent pas aujourd'hui) et **la
détention** (un maillon de plus dans le montage examiné par le conseil).
MonCash reste en direct.

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

⚠️ **Et la qualité technique de la passerelle ne l'atténue pas — elle l'aggrave
comme piège de lecture.** Les trois cases cochées ci-dessus sont bonnes :
idempotence documentée, signature HMAC sur le corps brut, anti-rejeu. Une
intégration soignée donne le sentiment que le dossier avance. Il n'avance pas :
**les deux cases qui bloquent sont juridiques**, et aucune ligne de code, aussi
correcte soit-elle, n'y touche. C'est le même défaut de choix de question que
`CLAUDE.md` décrit à propos du 2026-08-11 — une journée de filets impeccables
posés pendant que le stockage n'avait pas une seule policy.

#### Décision du 2026-08-24 — fiche EN ATTENTE, et de quoi exactement

Mise de côté **jusqu'après la première gourde réelle sur MonCash**
(`docs/22`), sur recommandation convergente de l'agent et du porteur. Ce qui
la rouvrira, dans cet ordre :

1. la **première commande réelle** aboutie sur MonCash — c'est l'essai qui
   manque depuis l'origine, et ouvrir un second rail avant lui déplacerait
   l'attention ;
2. une **réponse de HDIT / Cabinet Volmar** (`docs/17`, parti le 2026-08-21),
   ou une **question ajoutée** à ce dossier sur la détention par un
   intermédiaire ;
3. un **compte Kobara en bac à sable** avec un aller-retour réel : c'est ce qui
   ferait passer les trois cases de « documenté » à « testé ».
