# 39 — Matrice d'accès table × rôle

> **C3.1 de `docs/31`.** Mesuré le **2026-08-18** contre la production
> (`ddditxykopuxxqzgkqwy`) — pas contre le harnais, pas contre le dépôt.
> Toutes les requêtes qui produisent ce document sont données au §6 : ce
> fichier se **régénère**, il ne se relit pas.

---

## 0. Ce que la demande disait, et pourquoi elle était incomplète

C3.1 demandait « une matrice table × rôle, générée depuis `pg_policies` ».
La générer a produit un document rassurant et faux, et c'est le résultat le
plus utile de ce chantier.

**`pg_policies` ne décrit qu'un tiers du système.** Trois mécanismes
indépendants décident si un rôle voit une donnée, et il faut les trois :

| Axe | Source | Ce qu'il filtre | Ce qu'il ne peut pas faire |
|---|---|---|---|
| 1. RLS activée | `pg_tables.rowsecurity` | rien par elle-même — elle met la table sous régime | dire ce que les policies autorisent |
| 2. Policies | `pg_policies` | des **LIGNES** | filtrer une colonne |
| 3. Grants | `role_table_grants`, **`column_privileges`** | des **TABLES** et des **COLONNES** | distinguer deux lignes |

Une matrice bâtie sur l'axe 2 seul dit de `profiles` : *lecture publique
totale, `USING (true)`*. C'est exact, et le contraire de la réalité — la
lecture publique de `profiles` est en fait la plus étroite du schéma, bornée
par une liste blanche de sept colonnes posée à l'axe 3.

---

## 1. Ce que l'angle mort a coûté

`0015` a posé sur `profiles` :

```sql
revoke select on profiles from anon, authenticated;
grant  select (id, role, display_name, bio, avatar_url, tier, created_at)
  on profiles to anon, authenticated;
```

Une liste blanche est une liste **fermée**. `0069` y a ajouté `zone_id` et
`pwen_repe`, `0083` `boutik_slug` — aucune n'y est entrée, et **Postgres
n'avait aucune raison de le dire** : une colonne non citée dans un grant ne
lève rien, ne journalise rien, ne ralentit rien. Elle naît invisible.

Mesuré sous le rôle `anon` réel, avec ses connus-négatifs :

| | Requête | Résultat |
|---|---|---|
| A | `getCreator`, 1re tentative (`…, zone_id, pwen_repe, boutik_slug`) | **REFUS 42501** |
| B | `getCreator`, repli (`…, zone_id, pwen_repe`) | **REFUS 42501** |
| C | `getCreatorBySlug` — `where boutik_slug = 'x'` | **REFUS 42501** |
| E | `getSellerIdsInZone` — `where zone_id in (…)` | **REFUS 42501** |
| F | `attribuerSlug` — `select boutik_slug where id = …` | **REFUS 42501** |
| D | `select id, display_name, bio, avatar_url` | PASSE |
| G | `update … set pwen_repe='x', zone_id=null where id = …` | PASSE |

Quatre chemins morts, une seule cause :

1. **`/createur/[id]` → 404 pour tout le monde**, depuis le 2026-08-14
   (déploiement de `988761d`).
2. **`/boutik/[slug]` → 404**, depuis sa naissance le 2026-08-17.
3. **Le filtre acheteur par zone → zéro vendeur, toujours.** Celui-là
   journalisait (`[zones] vendeurs introuvables`) et personne ne l'a lu : un
   avertissement qui ressemble à « cette zone est vide ».
4. **Aucune adresse de boutique attribuée depuis `0083`** — le module guette
   `42703` (colonne absente) ; le refus est `42501`.

G est le connu-négatif qui empêche de sur-conclure : `0015` n'a révoqué que le
SELECT, **enregistrer son profil a toujours marché**. Le défaut est
exactement de la taille mesurée, ni plus ni moins.

### Trois détails qui font la différence entre comprendre et croire comprendre

* **Un `where` suffit.** Citer une colonne non accordée dans un filtre fait
  refuser **toute** la requête ; elle n'a pas besoin d'être demandée en
  sortie. C'est ce qui a tué le filtre par zone et la résolution d'adresse.
* **Deux tests structurels étaient VERTS** pendant les quatre jours. Ils
  asserttaient la *présence* de la ligne `.select("…, zone_id, pwen_repe")` —
  c'est-à-dire précisément la requête refusée. Un test qui épingle le texte
  d'une requête ne peut pas dire qu'elle échoue : il la fige, et son vert
  devient une caution. (`CLAUDE.md`, « l'assertion structurelle porte sur ce
  qui COMMANDE ».)
