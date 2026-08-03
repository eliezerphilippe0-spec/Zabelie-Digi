# Zabelie Digi — Paiement des missions à jalons (façon Upwork)

> **📋 DOCUMENT DE DESIGN — AUCUN CODE ÉCRIT.** Ce document est soumis à revue
> avant toute implémentation, exactement comme le brouillon fidélité (PR #12,
> gelée en attente d'un retour BRH). Ici il n'y a pas de question réglementaire
> nouvelle (voir §9) — la revue porte sur l'**architecture et la sécurité**,
> parce que cette fonctionnalité touche directement le money-path.

---

## 0. Pourquoi ce chantier est traité différemment des autres

Ce n'est pas « le plus gros » chantier de la comparaison avec les grandes
marketplaces — c'est **le plus sensible**, et il faut être honnête sur
pourquoi. L'historique de ce projet montre que cette surface précise (argent,
escrow, prix) est celle qui a déjà coûté cher :

- **PR #5** a dû ajouter en urgence du RLS manquant sur `platform_earnings` et
  `escrow_entries` — sans policy, ces tables financières étaient exposées à
  l'API REST Supabase.
- Le checkout a été patché après une faille où le **prix pouvait être
  falsifié côté client** — c'est exactement pour ça que `price_htg` (et
  aujourd'hui, dans le brouillon fidélité, `discount_percentage`) est
  **toujours résolu côté serveur**, jamais reçu du client.
- L'audit de sécurité complet mené sur ce projet (PR #11) a trouvé et corrigé
  un open redirect et une config SSRF latente — la rigueur appliquée là doit
  s'appliquer ici aussi, dès la conception.

Un système de paiement de missions à jalons est **structurellement une
nouvelle brique du money-path** (nouveaux déclencheurs de libération de fonds,
nouveaux états, nouvelle relation acheteur↔vendeur dans le temps). Elle
mérite le même traitement que n'importe quelle modification de
`confirm_payment` : conçue d'abord, relue avant code.

---

## 1. Ce qui existe déjà et sera réutilisé (pas réinventé)

| Pattern déjà en prod | Où | Réutilisation prévue pour les missions |
|---|---|---|
| Idempotence en base (clé unique) | `confirm_payment`, `zabelie_topup_confirm_payment` | Chaque financement de jalon = sa propre clé d'idempotence |
| Confirmation serveur-à-serveur uniquement | Tous les rails (`docs/03-PAIEMENTS.md`) | Identique — aucune libération sur un simple retour navigateur |
| Verrou de ligne + garde-fou montant | `confirm_payment` (`FOR UPDATE`, montant vérifié) | Identique sur le financement de chaque jalon |
| Valeur résolue **côté serveur**, jamais reçue du client | Coupons (`reward_id`/`code` → serveur résout le prix), plafonds topup | Le montant d'un jalon vient de la **mission enregistrée**, jamais d'un champ envoyé par le client au moment du paiement |
| Pipeline **totalement séparé** du money-path marketplace existant | Topup (V-11) — « pas de commission, pas d'escrow, pas d'écriture wallet » | Inverse ici : les missions **doivent** toucher commission/escrow/wallet (c'est le but), mais via un pipeline dédié, pas en surchargeant `orders`/`payments` |
| Checkpoint humain pour les cas ambigus | `refund_order` (admin), remboursement topup (moyen d'origine + preuve) | Tout litige de jalon passe par un admin, jamais une résolution automatique de dispute |
| Machine à états stricte, transitions whitelist | `zabelie_topup_transition` (transitions interdites → exception) | Le cycle de vie d'un jalon (§5) suit le même principe |

---

## 2. Modèle conceptuel

- **Mission** : un contrat entre un acheteur et un vendeur (talent), composé
  d'un ou plusieurs **jalons**. Créée par le vendeur ou l'acheteur (à trancher
  en revue — Upwork la fait naître d'une offre acceptée), acceptée par les
  deux parties avant tout paiement.
- **Jalon (milestone)** : une unité de travail avec sa propre description et
  son propre **montant en HTG**, financée et libérée indépendamment des
  autres jalons de la même mission.

**Hors périmètre v1** (explicitement exclu, à ne pas coder sans nouvelle
décision) :
- Facturation à l'heure / time-tracking (complexité disproportionnée pour un
  MVP — litiges sur les heures, logiciel de suivi, facturation hebdomadaire
  automatique).
- Missions multi-vendeurs sur un même jalon.
- Renégociation du montant d'un jalon après financement (un jalon financé est
  figé ; un changement de scope = nouveau jalon).

---

## 3. Décision d'architecture : pipeline séparé, comme le topup

**Recommandation : tables dédiées** (`missions`, `mission_milestones`,
`mission_payments`, `mission_ledger`), **pas** une extension d'`orders`/
`payments`.

Justification :
1. `orders`/`payments` encodent une hypothèse forte — **un** produit, **un**
   paiement, livraison **immédiate** après confirmation. Les missions cassent
   cette hypothèse (financement étalé dans le temps, libération conditionnée
   à une approbation humaine, pas à la confirmation du paiement seule).
2. Le projet a déjà un précédent réussi pour « nouveau flux financier,
   invariants voisins mais distincts » : le topup (V-11) a délibérément évité
   de toucher `orders`/`payments`/`wallets` pour ne pas fragiliser le
   money-path testé. Même logique ici, dans l'autre sens (les missions
   *doivent* toucher wallets/escrow/commission, mais via leurs propres
   fonctions `SECURITY DEFINER`, pas en insérant dans les tables existantes).
