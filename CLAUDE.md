# CLAUDE.md — Zabelie

Version condensée « toujours en contexte ». Le détail est dans `docs/`.

## C'est quoi
**Zabelie** = **marketplace haïtienne** — produits **physiques**, produits
**digitaux** et **talents**, avec paiement **mobile money haïtien** et registre
vendeur. Marché : **Haïti** + **diaspora**. Terrain : Android d'entrée de
gamme, bande passante faible, coupures fréquentes.

**Naming (tranché, 2026-07-24)** : le nom officiel et UNIQUE est « **Zabelie** ».
« Zabelie Digi » est **éliminé**. Le repo GitHub `uniondigitale` est une
étiquette technique **à renommer** par le porteur.

⚠️ **Ne jamais écrire « Zabely »** à la place de « Zabelie ». En revanche
`zabely` / `zabelie` coexistent dans les **identifiants techniques** existants :
**aucun grep-replace global**.

⚠️ **Piège de renommage** : ne jamais remplacer la sous-chaîne `Digi` seule —
**`Digicel`** est l'opérateur télécom partenaire (MonCash, recharge). Ne
remplacer que la chaîne exacte `Zabelie Digi`.

### Décision d'identité (2026-07-24)
Ce repo **est** Zabelie. Règle appliquée : *on garde le repo qui porte
l'infrastructure financière* (ledger append-only, RLS, triple vérification des
montants, 34 migrations, tests money-path, Stripe intégré). L'ancienne règle
d'indépendance vis-à-vis d'un « projet 1 » est **caduque** : il n'y a plus
qu'un seul projet Zabelie. → `docs/18-SPEC-BUILD-V1.md` §4.1.

## Stack
Next.js (App Router, TS, Tailwind) + Supabase (Postgres/Auth/Storage/RLS) +
Vercel (dont crons). **Aucun service externe non listé sans validation** —
notamment **pas de fournisseur SMS**. Design : **Higgsfield** pour les visuels.

## Règles dures (ne jamais enfreindre)
1. **Paiement — 3 invariants** : (a) idempotence garantie **en base** ;
   (b) confirmation **serveur-à-serveur** obligatoire (jamais le retour
   navigateur seul) ; (c) **réconciliation** totale, aucun paiement orphelin.
   → `docs/03-PAIEMENTS.md`.
