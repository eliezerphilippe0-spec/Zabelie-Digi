# 69 — Audit de la marketplace face à un géant : Etsy (2026-10-14)

Demande du porteur, le 2026-10-14 : « fais-moi un audit de marketplace, compare
Zabelie avec un géant, implémente tout ce qui manque pour peaufiner notre
marketplace, tout en restant dans la réalité du marché haïtien ».

## 0. Méthode, et ce que ce document ne prouve pas

- **Le géant choisi est Etsy**, pas Amazon ni Jumia. Zabelie vend du
  savoir-faire (objets, fichiers, services) par des vendeurs indépendants qui
  organisent eux-mêmes la remise (`docs/26` §0) : c'est le modèle d'Etsy, et
  c'est la comparaison retenue par le porteur. Amazon et Jumia opèrent la
  logistique, que Zabelie exclut par principe.
- **Côté Zabelie**, chaque ligne vient du code de `main` (627a384), de
  l'inventaire `docs/67` (2026-10-04) relu contre le code le 2026-10-14, et du
  site en ligne ouvert le même jour. Une absence est notée seulement après
  recherche dans `app/`, `components/`, `lib/` et `supabase/migrations/`.
- **Côté Etsy**, les chiffres viennent de pages d'aide d'Etsy et de guides
  vendeurs récents (sources en fin de document). Ce sont des faits publics,
  pas des mesures de Zabelie : ils se périment.
- **Le filtre « réalité haïtienne »** applique `docs/26` §0 : Android d'entrée
  de gamme, faible bande passante, kreyòl d'abord, gourde entière, MonCash,
  pas de livraison Zabelie, pas de portefeuille, diaspora qui achète pour un
  proche, WhatsApp comme canal principal.

## 1. Le constat qui commande tout le reste

