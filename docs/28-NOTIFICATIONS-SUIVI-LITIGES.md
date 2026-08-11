# Notifications, suivi acheteur et litiges — spec (chantier 5)

> **Statut : spec, rien d'implémenté.** Réécriture 2026-08-07 du brouillon
> « doc 24 » (numéro pris par `24-API-V1.md`), après revue règle 7 : quatre
> dérives récurrentes purgées (`ZB-`, cinq états, arbitrage A ouvert, Trust
> Score différé), deux collisions structurelles résolues (§1.2, §3.4).
> Gouvernance : charte v3.1. Le dépôt fait foi.
>
> **Dépendances réelles** : chantier 1 fusionné et `0043` appliquée (file
> d'avis, balayage, filet) ; `0042` (`ZB-YYMMDD-XXXXX`) ; `docs/23` (PR #66) ;
> `refund_order` (`0006`/`0037`). L'arbitrage A (payout) n'est pas touché.
> Identifiants de décision **D-10 à D-14** — D-6/D-7/D-8 existent déjà dans
> `OPS_TODO` pour d'autres décisions, on ne les écrase pas.

## M0 — Le prérequis découvert : un contact acheteur

**Aucun téléphone acheteur n'existe dans le dépôt** (vérifié — seuls le
topup et Business en portent). Or tout M1 et la vérification de M2 en
dépendent, et `docs/21` §« un contact, pas un compte » l'avait déjà énoncé :
l'acheteur arrive par WhatsApp, il ne relèvera pas un centre de
notifications in-app.

- Collecte **au checkout**, instantané par commande : table
  `zabelie_order_contacts` (`order_id` pk, `phone` E.164), lisible par le
  **service role seul** — jamais de RLS cliente, jamais dans un journal,
  purgée avec le cycle de vie de la commande (90 j après clôture, cron
  éprouvé par une ligne de journal avant activation).
- **D-10 (porteur)** : champ obligatoire ou optionnel ; formulation kreyòl
  de la demande ; validation `+509` seulement ou internationale (diaspora
  qui commande **pour** quelqu'un en Haïti : le contact est celui du
  destinataire, pas du payeur — à trancher explicitement).

## M1 — Notifications transactionnelles

### 1.1 Événements — ancrés sur ce qui existe, pas sur une machine imaginée

| Événement | Ancrage réel | Destinataire |
|---|---|---|
| `order_paid` | `orders.status → 'paid'` (`confirm_payment`) | acheteur |
| `order_new` | même transition | vendeur |
| `order_shipped` | **= l'avis `shipped_buyer` de `0043`** — déjà en file, on ne le double pas | acheteur |
| `reminder` / `auto_received` | **existants** (`0043`) | acheteur |
| `order_delivered` | `orders.status → 'delivered'` (`zabelie_mark_received`) | acheteur |
| `dispute_opened` | M3 `OPEN` | vendeur + admin |
| `refund_completed` | M3 `RESOLVED_REFUND` exécuté | acheteur |

### 1.2 Une seule file — la généralisation (D-13, recommandée ferme)

