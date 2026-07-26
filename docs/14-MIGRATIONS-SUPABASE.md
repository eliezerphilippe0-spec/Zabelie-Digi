# Appliquer de nouvelles migrations à la base Supabase (prod)

> **Pour qui ?** Le porteur, sans compétence technique requise. Ce guide sert à
> **mettre à jour une base Supabase qui contient déjà des données** (prod), quand
> de nouvelles migrations ont été fusionnées dans `main`.
>
> ⚠️ **Ne pas confondre avec `docs/04-DEPLOIEMENT.md §1`** : celui-ci décrit la
> **première** installation sur une base **vide** (on y colle tout `schema.sql`).
> Ici, la base existe déjà — on n'applique QUE les migrations **nouvelles**, une
> par une, jamais tout le schéma (sinon erreurs « already exists »).

Une migration = un fichier `supabase/migrations/00XX_*.sql`. Ces fichiers sont
**numérotés** et doivent être appliqués **dans l'ordre**, **une seule fois
chacun**. Les migrations Zabelie sont **additives** (elles ajoutent des
colonnes/tables) : elles ne suppriment ni ne modifient les données existantes.

---

## 0. Le bon projet — le point le plus important

Il existe **deux** projets Supabase distincts. **Ne jamais les confondre.**

| Projet | Référence (dans l'URL) | À toucher ? |
|---|---|---|
| **Zabelie** (produits digitaux — CE projet) | `ddditxykopuxxqzgkqwy` | ✅ OUI |
| Zabelie 1 (produits physiques, projet séparé) | `oqntexkpecuqgvbeqaiq` | ⛔ **JAMAIS** |

Ouvre [app.supabase.com](https://app.supabase.com) → **sélectionne Zabelie**
→ vérifie la référence dans l'URL avant toute action.

> 💾 Recommandé avant une migration : `Database → Backups` (regarde/déclenche une
> sauvegarde), et opère à un moment calme (peu de trafic).

---

## 1. Ouvrir l'éditeur SQL

Menu de gauche → **SQL Editor** → **+ New query**. C'est ici qu'on colle et
exécute le SQL (bouton **Run**).

---

## 2. Diagnostic : qu'est-ce qui est déjà appliqué ?

Colle cette requête (elle **lit seulement**, ne change rien) et clique **Run**.
Elle teste la présence d'un objet créé par chaque migration récente :

```sql
select
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='products'
          and column_name='delivery_days')                    as migration_0020,
  to_regclass('public.points_balances')       is not null     as migration_0021,
  to_regclass('public.zabelie_biz_professionals') is not null as migration_0022;
```

- **`false`** → migration **pas encore appliquée** → à faire (étape 3).
- **`true`** → déjà appliquée → **la sauter**.

> Pour une **future** migration `00XX`, adapte la requête en testant un objet
> qu'elle crée (une table via `to_regclass('public.<table>')`, ou une colonne
> via `information_schema.columns`). Le nom de l'objet se lit en haut du fichier.

---

## 3. Appliquer chaque migration manquante, DANS L'ORDRE

Pour **chaque** migration à `false`, du plus petit numéro au plus grand :

1. Ouvre le fichier sur GitHub (branche `main`) :
   `github.com/eliezerphilippe0-spec/uniondigitale/blob/main/supabase/migrations/<fichier>.sql`
2. Clique l'icône **« Copy raw file »** (en haut à droite de l'affichage du
   fichier) → tout le contenu est copié.
3. Dans Supabase : **SQL Editor → + New query → colle → Run**.
4. Résultat attendu : **« Success. No rows returned »** (normal : une migration
   ne renvoie pas de lignes).
5. Migration suivante.

> 🔑 **Une seule exécution par migration.** Ces fichiers ne sont **pas**
> ré-exécutables : les relancer donne des erreurs « … already exists ». Utilise
> toujours le diagnostic (étape 2) pour savoir lesquelles lancer.

---

## 4. Vérifier

Relance la requête de l'**étape 2** : toutes les lignes concernées doivent
maintenant être **`true`**. ✅

---

## 5. Migrations actuellement en attente (au 2026-07-13)

La prod est à `0019`. Trois migrations sont fusionnées dans `main` mais **pas
encore appliquées** — à passer dans cet ordre :

| Fichier | Ce que ça active | Effet sur les données |
|---|---|---|
| `0020_service_fields.sql` | Champs d'affichage de la **page service** (délai, « ce qui est inclus ») | Ajoute 2 colonnes à `products`. Aucun prix touché. |
| `0021_points_rewards.sql` | **Points & fidélité** (non monétaire, cf. `docs/BRH-question-fidelite.md`) | Ajoute des tables. Rien de supprimé. |
| `0022_business_v1.sql` | **Zabelie Business — « Fè m peye »** (facture + paiement, cf. `docs/13`) | Ajoute des tables + fonctions. N'altère **aucune** table money-path existante. |

> Appliquer `0020`/`0021` **active aussi** la page service et les points : leur
> code est déjà en ligne (Vercel), il n'attendait que ces tables.

---

## 6. Tester après coup

Sur le site déployé, connecte-toi et va sur **`/pro`** → l'écran « Ouvre ton
espace pro » doit s'afficher. Crée un client + une facture test, envoie-la,
ouvre le lien de partage → le portail client s'affiche. Aucune nouvelle variable
d'environnement n'est nécessaire (MonCash est déjà branché).

---

## 7. En cas de problème

| Message | Signification | Que faire |
|---|---|---|
| `Success. No rows returned` | ✅ migration appliquée | Passer à la suivante |
| `… already exists` | migration **déjà** appliquée | L'ignorer, passer à la suivante |
| Toute **autre** erreur | anomalie réelle | **S'arrêter**, copier le message complet, le transmettre avant de continuer |

> En cas d'erreur au milieu d'un fichier, ne relance pas le fichier « pour voir »
> tant que la cause n'est pas comprise : une partie a pu s'appliquer. Le
> diagnostic (étape 2) et le message d'erreur permettent de reprendre proprement.