2. **Dépendances bloquantes** : MonCash ✅ · Stripe ✅ construit (⚠️ exige une
   entité étrangère *merchant of record*) · Zelle ✅ semi-manuel ·
   **NatCash ⛔** (aucune API publique) · **BRH ⛔**. Ne pas coder un rail qui
   ne peut pas exister. **Tout nouveau rail passe par la checklist
   `docs/03-PAIEMENTS.md` §9** (étape 0 éliminatoire : prouver que l'API existe).
3. **Argent** : tout calcul de prix est **serveur**. Tout paramètre commercial
   (commission, plafonds, seuils, taux de change) vit en **table de config**,
   jamais en dur. Commission **10 % / 6 % Elite**, maturation **J+7**. Montants
   en entiers, jamais en flottant.
4. **Base** : préfixe `zabelie_` pour tout nouvel objet · **RLS dès la
   création** · aucune fonction `SECURITY DEFINER` exposée à `anon` sans garde ·
   ledger **append-only** protégé par trigger · migrations à la suite
   (dernière écrite : **`0034`**).

## Registre vendeur — invariant comptable (0033)
```
Σ(wallet_transactions) = wallets.balance_htg + wallets.pending_htg
```
Vrai après **chaque** opération d'argent. Tout écart = un solde qui a bougé
hors du grand livre. Contrôlé quotidiennement (`/api/admin/coherence`).
**Toute nouvelle écriture sur un solde doit préserver cette identité** — une
correction se fait par **écriture compensatoire**, jamais par modification du
grand livre. → `docs/19-CHANTIER-0-RETRAIT-VENDEUR.md`.

## Conformité BRH — Circulaire 121
Le registre Zabelie est un **registre comptable**, pas un instrument de
paiement. **Aucun cash-in, cash-out, ni P2P.**

⚠️ **Dossier juridique ouvert, sans réponse à ce jour** : la plateforme
encaisse sur un **compte marchand unique** (fonds vendeurs et revenus
plateforme **mêlés**, aucun cantonnement) et retient le net vendeur jusqu'au
règlement. La voie de sortie existe depuis le chantier 0, mais la
**qualification reste à trancher par un conseil**.
→ `docs/17-DOSSIER-BRH-RETENTION.md`. Ne rien construire qui **aggrave** la
rétention sans avis écrit.

## Topup — recharge téléphonique (V-11)
Service **first-party** de revente de recharge **Digicel/Natcom**
(`app/rechaj`, `lib/zabelie-topup/`, migration `0010`). Cadre **BRH Circ. 121,
non négociable** : Zabelie = **revendeur télécom, jamais émetteur de monnaie
électronique**. Interdits absolus (REFUSER si demandé) : solde rechargeable
acheteur, P2P, cash-in/cash-out, remboursement vers un solde interne (moyen
d'origine uniquement + checkpoint humain), montants en float, prix venant du
client. Ledger `zabelie_topup_ledger` **append-only** (trigger). Fournisseur :
Reloadly (adapter pattern), idempotence transmise au fournisseur
(customIdentifier = order.id). Plafonds : 5 000 HTG/tx · 25 000 HTG/j ·
5 bénéficiaires/h (configurables en base). → `docs/07-TOPUP.md`.

## Points de fidélité — non monétaires (vérifié 2026-07-24)
Système en base (`0021`, `0031`) mais **débranché** : aucune attribution,
aucune UI, **aucun point jamais émis**. Non convertibles en valeur : seule
sortie = remise **en pourcentage** (`coupon_type` mono-valeur), non
achetables, non transférables, non remboursables, expirants (90 j, plafond
180), solde plafonné. **4 garde-fous normatifs** →
`docs/CASHBACK-GARDE-FOUS.md`. Ne pas câbler l'attribution ni l'UI sans
décision explicite.

## Documents
- `docs/00-CONTEXTE.md` · `01-PRD.md` · `02-DECISIONS.md`
- `docs/03-PAIEMENTS.md` — architecture paiement **+ §9 checklist nouveau rail**
- `docs/04-DEPLOIEMENT.md` · `07-TOPUP.md` · `11-SECRETS.md` (registre des clés)
- `docs/15-CHANTIER-A-INVENTAIRE.md` — inventaire du rebrand
- `docs/16-TAXONOMIE-CATALOGUE.md` — 16 départements, activation par vagues
- `docs/17-DOSSIER-BRH-RETENTION.md` — ⚠️ dossier juridique ouvert
- `docs/18-SPEC-BUILD-V1.md` — **spécification autoritaire du chantier en cours**
- `docs/19-CHANTIER-0-RETRAIT-VENDEUR.md` — voie de sortie vendeur
- `docs/CASHBACK-GARDE-FOUS.md` · `REVUE-2026-07-22-rails-paiement.md`
- `OPS_TODO.md` — actions opérationnelles porteur + écarts de réconciliation

## Méthode
Un chantier à la fois, dans l'ordre de `docs/18` §11. Tests écrits avec le
code. Migration rédigée **non appliquée** tant que le porteur ne l'a pas
exécutée. Signaler toute contradiction plutôt que trancher seul ; demander
plutôt qu'inventer une règle métier, **surtout financière**.

**Le point de contrôle humain est la PR, jamais le commit.** Un hook `Stop`
du dépôt exige de commiter et pousser tout travail en cours : « montre-moi
avant de commiter » n'est donc pas un contrôle disponible ici. Un commit sur
une branche de travail n'engage rien — la revue se fait sur la PR, et une
correction se fait par un commit de plus, pas par un retour arrière. Marquer
en tête de message les commits qui attendent un arbitrage.

### Un instrument non éprouvé ne prouve rien
Quatre fois dans le chantier B, l'outil de vérification a menti : des fixtures
SQL qui encodaient le bug (suite verte confirmant le mensonge), un serveur
recyclé qui a fait passer une vérification par mutation, un `union all` dont
toutes les branches partagent l'instantané — « après » relisait l'état d'avant.
Le motif est constant : **le code de vérification est écrit une fois, sous
pression, et n'est jamais vérifié lui-même.**

Règle : **toute sonde, tout harnais, tout test de garde doit être passé sur un
cas connu-positif ET un cas connu-négatif avant qu'on lui fasse confiance.**
Concrètement — retirer le garde et voir le test échouer ; amputer les données
et voir la sonde le dire. Un instrument qui n'a jamais échoué n'a pas encore
démontré qu'il pouvait.

Corollaire d'observabilité : **l'absence de signal doit être un signal.** Une
branche par défaut journalise ce qu'elle a reçu (`lib/product-kind.ts`) ; un
cron journalise chaque passage, y compris à zéro (`app/api/stock/expire`).
Sinon « n'a pas tourné » et « a tourné, rien trouvé » produisent le même vide.

### `product_kind` — le module est obligatoire
Comparer un type de produit **hors de `lib/product-kind.ts`** est interdit et
vérifié par `tests/product-kind-discipline.test.ts`. Raison : ajouter une
valeur à l'union ne casse **aucune** compilation — un ternaire avec `else`
reste typé. Le compilateur n'énumère donc pas les sites, et un `grep` ne
prouve rien sur ce qu'il n'a pas trouvé. La garantie vient des `switch`
exhaustifs du module, pas du type. Toute valeur ajoutée à l'énumération SQL
doit l'être aussi dans `lib/sample-data.ts`, `lib/database.types.ts` et la
liste `KINDS` du test.
