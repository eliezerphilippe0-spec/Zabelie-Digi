# 33 — Zones : localisation déclarative (Phase 1)

> Statut : **ARBITRÉE le 2026-08-13** — proposition du porteur, revue contre
> l'état réel du dépôt, recommandations de la revue acceptées en bloc
> (signal porteur « oui »). Chaque arbitrage reste rouvrable À BAS COÛT tant
> que `0069` n'est pas appliquée en production.
>
> Dépendances réelles : `0014` (`profiles.region_code`, ISO-3166-2) ·
> `0035`/`0052` (le PRÉCÉDENT de forme des libellés, PAS une dépendance
> géographique — voir §1). Hors périmètre : GPS/PostGIS, tri par distance,
> frais de livraison (Phase 2, chantier séparé).

## 0. Objectif

Le vendeur déclare sa zone — Département → Commune → Quartier + point de
repère — et l'acheteur filtre vendeurs/produits par zone. **Sans aucune
permission navigateur, fonctionnel en 2G.** Granularité maximale : le
quartier. Aucune coordonnée exacte n'existe dans le schéma — c'est le
garde-fou vie privée **par construction**, pas par policy.

## 1. Prémisses corrigées par la revue (2026-08-13, mesurées)

La proposition initiale portait cinq prémisses périmées ou piégées :

1. **`zabelie_vendors` n'existe pas.** Le vendeur est un `profiles`
   (`role = 'creator'`). Les colonnes vont sur `profiles` — qui est en
   **lecture publique intégrale** (`profiles_public_read`, `0002`) avec
   auto-modification. Conséquence : l'affichage acheteur est gratuit, mais un
   acheteur peut techniquement se poser une zone ; l'UI ne rend ces champs
   que dans le Seller Center et ne les affiche que sur les fiches vendeur.
2. **La collision « départements ».** `0035` = `zabelie_categories`, les
   **rayons du catalogue** (les « 16 départements » de `docs/16` sont des
   rayons de magasin). La couche géographique existante est `0014` :
   `profiles.region_code` (`HT-ND`…, 10 départements ISO-3166-2) qui
   alimente `analytics_geo_ht`, la carte admin des talents.
3. **Numéro : `0069`** (« 0057 » était pris depuis le 2026-08-11). Code
   d'erreur `ZB069` (la convention lie le code au numéro). Première
   instruction : `select zabelie_migration_garde('0069_zones.sql');`.
4. **Pas de RPC `zabelie_get_zones`** : une taxonomie publique se lit par
   `select` direct sous RLS, comme `zabelie_categories` (chemin déjà sondé
   par `/api/readyz`). Une fonction de moins à révoquer et croiser.
5. **`name text` mono-langue contredisait le précédent** — voir Z-D.

## 2. Arbitrages (tranchés le 2026-08-13)

| # | Question | Décision |
|---|---|---|
| **Z-A** | Cohabitation avec `profiles.region_code` (0014) | **Hiérarchie unique dans `zabelie_zones`**, colonne `code` ISO au niveau `depatman`. `region_code` est **conservé** (la vue analytics et la carte en dépendent) et **dérivé** de la zone déclarée par trigger — la zone est maître quand elle existe, `region_code` reste maître pour les profils sans zone. Retirer la zone n'efface pas `region_code`. |
| **Z-B** | `zone_id` à la création vendeur | **Optionnel au lancement** — l'onboarding ne gagne pas une marche (il est déjà bloqué en amont par la clé service-role). Bandeau de rappel Seller Center en PR-Z3. Le lien à un futur seuil de Trust Score reste hors périmètre. |
| **Z-C** | Ajout de quartier par les vendeurs | **Modération admin** (PR-Z4) — l'argument des graphies (Kapayisyen / Cap-Haïtien / Okap) est réel, l'auto-création produirait des doublons. Chaque mutation journalisée dans `zabelie_admin_actions` (`0055`, en production). |
| **Z-D** | Libellés des zones | **Même forme que `zabelie_categories`** : `label_kr` + `label_fr` obligatoires, `label_en`/`label_es` nullables avec repli sur `label_fr` (des toponymes se traduisent rarement). ⚠️ Graphies kreyòl du seed : best-effort agent, **en attente de relecture native** — même statut et même marquage que l'espagnol de `0052`. |
| **Z-E** | Portée du slug | **Unique par parent** (index sur `(coalesce(parent_id, uuid_nul), slug)`), pas global : deux communes peuvent porter un quartier homonyme. Les filtres s'adressent par `id`. |

## 3. Modèle livré (PR-Z1, migration `0069` — rédigée, NON appliquée)

- `zabelie_zones` : 3 niveaux `depatman → komin → katye`, garde de
  hiérarchie `ZB069` (forme de `zabelie_categories_depth_guard`), RLS
  lecture publique des **actives** seulement, écritures révoquées aux
  clients.
- `profiles.zone_id` (FK, **komin ou katye seulement** — un depatman entier
  n'est pas déclarable, `ZB069`) + `profiles.pwen_repe` (libre, ≤ 200,
  public par construction).
- Trigger `zabelie_profile_zone_sync` : la zone déclarée dérive
  `region_code` du depatman ancêtre.
- **Seed** : 10 départements (codes ISO de `0014`), 19 communes du Nord,
  5 quartiers du Cap (Centre-ville, Carénage, Haut-du-Cap, Petite-Anse,
  Bande-du-Nord). Le reste à la demande via admin.
- **Tests** `supabase/tests/zones.test.sql` (Z1→Z6) : hiérarchie nominale,
  quatre rattachements incohérents refusés, slug par parent, code ISO au bon
  niveau, dérivation `region_code` (et non-effacement au retrait), RLS anon
  lecture-des-actives/zéro-écriture. Connu-positif ET connu-négatif, règle
  du dépôt.

## 4. Plan PR restant

| PR | Contenu | Vérif |
|---|---|---|
| **PR-Z2** | Filtre catalogue par sous-arbre (3 niveaux fixes = 2 jointures, pas de CTE récursive — mesurer avant d'optimiser) | Positif ET négatif (zone vide → 0 résultat, pas d'erreur) |
| **PR-Z3** | UI vendeur (« Ki kote ou ye ? », 3 selects en cascade + pwen repè) + filtre acheteur + affichage fiche vendeur. i18n via `lib/i18n.ts` (le cliquet `i18n-chaines-en-dur` refusera toute chaîne en dur) | Parcours bout en bout avant instrumentation |
| **PR-Z4** | Admin : CRUD zones + demandes d'ajout modérées | Chaque mutation dans `zabelie_admin_actions` |

L'application de `0069` est une **zone d'arrêt** (règle dure n°5) : elle se
proposera après fusion de PR-Z1, sur signal porteur, avec répétition
prod-conforme préalable dans l'ordre réel du journal.

## 5. Phase 2 — non-fait volontaire

Geolocation API opt-in, `geography(Point)` PostGIS, tri par distance, rayons
de livraison. Prérequis : Phase 1 en production + décision sur la
structuration livraison.
