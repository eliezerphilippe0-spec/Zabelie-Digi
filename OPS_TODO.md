# OPS_TODO — Zabelie

Actions opérationnelles côté porteur (aucune n'est du code). Les écarts de
réconciliation topup détectés par le cron doivent aussi être consignés ici.

## Backlog revue Team Agents (BL-xxx) — 2026-07-15

Source unique : `docs/REVUE-2026-07-15-team-agents.md` §4 (plan priorisé
complet, constats §3). Rien n'est exécuté sans « go » porteur, tâche par tâche.

- [x] **P0 (Critique/invariants) — FAIT (PR #29, 2026-07-16)** : BL-101
      (réconciliateur : états terminaux, `zabelie_expire_stale_payment`),
      BL-102 (products verrouillé), BL-103 (fichier exigé avant vente),
      BL-104 (nav mobile), BL-105 (taxonomie fermée). Migration **0024
      appliquée en prod** (vérifiée 4/4, scan sécurité inchangé).
- [x] **P1 (quick wins S) — FAIT (PR #31, 2026-07-17)** : BL-110 → BL-125
      (détail au rapport §4). Migration **0025 appliquée en prod** (trigger
      append-only `wallet_transactions`) ; correctif search_path en suivi
      immédiat, migration **0026 appliquée en prod** (PR #32).
- [x] **P2 (chantiers M/L) — FAIT (PRs #33-39, 2026-07-17)** :
      BL-130 parité i18n (#33), BL-131 reset mdp (#34), BL-132 polling paiement
      en attente (#35), BL-133 coupon consommé au paiement confirmé (#36,
      migration 0027), BL-134 pagination + recherche + index catalogue (#37,
      migration 0028), BL-135 fulfillment topup async (#38), BL-138 nettoyage
      Storage (#39). Toutes les PR sont fusionnées dans `main`. Migrations
      **0027 et 0028 appliquées en prod** (vérifiées : `coupon_id` sur
      `orders`, 3 index créés — procédure manuelle, connecteur Supabase
      indisponible au moment de la fusion).
      BL-136 (achat invité — décision produit) reste non traité, volontairement.
- [x] **BL-137 — ALERTE BRH — FAIT (PR #42, 2026-07-17)** : arbitrage porteur
      obtenu (fuseau + atomicité, les deux). Plafond journalier topup calculé
      sur le jour **America/Port-au-Prince** (plus UTC) ; contrôle rendu
      **atomique** (`zabelie_topup_reserve_order`, verrou par acheteur —
      vérifie tous les plafonds ET crée la commande dans le même appel).
      Migration **0029 appliquée en prod** (vérifiée : `prosecdef=true`,
      `search_path=public`).

Backlog Team Agents intégralement traité (P0 + P1 + P2 + alerte BRH). Seul
BL-136 (achat invité) reste explicitement en attente d'une décision produit.

- [x] **Audit du chantier 0024→0029 — FAIT (PRs #44-45, 2026-07-18)** :
      revue croisée (8 angles) de tout le travail de la revue Team Agents.
      4 bugs confirmés corrigés (#44) : budget de tentatives fulfillment
      topup (retard du checkpoint remboursement BRH), statut `disputed`
      absent du polling paiement, crash accueil/sitemap sur erreur Supabase,
      lien 404 du vendeur vers son propre brouillon. 6 constats qualité
      traités (#45) : code mort plafonds JS supprimé (source unique = SQL),
      1 aller-retour DB de moins au checkout, scans fusionnés dans
      `zabelie_topup_reserve_order`, règle d'atomicité documentée, hook
      `usePoll` partagé, pattern i18n « libellés en props » documenté.
      Migration **0030 appliquée en prod** (vérifiée : `bool_or` présent,
      `security definer`). Comportement inchangé — perf/dette uniquement.

## Recharge téléphonique (V-11)

- [x] Compte **Reloadly** créé (sandbox).
- [x] Clés `RELOADLY_CLIENT_ID` / `RELOADLY_CLIENT_SECRET` /
      `RELOADLY_MODE=sandbox` posées sur Vercel (**Preview uniquement**). Auth OK.
      ⚠️ Reloadly a des clés **séparées Sandbox / Live** — utiliser les **Sandbox**
      pour le test (sinon erreur `CREDENTIAL_VS_ENVIRONMENT_MISMATCH`).
      ⚠️ Inscription Reloadly : **email pro obligatoire** (gmail refusé).
- [ ] Synchroniser le catalogue : bouton **« Synchroniser le catalogue
      Reloadly »** dans `/admin` (plus de SQL manuel — récupère les
      `operatorId`/dénominations automatiquement). Les **coûtants réels**
      restent à affiner ensuite via le rapport de commissions Reloadly (le
      bouton pose un coûtant = valeur faciale en attendant).
      ⚠️ **Le sandbox Reloadly ne contient PAS Haïti** (Digicel/Natcom absents en
      test) → la synchro renvoie **0 produit** en sandbox. C'est donc une étape
      **de production** (clés Live + solde). Le code gère montants fixes **et**
      opérateurs « en plage » (RANGE) — durci le 2026-07-13.
- [ ] Vérifier les préfixes opérateurs (portabilité) : la détection
      `lib/zabelie-topup/phone.ts` pré-remplit seulement, l'acheteur confirme.
- [ ] **Checkpoint humain avant production** : bascule `RELOADLY_MODE=production`
      uniquement après tests sandbox complets (paiement MonCash réel +
      recharge testée sur vos propres numéros).
- [ ] Consigner ici tout écart remonté par le cron (`/api/reconcile`,
      champ `topup.discrepancies`).
- [ ] **Avant d'ouvrir `/rechaj`** : bout-en-bout sandbox complet
      (`docs/07-TOPUP.md §4.3`) sur un déploiement Preview — la page s'active
      dès que les clés Reloadly sont posées, donc pas de clés en Production
      avant la fin de cette liste.

## Application des migrations — journal

> Une ligne par groupe appliqué. L'**heure UTC** compte autant que la date :
> si quelque chose bouge dans les jours qui suivent, c'est ce qui permet de
> corréler avec les journaux Vercel et Supabase. Sans elle, on compare des
> impressions.

| Groupe | Environnement | Début (UTC) | Fin (UTC) | `zabelie_solvency_report()` avant / après | Par |
|---|---|---|---|---|---|
| A (0032-0034) | prod zabelie-digi | 2026-07-26T21:06Z | 21:12Z | zéros / zéros identiques (ok=true) | connecteur (session Claude, go porteur) |
| B1 (0035-0036) + 0039 | prod zabelie-digi | 21:14Z | 21:17Z | inchangé (ok=true) | idem |
| 0042 puis 0041 | prod zabelie-digi | 21:17Z | 21:18Z | inchangé (ok=true) · backfill 0 ligne | idem |
| _restent : 0031 (fidélité) · 0037/0038/0040 (B2, revue séparée)_ | | | | | |

⚠️ **Trois contrôles restent NON ÉPROUVÉS** — la base était vide le jour de
l'application : le rapport de solvabilité à `ok=true` sur zéro ligne, le
contrôle croisé avant/après (zéro comparé à zéro), et le backfill de
`order_ref` (0 ligne touchée). Ils prouvent que le code s'exécute, pas qu'il
calcule juste. **Leur premier vrai test aura lieu à la première commande** —
relire les trois à ce moment-là, pas avant.

- [ ] **Corriger les empreintes du registre** — exécuter
      `ops/registre-empreintes-canoniques.sql` (8 lignes). Les empreintes
      enregistrées sont celles des fichiers alors que la chaîne appliquée
      avait des en-têtes abrégés : un signal de dérive qui se déclenche dès
      le premier jour est un signal qu'on apprend à ignorer.
- [ ] **Trancher l'accès en écriture de l'agent à la base de production.**
      Le connecteur Supabase a permis d'appliquer les migrations du 2026-07-26
      directement. Le « go » du porteur couvrait CES migrations ; il ne vaut
      pas autorisation permanente. À décider : on retire l'accès, on le garde
      en lecture seule, ou on le garde en écriture avec go explicite par lot.
      Tant que ce n'est pas tranché, aucune écriture supplémentaire.

Procédure : `docs/20-APPLICATION-MIGRATIONS-0032-0038.md` §B1.
La sortie de `zabelie_solvency_report()` va dans un **fichier horodaté**
(`ops/solvabilite-<phase>-<horodatage>.txt`), jamais seulement à l'écran :
c'est la référence de comparaison, elle doit survivre à la session.

## Paiements (rappels)

- [ ] **⚖️ D-4 — TRANCHER LE SENS DE L'ARRONDI (décision porteur).** `round`
      (état actuel, la fraction va à la plateforme) ou `floor` (elle va au
      vendeur, ≤ 1 HTG par vente). Personne n'a tranché : le porteur a donné
      un avis (`floor`) sans « go », l'agent recommande `floor`. À décider
      **avant la première vente** — le registre est append-only, chaque ligne
      écrite avant porte l'ancienne règle pour toujours. Analyse chiffrée :
      `docs/02` §D-4.
      **Si `floor` : trois gestes indissociables**, dans cet ordre —
      (1) appliquer `0044_commission_floor.sql` ; (2) passer
      `ROUNDING_IN_FORCE` à `"floor"` dans `lib/commission.ts` ;
      (3) redéployer. Les séparer fait promettre au vendeur une gourde de plus
      que ce que la base lui crédite. Puis inscrire l'empreinte au registre
      `0041`. Les annonces (FAQ, estimation vendeur, FR + KR) suivent
      automatiquement la constante — rien à réécrire à la main.
      **Si `round` : rien à faire**, `0044` reste au dépôt.
- [ ] **⚖️ D-5 — Commission minimale de 1 gourde ? (décision porteur).** Une
      vente assez petite ne rapporte rien à la plateforme : moins de 5 HTG
      sous `round`, moins de 10 (17 en Elite) sous `floor`. Sur un marché où
      des recharges à 25 gourdes existent, découper une vente en petites
      unités devient une stratégie. Deux sorties : **prix plancher** ou
      **commission minimale de 1 HTG dès qu'il y a vente** — la seconde ferme
      le seuil sans abîmer l'argument « l'arrondi va au vendeur ». Aucune
      n'est codée : c'est une règle commerciale. L'interface, elle, n'annonce
      plus « aucune commission à ce prix » — ne pas enseigner le
      contournement n'est pas le fermer.
- [ ] **Formulaire `/vendre/physique` — français en dur, sur une plateforme
      Kreyòl-first.** Tout le formulaire (libellés, aides, messages d'erreur)
      est écrit en FR dans `components/physical-product-form.tsx`, sans passer
      par `lib/i18n.ts`. C'est la surface vendeur du chantier physique. La
      ligne financière ajoutée le 2026-07-27 (estimation du net) passe, elle,
      par i18n — mais le reste reste à traduire, et c'est un chantier à part
      entière, à faire avant l'ouverture de la vente physique.
- [ ] **Palier Elite — décision porteur en attente (V-16).** Le taux 6 % n'est
      plus annoncé nulle part : `tier` est gelé côté client (`0015`/`0017`) et
      **aucun chemin n'attribue `elite`** — ni code, ni écran d'admin — et
      aucun document ne dit ce qui y donne droit. Pour le réannoncer il faut
      d'abord **écrire le critère** (ancienneté ? volume ? sélection à la
      main ?), puis la porte qui l'applique. Règle commerciale : c'est ta
      décision, pas la mienne. Sans urgence — aucun vendeur n'est concerné.

- [x] Migrations `0001` → `0019` appliquées sur Supabase (dont `0009`/`0010`
      topup) — `supabase/schema.sql` reste la concaténation à jour si besoin
      de rejouer sur un nouvel environnement.
- [x] Migrations `0020` → `0023` **appliquées** sur la prod Supabase le
      2026-07-13 (page service, points, Zabelie Business, durcissement du trigger
      fidélité) — via le SQL Editor (`docs/14-MIGRATIONS-SUPABASE.md`). Scan
      sécurité Supabase (`get_advisors`) : **propre** (alertes restantes = par
      conception, cf. session).
- [ ] **`NEXT_PUBLIC_SITE_URL` en Production AVANT tout test WhatsApp** —
      variable, redéploiement, puis UN lien envoyé. L'ordre est imposé par le
      cache d'aperçu persistant de WhatsApp (`docs/20`, § vérification
      production) : tester avant de la poser fige un aperçu `*.vercel.app`.
- [ ] **Transformations d'image Supabase** — vérifier qu'elles sont incluses
      dans le plan (Storage → Image Transformations). Si oui, poser
      `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM=1` : les photos produits passent
      d'une taille brute (jusqu'à 5 Mo) à ~40 Ko servis par le CDN, sans quota
      Vercel. Sans la variable, l'URL d'origine est servie telle quelle — plus
      lourd, jamais cassé. **Ne pas activer sans vérifier le plan** :
      l'endpoint `render/image` répond en erreur s'il n'est pas inclus, et les
      photos disparaîtraient.
- [ ] **⭐ LA PREMIÈRE COMMANDE RÉELLE — priorité n°1, ne dépend de rien.**
      Publier un produit digital à 25 HTG et l'acheter soi-même en MonCash
      réel. Éprouve d'un coup les SEPT choses qui n'ont jamais traversé la
      production : `order_ref` sur une vraie ligne, `zabelie_solvency_report()`
      sur des données non nulles, l'identité de `0033`, la maturation d'escrow,
      le webhook MonCash réel, `/mes-achats` et les e-mails, la carte de
      partage WhatsApp. Un seul préalable, D-4 (l'arrondi), et il est
      décisionnel, pas technique — ni B2 ni B3. Mode d'emploi complet :
      `docs/22-PREMIERE-COMMANDE-REELLE.md`. **À faire avant tout nouveau
      développement.**
- [ ] **⚠️ D-4 avant la première vente** — voir §Paiements. `0044` est écrite,
      éprouvée et **non appliquée** ; elle est sûre dans les deux ordres (son
      remplacement de `confirm_payment` est conditionnel et s'abstient si une
      version B2/B3 avec stock est déjà en place). Ce qui manque n'est pas le
      code, c'est l'arbitrage.
- [ ] **Garde anti-auto-achat — avant toute mise en avant par le volume.**
      Vérifié : `app/api/checkout/route.ts` ne compare jamais
      `product.seller_id` à `user.id`. Un vendeur peut acheter son propre
      produit et gonfler ventes et avis. Sans conséquence aujourd'hui (aucun
      classement ne s'appuie sur le volume) — c'est précisément pourquoi
      « meilleures ventes / meilleurs vendeurs » doit rester hors périmètre
      tant que la garde n'existe pas.
- [ ] **Checkout invité — décision autonome.** Le checkout exige aujourd'hui
      une inscription. Ce que `0043` exige réellement n'est pas un COMPTE mais
      **un contact joignable enregistré à la commande** — ce qu'un checkout
      invité standard collecte. La décision peut donc se prendre **sans
      attendre** celle du canal, à la condition unique que le champ contact
      reste **obligatoire**. ⚠️ Non démontré comme contrainte active : il n'y
      a aujourd'hui aucun produit publié et **un seul compte** (le porteur) —
      personne n'a atteint le formulaire. Le chiffre à surveiller quand des
      liens circuleront : comptes créés **sans commande aboutie**.
- [ ] **Canal des avis acheteur — décision distincte, avant B3.** L'e-mail
      existe mais une adresse créée pour acheter n'est pas une adresse lue :
      l'acheteur type vit sur WhatsApp. SMS/WhatsApp = fournisseur, interdit
      sans validation (règle du dépôt). Voir `docs/21` §3 bis.
- [ ] Zelle : `USD_HTG_RATE`, `ZELLE_RECIPIENT`, `ZELLE_RECIPIENT_NAME`.
- [ ] Stripe (optionnel) : nécessite une entité US — voir `docs/04 §2 bis`.

## Écarts de réconciliation topup

_(à compléter au fil de l'eau — date, order_id, nature de l'écart, résolution)_
