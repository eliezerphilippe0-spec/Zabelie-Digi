# 44 — Surface d'API : ce qui existe, ce qui manque, ce qu'il ne faut pas construire

**Écrit le 2026-08-22**, sur une question du porteur : *« Est-ce que Zabelie a
tous les API qu'une marketplace moderne, prémium doit avoir, inspiré des
géants ? »*

Tout ce qui suit est **mesuré**, pas estimé. Les commandes de mesure sont
données pour que ce document se refasse au lieu de se recopier.

```bash
find app/api -name route.ts | wc -l          # 65 routes, le 2026-08-22
npx tsx --test tests/api-v1-schemas.test.ts  # 28 tests, 28 verts
python3 -c "import json;print(len(json.load(open('vercel.json'))['crons']))"  # 8 crons
```

---

## 0. La réponse en trois phrases

1. La surface transactionnelle est **complète et solide** — 65 routes, et les
   trois invariants de paiement sont tenus là où la plupart des places de
   marché les ratent.
2. **Une API entière existe sans être servie** : neuf endpoints v1, contrats
   typés, 28 tests verts, et **aucune route HTTP**.
3. « Ce qu'ont les géants » n'est pas une cible pour Zabelie, et la moitié de
   ce document existe pour dire **ce qu'il ne faut pas construire**.

---

## 1. Ce qui existe — inventaire du 2026-08-22

| Domaine | Routes | Ce qui est tenu |
|---|---|---|
| **Paiement** | `checkout`, `moncash/return`, `stripe/webhook`, `zelle/reference`, `reconcile`, `maturation`, `facture/[token]/pay` | idempotence **en base**, confirmation serveur-à-serveur, réconciliation totale (`docs/03`) |
| **Catalogue** | `products` + `physical`, `asset`, `cover`, `media`, `media/video`, `discount`, `flash`, `affiliate-rate` | 9 routes ; toute fiche naît en brouillon |
| **Livraison** | `fulfillment/declare`, `received`, `not-received`, `sweep`, `delivery-info` | machine à états `0043`, relances par outbox |
| **Registre vendeur** | `payouts`, `admin/payouts`, `admin/payouts/settle`, `kyc`, `kyc/purge` | invariant comptable `0033`, écriture compensatoire |
| **Confiance** | `reviews`, `admin/product-status`, `admin/user-status`, `admin/refund`, `admin/kyc` | revue humaine **avant** publication, audit `0055` |
| **Croissance** | `coupons`, `coupons/validate`, `affiliate`, `products/flash`, `metrics/landing`, `admin/search-demand` | capteur de demande sur recherche vide |
| **B2B** | `business/register`, `business/clients`, `business/invoices` (+ `items`, `send`, `void`) | facturation complète |
| **Topup** | `zabelie/topup/orders` (+ `[id]`), `admin/topup/*` | revendeur télécom, ledger append-only |
| **Compte** | `account`, `account/export`, `profile`, `auth/signout`, `panier`, `download`, `zones/request` | export RGPD-like |
| **Exploitation** | `health`, `readyz`, `admin/coherence`, `stock/expire`, `points/expire`, `search/purge`, `admin/menu-counts`, `admin/zones`, `admin/pickup-points` | 8 crons déclarés dans `vercel.json` |
| **IA** | `ai/description` | — |

⚠️ **Zabelie porte des choses que les géants n'ont pas**, et ce n'est pas une
consolation : c'est le cœur du positionnement. Mobile money haïtien, recharge
téléphonique first-party, Zelle semi-manuel pour la diaspora, affiliation
native, facturation B2B. Une marketplace « inspirée des géants » qui n'aurait
pas ça ne servirait personne en Haïti.

---

## 2. ⚠️ Neuf endpoints qui n'existent qu'en types

**C'est la trouvaille de cet inventaire, et elle est sérieuse.**

`lib/api/v1/schemas.ts` déclare `V1_ENDPOINTS` : `search_products`,
`get_product`, `compare_products`, `get_seller`, `get_reviews`,
`check_inventory`, `get_delivery_terms`, `get_order`, `get_user_orders`.

Contrats d'entrée ET de sortie, **28 tests verts**, vérifiés dans les deux
sens — une limite au-dessus du cap est *refusée* et non tronquée, un intervalle
de prix inversé est refusé, un prix flottant est refusé.

