# Panier multi-vendeurs et scission des commandes — spec (chantier 4)

> **Statut : PARTIELLEMENT IMPLÉMENTÉ.** Rédigée 2026-08-07, en-tête corrigé
> le **2026-08-21** — il annonçait « spec, rien d'implémenté », ce qui était
> faux depuis le 11 août. Le dépôt fait foi, pas cette ligne : voici la mesure.
>
> | Étape de §6 | État au 2026-08-21 |
> |---|---|
> | 1. Adresses | ⚠️ **Couvertes sous un autre nom** — `zabelie_delivery_info` (`0076`, appliquée le 15/08). Ce n'est pas le carnet multi-adresses de §2, c'est la même donnée pour une commande. **0 ligne en production.** |
> | 2. Panier + RPC | ✅ **Fait** — `0058` appliquée le 11/08 : `zabelie_carts`, `zabelie_cart_items`, `zabelie_cart_add`, `zabelie_cart_remove`, `/api/panier`, `/panier`, trois composants. **2 paniers créés en production.** |
> | 3. `confirm_group_payment` | ❌ **Rien** — zéro occurrence de `order_group` dans tout le dépôt |
> | 4. UI checkout groupé | ❌ Rien. `components/cart-pay-button.tsx` paie **ligne à ligne** vers le checkout existant, et le dit dans son en-tête |
> | 5. `mes-achats` par groupe | ❌ Rien |
>
> ⛔ **ET L'ÉTAPE 3 EST BLOQUÉE PAR UN FAIT, PAS PAR UNE DÉCISION.**
> `confirm_group_payment` ventile vers `confirm_payment` — une fonction qui
> **n'a jamais tourné une seule fois en production** (0 écriture au grand
> livre, 0 portefeuille, 0 escrow ; cinq paiements tentés, cinq échecs
> `moncash_unknown_48h`). Construire le paiement groupé au-dessus reviendrait
> à poser un filet sur un chemin dont personne n'a atteint le bout, et sur le
> chemin de l'argent. → **`docs/22` étape 0 bis passe devant**, arbitrage
> porteur du 2026-08-21.
>
> **Prérequis d'implémentation d'origine** : chantier 1 fusionné (`0043`
> appliquée) et B2 (`0037`/`0038`/`0040`) appliquée — le panier vend du
> physique, le physique exige le stock.

## 1. Le principe directeur : la scission, pas la refonte

Aujourd'hui une commande = **un produit, un vendeur** (`orders.product_id`,
escrow `unique` par commande, `0006`) — et tout le money-path éprouvé
(idempotence, triple vérification, commission floor, escrow J+7, `0043`)
raisonne sur cette forme. **On ne la casse pas.** Le panier ajoute une couche
AU-DESSUS : un **groupe de commandes** payé en une fois, scindé à la création
en N commandes de la forme existante — une par produit. Chaque commande
garde son escrow, sa maturation, son suivi `0043`, son avis, son
remboursement **individuels**. « SellerOrder » de la charte = la commande
actuelle ; ce qui naît est le groupe, pas une seconde machine.

Ce que l'acheteur voit : un panier, un paiement, un récapitulatif. Ce que le
système voit : `zabelie_order_groups` (1) ⟶ `orders` (N).

## 2. Tables nouvelles (préfixe `zabelie_`, RLS dès la création)

- `zabelie_carts` / `zabelie_cart_items` — panier persistant par acheteur
  (RLS : propriétaire seul). Un item = produit + variante éventuelle +
  quantité. **Aucun prix stocké au panier** : le prix se lit en base au
  checkout, jamais du client ni d'un instantané modifiable.
- `zabelie_addresses` — adresses de l'acheteur (RLS propriétaire). La
  commande porte un **instantané** de l'adresse choisie (colonnes
  dénormalisées sur le groupe) : modifier son carnet ne réécrit jamais une
  commande passée. Zéro adresse dans les journaux.
- `zabelie_order_groups` — `id`, `buyer_id`, `group_ref` (format `ZB-…`
  de `0042`, partagé : les commandes filles portent `-1`, `-2`…),
  `total_htg` (= Σ `orders.amount_htg`, vérifié par trigger), instantané
  d'adresse, `status`. `orders` gagne `group_id` nullable — une commande
  mono-produit d'aujourd'hui reste valide telle quelle.

## 3. Checkout et paiement — un paiement, N commandes

RPC serveur `zabelie_create_pending_group` (`SELECT FOR UPDATE`, motif
validé par audit) : lit les prix en base, réserve le stock
(`zabelie_reserve_stock` existant, par item), crée groupe + N commandes
`pending`, calcule `total_htg`. **Toute somme vient du serveur.**

Paiement MonCash sur le **total du groupe** — triple vérification au niveau
groupe : montant à la création, propriété+montant à la confirmation
serveur-à-serveur, miroir dans le retour. À la confirmation,
`confirm_group_payment` (SQL, une transaction) fan-out vers la mécanique
**existante** par commande : commission (config `0054`), escrow J+7,
`zabelie_open_fulfillment` par commande physique, identité `0033` préservée
— l'invariant nouveau étant `Σ(commandes du groupe) = paiement reçu`,
vérifié en base et par la réconciliation étendue aux groupes.

**Échec partiel interdit** : le groupe se confirme entièrement ou pas du
tout ; un stock devenu insuffisant à la confirmation suit la voie
`disputed` existante du garde de montant — jamais une confirmation
partielle silencieuse.

## 4. Trous volontaires — arbitrages porteur, pas des choix d'agent

1. **Frais de livraison** (charte §5 les cite) : paramètre commercial —
   *qui* fixe (vendeur ? plateforme ?), *par quoi* (commande ? poids,
   `0036` le porte ?). Rien ne s'implémente sans ton arbitrage ; la grille
   vit en table de config, jamais en dur. **Proposition v1 : zéro frais
   plateforme, remise vendeur-acheteur comme aujourd'hui.**
2. **Coupons** : un coupon est **par vendeur** (`0012`) — il ne s'applique
   qu'aux commandes de son vendeur dans le groupe. À confirmer.
3. **Zelle multi-vendeurs** : la confirmation manuelle vaut pour le total du
   groupe (une ligne dans la file admin, pas N). À confirmer.

## 5. Ce que cette spec ne couvre pas

Multi-produit par commande (`order_items`) — la scission par produit suffit
au lancement et préserve le money-path ; notifications (chantier 5) ;
`SellerOrder` comme entité séparée (la commande actuelle joue ce rôle).

## 6. Ordre d'implémentation (après revue)

1. Adresses (indépendant, débloque le physique) → 2. panier + RPC groupe →
3. `confirm_group_payment` + réconciliation groupes (**le morceau d'argent —
sa propre PR, tests money-path complets, mutations**) → 4. UI panier/checkout
→ 5. `mes-achats` par groupe. Migrations écrites jamais appliquées ; chaque
étape avec ses tests connu-positif/connu-négatif avant l'étape suivante.
