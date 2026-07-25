# Dossier juridique — Rétention de fonds vendeurs et qualification BRH

> **Destinataire** : conseil juridique (droit bancaire / financier haïtien).
> **Objet** : qualification, au regard de la **Circulaire BRH n°121**, du
> mécanisme de rétention de fonds actuellement **en production** sur la
> plateforme.
> **Rédigé le** : 2026-07-24 · **Statut** : brief factuel, ne contient
> **aucune interprétation juridique** — c'est précisément ce qui est demandé.
>
> ⚠️ **Gel décidé** : aucune construction nouvelle sur ce mécanisme tant que
> l'avis écrit n'est pas rendu.

---

## 1. Résumé de l'exposition en cinq phrases

1. Un acheteur paie **100 %** du prix à la plateforme, via le compte marchand
   MonCash **de la plateforme**.
2. La plateforme conserve sa commission (10 % standard / 6 % Elite) et inscrit
   le solde net du vendeur comme **écriture comptable** dans une table
   `wallets`, colonne `pending_htg`.
3. Après **7 jours**, un traitement automatique fait passer cette écriture de
   « en attente » à « disponible ».
4. **Aucun mécanisme de retrait n'est implémenté.** Le vendeur ne dispose
   aujourd'hui d'**aucun moyen** d'obtenir les fonds portés à son crédit.
5. Autrement dit : **la plateforme détient des fonds appartenant
   économiquement à des tiers, pour une durée indéterminée, sans voie de
   sortie.**

C'est ce point 5 qui motive la présente consultation.

---

## 2. Description technique du mécanisme (vérifiable dans le code)

### 2.1 Encaissement
L'acheteur est redirigé vers MonCash et paie **sur le compte marchand de la
plateforme** (identifiants `MONCASH_CLIENT_ID` / `MONCASH_CLIENT_SECRET`,
propriété de la plateforme). La plateforme reçoit donc **l'intégralité** du
montant, y compris la part due au vendeur.

### 2.2 Inscription au crédit du vendeur
Après vérification serveur-à-serveur du paiement, la fonction
`confirm_payment` calcule la commission et inscrit le **net vendeur** :

- `supabase/migrations/0006_escrow_maturation.sql:108-114` — création d'une
  ligne `escrow_entries` avec `matures_at = now() + interval '7 days'`, statut
  `'maturing'`, et incrément de `wallets.pending_htg`.

**Aucun mouvement de fonds réel n'a lieu.** Il s'agit exclusivement d'une
écriture dans un registre comptable interne.

### 2.3 Maturation à J+7
- `supabase/migrations/0006_escrow_maturation.sql:143-173` — fonction
  `mature_wallets()`, déclenchée quotidiennement par une tâche planifiée
  (`/api/maturation`, cron 13h UTC) : les entrées échues passent de
  `pending_htg` à `available_htg`.

Justification d'origine du délai : **fenêtre anti-fraude** (permettre
l'annulation d'une vente contestée avant que les fonds ne soient réputés
acquis), et non une volonté de conserver les fonds.

### 2.4 Réversibilité
- `supabase/migrations/0006_escrow_maturation.sql:176-199` — un remboursement
  **avant** maturité annule l'écriture (réduction de `pending_htg`, statut
  `'reversed'`) ; après maturité, les fonds sont réputés disponibles.

### 2.5 ⚠️ Absence de voie de sortie — le point central

| Élément | État |
|---|---|
| Table `payouts` (demandes de retrait) | **Existe** — `0001_schema.sql:119-126` |
| Politique RLS sur `payouts` | **Existe** — `0002_rls.sql:81-85` |
| Fonction ou route de décaissement | ❌ **N'existe pas** |
| Interface vendeur pour demander un retrait | ❌ **N'existe pas** |

Le code lui-même documente ce blocage :
- `app/tableau-de-bord/page.tsx:241` — message affiché au vendeur : « Les
  retraits du solde disponible arriveront avec la [suite] »
- `supabase/migrations/0017_seller_suspension.sql:7` — « les retraits — **déjà
  bloqués en Vague 1** »

