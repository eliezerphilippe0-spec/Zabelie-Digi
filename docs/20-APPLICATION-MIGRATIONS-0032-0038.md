# Application des migrations `0032` → `0038`

> Sept migrations qui touchent le **money-path**. Preview d'abord, vérification,
> puis production. Ordre strict — chacune dépend des précédentes.

## Ce que contient le lot

| # | Objet | Risque |
|---|---|---|
| `0032` | Enregistrement des règlements manuels vendeurs | Faible — ajoute des colonnes à `payouts` (table vide) |
| `0033` | Contrôle de cohérence du registre | Nul — vue + fonction en lecture |
| `0034` | Retrait self-service vendeur | Faible — nouvelles tables et fonctions |
| `0035` | Taxonomie catalogue (16 départements) | Nul — nouvelle table + seed |
| `0036` | Produits physiques, variantes, stock | Faible — nouvelles tables |
| `0037` | Branchement stock ↔ money-path | ⚠️ **Modifie `confirm_payment`** |
| `0038` | Correctif survente + garde de rupture | ⚠️ **Modifie `confirm_payment`** |

⚠️ `0037` et `0038` remplacent `confirm_payment`, `refund_order` et
`zabelie_expire_stale_payment`. **`0038` est indispensable** : sans elle, `0037`
laisse passer une survente silencieuse quand la réservation expire pendant le
paiement. Ne jamais appliquer `0037` sans `0038`.

## ⚠️ Deux actions ne dépendent PAS de ce lot — à faire AVANT, aujourd'hui

Elles sont réalisables sur la production **telle qu'elle est** (`0030`), sans
merge, sans migration :

1. **Les trois requêtes d'encours** (`docs/17` §6). Lecture seule. La prod
   contient déjà tout ce qu'il faut pour répondre à « combien » et « depuis
   quand ». Ces chiffres disent l'**urgence du décaissement** (qui payer
   d'abord, en combien de temps) — pas s'il faut continuer d'encaisser :
   ce second arbitrage dépend de l'**existence d'une sortie qui fonctionne**,
   pas de la taille de l'écart (`docs/19` §5).
2. **L'apurement manuel.** Payer les vendeurs par virement MonCash contre reçu
   ne nécessite **aucun code**. La route de retrait sert à ce que la situation
   ne se reproduise plus ; elle ne conditionne pas le remboursement de ce qui
   est **déjà dû**.

## Ordre d'application — application par GROUPES, pas d'un bloc

Sept migrations dont plusieurs sur le money-path : c'est beaucoup pour un seul
rollback. On applique en deux groupes, avec une vérification entre les deux —
si quelque chose diverge, on sait lequel des deux l'a causé.

| Groupe | Migrations | Objet | Touche le money-path |
|---|---|---|---|
| **A** | `0032` · `0033` · `0034` | Chantier 0 — voie de sortie vendeur | oui (par construction) |
| **B1** | `0035` · `0036` | Taxonomie, produits physiques, stock | non — **vérifié**, cf. §B1 |
| **B2** | `0037` · `0038` · `0040` | Branchement stock ↔ money-path | **oui** |

## §B1 — checklist, écrite AVANT application

> Rédigée le 2026-07-26 **avant** toute application, à partir du texte des
> migrations. Une checklist écrite après coup décrit ce qu'on a observé, pas ce
> qu'on attendait — elle ne peut plus rien infirmer.

### Ce que B1 contient exactement — inventaire des instructions

`0035` : la table `zabelie_categories`, deux index, une fonction de garde de
profondeur et son trigger **sur cette seule table**, RLS activée, `insert`/
`update`/`delete` révoqués pour `anon` et `authenticated`, trois `insert` de
seed. **Aucune autre table n'est nommée dans le fichier.**

`0036` : `alter type product_kind add value 'physical'` ; six tables `zabelie_*`
(produits physiques, variantes, stock, réservations, limites, modèles véhicule,
compatibilité) ; deux types énumérés ; quatre fonctions de stock
(`reserve` / `consume` / `release` / `expire`) ; RLS activée partout et écritures
révoquées ; deux `insert` de seed.

### Contact avec le money-path — vérifié, pas déduit

Recherche de `orders`, `payments`, `wallets`, `wallet_transactions`,
`escrow_entries`, `payouts`, `confirm_payment`, `refund_order`, `commission`,
maturation, dans les deux fichiers :

