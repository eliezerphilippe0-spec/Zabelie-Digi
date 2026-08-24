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

### ⚠️ 2 bis. HtiPay n'est PAS qu'une passerelle — c'est aussi une marketplace

**La trouvaille la plus lourde du relevé, et elle traverse deux documents.**

`support.htipay.com` publie : *« D'un système de paiement à un marketplace,
HtiPay veut réinventer le commerce électronique en Haïti ! »*. D'après le
relevé, cette marketplace **multi-vendeurs** est ouverte aux marchands
**depuis août 2020** : les vendeurs candidatent et **créent leur boutique sans
connaissance technique**.

Pourquoi ça compte plus que les autres lignes :

* **C'est exactement la trajectoire de Zabelie**, mais dans l'autre sens. HtiPay
  est parti du **rail** et a construit la place de marché par-dessus ; Zabelie
  part de la **place de marché** et cherche ses rails. L'un des deux a six ans
  d'avance sur la moitié que l'autre n'a pas encore.
* **HtiPay figure DÉJÀ dans `docs/03` §9** comme candidat de rail de paiement
  (« existe, API non confirmée »). Ce document-ci le trouve comme **concurrent
  marketplace**. ⚠️ **Les deux fiches parlaient du même acteur sans le savoir**
  — le classer uniquement comme fournisseur était une erreur de catégorie.
  Adopter un jour son rail reviendrait à faire transiter les paiements de
  Zabelie par un concurrent direct, qui verrait alors passer **volumes, prix et
  vendeurs**. Ce n'est pas rédhibitoire, c'est une donnée qui manquait.

À vérifier avant toute conclusion : la marketplace HtiPay est-elle **encore
active en 2026** ? L'article date de 2020-2021 et rien ici ne dit qu'elle vit
encore. Un site ouvert et un marché actif ne se distinguent pas d'un résumé de
recherche.

### 2 ter. Deux acteurs d'un autre type

| | |
|---|---|
| **SurfGroupe** (`vendeurs.surfgroupe.com`) | Espace vendeur — un marketplace de plus, non exploré |
| **PLOGIFY** (`plogify.com`) | ⚠️ **Menace d'une AUTRE nature.** « Kreye yon sit pou Biznis ou kounya » — créer son site de vente **sans code**, en kreyòl. Ne dispute pas les acheteurs à Zabelie : il permet au **vendeur de se passer entièrement d'une marketplace**. C'est le Shopify haïtien, et il attaque la raison d'être, pas la part de marché |

## 3. Talents et produits numériques — ⚠️ **CORRIGÉ le 2026-08-24**

> ### 🔴 LA PREMIÈRE VERSION DE CETTE SECTION ÉTAIT FAUSSE
>
> Elle affirmait : « **le couloir est vide** — aucune plateforme haïtienne
> trouvée qui vende des produits numériques ». C'était le résultat que je
> mettais le plus en avant, et il a tenu **une heure**.
>
> **Ce qui l'a démenti n'est pas une nouvelle source, c'est une nouvelle
> LANGUE DE REQUÊTE.** Les recherches en français et en anglais ne rendaient
> rien. Une requête en **kreyòl** — `achte vann anliy pwodwi` — a fait
> apparaître **Klasyo** du premier coup.
>
> ⚠️ **C'est, mot pour mot, le défaut que `CLAUDE.md` décrit pour les
> expressions régulières** : *« un dépôt kreyòl-first dont les instruments ne
> voient que l'anglais valide toujours la langue qui compte le moins »*. Là
> c'était `\b` contre `vandè` ; ici c'est un moteur de recherche interrogé
> dans la mauvaise langue. **Le motif ne lève pas d'erreur, il ne trouve
> simplement rien** — et ce rien s'était lu comme « le couloir est vide ».
>
> Règle pour tout relevé futur de ce dépôt : **une recherche de marché
> haïtien se fait EN KREYÒL, et le français ou l'anglais ne sont que des
> compléments.** Un « aucun concurrent trouvé » obtenu en français ne vaut
> rien.

