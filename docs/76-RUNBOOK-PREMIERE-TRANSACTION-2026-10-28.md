# Runbook — la première transaction réelle (relevé du 2026-10-28)

Compagnon opérationnel de `docs/22` (procédure canonique) et relecture datée qui
**rafraîchit `docs/49`** (état production du 2026-09-06). Ce document est du
**constat et de la méthode** : rien n'y est tranché, et les zones d'arrêt
(secrets, variables d'environnement, portail fournisseur, choix du montant,
conformité, paiement réel) restent au porteur — *l'implémentation ne les
remplace pas* (`docs/22` §1).

> ⚠️ `docs/22` reste la source. Ses requêtes SQL de preuve (§2 et §3) sont
> l'autorité ; ce runbook dit l'ordre, qui fait quoi, et où s'arrêter.

## 0. Diagnostic — pourquoi il n'y a pas encore de première transaction

Mesuré le 2026-10-28, en lecture seule sur la base de production. **Ce n'est pas
un bug** : chaque pièce marche isolément ; personne n'a jamais parcouru le chemin
vendeur→acheteur **pour de vrai, en production**.

| Pièce | État mesuré (2026-10-28) | Verdict |
|---|---|---|
| Upload photo (service-role) | 1 objet `product-covers`, déposé le 2026-08-14 | a fonctionné **au moins une fois** |
| MonCash — création de session | 14 sessions, chacune avec `payment_token` | émet des sessions ✓ |
| MonCash — mode | **`sandbox`** partout (`sandbox.moncashbutton.digicelgroup.com`) | ⚠️ jamais basculé en production |
| MonCash — paiement réel | 14/14 `expired_reason = moncash_unknown_48h` | **aucun acheteur n'a jamais payé** (404 à 48 h) |
| Chaîne post-paiement | 1 commande `gratis` **confirmée** (2026-08-22) | confirm→escrow→maturation marche ✓ |
| Catalogue | **0 offre publiée** | rien à acheter aujourd'hui |
| Comptes | 4 (2 test, 2 réels, **0 créateur réel**) | pas de vrai vendeur avec offre |

**Correction à `docs/49`** : `docs/49` soupçonnait « la clé service-role posée
en production n'en est pas une ». Le dépôt d'un cover le 2026-08-14 prouve que
l'upload service-role **a fonctionné au moins une fois**. On ne présume donc
pas la clé cassée — un upload live frais la confirmera (ou non) ; en cas
d'échec, le journal `[cover] … clé service-role fausse` (502) le dira, et c'est
alors un secret à corriger (porteur).

**Conséquence** : le premier blocage n'est **pas** MonCash. C'est qu'il
n'existe aujourd'hui **aucune offre réelle, publiée, payante, avec photo**,
portée par un **vendeur réel distinct de l'acheteur**, et que MonCash n'a
**jamais été basculé en production**.

## 0bis — État de départ nominatif (mesuré le 2026-10-28, lecture seule)

Sonde directe de la production qui NOMME les pièces du §0 : qui vend, quoi, à
quel prix, avec quels comptes réels, et où en est MonCash. ⚠️ Elle **rafraîchit
la ligne « Catalogue » du §0** : il y a désormais **une** offre publiée (elle
était à zéro plus tôt le même jour) — mais elle n'est pas payable en l'état.

**Prêt :**

| Pièce | Mesuré | Verdict |
|---|---|---|
| Storage / photo | « formation en IA » porte une photo (`cover_url` non nul) | la clé service-role **fonctionne** — lève le doute de `docs/49` |
| Vendeur réel + offre | **Bebeto** (non-test), 1 offre publiée : « formation en IA » (`service`, avec photo) | vrai vendeur, vraie offre |
| Acheteur réel distinct | 3 comptes réels ≠ Bebeto : Ruby, Eliezer Philippe, Eliezer | auto-achat refusé en base (`0132`) → acheteur dispo |
| Cohérence comptable | `zabelie_solvency_report()` → `ok=true, ecarts=0`, tout à zéro | point de départ net, et point de retour après remboursement |

