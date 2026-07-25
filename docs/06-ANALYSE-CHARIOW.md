# Zabelie — Analyse concurrentielle : Chariow

> ⚠️ chariow.com bloque la consultation automatisée (403) : analyse fondée sur
> le modèle public connu de Chariow, **à valider par navigation manuelle**.
> Objectif : absorber ses forces, exploiter ses faiblesses, rester haïtien.

## Le modèle Chariow (store-builder)

Chariow permet à un créateur de monter une **boutique de produits
digitaux en un lien** (ebooks, formations, templates), avec checkout mobile
money (rails d'Afrique de l'Ouest/Centrale) et livraison automatique. Le
vendeur **apporte son propre trafic** (WhatsApp, Instagram, TikTok).

## Forces à absorber

| Force | Réponse Zabelie |
|---|---|
| **Vendre par lien** (boutique partageable) | ✅ **Construit** : boutons « Partager sur WhatsApp » + « Copier le lien » sur chaque produit ET chaque boutique créateur (`/createur/[id]`). WhatsApp = canal n°1 en Haïti. |
| Checkout simple, livraison auto | ✅ Déjà en place (MonCash → URL signée). |
| Onboarding vendeur rapide | ✅ Publier un produit prend une minute (`/vendre`). |

## Faiblesses à exploiter

| Faiblesse Chariow | Notre différenciateur |
|---|---|
| **Confiance non instrumentée** : pas d'avis vérifiés visibles, pas d'escrow acheteur | ✅ **Construit** : avis **réservés aux acheteurs ayant payé** (garanti par contrainte UNIQUE en base, pas seulement en API) + badge « Achat vérifié ✓ » + **escrow J+7** déjà en place. En marché à faible confiance, c'est LE levier. |
| **Pas de marketplace centrale** : zéro découverte, le vendeur est seul pour son trafic | ✅ Déjà en place : catalogue central + recherche + profils créateurs + SEO (sitemap par produit/créateur). Le vendeur Zabelie reçoit du trafic qu'un vendeur Chariow n'a pas. |
| **Pas de rails haïtiens** (MonCash/NatCash absents) | ✅ MonCash natif, résilient aux coupures (réconciliateur). NatCash prêt à activer (Vague 2). |
| Pages riches → lourdes en bande passante | ✅ Design 100 % vectoriel (zéro image bitmap), pages légères — pensé pour la 3G haïtienne. |

## Backlog différenciation (non construit, à prioriser plus tard)

- ~~Kreyòl ayisyen~~ ✅ **Construit** : bascule FR/KR dans la nav (cookie), surfaces acheteur traduites (accueil, catalogue, fiche, paiement, nav/footer). ⚠️ À faire relire par un locuteur natif avant lancement.
- Paiement en gourdes affiché en toutes lettres + reçus WhatsApp.
- Mode hors-ligne / PWA pour le catalogue.
- **Programme d'affiliation (P4)** — spec rédigée (côté conseiller), prête à coller
  le moment venu. Principes actés : commission affilié = simple entrée de ledger
  supplémentaire (clé `affiliate_credit:<order_id>` sur l'idempotence existante),
  même maturation J+7, waterfall `paiement = commission plateforme (sur brut) +
  commission affilié (sur net vendeur) + net vendeur` testable au centime,
  attribution figée à la création de commande, code invalide ≠ échec de checkout.
  Ouvert : plafond du taux (5–40 %) et seuil KYC affilié (~5 000 HTG).
  ⚠️ Ne construire qu'après le lancement du MVP (des produits et des acheteurs d'abord).

## Règle de position

Zabelie = **la boutique en un lien de Chariow** + **la découverte d'une
marketplace** + **la confiance instrumentée (avis vérifiés + escrow)** — le tout
sur les rails de paiement haïtiens.