**Conséquence** : le solde « disponible » ne l'est qu'au sens comptable. En
pratique, les fonds restent chez la plateforme **sans limite de durée**.

### 2.6 Ce que le mécanisme ne fait pas
Éléments pertinents pour écarter certaines qualifications :
- ❌ Aucun **cash-in** : impossible d'alimenter un solde par un dépôt.
- ❌ Aucun **cash-out** : aucun retrait implémenté (§2.5).
- ❌ Aucun **transfert P2P** : aucun mouvement entre comptes utilisateurs.
- ❌ Aucun **paiement de tiers** : le solde ne peut servir à régler quoi que
  ce soit sur ou hors plateforme.
- ✅ Le solde ne naît **que** d'une vente réalisée sur la plateforme.

---

## 3. Volet connexe — programme de points de fidélité

Vérification demandée : les points constituent-ils une valeur monétaire
susceptible de relever de la même question ?

### 3.1 Conclusion de l'audit technique : **non** — vérifié le 2026-07-24

| Test | Résultat | Preuve |
|---|---|---|
| Existe-t-il un pont points → portefeuille ou espèces ? | **Non** | Recherche croisée `points` × (`wallet`\|`payout`\|`refund`\|`cash`) sur les 31 migrations : **zéro correspondance fonctionnelle** |
| Les points sont-ils achetables ? | **Non** | Aucune fonction de crédit contre paiement ; `award_points` est révoquée du client et n'est appelée nulle part |
| En quoi se convertissent-ils ? | **Uniquement** en remise **en pourcentage** | `0021:47` — `create type coupon_type as enum ('percentage')` : l'énumération n'a **qu'une seule valeur**, un montant fixe en gourdes est structurellement impossible |
| Sont-ils remboursables ? | **Non** | Aucune fonction de remboursement de points |
| Sont-ils transférables ? | **Non** | Toutes les tables sont liées à un `user_id` unique ; aucune fonction de transfert |
| Expirent-ils ? | **Oui**, 90 jours (plafond dur 180) | `0021:217`, `0031` |
| Le solde est-il plafonné ? | **Oui**, 2 000 points | `0031` |

### 3.2 État opérationnel
Le programme est **en base mais entièrement débranché** : aucune attribution
n'est déclenchée, aucune interface d'échange n'existe. **Aucun point n'a jamais
été émis.**

### 3.3 Nuance à soumettre au conseil
Un coupon porte un plafond de remise exprimé en gourdes
(`max_discount_htg`, ex. « −10 %, plafonné à 1 000 HTG » pour 500 points).
Ce plafond **borne** l'avantage sans donner au point une valeur autonome : il
n'a d'effet qu'appliqué à un achat. Nous soumettons néanmoins ce point à
appréciation (question Q5 ci-dessous).

---

## 4. Questions posées au conseil

> Formulées pour appeler des réponses actionnables, pas des développements
> théoriques.

**Q1 — Qualification principale.** Le fait, pour une place de marché, de
recevoir sur son compte marchand l'intégralité du prix payé par l'acheteur, et
d'inscrire au crédit du vendeur, dans un registre interne, la part lui revenant
— sans mouvement de fonds réel — constitue-t-il une **rétention de fonds pour
compte de tiers** au sens de la Circulaire n°121 ? La réponse dépend-elle de la
durée de rétention ?

**Q2 — Effet de l'absence de voie de sortie.** L'absence de tout mécanisme de
retrait (§2.5) aggrave-t-elle la qualification, l'atténue-t-elle, ou est-elle
sans effet ? Formulé autrement : vaut-il mieux, au regard de la Circulaire,
**implémenter le retrait rapidement** ou **suspendre l'inscription au crédit**
tant que le retrait n'existe pas ?

**Q3 — Seuil de tolérance.** Existe-t-il une durée, un encours ou un nombre de
bénéficiaires en deçà desquels ce mécanisme reste hors du champ de la
Circulaire ? Si oui, lesquels — nous les inscrirons comme plafonds durs en base
de données.

