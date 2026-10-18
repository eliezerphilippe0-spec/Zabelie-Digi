# 73 · Le tableau vendeur façon Chariow (produits physiques et services)

Demande du porteur, le 2026-10-17, après la refonte du Studio (phase T2, PR 379) : « regarde le tableau de bord des produits physiques et services également », puis « vas y » sur la recommandation.

## Ce qui n'allait pas (captures du 2026-10-17, 360 px et bureau)

- Une seule page d'environ quinze écrans à 360 px. Argent, ventes, produits, codes promo, profil public, vérification d'identité, adresse de livraison et suppression du compte s'y suivent, sans menu.
- « Bonjour, » écrit en dur : il restait en français dans les quatre langues. Beaucoup d'autres textes aussi (retrait, codes promo, « Mes produits », « Mes données & mon compte »). « Mes ventes » tutoyait, le reste du site vouvoie.
- Le lien de la boutique et ses boutons de partage apparaissaient deux fois en haut (premiers pas, puis « Ma boutique »).
- « Performance des produits numériques » s'affichait aussi pour un vendeur qui ne vend que du physique.
- Rien ne signalait en tête les commandes à expédier ou les prestations à réaliser.

## Ce qu'on fait

**Un menu à icônes** (`components/vendeur-shell.tsx`, même dessin que le menu du Studio) : Accueil, Produits (`/vendre`), Commandes à traiter (`/mes-ventes`), Codes promo, Messages, Ma boutique, Compte ; puis, quand ils sont allumés, le Studio de création, le Studio images, l'API, et le centre d'aide. Aucune entrée vers une fonction absente.

**L'accueil (`/tableau-de-bord`) garde l'argent, les ventes et les produits**, avec toutes leurs gardes (hiérarchie des chiffres, total complet ou « ≥ », pagination des ventes, guidage avant les chiffres). Il gagne :
- la salutation à l'heure d'Haïti, traduite, et « Voir ma boutique » ;
- une rangée d'actions rapides : publier un produit physique, créer une fiche numérique ou une prestation, créer un code promo (si le vendeur a un produit), partager ma boutique ;
- une alerte « À traiter » quand des commandes attendent une remise ;
- les montants masquables (la même préférence de navigateur que le Studio) ;
- la performance numérique seulement pour un vendeur qui a un produit numérique.

**Trois pages reçoivent le reste**, chacune avec la même garde (session, compte suspendu renvoyé vers l'accueil qui en donne le motif) :
- `/tableau-de-bord/boutique` : l'adresse, le partage, la présentation publique ;
- `/tableau-de-bord/compte` : vérification d'identité, coordonnées de livraison, mes données et la suppression du compte ;
- `/tableau-de-bord/codes-promo` : la gestion des codes.

Les liens entrants suivent : l'en-tête (« Gérer ma boutique »), la page API (vérification d'identité), l'action « code promo » du Studio.

## Ce qu'on ne fait pas ici

- Aucune migration : chaque chiffre vient de tables existantes (l'alerte « À traiter » compte les lignes de `zabelie_fulfillment` en attente).
- `/vendre`, `/mes-ventes` et `/messages` gardent leur mise en page ; les passer sous le même menu est l'étape suivante.

## Tâches

- [x] V.1 Menu à icônes et garde commune des pages vendeur
- [x] V.2 Accueil : salutation, actions rapides, « À traiter », montants masquables, performance numérique ciblée, textes traduits
- [x] V.3 Pages Ma boutique, Compte, Codes promo ; liens entrants
- [x] V.4 Tests déplacés avec leurs blocs, nouveaux tests, e2e, captures 360 px et bureau
