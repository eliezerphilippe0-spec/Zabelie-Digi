# Cashback Zabelie — Garde-fous de conception (référence normative)

> **Statut** : normatif. Toute évolution du programme de points DOIT respecter
> les quatre règles ci-dessous. Une PR qui en enfreint une est refusée d'office ;
> une évolution qui exige d'en assouplir une passe d'abord par un avis juridique
> (cf. `docs/BRH-question-fidelite.md`).
>
> **Contexte** : la PR #12 (points & récompenses, migration `0021` durcie par
> `0023`) a été **dégelée par décision porteur du 2026-07-11 et fusionnée le
> 2026-07-13**. Ce document — audit du 2026-07-23 — formalise les garde-fous
> qui fondent la position « les points ne sont pas de la monnaie électronique »
> (Circ. BRH 121), en préparation d'un dossier de dialogue avec la BRH.

## État général du système (audit 2026-07-23)

Le socle SQL est **complet et durci** : 5 tables (`rewards_catalog`,
`points_batches`, `points_ledger`, `points_balances`, `coupons`), ledger
append-only, RLS lecture-seule, écritures uniquement via RPC `security definer`
révoquées du client (tests `P1→P6`, dont anti self-minting).

Mais il est **entièrement débranché** : aucun appel applicatif à
`award_points`, `redeem_points_for_coupon` ou `apply_coupon_to_order` ;
les jobs `expire_points_batch_job`/`expire_coupons_job` ne figurent pas dans
les crons (`vercel.json` : `reconcile` et `maturation` uniquement) ; aucune UI.
**Aucun point n'a donc jamais circulé.** Les écarts relevés ci-dessous sont à
corriger AVANT le câblage — pas en urgence sur un système vivant.

⚠️ Ne pas confondre les deux systèmes de coupons : `zabelie_coupons`
(coupons **vendeur**, branchés au checkout, BL-133) et `coupons` (récompenses
**points**, non branchés). Ce document ne concerne que le second.

---

## Règle 1 — Non-convertibilité en cash

**Règle.** Les points ne sont jamais retirables, ni virables vers un compte
bancaire ou mobile money, ni échangeables contre autre chose qu'une **remise en
pourcentage** appliquée à un achat sur Zabelie.

**Justification réglementaire.** La monnaie électronique (Circ. 121) suppose
une **valeur monétaire** stockée puis restituable. Un point qui ne peut devenir
que « −X % sur une commande, plafonné » n'a aucune valeur autonome : il
n'existe qu'appliqué à un prix. Couper tout chemin vers la valeur liquide est
la condition n°1 de la position défendue devant la BRH.

**État actuel : ✅ respecté (structurellement).**
- La seule sortie des points est `redeem_points_for_coupon`
  (`0021:269-345`) → un coupon de type `percentage` — l'enum `coupon_type`
  n'a **qu'une seule valeur** (`0021:44-47`), avec le commentaire réglementaire
  expliquant pourquoi le montant fixe HTG est proscrit.
- Aucune RPC ne crédite le wallet vendeur ou un rail de paiement depuis les
  points ; le money-path (`confirm_payment`, `wallet_transactions`) ne
  référence jamais les tables de points.
- La remise est doublement bornée : `discount_percentage between 1 and 90` et
  `max_discount_htg` figés depuis le catalogue serveur (`0021:59-60`,
  `327-333`) — jamais fournis par le client.

**Point de vigilance** : `points_reason` contient `admin_adjustment`
(`0021:39`). Un ajustement admin ne peut créer que des points (jamais du
cash), c'est acceptable — mais tout usage devra être motivé dans
`metadata` (traçabilité du dossier BRH).

---

## Règle 2 — Intransférabilité entre comptes

**Règle.** Un utilisateur ne peut jamais transmettre ses points (ni ses
coupons de récompense) à un autre compte. Chaque solde est strictement lié à
un `user_id` unique.

**Justification réglementaire.** La circulation entre comptes est le critère
« accepté comme moyen de paiement par des tiers » : des points transférables
deviennent un réseau de valeur, donc un quasi-instrument de paiement. Le
circuit fermé mono-compte est ce qui distingue une mécanique de fidélité d'un
wallet.

**État actuel : ✅ respecté (par absence de tout chemin), avec un point à
verrouiller au câblage.**
- Toutes les tables sont indexées `user_id → auth.users` ; RLS
  `select using (auth.uid() = user_id)` (`0021:191-198`) ; **aucune** RPC de
  transfert n'existe ; écritures directes révoquées (`0021:201-205`), y
  compris via fonctions (test `P6`).
- `apply_coupon_to_order` vérifie `code = p_code AND user_id = p_user_id`
  (`0021:368-370`) : un coupon volé/partagé est inapplicable par un autre
  compte.
- Il n'existe pas de contrainte déclarative « anti-transfert » (rien
  n'empêcherait le `service_role` d'écrire un débit chez A et un crédit chez
  B), mais c'est le cas de tout le schéma — la protection est l'absence de
  code chemin + la présente règle normative. Acceptable ; à re-vérifier à
  chaque revue de PR touchant aux points.

**Cas diaspora (à graver au moment du câblage — écart préventif).**
Un acheteur peut payer pour un bénéficiaire tiers. Dans le code actuel, le cas
concret est la **recharge** (`zabelie_topup_orders.beneficiary_phone` ≠
acheteur) ; les produits digitaux se livrent à l'acheteur. Règle
d'implémentation : les points s'attribuent **toujours au payeur**
(`orders.buyer_id` / `zabelie_topup_orders.buyer_id`), **jamais** au
bénéficiaire de la livraison. `award_points` reçoit `p_user_id` sans opinion
(`0021:212-219`) — c'est l'appelant qui devra passer `buyer_id`. Toute future
« adresse de livraison » ou « bénéficiaire nommé » ne change PAS le
destinataire des points.