* **Le garde RLS de C3.4 ne pouvait rien voir** : la RLS *était* active, la
  policy *était* `true`. Il lit `rowsecurity`, pas les grants. Il n'a pas
  échoué — on lui demandait autre chose.

---

## 2. La matrice, mesurée

**70 tables** dans `public` (production, 2026-08-18).

| | Nombre | Lecture |
|---|---:|---|
| Tables sans RLS | **0** | invariant tenu — gardé par `supabase/tests/rls_toutes_tables.test.sql` |
| Tables sous RLS **sans aucune policy** | **25** | fermées à `anon`/`authenticated` par construction (tables de configuration, plafonds, journaux). Le fail-closed le plus solide : rien à contourner. |
| Policies au total | **54** | dont 45 SELECT, 9 écriture |
| Policies SELECT `USING (true)` | **7** | §3 |
| Tables sous **liste blanche de colonnes** | **2** | `profiles`, `zabelie_policy_acceptances` |

### Croisement harnais / production

71 tables au harnais, 70 en production. **Le delta est une seule table,
`points_limits`**, créée par `0031` — la migration fidélité volontairement
sautée (`statut = 'abandonnee'` au registre). Le disque confirme le registre,
et le registre explique le disque : c'est le croisement que `CLAUDE.md`
réclame après l'épisode du 2026-08-17, appliqué ici sans qu'on l'ait cherché.

---

## 3. Les 7 lectures totales — une par une, avec un verdict

`USING (true)` n'est pas un défaut en soi : une vitrine se lit. Ce qui compte
est de savoir, pour chacune, **pourquoi**.

| Table | Policy | Verdict |
|---|---|---|
| `products` * | `products_public_read_published` | non listée ici : son prédicat est `status = 'published' and seller_is_active(seller_id)`, pas `true` |
| `product_reviews` | `reviews_public_read` | ✅ un avis est public par destination |
| **`profiles`** | `profiles_public_read` | ✅ **mais uniquement grâce à l'axe 3** — 7 colonnes sur 15. C'est le cas qui a motivé tout ce document. |
| `zabelie_affiliate_rates` | `zabelie_affiliate_rates_read` | ✅ barème public |
| `zabelie_flash_sales` | `zabelie_flash_read` | 🟡 expose aussi les ventes **à venir** — divulgation commerciale, pas fuite de données. À trancher, pas urgent. |
| `zabelie_physical_products` | `zabelie_physical_read` | ✅ caractéristiques d'un produit |
| `zabelie_product_fitment` | `zabelie_fitment_read` | ✅ compatibilité véhicule |
| `zabelie_stock` | `zabelie_stock_read` | 🟡 les quantités en stock sont publiques. Choix produit défendable (« plus que 2 »), à assumer explicitement. |

## 4. Les 9 policies d'écriture — la surface qu'un compte peut modifier

C'est la liste courte qui compte : hors de là, **aucune écriture directe
n'est possible** pour `anon`/`authenticated`.

| Table | Policy | `cmd` |
|---|---|---|
| `product_assets` | `assets_seller_manage` | ALL |
| `profiles` | `profiles_self_insert` · `profiles_self_update` | INSERT · UPDATE |
| `zabelie_carts` · `zabelie_cart_items` | `carts_self_all` · `cart_items_self_all` | ALL |
| `zabelie_coupons` | `coupons_seller_all` | ALL |
| `zabelie_delivery_info` | `zabelie_delivery_own_insert` · `_own_update` | INSERT · UPDATE |
| `zabelie_zone_requests` | `zabelie_zone_requests_insert_own` | INSERT |

Aucune table d'argent n'y figure — `wallets`, `wallet_transactions`,
`orders`, `payments`, `payouts`, `escrow_entries`, `platform_earnings` sont
en **lecture seule** pour un compte, et leur écriture passe par des fonctions.
C'est l'invariant qu'on veut lire ici en dix secondes.

## 5. Les listes blanches de colonnes — l'axe qu'on ne lisait pas

| Table | Rôle | Accordées | Total | Réservées |
|---|---|---:|---:|---|
| `profiles` | `anon`, `authenticated` | 7 | 15 | `country_code`, `region_code` (service_role, `/admin/geo`) · `suspended_at`, `suspended_reason`, `suspended_by` (modération) · `zone_id`, `pwen_repe`, `boutik_slug` (servies par `0084`) |
| `zabelie_policy_acceptances` | `authenticated` | 4 | 4 | — aucune |

### Pourquoi `0084` ouvre une fonction plutôt que trois grants

