# La première commande réelle

> **Ce document vaut plus que le prochain contrôle automatisé.**
> Quinze tests SQL ne diront pas ce que cette commande dira : elle est la
> seule chose de tout le chantier qui n'a **jamais traversé la production**.

## Pourquoi maintenant, et pourquoi ça ne dépend de rien

Un seul préalable, et il est **décisionnel, pas technique** : D-4, le sens de
l'arrondi de la commission (voir l'ordre ci-dessous). Il tient au fait que le
registre est append-only. **Ni B2, ni B3, ni le reste des migrations en
attente.** Un produit
**digital ou service** suffit : ce flux est complet en production depuis
longtemps, et il emprunte exactement les mêmes rails que le physique jusqu'au
crédit du vendeur.

Ce qu'une seule commande à 25 HTG éprouve, et qu'aucun test ne peut éprouver :

| Ce qui n'a jamais tourné en production | Pourquoi les tests ne suffisent pas |
|---|---|
| `order_ref` sur une vraie ligne | Le backfill a touché **0 ligne**. Le trigger n'a jamais généré de numéro en production. |
| `zabelie_solvency_report()` sur des données **non nulles** | `ok=true` sur zéro ligne prouve que la fonction s'exécute, pas qu'elle calcule juste (`OPS_TODO`). |
| Maturation d'escrow J+7 | Aucune entrée n'a jamais existé. |
| Webhook MonCash **réel** | Le sandbox n'est pas la production : signatures, délais, reprises. |
| L'identité comptable de `0033` | Elle n'a jamais été vraie sur autre chose que des zéros. |
| `/mes-achats`, e-mails, facture | Jamais rendus avec une vraie commande. |
| **La carte de partage WhatsApp** | Jamais testée. Cache persistant : à vérifier **avant** que des liens circulent. |

## Ordre — les variables d'abord, sinon le cache fige le mauvais aperçu

0. **Trancher D-4** — le sens de l'arrondi (`docs/02`). Irréversible dans les
   faits : le grand livre est append-only, donc toute ligne écrite avant porte
   l'ancienne règle pour toujours. Si la réponse est `floor` : appliquer
   `0044_commission_floor.sql`, passer `ROUNDING_IN_FORCE` à `"floor"` dans
   `lib/commission.ts`, redéployer — **les trois ensemble**, sinon
   l'estimation affichée au vendeur promet une gourde de plus que ce que la
   base crédite. Puis inscrire l'empreinte au registre `0041`. Si la réponse
   est `round` : rien à faire.
