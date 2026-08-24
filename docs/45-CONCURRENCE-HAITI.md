# Concurrence — le marché haïtien, relevé du 2026-08-24

> Demandé par le porteur : « regarde ce que font les concurrents qui sont sur le
> marché haïtien ». Premier relevé du dépôt sur ce sujet.

## ⚠️ 0. CE QUE CE DOCUMENT NE PROUVE PAS — à lire avant les chiffres

**Aucune page n'a été ouverte.** `WebFetch` est bloqué par le proxy de sortie
sur **tous** les domaines concernés — `mvinht.com`, `tchotchom.com`,
`kobara.app`, testés, tous `EGRESS_BLOCKED`. Firecrawl était déconnecté au
moment du relevé (`API key is invalid or revoked`).

Tout ce qui suit vient donc de **résumés de recherche portant sur les pages
marketing des concurrents**. Conséquences, et elles sont sérieuses :

* **Les chiffres sont des ARGUMENTS DE VENTE, pas des mesures.** « commission
  jusqu'à 2 % », « +40 % de ventes en 6 mois » sont ce que Bemane dit de
  Bemane. Personne ne les a vérifiés, et ce dépôt sait ce que vaut une
  affirmation non mesurée.
* **Une absence ici n'est PAS une absence là-bas.** « Aucun escrow documenté »
  veut dire « la recherche n'en a pas trouvé mention », pas « il n'y en a
  pas ». C'est la règle « sans appelant n'est jamais une conclusion de grep »,
  transposée au web.
* **Ce document se périme vite.** Un relevé concurrentiel est vrai un jour.

Ce qu'il faut faire pour le durcir : ouvrir les pages vendeur dans un
navigateur humain — `seller.bemaneht.com`, `mvinht.com`, `tchotchom.com` — et
remplacer les lignes ci-dessous par des citations datées. Même méthode que la
fiche Kobara `docs/03` §9.1, qui distingue « documenté » de « testé ».

---

## 1. Marketplaces généralistes — les concurrents directs

| Plateforme | Ce qui est rapporté | Ce qui manque au relevé |
|---|---|---|
| **Bemane** (`bemaneht.com`, `seller.bemaneht.com`) | **Le plus proche du modèle Zabelie.** Boutique gratuite, inscription en 3 étapes. **Aucun frais mensuel, commission seule**, dégressive avec le volume, **plancher annoncé à 2 %**. MonCash, NatCash, **paiement à la livraison**. **Réseau de livraison propre**, 10 départements. **Formation et accompagnement gratuits EN CRÉOLE.** | Escrow ? Délai de règlement vendeur ? Qui opère ? |
| **MvinHT** (`mvinht.com`) | MonCash, **NatCash**, **cartes bancaires**. Livraison nationale, **suivi en temps réel**. « Chaque vendeur est vérifié et noté par la communauté ». | Commission, modèle économique, entité |
| **HTquality** (`htquality.com`) | 10+ ans d'activité, traitement de cartes, page d'inscription vendeur | Commission, volumes |
| **Monkata** (`monkata.com`) | Catalogue en ligne + **réservation puis retrait en boutique**, sans carte. Positionné « stocker et promouvoir », pas encaisser | Encaisse-t-il seulement ? |
| **Makèt pam** (`maketpamht.com`) | Réservé vendeurs / fabricants / grossistes. Catalogue par départements produits | Tout le reste |
| **Madansara Shop** | MonCash, généraliste | Actif ? |
| **Ubuy Haiti** (`ubuy.ht`) | **Autre métier** : import transfrontalier de marques étrangères. Ne concurrence pas un marché de vendeurs locaux | — |

## 2. Passerelles de paiement — le voisinage de Kobara

| Prestataire | Ce qui est rapporté |
|---|---|
| **Tchotchom** (`tchotchom.com`) | MonCash, liens de paiement, **QR**, **API REST + webhooks documentés**, retrait vers MonCash/Digicel, paliers Pro/Business. **Concurrent direct de Kobara** — et d'après le relevé, **MonCash seulement, pas NatCash** |
| **Kobara** (`kobara.app`) | MonCash **et NatCash**. Fiche complète : `docs/03` §9.1 |
| **HtiPay** (`htipay.com`) | Déjà en fiche `docs/03` (« existe, API non confirmée »). Vu ici proposant des tirages vers MonCash/NatCash |
| **Mannitòks** (`mannitoks.com`) | Se présente comme reliant MonCash et NatCash |