`0043` porte déjà `zabelie_fulfillment_notices` **dont l'expéditeur n'a
jamais été construit** (`docs/21` §5.4 — dette du chantier 1). Deux files et
deux workers seraient le « second cycle parallèle » que la charte interdit.
**Recommandation : la table générale `zabelie_notifications` absorbe les
notices, et son worker EST l'expéditeur manquant du chantier 1** — rien
n'existe à dédupliquer, la généralisation n'ajoute aucun retard, elle paie
une dette. Repli si la revue en décide autrement : étendre l'enum de `0043`,
généralisation notée en dette. La table reprend le schéma du brouillon
(statuts `pending/sent/failed/skipped`, tentatives, append-only hors
colonnes d'envoi) avec deux corrections : **pas de `recipient_phone`
dupliqué** (jointure sur `zabelie_order_contacts` — un numéro vit à un seul
endroit) et `params` sans aucun identifiant personnel.

### 1.3 Envoi

- Interface `NotifyProvider` (motif `TopupProvider`), un provider derrière
  `ZABELIE_NOTIFY_PROVIDER`. **Templates paramétrés seulement, jamais de
  texte libre.** Kreyòl source, FR/EN/ES par le pipeline i18n.
- ⚠️ Les templates ne promettent **aucun délai en dur** : le brouillon disait
  « Ou gen 48è pou konfime l » alors que `shipment_deadline_days = 5 j` — un
  délai affiché vient de `zabelie_fulfillment_limits` en paramètre
  (`{delay_days}`), jamais du texte. Les tests de promesse s'appliquent.
- Worker : cron Vercel, **avis échus seulement** (`due_at <= now()` — règle
  `docs/21` §5.4), backoff borné par `notice_max_attempts` (config
  existante), journalise **même à zéro**, croisé par
  `tests/crons-appelants.test.ts`. Alerte : > 20 % `failed` sur 1 h, ou
  `pending` non traités depuis 30 min.
- **D-11 (porteur)** : WhatsApp Cloud API (templates à faire approuver par
  Meta — soumission immédiate) ou SMS d'abord. ⚠️ La charte interdit tout
  fournisseur non listé sans validation : le choix du fournisseur SMS/BSP
  **est** cette validation.

## M2 — Suivi : `/swiv/{ref}`

- Accès : `ZB-YYMMDD-XXXXX` + 4 derniers chiffres du contact **M0** (la
  dépendance est explicite). Justification : session perdue, lien partagé
  dans la famille — le « guest checkout » du brouillon n'existe pas
  (checkout authentifié, `route.ts:86`) et n'est pas requis.
- Anti-énumération : mauvais chiffres ⇒ **même réponse** qu'une référence
  inexistante ; borne `zabelie_rate_limit` existante (5/ref/h).
- RPC dédiée `security definer`, `search_path` épinglé, révoquée d'`anon`
  sauf grant explicite — et un **test d'assertion sur la forme de la
  réponse** : timeline (les **cinq** états `0043` + `delivered`), nom de
  boutique, rien d'autre. Aucun montant, aucune commission, aucune adresse.
- Bouton « Mwen gen yon pwoblèm » → M3 si la fenêtre est ouverte.

## M3 — Litiges et remboursements pré-maturité

### 3.1 Ce qui existe déjà — on étend, on ne recrée pas

- « Je n'ai pas reçu » **pendant** le suivi : `zabelie_report_not_received`
  (`0043`) — escrow verrouillé, `disputed_by_buyer`, file admin. M3 lui
  ajoute un **dossier** structuré, pas un second chemin.
- Remboursement pré-maturité : `refund_order` (`0006`/`0037`) annule déjà
  l'escrow sans solde fantôme. M3 l'habille d'un workflow, ne le réécrit pas.
- Le levier est inchangé : avant J+7 le remboursement est un **non-événement
  comptable côté vendeur**.

### 3.2 Le dossier : `zabelie_disputes`

`OPEN → UNDER_REVIEW → RESOLVED_REFUND | RESOLVED_RELEASE`, `CANCELLED`
depuis les deux premiers. Transitions par RPC seulement ; journal
`zabelie_dispute_events` append-only (discipline ledger). Fenêtre : de
`paid` à maturité ; post-maturité hors périmètre v1 (geste commercial sur le
compte plateforme, **jamais** de clawback vendeur).

**Gel de maturation** : colonne de gel sur `escrow_entries`
(`dispute_frozen_at`), `mature_wallets()` l'exclut (même motif que
`gated_on_delivery`) ; `RESOLVED_RELEASE` repousse `matures_at` de la durée
du gel — **suspendu, jamais remis à zéro**. Garde éprouvée par mutation :
retirer l'exclusion → le test du gel rougit.

`RESOLVED_REFUND` : checkpoint humain à double confirmation (montant
re-saisi), motif obligatoire. **Pas d'impact Trust Score** — différé par
`docs/23` ; sa réintroduction passera par un arbitrage écrit là-bas.

### 3.3 Exécution du remboursement — **D-12, porte fermée jusqu'à réponse**

Écriture ledger `refund` (existante) au montant strictement égal — **pas de
partiel en v1** (le partiel rouvre l'arithmétique de commission ; D-4 est
tranchée `floor` mais le partiel reste une complexité sans demande). Le
retour MonCash vers l'acheteur : l'existence d'un **reversal API** est à
prouver (checklist `docs/03` §9 étape 0) ; sinon opération manuelle
opérateur avec `providerRef` saisi et double confirmation. **Qualification
juridique (reversal ≠ P2P) routée vers Cabinet Volmar avant toute ligne.**