```bash
ls app/api | grep -i v1                    # rien
grep -rn "V1_ENDPOINTS" app/ lib/ | grep -v tests
# lib/api/v1/schemas.ts:439  ← lui-même, et rien d'autre
```

**Aucune route ne sert ces contrats.** `app/api/v1/` n'existe pas.

C'est le motif que `CLAUDE.md` nomme — *« le code sans appelant »* — mais à
l'échelle d'une API entière. La suite est verte, les contrats sont *prouvés*,
et rien n'a jamais répondu à une requête. **Un artefact jamais invoqué ne lève
rien, ne journalise rien, ne ralentit rien** : son absence d'usage est
invisible par nature.

### Pourquoi c'est la brique à servir en premier

La conception est plus soignée que la moyenne du dépôt, et elle vise
explicitement un usage à venir : **être le contexte d'un modèle**.

* `type` **discriminant** sur chaque sortie — aiguillage sans deviner la forme ;
* `untrusted` **séparé dans la structure**, pas par convention de nommage : tout
  texte écrit par un vendeur ou un acheteur vit dans un sous-objet à part,
  jamais mélangé au prix, au stock ou au statut. Un lecteur automatique doit
  pouvoir distinguer « ce que Zabelie affirme » de « ce qu'un inconnu a tapé » ;
* **énumérations fermées** — un statut hors liste fait ÉCHOUER la réponse. Un
  `passthrough` transformerait une valeur inconnue en fait présenté comme vrai.

Il ne manque que `app/api/v1/[endpoint]/route.ts`. C'est le meilleur rapport
valeur/effort du dépôt : il transforme 28 tests décoratifs en garanties réelles.

⚠️ **Écart assumé et déjà documenté** : `search_products` ne renvoie **pas** les
prestations (décision porteur 2026-08-01). Le catalogue web, lui, affiche les
trois types. Servir la v1 ne doit pas défaire cet arbitrage.

---

## 3. Les vrais manques, par ordre d'importance POUR HAÏTI

### 3.1 Messagerie acheteur ↔ vendeur — **absente**

```bash
ls app/api | grep -iE "message|chat|conversation|thread"   # rien
```

Le manque le plus coûteux. Sur ce marché, la confiance est le frein numéro un
et **tout se négocie déjà par WhatsApp**. Aujourd'hui, un acheteur qui a une
question sur un produit n'a **aucun chemin dans le produit** — il sort, ou il
n'achète pas.

