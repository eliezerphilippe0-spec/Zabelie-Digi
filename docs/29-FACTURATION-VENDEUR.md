# Facturation vendeur automatique — spec (chantier)

> **Statut : spec, rien d'implémenté.** Rédigée 2026-08-08 à partir du brief
> porteur, **corrigée contre le dépôt** (règle 7) : six écarts factuels et
> une collision structurelle. Le dépôt fait foi.
>
> **✅ Arbitrages D, E, F et C′ tranchés le 2026-08-08.** Il ne reste
> qu'une dépendance, technique : **`0043` appliquée en production**. PR-A
> devient écrivable ce jour-là — les deux replis du §0.3 lèvent l'attente
> des chantiers 2 et 4.

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

**✅ ARBITRAGE D TRANCHÉ — (b) table dédiée, briques partagées.** Et la
raison décisive n'est pas le goût mais une **contradiction d'invariants** :
les factures Business sont **modifiables** (`draft`, `invoice-editor.tsx`,
`zabelie_biz_recompute_invoice`) ; les factures marketplace doivent être
**immuables dès l'émission**. Une table commune exigerait un trigger qui
*branche* selon l'origine de la ligne — un garde conditionnel, donc un garde
qu'on peut se tromper à écrire, sur de la donnée comptable. S'y ajoute une
divergence de modèle : le « client » Business est un contact CRM
(`zabelie_biz_clients`), le nôtre est un `auth.users` qui a payé.

La réversibilité pousse au même endroit : séparer plus tard deux métiers
mêlés dans une table pleine de factures réelles est un chantier ; rapprocher
deux tables ne l'est pas.

**Ce qui se réutilise est du CODE, pas du schéma** : le motif `public_token`,
la route `/facture/[token]`, le rendu. Rien à réécrire.

Les trois sorties examinées :

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
2. **`zabelie_sellers`** — chantier 2 (PR #66). **✅ ARBITRAGE E DISSOUS** :
   `docs/23` §1 bis précise désormais que l'entité vendeur est une
   **extension de `profiles`, clé sur `profiles.id`**. Ancrer la facturation
   sur `profiles` aujourd'hui, c'est donc *déjà* l'ancrer sur
   `zabelie_sellers` demain — aucune migration de reprise, aucun choix à
   regretter. Ce n'était pas un arbitrage, c'était un silence de spec.
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
réel).

**✅ ARBITRAGE F TRANCHÉ — `total_htg > 0`**, et c'est le code qui l'a
tranché, pas une préférence : `app/api/products/route.ts:65` rejette
`price < 1` à la publication, et `0012` borne les coupons à
`percent between 1 and 90` — au minimum 10 % du prix reste dû. **Aucun
chemin du système ne produit un total nul.** Un total 0 signifierait donc
qu'un de ces trois garde-fous a cédé : la facture doit refuser de
l'entériner. Le drapeau `is_zero_total` était une complexité pour un cas
que le système interdit.

⚠️ **Constat séparé, trouvé en vérifiant F** : `app/page.tsx:110` filtre
`priceHTG === 0` pour la rangée « Produits gratuits » de l'accueil. Comme la
publication interdit `price < 1`, **cette section ne peut jamais rien
afficher** — une rangée morte, invisible parce que la garde `HomeRow` la
masque à vide. Deux sorties : autoriser le prix 0 (et F redevient ouvert),
ou retirer la section. Hors périmètre de ce chantier, inscrit au backlog.

## 7. Découpage

| PR | Contenu | Dépend de |
|---|---|---|
| A | Migration socle (`0055`+), triggers, RLS, compteur + tests pos/nég + mutations | `0043` en prod · arbitrages D, E |
| B | `zabelie_issue_invoice` + hook dans `mark_received` + test « total ≠ payé → rejet » | A |
| C | Vérification publique (réutilisant `/facture/[token]`) | A |
| D | PDF + partage WhatsApp | B, C |
| E | Avoirs — libres + trois garde-fous (C′ tranché) | B |

## 7 bis. Avoirs — ✅ C′ tranché : libres, avec trois garde-fous

**La question se réduit une fois posée proprement : un avoir est un
document, pas un mouvement de fonds.** Le seul chemin qui déplace de l'argent
est `refund_order` (`0006`/`0037`), avec son point de contrôle humain. Un
avoir qui ne touche pas le grand livre ne peut ni voler un acheteur ni sortir
un vendeur — le risque n'est pas financier, il est **documentaire** : un
vendeur qui annulerait ses factures pour maquiller son chiffre.

Trois garde-fous suffisent, et **aucun ne dépend de M3** (`docs/28`, non
construit) :

1. **Motif obligatoire** — un avoir sans raison n'est pas émis.
2. **Écriture au journal d'audit** — qui, quand, sur quelle facture, pourquoi.
3. **Interdiction explicite de déclencher un remboursement** — l'avoir
   *constate*, il ne rembourse pas. Le remboursement reste l'acte séparé,
   existant, à checkpoint humain.

`zabelie_issue_credit_note(p_invoice_id, p_reason)` : ligne négative
référençant l'origine, l'origine passe `void`. Conditionner l'avoir à un
litige aurait rendu ce chantier dépendant de `docs/28` pour un risque que la
séparation document/argent neutralise déjà.

## 8. Arbitrages — tous tranchés le 2026-08-08

| ID | Question | Décision |
|---|---|---|
| **D** | Table dédiée ou extension `zabelie_biz_*` | ✅ **(b)** dédiée + briques partagées — contradiction d'invariants : Business est modifiable, marketplace est immuable |
| **E** | Ancrage vendeur | ✅ **dissous** — `docs/23` §1 bis clé l'entité vendeur sur `profiles.id` |
| **F** | Facture à total nul | ✅ **`> 0`** — aucun chemin du système ne produit 0 (publication `price >= 1`, coupons ≤ 90 %) |
| **C′** | Avoir libre ou conditionné | ✅ **libre + trois garde-fous** — un avoir est un document, pas un mouvement de fonds |

**Il ne reste aucune décision.** La seule dépendance est technique :
`0043` appliquée en production.
