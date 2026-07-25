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

## Ordre d'application

1. **Preview** — appliquer les 7 dans l'ordre, puis dérouler la vérification.
2. Vérifier que **rien n'a bougé côté argent** (requêtes ci-dessous).
3. **Production** — même séquence, aux heures creuses.

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

→ **`0032`/`0034` (règlements et retraits) doivent être en production AVANT
l'ouverture aux vendeurs physiques**, pas après. Les appliquer dans le même lot
suffit ; ne pas appliquer `0036`-`0038` seules.

## En cas de problème

Les fonctions sont remplacées par `create or replace` : le retour arrière
consiste à ré-exécuter la **version précédente** de la fonction —
`0027_coupon_consume_on_confirm.sql` pour `confirm_payment`,
`0006_escrow_maturation.sql` pour `refund_order`,
`0024_p0_hardening.sql` pour `zabelie_expire_stale_payment`.

Les tables ajoutées (`zabelie_categories`, variantes, stock…) ne gênent
personne si elles restent inutilisées : aucun retour arrière nécessaire.
