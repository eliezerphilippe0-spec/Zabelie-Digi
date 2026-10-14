# 70 — Note de décision : la commission au lancement

**Date :** 2026-10-14
**Statut :** à trancher par le porteur. Rien n'est codé tant que les décisions ci-dessous ne sont pas prises : ce sont des règles commerciales et de positionnement (`docs/25` §4).
**Origine :** une grille de commission par marge a été proposée, puis critiquée par le porteur le 2026-10-14. Cette note reprend la critique, la confronte à ce que le système fait réellement, et pose les sept décisions qui restent ouvertes.

## 1. Ce que le système fait aujourd'hui (mesuré le 2026-10-14)

**Le modèle en service** est celui de V-12 : deux niveaux, Standard 10 % et Elite 6 %, versement à J+7.

- La commission est calculée **au moment où le paiement est confirmé**, avec le niveau du vendeur à cet instant : `confirm_payment` lit `commission_rate_bps(tier)`, puis `zabelie_settle_order_pricing` applique `zabelie_commission_htg`. Les taux vivent dans `zabelie_commission_config` (1 000 et 600 points de base). **Rien n'est figé à la commande** dans ce chemin.
- L'arrondi va au vendeur (D-4, `0044`). Conséquence : la commission est nulle sous 10 HTG en Standard. D-5 reste ouverte, avec un déclencheur : des articles sous 10 HTG au catalogue.
- La commission porte sur `orders.amount_htg`, c'est-à-dire le prix **après remise**. C'est juste pour un code promo du vendeur. Pour une remise payée par Zabelie, la question est ouverte (D-6).
- **Le niveau Elite n'a pas de porte** (V-16) : aucun code, aucun écran et aucun texte ne dit qui y a droit. Les 4 comptes existants sont en Standard.
- Les services sont payés **en entier** au checkout, sous séquestre. L'acompte n'existe que dans le module de facturation pro (`docs/12`).
- **Aucune règle écrite sur les frais MonCash**, et la grille marchande de Digicel n'est relevée nulle part dans le dépôt.
- Volume : **0 produit publié, 0 vente.** Aucune donnée ne permet encore de calibrer un taux.

**Un second modèle dort dans le code** depuis `0108` (`zabelie_seller_pricing_config.enabled = false`) :

| Paramètre | Valeur par défaut |
|---|---|
| Taux « direct » | 10 % + 0,50 USD fixe par commande |
| Taux « découverte » (vente apportée par Zabelie, attribution 7 jours) | 30 % |
| Conversion USD → HTG | obligatoire (`usd_htg_micros`), vide aujourd'hui |
| Offre de lancement | −50 % sur la commission, 30 jours, 3 premières ventes |
| Plafond | la commission ne dépasse jamais le prix de vente |

Ce modèle a une mécanique utile, quelle que soit la décision : il **fige le taux et le frais à la commande** (`zabelie_order_pricing`), applique la réduction de lancement au règlement, et garde la trace de chaque réduction par commande (`launch_discount_htg`).

**Ce qui est juste dans la critique du 14 octobre, et que le système confirme :**
- garder deux niveaux plutôt qu'une grille par marge, que personne ne peut contrôler ;
- ne jamais rattacher une exception à une déclaration du vendeur, seulement à une catégorie fixe du catalogue (la taxonomie est fermée, BL-105) ;
- traiter les frais MonCash, le minimum par commande et la limite de l'offre de lancement ;
- vérifier les taux des concurrents avant de s'en servir : `docs/45` a été tiré de résumés de recherche, sans page ouverte.

## 2. Les sept décisions

Chaque décision indique les options, leurs conséquences, ce que le code devra faire, et une recommandation de l'agent. La recommandation est une analyse : le choix reste au porteur.

### Décision 1 — Quel modèle de référence ?

Deux règles commerciales qui cohabitent finissent par diverger : c'est la leçon de `0044`, où la même règle d'arrondi vivait à deux endroits. Il faut un seul modèle.

| Option | Ce que ça veut dire | Conséquences |
|---|---|---|
| **A.** Deux niveaux, et retrait de `0108` | On garde V-12 tel quel et on supprime le modèle dormant. | Simple. On perd la mécanique de taux figé à la commande et l'offre de lancement, déjà écrites et testées. |
| **B.** Activer `0108` | Direct/découverte, frais fixe en dollars. | Contredit V-12. Ajoute une dépendance au taux de change. Le 30 % « découverte » est difficile à expliquer à un vendeur haïtien. |
| **C.** Deux niveaux, en réutilisant la mécanique de `0108` | On garde 10 % / 6 %, on fige le taux à la commande et on garde l'offre de lancement. On retire « découverte » et le frais en dollars. | Une migration sur le chemin de l'argent, avec relecture humaine. Le registre reste en ajout seul : on y écrit des montants, jamais des taux. |

