# Première commande réelle et retour des fonds

Procédure canonique actualisée le **5 octobre 2026**, avant lancement.
Les essais automatisés peuvent vérifier les transactions SQL et les opérateurs
simulés dès maintenant. Ils ne prouvent pas qu'un acheteur réel a été débité,
qu'un vendeur a remis son offre ou qu'un opérateur a rendu les fonds.

## 1. Préparation avant d'engager un acheteur

L'inventaire du 4 octobre (`docs/67`) relevait **zéro offre publiée** et aucun
paiement réel confirmé. Ce constat est daté : relire le catalogue et la file
`/admin/operations` au moment de l'essai. Les anciens noms de produit, comptes
et montants fixes de cette procédure ne constituent plus des fixtures valides.

- Finaliser les faits et décisions juridiques du registre `OPS_TODO` et le
  circuit d'encaissement/rétention (`docs/17`). Le dépôt annoncé pour la semaine
  suivante reste une démarche prévue. Aucune immatriculation ni validation BRH
  n'est présumée. Aucun Pay autonome ni livraison Zabelie ne participe à l'essai.
- Utiliser une offre réellement publiée, un vendeur et un acheteur **distincts**.
  Une auto-commande est refusée avant toute préparation et en base (0132).
  Les comptes de test ne peuvent pas ouvrir le panier groupé.
- Choisir le montant avec le porteur et le fournisseur. Il doit respecter
  les plafonds et frais configurés. Noter prix plein, éventuelle remise,
  estimation du net vendeur et devise chez l'opérateur. Ces montants ne se
  fixent pas dans ce document.
- Vérifier `/api/admin/coherence` avec la session admin MFA : cohérence
  comptable et intégrations. Pour MonCash, lire exactement
  `integrations.moncash.bascule.pret=true` dans la réponse JSON : ce champ
  exige un mode **production explicite**, mais ne valide pas les identifiants.
  `integrations.moncash.configure` indique seulement la présence de la clé.
  Une variable,
  un secret ou une modification de portail fournisseur demande le signal
  correspondant du porteur ; l'implémentation ne les remplace pas.
- Comparer les identifiants au portail MonCash production et vérifier Website,
  Return et Alert selon le runbook `OPS_TODO`, avant toute bascule. Le retour
  est `/api/moncash/return` et reçoit `transactionId`. Vérifier également les
  URL Auth Supabase et le domaine public du déploiement.
- Vérifier l’ordonnanceur choisi selon `docs/04` §3 : historique des exécutions
  GitHub Actions et leurs résultats si GitHub est sélectionné, ou configuration
  Cron et journaux Vercel si Vercel est sélectionné. La fréquence demandée et
  le dernier passage réussi doivent être relevés ; `/api/admin/coherence`
  ne mesure pas cette cadence. La commande manuelle **Vérifier les paiements en attente** dans
  `/admin/operations` consulte les opérateurs ; elle n'impose aucun succès.
- Garder un moyen de contacter acheteur, vendeur et fournisseur. Les e-mails
  ne sont pas une preuve de paiement ; leur disponibilité doit être vérifiée.

Les migrations et leur statut se lisent dans le registre, jamais par leur
présence sur disque. `0128`/`0129` portent le groupement et `0132` ferme
l'auto-achat et impose le moyen d'origine au justificatif de remboursement.
Le groupé garde le jalon approuvé : première vente réelle, payante,
acheteur/vendeur distincts et hors profils de test. Le remboursement de cette
unique vente referme le gate automatique. Aucun drapeau n'est levé ici.

## 2. Achat et remise

1. L'acheteur ouvre la fiche, note son numéro de commande et utilise le rail
   autorisé. Le prix vient du serveur. Une panne réseau conserve la même
   tentative : **Reprendre cette tentative**, Mes achats ou la page d'attente
   relisent son état. Ne pas créer un deuxième achat pour interpréter le premier.
2. Après débit signalé par l'acheteur, attendre la confirmation serveur du
   fournisseur ou lancer le rapprochement protégé. Le retour navigateur et
   une capture du débit ne créditent jamais le registre à eux seuls.
3. Vérifier les preuves SQL ci-dessous **pour l'identifiant exact**, puis le
   rendu dans `/mes-achats` et le tableau vendeur. Un téléchargement digital
   n'est permis qu'après confirmation. Aucun jeton privé n'est copié dans git.
4. Pour une offre physique ou une prestation, le vendeur déclare sa remise
   dans le suivi existant, puis l'acheteur confirme la réception. Il peut
   signaler un problème par le support de la commande. Le suivi n'organise
   aucun transport Zabelie. Une réception clôture le hold de remise mais
   ne supprime pas la maturation J+7.