---

## Règle 3 — Plafond de solde par compte

**Règle.** Un compte ne peut pas accumuler de points au-delà d'un plafond
configurable. Au-delà, l'accumulation **s'arrête** (les achats ne créditent
plus) jusqu'à consommation partielle du solde. Valeur de départ à trancher par
le porteur : l'équivalent de **2 000–3 000 HTG** de remise maximale.

**Justification réglementaire.** Un solde non plafonné peut devenir une
réserve de valeur significative — l'argument « accessoire de fidélité » ne
tient que si l'encours par tête reste dérisoire face à un wallet. Le plafond
borne aussi le risque comptable (provision) et le fraude-farming.

**État actuel : ❌ ABSENT — écart principal de cet audit.**
- `award_points` crédite sans aucune borne (`0021:243` : simple addition) ;
  `points_balances.balance` n'a qu'un `check (balance >= 0)` (`0021:121`).
- **Proposition d'implémentation** (à coder après « go », migration dédiée) :
  - table de configuration `points_limits (key, value)` sur le modèle de
    `zabelie_topup_limits` (`0010`/`0029`) — jamais de valeur en dur ;
  - clé `max_balance_points`. Les points n'ayant pas de valeur HTG fixe, le
    plafond s'exprime **en points**, calibré sur le catalogue : au barème
    actuel (900 pts → −15 % plafonné 1 500 HTG, `0021:67-70`), un plafond de
    **1 800–2 000 points** ≈ deux coupons majeurs ≈ 3 000 HTG de remise
    maximale ;
  - contrôle DANS `award_points`, sous le verrou `for update` déjà pris
    (`0021:238-241`) : crédit **écrêté** au plafond (`least`) plutôt que
    refusé, avec le surplus tracé dans `metadata` (dossier BRH : la preuve que
    l'accumulation s'arrête).

---

## Règle 4 — Expiration resserrée, consommation FIFO

**Règle.** Tout lot de points expire dans une fenêtre courte — **norme : 180
jours maximum** — et la consommation suit strictement le FIFO par date
d'expiration.

**Justification réglementaire.** Une valeur qui s'évapore n'est pas une
réserve de valeur — l'expiration courte est un marqueur fort de « fidélité »
vs « monnaie ». Le FIFO garantit que l'encours est toujours le plus jeune
possible.

**État actuel : ✅ mieux que la cible sur la durée, ❌ non exécuté en pratique.**
- Défaut actuel : `p_expires_in_days integer default 90` (`0021:217`) —
  **90 jours, plus strict que les 6 mois proposés**. Aucun ajustement à la
  baisse nécessaire ; la norme fixe le **plafond** : aucun appelant ne doit
  passer > 180 jours (le paramètre n'est pas borné en base — à borner dans la
  même migration que la Règle 3 : `check`/`raise` si dépassement).
- FIFO : implémenté à la rédemption (`order by expires_at asc`,
  `0021:303-316`) et testé (`P2`).
- **Écart d'exécution** : `expire_points_batch_job` (`0021:394-427`) n'est
  **appelé nulle part** — ni cron Vercel (`vercel.json`), ni route API. Sans
  planification, rien n'expire réellement. À brancher AVANT le premier point
  attribué (route protégée type `/api/reconcile` + entrée cron quotidienne,
  même convention `CRON_SECRET`).

---

## Barème d'acquisition (référence — PAS à coder maintenant)

Validé dans son principe, à câbler plus tard dans l'ordre du plan ci-dessous :

| Événement | Points | Note |
|---|---|---|
| Achat **maturé J+7** | ~1 point par tranche de 1 % de la valeur | Jamais avant maturation — aligné sur l'escrow vendeur (`/api/maturation`) : pas de points sur une vente encore annulable |
| Achat chez un vendeur **Elite** | bonus ×1,5 | Cohérent avec la commission réduite Elite |
| Parrainage | points fixes **au premier achat maturé du filleul** | Jamais à l'inscription (anti-farming de comptes) ; les deux enums existent déjà (`referral_bonus_referrer`/`referee`, `0021:32-33`) |

Le déclencheur naturel est le job de **maturation** (déjà idempotent, déjà
cron) — pas `confirm_payment` : on n'attribue des points que sur de l'argent
définitivement acquis.

---

## Synthèse de l'audit et priorités

| # | Règle | État du code | Écart |
|---|---|---|---|
| 1 | Non-convertibilité | ✅ respecté | — (vigilance `admin_adjustment`) |
| 2 | Intransférabilité | ✅ respecté | Règle « points au payeur » à graver au câblage |
| 3 | Plafond de solde | ❌ absent | **Écart n°1** — migration config + écrêtage dans `award_points` |
| 4 | Expiration ≤ 180 j FIFO | ✅ durée (90 j) / ❌ exécution | Job d'expiration jamais planifié ; borner `p_expires_in_days` |

**Ordre proposé pour la suite (chaque étape = une PR, après « go ») :**
1. **Plafond de solde** (Règle 3) + borne 180 j sur `p_expires_in_days`
   (Règle 4) — une seule migration, avec tests SQL (modèle P1-P6).
2. **Planification de l'expiration** (Règle 4) — route cron protégée +
   `vercel.json` ; sans elle, aucun point ne doit être attribué.
3. **Câblage de l'attribution** (barème, sur le job de maturation, indexé
   `buyer_id` — Règle 2 diaspora) puis UI d'échange points → coupon.

Rien de tout cela n'est urgent tant que le système reste débranché ; en
revanche, **l'ordre est contraignant** : ni attribution ni UI avant les
étapes 1 et 2.
