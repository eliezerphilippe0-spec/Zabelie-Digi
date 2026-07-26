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
| **B1** | `0035` · `0036` | Taxonomie, produits physiques, stock | non |
| **B2** | `0037` · `0038` · `0040` | Branchement stock ↔ money-path | **oui** |

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

**Le code cesse d'être le chemin critique à l'étape 7.**

## En cas de problème

Les fonctions sont remplacées par `create or replace` : le retour arrière
consiste à ré-exécuter la **version précédente** de la fonction —
`0027_coupon_consume_on_confirm.sql` pour `confirm_payment`,
`0006_escrow_maturation.sql` pour `refund_order`,
`0024_p0_hardening.sql` pour `zabelie_expire_stale_payment`.

Les tables ajoutées (`zabelie_categories`, variantes, stock…) ne gênent
personne si elles restent inutilisées : aucun retour arrière nécessaire.