- `0035` : **zéro occurrence**.
- `0036` : **deux occurrences**, une en commentaire et **une seule réelle** —
  ```sql
  order_id uuid not null references orders (id) on delete cascade
  ```
  dans `zabelie_stock_reservations`.

Ce qu'il faut en retenir, et ce n'est pas rien :

1. **Aucune fonction du money-path n'est remplacée.** Pas de `create or replace`
   de `confirm_payment` ni de `refund_order` — ils sont dans `0037`/`0038`,
   donc en B2. Aucun trigger n'est créé sur `orders`, `wallets` ou le ledger.
2. **Mais `0036` n'est pas totalement inerte vis-à-vis d'`orders`** : créer
   cette clé étrangère prend un verrou sur `orders` le temps de la migration.
   Bref, mais réel → **appliquer aux heures creuses**, comme le reste.
3. Le `on delete cascade` fait disparaître les réservations d'une commande
   supprimée. Sans effet pratique — le registre est append-only et les
   commandes ne se suppriment pas — mais c'est le seul lien, autant le nommer.

### ⚠️ Porte à sens unique

`alter type product_kind add value 'physical'` **ne se défait pas** : PostgreSQL
ne sait pas retirer une valeur d'une énumération. Le retour arrière consisterait
à recréer le type et à réécrire toutes les colonnes qui l'utilisent. À savoir
avant, pas pendant. Les tables ajoutées, elles, se suppriment sans douleur.

### État attendu APRÈS B1 — valeurs dérivées du texte des migrations

```sql
-- 1. Taxonomie : 16 départements (4 actifs), 74 catégories (10 actives),
--    33 sous-catégories (toutes actives — le seed niveau 3 n'a pas de colonne
--    `active`, elles héritent du défaut).
select level, count(*) as total, count(*) filter (where active) as actifs
  from zabelie_categories group by level order by level;
-- Attendu : 1|16|4 · 2|74|10 · 3|33|33

-- 2. Modèles véhicule curés : 38 au total.
select kind, count(*) from zabelie_vehicle_models group by kind order by 1;
-- Attendu : auto|26 · moto|12

-- 3. TTL de réservation — 30 min en B1. Ce n'est PAS 120 : la montée à 120
--    vient de `0038`, donc de B2. Voir 120 ici = B2 a été appliquée par erreur.
select key, value from zabelie_stock_limits;
-- Attendu : reservation_ttl_minutes | 30

-- 4. Les quatre fonctions de stock existent, et AUCUNE fonction de B2.
select count(*) filter (where proname = 'zabelie_reserve_stock')          as reserve,
       count(*) filter (where proname = 'zabelie_expire_stock_reservations') as expire,
       count(*) filter (where proname = 'zabelie_consume_stock_strict')    as b2_strict,
       count(*) filter (where proname = 'zabelie_refresh_in_stock')        as b2_flag
  from pg_proc;
-- Attendu : 1 · 1 · 0 · 0

-- 5. La colonne `products.in_stock` doit être ABSENTE (elle vient de `0040`).
select count(*) from information_schema.columns
 where table_name = 'products' and column_name = 'in_stock';
-- Attendu : 0. Le catalogue sait fonctionner sans (repli sur 42703).

-- 6. RLS active sur toutes les tables ajoutées.
select relname, relrowsecurity from pg_class
 where relname like 'zabelie_%'
   and relname in ('zabelie_categories','zabelie_physical_products',
                   'zabelie_product_variants','zabelie_stock',
                   'zabelie_stock_reservations','zabelie_stock_limits',
                   'zabelie_vehicle_models','zabelie_product_fitment')
 order by 1;
-- Attendu : `t` partout.
```

### Ce qui doit être INCHANGÉ — c'est le contrôle qui compte

```sql
-- 7. Le registre n'a pas bougé d'une gourde.
select zabelie_solvency_report();      -- identique au relevé d'AVANT B1
-- (avant le groupe A, utiliser les trois requêtes brutes de `docs/17` §6)

-- 8. Aucune commande n'a changé d'état.
select status, count(*) from orders group by status order by 1;

-- 9. Aucun produit physique n'est en vente. La saisie crée un BROUILLON ;
--    voir une ligne ici signifie qu'une fiche a été publiée à la main.
select count(*) from products where kind = 'physical' and status = 'published';
-- Attendu : 0
```