⚠️ À instruire avant de coder : le lien WhatsApp existe déjà
(`lib/whatsapp.ts`, masqué tant que le porteur n'a pas posé le numéro). Une
messagerie interne qui **doublerait** WhatsApp sans le remplacer ajouterait un
canal que personne ne relèverait. La question n'est pas « construire une
messagerie » mais « où la conversation a-t-elle lieu, et qui la relève ».

### 3.2 Litiges — à moitié

`fulfillment/not-received` existe et fonctionne. Rien ne porte l'instruction,
les preuves, ni l'arbitrage.

⛔ **C'est un arbitrage en attente, pas un oubli** : `docs/28` D-10 → D-14. Et
c'est pour lui que `0056` est **gelée** — les avis de remise sont une pièce du
futur suivi des litiges, dont le gel de maturation peut dépasser 90 jours.
Purger effacerait des preuves. Ne rien coder ici avant l'arbitrage.

### 3.3 Notifications — le tuyau existe, le robinet est à vérifier

`zabelie_outbox` (`0061`) est correctement câblé : **cinq** fonctions
(`enqueue`, `mark_sent`, `mark_failed`, `claim`, `on_order_paid`), un trigger
`zabelie_outbox_on_order_paid`, et un drain réel appelé par le cron
`/api/fulfillment/sweep` (`30 12 * * *`), qui journalise `outbox_dus`,
`outbox_envoyes`, `outbox_echecs`, `outbox_abandonnes`.

Mais tout passe par une porte unique :

```ts
export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
```

⚠️ **Si `RESEND_API_KEY` n'est pas posée en production, la file se draine dans
le vide et personne n'est jamais prévenu de rien** — ni l'acheteur de sa
livraison, ni le vendeur de sa vente. Le cron rendrait des compteurs à zéro, et
zéro se lit comme « rien à signaler ».

`RESEND_API_KEY` est **au registre des clés** (`docs/11` et
`docs/API_KEYS_REGISTRY.md` — Resend y est le fournisseur retenu, Brevo a été
écarté comme doublon). Le fournisseur est donc validé ; ce qui n'est pas
mesuré, c'est que la variable soit **posée dans Vercel**.

→ **Geste, une minute** : Vercel → Settings → Environment Variables, vérifier
la présence de `RESEND_API_KEY` en Production. Puis lire le journal du cron
`/api/fulfillment/sweep` : `outbox_envoyes` à zéro plusieurs jours de suite
alors que des ventes ont lieu est le signal.

---

## 4. ⛔ Ce qu'il NE faut PAS construire

C'est la moitié importante de ce document, et elle découle directement d'une
règle du dépôt : **un filet posé sur un chemin que personne ne peut emprunter
rend zéro à chaque passage, et zéro se lit comme « rien à signaler ».**

| Brique « des géants » | Pourquoi PAS maintenant |
|---|---|
| **Clés d'API tierces / OAuth partenaires** | Sert un écosystème de développeurs. Zabelie n'en a aucun. Ce serait de l'authentification pour personne. |
| **Webhooks sortants vers les marchands** | Même raison. Les vendeurs de Zabelie sont sur Android en 3G, pas sur un serveur qui écoute un POST. |
| **Spécification OpenAPI publiée** | Utile quand des tiers intègrent. Avant, c'est un document qui se périme sans lecteur. |
| **Pagination par curseur** | Optimisation de volume. Le catalogue compte **neuf produits** (mesuré le 2026-08-22). |
| **Multi-devises au-delà de HTG/USD** | Problème d'échelle absent. |
| **Calcul de taxes, multi-entrepôts, retours automatisés** | Idem — et les retours dépendent de l'arbitrage §3.2. |

⚠️ **Et le vrai manque n'est pas une API.** `docs/22` le dit en une ligne : la
**première commande réelle payée**. Au 2026-08-22, une seule commande a atteint
`paid` — et c'est une acquisition **gratuite** (rail `gratis`, `0087`). **Zéro
gourde n'a transité par MonCash.** Le chemin de l'argent est prouvé par des
tests SQL et par rien d'autre.

Aucune API supplémentaire ne débloque ça.

---

## 5. Ordre recommandé

| # | Chantier | Pourquoi maintenant |
|---|---|---|
| 1 | **Servir la v1** (`app/api/v1/…`) | Contrats écrits, 28 tests verts, il ne manque que les routes. Meilleur rapport valeur/effort du dépôt. |
| 2 | **Vérifier `RESEND_API_KEY` en production** | Une minute. Sans elle, aucune notification n'est jamais partie. |
| 3 | **La première vente réelle** (`docs/22`) | Ce n'est pas un chantier d'API, et c'est la seule chose qui manque vraiment. |
| 4 | **Messagerie** — après §3, et après l'instruction du §3.1 | La confiance est le frein n°1, mais le canal se décide avant de se coder. |
| 5 | **Litiges** — ⛔ bloqué par `docs/28` D-10→D-14 | Arbitrage porteur, pas décision d'implémentation. |

---

## 6. Ce que ce document ne prouve pas

À écrire, parce que c'est la limite exacte de la méthode employée :

* **Il compte des routes, pas des usages.** Une route qui existe et que
  personne n'appelle est indiscernable ici d'une route utilisée tous les
  jours. Le croisement qui le dirait — appelants côté client × routes — n'est
  pas fait.
* **Les 8 crons sont DÉCLARÉS, pas observés.** `tests/crons-appelants.test.ts`
  prouve que le code existe ; il ne prouve pas que le cron tourne. La preuve
  d'exécution se lit dans les journaux Vercel, et elle n'a pas été lue pour ce
  document.
* **La comparaison aux « géants » est une connaissance générale**, pas une
  mesure. Aucune documentation d'API tierce n'a été consultée pour l'écrire —
  l'accès réseau de la session est restreint. Elle vaut comme carte des
  capacités habituelles, pas comme référence citable.
