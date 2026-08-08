# Facturation vendeur automatique — spec (chantier)

> **Statut : spec, rien d'implémenté.** Rédigée 2026-08-08 à partir du brief
> porteur, **corrigée contre le dépôt** (règle 7) : six écarts factuels et
> une collision structurelle. Le dépôt fait foi.
>
> **⛔ Non implémentable en l'état** — trois de ses fondations n'existent pas.
> Voir §0. Cette spec est écrite maintenant pour être *prête*, pas pour être
> exécutée maintenant.

## 0. Ce que la vérification a trouvé — à lire avant tout

### 0.1 La collision : un système de facturation existe déjà

`0022_business_v1.sql` (**appliquée en production**) porte
`zabelie_biz_invoices`, `zabelie_biz_invoice_items`, `zabelie_biz_payments`,
`zabelie_biz_clients`, `zabelie_biz_professionals` — avec une machine à
**six états** (`draft · sent · partially_paid · paid · overdue · void`), un
**portail public par token sans login** (`public_token`,
`zabelie_biz_get_invoice_by_token`, `app/facture/[token]/page.tsx`), un
éditeur (`components/business/invoice-editor.tsx`), une console pro et le
paiement MonCash d'une facture.

Le brief créait `zabelie_invoices` avec une machine à états quasi identique
(`ISSUED · SENT · PAID · OVERDUE · VOIDED`) et un portail de vérification par
token — sans mentionner l'existant. C'est précisément le doublon que
l'invariant 7 du brief interdit.

**Mais les deux métiers sont distincts, et c'est vérifié** : `0022` n'a
**aucune référence à `orders`** — un professionnel y facture *son* client,
hors marketplace. Ici, la facture est l'artefact d'une commande marketplace.
Deux systèmes peuvent donc légitimement coexister. **⚠️ Arbitrage D (porteur)**
— trois sorties, à trancher avant PR-A :

| Sortie | Ce qu'elle implique |
|---|---|
| **(a) Étendre `zabelie_biz_*`** | Une facture de commande devient une facture Business à `professional_id` = le vendeur. Réutilise machine à états, portail token, PDF. Risque : mélanger deux métiers dans une table, et le pro Business n'est pas le vendeur marketplace |
| **(b) Table dédiée, briques partagées** *(recommandée)* | `zabelie_invoices` séparée, mais on **réutilise** le motif `public_token` + la route `/facture/[token]` + le rendu, au lieu de les réécrire |
| **(c) Table dédiée, tout neuf** | Ce que décrivait le brief. Deux portails, deux rendus, deux disciplines à maintenir |

### 0.2 Les cinq écarts factuels corrigés dans cette spec