### Ordre et garde-fous

- **Preview d'abord, jamais la production directement.** Vérifier au passage
  que le Preview est protégé par mot de passe et en `noindex` (§ dédié).
- Relever `zabelie_solvency_report()` **avant** — sans référence, le contrôle 7
  ne prouve rien.
- B1 **n'ouvre pas la vente** : le statut à la création est `draft`, le checkout
  n'est pas atteignable, et l'état par défaut « suspendu » côté encaissement
  n'est pas remis en cause. On peut saisir des fiches sans rouvrir le sujet de
  la rétention.

### Ce que les tests ne couvrent PAS, et que B1 active

Le parcours physique e2e tourne contre un Supabase **simulé** : il ne rejoue ni
RLS, ni contraintes, ni triggers. Or `0035`/`0036` créent exactement ça. La
partie que la migration active est donc la partie non testée — d'où la
vérification manuelle ci-dessus, sur Preview, avant la production.

Deux comportements changent côté application dès B1, sans qu'aucun test ne les
couvre :

- `/api/stock/expire` (cron) appelle `zabelie_expire_stock_reservations`, qui
  n'existe pas aujourd'hui : la route échoue actuellement et se mettra à
  fonctionner.
- `/api/checkout` appelle `zabelie_reserve_stock` **uniquement si le client
  envoie un `variantId`**. Le checkout digital n'est pas concerné. Aujourd'hui,
  un client qui enverrait un `variantId` fait échouer sa propre commande (la
  fonction n'existe pas) ; après B1 l'appel se résout normalement. B1 referme
  donc ce cas plutôt qu'elle ne l'ouvre.

### Pourquoi B est coupé en deux (décision porteur, 2026-07-26)

`0037` et `0038` remplacent `confirm_payment` et `refund_order`. Les faire
passer dans le même lot que le catalogue n'est pas dangereux en soi — c'est
qu'on perd la capacité de **dire précisément ce qui a changé sur les flux
financiers** le jour où un vendeur conteste un montant. Catalogue d'un côté,
money-path de l'autre, **revue séparée**.

**B1 seul débloque ce qui est utile aujourd'hui.** Le formulaire vendeur
(`/vendre/physique` → `app/api/products/physical/route.ts`) interroge
`zabelie_categories` : sans la table, aucune fiche ne peut être saisie. C'est
ça, l'argument pour appliquer B1 — **débloquer la saisie, pas la vitrine**.

**B2 attend que les versements manuels soient exécutés.** Tant que l'apurement
n'est pas fait, on ne superpose pas un changement de `confirm_payment` à un
encours contesté.

⚠️ B1 sans B2 signifie : le stock existe, mais il n'est **ni décrémenté à la
vente ni protégé contre la survente**. Donc B1 sert à **saisir** des fiches,
jamais à **ouvrir** la vente physique. Ne pas mettre de produit physique en
`published` avant B2.

1. **Relever `zabelie_solvency_report()`** — impossible avant `0033`, donc
   relever d'abord les trois requêtes brutes de `docs/17` §6 comme référence.
2. **Preview — groupe A**, puis vérification (§ ci-dessous).
3. **Preview — groupe B1**, puis vérification.
4. **Preview — groupe B2**, revue séparée, puis vérification.
5. **Production — A**, vérification, **puis B1**, vérification, **puis B2**,
   aux heures creuses. Jamais deux groupes dans la même fenêtre.

## 🔒 Avant tout déploiement Preview

Vérifier que l'environnement Preview est **protégé par mot de passe** (Vercel →
Deployment Protection) et en **`noindex`**.

Une URL Vercel qui affiche « Zabelie » avec un formulaire d'inscription vendeur
fonctionnel circule vite dans un groupe WhatsApp — et on se retrouverait avec
de **vrais vendeurs sur un environnement de test**, donc de vraies commandes et
de vrais fonds à démêler.

## Vérification post-migration