**Bloque (zones d'arrêt, porteur) :**

1. 🛑 **MonCash en sandbox.** 14/14 paiements `failed`, **0 référence
   opérateur**, hôte `sandbox.moncashbutton.digicelgroup.com`. Aucun acheteur
   n'a jamais payé (`moncash_unknown_48h` = 404). → Phase 1 (bascule production).
2. 🛑 **Offre à 5 HTG.** Quasi certainement sous le minimum opérateur MonCash.
   Le montant se fixe avec le fournisseur (§0.4) — l'ancienne « cours
   francisation » était à 300 HTG.

**À noter :** l'offre est un `service` → boucle escrow + remise + remboursement
propre, sans logistique (bon premier essai, §0.3). Commandes actuelles :
14 `cancelled` + 1 `disputed`, aucune payée — cohérent avec « jamais de paiement
réel ».

**En une phrase :** tout est prêt côté plateforme ; il manque exactement deux
gestes du porteur — **basculer MonCash en production** et **donner à l'offre un
montant payable**.

## Légende

- 🛑 **zone d'arrêt** — porteur seul (secret / env / portail / conformité / montant / paiement).
- 🔎 **vérif** — agent, **lecture seule** (requêtes `docs/22` §2–§3 sur l'`order_id` exact).
- ⏸️ **checkpoint** — on s'arrête, le porteur ping l'agent, l'agent confirme vert/rouge avant d'avancer.

## Phase 0 — Prérequis (avant d'engager un acheteur) — `docs/22` §1

- **0.1 Deux comptes réels distincts** : un **vendeur** et un **acheteur**, non-test,
  `acheteur ≠ vendeur` (auto-achat refusé en base, `0132`).
- **0.2 Posture juridique** 🛑 : `docs/17` (rétention) non tranché. `docs/22`
  autorise un **essai unique, contrôlé, puis remboursé** — pas d'encaissement
  gardé. Aucune présomption BRH, aucun Pay autonome, aucune livraison Zabelie.
  Jugement du porteur ; l'agent ne « valide » pas la conformité.
- **0.3 L'offre** : recommandation (le porteur tranche) — pour le **premier**
  essai, une offre **numérique** ou **service** à **petit montant** (pas de
  logistique, boucle escrow+remboursement propre). Le physique ajoute la
  dimension remise/transport (que Zabelie n'assure pas) — pour un second essai.
- **0.4 Le montant** 🛑 : choisi **avec le fournisseur**, dans les plafonds/frais
  configurés (commission 10 % / 6 %). Le net se **lit dans les écritures**, il
  ne se suppose pas. Ne se fixe pas dans ce document.

## Phase 1 — Bascule MonCash en PRODUCTION 🛑 (signal du porteur)

Tout est en **sandbox** aujourd'hui. Le porteur pose : le **mode production**,
les **vrais identifiants**, et au **portail Digicel** les URL
**Website / Return (`/api/moncash/return`) / Alert** (runbook `OPS_TODO`,
`docs/22` §1). C'est une **variable d'env + un secret + le portail** :
l'autorisation permanente du 2026-08-17 les **exclut** explicitement — l'agent
n'y touche pas.

- **⏸️ Checkpoint 1** : `/api/admin/coherence` (session admin MFA) doit lire
  `integrations.moncash.bascule.pret=true` et `integrations.moncash.configure`
  présent. Le porteur le lit (l'agent n'a pas la session MFA).

## Phase 2 — Vérifier le chemin vendeur en prod

- **2.1** Le **vendeur réel** publie l'offre **avec photo** sur le site live.
  Échec 502 → journal `[cover] … clé service-role fausse` → 🛑 secret (porteur).
- **⏸️ Checkpoint 2** → 🔎 fiche `published`, `price_htg > 0`, `cover_url` non nul,
  `seller_id` = compte réel vendeur (≠ futur acheteur).

## Phase 3 — L'achat réel 🛑 (acheteur humain) — `docs/22` §2

- **3.1** L'**acheteur réel** ouvre la fiche, **note son numéro de commande**,
  paie en MonCash avec un vrai compte.
- **3.2** **Ne pas se fier au retour navigateur** : attendre la confirmation
  serveur-à-serveur, ou lancer **« Vérifier les paiements en attente »**
  (`/admin/operations`). Une capture de débit ne crédite jamais le registre.
- **⏸️ Checkpoint 3** → 🔎 (requêtes `docs/22` §2 sur l'`order_id`) : commande
  `paid`, paiement `confirmed` **avec `provider_ref` (référence opérateur)** et
  `moncash_mode = production`, **escrow créé**, `pending_htg` crédité, **aucun
  crédit dupliqué**, `zabelie_solvency_report()` → **`ok=true, ecarts=0`**.

## Phase 4 — Remise (si physique/service) — `docs/22` §2.4

Le vendeur déclare la remise ; l'acheteur confirme la réception.
- **⏸️ Checkpoint 4** → 🔎 commande `delivered`, hold de remise clos,
  **maturation J+7 toujours en cours** (la réception ne la supprime pas).
  *(Offre numérique : téléchargement seulement après confirmation — pas de remise.)*

## Phase 5 — Défaire : le remboursement (referme le gate) 🛑 — `docs/22` §3

L'essai est un **aller-retour** : on ne garde pas l'argent (cela respecte aussi
la question de rétention ouverte).

- **5.1** Admin (MFA) → **« Annuler l'écriture comptable »** (`/api/admin/refund`
  → `refund_order`). ⚠️ **Aucun argent n'est transféré par cette action** :
  annule l'escrow + pose un **débit compensatoire** idempotent.
- **5.2** 🛑 Le **fournisseur** exécute le vrai retour des fonds **sur le moyen
  d'origine** (MonCash), avec l'autorisation du porteur. Pas d'espèces/banque/
  crédit interne en substitution.
- **5.3** Admin enregistre le **justificatif externe** dans `/admin/operations`
  (méthode = origine, référence fournisseur, date). Le RPC **refuse** une méthode
  différente.
- **⏸️ Checkpoint 5** → 🔎 commande `refunded`, escrow `reversed`, **crédit
  initial conservé** + débit compensatoire, `zabelie_refund_receipts` renseigné,
  file de remboursement vide, `solvency_report` toujours `ok=true`. Un rejeu rend
  `already_reversed` (pas de second mouvement).

## Règle d'or — `docs/22` §4

Jamais de modification/suppression du grand livre, jamais de correction de solde
à la main. Devant une panne, **identifier le monde avant d'agir** (débité sans
crédit ? payé avec escrow ? issue opérateur incertaine ?), en lecture seule.
Distinctions MonCash à conserver dans toute réclamation : `moncash_unknown_48h`
(transaction inconnue, 404) vs `moncash_not_successful_48h` (connue, non aboutie),
avec l'hôte réellement servi. **Aucun secret, jeton de paiement, téléphone,
identité ou document KYC dans git.**

## Répartition

- **Porteur** : 0.1→0.4, Phase 1 (bascule), 2.1 (publier), 3.1 (payer),
  5.1–5.3 (admin + fournisseur). Pas humains / secrets / conformité, par construction.
- **Agent** : les 5 🔎 vérifs en lecture seule, à chaque checkpoint, sur
  l'`order_id` exact ; et, si un vrai run révèle un **bug de code** (pas un
  secret/config), un correctif sur branche.

## Point de départ recommandé

**Phase 2 d'abord** (publier une vraie offre avec photo) : lève d'un coup le
doute sur la clé service-role et donne l'offre nécessaire de toute façon,
**sans encore engager MonCash ni d'argent**.
