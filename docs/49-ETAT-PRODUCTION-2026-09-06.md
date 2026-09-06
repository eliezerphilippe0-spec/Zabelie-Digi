# Zabelie — état de la production au 2026-09-06

Relevé mesuré en **lecture seule** sur la base de production
(`ddditxykopuxxqzgkqwy`) le 2026-09-06 vers 18:40 UTC, plus les alertes du
*database linter* Supabase. Aucune écriture.

Ce document ne remplace pas `docs/48-CHIFFRES-REELS-2026-09-05.md`, écrit la
veille : il consigne **ce qui a bougé en un jour** et **ce que 48 ne regardait
pas** (la sécurité du projet, le remplissage des rayons, l'ancienneté du
litige). Pour les chiffres de fond — personnes, catalogue, entonnoir,
invariant comptable — c'est 48 qui fait foi.

---

## ⚠️ Ce que ce relevé N'EST PAS

Le porteur a demandé : « je te donne le lien de Zabelie, regarde si tout est
ok ». **Le site n'a pas pu être ouvert.** Trois voies, trois refus, mesurés :

| Voie | Résultat |
|---|---|
| `WebFetch https://zabelie.com/` | `EGRESS_BLOCKED` — domaine refusé par le proxy de sortie |
| Service de scraping hébergé (Firecrawl) | clé invalide ou révoquée |
| Lancer le site en local contre la base réelle | `curl` vers `…supabase.co` → `CONNECT tunnel failed, 403` |

Donc : **rien ici ne dit si le site répond, s'il sert bien le dernier `main`,
ce que les pages rendent, ni si les crons Vercel tournent.** C'est exactement
la limite consignée dans `docs/45` — un relevé qui n'a ouvert aucune page — et
elle est répétée ici pour qu'aucun lecteur pressé ne prenne ce document pour
une inspection du site.

Ce qui suit décrit **ce que la base a à montrer**, pas ce qu'un visiteur voit.

---

## 1. Ce qui a changé depuis hier — et c'est une bonne nouvelle

`docs/48` comptait, le 2026-09-05 : **7 paiements `failed`** et **7 `pending`**.
Aujourd'hui :

| Statut | Rail | Nombre | Référence opérateur |
|---|---|---|---|
| `failed` | moncash | **14** | **0** |
| `confirmed` | gratis | 1 | 1 |

**Zéro `pending`.** Les sept en attente sont passés à `failed` en moins de
vingt-quatre heures, sans intervention humaine. C'est la signature de
`zabelie_expire_stale_payment` (48 h), appelée par `/api/reconcile`.

> ### C'est une PREUVE D'EXÉCUTION, et il en existait très peu.
>
> `CLAUDE.md` distingue depuis août « un appelant existe » et « le cron
> tourne » : le croisement `tests/crons-appelants.test.ts` prouve le premier,
> et il est explicitement écrit qu'il ne prouve pas le second — secret absent,
> déploiement non promu, crons désactivés le laisseraient vert. Ici, un état
> observé a changé tout seul, dans la fenêtre attendue, dans le bon sens.
> **Le réconciliateur tourne pour de bon en production.**

C'est le seul élément de ce document qui atteste qu'une partie de
l'infrastructure fonctionne réellement, et pas seulement qu'elle est déployée.

---

## 2. Ce qui n'a pas changé : aucun paiement n'aboutit

Quatorze tentatives MonCash entre le 11 août et le 3 septembre, **toutes
échouées**, et **aucune n'a jamais reçu de référence opérateur**
(`provider_ref` nul sur les 14). Le seul paiement confirmé de l'histoire de
Zabelie porte sur un produit à **0 gourde**, via le rail `gratis`.

Le 3 septembre, **six tentatives d'affilée** sur la même fiche à 10 HTG. Ça ne
se lit pas comme un essai technique : ça se lit comme quelqu'un qui réessaie.

**L'instrument de diagnostic existe désormais** : `/api/admin/moncash-verify`
(PR #214, fusionnée le 2026-09-06) distingue six verdicts — clé absente, mode
ambigu, injoignable, identifiants refusés, bac à sable, ok — et ne renvoie
jamais le secret. Il attend les identifiants de production, qui sont côté
porteur.

---

## 3. Le litige du 22 août est ouvert depuis quinze jours

| Champ | Valeur |
|---|---|
| Commande | `c797080d…` — « fxccxfdf », 0 HTG, rail `gratis` |
| Statut commande | `disputed` |
| Suivi de remise | **`action_required`** depuis le **2026-08-22** |
| Ancienneté | **15 jours** |
| Escrow | `maturing`, **gelé** (`gated_on_delivery = true`), 0 HTG, échéance passée le 29 août |

Aucun argent n'est en jeu — le montant est nul. Mais **c'est le seul parcours
complet jamais réalisé sur Zabelie**, du paiement confirmé jusqu'à la machine
de remise, et il est resté en plan. La mécanique a fait exactement ce qu'elle
devait : elle a gelé l'escrow et attendu une décision humaine. Personne n'est
venu.

Ce n'est donc pas un défaut de code. C'est un défaut d'**exploitation** : rien
ne signale au porteur qu'une remise réclame une action. `RESEND_API_KEY` n'est
pas posée, donc l'alarme du chemin de l'argent n'a personne à qui parler.

---

## 4. Soixante-douze rayons actifs sur soixante-treize sont vides

| Niveau | Rayons actifs | Sans **aucun** produit publié |
|---|---|---|
| 1 — départements | 16 | **15** |
| 2 | 10 | **10** |
| 3 | 47 | **47** |
| **Total** | **73** | **72** |

Un seul rayon du site contient quoi que ce soit. Un visiteur qui clique
ailleurs — n'importe où ailleurs — tombe sur une page vide.

La revue d'accueil du 2026-08-10 avait déjà nommé le symptôme (« bientôt » est
le mot le plus répété du premier écran, UX-05) et `OPS_TODO` porte le SQL de
repli à 4 départements. Ce qui est nouveau ici, c'est la **mesure** : le
problème n'est pas « quelques rayons en avance », c'est 72 sur 73.

