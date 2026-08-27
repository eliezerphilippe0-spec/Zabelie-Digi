# 46 — Où porter l'effort produit — note du 2026-08-25

> Demandé par le porteur : *« des suggestions en tant que dev pro, en
> s'inspirant des géants du même domaine, tout en restant focus sur le marché
> haïtien »*.
>
> ⚠️ **Rien ici n'est une décision.** Prix, positionnement et rails sont des
> zones d'arrêt (`docs/25` §4). Ce document mesure, propose et chiffre le
> premier pas. Ce que Zabelie **est** se tranche par le porteur.

## ⚠️ 0. Niveau de preuve — à lire avant les recommandations

Trois sources, trois valeurs très différentes :

| Ce qui est dit | Ce que ça vaut |
|---|---|
| **Ce que Zabelie possède déjà** (fichiers, migrations, colonnes) | ✅ **Vérifié dans le dépôt**, référence à l'appui. C'est le seul socle solide de ce document |
| **Le marché haïtien** (Bemane, Klasyo, WhatsApp…) | ⚠️ Résumés de recherche sur des pages **marketing**. Voir `docs/45` §0 — arguments de vente, pas mesures |
| **Les précédents étrangers** (Alipay, Jumia…) | ⚠️ **Connaissance générale de l'agent, non recherchée cette session.** Les mécanismes sont bien documentés publiquement ; dates et chiffres précis ne le sont pas ici. À vérifier avant d'en citer un dans un document commercial |

---

## 1. Le diagnostic, et il n'est pas flatteur

Sur les **biens physiques**, Zabelie affronte **Bemane** : commission annoncée
jusqu'à **2 %**, **réseau de livraison propre** sur 10 départements, **paiement
à la livraison**, formation gratuite en créole. Zabelie : **10 % / 6 %**,
aucune livraison, pas de COD (exclu par les CGU).

**Ce combat-là est perdu sur les fondamentaux, et aucun code ne le gagne.**

Mais le relevé kreyòl de `docs/45` §3 a montré autre chose, et c'est le pivot
de cette note : **le marché ne s'inscrit pas sur des plateformes, il vend sur
WhatsApp.** Ce qui circule en kreyòl, ce sont des guides — *« Kòmanse yon biznis
anliy sèlman ak MonCash »* —, des formations, des groupes. Ces gens **ont déjà
leurs acheteurs**. Ce qui leur manque n'est pas une vitrine.

C'est la **confiance de l'inconnu en face**. Et Zabelie l'a construite sans
jamais la montrer.

### Ce qui rend le diagnostic actionnable : presque tout existe

Vérifié dans le dépôt le 2026-08-25 — **aucune de ces briques n'est à
construire** :

| Brique | Où | État |
|---|---|---|
| Séquestre + maturation J+7 + remise | `escrow_entries`, `0043`, `0068` | ✅ construit, **jamais traversé par une vraie gourde** |
| **Lien payable SANS COMPTE**, jeton opaque, montant serveur | `app/facture/[token]`, `app/api/facture/[token]/pay` | ✅ construit — **câblé aux seules factures B2B** |
| Points de retrait | `zabelie_pickup_points` (`0082`) + `app/api/admin/pickup-points` | ✅ table + admin, **aucun usage acheteur** |
| Affiliation / parrainage | `0081_affiliation.sql` | ✅ construit |
| Format prestation : délai + inclus | `delivery_days`, `service_includes` (`0020`) | ✅ colonnes présentes, **optionnelles** |
| Zones et communes | `0069`, `0070` | ✅ construit |
| Messagerie acheteur ↔ vendeur | `0090` | ✅ construit |

**Le problème n'est pas un manque de fonctionnalités. C'est que les pièces ne
sont assemblées autour d'aucun travail que quelqu'un cherche à faire faire.**

---

## 2. La recommandation principale — le rail de confiance

### Le précédent : Alipay, et il n'est pas né comme un moyen de paiement

Alipay est né comme un **séquestre**, parce que sur Taobao personne ne faisait
confiance à un inconnu : l'acheteur payait dans un compte bloqué, le vendeur
expédiait, l'acheteur confirmait, l'argent se libérait.

C'est **exactement** `escrow_entries` + `0043` + la maturation J+7.

Et **Mercado Libre** a rejoué la même partition en Amérique latine — faible
bancarisation, faible confiance — avec une leçon supplémentaire : la plus forte
croissance de **Mercado Pago est venue de son usage HORS de la marketplace**,
par des marchands qui ne voulaient pas de la vitrine.

### La traduction haïtienne : le lien de paiement avec séquestre

Un vendeur qui négocie sur WhatsApp crée un lien en quelques secondes,
l'envoie à son acheteur, et **Zabelie garantit la transaction** : l'argent est
retenu jusqu'à la remise.

Pas de catalogue à remplir. Pas de référencement. Pas de livraison à assurer.
**Le vendeur amène son propre acheteur.**

Ce que ça neutralise, et c'est le cœur de l'argument : la vitrine de Bemane,
son réseau de livraison, son référencement. **On ne joue plus le même jeu.**

### Le premier pas — plus petit qu'il n'en a l'air

`app/facture/[token]/pay` fait **déjà** ce qui est difficile : payer sans
compte, jeton opaque résolu serveur, montant calculé en base et jamais reçu du
client, cadence par jeton. Le travail n'est pas de le construire — c'est de le
**généraliser** au-delà des factures B2B.

### ⚠️ Ce que cette recommandation coûte, dit franchement