**Le couloir n'est pas vide — il est occupé, et par au moins un acteur ciblé :**

| Plateforme | Ce qui est rapporté |
|---|---|
| **Klasyo** (`klasyo.com/sell-digital-products-haiti`) | ⚠️ **CONCURRENT DIRECT SUR LE NUMÉRIQUE.** Aide les **créateurs haïtiens** à publier et vendre des **cours et des PDF**, argent reçu **directement en MonCash**. C'est le cœur du `kind = file` de Zabelie |
| **KawBiz** (`kawbiz.com`) | « Boutik anliy modèn pou mache ayisyen an ». MonCash, **NatCash**, carte bancaire |
| **Pwodwi-lakay** (`pwodwi-lakay.com`) | Produits locaux haïtiens |

**Ce qui reste à côté, et le reste :**

* **Kre-Yole** — artisanat et agricole. Physique.
* **Jwennjob** — recherche d'emploi. Recrutement, pas transaction.
* **AYITI-Lance** — **formation** de freelances haïtiens.
* **Freelancer / Truelancer** — internationaux ; les Haïtiens y sont
  **fournisseurs**, payés en devises, hors circuit HTG.

**Ce qui SUBSISTE de la thèse d'origine, et il faut être précis** :

* le **numérique** (`kind = file`) a désormais un concurrent identifié —
  Klasyo, et probablement d'autres qu'une recherche kreyòl plus poussée
  trouverait ;
* les **prestations de talents** (`kind = service`) n'ont, elles, **toujours
  aucun concurrent identifié** — mais après ce démenti, cette phrase doit se
  lire comme *« pas encore cherchée en kreyòl assez sérieusement »*, pas comme
  un constat ;
* l'argument **structurel** tient indépendamment : le numérique et les
  prestations n'exigent **aucun réseau de livraison**, ce qui neutralise
  l'avantage le plus lourd de Bemane. Ça reste vrai avec ou sans Klasyo.

⚠️ Et Klasyo change une chose de plus : **elle prouve que le marché du produit
numérique en HTG existe** — quelqu'un le sert déjà. C'est plus utile qu'un
couloir vide, qui aurait aussi bien pu vouloir dire « personne n'en veut ».

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

## 4 bis. Deux pistes du porteur — et elles ne donnent pas ce qu'on croyait

Fournies en session le 2026-08-24. Aucune des deux n'a pu être **ouverte**
(`EGRESS_BLOCKED` sur les deux domaines) ; ce qui suit vient de la recherche.

### `koremart.com` — ⚠️ **HOMONYME, ce n'est pas un acteur haïtien**

Le domaine existe et il est bien indexé. Ce n'est pas une marketplace : **Kore
Mart Ltd** est un **fournisseur de fonderie américain**, à Hamburg
(Pennsylvanie) — noyaux de fonderie, sable enrobé de résine, recyclage de
sable. Fiche entreprise Bloomberg, page LinkedIn, annuaire de fabrication
additive : tout concorde, et rien n'a le moindre rapport avec Haïti.

⚠️ **C'est exactement le piège que `docs/03` §9 nomme pour les rails de
paiement** — *« attention aux homonymes : Htipay ≠ HaitiPay »*. Deux lectures
possibles, et il faut trancher avant de comparer quoi que ce soit : soit le
domaine est erroné et l'acteur haïtien vit ailleurs, soit le nom retenu n'est
pas le bon. **À confirmer par le porteur**, qui a la source.

### `shop509.com` — **introuvable, et le nom est un champ de mines**

Trois requêtes (français, kreyòl, domaine exact), aucun résultat pour ce
domaine. `EGRESS_BLOCKED` à la tentative d'ouverture. **Ça ne prouve rien** —
même prudence que ci-dessous.