### 3.4 Les silences — la config existante, pas de deuxième horloge

Le brouillon recréait deux minuteries que `0043` porte déjà, **sans** la
condition de légitimité (pas d'auto-réception si les avis ne sont pas
partis) — sa version aurait fait mûrir des fonds vers un acheteur jamais
notifié. Forme correcte :

| Besoin du brouillon | Mécanisme existant | Geste |
|---|---|---|
| Vendeur muet → escalade | `shipment_deadline_days` (5 j) → `action_required` | `UPDATE` de la valeur si 48 h est voulu — **D-14** |
| Acheteur muet → réception présumée | `auto_receive_days` (7 j) + avis + rappel + légitimité | rien à construire |
| Litige que personne n'ouvre | `action_required` **est** ce litige (file admin) | M3 y attache son dossier |

**D-14 (porteur)** : les valeurs (5 j ? 2 j ?) — à confronter au réel après
les vingt premières commandes, par `UPDATE`, jamais par migration.

### 3.5 Signaux de risque

`zabelie_risk_events` append-only, lecture admin, **aucune action
automatique** — le tableau se lit, il ne punit pas. Alimenté par triggers :
≥ 3 litiges/vendeur/30 j, ≥ 2 remboursements/acheteur/30 j, `received`
suivi d'un litige (signal de fausse remise).

## Décisions ouvertes (IDs sans collision avec `OPS_TODO`)

| ID | Question | Recommandation |
|---|---|---|
| D-10 | Contact checkout : obligatoire ? destinataire vs payeur ? formulation KR | Obligatoire pour le physique, destinataire |
| D-11 | Canal v1 : WhatsApp (approbation Meta) ou SMS | Soumettre les templates tout de suite ; SMS si > 2 semaines |
| D-12 | Reversal MonCash : API ? qualification Volmar | Étape 0 de `docs/03` §9 avant toute ligne |
| D-13 | File unique : généralisation (absorbe les notices) vs extension enum | **Généralisation** — l'expéditeur des notices n'existe pas encore, elle paie une dette au lieu d'en créer |
| D-14 | Valeurs des délais (`zabelie_fulfillment_limits`) | Statu quo jusqu'à 20 commandes réelles |

## Ordre d'implémentation (après revue, chaque étape testée pos/nég)

1. M0 contact checkout (gated **D-10**) → 2. file généralisée + worker
(= l'expéditeur du chantier 1, gated **D-13** et `0043` appliquée) →
3. `/swiv/{ref}` → 4. dossier litiges + gel (sa propre PR : c'est de
l'argent — mutations exigées) → 5. exécution remboursement (gated **D-12**)
→ 6. risk events. Rien de tout cela n'est « implémentable aujourd'hui » :
tout descend de la fusion du chantier 1 — donc de la revue de la #64.

## ⚖️ Trou constaté le 2026-08-11 — l'acheteur d'une commande `disputed` ne reçoit RIEN

**Absent par construction depuis `0061`, et c'est délibéré — mais c'est un
silence, pas une solution.**

Le trigger de dépôt des reçus est gardé par `new.status = 'paid'`. La branche de
rupture de stock (`0038:176`) écrit `disputed` : elle ne dépose donc plus rien,
ce qui corrige un vrai défaut — un reçu de vente partait pour une marchandise
que l'acheteur ne recevrait jamais.

Mais la conséquence n'est pas neutre. Un acheteur dont le paiement est **bien
encaissé** et dont la commande passe en `disputed` n'a maintenant **aucun
message** : ni le faux reçu d'avant, ni le vrai message qui devrait exister —
« votre commande ne peut pas être honorée, votre argent est protégé, un humain
la traite ». Sur ce marché, un débit sans aucun message est indiscernable d'une
arnaque.

⛔ **Rien n'est construit ici** : le périmètre relève des arbitrages
**D-10 → D-14** (litiges). Cette ligne existe pour que l'arbitrage trouve la
question POSÉE au lieu de la redécouvrir — le motif exact que le registre
cherche à éviter.

Ce qu'il faudra trancher le moment venu : qui écrit ce message, à quel moment
de la transition, et ce qu'il promet exactement sur le remboursement.
