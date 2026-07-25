# Zabelie — Inspiration ciblée P1 : storefront · checkout · dashboard

Analyse limitée aux **3 zones en construction** (page produit, checkout,
dashboard vendeur), cible **marché haïtien** (Android entrée de gamme, 3G).
Filtre appliqué : chaque point **change un fichier construit cette semaine**,
sinon il part au backlog (§5). Sources : Gumroad (guide d'achat + anatomie de
page), Lemon Squeezy (docs checkout), Chariow (centre d'aide + revues
détaillées), Shopify (doc dashboard Home). Talent GN : **aucune présence web
indexée exploitable** — remplacé par Chariow comme comparable
« contraintes marché émergent ». Les fetchs directs de pages produit étant
bloqués depuis cet environnement, les poids de page concurrents n'ont pas pu
être mesurés ; notre propre référence mesurée au build : **page produit
= 175 kB First Load JS** — c'est le budget à ne pas dépasser.

---

## Page produit — `app/produit/[slug]/page.tsx`

**Ce qu'on reprend**
1. **Gumroad — règle des 10 secondes** : « ce que c'est / pour qui / ce qu'on
   obtient » au-dessus du pli. Notre page l'a déjà (badges, titre, blurb, prix,
   CTA). **Delta concret : rapprocher la preuve sociale du prix** — la note et
   le compteur de ventes vivent aujourd'hui dans la zone méta, séparés du bloc
   d'achat ; les répéter en une ligne compacte DANS le bloc prix/CTA
   (« ★ 4,8 · 23 ventes »), c'est là que l'hésitation se joue.
2. **Gumroad — CTA haut ET bas** : après la section « Avis vérifiés », l'achat
   est à un scroll entier du lecteur convaincu. Ajouter un rappel d'achat en
   fin de page (lien ancre vers le bloc prix, pas un second état de chargement).

**Ce qu'on adapte pour Haïti**
- Zéro média lourd : visuels produits en dégradés CSS (0 octet réseau), pas de
  vidéo autoplay, pas de widget tiers — **déjà le cas, à ériger en règle** :
  toute future embed (YouTube, player audio) sera au clic, jamais au chargement.
- Page 100 % server-rendered, JS limité au BuyButton — maintenu.

**Ce qu'on ignore (cette phase)**
- Upsells au checkout et « More like this » algorithmique (Gumroad) — P2.
- Thème personnalisable par boutique (Chariow) — P2.

## Checkout — `components/buy-button.tsx` · `app/connexion/page.tsx`

- **Nombre d'étapes cible : 2 écrans** côté Zabelie (page produit → passerelle
  MonCash), **0 formulaire, 0 page panier** — le seul formulaire du parcours
  est celui de MonCash chez l'opérateur. C'est déjà notre architecture
  (BuyButton → redirect direct), alignée sur l'overlay Lemon Squeezy : on ne
  quitte la page que pour payer.
- **Champs obligatoires : aucun** pour un acheteur connecté.
- **LE point de friction identifié vs Gumroad** (achat invité à l'email seul) :
  chez nous, un acheteur non connecté qui clique « Payer » est envoyé sur
  `/connexion`… **et perd sa page produit**. Correctif cette semaine :
  `401 → /connexion?next=/produit/<slug>` avec retour automatique post-login
  (et post-inscription). C'est 80 % du bénéfice du guest checkout sans en
  payer le coût (avis vérifiés et « Mes achats » exigent un compte).
- Le vrai guest checkout (email seul, compte implicite) → backlog P2, décision
  produit à part entière.

## Dashboard vendeur — `app/tableau-de-bord/page.tsx`

Le tripartite **Chariow « Revenus totaux / En attente / Payés »** valide
exactement notre modèle escrow — c'est le standard du comparable le plus
proche, on s'y aligne pleinement :

- **Les 3 informations en premier** (ordre justifié Zabelie) :
  1. **Disponible** (`balance_htg`) — déjà en place ;
  2. **En attente + date de prochaine maturation** — delta concret : on
     affiche « En attente (J+7) » mais pas QUAND l'argent arrive ; ajouter
     « prochain déblocage le <date> » via `min(matures_at)` des
     `escrow_entries` en `maturing`. Pour un vendeur haïtien, la date vaut
     plus que la règle ;
  3. **Revenus nets cumulés** (somme des crédits `wallet_transactions`) —
     delta : on affiche un NOMBRE de ventes, Chariow affiche un MONTANT ;
     les deux ensemble (« 12 450 HTG · 23 ventes »).
- **Shopify Home** (structure de l'info, pas le poids) : le « à faire » avant
  les métriques. Notre équivalent minimal existe déjà (brouillons visibles
  dans « Mes produits ») — pas de changement cette semaine.
- **Ce qu'on n'implémente pas maintenant** : sessions/trafic/conversion,
  graphiques temporels, exports, app mobile de notifications (Chariow
  Creators) — P2+.

---

## §5 Backlog « P2/P3 idées » (hors cahier des charges actif)

- Guest checkout à l'email seul (Gumroad) — implique livraison hors compte.
- Upsells / cross-sell au checkout ; « More like this ».
- Personnalisation de boutique par vendeur (logo, couleurs — Chariow).
- Notifications de vente temps réel (app/PWA — Chariow Creators).
- Analytics vendeur avancés (Shopify).

## Divergence tiers — TRANCHÉE (statu quo, V-12)

Le brief §0 mentionnait 4 tiers (Starter 12 % J+14 → Elite 6 % J+3). Décision
porteur (2026-07) : **on garde les 2 tiers implémentés** (standard 10 %,
elite 6 %) avec **maturation J+7 uniforme** (`0005`/`0006`). Sujet refermé —
un éventuel passage à 4 tiers serait une nouvelle décision, en chantier
financier dédié.
