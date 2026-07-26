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

### Étape 0 — relever l'état RÉEL de Preview avant d'appliquer

La répétition locale (Postgres neuf, `0001` → `0036` dans l'ordre) prouve que
la **séquence est cohérente**. Elle ne prouve rien sur Preview, qui n'est pas
une base neuve : les migrations y sont appliquées **à la main**, dans l'éditeur
SQL. Une peut avoir été passée en double, à moitié, hors ordre, ou un objet
créé directement. Sans point de départ connu, la checklist ci-dessous compare
des valeurs attendues à une base dont on ignore l'état — elle ne conclut rien.

Il n'existe pas de table de suivi des migrations : on sonde donc les **objets**
qu'elles créent. À exécuter sur Preview, **avant `0035`** :

```sql
select m.num, m.objet,
       case when m.present then 'PRÉSENTE' else 'absente' end as etat
from (
  values
    ('0031', 'table points_limits',
      to_regclass('public.points_limits') is not null),
    ('0032', 'colonne payouts.method',
      exists (select 1 from information_schema.columns
               where table_name='payouts' and column_name='method')),
    ('0032', '  └ fonction zabelie_record_manual_payout',
      exists (select 1 from pg_proc where proname='zabelie_record_manual_payout')),
    ('0033', 'fonction zabelie_solvency_report',
      exists (select 1 from pg_proc where proname='zabelie_solvency_report')),
    ('0034', 'table zabelie_payout_limits',
      to_regclass('public.zabelie_payout_limits') is not null),
    ('0034', '  └ fonction zabelie_request_payout',
      exists (select 1 from pg_proc where proname='zabelie_request_payout')),
    ('0034', '  └ fonction zabelie_settle_payout',
      exists (select 1 from pg_proc where proname='zabelie_settle_payout')),
    ('0034', '  └ fonction zabelie_reject_payout',
      exists (select 1 from pg_proc where proname='zabelie_reject_payout')),
    ('0035', 'table zabelie_categories',
      to_regclass('public.zabelie_categories') is not null),
    ('0036', 'table zabelie_physical_products',
      to_regclass('public.zabelie_physical_products') is not null),
    ('0036', '  └ valeur product_kind = physical',
      exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
               where t.typname='product_kind' and e.enumlabel='physical')),
    ('0037', 'confirm_payment branché sur le stock',
      exists (select 1 from pg_proc where proname='confirm_payment'
                and pg_get_functiondef(oid) like '%zabelie_consume_stock%')),
    ('0038', 'fonction zabelie_consume_stock_strict',
      exists (select 1 from pg_proc where proname='zabelie_consume_stock_strict')),
    ('0040', 'colonne products.in_stock',
      exists (select 1 from information_schema.columns
               where table_name='products' and column_name='in_stock'))
) as m(num, objet, present)
order by m.num, m.objet;
```

**Comment lire le résultat.** Les lignes `└` d'une même migration doivent être
**toutes présentes ou toutes absentes** : un mélange signale une migration
passée à moitié — le cas typique d'un script interrompu dans l'éditeur SQL — et
il faut le comprendre avant d'empiler quoi que ce soit.

### Volet 2 — les LIGNES, si les tables existent

Le volet 1 interroge des **objets** : types, tables, fonctions. Le seed insère
des **lignes**. Une base où `zabelie_categories` existe avec un seed interrompu
à mi-course passe le volet 1 comme « `0035` présente » sans que rien ne le
signale. **Si le volet 1 dit qu'une table de B1 existe, exécuter aussi :**

```sql
with attendu(quoi, n) as (
  values ('zabelie_categories niveau 1', 16),
         ('zabelie_categories niveau 2', 74),
         ('zabelie_categories niveau 3', 33),
         ('zabelie_vehicle_models',      38),
         ('zabelie_stock_limits',         1)
), reel(quoi, n) as (
  select 'zabelie_categories niveau '||level, count(*)::int
    from zabelie_categories group by level
  union all select 'zabelie_vehicle_models', count(*)::int from zabelie_vehicle_models
  union all select 'zabelie_stock_limits',   count(*)::int from zabelie_stock_limits
)
select a.quoi, coalesce(r.n, 0) as lignes, a.n as attendu,
       case when coalesce(r.n, 0) = a.n then 'ok'
            when coalesce(r.n, 0) = 0   then '⚠ ABSENT'
            when coalesce(r.n, 0) < a.n then '⚠ SEED INCOMPLET'
            else '⚠ EXCÉDENT — seed appliqué deux fois ?' end as verdict
  from attendu a left join reel r on r.quoi = a.quoi
 order by a.quoi;
```

La requête part de la **liste des attendus**, pas des données : un niveau
entièrement absent produit `0 / ⚠ ABSENT` au lieu de disparaître du résultat.
Un simple `group by` sur la table l'aurait fait disparaître — première version
écrite, défaut trouvé en la passant sur ce cas précis.

### Ce qu'une réapplication fait vraiment — vérifié, et ce n'est pas ce qu'on croyait

On a d'abord écrit qu'une réapplication « dupliquerait la taxonomie ». **C'est
faux** : `zabelie_categories.slug` est `unique`. Reproduit sur une base amputée
de la moitié de son seed, la reprise avec la version d'origine donne :

```
ERROR: duplicate key value violates unique constraint "zabelie_categories_slug_key"
DETAIL: Key (slug)=(otomobil-moto) already exists.
```

L'`insert` entier est annulé. Le danger n'est donc pas la duplication — c'est
que **la réparation est bloquée** : la base reste incomplète, silencieusement,
pendant que le volet 1 affiche « `0035` présente ».

Deuxième correction, car `do nothing` laissait un trou que le comptage ne voit
pas : une ligne au bon slug mais au contenu divergent (libellé retouché, parent
changé) était conservée telle quelle — bon NOMBRE de lignes, taxonomie fausse.
Reproduit : un `label_fr` corrompu survivait au rejeu, et la sonde validait.

Décision (2026-07-26, motivée en tête de `0035`) : les trois `insert` de
`0035` portent `on conflict (slug) do update` sur **libellés, parent, niveau,
position** — le seed est la source de vérité de la taxonomie, la réapplication
converge quel que soit le point de départ. **`active` est préservé** : c'est
une décision d'exploitation (activation par vagues), un département ouvert à la
main ne doit pas se refermer parce qu'on a rejoué une migration. Vérifié dans
les deux sens : le libellé corrompu est réparé, l'activation manuelle survit.
⚠️ Condition de revue écrite dans le fichier : le jour où une interface admin
permet de renommer une catégorie, ce `do update` devient destructeur et devra
céder la place à un contrôle d'empreinte.

`0036` garde `do nothing`, et ce n'est pas une incohérence :
`zabelie_stock_limits.value` est une **configuration** — `0038` la monte à 120
par `update`, un `do update` du seed la réinitialiserait à 30 à chaque rejeu.
Pour les modèles véhicule, la clé de conflit `(kind, make, model)` EST le
contenu. Vérifié : depuis une base amputée, la reprise ramène exactement
16/74/33 et 38 modèles, et une application de plus ne change rien.

Relever aussi, dans le même passage, le nombre de lignes des tables du
money-path (`orders`, `payments`, `wallet_transactions`) : c'est la référence
des contrôles 7 à 9.

### Trace à conserver — elle doit survivre à la session

```bash
# Référence d'AVANT, dans un fichier horodaté, pas à l'écran.
psql "$DATABASE_URL" -At \
  -c "select now(), zabelie_solvency_report();" \
  | tee "ops/solvabilite-avant-B1-$(date -u +%Y%m%dT%H%M%SZ).txt"

# Après application, même commande avec le suffixe -apres-B1.
```

Noter l'**heure exacte** (UTC) du début et de la fin de l'application dans
`OPS_TODO.md`. Si quelque chose bouge dans les jours qui suivent, c'est ce qui
permet de corréler avec les journaux Vercel et Supabase — sans cette heure, on
compare des impressions.

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
  fonctionner. **Lue et exécutée avant, pas après** — voir §B1-cron.
- `/api/checkout` appelle `zabelie_reserve_stock` **uniquement si le client
  envoie un `variantId`**. Le checkout digital n'est pas concerné. Aujourd'hui,
  un client qui enverrait un `variantId` fait échouer sa propre commande (la
  fonction n'existe pas) ; après B1 l'appel se résout normalement. B1 referme
  donc ce cas plutôt qu'elle ne l'ouvre.

## §B1-cron — `/api/stock/expire`, examiné avant de le laisser tourner

Cette route est déclarée dans `vercel.json` (`45 13 * * *`). Elle échoue
aujourd'hui — la fonction n'existe pas — et se mettra à s'exécuter **le
lendemain de B1**, sans que personne ne l'ait décidé pour elle. Une route qui
passe de « ne fait rien » à « agit sur le stock » sans avoir jamais tourné se
regarde pendant que le catalogue est vide, pas après.

### Qu'écrit-elle exactement ?

`zabelie_expire_stock_reservations()` parcourt les réservations `held` dont
`expires_at` est dépassé et, pour chacune, écrit dans **deux tables et deux
seulement** :

```sql
update zabelie_stock  set quantity_reserved  = quantity_reserved  - q,
                          quantity_available = quantity_available + q  -- total inchangé
update zabelie_stock_reservations set status = 'released'
```

**Aucun `delete`.** La formulation « supprime des lignes selon un TTL » est
inexacte : rien n'est supprimé, un statut est basculé et une quantité est
déplacée d'une colonne à l'autre. L'invariant de stock est préservé par
construction — le total ne change pas.

Exécuté sur la répétition B1 : réservation de 2 sur 3 unités → `1 dispo / 2
réservé / total 3` ; après passage du cron → `3 dispo / 0 réservé / total 3`,
réservation à `released`, **commande inchangée (`pending`)**, aucune ligne
créée ni supprimée nulle part.

### Peut-elle atteindre `orders` par la cascade ?

Non, pour une raison structurelle et non par chance :

```
zabelie_stock_reservations.order_id → orders(id)   ON DELETE CASCADE
```

La cascade va de la table **référencée** (`orders`) vers la table
**référençante** (`zabelie_stock_reservations`) : supprimer une commande
supprime ses réservations. **Jamais l'inverse** — supprimer une réservation
n'a aucun effet sur `orders`. Et de toute façon le cron ne supprime rien.

Vérifié en base : aucune clé étrangère `zabelie_*` ne pointe vers `orders`
dans l'autre sens, et **aucun trigger** n'existe sur `zabelie_stock` ni sur
`zabelie_stock_reservations` après B1. Après B2, un trigger apparaît sur
`zabelie_stock` (`zabelie_stock_flag`, migration `0040`) — il écrit sur
`products`, toujours pas sur `orders`.

### Deux réserves, mineures mais à connaître

1. **Le `for update` n'a ni `skip locked` ni `limit`.** Un arriéré important
   sérialise la boucle et garde la transaction ouverte. Sans conséquence à
   l'échelle prévue ; à revoir si la file grossit.
2. **La route exige un secret** (`CRON_SECRET`, ou `RECONCILE_SECRET` pour un
   appel manuel). Sans variable définie, `authorize()` renvoie faux et la
   route répond 401 : le cron ne ferait rien du tout.

   Vérifier la variable une fois à la main ne protège pas dans six semaines.
   La route journalise donc **chaque passage**, y compris celui qui ne libère
   rien :

   ```
   [stock/expire] {"at":"…","issue":"termine","liberees":0,"dureeMs":20}
   [stock/expire] {"at":"…","issue":"non_autorise","secretConfigure":true}
   ```

   « N'a pas tourné » et « a tourné, rien à libérer » cessent de se
   ressembler. Même principe que le défaut observable de
   `lib/product-kind.ts` : **l'absence de signal doit être un signal.**

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
