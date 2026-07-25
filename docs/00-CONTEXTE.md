# Zabelie — Document de contexte (15 sections)

> **Statut :** reconstruction à partir de la synthèse fournie. À valider section par section.
> Les passages marqués `[INFÉRÉ]` sont des hypothèses raisonnables, pas des décisions arrêtées.
> Les passages marqués `[À CONFIRMER]` sont des décisions ouvertes qui t'appartiennent.
>
> Ce document est la **source de vérité produit**. Il alimente la chaîne :
> **Contexte (ce document) → PRD (`01-PRD.md`) → Design EPIC 4.**

---

## §1 — Thèse produit

**Zabelie** est une plateforme de **produits digitaux et de talents haïtiens** :
une marketplace où des créateurs (designers, formateurs, développeurs, musiciens,
rédacteurs, consultants…) vendent des produits téléchargeables et des prestations,
avec encaissement en **monnaie mobile haïtienne** (MonCash, puis NatCash) et un
**wallet vendeur** pour le suivi des gains et des retraits.

La promesse : **vendre un produit digital ou un service en quelques minutes, être
payé via les rails mobiles locaux, et retirer ses gains de façon fiable malgré
l'instabilité réseau.**

---

## §2 — Positionnement & inspirations

- **Chariow** — outil de création de boutiques de produits digitaux (liens de vente,
  checkout simple, livraison automatique du fichier). On en reprend : la **simplicité
  du checkout**, la **livraison digitale automatique**, la **page produit minimaliste**.
- **Talent gn** (Guinée) — plateforme de produits digitaux et de mise en avant de
  talents. On en reprend : le **catalogue de talents/créateurs**, la **dimension
  communautaire** (adaptée au contexte haïtien), la mise en avant des **services**
  autant que des fichiers.

**Zabelie = Chariow (produit digital + checkout) ∪ Talent gn (talents +
communauté) adapté au contexte de paiement haïtien (MonCash/NatCash/BRH).**

---

## §3 — Distinction avec le premier projet Zabelie

⚠️ **Ne pas confondre avec le premier projet Zabelie** (marketplace de produits
**physiques** existante).

- **Zabelie** (projet 1) : marketplace de produits physiques.
- **Zabelie** (projet 2, ce projet) : produits **digitaux** + talents/services.
  Nom officiel et unique : « Zabelie » — tout ancien nom de travail est
  éliminé (décision porteur, anti-confusion). Le repo GitHub `uniondigitale`
  est une étiquette technique, à renommer `zabelie-*` par le porteur ; le nom
  de la branche git de travail est un identifiant technique sans signification
  produit.

Les deux marques partagent la racine « Zabelie », **mais Zabelie est un
projet totalement à part** : aucune fusion — auth, wallet, schéma ou code — avec
Zabelie 1 ni aucun autre projet (décision ferme du porteur, voir **V-9** dans
`02-DECISIONS.md`).

---

## §4 — Personas & cas d'usage

- **Le Créateur / Talent** : publie un produit digital (PDF, audio, vidéo, template,
  logiciel) ou une prestation ; suit ses ventes ; retire ses gains via MonCash.
- **L'Acheteur** : découvre un produit/talent, paie via mobile money, reçoit
  immédiatement son fichier ou la mise en relation.
- **L'Admin / Opérateur plateforme** : modère le catalogue, supervise la
  réconciliation des paiements, gère la conformité BRH et les retraits.

`[INFÉRÉ]` La liste exacte des rôles et permissions est à affiner dans le PRD.

---

## §5 — Périmètre fonctionnel (vue d'ensemble)

**Inclus (vision)**
- Catalogue de produits digitaux et de talents/services.
- Page produit + checkout simple.
- Paiement mobile money (MonCash en premier).
- Livraison digitale automatique (lien sécurisé / accès au fichier après paiement).
- Wallet vendeur (solde, historique, retraits).
- Espace créateur (publication, stats) + espace acheteur (achats, téléchargements).
- Back-office admin (modération, réconciliation, conformité).