**Elle met la rétention à l'échelle.** Elle ne change pas sa nature —
`docs/17` §2.5 décrit déjà exactement ce mécanisme — mais elle en augmente le
**volume**, sur un compte marchand non cantonné, dans un dossier où le conseil
**ne s'est pas prononcé**.

⛔ **À poser au conseil avant d'ouvrir, pas après.** C'est une question à
ajouter à la relance de `docs/42` §2, pas un arbitrage d'ingénierie.

---

## 3. Trois autres pistes, par ordre de rapport valeur / effort

### 3.1 Rendre le séquestre VISIBLE — le moins cher de tout ce document

Aucun concurrent du relevé n'annonce de séquestre ni de règlement différé
(`docs/45` §4.6). Zabelie l'a. **Ça ne se voit nulle part sur le site.**

Ce n'est pas du développement, c'est de la **formulation** — et
`tests/promesse-vendeur.test.ts` est déjà là pour interdire d'en promettre plus
que la machine ne tient. Un différenciateur qui n'est pas dit n'existe pas.

**Premier pas** : une phrase sur la fiche produit et au moment de payer.
Kreyòl d'abord.

### 3.2 Le point de retrait, pas la livraison — leçon Jumia

Jumia a lourdement financé la livraison à domicile dans des pays sans adresses
normalisées ; ce qui a tenu, ce sont les **stations de retrait**.

Zabelie ne livre pas et le dit honnêtement (`0043` : *« Zabelie ne vérifie pas
la remise »*). Face au réseau de Bemane, ça ressemble à un manque. **C'en est
un — mais le combler par un réseau propre serait la pire dépense possible.**

L'alternative : des boutiques et pharmacies **existantes** deviennent points de
retrait contre commission. **Zéro capex**, là où un concurrent porte un réseau
au bilan. `zabelie_pickup_points` existe déjà, sans usage acheteur.

**Premier pas** : afficher les points de retrait actifs au moment de l'achat
d'un bien physique, filtrés par zone (`0069`).

### 3.3 L'agent qui commande pour autrui — leçon JForce (Jumia)

Une part importante du marché n'a pas de données mobiles, ou pas de
smartphone. JForce a recruté des **agents** qui passent commande pour les
autres et touchent une commission.

C'est la réponse à *« le marché est sur WhatsApp et tout le monde n'y est pas »*
— et ça fonctionne sur des téléphones d'entrée de gamme, c'est-à-dire sur le
terrain déclaré de ce projet. `0081_affiliation.sql` est construit.

### 3.4 La prestation productisée — leçon Fiverr

Le couloir `kind = service` est le **seul sans concurrent identifié** après
recherche kreyòl (`docs/45` §3). L'apport de Fiverr n'est pas la place de
marché : c'est d'avoir **forcé le format** — prix fixe, délai fixe, « ce qui est
inclus ».

Les colonnes existent (`delivery_days`, `service_includes`, `0020`). Ce qui
manque est de rendre le format **obligatoire** plutôt qu'optionnel :

> un plombier ne publie pas un devis, il publie
> *« Enstalasyon rezèvwa — 3 jou — 4 500 HTG — materyèl pa ladan »*.

⚠️ **Rappel de `CLAUDE.md`** : le seuil de sortie de l'arbitrage services et la
machine de remise (`0068`) sont déjà posés. Cette piste **n'ouvre pas un
chantier neuf**, elle contraint un formulaire existant.

---

## 4. Ce que je ne construirais PAS

| | Pourquoi |
|---|---|
| **Un réseau de livraison propre** | Ce qui a coûté le plus cher à Jumia, et Bemane a dix départements d'avance. Le point de retrait est la version soutenable |
| **Une super-app** | Gojek et Grab ont commencé par **un seul problème douloureux**. Zabelie porte déjà marketplace + recharge + B2B + fidélité + billetterie — beaucoup, pour **zéro transaction réelle** |
| **Une baisse de commission pour affronter Bemane** | On perdrait l'économie du registre sans gagner l'argument : à 2 % contre 2 %, il reste le réseau de livraison, et il est à eux |
| **Un rail de plus avant le premier encaissement** | `docs/03` §9.1 et §9.0 : la question n'est pas technique, elle est réglementaire |

---

## 5. L'ordre — et il n'est pas négociable

> **Rien de tout ceci avant la première gourde réelle** (`docs/22`).
>
> Un rail de confiance dont le chemin d'argent n'a **jamais fonctionné une
> seule fois** n'est pas une stratégie, c'est une promesse. `confirm_payment`
> n'a jamais tourné en production : zéro écriture au grand livre, zéro
> portefeuille, zéro escrow, depuis l'origine.

Ensuite :

1. **Rendre le séquestre visible** — formulation, pas développement ;
2. **Le lien de paiement** — ⛔ après avis du conseil sur la mise à l'échelle
   de la rétention ;
3. **Les points de retrait** au moment de l'achat ;
4. **Le format prestation** rendu obligatoire.

## 6. Ce que ce document ne prouve pas

* Que le marché veut un lien de paiement — **personne n'a été interrogé**. La
  seule preuve serait un vendeur réel qui l'utilise.
* Que Bemane est à 2 % — c'est ce que Bemane dit de Bemane (`docs/45` §0).
* Que les précédents étrangers se transposent. Un mécanisme qui a marché en
  Chine ou au Nigeria a marché **avec son contexte** ; ce document en retient
  la forme, pas la garantie.
* ⚠️ Et surtout : **aucune de ces pistes n'est plus urgente que le chemin
  d'argent.** Choisir entre elles avant la première commande réelle, c'est
  refaire l'erreur du 2026-08-11 décrite dans `CLAUDE.md` — une journée de
  filets impeccables posés sur un chemin que personne ne pouvait emprunter.
