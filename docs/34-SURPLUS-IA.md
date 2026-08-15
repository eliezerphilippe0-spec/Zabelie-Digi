# 34 — SURPLUS IA : facturer au-delà du quota gratuit

Décisions porteur du **2026-08-15**, prises en session, dans l'ordre :

1. « 50 par jour par vendeur » → **quota gratuit ferme : 50 suggestions/jour**
   (en production depuis la PR #110, avec message dédié à la limite).
2. « Ok pour 50 gratuit ferme, facture le surplus » + arbitrages nommés :
   - **Rail : déduction du prochain règlement vendeur** — le rail de la
     commission, pas de nouveau moyen de paiement.
   - **Prix : 5 HTG par suggestion** au-delà du quota.

## §1 Principes non négociables

- **Consentement explicite, à chaque franchissement.** Personne n'est facturé
  pour avoir cliqué une fois de trop : au-delà du quota, la route répond
  **402** avec le prix, et seule une requête portant `surplusOk: true` —
  émise par le bouton de consentement qui AFFICHE le prix — est facturée.
- **Jamais de génération non facturée, jamais de facturation non générée.**
  L'écriture au registre de surplus précède l'appel fournisseur ; si elle
  échoue, la route répond 502 sans générer (fail-closed).
- **Paramètres commerciaux en table** (règle dure n°3) : quota gratuit, prix,
  plafond du jour vivent dans `zabelie_ai_config` (0071), modifiables par
  `UPDATE` sans redéploiement. Les valeurs compilées (50 / 5 / 200) ne sont
  que le repli d'affichage et de comportement — et le repli du comportement
  est **le blocage gratuit**, jamais la facturation.
- **Plafond dur : 200/jour** (config), payant compris — borne d'abus et de
  dépense, même consentie.
- **Registre append-only.** `zabelie_ai_surplus` porte une ligne par
  suggestion facturée, avec le prix DU MOMENT (un changement de prix ne
  réécrit pas le passé). Seule mutation permise : le règlement
  (`settled_at`/`settlement_ref`, null → valeur, une fois). Trigger ZB071.

## §2 Les deux tranches, et l'ordre d'application

- **Tranche 1 (cette PR)** : migration 0071 **rédigée, non appliquée** +
  chemin de consentement + registre de surplus. Tant que 0071 n'est pas en
  prod, `lireConfigSurplus` rend `null` et TOUT se comporte comme avant :
  blocage gratuit à 50. Dormant, comme la brique elle-même.
- **Tranche 2 (0072, livrée)** : le recouvrement à la **demande de retrait** —
  c'est là que l'argent sort, c'est là que la dette se collecte.
  `zabelie_request_payout` est remplacée (même signature) : lignes non
  réglées **verrouillées puis sommées**, solde exigé = montant + dette,
  double écriture au grand livre (`payout` −montant ; `debit` −dette,
  idempotence `ai_surplus:<payout>`), lignes marquées réglées **par
  identifiant** (une dette née pendant la demande attend la sortie
  suivante). Refus en NET : `disponible_htg = balance − dette`, avec
  `frais_ia_htg`. ⚠️ **Un rejet de la demande restitue le montant, jamais
  les frais** — le service a été consommé au prix consenti,
  `zabelie_reject_payout` reste inchangée.
- ⛔ **Ordre d'application, sur signal porteur : `0071` puis `0072`**, dans
  la même fenêtre — 0072 référence la table de 0071. Avant ce signal, tout
  reste dormant (gratuit bloqué au quota) ; la ligne CGU du service payant
  précède l'application.

## §3 Ce qui reste au porteur

- Ligne CGU sur le service payant (le gabarit `/conditions` est à lui).
- Le signal « applique 0071 », après tranche 2.
- Les valeurs finales en base (50/5/200 sont les défauts posés par 0071).

## §4 Comptage — précision assumée

Le compteur de quota (`zabelie_rate_limit`) borne, il ne facture pas : la
facturation, ce sont les lignes de `zabelie_ai_surplus`, point. Une requête
refusée (402 non consenti, plafond atteint) peut incrémenter un compteur sans
facturer — l'imprécision est toujours dans le sens conservateur (un
consentement de moins, jamais une facture de plus).