**Hors périmètre initial** `[INFÉRÉ]`
- Produits physiques (c'est le projet Zabelie 1).
- NatCash et fonctionnalités dépendantes de la BRH (bloquées — voir §14).

Le découpage précis MVP / vagues est dans le **§12 (Phasage)** et le PRD.

---

## §6 — Architecture technique

Stack retenue (décision de cadrage de session) :

- **Frontend / app** : **Next.js** (App Router, TypeScript, Tailwind CSS).
- **Backend / données** : **Supabase** (PostgreSQL, Auth, Storage, RLS).
- **Design** : visuels et assets générés via **Higgsfield** ; objectif **plateforme
  ultra-moderne** (voir §15).
- **Stockage des fichiers digitaux** : Supabase Storage avec accès signé/temporaire
  après paiement confirmé.

`[INFÉRÉ]` Détails (hébergement, edge functions pour webhooks paiement, file de
réconciliation) à arrêter dans le PRD / doc d'archi technique.

---

## §7 — Modèle de données (esquisse)

Entités principales `[INFÉRÉ — à raffiner]` :

- `users` / `profiles` (rôle : acheteur, créateur, admin)
- `products` (type : fichier digital | service ; prix ; devise ; vendeur)
- `assets` (fichiers livrables liés à un produit)
- `orders` (commande, statut, montant, acheteur)
- `payments` (transaction mobile money, référence opérateur, statut, **clé
  d'idempotence**)
- `wallets` + `wallet_transactions` (solde vendeur, crédits, débits, retraits)
- `payouts` (retraits demandés / exécutés)

> ⚠️ L'idempotence des paiements est **garantie au niveau base de données** (contrainte
> d'unicité sur la clé d'idempotence), pas seulement applicative. Voir §9–§10.

**D-3 tranchée et durcie (V-9)** : Zabelie est un **projet totalement
indépendant** — aucune fusion (comptes, wallet, schéma, code) avec Zabelie 1 ni
aucun autre projet. La passerelle dormante `zabelie1_user_id` a été retirée
(`0007_standalone.sql`). Schéma réel : `supabase/migrations/`
(voir `supabase/README.md`).

---

## §8 — Architecture de paiement

Réalité des rails haïtiens :

- **MonCash (Digicel)** — **ouvert / constructible immédiatement.** C'est le rail du
  MVP. API/redirect disponible.
- **NatCash** — **dépendance bloquante.** Intégration en attente d'accès. À ne pas
  construire tant que l'accès n'est pas obtenu (voir §14).
- **Wallet interne** — crédite le vendeur après confirmation de paiement ;
  source des retraits.

Le flux nominal : acheteur → checkout → redirection opérateur (MonCash) → callback /
webhook → confirmation → livraison + crédit wallet.

---

## §9 — Les trois invariants de paiement (NON NÉGOCIABLES)

Ces règles sont des **contraintes dures**, pas des « bonnes pratiques » :

1. **Idempotence garantie en base.** Tout paiement porte une clé d'idempotence avec
   **contrainte d'unicité au niveau PostgreSQL**. Rejouer un callback / un POST ne crée
   jamais de doublon de commande, de crédit wallet ou de livraison.
2. **Aucune livraison ni crédit sans confirmation serveur-à-serveur.** L'état de
   vérité du paiement vient du **webhook/vérification côté opérateur**, jamais du seul
   retour de redirection navigateur (qui peut être coupé ou falsifié).
3. **Tout paiement est réconciliable.** Chaque transaction est traçable et rapprochable
   avec l'opérateur via un **réconciliateur** (voir §10). Pas de paiement « orphelin ».

---

## §10 — Idempotence & réconciliation

- **Réconciliateur** : job qui rapproche périodiquement les paiements locaux avec
  l'état réel chez l'opérateur, résout les états ambigus (pending bloqué, redirect
  perdu) et déclenche livraison/crédit ou annulation.
- **Test « redirect coupé »** : critère d'acceptation explicite — simuler une
  coupure réseau **après le paiement mais avant le retour navigateur**, et vérifier que
  le système se rattrape (via webhook + réconciliateur) sans double livraison ni perte.

> L'instabilité réseau haïtienne est traitée comme une **exigence**, pas un détail.
> Le réconciliateur et le test du redirect coupé font partie des **critères
> d'acceptation** du module paiement.

---

## §11 — Conformité BRH

- **BRH** = Banque de la République d'Haïti (banque centrale).
- Les exigences réglementaires (KYC, plafonds, reporting, traçabilité des flux)
  conditionnent certaines fonctionnalités, notamment les **retraits** et l'intégration
  **NatCash**.
- **Statut : dépendance bloquante** pour les briques concernées (voir §14). Le reste de
  la plateforme (catalogue, checkout MonCash, livraison) se construit en parallèle.

`[À CONFIRMER]` Le périmètre exact des obligations BRH applicables au MVP.

---

## §12 — Phasage / roadmap

- **Vague 0 — Fondations** : docs de contexte (ce document), PRD, décisions, conventions.
- **Vague 1 — MVP constructible maintenant** : auth, catalogue, page produit, checkout
  **MonCash**, livraison digitale, wallet (crédit), back-office minimal. Inclut
  idempotence DB + réconciliateur + test redirect coupé.
- **Vague 2 — En attente de dépendances** : intégration **NatCash**, retraits
  conformes **BRH**. À démarrer uniquement quand les accès/règles sont obtenus.
- **Vague 3 — Croissance** : recommandations, mise en avant talents, communauté.

`[INFÉRÉ]` Découpage à valider ; aligné sur la règle « ne pas construire un rail qui
ne peut pas encore exister » (§14).

---

## §13 — Décisions verrouillées

Synthèse — détail et suivi dans `02-DECISIONS.md`.

- **Stack** : Next.js + Supabase (verrouillé en cadrage de session).
- **Rail de paiement MVP** : MonCash uniquement.
- **Idempotence** : garantie au niveau base de données.
- **Convention de nommage** : `zabely` / `zabelie` coexistent — **pas de grep-replace
  global** (voir §15).

Trois décisions restent **ouvertes** (`[À CONFIRMER]`), dont **D-3** (lien auth/wallet
avec la marketplace physique Zabelie 1) — la seule qui touche le schéma de données.

---

## §14 — Dépendances bloquantes (séparées du code)

> Cette section existe pour **empêcher de construire un rail qui ne peut pas encore
> exister.**

| Brique | Statut | Action |
|---|---|---|
| **MonCash** | ✅ Ouvert | Constructible immédiatement — rail du MVP. |
| **NatCash** | ⛔ Bloqué | En attente d'accès. Ne pas coder l'intégration tant que l'accès n'est pas obtenu. |
| **Conformité BRH** | ⛔ Bloqué | En attente des règles applicables. Conditionne retraits + NatCash. |

Tout ce qui ne dépend **pas** de ces briques (catalogue, checkout MonCash, livraison,
wallet-crédit, back-office) est constructible **maintenant**.

---

## §15 — Méthode de travail & conventions

- **Nommage `zabely` / `zabelie`** : les deux orthographes coexistent
  volontairement. **Aucune session ne doit lancer un grep-replace global** pour
  « uniformiser ». Respecter l'existant.
- **Design** : assets et visuels via **Higgsfield** (MCP disponible). Objectif :
  **plateforme ultra-moderne** — UI épurée, moderne, identité haïtienne assumée.
- **Dépendances bloquantes d'abord** : avant de coder une brique paiement, vérifier
  son statut au §14.
- **Décisions ouvertes** : ne pas trancher unilatéralement les `[À CONFIRMER]` —
  notamment D-3 (schéma de données). Demander confirmation.
- **Chaîne documentaire** : Contexte → PRD → Design EPIC 4. Garder ces documents
  synchronisés.
