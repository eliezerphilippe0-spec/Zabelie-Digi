# Zabelie — les chiffres réels au 2026-09-05

Relevé mesuré en **lecture seule** sur la base de production (`ddditxykopuxxqzgkqwy`),
le 2026-09-05 vers 17:40 UTC. Aucune écriture.

## Comment lire ce document

Chaque nombre vient d'un `count` ou d'un `sum` **exact**, jamais d'une
estimation. Le premier jet employait `pg_stat_user_tables.n_live_tup`, qui est
une statistique approchée que l'optimiseur maintient : elle donnait « products
10, orders 15 » — juste par chance ce jour-là, et faux dès qu'un `vacuum`
tarde. Ces valeurs ont été jetées.

**Aucune jointure ne compte de lignes.** Chaque chiffre sort d'une
sous-requête scalaire indépendante, parce qu'une jointure produit-vendeur ou
commande-paiement multiplie les lignes et gonfle silencieusement un total.
C'est le même défaut que le comptage de rayons corrigé en août, où un produit
physique était compté deux fois.

---

## 1. Le chiffre qui commande tous les autres

> ### **0 gourde.**
> Aucun argent n'a jamais traversé Zabelie.

Ce n'est pas une panne : c'est l'état d'un produit qui n'a pas encore ouvert.
Tout le reste de ce document explique pourquoi, et ce qui manque exactement.

| Mesure | Valeur |
|---|---|
| Commandes au statut `paid` | **0** (le statut existe : `pending · paid · delivered · cancelled · refunded · disputed`) |
| Somme du grand livre `wallet_transactions` | **0 HTG** (1 écriture, de zéro) |
| Soldes vendeurs, disponible + maturation | **0 + 0 HTG** (1 portefeuille) |
| Séquestre | 1 ligne, **0 HTG** |
| Revenus plateforme | 1 ligne, brut **0**, commission **0** |
| Retraits vendeur demandés | **0** |
| **Invariant comptable 0033** — Σ(écritures) = solde + maturation | **écart 0** ✅ |

Le seul paiement jamais **confirmé** l'a été sur le rail `gratis`, pour un
produit à 0 HTG, le 2026-08-22. Sa commande est aujourd'hui `disputed`.

---

## 2. Les personnes

| Mesure | Valeur |
|---|---|
| Comptes (`auth.users`) | **4** |
| Dont adresse confirmée | 4 |
| Dont s'étant déjà connectés au moins une fois | 4 |
| Profils | 4 — **aucun doublon** |
| Premier compte | 2026-07-09 |
| Dernier compte | 2026-09-04 |
| Vendeurs ayant **saisi** au moins un produit | **2** |
| Vendeurs ayant **publié** au moins un produit | **1** |

Quatre comptes en deux mois, et un seul vendeur qui a mené une fiche jusqu'à
la publication. Le goulot n'est pas la fréquentation : c'est l'offre.

---

## 3. Le catalogue

**10 produits en base, 3 publiés.**

| Statut | Type | Nombre | Avec photo | Prix |
|---|---|---|---|---|
| publié | service | **3** | **0** | 0 à 300 HTG |
| brouillon | fichier | 6 | 0 | 0 à 1 200 HTG |
| brouillon | physique | 1 | 1 | 1 200 HTG |

Les trois produits publiés, tous du **même vendeur**, tous **sans photo** :

| Titre | Type | Prix | Créé |
|---|---|---|---|
| cours francisation | service | 300 HTG | 2026-08-11 |
| fxccxfdf | service | **0 HTG** | 2026-08-22 |
| appel | service | 10 HTG | 2026-09-03 |

Trois faits qui se lisent ensemble :

- **Aucun fichier n'est publié, aucun produit physique non plus.** Les seuls
  produits visibles sont des services.
- **`product_assets` : 0.** Aucun livrable n'a jamais été déposé. Les six
  brouillons de type « fichier » n'ont pas de fichier.
- **1 seul objet dans tout le stockage**, 3 buckets. La seule photo du dépôt
  est sur le brouillon physique, donc invisible au public. Le catalogue
  visible n'a **aucune image**.

Avec la règle des seuils de l'accueil premium (rangée à partir de 4 produits),
ces trois services ne s'affichent pas en rangée sur l'accueil. Ils restent
accessibles par le catalogue.

---

## 4. Les commandes et les paiements

**15 commandes, 15 paiements, 0 vente.**

| Statut commande | Nombre | Acheteurs distincts | Montant cumulé | Période |
|---|---|---|---|---|
| `cancelled` | 7 | 3 | 2 100 HTG | 11 → 22 août |
| `pending` | 7 | 1 | 70 HTG | 3 septembre |
| `disputed` | 1 | 1 | 0 HTG | 22 août |
| **`paid`** | **0** | — | — | — |

| Statut paiement | Rail | Nombre | Référence opérateur | Confirmés |
|---|---|---|---|---|
| `failed` | moncash | 7 | 0 | 0 |
| `pending` | moncash | 7 | 0 | 0 |
| `confirmed` | **gratis** | 1 | 1 | 1 |

**Aucun paiement MonCash n'a jamais reçu de référence opérateur.** C'est la
signature d'un rail qui n'a jamais abouti : les tentatives d'août ont échoué,
celles de septembre attendent encore. Elles correspondent aux essais du
porteur en mode bac à sable, puis en mode production sans identifiants
valides.