**Q4 — Modèles alternatifs.** Parmi les trois options ci-dessous, laquelle est
conforme sans agrément ? (détail en §5)
- (a) Règlement immédiat au vendeur, commission facturée séparément
- (b) Maintien du différé J+7, avec retrait effectif
- (c) Passage par un établissement agréé jouant le rôle de tiers de confiance

**Q5 — Points de fidélité.** Au vu de §3, le programme de points relève-t-il de
la Circulaire ? Le plafond de remise exprimé en gourdes (§3.3) modifie-t-il
l'analyse ?

**Q6 — Régularisation.** Si le mécanisme actuel est non conforme, quelle est la
marche à suivre pour la situation **déjà constituée** (fonds encaissés et non
reversés à ce jour) ?

---

## 5. Options de mise en conformité — pour éclairer Q4

Aucune n'est retenue à ce stade ; chacune est techniquement réalisable.

### Option (a) — Règlement immédiat, commission facturée
Le vendeur est réglé dès confirmation du paiement ; la commission fait l'objet
d'une facturation distincte.
- ✅ Supprime la rétention : plus de fonds de tiers détenus.
- ❌ Supprime la fenêtre anti-fraude : un remboursement après règlement devient
  une créance sur le vendeur, difficile à recouvrer.
- ⚙️ Impact technique : **fort** (le décaissement doit être automatisé, ce qui
  suppose une API de versement MonCash — à vérifier auprès de Digicel).

### Option (b) — Différé J+7 maintenu, retrait implémenté
On conserve l'existant en ajoutant le décaissement réel.
- ✅ Impact technique **faible** : le schéma est déjà en place (§2.5).
- ✅ Préserve la protection de l'acheteur.
- ❌ Ne répond pas à Q1 : la rétention subsiste, seulement bornée dans le temps.

### Option (c) — Tiers agréé
Les fonds transitent par un établissement disposant de l'agrément.
- ✅ Écarte la question réglementaire.
- ❌ Suppose un partenaire, un contrat et une marge supplémentaire.
- ⚙️ Impact technique **moyen** ; impact économique à évaluer.

---

## 6. Éléments à réunir avant le rendez-vous

À produire par le porteur — ces chiffres seront la première question du conseil.
Requêtes à exécuter dans l'éditeur SQL Supabase :

```sql
-- 1. Encours actuellement détenu pour le compte des vendeurs
select coalesce(sum(pending_htg), 0)   as en_attente_htg,
       coalesce(sum(available_htg), 0) as disponible_non_retire_htg,
       count(*) filter (where pending_htg + available_htg > 0) as vendeurs_concernes
  from wallets;

-- 2. Ancienneté de la rétention la plus ancienne
select min(created_at) as plus_ancienne_entree,
       count(*)        as nb_entrees,
       count(*) filter (where status = 'matured') as matures_non_retirees
  from escrow_entries;

-- 3. Volume traité
select count(*) as commandes_payees, coalesce(sum(amount_htg), 0) as volume_htg
  from orders where status in ('paid', 'delivered');
```

Également utile : statut juridique de la société, nature du compte marchand
MonCash (personnel ou société), et conditions générales acceptées par les
vendeurs.

---

## 7. Contact identifié

`docs/BRH-question-fidelite.md` mentionne **HDIT / Cabinet Volmar** comme
contact pressenti pour un mémo juridique. Ce dossier peut lui être transmis
tel quel.

---

## 8. Décisions gelées dans l'attente de l'avis

| Chantier | État |
|---|---|
| Chantier A (rebrand) | ⛔ **gelé** — décision porteur |
| Chantiers B→F | ⛔ **gelés** |
| Câblage de l'attribution de points | ⛔ gelé (l'était déjà) |
| Toute évolution du mécanisme d'escrow | ⛔ gelée |
| Documentation, taxonomie, plans | ✅ autorisés (aucune construction) |

**Ce qui reste possible sans lever le gel** : préparer les documents, corriger
la spécification, définir la taxonomie — c'est-à-dire tout ce qui n'ajoute
aucune fonctionnalité au mécanisme en question.