3. `escrow_entries` et `wallet_transactions` restent le point d'**arrivée**
   commun (le wallet vendeur ne doit pas savoir d'où vient l'argent) — les
   missions y créditent net comme le fait `confirm_payment` aujourd'hui, mais
   via une fonction dédiée `mission_release_milestone(...)`, pas en
   réutilisant `confirm_payment` tel quel (dont la sémantique — commande
   unique, livraison immédiate — ne correspond pas).

---

## 4. Financement : par jalon, pas la mission entière d'un coup

Le jalon est financé **individuellement**, au moment où le travail commence
dessus — pas la mission entière payée d'avance :
- Expose moins d'argent à la fois (protection acheteur — si le vendeur ne
  livre jamais le jalon 2, l'acheteur n'a pas payé le jalon 3).
- Chaque financement de jalon est un événement isolé, testable indépendamment
  (même discipline que `confirm_payment` : idempotent, vérifié, tout seul).
- Le rail de paiement (MonCash aujourd'hui, Stripe/Zelle si activés) reste
  identique à l'existant — un jalon se finance exactement comme une commande
  se paie aujourd'hui.

---

## 5. Cycle de vie d'un jalon (proposition, machine à états stricte)

```
created → funding_pending → funded → delivered → approved → released
                                          │            │
                                          │            └──► disputed → (admin) → released | refunded
                                          └──► disputed → (admin) → refunded
```

- `created` — jalon défini (description + montant), pas encore financé.
- `funding_pending` → `funded` — même flux que le checkout actuel (rail
  choisi, paiement confirmé serveur-à-serveur, montant vérifié contre le
  jalon enregistré). **Aucune libération ici** — c'est juste l'argent qui
  entre en séquestre (`escrow_entries`, statut `maturing`-équivalent mais
  **sans date de maturation fixe** — voir §6).
- `delivered` — le vendeur marque le jalon comme livré (déclaratif, pas un
  transfert d'argent).
- `approved` — l'acheteur confirme explicitement. **C'est ce qui déclenche la
  libération**, pas la simple confirmation du paiement (divergence
  volontaire avec le modèle produit — voir §6).
- `released` — net crédité au wallet vendeur (`pending_htg`, même mécanique
  que l'escrow actuel), commission enregistrée dans `platform_earnings`.
- `disputed` — l'acheteur (ou le vendeur, en cas de non-paiement après
  livraison confirmée) signale un litige au lieu d'approuver. Gèle le jalon
  — **aucune transition automatique** tant qu'un admin n'a pas tranché
  (même philosophie que `refund_order` : checkpoint humain, pas de logique
  auto de résolution de dispute). **Le passage en `disputed` suspend le
  compteur d'auto-approbation** (voir ci-dessous) — il ne l'ignore pas
  silencieusement : une ligne `mission_ledger` explicite trace le gel
  (`counter_paused`, avec la date et l'auteur du signalement), et une autre
  trace la reprise si l'admin renvoie le jalon en `delivered` sans trancher.
  Un litige ne doit jamais se transformer en auto-approbation surprise parce
  que le délai a couru pendant que quelqu'un l'examinait.
- **Auto-approbation par délai** : si l'acheteur ne réagit pas N jours après
  passage en `delivered` (proposition : 14 jours, à valider porteur), le
  jalon passe automatiquement en `approved` puis `released` — évite un
  argent bloqué indéfiniment par une simple inaction. Nécessite un job cron,
  même modèle que `mature_wallets`/`expire_points_batch_job`.
  - **Notification vendeur à J+11** (3 jours avant l'auto-approbation, proposition
    à valider porteur) : un e-mail informe le vendeur que le jalon approche de
    l'auto-approbation — utile en pratique (le vendeur peut relancer l'acheteur)
    et rassurant (l'auto-approbation n'est jamais une surprise totale). Même
    mécanique que les e-mails transactionnels existants (`lib/zabelie-notify.ts`),
    best-effort, ne bloque jamais le cron si l'envoi échoue.
  - **Le compteur est suspendu, pas ignoré, en cas de litige** : si le jalon
    passe en `disputed` avant J+14, le job cron ne doit **pas** le traiter — le
    filtre du job exclut explicitement `disputed`, et la reprise (si l'admin
    renvoie le jalon en `delivered`) redémarre un délai neuf de 14 jours à
    partir de la date de reprise, jamais un reliquat du compteur initial (plus
    simple à raisonner, et plus juste pour l'acheteur qui vient de rouvrir la
    discussion).

Chaque transition = une ligne dans `mission_ledger` (**append-only**, même
garde-fou que `zabelie_topup_ledger` et `points_ledger`).

---

## 6. Le point de divergence volontaire avec le modèle produit

Aujourd'hui, un produit numérique se livre **instantanément** à la
confirmation du paiement — la maturation J+7 démarre donc dès le paiement
(le risque, c'est un remboursement après-coup, pas une non-livraison, puisque
la livraison est automatique).

Pour une mission, le travail n'est **pas** automatique — il dépend d'un humain
qui livre puis d'un humain qui approuve. Faire démarrer la maturation J+7 dès
le *financement* du jalon n'aurait pas de sens (l'acheteur n'a encore rien
reçu). **Proposition : la maturation J+7 démarre à `approved`, pas à
`funded`.** L'argent reste en séquestre — sans horloge de maturation qui
tourne — pendant toute la durée du travail, aussi longtemps que ça prenne.

C'est le changement conceptuel le plus important de ce document et celui qui
mérite le plus de discussion en revue.

---

## 7. Commission et wallet

Même modèle que l'existant, sans changement : `commission_rate_bps(tier)`
appliqué au montant du jalon au moment de `released`, net crédité en
`pending_htg`, `platform_earnings` alimenté. Aucune nouvelle règle de
commission à inventer.

---

## 8. Sécurité — check-list à respecter à l'implémentation

- [ ] Toutes les fonctions d'écriture (`mission_fund_milestone`,
      `mission_approve`, `mission_dispute`, `mission_release_milestone`,
      `mission_admin_resolve`) en `SECURITY DEFINER`, `search_path` figé,
      **`revoke all ... from public, anon, authenticated`** — l'erreur exacte
      du brouillon fidélité initial (fonctions oubliées dans le REVOKE) à ne
      pas reproduire.