⚠️ **Et il vient de s'aggraver d'un cran, volontairement.** Les trois rayons de
recharge ouverts par `0098` le 2026-09-06 sont, eux aussi, vides — décision du
porteur, prise en connaissance de cause. La section est prête et attend son
premier vendeur.

---

## 5. Sécurité du projet — le *linter* Supabase

Relevé le 2026-09-06 à 18:37 UTC. Deux points méritent une décision, le reste
est du bruit connu.

### 5.1 À corriger : protection des mots de passe compromis désactivée

Supabase Auth sait refuser un mot de passe figurant dans les fuites connues
(HaveIBeenPwned). **La fonction est désactivée.** C'est un réglage du tableau
de bord, pas du code, et il vaut cher sur ce terrain : le premier vendeur qui
réutilise un mot de passe éventé donne l'accès à son registre de ventes.

### 5.2 À vérifier une par une : quatre `SECURITY DEFINER` ouvertes à `anon`

| Fonction | Lecture |
|---|---|
| `zabelie_boutik_public(uuid,text)` | point public **voulu** — la fiche d'une boutique (`0084`) |
| `zabelie_biz_get_invoice_by_token(text)` | point public **voulu** — le jeton EST la garde |
| `zabelie_vande_nan_zon(uuid[])` | point public **voulu** — les marchands d'une zone (`0084`) |
| **`seller_is_active(uuid)`** | ⚠️ **à examiner** — quelle garde ? |

La règle du dépôt dit : « aucune fonction `SECURITY DEFINER` exposée à `anon`
**sans garde** ». Trois de ces quatre ont leur garde dans leur raison d'être ;
la quatrième n'a pas été examinée sous cet angle. Ce n'est pas une faille
constatée, c'est une vérification qui n'a pas été faite.

### 5.3 Le bruit, et pourquoi c'en est

- **26 tables « RLS activée, aucune policy »** (`INFO`). Ce sont les tables de
  configuration et de mécanique interne (`zabelie_*_config`, `_limits`,
  `zabelie_outbox`, `zabelie_rate_limits`, le registre de migrations…). Elles
  sont écrites en `service_role` uniquement, et l'absence de policy est
  précisément ce qui les ferme à `anon` et `authenticated`. Le harnais
  `supabase/tests/rls_toutes_tables.test.sql` vérifie que **toutes** les tables
  publiques portent la RLS — il passe.
- **`pg_trgm` installé dans le schéma `public`** (`WARN`). Cosmétique.

---

## 6. Ce qu'il faudrait faire, dans cet ordre

1. **MonCash.** Rien d'autre ne compte tant qu'une gourde ne passe pas.
   `/api/admin/moncash-verify` attend les identifiants de production.
2. **Nettoyer ce que le public voit.** Deux des trois fiches publiées sont des
   essais (« fxccxfdf » 0 HTG, « appel » 10 HTG). Il reste alors **une** offre :
   « cours francisation », 300 HTG — et elle n'a pas de photo.
3. **Clore le litige du 22 août**, et poser `RESEND_API_KEY` pour qu'un
   prochain reste moins de quinze jours sans être vu.
4. **Décider des rayons vides** : les refermer, ou les remplir. La troisième
   voie — les laisser ouverts et vides — est celle qu'on suit depuis le 9 août.

---

## Reproduire ce relevé

```sql
-- Paiements, par statut et par rail, avec la référence opérateur
select status, rail, count(*),
       count(*) filter (where provider_ref is not null) as avec_reference_operateur
  from payments group by status, rail order by 3 desc;

-- Le litige et son escrow
select f.order_id, f.status, f.created_at::date,
       (now()::date - f.created_at::date) as jours_ouvert,
       e.status, e.gated_on_delivery, e.amount_htg
  from zabelie_fulfillment f left join escrow_entries e on e.order_id = f.order_id;

-- Rayons actifs sans aucun produit publié
select c.level, count(*) as actifs,
       count(*) filter (where not exists (
         select 1 from products p where p.status = 'published'
           and (p.category_id = c.id or p.category = c.label_fr))) as vides
  from zabelie_categories c where c.active group by c.level order by c.level;
```

Les alertes de sécurité se relisent avec `get_advisors` (type `security`) sur
le projet, ou depuis l'onglet *Advisors* du tableau de bord Supabase.