⚠️ Le relevé fait apparaître **au moins quatre** intermédiaires haïtiens sur ce
créneau. Kobara n'est pas un passage obligé : si le rail s'ouvre un jour, il y
a une comparaison à faire, pas un fournisseur à adopter.

## 3. Talents et produits numériques — **le couloir est vide**

C'est le résultat le plus utile du relevé, et c'est une **absence**.

Aucune plateforme haïtienne trouvée qui vende des **produits numériques** ou
des **prestations de talents** avec paiement en mobile money local. Ce qui
existe est à côté :

* **Kre-Yole** — artisanat et produits agricoles locaux. Physique.
* **Jwennjob** — recherche d'emploi. Recrutement, pas transaction.
* **AYITI-Lance** — programme de **formation** de freelances haïtiens.
* **Freelancer / Truelancer** — internationaux ; les Haïtiens y sont
  **fournisseurs**, payés en devises, hors circuit HTG.

**Ce que ça vaut** : la partie du positionnement Zabelie qui n'a pas de
concurrent identifié est aussi **celle qui n'a besoin d'aucun réseau de
livraison** — ce qui neutralise l'avantage structurel le plus lourd de Bemane.

## 4. Ce que le relevé dit à Zabelie — faits, puis questions au porteur

> Aucune de ces lignes n'est une décision. Prix, positionnement et rails sont
> des zones d'arrêt (`docs/25` §4).

**4.1 L'écart de commission est frontal.** Bemane annonce un plancher à **2 %**
sur les biens physiques. Zabelie est à **10 % / 6 % Elite**. Sur le même
produit, chez le même vendeur, c'est un rapport de 3 à 5. Zabelie ne peut pas
répondre par le prix sans toucher à l'économie du registre : la réponse est
ailleurs — **escrow, garantie, ou le couloir numérique** — ou bien c'est un
arbitrage tarifaire à poser explicitement.

**4.2 NatCash est devenu un standard de place, pas un avantage.** Bemane **et**
MvinHT l'acceptent tous les deux. Zabelie non. ⚠️ **Ça ne lève pas le blocage
BRH de `docs/03` §9.1 — ça en CHIFFRE le coût.** Le débat cesse d'être « faut-il
un second rail » pour devenir « combien coûte son absence face à des
concurrents qui l'ont ». C'est un fait à verser au dossier, pas une
autorisation.

**4.3 Le paiement à la livraison.** Bemane le fait. Zabelie l'exclut
explicitement (CGU, `docs/22`). Choix délibéré, cohérent avec l'escrow — mais
son **coût concurrentiel est maintenant visible**, et il ne l'était pas.

**4.4 Le réseau de livraison.** Bemane en opère un. Zabelie ne livre pas et le
dit honnêtement (`0043` : « Zabelie ne vérifie pas la remise »). Sur le
physique, c'est l'écart le plus structurel du relevé, et il ne se comble pas
par du code.

**4.5 Le kreyòl : même instinct, ils sont allés plus loin.** Zabelie est
kreyòl-first dans l'interface. Bemane offre **de la formation humaine
gratuite en créole**. L'interface est nécessaire ; elle n'est visiblement pas
suffisante sur ce marché.

**4.6 L'escrow n'est documenté nulle part ailleurs.** Aucun concurrent du
relevé n'annonce de séquestre ni de règlement différé. Zabelie a
`escrow_entries` + maturation J+7 + « le vendeur n'est payé qu'après la
remise ». ⚠️ **Mais un différenciateur qui n'est pas dit n'existe pas** — et
`tests/promesse-vendeur.test.ts` existe précisément pour interdire d'en
promettre plus que la machine ne tient. Il y a un travail de FORMULATION, pas
de construction.

**4.7 La vérification des vendeurs comme argument.** MvinHT met en avant
« vendeur vérifié et noté par la communauté ». Zabelie a la KYC et les avis
vérifiés (`0008`, différenciateur revendiqué face à Chariow) — même terrain,
et là encore c'est déjà construit.

## 5. Ce qui n'a PAS été cherché, et devrait l'être

* **Facebook / WhatsApp Marketplace.** Le vrai concurrent en Haïti n'est
  probablement aucun site : `docs/44` note déjà que **tout se négocie par
  WhatsApp**. Un relevé qui ne regarde que les plateformes formelles regarde
  peut-être à côté du marché.
* **Les volumes.** Aucune de ces plateformes n'a de trafic mesuré ici. Une
  vitrine soignée et un marché actif ne se distinguent pas d'un résumé de
  recherche.
* **Qui opère quoi.** Aucune entité juridique identifiée pour aucun des sept
  concurrents. Même trou que pour Kobara.