| Mesuré le 2026-10-14 sur zabelie.com | Valeur |
|---|---|
| Offres publiées au catalogue | **0** (« Les premières boutiques se préparent ») |
| Paiement réel en production | **aucun** : MonCash en phase de test, NatCash et carte « bientôt » |
| E-mails envoyés | **aucun** (pas de clé d'envoi configurée, `docs/67` §2) |

Etsy n'est pas un géant parce qu'il a plus de fonctions : il l'est parce qu'il
a des acheteurs et des vendeurs. **Zabelie a déjà l'essentiel des fonctions
d'Etsy, souvent mieux adaptées à Haïti ; il lui manque la liquidité.** Les
trois verrous de liquidité sont des actes du porteur (§4), pas du code. Le code
peut seulement retirer les frictions qui resteront le jour où les premiers
vendeurs arriveront.

## 2. La comparaison, fonction par fonction

Légende : ✅ existe · 🟡 partiel · ❌ manque · ⛔ volontairement exclu.
« Qui » : **agent** = réalisable sans décision ; **porteur** = zone d'arrêt
(`docs/25` §4 : argent, positionnement, dépense, juridique, variables).

### 2.1 Découverte

| Etsy | Zabelie | Réalité haïtienne | Qui |
|---|---|---|---|
| Recherche, filtres, tris | ✅ prix, tri, zone (10 départements) | La zone est plus utile qu'un filtre « livraison » | — |
| Recherche tolérante aux fautes | ✅ trigrammes (`zabelie_search_fuzzy`, 0047) : « batery » trouve « Batri » | Indispensable : le kreyòl s'écrit à l'oreille | — |
| Synonymes et traductions de requête | ❌ « soulye » ne trouve pas « chaussures » | **Critique** : le vendeur écrit en français, l'acheteur cherche en kreyòl, ou l'inverse | **agent** |
| Recherche sans résultat | ✅ et **mieux qu'Etsy** : la demande est notée et partageable sur WhatsApp pour recruter le vendeur | Le capteur de demande est un outil de recrutement | — |
| Recommandations, « vous aimerez aussi » | ✅ construit, inactif sous 5 acheteurs (`0110`, `0111`) | Correct : pas de fausses recommandations | — |
| Favoris, boutiques suivies, partage | ✅ (`0102`) | Le partage WhatsApp est le premier écran du produit | — |
| Vus récemment | ✅ sous forme d'offres gardées hors ligne 7 jours | **Mieux qu'Etsy** pour les coupures | — |

### 2.2 Fiche produit

| Etsy | Zabelie | Réalité haïtienne | Qui |
|---|---|---|---|
| Galerie, variantes, stock | ✅ (`0036`, `0073`) | — | — |
| Vidéo produit | 🟡 phase 0, aucun code (`docs/66`) | Coûteux en données mobiles : à garder optionnel | porteur (priorité) |
| **Personnalisation** (le texte que l'acheteur veut sur l'objet) | ❌ | Très haïtien : gâteaux, tenues, objets gravés, commandes sur mesure | **agent** (lot 2) |
| Délai de préparation, date estimée | 🟡 `delivery_days` ; « délai promis » **en cours dans une autre branche** | Aucun délai garanti par la plateforme (`docs/26` §0) | en cours |
| Politique de retour de la boutique | ❌ (seule la politique de la plateforme existe) | Utile, mais c'est un engagement du vendeur | **agent** (lot 2) |
| Avis | ✅ un avis par commande = achat vérifié par construction | — | — |
| **Note affichée dès 1 avis** (« ★ 5 (1) ») | ❌ **écart au cahier des charges** (`docs/26` §14 : aucune note sous un seuil) | Un faux-précis abîme la confiance qu'il prétend donner | **agent** (lot 1) |
| Réponse du vendeur à un avis | ❌ | Le vendeur haïtien répond publiquement, comme sur Facebook | **agent** (lot 2) |
| Avis avec photos | ❌ | Données mobiles et modération : plus tard | porteur (priorité) |
| Questions sur la fiche | ✅ par messages (« Écrire au vendeur »), comme Etsy | — | — |

### 2.3 Achat et protection

| Etsy | Zabelie | Réalité haïtienne | Qui |
|---|---|---|---|
| Panier multi-vendeurs | ✅ construit (`0058`, `0128`, `0129`) | — | — |
| Paiement par carte d'abord | 🟡 Stripe construit, éteint (exige une entité étrangère) | MonCash d'abord ; la carte sert la diaspora | **porteur** |
| Paiement local | 🟡 MonCash **en test** ; NatCash via Kobara selon prérequis | **Verrou n° 1** | **porteur** |
| Acheter pour un proche | ✅ payeur ≠ destinataire (`0102`) | **Mieux qu'Etsy** (« this is a gift » ne gère pas un destinataire dans un autre pays) | — |
| Protection acheteur (Etsy : jusqu'à 250 $, après contact du vendeur) | ✅ séquestre, maturation J+7, litiges (`0113`), remboursement par le ledger | **Plus protecteur qu'Etsy** : le vendeur n'est payé qu'après la remise | — |
| Nom unique « Protection Zabelie » | 🟡 la mécanique existe, le libellé n'est pas unifié (`docs/67` L7) | Le mot doit être juste avant d'être montré | **porteur** (formulation, après `docs/17`) |
| Prix affiché en USD | ❌ | Utile à la diaspora, mais un taux de change est un paramètre commercial | **porteur** |
| Livraison, étiquettes, suivi transporteur | ⛔ exclu (`docs/26` §0) | Le vendeur organise la remise ; points de retrait (`0082`) | — |

### 2.4 Vendeur

| Etsy | Zabelie | Réalité haïtienne | Qui |
|---|---|---|---|
| Frais | Etsy : 0,20 $ par annonce + 6,5 % + paiement ≈ 3 % + 0,25 $ | Zabelie : 0 HTG pour ouvrir ni publier, **10 % / 6 % Elite**, lus en base. Concurrents locaux annoncés jusqu'à 2 % (`docs/45`, non vérifié) | **porteur** (positionnement) |
| Boutique publique, domaine | ✅ `/boutik/<slug>` | — | — |
| Soldes, prix barrés, ventes flash | ✅ (`0037`–`0040`, `docs/37`) | — | — |
| Statistiques (visites, conversion) | 🟡 ventes et digital ; **pas de visites par vendeur** | Utile dès les premiers vendeurs | **agent** (lot 3) |
| Badge de confiance (Etsy : « Star Seller », réponse < 24 h, envois à l'heure, note ≥ 4,8) | ❌ | Sans commandes, un badge de performance serait vide | après les premières ventes |
| **Badge « identité vérifiée »** | ❌ alors que le KYC existe (`0079`) | **Plus parlant qu'un Star Seller en Haïti**, où la confiance précède l'achat | **agent** (lot 2), libellé validé par le porteur |
| Publicité interne (Etsy Ads, Offsite Ads 12 à 15 %) | ❌ | Prématuré sans trafic | — |
| IA pour les fiches | 🟡 construite, éteinte (clés absentes) | Utile, mais c'est une dépense | **porteur** |

### 2.5 Communication et confiance

| Etsy | Zabelie | Réalité haïtienne | Qui |
|---|---|---|---|
| E-mails transactionnels, notifications | 🟡 file `outbox` prête, **aucun envoi** | E-mail peu lu ; WhatsApp d'abord | **porteur** (clé d'envoi, WhatsApp Business) |
| Messages acheteur-vendeur | ✅ | — | — |
| Vie privée des comptes | 🟡 **deux points ouverts depuis la revue du 2026-10-12** (comptes et avis), détail hors dépôt | Un géant ne montre jamais qui a acheté quoi | **agent** (lot 1 bis), application = porteur |
| Mode hors ligne, PWA | ✅ et **mieux qu'Etsy** | Coupures fréquentes | — |
| Quatre langues, kreyòl | ✅ (kreyòl à faire relire) | — | porteur (relecture) |

## 3. Ce qui est réalisable sans décision, par lots

Chaque lot est une PR, avec ses tests et leurs mutations (`CLAUDE.md`).

| Lot | Contenu | Pourquoi d'abord |
|---|---|---|
| **1** | Seuil d'affichage des notes (`docs/26` §14) | Écart écrit au cahier des charges, petit, sans base |
| **1** | Synonymes kreyòl-français dans la recherche | La recherche est la porte d'entrée ; aucune base touchée |
| **1 bis** | Vie privée : lecture publique des comptes et des avis restreinte | Avant l'arrivée des acheteurs ; **migration rédigée, non appliquée** |
| **2** | Badge « identité vérifiée » ; réponse du vendeur aux avis ; politique de retour de la boutique ; personnalisation à la commande | Migrations rédigées, chacune dans sa PR ; libellés des promesses validés par le porteur |
| **3** | Visites et conversion par vendeur | Dès qu'il y a des vendeurs |

## 4. Ce qui reste au porteur (zones d'arrêt)

Ces points pèsent plus que tout le §3 réuni. Aucun ne se règle par du code.

1. **MonCash en production** et la réconciliation fréquente (`docs/56`, `docs/67` L3).
2. **Les 20 premiers vendeurs**, avec de vraies photos (`docs/67` L5). Le capteur de demande dit quoi chercher en premier.
3. **Les champs juridiques** de `/conditions` et `/confidentialite`, et le dossier BRH (`docs/17`).
4. **Une clé d'envoi d'e-mail**, et la décision sur WhatsApp Business pour les notifications (`docs/28`).
5. **Positionnement tarifaire** face aux 2 % annoncés localement.
6. **Libellés de promesse** : « Protection Zabelie », « identité vérifiée ».
7. **Prix indicatif en USD** pour la diaspora : source et fréquence du taux.

## 5. Ce qui ne se copie pas d'Etsy

- **Les étiquettes et le suivi transporteur** : pas de réseau d'adresses ni de
  transporteur national fiable ; Zabelie a choisi la remise organisée par le
  vendeur et les points de retrait.
- **La carte bancaire comme rail principal** : le marché paie en MonCash.
- **La publicité aux enchères** : elle suppose un trafic qui n'existe pas encore.
- **Le badge de performance** : il mesure des commandes qui n'existent pas encore.

## Sources Etsy (consultées le 2026-10-14)

- Frais : <https://checkoutpage.com/blog/etsy-fees>, <https://app.craftybase.com/blog/the-complete-guide-to-etsy-fees>
- Protection des achats : <https://help.etsy.com/hc/articles/5850122619287>, <https://www.etsy.com/uk/trust>
- Badge Star Seller : <https://help.etsy.com/hc/en-us/articles/4403058372503>, <https://craftybase.com/blog/how-to-become-etsy-star-seller>