1. **`NEXT_PUBLIC_SITE_URL`** dans Vercel (Production), puis **redéployer**.
   Sans elle, `lib/site-url.ts` retombe sur le domaine `*.vercel.app` et
   l'aperçu WhatsApp le fige. Facultatif mais souhaitable au même moment :
   `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM=1` (vérifier d'abord que les
   transformations d'image sont incluses dans le plan Supabase).
2. **Publier un produit digital ou un service** à petit prix — 25 HTG suffit.
   Par `/vendre`, avec une photo : elle éprouve aussi le bucket `0039` et
   l'affichage des visuels, tout juste branchés.
3. **Ouvrir la fiche et relever son `og:image`** avant tout partage.
4. **S'envoyer le lien sur WhatsApp** — un seul. Attendu : vignette 1200×630
   avec titre et prix, titre portant le nom du produit et son prix.
5. **Acheter depuis un SECOND compte**, avec un vrai paiement MonCash.
   Voir §« Deux pièges connus » ci-dessous — ce point n'est pas neutre.
6. **Relever immédiatement** les contrôles ci-dessous.

## Deux pièges connus — vérifiés dans le code avant l'essai

### 1. Acheter son propre produit : rien ne l'empêche

Avec un seul compte en base, on serait acheteur **et** vendeur. Vérifié :
`app/api/checkout/route.ts` **ne comporte aucune garde** comparant
`product.seller_id` à `user.id`.

Deux conséquences, à ne pas confondre le jour de l'essai :

- **le parcours ne sera pas bloqué** — donc un blocage éventuel serait un
  *vrai* bug, pas la garde attendue ;
- c'est un **vecteur de wash trading confirmé** : un vendeur peut gonfler ses
  propres ventes et ses avis. Sans conséquence tant qu'aucun classement ni
  aucune mise en avant ne s'appuie sur le volume de ventes — raison de plus
  pour que « meilleures ventes / meilleurs vendeurs » reste hors périmètre
  jusqu'à ce que cette garde existe. **À traiter avant toute mise en avant
  fondée sur le volume.**

→ **PRÉREQUIS, pas confort : créer un second compte acheteur.** Ce n'est pas
une commodité de test. Sans lui, **la toute première ligne du grand livre est
une vente de soi à soi-même** — et le registre est **append-only** : elle y
reste pour toujours, elle fausse le premier `zabelie_solvency_report()` non
nul, le premier taux de commission observé, la première maturation, et tout
ce qu'on regardera ensuite en pensant regarder une vraie vente. Il n'existe
pas de « on corrigera après » : la correction elle-même serait une écriture de
plus, pas un effacement.

Bénéfice second, réel mais second : le parcours d'inscription se **chronomètre**
au passage — la mesure du mur d'entrée qu'on n'a jamais pu prendre
(`docs/21` §3 bis).

### 2. L'arrondi de la commission — les chiffres attendus dépendent de D-4

⚠️ **`0044_commission_floor.sql` est écrite et NON APPLIQUÉE, et la décision
elle-même n'est pas prise** (`docs/02`, D-4). Ce n'est pas un oubli
d'exécution : c'est une règle commerciale qui attend l'arbitrage du porteur.

`commission = arrondi(brut × bps / 10000)`, `net = brut − commission`.
**Le registre ne peut pas diverger** dans les deux cas : `net` est défini par
soustraction, donc `commission + net = brut` par construction, quel que soit
l'arrondi. Vérifié sur `0..5000` HTG, aux deux taux : **aucune divergence
entre le calcul SQL et l'oracle TypeScript**.

**Ce qu'il faut attendre sur 25 HTG :**

| | `round` — état actuel de la base | `floor` — si D-4 bascule et `0044` est appliquée |
|---|---|---|
| Commission | **3** | 2 |
| Net vendeur | **22** | 23 |
| Taux réel | 12 % | 8 % |

Relever 23 sans avoir appliqué `0044`, ou 22 après l'avoir appliquée, est un
**vrai signal** : la fonction en base n'est pas celle qu'on croit. C'est le
seul endroit de ce document où deux résultats sont acceptables — vérifier
d'abord dans lequel des deux mondes on teste.

Le taux effectif sur les petits montants, sous la règle **actuelle** :

| Brut | Commission (`round`) | Net | Taux réel |
|---|---|---|---|
| 5 HTG | 1 | 4 | **20 %** |
| 15 HTG | 2 | 13 | 13,3 % |
| **25 HTG** | **3** | **22** | **12 %** |
| 105 HTG | 11 | 94 | 10,5 % |
| 1 500 HTG | 150 | 1 350 | 10,0 % |

**L'annonce suit automatiquement la règle déployée.** La FAQ (`faq.a3`) et
l'estimation vendeur dérivent de `ROUNDING_IN_FORCE` (`lib/commission.ts`),
dans les deux langues : elles disent aujourd'hui « arrondis à la gourde la
plus proche », et basculeront sur « l'arrondi est toujours en votre faveur »
le jour où la constante change. Personne n'a à penser à réécrire un texte.

Depuis le 2026-07-27, le vendeur voit son net **pendant qu'il saisit son
prix** (`components/net-estimate.tsx`, sur les deux formulaires) : « Vous
recevez 22 HTG · commission 3 HTG », suivi de la mention que c'est une
**estimation au prix plein** — un code promo réduit le montant payé, donc
aussi le net. Vérifié dans `0027` : la commission se calcule sur
`orders.amount_htg`, qui est le **prix remisé** figé au checkout. Le 6 %
Elite, lui, a été retiré de la FAQ (V-16) : aucun chemin n'attribue ce palier.

À regarder le jour de l'essai : si l'estimation affichée à la publication ne
correspond pas au net relevé en base après la vente (à remise près), c'est que
l'oracle TS et la fonction SQL ont divergé — c'est précisément ce que ce
branchement rend visible.

## Ce qu'il faut relever, tout de suite après

```sql
-- 1. Le numéro lisible existe et respecte le format.
select order_ref, status, amount_htg, created_at from orders order by created_at desc limit 5;
-- Attendu : ZB-YYMMDD-XXXXX, la date du jour, aucun caractère ambigu (0/1/8/B/O/I/L).

-- 2. LE contrôle qui n'a jamais rien prouvé jusqu'ici : le rapport sur des
--    données NON NULLES.
select zabelie_solvency_report();
-- Attendu : ok=true, ecarts=0, du_total_htg = net vendeur de la commande.
-- Un écart ici est un vrai signal — pour la première fois.

-- 3. L'identité comptable de 0033, sur une vraie ligne.
select * from zabelie_wallet_coherence;
-- Attendu : ecart_htg = 0.

-- 4. La commission a-t-elle été prélevée au bon taux ?
select o.order_ref, o.amount_htg as brut,
       (select amount_htg from wallet_transactions
         where idempotency_key = 'order_credit:' || o.id) as net_vendeur,
       e.matures_at, e.status
  from orders o left join escrow_entries e on e.order_id = o.id
 order by o.created_at desc limit 5;
-- Attendu sur 25 HTG sous la règle actuelle (`round`) : net = 22, commission 3.
-- Si 0044 a été appliquée (D-4 → `floor`) : net = 23, commission 2.
-- matures_at = paiement + 7 jours, status 'maturing'.

-- 5. Aucun paiement orphelin (invariant de réconciliation).
select p.status, count(*) from payments p group by p.status;
```

Puis, à **J+7**, vérifier que la maturation a bien basculé `pending_htg` vers
`balance_htg` — c'est le cron `mature_wallets()`, jamais exécuté sur des
données réelles.

## Ce qu'il faut regarder à l'écran, pas seulement en base

- `/mes-achats` côté acheteur : le numéro de commande s'affiche-t-il ?
- Tableau de bord vendeur : la vente apparaît-elle, avec son numéro ?
- Les deux e-mails (acheteur, vendeur) : arrivent-ils, et le numéro y est-il ?
- La facture, le téléchargement du fichier si c'est un produit digital.
- **Le parcours d'inscription lui-même** : combien d'écrans, combien de
  champs, combien de temps sur un téléphone d'entrée de gamme. C'est la
  mesure du « mur à l'entrée » (`docs/21` §3 bis) — la seule qui vaille,
  puisque personne ne l'a encore franchi.

## Ce que ça règle, et ce que ça ne règle pas

**Règle** : les sept lignes du tableau du haut cessent d'être « non éprouvé ».
`OPS_TODO` porte trois contrôles marqués comme tels ; cette commande les
transforme en contrôles réels.

**Ne règle pas** : le physique (B2 + B3 restent requis), le canal de
notification, le checkout invité. Mais elle donne le seul retour que ces
décisions n'ont pas encore — à quoi ressemble le flux quand il porte de
l'argent.

## Le risque, dit franchement

Un vrai paiement MonCash de 25 HTG, sur le compte marchand, avec commission
prélevée et net vendeur inscrit au registre. Si quelque chose casse, c'est
**25 gourdes** et une ligne à corriger par écriture compensatoire — jamais
par modification du grand livre (règle du dépôt). C'est le coût le plus bas
auquel on saura si tout ce qui précède fonctionne.