```sql
-- Lectures seules. Remplacer <ORDER_ID> par la commande effectivement choisie.
select o.order_ref, o.status, o.amount_htg, p.rail, p.status as payment_status,
       p.provider_ref is not null as reference_operator_received,
       p.raw->>'moncash_mode' as moncash_mode,
       p.raw->>'moncash_host' as moncash_host,
       p.raw->>'expired_reason' as failure_reason
  from orders o left join payments p on p.order_id=o.id
 where o.id='<ORDER_ID>'::uuid;

select wt.type, wt.amount_htg, e.status as escrow_status, e.matures_at,
       e.gated_on_delivery, w.balance_htg, w.pending_htg
  from wallet_transactions wt
  join wallets w on w.id=wt.wallet_id
  left join escrow_entries e on e.order_id=wt.order_id and e.wallet_id=wt.wallet_id
 where wt.order_id='<ORDER_ID>'::uuid
 order by wt.created_at;

select status, shipped_at, received_at
  from zabelie_fulfillment where order_id='<ORDER_ID>'::uuid;

select zabelie_solvency_report();
```

Attendu : commande `paid` puis `delivered` quand la remise s'applique,
paiement confirmé avec référence fournisseur, crédit(s) non dupliqué(s),
escrow correctement maturant et **rapport `ok=true`, `ecarts=0`**. La somme
des écritures doit égaler disponible + attente pour chaque registre vendeur.
Le net se lit dans les écritures, avec les frais effectivement figés ; il ne
se déduit pas d'un ancien exemple à 300 HTG. La cohérence interne ne prouve
pas le solde réel du compte marchand : ce rapprochement reste distinct.

## 3. Défaire la commande et vérifier le retour des fonds

Deux actions différentes sont nécessaires. Le bouton admin **Annuler l'écriture
comptable** appelle `/api/admin/refund`. La session MFA et la trace d'audit
précèdent `refund_order`. Le RPC annule l'escrow et ajoute un débit compensatoire
idempotent ; **aucun argent n'est transféré à l'acheteur par cette action**.

1. Si la commande est payée et porte un escrow, effectuer l'annulation via
   l'interface admin existante. Vérifier commande `refunded`, escrow `reversed`,
   crédit initial conservé, débit compensatoire et rapport toujours cohérent.
   Un rejeu rend `already_reversed`, sans deuxième mouvement.
2. Faire exécuter le retour des fonds par le fournisseur **sur le moyen de
   paiement d'origine**, selon son processus et l'autorisation du porteur.
   Ne pas substituer espèces, banque ou crédit interne à ce retour.
3. L'admin vérifie le justificatif externe puis l'enregistre dans
   `/admin/operations` : méthode d'origine, référence fournisseur et date.
   Le RPC refuse une méthode différente ; Kobara utilise son opérateur sous-jacent,
   un article groupé utilise le paiement de la meneuse. Enregistrer une preuve
   ne transfère pas d'argent et ne crée pas une nouvelle écriture financière.
4. Vérifier que la file ne contient plus ce remboursement, puis demander
   confirmation à l'acheteur par le canal convenu. Une référence enregistrée
   est une attestation administrative ; elle ne remplace pas la réponse opérateur.

```sql
select o.status, e.status as escrow_status, wt.type, wt.amount_htg
  from orders o join escrow_entries e on e.order_id=o.id
  join wallet_transactions wt on wt.order_id=o.id and wt.wallet_id=e.wallet_id
 where o.id='<ORDER_ID>'::uuid order by wt.created_at;

select method, provider_reference, paid_at, created_at
  from zabelie_refund_receipts where order_id='<ORDER_ID>'::uuid;

select zabelie_solvency_report();
```

Une unité physique déjà consommée n'est pas automatiquement remise en stock
par l'annulation comptable. Un retour matériel se vérifie avant tout
réapprovisionnement vendeur. Le ledger et les justificatifs restent append-only.

## 4. Panne : identifier le monde avant d'agir

- **Débit chez le fournisseur, aucun crédit/escrow en base** : relire la même
  tentative et consulter le fournisseur par le rapprochement. Ne pas appeler
  `refund_order` sans escrow ni corriger un solde à la main. Le fournisseur
  traite un éventuel retour de fonds non inscrit au registre. Pour MonCash,
  `moncash_unknown_48h` signifie transaction inconnue (404),
  `moncash_not_successful_48h` transaction connue non aboutie : conserver
  cette distinction et l'hôte réellement servi dans la réclamation.
- **Commande payée avec crédit/escrow** : suivre le §3. Le justificatif externe
  reste absent de la file tant que l'admin n'a pas vérifié son exécution.
- **Issue opérateur incertaine** : conserver identifiant, réservation et traces.
  Reprise en lecture seule ; aucun nouveau paiement ni libération implicite
  de stock pour faire correspondre l'écran à une supposition.

Jamais de modification/suppression du grand livre, jamais de correction directe
d'un solde. La preuve de l'essai doit garder commande, commit déployé, rail/mode,
horodatages, statuts, écritures, cohérence et justificatif externe. Elle ne doit
contenir ni secret, jeton de paiement, téléphone, identité ou document KYC dans git.
Les tests SQL et les opérateurs simulés se consignent séparément de cette preuve.