```sql
-- 1. Les 7 migrations sont présentes.
select count(*) filter (where proname = 'zabelie_record_manual_payout') as m0032,
       count(*) filter (where proname = 'zabelie_solvency_report')      as m0033,
       count(*) filter (where proname = 'zabelie_request_payout')       as m0034,
       count(*) filter (where proname = 'zabelie_reserve_stock')        as m0036,
       count(*) filter (where proname = 'zabelie_consume_stock_strict') as m0038
  from pg_proc;
-- Attendu : 1 partout.

-- 2. La taxonomie est en place (16 / 74 / 33, dont 4 départements actifs).
select level, count(*), count(*) filter (where active) as actifs
  from zabelie_categories group by level order by level;

-- 3. Le TTL de réservation est bien à 120 min (0038).
select key, value from zabelie_stock_limits;

-- 4. ⚠️ LE CONTRÔLE QUI COMPTE — le registre est-il intact ?
select zabelie_solvency_report();
-- `ok` doit être true ET `du_total_htg` doit être IDENTIQUE à sa valeur
-- relevée AVANT la migration. Un écart = arrêt immédiat.

-- 5. Aucune commande n'a changé d'état pendant la migration.
select status, count(*) from orders group by status order by 1;

-- 6. Aucune rupture de stock en attente de remboursement (doit être vide).
select * from zabelie_stock_ruptures;
```

**Relever `zabelie_solvency_report()` AVANT d'appliquer quoi que ce soit** —
c'est la référence de comparaison. Sans elle, le contrôle 4 ne prouve rien.

## Test fonctionnel sur Preview (avant production)

1. Un achat de produit **digital** de bout en bout → doit fonctionner
   exactement comme avant (le money-path ne change pas pour lui).
2. `/admin/paiements-vendeurs` s'affiche, le total « dû » correspond au
   `du_total_htg` du rapport.
3. Le formulaire de retrait apparaît dans le tableau de bord vendeur.

## Ordre d'ouverture — point de cohérence

Chaque commande physique **crédite le registre vendeur**. Brancher le checkout
avant que la voie de sortie ne soit livrée augmenterait mécaniquement l'encours
détenu sans moyen de le rendre.

→ **Groupe A avant B2**, et les deux en production avant l'ouverture aux
vendeurs physiques. Ne jamais appliquer `0036`-`0038` sans le groupe A.

### Séquence complète jusqu'à l'ouverture

| # | Étape | Dépend de |
|---|---|---|
| 1 | Trois requêtes d'encours sur la prod | **rien — aujourd'hui** |
| 2 | Apurement manuel + décision « suspendre ou non » | résultat de 1 |
| 3 | Fusion de la PR #52 | — |
| 4 | Preview puis production : **B1** — débloque la saisie des fiches | 3 |
| 5 | Saisie manuelle des premières fiches vendeurs (non publiées) | 4 |
| 6 | Preview puis production : **groupe A** | 3 |
| 7 | Comparaison `zabelie_solvency_report()` avant/après | 6 |
| 8 | Revue séparée puis application de **B2** | 2 et 7 |
| 9 | Domaine sur Vercel, publication des fiches, ouverture | 8 |

⚠️ **Avant l'étape 9, une impasse reste ouverte** : l'acheteur d'un produit
physique voit dans `/mes-achats` une commande figée sur `paid`, sans action ni
information — le bouton de téléchargement mensonger a été retiré, rien ne l'a
remplacé. `delivered` n'est atteignable que par la route de téléchargement : il
n'existe **aucun état d'expédition**. Ce n'est pas un défaut d'affichage, c'est
une machine à états sans sortie pour cette catégorie — et c'est une page que
voit quelqu'un **qui a déjà payé**. Elle passe donc avant tout travail de
confort (état vide de recherche compris), et elle se traite avec la question de
la maturation liée à la remise : un escrow qui mûrit au chronomètre paie le
vendeur d'une pièce détachée sept jours après le paiement, qu'elle ait changé
de mains ou non.

**Le code cesse d'être le chemin critique à l'étape 7.**

## En cas de problème

Les fonctions sont remplacées par `create or replace` : le retour arrière
consiste à ré-exécuter la **version précédente** de la fonction —
`0027_coupon_consume_on_confirm.sql` pour `confirm_payment`,
`0006_escrow_maturation.sql` pour `refund_order`,
`0024_p0_hardening.sql` pour `zabelie_expire_stale_payment`.

Les tables ajoutées (`zabelie_categories`, variantes, stock…) ne gênent
personne si elles restent inutilisées : aucun retour arrière nécessaire.