### Les invariants de paiement tiennent

| Invariant (`CLAUDE.md`, règle dure n°1) | Mesure |
|---|---|
| (a) idempotence garantie en base | **0 clé d'idempotence réutilisée**, 15 clés pour 15 paiements |
| (a bis) un paiement par commande | **0 commande portant plusieurs paiements** |
| (c) réconciliation, aucun paiement orphelin | chaque paiement porte une commande existante |

---

## 5. Les doublons

Demandés explicitement. Recherchés sur sept familles, chacune par un
regroupement sans jointure.

| Famille | Groupes | Lignes | **Lignes en trop** |
|---|---|---|---|
| Commandes répétées (même acheteur, même produit, même montant) | 4 | 14 | **10** |
| Produits de même titre chez le même vendeur | 1 | 3 | **2** |
| Profils en double pour un compte | 0 | — | 0 |
| Portefeuilles en double pour un propriétaire | 0 | — | 0 |
| Paiements multiples sur une commande | 0 | — | 0 |
| Clés d'idempotence réutilisées | 0 | — | 0 |
| Lignes de panier en double | 0 | — | 0 |

### Ce que ces doublons sont vraiment

Les **7 commandes en attente du 3 septembre** sont le même achat, recommencé :
même acheteur, même produit à 10 HTG, en 26 minutes. Deux paires sont
séparées de **1,6 seconde** et **13 secondes** — ce sont des re-clics, pas des
intentions distinctes.

**Ce n'est pas un défaut d'idempotence.** Chaque clic crée une commande neuve
avec sa propre clé ; l'idempotence protège contre le double *paiement* d'une
même commande, pas contre le fait de recommencer un achat qui n'a pas abouti.
Les sept sont restées `pending` parce qu'aucune n'a jamais été payée.

**Elles se fermeront seules.** `zabelie_expire_stale_payment` bascule un
paiement en `failed` après **48 heures**, et `/api/reconcile` l'appelle chaque
jour à 12:00 UTC (`app/api/reconcile/route.ts:55`, `vercel.json`). La dernière
des sept date du 2026-09-03 18:24 UTC : elle devient éligible le
**2026-09-05 à 18:24 UTC**, et le passage du **2026-09-06 à 12:00 UTC** les
fermera toutes. Rien à faire — c'était vérifié avant de conclure, pour ne pas
appeler défaut ce qui est un délai.

Le seul doublon qui demande une décision humaine est celui du **catalogue** :
trois produits de même titre chez le même vendeur, dont deux sont des
brouillons superflus. C'est de la donnée d'essai, pas une anomalie de code.

---

## 6. Tout le reste, en une table

| Mesure | Valeur |
|---|---|
| Avis produit | 0 |
| Messages entre acheteur et vendeur | 0 |
| Lignes de panier | 2 |
| Recherches sans résultat enregistrées | 1 |
| Dossiers KYC | 0 |
| Affiliés | 0 |
| Courriels en file d'attente | **2** — ils ne partiront pas tant que `RESEND_API_KEY` n'est pas posée |
| Actions d'administration tracées | 8 |
| Rayons de la taxonomie | 582, dont **70 actifs** (après `0096`) |
| Migrations au registre | 95 |

---

## 7. L'entonnoir, tel qu'il est

```
4 comptes créés
└─ 2 vendeurs ont saisi un produit
   └─ 1 vendeur a publié
      └─ 3 produits publiés (services, sans photo, chez le même vendeur)
         └─ 15 commandes ouvertes
            └─ 1 paiement confirmé — sur un produit à 0 HTG
               └─ 0 gourde encaissée
```

Chaque marche perd presque tout. La plus coûteuse est la première : sur quatre
comptes, un seul vendeur publie.

---

## 8. Ce que ces chiffres disent de la suite

Ils ne disent pas que le produit est cassé. Le code est vert (952 tests),
l'invariant comptable tient, l'idempotence tient, la taxonomie est propre, la
refonte de l'accueil est en production. Ils disent que **rien n'a encore été
mis à l'épreuve du réel**, et ils nomment précisément ce qui manque :

1. **Les identifiants MonCash de production.** Sept paiements en attente et
   sept échoués, aucune référence opérateur : le rail n'a jamais abouti une
   seule fois. C'est le seul verrou entre Zabelie et sa première gourde.
2. **Des produits avec des photos.** Zéro image sur le catalogue visible. Un
   marketplace sans photo ne vend pas, quelle que soit la qualité de sa page
   d'accueil.
3. **Un livrable déposé.** Six brouillons de type « fichier » sans fichier :
   le parcours vendeur s'arrête avant la fin, et personne ne sait pourquoi
   parce que rien ne l'instrumente côté vendeur.
4. **`RESEND_API_KEY`.** Deux courriels attendent dans la file. Sans la clé,
   un acheteur qui paie ne reçoit rien.

---

## Reproduire ce relevé

Les requêtes sont dans l'historique de la session du 2026-09-05. Elles ne
lisent que `count`, `sum` et `min`/`max`, sur `auth.users`, `profiles`,
`products`, `orders`, `payments`, `wallets`, `wallet_transactions`,
`escrow_entries`, `platform_earnings`, `zabelie_categories`, `storage.objects`
et les tables d'engagement. Aucune écriture, aucune donnée modifiée.
