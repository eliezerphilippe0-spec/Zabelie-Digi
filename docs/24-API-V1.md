# API v1 — contrats de lecture « tool-ready »

> **Statut : en construction.** Commit 1/7 (contrats) et la preuve d'isolation
> RLS sont faits ; aucun handler n'existe encore sous `app/api/v1/`.
>
> ⚠️ **Écart de nommage assumé.** Le brief demandait `docs/08-API-V1.md` ;
> `docs/08-INSPIRATION-P1.md` occupe déjà ce numéro. Renommer si le porteur
> préfère.

## Ce que cette couche est

Des contrats de **lecture seule**, strictement typés, destinés à être
consommés aujourd'hui par la marketplace et demain par un agent **sans
réécriture**. La règle d'architecture cible :

> L'agent décide, les tools exécutent, le backend Zabelie reste l'autorité.

## Ce que cette couche n'est pas

Aucun appel à un modèle, aucun orchestrateur, aucun widget. **Aucun tool
d'écriture** : pas de panier, pas de commande, pas de dossier de support.
L'écriture reste dans l'interface existante.

---

## ⚠️ Écart au §6 du brief — l'isolation RLS n'a PAS été testée sous vrai JWT

**À lire avant de citer cette PR comme conforme.** Cette section est
volontairement placée avant les endpoints : elle décrit une limite, pas un
détail d'implémentation.

### Ce qui est fait

`supabase/tests/orders_rls_isolation.test.sql` exerce les policies **réelles**
de `orders` — celles lues dans `pg_policies` de la production le 2026-08-02 —
sur un PostgreSQL 16 avec les migrations appliquées. Six cas :

| # | Cas | Attendu |
|---|---|---|
| 1 | l'acheteur lit sa commande | 1 ligne |
| 2 | l'acheteur lit celle d'un autre | **0 ligne** |
| 3 | un tiers sans lien lit tout | 0 ligne |
| 4 | le **vendeur** lit les commandes de son produit | **2 lignes** |
| 5 | vendeur + filtre `buyer_id = auth.uid()` | 0 ligne |
| 6 | écriture sous rôle `authenticated` | refusée |

Éprouvé par trois mutations, chacune tombant sur le cas visé : retirer
`orders_buyer_read` → cas 1 ; la rendre `using (true)` → cas 2 ; retirer
`orders_seller_read` → cas 4.

### Ce qui n'est pas fait

**Aucun JWT n'est émis, signé ni vérifié.** `auth.uid()` est un **stub** qui
lit un réglage de session (`supabase/tests/_bootstrap.sql`). Ce qui est exercé
est le **moteur de policies** avec une identité choisie — pas la chaîne
complète « jeton GoTrue → PostgREST → policy ».

Ce n'est pas une conformité au §6. C'est une preuve plus étroite, dont la
portée exacte est écrite ci-dessus.

### Pourquoi

Le test réel exige une branche Supabase, réservée au plan Pro — constaté le
2026-08-02 : `PaymentRequiredException — Branching is supported only on the
Pro plan or above`. La branche elle-même coûte **0,01344 $/heure** ; c'est
l'abonnement mensuel qui a été jugé un mauvais échange pour protéger un chemin
que personne n'emprunte : **0 commande, 0 produit, 1 profil** en base.

L'alternative — écrire des commandes fictives en production — a été écartée :
`orders` est liée au registre financier, et la première commande de ce registre
serait un faux. `docs/22-PREMIERE-COMMANDE-REELLE.md` existe pour l'éviter.

### Quand ça se ferme

**`OPS_TODO.md` § Conditions d'ouverture**, à lever avant la première
transaction réelle — pas une tâche flottante, une condition avec un moment de
fermeture nommé.

---

## Ce que le test RLS a imposé au code

Le cas 4 n'est pas décoratif. `orders` porte **deux** policies de lecture :

```
orders_buyer_read   → auth.uid() = buyer_id
orders_seller_read  → le vendeur du produit voit la commande
```

La seconde est légitime. Mais elle signifie que **la RLS seule ne suffit pas**
à honorer « mes commandes » : un vendeur qui appellerait `get_user_orders`
recevrait ses **ventes** sous une étiquette qui annonce ses **achats**.

> **Règle pour les handlers** : `get_order` et `get_user_orders` filtrent
> `buyer_id = auth.uid()` **explicitement**, en plus de la RLS. Le cas 5 du
> test constate que ce filtre donne bien 0.

## Ce que les sorties n'exposent jamais

Vérifié par assertion sur la forme de l'objet validé, pas à l'œil
(`tests/api-v1-schemas.test.ts`) : `commission`, `commissionHtg`,
`commissionBps`, `cashback`, `points`, `netHtg`, **`role`**.

`role` a rejoint la liste sur constat : `profiles_public_read` a pour prédicat
`true`, donc la base laisse voir le rôle. Que la base le laisse voir n'oblige
pas l'API à le relayer — `get_seller` expose le **tier**, qui décrit une
relation commerciale publique, jamais le **rôle**, qui décrit un privilège
interne.

## Statuts de commande — ce qui existe vraiment

Constaté dans `pg_enum` de la production le 2026-08-02, pas lu dans les
fichiers de migration :

- `order_status` **existe** : `pending, paid, delivered, cancelled, refunded,
  disputed`. C'est lui que `get_order` rend.
- `fulfillment_status` **n'existe pas**. `0043` n'est pas appliquée — le
  registre saute de `0042` à `0045`, et `zabelie_fulfillment_notices` est
  absente.

En conséquence, le champ d'expédition est **absent** des sorties, et non `null`.
`null` dirait « pas d'expédition » ; l'absence dit « cette base ne sait pas
encore répondre ». Les confondre est exactement ce qu'un modèle rapporterait
de travers.

## Endpoints

*(à compléter au fil des commits 3 à 7 — entrée, sortie, erreurs, et une phrase
sur ce que l'endpoint NE fait pas.)*
