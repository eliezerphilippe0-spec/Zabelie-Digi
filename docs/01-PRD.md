# Zabelie — PRD (Product Requirements Document)

> Découle de `00-CONTEXTE.md`. Alimente le Design EPIC 4.
> Reconstruit à partir de la synthèse — `[INFÉRÉ]` = hypothèse à valider.

---

## 1. Objectif produit

Permettre à un créateur haïtien de **vendre un produit digital ou un service** et
d'être **payé via mobile money haïtien** de façon fiable, puis de **retirer ses gains**.
Permettre à un acheteur de **payer et recevoir instantanément** son achat.

## 2. Utilisateurs cibles

| Rôle | Besoin principal |
|------|------------------|
| Créateur / Talent | Publier, vendre, suivre, retirer. |
| Acheteur | Découvrir, payer, recevoir. |
| Admin plateforme | Modérer, réconcilier, assurer la conformité. |

## 3. Épopées (EPICs)

| EPIC | Domaine | Vague |
|------|---------|-------|
| EPIC 1 | Comptes & profils (auth, rôles) | 1 |
| EPIC 2 | Catalogue & page produit (digital + talent) | 1 |
| EPIC 3 | Checkout & livraison digitale | 1 |
| **EPIC 4** | **Paiement MonCash + idempotence + réconciliation** | 1 |
| EPIC 5 | Wallet vendeur (crédit, historique) | 1 |
| EPIC 6 | Back-office admin (modération, réconciliation) | 1 |
| EPIC 7 | NatCash | 2 (bloqué) |
| EPIC 8 | Retraits conformes BRH | 2 (bloqué) |
| EPIC 9 | Communauté & mise en avant talents | 3 |

> **EPIC 4 est le cœur critique** : voir `00-CONTEXTE.md §9–§10`. Ses critères
> d'acceptation incluent l'idempotence DB, le réconciliateur et le test « redirect coupé ».

## 4. Exigences fonctionnelles (MVP — Vague 1)

### 4.1 Comptes & profils
- Inscription / connexion (Supabase Auth).
- Rôles : acheteur, créateur, admin. `[INFÉRÉ]`
- Profil créateur public (talents mis en avant).

### 4.2 Catalogue & produit
- Création d'un produit : type **fichier digital** ou **service**, titre, description,
  prix, devise, média de couverture, fichier livrable (Storage).
- Page produit publique avec checkout.
- Catalogue / recherche / filtres. `[INFÉRÉ]`

### 4.3 Checkout & livraison
- Checkout simple (inspiré Chariow).
- Après paiement **confirmé serveur-à-serveur** : livraison digitale via lien
  signé/temporaire (Storage) ou mise en relation pour un service.
- **Jamais** de livraison sur la seule base du retour navigateur.

### 4.4 Paiement (EPIC 4 — voir doc dédié `03-PAIEMENTS.md`)
- Intégration MonCash (création de paiement, redirection, webhook/vérification).
- Idempotence garantie en base.
- Réconciliateur + test redirect coupé.

### 4.5 Wallet
- Crédit du vendeur après confirmation de paiement.
- Solde + historique des transactions.
- Retraits : **différés** (dépendance BRH — Vague 2).

### 4.6 Back-office
- Modération du catalogue.
- Tableau de réconciliation des paiements.

## 5. Exigences non fonctionnelles

- **Résilience réseau** : tolérance aux coupures (contexte haïtien) — exigence, pas option.
- **Sécurité** : RLS Supabase, accès fichiers signés post-paiement uniquement.
- **Traçabilité** : tout paiement réconciliable, aucun flux orphelin.
- **Performance / UX** : plateforme ultra-moderne, mobile-first.

## 6. Critères d'acceptation transverses (paiement)

1. Rejouer un webhook ne crée aucun doublon (commande, crédit, livraison).
2. Coupure réseau après paiement → rattrapage par webhook + réconciliateur, sans
   double livraison ni perte.
3. Aucune livraison/crédit sans confirmation serveur-à-serveur.

## 7. Dépendances bloquantes

Voir `00-CONTEXTE.md §14` : MonCash ouvert (✅), NatCash et BRH bloqués (⛔).
Ne pas construire EPIC 7 et EPIC 8 avant levée des dépendances.

## 8. Décisions ouvertes impactant le PRD

- **D-3** (schéma users/wallet partagé avec Zabelie 1) — à trancher avant de figer le
  modèle de données. Voir `02-DECISIONS.md`.