**Recommandation : C.**

### Décision 2 — Une commission minimum par commande ?

Sur une vente de 300 HTG, 10 % font 30 HTG, ce qui peut ne pas couvrir le traitement. Deux formes existent, et elles ne donnent pas le même prix :

- **Minimum :** commission = le plus grand de (10 % du prix, M HTG).
- **Frais fixe ajouté** (forme de `0108`) : commission = 10 % du prix + F.

Exemple sur 300 HTG :
- **Minimum de 50 HTG** (montant donné pour l'illustration) : la commission vaut 50 HTG, soit 16,7 %.
- **10 % + 0,50 USD** (en supposant 1 USD = 130 HTG, taux à vérifier) : la commission vaut 95 HTG, soit 31,7 %.

Points à fixer :
- le montant M, en HTG, dans la table de configuration (jamais en dur, règle dure n°3) ;
- s'il s'applique aux fichiers numériques comme aux produits physiques ;
- les exclusions : jamais de minimum sur un article gratuit, et la commission ne dépasse jamais le prix (le plafond de `0108` existe déjà) ;
- l'affichage : l'estimation du vendeur (`components/net-estimate.tsx`) doit montrer le minimum avant la mise en vente.

D-5 avait relevé un coût : un minimum abîme le message « l'arrondi vous revient ». Un minimum en HTG, annoncé à l'avance, se défend mieux qu'un minimum de 1 gourde.

**Recommandation :** un minimum en HTG plutôt qu'un frais fixe en dollars, ce qui évite la dépendance au taux de change. Le montant se fixe une fois connus les frais MonCash (décision 3).

### Décision 3 — Qui paie les frais MonCash ?

Préalable : **obtenir de Digicel la grille marchande réelle.** Sans elle, aucun taux réel ne peut être calculé.

| Option | Conséquences |
|---|---|
| **A.** Zabelie les absorbe | Le taux réel devient 10 % moins les frais. Avec des frais de 2 % (chiffre d'illustration), il tombe à 8 % avant support et remboursements. |
| **B.** L'acheteur les paie | Une ligne apparaît au checkout. Le prix affiché n'est plus le prix payé, ce qui pèse sur la confiance. |
| **C.** Le vendeur les paie | Ils s'ajoutent à la commission et doivent apparaître dans l'estimation du net. |

Quel que soit le choix, le code devra porter les frais de l'opérateur **sur une ligne distincte** de la commission. C'est la seule façon de mesurer le taux réel commande par commande. L'invariant comptable `0033` est inchangé.

**Recommandation :** A au lancement si les frais sont faibles, avec la ligne distincte dès le premier jour.

### Décision 4 — L'offre fondateur

La critique a raison : sans limite, 5 % devient le prix de référence, et revenir à 10 % sera perçu comme une hausse.

À fixer :
- **Le taux** : 5 %, soit −50 % sur 10 %, comme le défaut de `0108`.
- **La borne** : une durée (par exemple 60 jours), un montant de ventes (par exemple 50 000 HTG), ou la première des deux atteinte. `0108` borne aujourd'hui à 30 jours et 3 ventes.
- **Qui est fondateur** : par exemple les N premiers vendeurs publiés. Cette décision rejoint celle, encore ouverte, des 20 premiers vendeurs (audit `docs/69`).
- **L'affichage** : la date de fin est visible dans le tableau de bord dès le premier jour.

Coût maximal, pour chiffrer : avec une borne de 50 000 HTG de ventes, un fondateur paie 2 500 HTG de commission au lieu de 5 000. Avec 20 fondateurs, Zabelie renonce au plus à 50 000 HTG.

Le code réutilise `zabelie_seller_launch` (début, fin, ventes utilisées, plafond). Il faut y ajouter un plafond en HTG si la borne retenue est un montant. La réduction reste enregistrée commande par commande et ne s'applique jamais rétroactivement.

**Recommandation :** 5 % jusqu'à la première borne atteinte, 60 jours ou 50 000 HTG de ventes, réservé aux N premiers vendeurs, date de fin affichée.

### Décision 5 — La porte du niveau Elite

V-16 a retiré l'annonce du 6 % parce qu'aucune règle ne dit qui y a droit. « Dégressif selon le volume » demande d'écrire cette règle.

| Option | Ce que le code doit faire |
|---|---|
| **A.** Ne pas ouvrir Elite au lancement | Rien. Statu quo de V-16. |
| **B.** Règle de volume automatique, par exemple ventes nettes sur 90 jours glissants au-dessus d'un seuil S, sans litige perdu, avec rétrogradation si le vendeur passe sous le seuil | Un cron journalisé, une trace de chaque changement de niveau, l'affichage au vendeur de sa progression. |
| **C.** Attribution manuelle sur critères écrits | Un écran d'administration, et une trace dans `zabelie_admin_actions`. |

Le changement de niveau ne doit jamais toucher une commande déjà passée. C'est un argument de plus pour figer le taux à la commande (décision 1, option C).

**Recommandation :** A au lancement. B quand les premières données permettront de fixer S.

### Décision 6 — Services : paiement complet ou acompte ?

Les services ont le plus fort risque de fuite : après un premier contact, le client et le prestataire passent sur WhatsApp.

| Option | Conséquences |
|---|---|
| **A.** Paiement complet sous séquestre (actuel) | Protection et litiges couvrent tout le montant. Fuite possible. |
| **B.** Acompte de réservation payé sur Zabelie (par exemple 20 à 30 %), commission prise sur l'acompte, solde réglé hors plateforme | Moins de fonds retenus, ce qui va dans le bon sens pour le dossier BRH sur la rétention (`docs/17`). En contrepartie, la protection et les litiges ne couvrent plus que l'acompte, et les conditions d'utilisation doivent le dire. Côté code : un paiement partiel, un séquestre partiel, un affichage dédié. |
| **C.** Paiement complet avec une commission réduite pour les services | Réduit l'incitation à fuir sans changer le parcours. |

**Recommandation :** A au lancement, et mesurer la fuite (voir §3). Trancher entre B et C quand il y aura un volume de services.

### Décision 7 — Une promotion payée par Zabelie (D-6)

Aujourd'hui, toute remise réduit `orders.amount_htg`, donc la commission et le net du vendeur. C'est juste quand le vendeur paie sa promo. C'est faux quand Zabelie la paie : le vendeur financerait une promotion qu'il n'a pas choisie.

Options de D-6 :
- commission calculée sur le prix **avant** remise ;
- remise entièrement supportée par Zabelie ;
- participation choisie par le vendeur.

Le code devra enregistrer, par commande, **qui paie la remise** (le vendeur ou Zabelie), et calculer le net du vendeur en conséquence. Le système de points reste bloqué tant que D-6 n'est pas tranchée (`tests/fidelite-discipline.test.ts`).

**Recommandation :** quand Zabelie paie, le net du vendeur se calcule sur le prix avant remise, et la remise sort de la part de Zabelie.

## 3. À mettre en place dès maintenant, quelles que soient les décisions

La critique propose une revue à 3 mois. Avec 0 vente aujourd'hui, trois mois peuvent ne rien mesurer, et ce zéro se lirait comme « rien à signaler ». La revue doit se déclencher sur un **volume** (par exemple 200 commandes payées), pas sur une date.

Les compteurs à poser dès maintenant :
- départs de vendeurs (compte fermé, ou aucune fiche active depuis 30 jours) ;
- ventes et paiements abandonnés, par catégorie ;
- conversations sans commande, qui signalent une vente partie sur WhatsApp ;
- part des frais de l'opérateur dans chaque paiement (décision 3).

**Exceptions par catégorie :** seulement après cette revue, et seulement là où les données les justifient. Elles vivraient dans une table de configuration indexée sur la catégorie du catalogue, jamais sur une déclaration du vendeur.

**Concurrents :** vérifier les taux de Bemane, Haistore et TiShop sur leurs pages avant tout argumentaire vendeur. `docs/45` vient de résumés de recherche, sans page ouverte.

**Livraison :** Zabelie ne livre pas (consigne du 2026-10-05). Si un frais de remise du vendeur est un jour ajouté à la commande, la commission ne doit pas porter dessus.

## 4. Récapitulatif

| # | Décision | Recommandation de l'agent | Ce que ça déclenche |
|---|---|---|---|
| 1 | Modèle de référence | Deux niveaux, avec taux figé à la commande et offre de lancement repris de `0108` | Migration sur le chemin de l'argent, retrait de « découverte » et du frais en dollars |
| 2 | Minimum par commande | Minimum en HTG, montant fixé après la décision 3 | Configuration, calcul plafonné au prix, estimation vendeur |
| 3 | Frais MonCash | Absorbés au lancement, sur une ligne distincte | Grille Digicel à obtenir, ligne de frais par paiement |
| 4 | Offre fondateur | 5 %, 60 jours ou 50 000 HTG, N premiers vendeurs | Plafond HTG dans `zabelie_seller_launch`, affichage de la date de fin |
| 5 | Porte Elite | Fermée au lancement | Rien pour l'instant |
| 6 | Services | Paiement complet, fuite mesurée | Compteur de conversations sans commande |
| 7 | Promo payée par Zabelie (D-6) | Net vendeur sur le prix avant remise | Source de la remise par commande |

Une fois les décisions prises, elles s'inscrivent dans `docs/02-DECISIONS.md`. Le chantier commence par retirer le modèle non retenu, avant d'ajouter quoi que ce soit.