| Le brief dit | Le dépôt dit |
|---|---|
| `zabelie_orders(id)` | **`orders`** (`0001:65`) — pas de préfixe sur les tables du socle |
| `zabelie_sellers(id)` | **N'existe pas** — spécifiée par `docs/23` (PR #66), non implémentée |
| `order_items` | **N'existe pas** — c'est le chantier 4 (`docs/27`, PR #68). Aujourd'hui **une commande = un produit** (`orders.product_id`) |
| « montants en **centimes** HTG » | **Gourdes entières** partout (`price_htg`, `amount_htg`, `total_htg`). Introduire des centimes créerait deux unités sur le money-path — la faute la plus coûteuse possible |
| Prochain numéro « après `0052` » | Dernier appliqué au dépôt : **`0053`** ; **`0054`** est déjà pris par la PR #67. Le prochain libre est **`0055`** |

Deux points mineurs : l'état terminal du fulfillment est **`received`**
(`0043`), `delivered` étant un `orders.status` — le hook se pose donc dans
`zabelie_mark_received`, pas ailleurs. Et « aligné sur le zabelie-kit » ne
réfère à rien du dépôt ; l'alignement réel est `zabelie_biz_invoice_status`.

### 0.3 Les dépendances, dans l'ordre

1. **`0043` appliquée en production** — correctement identifiée par le brief.
2. **`zabelie_sellers`** — chantier 2 (PR #66 en revue). Sans elle, pas de
   compteur par vendeur ni de `seller_snapshot`. **Repli possible** : ancrer
   sur `profiles.id` (le vendeur *est* un profil aujourd'hui) — ce qui rend
   le socle implémentable avant le chantier 2. **Arbitrage E (porteur)**.
3. **`order_items`** — chantier 4 (PR #68). **Repli** : `lines` contient une
   seule ligne dérivée de `orders.product_id` — fidèle au réel d'aujourd'hui,
   et le jour du panier multi-produits, la structure `jsonb` absorbe N lignes
   sans migration.

Avec les deux replis, **PR-A devient implémentable dès que `0043` est en
base** — c'est la recommandation.

## 1. Principe

À la **confirmation de réception** d'une commande (`zabelie_mark_received`,
`0043`), une facture est émise **automatiquement, côté serveur**, au nom du
**vendeur**, adressée à l'acheteur. Le vendeur ne génère pas : il consulte,
télécharge, partage.

**Positionnement** : le vendeur est l'émetteur ; Zabelie est facilitateur
technique, jamais partie commerciale. Cohérent avec l'intermédiation pure
(`docs/17`) — et c'est une raison de plus de **ne pas** faire porter la
facture par le compte marchand.

## 2. Invariants

1. **Immuabilité** — trigger anti-`UPDATE`/`DELETE`, liste blanche stricte
   des colonnes d'état (`status`, `sent_at`). Correction = **avoir**.
2. **Montants 100 % serveur, en GOURDES ENTIÈRES** — instantané depuis
   `orders` + `payments` confirmés. Aucun montant du client, jamais de
   flottant, jamais de centimes.
3. **Numérotation par vendeur, séquentielle, sans trou** — compteur dédié
   sous `select … for update`, jamais un `serial` global (un trou dans une
   séquence fiscale est un signal d'alerte).
4. **Cohérence avec le paiement réel** — `total_htg` doit égaler le montant
   confirmé ; sinon exception nommée, la transition échoue. Une facture qui
   ne dit pas ce qui a été payé est pire qu'une facture absente.
5. **Aucune PII dans les journaux.** Les instantanés vivent **dans la
   facture** (obligation comptable), pas dans les logs.
6. **RLS dès la première migration** — vendeur : ses factures ; acheteur :
   les siennes ; `anon` : la seule vue de vérification par token.
7. **Idempotence** — index unique partiel `(order_id) where status <> 'void'`.
8. **Survie au droit à l'effacement** — `on delete set null` sur les
   identifiants + instantanés dénormalisés. Une facture survit à la
   suppression du compte : obligation comptable, données minimales.

## 3. Machine à états

`issued → sent → paid`, avec `void` (avoir émis) et `overdue` (cron
optionnel). **Aligner les libellés sur `zabelie_biz_invoice_status`** —
minuscules, mêmes mots là où le sens est le même : deux vocabulaires pour
un même concept dans une même base est une dette gratuite.

`draft` n'existe **pas** ici : la facture naît `issued` dans la transaction
de réception. Un état transitoire jamais visible n'est pas un état.

Transitions par fonctions `security definer`, `search_path` épinglé,
révoquées d'`anon` — jamais d'`UPDATE` direct (le trigger l'interdit).

## 4. Vérification publique

**Réutiliser** le motif `public_token` de `0022` et la route
`/facture/[token]` plutôt qu'en écrire une seconde. Affiche : référence,
date, boutique, total, statut. **Jamais** les coordonnées acheteur. Accès
par token seul — pas d'énumération par référence.

## 5. PDF et partage

Rendu serveur, **kreyòl d'abord** puis FR/EN/ES (`lib/i18n.ts`). Partage
`wa.me/?text=` avec le lien public — WhatsApp est le canal, avant l'email.
Génération à la demande, pas de stockage systématique.

## 6. Ce qu'on ne fait pas

Pas de bouton « générer » (automatique), pas de « modifier » (immuable +
avoirs), pas de « marquer payée » à la main (l'état vient du flux MonCash
réel). Montant nul : `>= 0` avec un drapeau explicite plutôt qu'un `> 0` qui
interdirait une promotion légitime — **arbitrage F**.

## 7. Découpage

| PR | Contenu | Dépend de |
|---|---|---|
| A | Migration socle (`0055`+), triggers, RLS, compteur + tests pos/nég + mutations | `0043` en prod · arbitrages D, E |
| B | `zabelie_issue_invoice` + hook dans `mark_received` + test « total ≠ payé → rejet » | A |
| C | Vérification publique (réutilisant `/facture/[token]`) | A |
| D | PDF + partage WhatsApp | B, C |
| E | Avoirs — **arbitrage C du brief** (avoir libre vs conditionné à un litige) | B |

## 8. Arbitrages ouverts

| ID | Question | Recommandation |
|---|---|---|
| **D** | Table dédiée ou extension de `zabelie_biz_*` | **(b)** dédiée + briques partagées |
| **E** | Ancrer sur `profiles` (implémentable maintenant) ou attendre `zabelie_sellers` | **`profiles`** — le vendeur *est* un profil aujourd'hui |
| **F** | Facture à total nul autorisée ? | `>= 0` + drapeau explicite |
| **C′** | Avoir libre vendeur ou conditionné à un litige tracé | À trancher — touche l'argent |