Ce que la recherche a rendu à la place mérite d'être noté, parce que c'est un
risque de confusion permanent : **l'indicatif « 509 » est un espace de noms
saturé**. Sont sortis, tous distincts : `store509.com` (badges et goodies,
téléphone américain), `code509.com` (produits haïtiens, soins, bijoux),
`boulevard509.store` (vêtements à la demande), `todous509.com` (cuisine),
`509sakpaseapparel` (vêtements), et une page Facebook **Haiti Store
(@509bizishaiti)** qui vend avec **livraison en Haïti et paiement MonCash**.

⚠️ **Deuxième homonyme en une session**, après `koremart.com`. Confirmer le
domaine exact avant toute comparaison.

⚠️ **Et `@509bizishaiti` est une confirmation directe de la §5** : une **page
Facebook** qui vend, livre et encaisse en MonCash, sortie spontanément d'une
recherche de marketplaces. Le concurrent le plus sérieux de Zabelie n'a
peut-être pas de site.

### `noula.ht` — ⚠️ **TRANCHÉ : ce n'est PAS un concurrent**

Domaine corrigé par le porteur (`.ht`, pas `.com`). Résultat net :

**`noula.ht` est « Noula — Portail de gestion de crise — Haïti ».** Un outil
numérique de gestion de crise, sans rapport avec le commerce. Case fermée.

Deux détails qui ont leur importance :

* **Le domaine ne résout même pas en DNS depuis ici** (`ENOTFOUND`), là où tous
  les autres rendaient `EGRESS_BLOCKED`. Ce n'est donc pas le proxy : ou bien
  le site est mort, ou bien son DNS est cassé. Les résultats de recherche le
  donnent en `http://`, pas `https://` — signature d'un site ancien.
* **`noulacoop.com` est encore autre chose** : la coopérative de solidarité
  nOula, entrepreneurs sociaux du Québec et des États-Unis, chaîne
  d'approvisionnement directe Haïti ↔ Amérique du Nord depuis 15 ans, 2 000
  familles de petits producteurs agricoles. Elle a bien une boutique en ligne —
  mais c'est de l'**export équitable vers le Nord**, pas une place de marché
  haïtienne. Adjacent, pas concurrent.

### `shop509.com` — **toujours introuvable, et un voisin plausible**

Domaine confirmé par le porteur. Quatre requêtes au total, aucun résultat pour
ce domaine ; `EGRESS_BLOCKED` à l'ouverture. **Toujours pas une preuve
d'absence** — seulement l'impossibilité de le documenter d'ici.

⚠️ **Un voisin très proche est sorti, et il faut lever le doute** :
**`achat509.com`** — « Achat509 : Offres uniques, qualité garantie en Haïti ! »,
boutique en ligne avec livraison rapide dans tout le pays. À vérifier : est-ce
le site visé, ou un acteur distinct de plus ?

Également apparu : **`konplekslakay.com`** — produits haïtiens (épicerie,
vêtements, soins), livraison **Canada / USA / Haïti**. Orienté diaspora.

### ⚠️ Ce que ces trois pistes apprennent sur la MÉTHODE

Trois noms fournis de mémoire, trois collisions : `koremart.com` est un
fondeur de Pennsylvanie, `noula.ht` un portail de crise, `shop509.com`
introuvable dans un espace de noms saturé de « 509 ».

**Ce n'est pas un défaut d'attention, c'est une propriété de ce marché** : les
marques y sont massivement homonymes — l'indicatif 509, les mots kreyòl
courants, les noms génériques. `docs/03` §9 le savait déjà pour les rails
(« Htipay ≠ HaitiPay ») ; c'est vrai du commerce aussi.

**Conséquence pratique** : un relevé concurrentiel ne se fait pas à partir de
noms cités de mémoire. Il se fait à partir d'**URL ouvertes dans un
navigateur**, copiées depuis la barre d'adresse. Le porteur peut le faire ; le
proxy m'en empêche.

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
