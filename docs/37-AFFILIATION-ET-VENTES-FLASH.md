# Affiliation et ventes flash — ce que font les géants, adapté au terrain

> **Statut** : spécification, RIEN N'EST CONSTRUIT. Les paramètres commerciaux
> (taux, bornes, durées) sont des **arbitrages porteur** marqués ⏳ — ce
> document propose des défauts, il ne les décide pas.
> **Rédigé le** : 2026-08-15 · Sources en fin de document.
> Prolonge `docs/06-ANALYSE-CHARIOW.md` §P4 (spec affiliation d'origine).

## Ce que les géants font réellement — mesuré, pas supposé

### Affiliation : trois modèles, pas un

| Modèle | Qui paie | Qui fixe le taux | Exemple mesuré |
|---|---|---|---|
| **A. Plateforme** (Amazon Associates) | La plateforme, sur SA marge | La plateforme, par catégorie | 0–20 % selon la catégorie, la plupart 3–4,5 % ; cookie 24 h ; commission sur le panier entier |
| **B. Vendeur opt-in** (TikTok Shop, Shopee) | Le vendeur, sur son net, **par choix** | Le vendeur, par produit | 1–80 % permis, 10–15 % typique en « open collaboration » — le marché calibre |
| **C. Agent de vente** (Jumia JForce) | La plateforme | Grille par catégorie et par grade | 2,5 % (mobiles) à 10 % (épicerie) ; l'agent **passe la commande POUR un client** qui n'a ni internet ni carte ; payé seulement à la livraison confirmée |

**La leçon Jumia dépasse le taux.** Leur première version payait à la commande
reçue — elle a été **manipulée** et Jumia a dû basculer vers « payé à la
livraison confirmée et réglée ». C'est notre maturation J+7 : l'attribution se
fige à la commande, la commission ne se paie qu'à la maturation. On hérite du
correctif sans avoir payé l'erreur.

**Le modèle C est celui qui ressemble le plus au terrain haïtien** : bande
passante faible, une partie des acheteurs sans smartphone à eux, distribution
par WhatsApp et par des personnes de confiance. Un « ajan Zabelie » qui
commande pour ses voisins et touche sa part à la remise est la traduction
locale de JForce — mais il exige le COD chez Jumia, que **Zabelie ne fait pas**
(décision porteur 2026-08-13). Notre variante : l'acheteur paie MonCash
lui-même ou l'agent paie avec SON MonCash — dans les deux cas le paiement
reste serveur-à-serveur, rien ne change aux trois invariants.

### Ventes flash : la mécanique Amazon Lightning Deals

Quatre ingrédients, tous mesurés : une **fenêtre courte** (4–12 h) · un
**compte à rebours** visible · un **plafond d'unités** dédié à l'offre · une
**barre de progression** « déjà pris » qui crée l'urgence. Jumia et AliExpress
font tourner des fenêtres quotidiennes sur le même schéma.

Ce que les géants ne montrent pas mais font : le prix flash est **calculé
serveur**, la fenêtre est vérifiée **au moment du paiement** (pas seulement à
l'affichage), et l'offre expirée revient au prix normal sans intervention.

## Ce que le dépôt possède DÉJÀ — l'inventaire avant la spec

| Brique | Où | Ce qu'elle donne |
|---|---|---|
| Prix barré + prix d'origine préservé | `0075` — `compare_at_htg`, `zabelie_set_discount`/`clear` | Le « changement de prix visible » existe ; il manque seulement la **fenêtre temporelle** |
| Stock, réservations, expiration | `0036` — `zabelie_stock`, `zabelie_stock_reservations` + cron `/api/stock/expire` | Le plafond d'unités d'une offre flash est une réservation de plus, pas un système neuf |
| Ledger idempotent + maturation J+7 | `0033`/`0034` | La commission affilié est **une écriture de plus** (`affiliate_credit:<order_id>`), même maturation |
| Paramètres en table de config | 6 précédents (`0054`, `0071`, `0079`…) | Taux, bornes et durées ne seront jamais en dur |
| KYC + retrait gardé | `0079` | Un affilié qui retire de l'argent est un vendeur comme un autre : même wallet, même KYC, même garde |
| Métriques d'événements | `lib/metrics.ts` | `affiliate_link_clicked`, `flash_viewed` s'ajoutent à une liste existante |

**Conclusion d'inventaire : aucun des deux chantiers n'exige d'infrastructure
neuve.** L'affiliation est un programme de ledger ; la vente flash est un
rabais borné dans le temps. C'est la bonne nouvelle de la session.

## Spec A — Affiliation

### L'arbitrage central : qui paie ⏳

C'est la question D-6 des points, une couche plus haut, et **les géants y
répondent différemment** — donc elle ne se déduit pas, elle se tranche.

- **Option A (Amazon)** — la commission sort des 10 % de Zabelie. Vendeur
  intouché, zéro consentement à gérer, mais la marge plateforme se partage :
  à 5 % d'affiliation, il reste 5 %.
- **Option B (TikTok Shop) — recommandée** — le **vendeur choisit**, produit
  par produit, d'offrir un taux aux partageurs. Qui paie est réglé par le
  consentement même ; le vendeur qui veut de la distribution WhatsApp achète
  sa visibilité, celui qui n'en veut pas n'est jamais prélevé. Bornes
  plateforme en config (proposé : 5–40 %, la fourchette de `docs/06`).
- **Option C (JForce)** — programme d'agents à grille. Le plus adapté au
  terrain **à terme**, mais il suppose un réseau à recruter et à former :
  c'est un chantier d'opérations, pas de code. À ouvrir après les premières
  ventes réelles.

### Mécanique (identique quelle que soit l'option)

1. **Lien** : `zabelie.com/produit/<slug>?ref=<code>` — le code est un
   identifiant opaque par affilié, jamais son nom. Partageable tel quel sur
   WhatsApp, où la distribution se fait déjà.
2. **Attribution** : figée **à la création de la commande** (cookie 7 jours,
   comme Jumia — le 24 h d'Amazon est calibré pour un trafic qu'on n'a pas).
   Un code invalide n'échoue JAMAIS un checkout : il est ignoré, journalisé.
3. **Écriture** : à la confirmation serveur du paiement, une ligne
   `affiliate_credit:<order_id>` (idempotence existante) au wallet de
   l'affilié, statut immature.
4. **Paiement** : maturation J+7 — la leçon Jumia. Un remboursement avant
   maturation annule la commission par écriture compensatoire, jamais par
   modification du ledger.
5. **Cascade vérifiable au centime** (docs/06) :
   `paiement = commission plateforme (brut) + commission affilié + net vendeur`
   — un test SQL la vérifie après chaque geste, comme l'invariant 0033.
6. **Retrait** : le wallet affilié EST un wallet — mêmes règles, même KYC
   (`0079`), même dossier Volmar (seuil ~5 000 HTG déjà posé dans docs/06 ⏳).

### Ce que l'affiliation ne sera pas — interdits posés d'avance

Pas de commission à l'inscription (anti-farming — la leçon Jumia et le
garde-fou cashback existant) · pas de multi-niveaux (un parrainage
pyramidal est une qualification BRH qu'on ne veut pas approcher) · pas de
paiement hors wallet (aucun rail parallèle).

## Spec B — Ventes flash

### Mécanique sur l'existant

Une table `zabelie_flash_sales` : produit, `prix_flash_htg` (entier, `> 0`,
`< price_htg`), `debut`, `fin`, `unites_max` (optionnel), créée par le
vendeur sur SON produit publié. Le prix affiché et le prix payé viennent du
serveur ; la fenêtre est vérifiée **au moment du paiement** — une offre
expirée entre l'affichage et le clic rend le prix normal, explicitement, pas
silencieusement.

`compare_at_htg` (0075) donne déjà le prix barré ; le plafond d'unités
s'appuie sur les réservations de `0036` ; l'expiration est **calculée à la
lecture** (pas de cron à rater — une fenêtre est une comparaison de dates,
l'absence de signal ne peut pas faire vendre au mauvais prix).

UI : compte à rebours + barre « déjà pris » (le pattern Lightning Deals
complet), bandeau « Vant flash » sur la fiche et dans le catalogue.

### Bornes en config ⏳ (proposées, à trancher)

| Paramètre | Proposition | Pourquoi |
|---|---|---|
| Durée max | 24 h | Amazon fait 4–12 h ; 24 h pardonne la connectivité du terrain |
| Rabais minimal | 10 % | Sous 10 %, « flash » est un mensonge marketing |
| Rabais maximal | 70 % | Au-delà, erreur de saisie plus probable qu'intention |
| Offres simultanées par vendeur | 3 | L'urgence ne survit pas à l'abondance |

### Garde-fous hérités des leçons du dépôt

Le prix flash ne touche pas `price_htg` — l'offre expire, le prix d'origine
n'a jamais bougé (le motif `compare_at` de 0075 : préserver l'ORIGINE).
Un produit `fichier` sans livrable ne peut pas entrer en flash (même garde
que la publication). La commission plateforme se calcule sur le prix payé,
jamais sur le prix barré.

## Ordre de construction proposé

**Flash d'abord, affiliation ensuite.** La vente flash ne demande AUCUN
arbitrage d'argent nouveau (le prix reste celui du vendeur, la commission
reste 10 %) — seulement des bornes de config. L'affiliation attend
l'arbitrage « qui paie » ⏳ et, honnêtement, un catalogue : au jour de cette
spec, le marketplace compte **un produit publié et zéro commande payée**.
Une offre flash sans acheteurs est une répétition générale ; une commission
d'affiliation sans catalogue est une dépense sans objet.

1. ⏳ Arbitrages bornes flash (tableau ci-dessus) → migration
   `zabelie_flash_sales` + config, dormante sans offre.
2. ⏳ Arbitrage « qui paie » (A/B/C) → migration affiliation + `?ref=` +
   écriture ledger, dormante derrière config.
3. Programme agents (option C) : après les premières ventes réelles, comme
   chantier d'opérations.

## Sources

- [Amazon Associates — commission rates by category](https://affiliate-program.amazon.com/help/node/topic/GRXPHT8U84RAYDXZ) · [historique Geniuslink](https://geniuslink.com/blog/amazon-affiliate-commission-rates-historical-guide/)
- [TikTok Shop — le vendeur fixe le taux par produit](https://ads.tiktok.com/help/article/about-setting-different-affiliate-commission-rates-for-tiktok-shop-ads?aadvid=72391499277) · [taux typiques open collaboration](https://www.hamstergarage.com/article/tiktok-shop-affiliate-program-guide-rates-fees)
- [Jumia JForce — programme officiel](https://www.jumia.com.ng/sp-jforce/) · [analyse du basculement du modèle de rémunération](https://jobtechalliance.com/why-we-invested-jumia-creating-jobs-to-power-last-mile-e-commerce-in-uganda/) · [grille par catégorie](https://jumiaafrica.blogspot.com/2020/04/jforce-all-you-need-to-know-about-jumia.html)
- [Amazon Lightning Deals — fenêtre, plafond, barre de progression](https://salesfortuna.com/academy/promotions/lightning-deals) · [guide vendeur](https://www.bebolddigital.com/blog/amazon-lightning-deal)