- [ ] RLS sur `missions`/`mission_milestones`/`mission_payments`/
      `mission_ledger` : lecture bornée à `auth.uid() = buyer_id OR
      auth.uid() = seller_id` ; **aucune** policy INSERT/UPDATE/DELETE pour
      `authenticated`/`anon` (miroir exact de `escrow_entries`/`orders`).
- [ ] Montant du jalon **toujours résolu depuis `mission_milestones`**,
      jamais reçu du client au moment du financement (même faille que le
      checkout produit à éviter : prix non falsifiable).
- [ ] Idempotence : `idempotency_key` unique par financement de jalon,
      vérifiable par un test de rejeu (3× confirmation ⇒ 1 seul crédit),
      même gabarit que `supabase/tests/payment_idempotency.test.sql`.
- [ ] Compte suspendu (`getSuspension`) bloque le financement d'un nouveau
      jalon, comme il bloque déjà le checkout produit et la publication.
- [ ] Test SQL dédié couvrant : financement → rejeu idempotent, montant
      falsifié rejeté, transition interdite refusée, litige gèle la
      libération, auto-approbation après délai, ledger immuable, **compteur
      suspendu par un litige ne déclenche jamais l'auto-approbation pendant
      le gel, et repart à 14 jours pleins (pas un reliquat) à la reprise**.
- [ ] Notification vendeur à J+11 : best-effort (échec d'envoi n'empêche
      jamais le cron de continuer), testée comme `zabelie_claim_notification`
      (marqueur idempotent — un jalon ne doit recevoir qu'un seul e-mail de
      rappel, même si le job tourne plusieurs fois avant J+14).

---

## 9. Pourquoi ce n'est PAS une nouvelle question BRH (contrairement aux points de fidélité)

Le programme de fidélité (PR #12) posait une vraie question réglementaire
neuve : un **solde de points acheteur** ressemble potentiellement à une
valeur monétaire stockée, d'où le mémo BRH en cours.

Le séquestre de mission est **structurellement identique** à l'escrow produit
qui tourne déjà en production sur Zabelie Digi (`escrow_entries`, maturation
J+7, commission) — c'est de l'argent **acheteur→vendeur** détenu
temporairement par la plateforme jusqu'à confirmation de livraison, exactement
le mécanisme déjà en place pour un produit numérique. Aucun solde acheteur,
aucune conversion, aucune valeur qui survit à la transaction. **Pas de mémo
BRH nécessaire pour ce chantier** — la vigilance ici est **technique et
sécuritaire**, pas réglementaire.

---

## 10. Prochaines étapes

1. **Cette revue** — valider ou amender : le modèle de jalons (§5), le point
   de divergence J+7 (§6), le délai d'auto-approbation (§5), le choix
   d'architecture séparée (§3).
2. Si validé : cadrage détaillé (schéma SQL précis, liste des fonctions,
   numéro de migration réel au moment de coder) — toujours en document avant
   la première ligne de SQL.
3. Implémentation en PR, avec la même discipline que tout le reste du
   projet : tests d'abord, harnais SQL complet, revue humaine avant fusion.