Le réflexe serait d'élargir la liste blanche. Il est faux : `profiles_public_read`
vaut `true` pour **toute** ligne, donc **un grant de colonne est public pour
tout le monde, acheteurs compris**. `pwen_repe` (« kay ble a bò legliz la »)
est saisi sur le même formulaire que les informations de livraison, par
n'importe quel compte. L'ouvrir rendrait le point de repère de chaque
**acheteur** lisible par le premier venu, pour réparer la fiche d'un
**vendeur**.

Un grant de colonne n'a pas de prédicat. `zabelie_boutik_public` et
`zabelie_vande_nan_zon` en ont un : *ce profil est-il un marchand* —
`role = 'creator'` **ou** au moins un produit, parce que `0015` fige le rôle
côté client et qu'un vendeur peut rester `buyer` jusqu'à promotion.

### Ce qui garde tout ça, désormais

| Garde | Ce qu'il croise | Se prouve par |
|---|---|---|
| `supabase/tests/rls_toutes_tables.test.sql` | axe 1 — aucune table sans RLS | table-témoin sans RLS (R1) |
| `supabase/tests/colonnes_liste_blanche.test.sql` | axe 3 — toute colonne est **accordée** ou **déclarée privée avec sa raison** | colonne-témoin ajoutée sans grant (L1) **et** déclaration périmée en sens inverse (L2) |
| `tests/profiles-colonnes-anon.test.ts` | le **code** × la liste blanche, lue dans `0015` et jamais recopiée | 4 mutations : filtre direct réintroduit, client de session rendu à `attribuerSlug`, `select` direct dans `creators.ts`, grant de `0015` rendu illisible |
| `supabase/tests/boutique_publique.test.sql` | le prédicat marchand de `0084` | B2 — **un acheteur ne rend rien** ; B8b — un acheteur de la zone n'en sort pas |

La déclaration de `colonnes_liste_blanche` se périme **dans les deux sens** :
elle échoue aussi quand une colonne déclarée privée a été accordée. Une liste
qui ne sait que grandir devient une conformité par usure.

---

## 6. Régénérer ce document

```sql
-- Axe 1 — tables sans RLS (doit rendre 0)
select tablename from pg_tables where schemaname='public' and not rowsecurity;

-- Axe 2 — la matrice des policies
select tablename, policyname, cmd, roles::text, qual, with_check
  from pg_policies where schemaname='public' order by tablename, cmd;

-- Axe 2 bis — les lectures totales, et les écritures
select tablename, policyname from pg_policies
 where schemaname='public' and cmd='SELECT' and btrim(qual)='true';
select tablename, policyname, cmd from pg_policies
 where schemaname='public' and cmd<>'SELECT';

-- Axe 3 — les listes blanches de colonnes (grants colonne SANS grant table)
with col as (select distinct table_name, grantee from information_schema.column_privileges
              where table_schema='public' and privilege_type='SELECT'
                and grantee in ('anon','authenticated'))
select col.* from col
 where not exists (select 1 from information_schema.role_table_grants t
                    where t.table_schema='public' and t.privilege_type='SELECT'
                      and t.table_name=col.table_name and t.grantee=col.grantee);
```

Pour éprouver un chemin réel plutôt que le lire, la forme qui a servi ici —
**avec son connu-négatif, sinon elle ne prouve rien** :

```sql
create or replace function pg_temp.essai(p_sql text) returns text
language plpgsql as $$
begin execute p_sql; return 'PASSE';
exception when others then return 'REFUS ' || sqlstate || ' — ' || sqlerrm; end $$;

set local role anon;
select pg_temp.essai('<la requête exacte du code>');
```

## 7. Ce que cette matrice ne dit toujours pas

* **`storage.objects` / `storage.buckets`** : RLS active, **zéro policy**,
  tout passe par la clé de service (`docs/38` §5). Hors du schéma `public`,
  donc hors de tous les comptages ci-dessus.
* **Les fonctions `security definer`** ne sont pas dans cette matrice. Elles
  sont une quatrième surface : `zabelie_biz_get_invoice_by_token`,
  `seller_is_active`, et depuis `0084` `zabelie_boutik_public` et
  `zabelie_vande_nan_zon` sont exécutables par `anon`. Leur garde est leur
  prédicat interne, pas une policy — un inventaire reste à écrire.
* **C3.2 — les tentatives vendeur A → données de B** ne sont pas ici : elles
  sont un chantier à part, encore ouvert dans `docs/31`.
* Rien ici n'atteste la chaîne complète **jeton → PostgREST → policy**. Les
  tests exercent le moteur de privilèges avec une identité choisie
  (`set local role`), aucun JWT n'est émis ni vérifié — écart déjà nommé dans
  `docs/24-API-V1.md`.
