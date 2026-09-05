# Données de test visibles sur l'accueil — à réviser par le porteur

Mesuré le 2026-09-04 en LECTURE SEULE sur la base de production
(`zabelie-digi`). Rien n'a été modifié : la règle 5 du brief interdit à l'agent
toute suppression ou édition de ligne. Les identifiants ci-dessous servent à ce
que le porteur décide lui-même.

## Requête utilisée

```sql
select p.id, p.slug, p.title, p.price_htg, p.kind, p.status,
       p.cover_url is not null as image, pr.display_name as vendeur,
       p.created_at::date as cree,
       (select count(*) from orders o
         where o.product_id = p.id and o.status = 'paid') as ventes_payees
from products p join profiles pr on pr.id = p.seller_id
order by p.status, p.created_at;
```

## Produits PUBLIÉS (les seuls que l'accueil montre) — 3 lignes, 0 image, 0 vente payée

| id | slug | titre | prix | type | vendeur | créé |
|---|---|---|---|---|---|---|
| `a306bcab-153b-42c6-9ada-722099d7d71b` | `cours-francisation-apwpm` | cours francisation | 300 HTG | service | Bebeto | 2026-08-11 |
| `48ea44af-fca3-4c4d-a0d2-42f4f35a66ce` | `fxccxfdf-fz5qs` | fxccxfdf | 0 HTG | service | Bebeto | 2026-08-22 |
| `e47bffde-6274-4905-be39-a01de1b91caf` | `appel-ak873` | appel | 10 HTG | service | Bebeto | 2026-09-03 |

Lecture : `fxccxfdf` (0 HTG, titre de clavier) est la donnée de test que le
brief cite. `appel` (10 HTG) est le produit qui a servi aux essais d'achat réel
du 2026-09-03 (`ZB-260903-…`). `cours francisation` (300 HTG) est le seul qui
ressemble à une offre ; il n'a pas d'image.

Tous trois portent la catégorie `Digital & services` : c'est la SEULE catégorie
avec un produit publié (`select category, count(*) … where status='published'`
→ `Digital & services (3)`), d'où 15 rayons sur 16 marqués « bientôt » dans le
menu (`zabelie_categories` : 16 rayons de niveau 1, 16 actifs).

## Brouillons (invisibles sur l'accueil, listés pour la trace) — 7 lignes

| id | slug | titre | prix | type | vendeur | image | créé |
|---|---|---|---|---|---|---|---|
| `d7873cf9-922a-4cfd-ae20-eee659f5db60` | `cours-du-creole-dt0ps` | cours du créole | 1200 | fichier | Bebeto | non | 2026-08-11 |
| `c69653d3-7981-4c1c-9133-ed17eee7fb3a` | `cours-du-creole-l1ksg` | cours du créole | 1200 | fichier | Bebeto | non | 2026-08-11 |
| `b50b3257-412f-4918-90ef-06fbdcbf48e5` | `cours-du-creole-rndbz` | cours du créole | 1200 | fichier | Bebeto | non | 2026-08-11 |
| `dc14a3dd-a8f9-4c9f-8a95-aa6575fef98c` | `ouin-ez6f` | ouin | 1200 | physique | Bebeto | **oui** | 2026-08-14 |
| `31e55259-7626-4bc9-b547-91d6fd895688` | `mun-x58gz` | Mun | 0 | fichier | Eliezer | non | 2026-08-22 |
| `392d12b1-f583-4f90-b2cb-64c7b0ba700d` | `danse-rouge-4s5lz` | danse rouge | 0 | fichier | Bebeto | non | 2026-08-22 |
| `f5cd0a87-f6b5-42be-9af0-5e9881df94cc` | `fxccx-osk2k` | fxccx | 0 | fichier | Bebeto | non | 2026-08-22 |

Trois brouillons identiques `cours du créole` le même jour : la trace d'un
vendeur qui a recommencé trois fois (CLAUDE.md, « le chemin vendeur n'est pas
instrumenté »). `ouin` est le seul produit de toute la base avec une image.

## Vendeurs

Deux profils ont des produits : **Bebeto** (9) et **Eliezer** (1, brouillon).
La section « Meilleurs vendeurs » de l'accueil affiche donc un seul vendeur, et
son compteur de ventes vient de `sales_count`, pas d'un paiement confirmé
(0 commande `paid` sur les 10 produits).

## Ce que la Phase 3 fera de ces données SANS y toucher

La règle des seuils (brief §4.3) masque une rangée sous 4 produits publiés et
« Meilleurs vendeurs » sous 3 vendeurs ayant chacun une vente. Avec le
catalogue d'aujourd'hui, **aucune rangée produit ne s'affichera** : l'accueil
montrera la bannière, les chips des catégories non vides (une seule), la barre
de confiance et l'appel aux vendeurs. C'est l'état honnête du catalogue, et il
est visible dès la maquette (`PLAN.md`, wireframe B).
