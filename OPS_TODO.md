# OPS_TODO — Zabelie

Actions opérationnelles côté porteur (aucune n'est du code). Les écarts de
réconciliation topup détectés par le cron doivent aussi être consignés ici.

## ⏳ Registre des décisions en attente — `docs/25` §4.1

> **Relu à l'ouverture de chaque chantier, avant de choisir quoi construire.**
> La troisième colonne est la seule qui compte : une décision qui bloque six
> branches et une qui bloque un libellé n'ont pas le même poids, et sans la
> trace rien ne les distingue. Ce tableau est un **index** — le détail de
> chaque ligne est plus bas dans ce fichier, et c'est lui qui fait foi.
>
> Ne figure ici que ce qui attend une DÉCISION. La panne d'inscription
> ci-dessous n'en est pas une : c'est un défaut, et il passe devant.

| Décision | Depuis | Ce qu'elle bloque |
|---|---|---|
| ✅ ~~Branche de Production Vercel~~ — **RÉPONDU 2026-08-03 : `main`.** Dernier déploiement Production `bb5ee4a`, **2026-07-26**, soit la tête actuelle de `main` : le site en ligne est exactement `main`, sans décalage. | — | **Résolu — et c'est le pire des trois cas.** Le site public dit depuis le 26 juillet « Pièces auto et moto, livrées en Haïti », « digital & talents » et **« Instant »**, en 2 langues. Remplacée par la ligne suivante. |
| **🚨🚨 `SUPABASE_SERVICE_ROLE_KEY` — BLOCAGE FONCTIONNEL TOTAL DU STOCKAGE, + clé exposée hors du coffre le 2026-08-04** | 2026-08-04 | **RECLASSÉ le 2026-08-11 : ce n'était pas un item de sécurité en attente, c'est LE blocage du catalogue digital, et il précède `docs/22`.** Mesuré en base : `storage.objects` et `storage.buckets` ont `rls_activee = true` et **zéro policy** — donc TOUT passe par service-role, lecture comme écriture, pour tous les kinds. Corroboré : **0 objet dans tous les buckets**, couvertures comprises. Aucune écriture de stockage n'a jamais réussi depuis l'application. Conséquences : aucun vendeur ne peut attacher un livrable (le kind `fichier` est structurellement invendable), ni téléverser une image de couverture. Un vendeur qui essaie sur un BROUILLON lit « Produit introuvable » — la policy `products_seller_read_own` exige `auth.uid()`, qu'un client dégradé n'a pas ; sur un PUBLIÉ, la lecture passe (`products_public_read_published`) et l'échec se déplace au stockage, en message brut de RLS. Trace réelle : trois brouillons de « cours du créole », trois abandons, zéro fichier. ⚠️ L'ancienne estimation — « rien fonctionnellement, le site tourne parfaitement » — décrivait l'absence de symptôme OBSERVÉ, pas l'absence de symptôme : le chemin acheteur est instrumenté, le chemin vendeur ne l'est pas, donc ses échecs ne remontent nulle part. À révoquer chez Supabase et remplacer dans Vercel (Production **et** Preview), puis **retenter un téléversement et lire le message** — il date la panne. |
| ✅ ~~Faire arriver le chantier en ligne~~ — **FAIT 2026-08-03.** PR #55 fusionnée (`53fd939`), puis #56 · #57 · #58 · #59. `main` déployée en Production. | — | Résolu. Le site ne dit plus « Pièces auto et moto » ni « Instant », et porte quatre langues. |
| ✅ ~~Branche par défaut GitHub~~ — **FAIT 2026-08-03**, réglée sur `main`. | — | Résolu. |
| ✅ ~~Protection de `main`~~ — **FAIT 2026-08-03.** `build` · `e2e` · `sql-tests` exigés. | — | Résolu. ⚠️ Le premier réglage visait **toutes** les branches et bloquait toute poussée — les contrôles s'exécutant AU push, aucune branche ne pouvait naître (`GH013`). Corrigé pour ne viser que la branche par défaut. À savoir si la règle est un jour recréée. |
| ✅ ~~D-4 — sens de l'arrondi~~ — **CLOSE le 2026-08-03 : `floor`.** `0044` appliquée en base et au registre, PR #61 fusionnée, sonde à `accord`. Vérifié en base : 25 HTG → commission 2, net vendeur 23 ; les deux copies de la règle appellent le helper unique. | — | Résolu. La première vente réelle n'a plus de préalable décisionnel. |
| ✅ ~~Signature datée du réexamen `sharp`~~ — **SIGNÉE 2026-08-03, réexamen au 2026-11-03.** | — | Résolu. Deux événements rouvrent le dossier, le premier qui arrive gagne : la date, ou le premier téléversement vendeur. |
| **🔴 `Site URL` Supabase + `NEXT_PUBLIC_SITE_URL` Vercel** | 2026-08-04 | **La première commande réelle.** Le lien de confirmation renvoie vers `localhost:3000` — un vendeur qui s'inscrit croit que ça a échoué. Et sans `NEXT_PUBLIC_SITE_URL`, l'aperçu WhatsApp fige le mauvais domaine, avec un cache persistant : à poser **avant** tout partage. |
| **Appliquer `0051` (clairin) et `0052` (`label_es`)** | 2026-08-01 | Le rayon produits locaux, et l'espagnol complet du menu. Chacune porte sa garde. |
| **Appliquer `0053` (rétention 90 j)** | 2026-08-03 | Rien d'autre — mais elle borne la conservation de termes de recherche **en clair**. |
| **Poser `NEXT_PUBLIC_WHATSAPP_NUMBER=50937376615`** (Vercel, Production + Preview) | 2026-08-06 | Toutes les surfaces WhatsApp de la landing v2 (topbar, rail d'accueil, /aide) — masquées tant que la variable est absente. Numéro fourni par le porteur en session ; variable NEXT_PUBLIC → **redéploiement requis** après pose (valeur inlinée au build). |
| **Poser `NEXT_PUBLIC_CONTACT_EMAIL`** (Vercel) — valeur au choix du porteur | 2026-08-06 | La carte email de /aide, masquée sans elle. Même règle de redéploiement. |
| **Poser `SEARCH_FINGERPRINT_SALT`** | 2026-07-31 | Le capteur de demande : sans elle, rien n'est enregistré. ⛔ **Verrou** : la purge doit avoir tourné **une fois**, journal lu — donc cette décision dépend elle-même de la mise en ligne de `api-v1-tool-ready`. |
| **Arbitrer les trois valeurs de `0043`** — `shipment_deadline_days` (5), `auto_receive_days` (7), `post_receipt_maturation_days` (0) | 2026-08-09 | **Rien aujourd'hui, et c'est exactement le moment de trancher.** `0043` est appliquée : les trois valeurs sont EN BASE, à leurs valeurs *proposées*, parce qu'une table de config ne peut pas être vide. Proposées ≠ décidées. Elles se changent par `UPDATE`, sans migration, tant qu'aucune commande physique n'existe — après, chaque changement déplace une échéance de paiement sur des commandes en cours. Détail et raisonnement : `docs/21` §2. |
| **Appliquer `0054` (table de configuration des commissions)** | 2026-08-09 | Rien — le taux vit encore dans le `case` de repli (10 % / 6 % Elite), qui rend exactement les mêmes valeurs. Elle transforme un paramètre commercial en donnée modifiable sans migration, ce que la règle dure n°3 exige. Vérifié en base le 2026-08-09 : `zabelie_commission_config` absente. |
| ✅ ~~Appliquer `0058` (panier)~~ · ~~`0057` (12 catégories de services)~~ · ~~`0040`~~ — **FAIT le 2026-08-11.** | — | Résolu. Le panier fonctionne de bout en bout (icône, compteur, paiement ligne à ligne, PR #95 fusionnée). |
| ✅ ~~**B2 (`0037`/`0038`/`0040`)** — appliquée~~ — **FAIT le 2026-08-11.** | — | **Résolu : le stock est branché sur le chemin d'argent.** `confirm_payment` consomme le stock DANS la transaction du paiement, `refund_order` le relibère, et `zabelie_consume_stock_strict` remplace la survente silencieuse par une rupture explicite (commande `disputed`, vendeur NON crédité, vue `zabelie_stock_ruptures` pour l'admin). TTL de réservation porté à **120 min** — valeur prudente, ⚠️ **à confirmer contre le timeout réel MonCash**, ce qui reste un point ouvert (`0038` §1). Le repli 400-puis-rejeu de `lib/products.ts` a cessé. |
| **🔀 Fusionner les quatre PR Izikit — #87, #88, #89, #90** | 2026-08-11 | **Le journal d'audit admin, qui n'existe qu'à moitié.** `0055` est appliquée en base depuis le 2026-08-10 : la table `zabelie_admin_actions` est là, mais le code qui y écrit vit sur la branche de la #88, jamais fusionnée — **aucun acte d'administration n'est journalisé aujourd'hui**. Idem pour les sondes (#89) et la purge des avis (#90, migration `0056` ni fusionnée ni appliquée). Ordre de fusion : [#87](https://github.com/eliezerphilippe0-spec/uniondigitale/pull/87) → [#88](https://github.com/eliezerphilippe0-spec/uniondigitale/pull/88) → [#89](https://github.com/eliezerphilippe0-spec/uniondigitale/pull/89) → [#90](https://github.com/eliezerphilippe0-spec/uniondigitale/pull/90). `0056` s'appliquera APRÈS la fusion de la #90. |
| **🔑 Supabase → Auth → URL Configuration : la liste blanche de redirection** | 2026-08-11 | **Le lien « mot de passe oublié ».** Le correctif de code est livré, mais si l'URL de retour n'est pas autorisée, Supabase ignore `redirectTo` et renvoie sur le Site URL — l'utilisateur atterrit sur l'accueil, « rien ne se passe ». À poser dans **Redirect URLs**, les deux, à cause du couple nu/www : `https://zabelie.com/**` ET `https://www.zabelie.com/**`. Et **Site URL** = le domaine qui sert réellement le site. |
| ✅ ~~Appliquer `0055` (journal d'audit admin)~~ — **APPLIQUÉE le 2026-08-10 22:14Z**, hash `274f4a2b013a…` au registre. Ordre choisi : AVANT la fusion de #88, ce qui supprime la fenêtre 503 du fail-closed (la table précède le code). Prouvée en prod : trigger ZB055 sur UPDATE (transaction avortée, zéro ligne résiduelle), zéro droit client, requête day-J à 0 orphelin. **Reste le dernier demi-point : une mutation admin bénigne (suspension/réactivation d'un compte de test) APRÈS fusion+déploiement de #88, pour voir la ligne atterrir par la route — geste porteur, je relis la table ensuite.**  |
| **Poser `RESEND_API_KEY`** (et `EMAIL_FROM`) dans Vercel | 2026-08-09 | **Les avis de remise, donc l'auto-réception.** Sans la clé, l'expéditeur ne réclame RIEN — c'est voulu, une tentative consommée sans envoi épuiserait la borne — mais aucun avis ne part, le garde de légitimité retient, et chaque commande physique honorée remonte en file admin au bout de `auto_receive_days`. Le vendeur attend alors un humain à chaque vente. `docs/11-SECRETS.md` la liste déjà ; elle n'était encore réclamée par rien. |
| **Identifiants API MonCash — portail + 3 variables** (compte MonCash Business créé le 2026-08-10, formulaire d'URLs en cours) | 2026-08-10 | **Le rail de paiement principal.** Gestes, dans l'ordre : (a) portail MonCash → Website Url = l'URL `.vercel.app` de Production, Return Url = `…/api/moncash/return` (le champ CRITIQUE — `app/api/moncash/return/route.ts` attend `?transactionId=`), Alert Url = `…/mes-achats` ; (b) Vercel, Production **et** Preview : `MONCASH_CLIENT_ID`, `MONCASH_CLIENT_SECRET` (bouton **Reveal/Copy**, jamais une sélection du champ masqué — l'incident du caractère `•`), `MONCASH_MODE=sandbox` ; (c) **Redeploy** ; (d) le test de bout en bout `docs/05-TEST-SANDBOX.md` — dernier maillon avant la première commande réelle (`docs/22`). Au rattachement de `zabelie.com` : étape 2 bis du runbook ci-dessous (remplacer les 3 URLs du portail). |
| **D-6 — qui paie la remise de fidélité** | 2026-07-24 | L'attribution des points et leur UI. Décision encore **gratuite** : aucun point n'a jamais été émis, elle ne le sera plus après une ligne de grand livre. |
| **D-5 — commission minimale de 1 gourde** | 2026-07-26 | Rien. **Déclencheur nommé** : à trancher quand des articles sous 10 HTG apparaissent au catalogue. Un minimum rétablirait 20 % sur une vente à 5 HTG — soit ce que `floor` vient de corriger. |
| **Avis juridique BRH — rétention** (`docs/17`) | 2026-07-22 | Rien mécaniquement, et c'est le piège : la consigne est de ne rien construire qui **aggrave** la rétention. Sans réponse, l'aggravation se fait par petits pas. |
| **`USD_HTG_RATE` / opposabilité `expected_usd_cents`** | 2026-07-30 | Les rails Stripe et Zelle. Geste bloqué. |
| **Hygiène du registre `zabelie_schema_migrations` : les lignes à hash « - »** (0031, 0037, 0038, 0040 — présentes avec `applied_at` mais hash « - », alors que le schéma atteste leur non-application) | 2026-08-10 | Rien — mais l'ambiguïté a fait dérailler une prémisse de revue le jour même : « au registre » ne veut pas dire « appliquée ». Deux issues : purger ces lignes fantômes, ou ajouter un statut explicite `redigee/appliquee`. Petit arbitrage, sans urgence. **Règle actée en attendant (revue 2026-08-10) : toute application de migration se répète contre l'état APPLIQUÉ réel du schéma cible — jamais contre l'ordre des fichiers.** L'ordre a divergé durablement (0055 appliquée avant 0051→0054) : quand les dormantes sortiront de dormance, leurs répétitions d'hier seront invalides pour la même raison — à refaire sur schéma prod-conforme du moment. Un statut explicite au registre rendrait cet état interrogeable au lieu de reconstitué. |
| **Cinq clés i18n mortes à trancher** (`home.badge`, `sec.free.badge`, `product.pay.loading`, `order.ref`, `status.draft`) | 2026-08-03 | Rien — la plus légère du registre, et elle est ici pour cette raison : sans la trace, elle a le même poids visuel que D-4. |
| **« NatCash — bientôt » sur l'accueil** (`footer.natcash`, bandeau paiement + pied de page) | 2026-08-10 | Rien mécaniquement — mais la règle dure n°2 classe NatCash ⛔ (aucune API publique) et la pastille engage un calendrier qui ne dépend pas de nous (revue accueil, UX-02). Trois options : (a) retirer la pastille ; (b) reformuler sans promesse de calendrier (« pas encore disponible ») ; (c) l'assumer comme signal de demande. Zone d'arrêt promesse commerciale : rien ne bouge sans arbitrage. |
| **16 rayons « bientôt » ou repli à 4** | 2026-08-10 | Rien — conséquence assumée de l'activation 16/16 du 2026-08-10 (revue accueil, UX-05) : « bientôt » est le mot le plus répété du premier écran. Le SQL de repli à 4 est au journal des rayons ci-dessous ; l'alternative sans retour arrière est la première publication réelle (`docs/22`), qui éteint les badges du rayon concerné. |

## ✅ RÉSOLU — « la panne d'inscription » n'était pas une panne

**Diagnostiquée et close le 2026-08-04.** L'inscription fonctionnait depuis le
début. Ce qui était cassé, c'est **où le courriel de confirmation renvoyait**.

### Ce qui se passait réellement

Le champ **Site URL** de Supabase Auth était resté à `http://localhost:3000`,
sa valeur de développement. Donc : quelqu'un s'inscrit → **le compte est créé**
→ il reçoit le courriel → il clique → il tombe sur `localhost:3000`, une page
morte sur sa machine → **il conclut que l'inscription a échoué.**

Elle avait parfaitement réussi. C'est pour ça qu'aucun journal ne montrait
d'erreur : il n'y en avait pas.

### La preuve, mesurée le 2026-08-04

| | |
|---|---|
| second compte créé | `00:20:37` |
| confirmé | `00:21:01` |
| connecté | `00:21:40` |
| profil créé automatiquement | ✅ |

Et ce dernier point est un premier : **le déclencheur `0045_profile_on_signup`
s'est exécuté pour la première fois en production**. Il était appliqué depuis le
31 juillet sans qu'aucune inscription réelle ne l'ait jamais fait tourner.

### Ce que cette histoire coûte à la méthode

L'hypothèse principale tenue pendant des semaines — `NEXT_PUBLIC_SUPABASE_URL`
et `NEXT_PUBLIC_SUPABASE_ANON_KEY` absentes au build — était **fausse**. Le test
à deux écrans l'a réfutée en trente secondes : préversion ET production
affichaient un formulaire normal, ce qui était précisément la quatrième ligne du
tableau, celle qui disait « c'est autre chose ».

La leçon n'est pas « l'hypothèse était mauvaise » — elle était raisonnable. Elle
est que **le symptôme rapporté n'a jamais été vérifié**. « L'inscription ne
marche pas » décrivait l'expérience d'un utilisateur, pas l'état du système. Une
seule tentative réelle, en regardant les deux bouts en même temps, valait toutes
les déductions.

### ⏳ Reste à faire — deux réglages, aucun code

- [ ] **Supabase → Authentication › URL Configuration**
      - `Site URL` = le domaine de production (**pas** l'URL du tableau de bord
        `vercel.com/...`, qui est la page d'administration)
      - `Redirect URLs` : `https://<domaine>/**`, plus
        `https://*-eliezerphilippe0-1474s-projects.vercel.app/**` pour que le
        retour d'authentification fonctionne aussi sur les préversions
- [ ] **Vercel → Environment Variables › Production** : `NEXT_PUBLIC_SITE_URL`,
      **puis redéployer** — Next.js l'inline à la compilation, la poser ne
      suffit pas. C'est aussi l'étape 1 de `docs/22` : sans elle, l'aperçu
      WhatsApp fige le mauvais domaine, et son cache est persistant.
- [ ] **Vérifier** en créant un troisième compte : le lien du courriel doit
      ouvrir le site, pas `localhost`.

⚠️ Si le projet a un domaine personnalisé, c'est **lui** qu'il faut partout —
c'est l'adresse que les vendeurs verront dans leurs courriels et celle que
WhatsApp figera.

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

### Activations de rayons — journal

> Ce ne sont PAS des migrations : `zabelie_categories.active` est de la donnée
> d'exploitation, modifiable par `UPDATE`. Mais l'ouverture d'un rayon est une
> décision COMMERCIALE — elle promet un commerce — et une décision commerciale
> qui n'est écrite nulle part se reprend en boucle.

| Date (UTC) | Geste | Avant | Après | Par |
|---|---|---|---|---|
| 2026-08-09 ~23:0xZ | Les **12 départements restants** passés `active` | 4/16 | **16/16** | connecteur, sur demande explicite du porteur |

**Ce qui a été dit avant de le faire, et assumé** : avec **0 produit publié**,
seize rayons ouverts disent seize fois « rien ici » là où quatre en disaient
quatre. Les rayons sans produit s'affichent MARQUÉS et NON cliquables dans la
colonne (décision du 2026-08-02) — c'est ce qui empêche l'impasse muette.
L'ouverture reste défendable comme signal d'intention vers les vendeurs.

**Retour arrière, une ligne** — remet l'état du 2026-08-09 au matin :

```sql
update zabelie_categories set active = false
 where level = 1
   and slug not in ('otomobil-moto', 'elektwonik', 'bote-swen', 'dijital-sevis');
```

**Non touché** : les niveaux 2 et 3 (10/74 et 33/33 actifs). Les douze
départements ouverts n'ont donc aucun sous-rayon actif — ils apparaissent
seuls, sans arborescence, jusqu'à une activation de niveau 2.


> Une ligne par groupe appliqué. L'**heure UTC** compte autant que la date :
> si quelque chose bouge dans les jours qui suivent, c'est ce qui permet de
> corréler avec les journaux Vercel et Supabase. Sans elle, on compare des
> impressions.

| Groupe | Environnement | Début (UTC) | Fin (UTC) | `zabelie_solvency_report()` avant / après | Par |
|---|---|---|---|---|---|
| A (0032-0034) | prod zabelie-digi | 2026-07-26T21:06Z | 21:12Z | zéros / zéros identiques (ok=true) | connecteur (session Claude, go porteur) |
| B1 (0035-0036) + 0039 | prod zabelie-digi | 21:14Z | 21:17Z | inchangé (ok=true) | idem |
| 0042 puis 0041 | prod zabelie-digi | 21:17Z | 21:18Z | inchangé (ok=true) · backfill 0 ligne | idem |
| 0055 (audit admin) | prod zabelie-digi | 2026-08-10T22:14Z | 22:14Z | appliquée AVANT la fusion de #88 (supprime la fenêtre 503 du fail-closed) ; répétée sur schéma prod-conforme (sans les dormantes) avant application | hash `274f4a2b013a` |
| 0043 (suivi de remise) | prod zabelie-digi | 2026-08-09T19:05Z | 19:09Z | base vide : 0 commande, 0 paiement confirmé, 0 escrow, 0 produit physique | connecteur (session assistée, go porteur) |
| 0057 (catégories services) · 0040 (`in_stock`) · 0058 (panier) | prod zabelie-digi | 2026-08-11T03:12Z | 03:20Z | inchangé — aucune de ces trois ne touche un solde | connecteur (session Claude, go porteur) |
| **0037 + 0038 (B2 — stock sur le money-path)** | prod zabelie-digi | 2026-08-11T03:4xZ | 03:47Z | **0 portefeuille en écart, avant comme après** | idem. Empreintes exécutables des 4 fonctions identiques à une répétition CONFORME À L'ÉTAT APPLIQUÉ (0040 avant 0037, comme en prod), sonde éprouvée connu-positif ET connu-négatif |
| _restent : 0031 (fidélité, sautée) · 0051 · 0052 · 0053 · 0054 · 0056 (purge avis, verrouillée D-10→D-14)_ | | | | | |
### ⛔ La mutation bénigne ne peut PAS être exécutée par l'agent

**Constaté le 2026-08-11, après la fusion de #88.** Deux empêchements, aucun
contournable, et le second est le plus important.

1. **Aucune session admin.** La route `/api/admin/user-status` exige
   `getCurrentUser()` avec le rôle admin. L'agent n'a pas de session, et un mot
   de passe ne se demande pas.
2. **Le réseau de la session refuse `zabelie.com`.** Vérifié :
   `gateway answered 403 to CONNECT — host zabelie.com:443`, dans le journal du
   proxy. La production n'est pas joignable en HTTP depuis ici.

⚠️ **ET SURTOUT — il ne faut PAS la simuler.** L'agent a un accès service-role
à la base : il pourrait insérer une ligne dans `zabelie_admin_actions` en une
instruction. **Ce serait un faux.** La ligne serait indiscernable d'une vraie
dans la table, alors que sa provenance ne serait pas le code déployé mais
l'agent lui-même — exactement le geste que la règle dure n°5 existe pour
interdire, commis sur le journal d'audit, et pour sa PREMIÈRE ligne.

Ce qui doit être fait, par le porteur, dans cet ordre :

1. vérifier que Vercel a bien déployé `de898f68` (Production) ;
2. se connecter en admin, aller sur `/admin`, **suspendre puis réactiver** le
   compte de test — deux actes, deux lignes attendues ;
3. le dire ici.

Les quatre preuves seront alors mesurées côté base, dans la même session :
`zabelie_admin_actions` avec horodatage et `actor_id`, la forme `domaine.verbe`
de `action`, la requête intention-orpheline à zéro, et le fait que ces lignes
viennent du code déployé — pas d'une main.

### 📒 Les huit dettes du registre — nommées, aucune entamée (2026-08-11)

Mesurées, chacune avec sa requête. **Aucune ne se referme avant la fusion de
#87/#88** : le prochain geste est la fusion, pas une mesure de plus.

| # | Dette | Périmètre EXACT (mesuré) |
|---|---|---|
| 1 | **Registre incomplet** | **30 lignes** manquantes : `0001`→`0024` (présentes dans `supabase_migrations`, absentes du nôtre) **+ `0025`→`0030`** (dans AUCUN des deux journaux). Les six fichiers existent et leurs objets sont tous en schéma — vérifié : `zabelie_wallet_ledger_guard`, `products_status_created_idx`, `zabelie_topup_reserve_order` avec son `pg_advisory_xact_lock`, `zabelie_coupon_consume` dans `confirm_payment`. Backfill légitime (importer un enregistrement réel n'invente rien). ⚠️ La date d'application de `0025`→`0030` est **déduite par encadrement**, pas attestée : la ligne dira « présence constatée en schéma, application datée par encadrement `[0024, 0041]` », jamais une date. |
| 2 | **Divergence `0044_commission_floor`** | Déclarée appliquée chez nous (hash réel, 2026-08-03), **jamais vue par `apply_migration`**. Appliquée par un autre chemin. ⛔ **Attente d'attestation porteur** : « avez-vous appliqué `0044` via l'éditeur SQL vers le 3 août ? » Oui/non/je ne sais plus — les trois sont enregistrables. On inscrit une provenance **attestée**, jamais **déduite**. |
| 3 | **Les 16 `applied_by = 'postgres'`** | Ce n'est PAS un vide : c'est le rôle de connexion, un défaut qui se lit comme une réponse. À requalifier en `non renseigné (antérieur à règle 5)`. Les 7 autres portent `porteur (session assistee)` — vraie trace. |
| 4 | **`0031` à classer `abandonnee`** | Seule ligne ni en A, ni en B, ni en C. Hash `-`, absente de Supabase, sautée à dessein. `0062` la classera. |
| 5 | **Préambule de garde des migrations** | `apply_migration` ne consulte JAMAIS `zabelie_schema_migrations`. À adopter **pour les migrations à partir de son adoption**, jamais rétroactivement — l'injecter dans un fichier déjà haché changerait son empreinte. Hash divergent → `ZB0XX` bruyant, pas un skip. |
| 6 | **Chantier des dormantes** | Application ordonnée : lesquelles vivent, lesquelles passent `abandonnee`. Croise D-10→D-14 pour `0056`. |
| 7 | **D-10→D-14, avec la question `disputed`** | Posée dans `docs/28` : l'acheteur d'une commande `disputed` ne reçoit plus rien depuis `0061`. |
| 8 | **Revue des écrivains multiples par statut** | Instrument CANDIDAT (section dédiée plus bas). À passer une fois à la main avant le lancement. |

**Règle amont, appliquée sans exception** : toute assertion d'état sur une
table s'accompagne, **dans le même bloc**, de la requête qui l'a établie. Deux
assertions fausses ont été publiées le 2026-08-11 faute de ce geste — les deux
en lisant la STRUCTURE d'une table et en parlant de ses VALEURS.

### 📏 Règle — schéma et registre divergent : investiguer, jamais régulariser

Deux divergences sont possibles, elles n'ont pas la même gravité, et **aucune
ne se répare en silence**.

**A · Objet en base SANS ligne au registre.** Le cas grave : l'objet n'a pas de
provenance, donc aucun geste officiel ne l'a créé. Dater son arrivée avant
toute chose (journaux Supabase, historique de connexions), identifier le geste,
et n'appliquer la migration correspondante qu'ensuite — l'appliquer par-dessus
régulariserait l'anomalie au lieu de l'élucider. **Jamais constaté à ce jour.**

**B · Migration au registre dont le FICHIER n'est pas dans `main`.** ✅ **RÉSOLU le 2026-08-11** pour `0055` : PR #88 fusionnée (`de898f68`) sur signal porteur — le fichier est dans `main`, et le code qui écrit dans le journal est déployable. Reste `0056`, sur la branche de la #90. Constaté :
`0055_admin_audit.sql`, appliquée le 2026-08-10 22:14:26Z, hash
`274f4a2b013a05ec…` identique au fichier de la branche de #88 (vérifié le
2026-08-11 : table, deux index, trigger `zabelie_admin_actions_immutable`, RLS
active, 0 droit anon, 0 ligne écrite). L'ordre a été inversé **à dessein** —
appliquer avant de fusionner supprimait la fenêtre où le code fail-closed
déployé aurait appelé une table inexistante. C'est la fusion qui n'est pas
venue.

Conséquence à garder en tête : **un acte d'administration sur l'argent ne
laisse aucune trace aujourd'hui**, puisque le code qui écrit dans ce journal
vit sur une branche. `zabelie_admin_actions` compte 0 ligne, et ce zéro-là
n'est pas « rien à signaler » : c'est « personne ne peut écrire ».

⚠️ **Et `0062` dira `appliquee` pour `0055`** — correctement, puisqu'elle sonde
le SCHÉMA, pas le déploiement. Les deux faits sont vrais et distincts ; ne pas
complexifier `0062` pour les confondre. C'est `tests/migrations-suite.test.ts`
qui tient le second, par le trou de numérotation.

### 🧪 Scénarios que la répétition de `0060`/`0061`/`0062` DOIT couvrir

Sur socle prod-conforme à l'état appliqué réel, et pas seulement « ça passe » :

1. **`0062` appliquée après `0060`/`0061`** → les deux classées `appliquee`.
2. **`0062` appliquée SEULE**, sans `0060`/`0061` → les deux classées
   `redigee`, sans échec. Les sondes existent dans la migration ; elles n'ont
   **jamais été exécutées**.
3. **Ce que rend le registre PENDANT que `0062` le migre** — la colonne est
   ajoutée nullable, remplie, puis contrainte : vérifier qu'aucune lecture
   concurrente ne voit un état mi-classé.
4. **Objet déjà présent, version divergente** — le jour où #88 fusionne,
   `0055` sera rejouée sur une table qui existe. Elle utilise `create table`
   sans `if not exists` : elle **échouera bruyamment**, ce qui est le bon
   comportement — mais il faut l'avoir vu une fois plutôt que le découvrir.

### 🔬 Instrument CANDIDAT — revue des écrivains multiples par statut

**Non construit. Noté pendant que la liste est fraîche, à mesurer avant de
l'outiller — la même discipline que pour le reste.**

D'où ça vient : la meilleure prise du 2026-08-11 n'a été trouvée ni par la CI,
ni par le harnais de mutation, mais par une **question de forme fixe** —
*« combien de fois cette colonne de statut change-t-elle, et dans quelles
branches ? »*. Posée sur `payments.status`, elle a révélé que `confirm_payment`
écrit `'confirmed'` en DEUX endroits (`0038:176` et `0038:189`), et que le
premier est la branche de rupture de stock. Un trigger posé là aurait envoyé un
reçu de vente pour une marchandise que l'acheteur ne recevrait jamais.

Ce qui rend la question outillable : elle ne dépend d'aucune connaissance
métier. Elle se pose **mécaniquement sur n'importe quelle colonne de statut du
schéma** — `orders.status`, `payments.status`, `escrow_entries.status`,
`zabelie_fulfillment.status`, `zabelie_topup_orders`… : lister tous les sites
d'écriture, et pour chaque valeur cible, vérifier que les branches qui y mènent
sont bien celles qu'on croit.

**À faire tourner UNE FOIS avant le lancement**, à la main s'il le faut. Si la
passe manuelle trouve quelque chose, alors seulement écrire l'outil : un
instrument construit avant d'avoir mesuré son trou rendrait zéro et paraîtrait
sain.

### ⚠️ `confirm_payment` rouge peut vouloir dire « outbox », pas « MonCash »

**À savoir AVANT le premier incident, pas pendant.** Depuis `0061`, le dépôt du
reçu se fait par trigger DANS la transaction de `confirm_payment`. C'est ce qui
rend le reçu inséparable du commit de l'argent — et c'est donc du **fail-closed
sur le reçu** : si l'insertion en outbox échoue, `confirm_payment` échoue avec
elle, et le paiement n'est pas confirmé.

Choix assumé, pour une raison précise : un paiement **non confirmé** est
exactement le cas que le réconciliateur (`/api/reconcile`, 12:00) sait
reprendre — l'inverse du cas fermé par `0061`, où la commande déjà réclamée ne
repassait jamais. L'argent a bien quitté MonCash ; il sera confirmé au passage
suivant.

**Lecture d'incident.** Un `confirm_payment` en erreur ne désigne pas
forcément l'opérateur. Regarder aussi `zabelie_outbox` et `auth.users` (le
trigger y lit les adresses). Une adresse introuvable ne bloque rien — le
trigger n'insère alors aucune ligne, à dessein.

### Contrôle day-J — outbox des confirmations de vente (0061)

⚠️ **À lire dès le lendemain de l'application de `0061`, et pas plus tard.**
`RESEND_API_KEY` n'est pas posée : les lignes vont donc s'accumuler **par
construction**, et cette accumulation doit être un chiffre qu'on lit, pas un
silence. Un compteur à zéro sur cette requête ne voudra rien dire tant que la
clé manque — c'est « aucun cas possible », pas « aucun cas ».

```sql
-- Confirmations de vente en souffrance. Trois colonnes, trois lectures.
select
  count(*) filter (where sent_at is null and abandonne_a is null
                     and created_at < now() - interval '1 hour') as pendantes_1h,
  count(*) filter (where abandonne_a is not null)                as abandon_terminal,
  count(*) filter (where sent_at is not null)                    as parties
from zabelie_outbox;

-- Le détail de ce qui est mort, avec la raison — jamais un simple total.
select order_id, kind, attempts, left(last_error, 120) as erreur, abandonne_a
  from zabelie_outbox
 where abandonne_a is not null
 order by abandonne_a desc
 limit 20;
```

**Lecture.** `abandon_terminal > 0` veut dire qu'un acheteur a payé et n'a
jamais su que son argent était arrivé — cinq tentatives épuisées. Ce n'est pas
une statistique, c'est une liste de personnes à recontacter, et `last_error`
dit pourquoi. `pendantes_1h` élevé avec `abandon_terminal = 0` désigne le
fournisseur, pas les messages.
### Contrôle day-J — intentions d'audit orphelines (fail-closed 0055)

Le fail-closed écrit la trace AVANT la RPC : une ligne d'intention sans
résultat corrélé signifie « un admin a ordonné un acte d'argent qui n'a pas
abouti » — à lire au jour le jour, pas à découvrir en incident. La clé de
jointure est `target_id` = `orders.id` (qui joint `payments.idempotency_key`
et `orders.order_ref`). À exécuter chaque matin tant qu'un tableau de bord
ne le porte pas :

```sql
-- Intentions refund/confirm-zelle des dernières 24 h sans résultat corrélé.
-- 0 ligne = tout ce qui a été ordonné a abouti (ou était un doublon idempotent).
select a.created_at, a.action, a.actor_id, a.target_id, o.order_ref
from zabelie_admin_actions a
left join orders o on o.id::text = a.target_id
where a.created_at > now() - interval '24 hours'
  and (
    (a.action = 'order.refund'
       and (o.id is null or o.status <> 'refunded'))
    or
    (a.action = 'payment.confirm_zelle'
       and not exists (
         select 1 from payments p
         where p.idempotency_key = a.target_id
           and p.status = 'confirmed'))
  )
order by a.created_at desc;
```

Lecture : `order.refund` orphelin = la RPC a refusé (commande introuvable,
état invalide) APRÈS que l'ordre a été tracé — c'est le comportement voulu,
la tentative est l'événement. Un volume anormal d'orphelins, en revanche,
est un signal (admin qui insiste, bug de route, base qui refuse).


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

- [ ] **`0046_policy_acceptance.sql` — attestation vendeur (R3).** Écrite,
      éprouvée sur Postgres jetable, **non appliquée**. Sans elle, les deux
      routes de création répondent 500 « Enregistrement de l'attestation
      impossible » : la case est déjà exigée côté serveur, mais la fonction
      `zabelie_record_policy_acceptance` n'existe pas encore en base.
      **Donc : appliquer 0046 AVANT de déployer, ou déployer et appliquer dans
      le même geste.** C'est le seul endroit de ce chantier où le code est en
      avance sur le schéma d'une façon qui BLOQUE, au lieu de dégrader.
      ⚠️ **Le coût d'une erreur d'ordre n'est pas une fiche, c'est une
      personne.** Les fiches qui échoueraient sont celles des vingt premiers
      vendeurs, recrutés un par un : un 500 à la publication devant l'un
      d'eux ne se répare pas par un correctif le lendemain.
      **Deux ceintures, qui ne remplacent pas l'ordre de déploiement :**
      `/api/admin/coherence` porte désormais `schemaRequis` — il crie si
      `0046` manque au journal, AVANT qu'un vendeur soit dans la pièce ; et
      si personne n'a regardé, la route de création journalise l'identifiant
      `0046` côté serveur pendant que le vendeur, lui, ne lit qu'une phrase
      courte (503, rien d'enregistré, réessayer).

- [ ] **`0047_search_demand.sql` — capteur de demande (lot S).** Écrite,
      éprouvée, **non appliquée**. Sans elle, la recherche fonctionne
      exactement comme avant : le rattrapage flou et le journal dégradent en
      silence (aucune erreur visible). Rien ne bloque.
      **Le cron de purge existe désormais** : `/api/search/purge`, déclaré dans
      `vercel.json` à 14 h 15 UTC. Il appelle `zabelie_purge_search_misses()`.
      Auparavant la fonction n'avait **aucun appelant** — elle était prouvée par
      les tests SQL et n'avait jamais tourné. Le croisement qui aurait dû le
      dire existe maintenant aussi : `tests/crons-appelants.test.ts`.
      **La sortie à lire chaque semaine** : `GET /api/admin/search-demand?jours=7`
      — et **au démarrage, `?jours=30&min_sessions=1`** : à faible trafic
      presque aucun terme n'atteint 3 sessions distinctes en 7 jours, la
      sortie par défaut resterait vide des mois durant et on croirait le
      capteur muet. Le mode ouvert est étiqueté `fiable: false` dans la
      réponse — il mélange demande réelle, robots et vendeurs qui testent
      leur fiche.
      ⛔ **NE PAS POSER LE POIVRE AVANT D'AVOIR LU LE JOURNAL DE LA PURGE.**
      L'ordre n'est pas un confort, c'est un préalable : poser le poivre ouvre
      la collecte de termes **en clair** à côté d'un `session_hash`, et la
      promesse de `0047` (« l'empreinte tourne chaque jour, ce n'est pas un
      suivi ») ne tient que si la rétention est effectivement bornée. Or **un
      cron déclaré n'est pas un cron exécuté** — secret absent, déploiement non
      promu, chemin renommé laissent tous l'entrée en place et ne produisent
      rien.
      ⚠️ **CE VERROU A UNE DÉPENDANCE QU'IL FAUT CONNAÎTRE MAINTENANT.** Le
      cron ne s'exécutera pas tant que le code n'est pas **déployé en
      Production**. Or ce cron vit sur `claude/api-v1-tool-ready` — la plus
      large et la moins relue des branches en attente. Le verrou place donc de
      fait le poivre **derrière la fusion d'une grosse PR**.
      Ce n'est pas un problème aujourd'hui : sans trafic, le capteur n'a rien à
      enregistrer avant la diffusion sur WhatsApp. Mais autant le savoir
      maintenant que le découvrir dans trois semaines. Si le poivre devient
      urgent avant cette fusion, la sortie est de porter les trois fichiers du
      cron (`app/api/search/purge/route.ts`, l'entrée `vercel.json`,
      `tests/crons-appelants.test.ts`) sur une branche minuscule et de fusionner
      celle-là — le cron ne dépend d'aucun autre morceau de cette branche.
      Préalable commun aux deux voies : **savoir quelle branche Vercel sert en
      Production** (première ligne des conditions ci-dessous).

      Ce qui compte comme preuve, et rien d'autre : dans les journaux Vercel,
      une ligne
      `[search/purge] {"at":"…","issue":"termine","purgees":N,"dureeMs":…}`
      — `N = 0` convient parfaitement, c'est la LIGNE qui prouve, pas le
      chiffre. La présence de `/api/search/purge` dans `vercel.json` ne prouve
      rien. Si rien n'apparaît le lendemain de la mise en production, vérifier
      `CRON_SECRET` puis déclencher à la main :
      `curl -X POST -H "Authorization: Bearer $RECONCILE_SECRET" https://…/api/search/purge`
      ⚠️ **`SEARCH_FINGERPRINT_SALT` — REQUISE (≥ 16 caractères), sans repli.**
      Sans elle, **rien n'est enregistré** et le journal reste vide : c'est
      voulu, mais ça se confond avec « personne ne cherche ». Le serveur
      journalise un avertissement au premier appel, et la réponse admin porte
      `collecte: "désactivée"` — regarde ce champ AVANT de conclure quoi que
      ce soit d'une liste vide.
      Aucun repli sur `SUPABASE_SERVICE_ROLE_KEY` : une rotation de clé
      casserait le comptage de sessions en milieu de fenêtre sans rien
      signaler, et une fuite reconstruirait rétroactivement les empreintes de
      tous les jours passés.
      **Rotation du poivre — au basculement de journée en Haïti, jamais en
      milieu d'après-midi.** Changer ce secret coupe le comptage de sessions
      distinctes des 7 jours suivants : une même personne compte deux fois de
      part et d'autre. En le faisant tourner à minuit America/Port-au-Prince,
      la discontinuité coïncide avec celle de l'empreinte quotidienne au lieu
      de s'y ajouter.
- [ ] **Après TOUTE modification de `zabelie_search_normalize`** : réindexer
      `zabelie_products_title_norm_trgm_idx` et `..._desc_norm_trgm_idx`, puis
      mettre à jour `zabelie_search_index_guard`. Sans ça les index gardent
      les valeurs de l'ancienne définition et le rattrapage écarte des
      produits **en silence** — PostgreSQL exige `IMMUTABLE` mais ne vérifie
      pas la promesse. Contrôle : `select * from zabelie_search_index_integrity();`
      **Il tourne déjà tous les jours** dans `/api/admin/coherence` (champ
      `indexRecherche`) : c'est le seul endroit où la dérive peut naître, la
      CI ne la verra jamais — sa base a toujours un index et une fonction
      fraîchement créés, donc toujours d'accord. **À relire juste après avoir
      appliqué une migration qui touche la fonction**, sans attendre le cron.
      — chaque terme vient avec un message Kreyòl prêt à coller dans WhatsApp.
      C'est le livrable, pas la recherche.
      ⚠️ **Ce capteur ne vaut rien à catalogue vide** : il mesurera que le
      catalogue est vide. Il devient utile entre 20 et 200 fiches — la fenêtre
      où une marketplace meurt d'habitude.

- [ ] **🔴 Protéger `main` — la CI existe et ne bloque rien.** Vérifié le
      2026-07-27 : `.github/workflows/ci.yml` exécute typecheck, tests, build,
      e2e et SQL ; et `main` est **`protected: false`**. Rien n'empêche donc
      de fusionner au rouge. C'est le détecteur non branché, une couche
      au-dessus du code — et le point de contrôle humain du dépôt est
      justement la PR.
      À faire dans les réglages GitHub : exiger les vérifications de statut
      avant fusion sur `main`.
- [ ] **⚠️ La branche par défaut du dépôt est `claude/install-skills-eGRxy`,
      pas `main` — et c'est un réglage égaré, pas une seconde ligne.**
      Mesuré le 2026-07-27 : `main` porte le dernier travail fusionné
      (« Merge pull request #54 », 2026-07-26) ; la branche marquée par défaut
      date du **2026-06-22** et ne contient même pas `lib/product-kind.ts`.
      **`main` est donc bien la ligne de production**, et le défaut pointe sur
      une branche abandonnée depuis un mois.
      Conséquence immédiate : une PR ouverte sans base explicite vise la
      mauvaise branche. **Remettre le défaut sur `main` AVANT de protéger quoi
      que ce soit** — protéger `main` pendant que le défaut est ailleurs ne
      protège rien.
      Bonne nouvelle pour l'ordre des gestes : la branche de travail est
      **42 commits en avance sur `main`, avec zéro divergence**. Protéger
      `main` maintenant ne bloque donc aucun travail en cours.
- [ ] **`0048_objets_requis.sql`** — écrite, **non appliquée**. Fait passer le
      contrôle de schéma de la DÉCLARATION au CONSTAT. Tant qu'elle n'est pas
      appliquée, `/api/admin/coherence` retombe sur le registre et l'étiquette
      `source: "registre"` — lis ce champ avant de conclure.

## Les trois boucles manuelles — et leur somme

> Elles arrivent au même moment, sur la même personne. Le plafond de Zabelie
> n'est aucun des trois seuils pris isolément : **c'est leur somme.**

| Boucle | Coût unitaire | À 100 vendeurs actifs | À 300 |
|---|---|---|---|
| **Versements** MonCash (virement + consignation) | ~3 min | ~5 h/sem | ~25 h/sem |
| **Revue des fiches** (photo, prix, catégorie, politique) | ~3 min | ~2 h/sem | ~7 h/sem |
| **Litiges / `action_required`** (`0043`) | ~10 min | ~1 h/sem | ~3 h/sem |
| **Total** | — | **~8 h/sem** | **~35 h/sem** |

⚠️ **Ce tableau est de l'arithmétique, pas une mesure.** Les coûts unitaires
sont estimés ; 4 fiches/vendeur/mois et 1 retrait/vendeur/semaine sont des
hypothèses. La première commande réelle donnera le premier chiffre vrai.

**Conclusion opérationnelle** : le plafond d'une personne seule est autour de
**150 à 200 vendeurs actifs**, pas les 300 que le seul versement laissait
espérer.

### Seuil de la revue systématique — posé maintenant

**Au-delà de ~60 fiches par semaine**, la revue de chaque fiche cesse d'être
tenable en même temps que les deux autres boucles. À ce seuil, deux sorties,
et **une seule est honnête** :

- **un second relecteur** — la revue reste systématique, la promesse tient ;
- **une revue par échantillon** (priorité aux nouveaux vendeurs et aux
  catégories à risque) — mais alors **`/produits-interdits` §8 devient faux**.
  Ce paragraphe promet publiquement que chaque fiche est examinée avant sa
  mise en ligne. Le relâcher exige de **publier une v2 de la politique**, pas
  de changer discrètement de pratique : c'est précisément ce que la version
  sert à empêcher.

C'est la même mécanique que l'apurement manuel : une boucle qui ne casse
jamais franchement, qu'on saute une semaine chargée, puis deux.

## 🔒 CONDITIONS D'OUVERTURE — à lever AVANT la première transaction réelle

> Ce ne sont **pas des tâches**. Une tâche peut glisser d'une semaine à l'autre
> sans que rien ne se casse ; une condition d'ouverture a un moment de
> fermeture nommé, et ce moment est **la première commande réelle**
> (`docs/22-PREMIERE-COMMANDE-REELLE.md`).
>
> Pourquoi cette distinction plutôt qu'une case à cocher de plus : un écart
> consigné sans échéance devient une conformité par usure. Au bout de trois
> mois, plus personne ne se souvient que le contrôle n'a jamais tourné, et le
> vert de la CI se lit comme une preuve qu'il a tourné.

- [ ] **⚖️ D-4 — le sens de l'arrondi.** Déjà détaillée plus bas dans
      « Paiements ». Reprise ici parce qu'elle partage le même moment de
      fermeture : la ligne n°1 du registre doit dire sous quelle règle elle a
      été produite.

- [ ] **🔐 Isolation RLS des commandes — exécuter le test sous un VRAI JWT.**

      **Ce qui EST fait** (2026-08-02) : `supabase/tests/orders_rls_isolation.test.sql`
      exerce les policies réelles de `orders` sur un Postgres 16, avec six cas,
      et il est éprouvé par trois mutations qui le font tomber chacune sur le
      cas visé (policy acheteur retirée → cas 1 ; policy rendue permissive →
      cas 2 ; policy vendeur retirée → cas 4).

      **Ce qui N'EST PAS fait, et qu'il ne faut jamais présenter comme une
      conformité** : aucun JWT n'est émis, signé ni vérifié. `auth.uid()` est
      un **stub** qui lit un réglage de session (`supabase/tests/_bootstrap.sql`).
      Ce qui est exercé, c'est le **moteur de policies** avec une identité
      choisie — pas la chaîne complète « jeton GoTrue → PostgREST → policy ».

      **Pourquoi ça n'a pas été fait** : le test réel exige une branche
      Supabase, réservée au plan Pro (constaté le 2026-08-02 :
      `PaymentRequiredException — Branching is supported only on the Pro plan
      or above`). Le coût de la branche elle-même est négligeable —
      **0,01344 $/heure**, soit quatre centimes pour trois heures — mais
      l'abonnement mensuel ne l'est pas, et il a été jugé, à raison, un mauvais
      échange pour protéger un chemin que personne n'emprunte : **0 commande,
      0 produit, 1 profil** en base au moment de la décision.

      **Comment la lever, le jour venu** : passer le projet en Pro le temps
      d'une branche éphémère, y rejouer les migrations, créer deux acheteurs et
      un vendeur via GoTrue (vrais comptes, vrais jetons), appeler
      `/api/v1/get_user_orders` avec le jeton de chacun, vérifier qu'un
      acheteur ne voit que ses achats **et qu'un vendeur ne voit aucun achat**.
      Puis détruire la branche — et le **vérifier** par `list_branches`, pas le
      prévoir.

      **Ce que ça garde ouvert entre-temps** : si Supabase changeait la façon
      dont `auth.uid()` résout la revendication, ou si PostgREST cessait de
      propager le rôle `authenticated`, aucun test actuel ne le verrait.

- [ ] **💱 `USD_HTG_RATE` — POSER CETTE VARIABLE EST UN GESTE BLOQUÉ.**

      Aujourd'hui elle est vide (`.env.example:16`), et le checkout USD répond
      **422** plutôt que d'inventer un taux. C'est le bon comportement, et il
      rend le risque **dormant, pas absent**.

      **Le jour où tu la poses, tu fais trois choses d'un coup**, et rien dans
      le dépôt ne le dira à celui qui la posera — peut-être toi, dans trois
      mois, sans ce contexte : tu ouvres le rail **Stripe**, tu ouvres le rail
      **Zelle**, et tu **démarres une horloge** que personne ne surveille.

      **Deux préalables, à lever AVANT de renseigner la variable :**

      1. **Séparer les deux fonctions.** `usdCentsFromHtg` est aujourd'hui
         appelée sur un chemin d'AFFICHAGE (fiche produit, formulaire de
         recharge) **et** sur un chemin d'ÉCRITURE — `app/api/checkout/route.ts:209`
         → `payments.expected_usd_cents`, et
         `app/api/zabelie/topup/orders/route.ts:117` →
         `zabelie_topup_orders.expected_usd_cents`. Même fonction, même
         variable d'environnement, deux natures. Il faut deux fonctions
         distinctes, pour que le compilateur puisse dire laquelle est appelée
         où — sinon la garantie « affichage seulement » repose sur la
         vigilance.

      2. **Un mécanisme de fraîcheur.** Le bon comportement existe déjà, il
         suffit de l'étendre : ajouter `USD_HTG_RATE_AS_OF` à côté de la
         valeur, et rendre le **même 422** au-delà de N jours. Refuser plutôt
         qu'inventer, exactement comme le fait déjà l'absence de taux.

      **Pourquoi c'est plus grave qu'une réclamation.** `expected_usd_cents`
      est figé au checkout. La confirmation Zelle
      (`app/api/admin/confirm-zelle/route.ts:62`) et le webhook Stripe
      comparent le montant reçu à **ce chiffre figé**. Un taux périmé ne
      produit donc pas une erreur visible : il produit une **CONFIRMATION**.
      Le système déclare que tout va bien pendant que la plateforme absorbe
      l'écart de change.

- [ ] **⚖️ QUESTION OUVERTE — combien de temps `expected_usd_cents` reste-t-il
      opposable ?** (arbitrage porteur, du même genre que D-4)

      Un virement Zelle met plusieurs jours à arriver. Le montant en dollars
      est figé au moment du checkout. Donc :

      * **s'il n'expire jamais** — un acheteur peut virer trois semaines plus
        tard, au taux d'il y a trois semaines, et c'est la plateforme qui
        absorbe l'écart ;
      * **si le délai est trop court** — on invalide des paiements
        légitimement en route, ce qui est pire : l'argent est parti.

      Ce n'est pas un défaut à corriger, c'est un **nombre à choisir**. Et il
      doit être choisi **avant** d'écrire la séparation des deux fonctions,
      sinon la séparation sera à réécrire.

      Ni Claude ni personne d'autre que le porteur ne tranche ce nombre.

- [ ] **🧾 Première commande réelle** — `docs/22-PREMIERE-COMMANDE-REELLE.md`.
      C'est l'événement qui ferme les deux conditions ci-dessus. Il n'a pas
      lieu tant qu'elles ne sont pas levées **ou explicitement acceptées par
      écrit** — l'accepter est un choix légitime, l'oublier ne l'est pas.

- [ ] **`sharp` — risque ACCEPTÉ le 2026-08-02, à revoir avant le premier
      téléversement vendeur.**

      **Accepté sur un fait mesuré, pas sur une impression** : la base contient
      **0 produit**. Aucune image vendeur n'a jamais été téléversée, donc
      l'entrée non fiable qui atteindrait libvips **n'existe pas encore**. Le
      risque est réel mais entièrement FUTUR.

      `sharp@0.34.5` — version de l'arbre **INSTALLÉ**, pas de `package.json` :
      elle n'y figure pas, elle arrive par `next@16.2.10`. Avis
      GHSA-f88m-g3jw-g9cj, quatre CVE dans libvips, corrigé en `>= 0.35.0`.

      **Pourquoi ça n'a pas été corrigé.** `npm audit fix --force` proposerait
      un RECUL de `next` 16.2.10 → 14.2.35, incompatible avec React 19 —
      vérifié en `--dry-run`, jamais exécuté. Et forcer `sharp` par un
      `overrides` que Next n'a pas validé échangerait un risque futur contre un
      risque de rendu sur les photos produit, c'est-à-dire sur l'actif qu'on
      n'a pas encore.

      **Moment d'activation identifiable** : le PREMIER téléversement vendeur.
      Avant d'ouvrir cette surface, revérifier `sharp`.

      **Surveillance en place, sans rien à relire** :
      `tests/sharp-avis-securite.test.ts` est un test **INVERSÉ** — il échoue
      le jour où `sharp >= 0.35` apparaît dans l'arbre installé, et son message
      dit quoi faire. Une ligne de suivi demande qu'on pense à la relire ; ce
      test ne demande rien.

      ---

      ### ✍️ Signature — acceptation datée

      > **Réexamen fixé au 2026-11-03.** Accepté par **eliezerphilippe0-spec**
      > (porteur), le 2026-08-03.
      >
      > **Ce n'est pas une acceptation, c'est un report avec une échéance.** La
      > différence n'est pas rhétorique : une acceptation ne demande plus rien à
      > personne, un report a une date à laquelle quelqu'un doit revenir. Sans
      > cette date, l'avis GHSA-f88m-g3jw-g9cj cesse d'exister le jour où cette
      > ligne descend dans le fichier.
      >
      > **Deux événements rouvrent le dossier, et le premier qui arrive gagne :**
      >
      > 1. **Le 2026-11-03**, quelle que soit l'activité de la plateforme.
      > 2. **Le premier téléversement vendeur**, même s'il arrive demain — c'est
      >    lui qui crée l'entrée non fiable vers libvips, donc le risque réel.
      >
      > **Ce qu'il faudra refaire ce jour-là**, et pas seulement relire : mesurer
      > la version de `sharp` dans l'arbre **installé**
      > (`node -p "require('./node_modules/sharp/package.json').version"`, pas
      > `package.json`, où elle ne figure pas), vérifier si `next` a rattrapé
      > `sharp >= 0.35`, et refaire un `npm audit fix --force --dry-run` pour
      > voir si le recul de `next` 16 → 14 est toujours le prix à payer.
      >
      > ⚠️ **Si la date passe sans que personne ne revienne, ce fichier ne le
      > dira pas.** Une date écrite dans un markdown n'est pas un mécanisme —
      > c'est la limite connue de cette signature, et elle est écrite ici plutôt
      > que découverte en novembre.

## ⚠️ Risque de FUSION — la promesse de livraison corrigée sur DEUX branches

La promesse « livraison instantanée » a été retirée à deux endroits, sur deux
branches différentes, à quelques heures d'intervalle :

* `claude/promesse-livraison-instantanee` (depuis `main`) — corrige
  `home.stat3.v`, `product.delivery` et `home.sub` en **fr** et **ht** ;
* `claude/api-v1-tool-ready` — corrige `product.delivery` en **fr**, **ht**,
  **en** et **es**, et porte la garde `tests/promesse-livraison.test.ts`.

**Les deux touchent les mêmes clés de `lib/i18n.ts`.** Une fusion mal résolue
peut donc RESSUSCITER la promesse — c'est exactement ce qui s'est déjà produit
une fois : `home.stat3.v` avait été corrigée, `product.delivery` oubliée, puis
traduite en anglais et en espagnol. La promesse a gagné deux langues pendant
qu'on la croyait supprimée.

**Ce qui protège** : `tests/promesse-livraison.test.ts` échoue si une clé de
livraison reprend une formule de délai, dans n'importe laquelle des quatre
langues. Il vit sur `api-v1-tool-ready` — donc **tant que cette branche n'est
pas fusionnée, `main` n'a aucune garde**. À vérifier au moment de la fusion :
la suite doit être verte APRÈS résolution des conflits, pas seulement avant.

**Question de fond qui n'appartient qu'au porteur** — voir aussi ci-dessous :
`main` porte encore, en kreyòl, la proposition de valeur d'AVANT le pivot
(« Modèl, fòmasyon, beat, akonpayman… »), quand le français décrit déjà une
marketplace de pièces détachées. Ce n'est pas une traduction en retard, c'est
le pivot à moitié propagé — et c'est la langue de référence du marché qui le
montre le plus. `home.h1.a` → `home.h1.d` (« Vendez vos produits digitaux et
vos talents ») portent la même chose dans les DEUX langues. La question n'est
pas « quel libellé » mais **quelle est la promesse d'accueil de Zabelie
maintenant, en kreyòl d'abord**.

## Rétention du capteur de demande — tranché à 90 jours

- [ ] **`0053_search_retention_90j.sql` — écrite, NON APPLIQUÉE.** Passe
      `zabelie_search_config.retention_days` de **180 à 90**.

      **Pourquoi ce n'est pas un arbitrage** : le seul lecteur de la table est
      déjà plafonné à 90 jours — `app/api/admin/search-demand/route.ts:40`,
      `Math.min(90, …)` — et `zabelie_search_demand` est révoquée pour `anon`
      et `authenticated` (`0047:248`), donc il n'existe aucun autre chemin de
      lecture. Les jours 91 à 180 étaient conservés **sans que quiconque
      puisse les voir** : que du risque, aucun usage. 180 n'avait d'ailleurs
      jamais été choisi — c'était le défaut écrit d'un trait avec
      `min_sessions` et `min_length`.

      Ce que ça réduit concrètement : la fenêtre pendant laquelle des termes
      **en clair** (`0047` nomme les cas — « klinik avòtman », « tès VIH »,
      « avoka pou divòs ») coexistent sous une même empreinte de session. À
      faible trafic, une suite de recherches reste distinctive même sans
      identifiant qui traverse les jours ; c'est le seul paramètre qu'on
      contrôle, on le divise par deux.

      **Si le plafond de la route bouge un jour, c'est LUI qu'il faudra
      rediscuter, et cette rétention avec.**

      La migration ne supprime rien elle-même : elle change un paramètre, et
      c'est le passage suivant de la purge qui applique la borne. Elle affiche
      le compte des lignes concernées **avant** de modifier quoi que ce soit,
      et échoue (`ZB053`) si `retention_days` ne vaut pas 90 après coup.

- [ ] **`zabelie_fulfillment_sweep` (`0043`) n'a toujours aucun appelant** —
      même défaut que la purge, encore ouvert. Elle est exemptée dans
      `tests/crons-appelants.test.ts` pour une raison précise : `0043` est
      **non appliquée** et porte trois valeurs à arbitrer (`docs/21`), donc un
      cron déclaré aujourd'hui appellerait une fonction absente de la base et
      échouerait chaque jour.
      **Condition, pas tâche : la route et l'entrée `vercel.json` se câblent
      DANS LE MÊME GESTE que l'application de `0043`**, et l'exemption se
      retire alors du test — qui échouera de lui-même si on l'oublie dans
      l'autre sens (une exemption dont la fonction a gagné un appelant est
      signalée comme périmée).

## Accueil — ce que le croisement des clés i18n a mis au jour

> `tests/i18n-cles-mortes.test.ts` croise chaque clé de `lib/i18n.ts` avec ses
> sites d'appel. Deux clés mortes ont produit des défauts VISIBLES, corrigés :
> `home.cta.sell` (bouton vendeur disparu du hero — c'est ce qui faisait lire
> le `h1` acheteur comme un choix de positionnement) et `nav.logout`
> (`sign-out-button.tsx` affichait « Déconnexion » **en dur**, donc en français
> à un utilisateur kreyòl). Restent **cinq clés à trancher**, exemptées avec
> leur raison dans le test — le test les rappelle à chaque exécution, et
> l'exemption échoue d'elle-même si la clé regagne un appelant.

- [ ] **`home.badge`** (« La marketplace haïtienne ») — résidu de
      l'assainissement du hero. Supprimer des quatre langues, ou rebrancher.
- [ ] **`sec.free.badge`** (« GRATUIT ») — `sec.free` et `sec.free.sub` sont
      rendues, la pastille ne l'est pas. Écart d'affichage, pas un résidu.
- [ ] **`product.pay.loading`** (« Redirection vers MonCash… ») — jamais rendu :
      le bouton ne montre rien pendant la redirection. **À vérifier sur le
      chemin réel** : sur 3G, un bouton qui ne réagit pas se reclique.
- [ ] **`order.ref`** (« N° de commande ») — la référence `ZB-…` de `0042` est
      lue et affichée, jamais avec ce libellé.
- [ ] **`status.draft`** — supplantée par une décision produit explicite
      (`app/vendre/page.tsx:126`), conservée si la revue humaine cesse un jour
      d'être systématique. La seule des cinq qui ne demande rien.

- [ ] **🔴 `components/account-actions.tsx` est un îlot entièrement en
      français** — « Supprimer votre compte ? », « Exporter mes données », et
      le texte du `window.confirm` qui explique l'anonymisation légale. Aucune
      clé i18n, donc **le croisement ne le voit pas** : il ferme « traduit mais
      jamais branché », pas « jamais traduit ». C'est l'écran de SUPPRESSION DE
      COMPTE — celui où un malentendu de langue coûte le plus cher.

- [ ] **Débord horizontal à 360 px en FR et ES** (`scrollWidth` 371 / 372 pour
      360 de viewport) — la barre de navigation : le bouton « Vendre » /
      « Vender » plus le sélecteur de langue. **Mesuré, et pré-existant** : la
      même mesure sur l'état d'avant ce chantier rend exactement 371 / 372.
      Ne se voit **ni en kreyòl ni en anglais** (« Vann », « Sell » tiennent,
      `scrollWidth` = 360 pile) — c'est la vérification en QUATRE langues qui
      le révèle, pas trois. Même famille que RES-01.
      Le `h1` nouveau, lui, tient dans les quatre : 320 px de large, bord droit
      340, et le bouton vendeur du hero fait 44 px de haut (seuil BL-124).
      Asymétrie connue et acceptée : le `h1` prend 2 lignes en kreyòl, 3 en
      anglais et espagnol, **4 en français** — la langue de référence est la
      plus courte, ce qui est le bon sens de l'écart.

## Observabilité — signaux non bloquants à ajouter

### Audit externe Codex (2026-08-10) — verdict après contre-vérification

> ⚠️ **L'audit a mélangé DEUX projets.** Les chemins qu'il cite
> (`C:/Users/Philippe/marketplace-hub/vite.config.ts`, `src/services/
> monCashService.ts`, React Router, 82 tests, 50 fichiers `@ts-nocheck`)
> appartiennent à **marketplace-hub** — l'application Vite de `zabely.com`,
> sur le poste du porteur. **AUCUN de ces fichiers n'existe dans
> `uniondigitale`** (vérifié : ni vite.config, ni src/, ni react-router,
> ni un seul `@ts-nocheck` ; 263 tests, pas 82). La base examinée, elle,
> est bien `zabelie-digi` (les comptes concordent). Le « feu rouge » agrège
> donc les défauts d'un AUTRE dépôt avec notre base.

- [ ] 🚨 **TRANCHÉ le 2026-08-10 : ARCHIVER `marketplace-hub` / zabely.com.**
      Décision demandée au connecteur par le porteur (« choisis la meilleure
      option »), rendue avec ses motifs — le porteur peut la casser, mais
      qu'elle soit écrite :

      **Pourquoi archiver plutôt que repointer.** (1) La décision d'identité
      du 2026-07-24 dit qu'il n'existe QU'UN projet Zabelie — ce dépôt, celui
      qui porte l'infrastructure financière ; repointer marketplace-hub vers
      une autre base le maintiendrait comme SECOND magasin sous une marque
      quasi identique, et tout ce que l'audit lui reproche (source map
      publique qui expose le code, CSP affaiblie, 50 fichiers hors typage,
      dernier commit GitHub le 27 AVRIL + 128 changements locaux jamais
      commités) resterait à corriger dans un dépôt que plus personne ne
      maintient. (2) Son nom public viole la règle de nommage (« Ne jamais
      écrire Zabely »). (3) Ses promesses sont celles que Zabelie a refusées
      pièce par pièce : NatCash (⛔), PayPal, « −20 % », « livraison rapide »,
      numéro WhatsApp faux. (4) Repointer coûte du travail récurrent ;
      archiver en coûte une fois.

      **Ce qui a été vérifié avant de trancher** : le dépôt GitHub est
      `eliezerphilippe0-spec/Zabelie` (privé, dernier push 2026-04-27 — la
      date exacte que l'audit cite). La liaison du bundle zabely.com à
      `zabelie-digi` n'a PAS pu être confirmée d'ici (réseau sortant du
      conteneur bloqué vers ce domaine) — c'est l'étape 0 ci-dessous.

      **Précision porteur (2026-08-10) : `zabelie.com` est LE domaine acheté
      du projet.** Il doit donc finir branché sur CE dépôt (uniondigitale sur
      Vercel) — et l'hypothèse la plus probable est qu'il sert AUJOURD'HUI la
      vieille application Vite : l'audit ouvre sur « zabelie.com est
      accessible » en décrivant le bundle de marketplace-hub, et l'incident
      « catalogue indisponible » du 2026-08-09 renvoyait le HTML du site
      Zabély quand l'app interrogeait sa variable `NEXT_PUBLIC_SUPABASE_URL` —
      ce qui arrive précisément si cette variable a reçu le domaine du site au
      lieu de l'URL Supabase. À VÉRIFIER à l'étape 0, pas à supposer.

      **Exécution — gestes du porteur, dans l'ordre :**
      ✅ **BASCULE FAITE le 2026-08-10, vérifiée de l'extérieur** : zabelie.com
      rend « Zabelie — La marketplace haïtienne » (`_next/` présent, zéro
      « Zabely »). Découverte en chemin : le vieux site Vite était hébergé
      sur VERCEL (pas Hostinger) depuis avril, domaine accroché à ce vieux
      projet — le geste réel a été un TRANSFERT de domaine entre projets du
      même compte, pas un changement DNS. Étape 3 réalisée par le transfert
      même (l'ancien projet a perdu le domaine). Étape 6 TOMBÉE : le vieux
      bundle (1 Mo, index-6JaXkId_.js) audité de l'extérieur — librairie
      supabase-js présente (8 mentions, grep à connu-positif) mais AUCUNE
      URL *.supabase.co, ni ddditxykopuxxqzgkqwy, ni oqnt : buildé sans
      base configurée (d'où sa page noire), rien à révoquer. Restent : (a)
      NEXT_PUBLIC_SITE_URL + Redeploy · (b) Site URL Supabase · (c) URLs
      MonCash (2 bis) · étapes 4-5 (archiver le dépôt Zabelie, pauser oqnt).
      0. Ce que sert `zabelie.com` aujourd'hui : afficher son code source.
         `/assets/index-….js` + « Zabély » = la vieille app Vite ;
         `/_next/` = déjà la bonne. Chercher aussi « supabase.co » : si
         `ddditxykopuxxqzgkqwy` figure dans le bundle VITE, il tourne sur
         NOTRE base → suite urgente.
      1. **Brancher `zabelie.com` sur le projet Vercel d'uniondigitale**
         (Vercel → Settings → Domains → Add). C'est un RATTACHEMENT, pas une
         redirection : le domaine acheté doit servir la vraie marketplace.
         Si `zabely.com` est aussi possédé : 301 → `zabelie.com`.
      2. Après rattachement : `NEXT_PUBLIC_SITE_URL=https://zabelie.com`
         (Vercel, Production+Preview) et Supabase Auth → Site URL =
         `https://zabelie.com`, puis REDÉPLOYER — variable NEXT_PUBLIC,
         inlinée au build.
      2 bis. **Revenir dans le portail MonCash Business** et remplacer les
         trois URLs posées avec le domaine `.vercel.app` :
         Website Url → `https://zabelie.com` ·
         Return Url → `https://zabelie.com/api/moncash/return` ·
         Alert Url → `https://zabelie.com/mes-achats`.
         ⚠️ Tant que ce geste n'est pas fait, un paiement lancé depuis
         `zabelie.com` renvoie l'acheteur vers l'ancien domaine — le
         paiement est confirmé (la vérité est serveur-à-serveur), mais
         l'acheteur atterrit ailleurs que là où il a payé.
      3. Mettre hors ligne l'ancien déploiement Vite (son hébergeur), une fois
         le domaine détaché.
      4. Archiver le dépôt GitHub `eliezerphilippe0-spec/Zabelie`
         (Settings → Danger Zone → Archive). Le dossier local
         `marketplace-hub` : zipper puis supprimer, ou garder hors de tout
         déploiement.
      5. Mettre en pause le projet Supabase « Zabelie » (`oqnt…`) — APRÈS
         l'étape 3, jamais avant.
      6. Si l'étape 0 a confirmé la liaison à `zabelie-digi` : la rotation de
         la clé anon legacy (déjà au registre via la migration vers les clés
         `sb_…`) fermera l'accès résiduel du vieux bundle.
- [x] **RPC facture par jeton sans garde de forme ni débit** — constat RETENU,
      corrigé côté application le 2026-08-10 : `estTokenFacture` (24 car.
      base64url exacts, vérifié contre 0 jeton historique) + 30 lectures/min
      par IP AVANT la RPC. `tests/facture-token.test.ts`, mutation au rouge.
- [ ] **Advisors performance Supabase** (~25 politiques RLS ré-évaluant
      `auth.uid()` par ligne, ~16 FK non indexées, ~15 politiques permissives
      multiples) — plausible, non bloquant à 0 commande. À traiter par UNE
      migration dédiée (index FK + `(select auth.uid())`) quand le trafic
      existera, jamais en catimini dans un autre lot.
- [ ] **Protection « mots de passe compromis » désactivée** (Supabase Auth →
      HaveIBeenPwned) — un interrupteur dans le tableau de bord, déjà relevé
      par notre propre passage d'advisors du 2026-08-09.

**Constats de l'audit NON retenus pour ce dépôt, et pourquoi** :
« Aucun cron » — les 7 crons Vercel existent et sont visibles dans le tableau
de bord (capture porteur du 2026-08-09) ; le compte de l'auditeur n'avait
simplement pas accès au projet Vercel. « Storage sans politique RLS » — par
CONSTRUCTION : les fichiers partent exclusivement en URL signée service-role
via /api/download, aucun client ne touche le bucket. « 400 sur in_stock /
label_es » — déjà documenté ici même : `label_es` corrigé (PR #80),
`in_stock` attend B2. « Source map publique, CSP unsafe-inline, npm audit
React Router/ws/nanoid, ESLint 54 erreurs » — marketplace-hub, pas nous
(notre npm audit : 3 high, toutes `sharp`/libvips, dossier signé jusqu'au
2026-11-03).

- [ ] **`/mes-achats` est encore à moitié en français en dur** — le bloc de
      remise ajouté par le lot « surfaces » passe par `lib/i18n.ts` (quatre
      langues), mais le titre de la page et les libellés statiques
      (« Remise à convenir avec le vendeur », « Service · mise en relation »)
      sont antérieurs et ne sont pas traduits. Un acheteur kreyòl voit donc une
      page mixte. Six clés à ajouter ; aucun mécanisme ne le signalera —
      `Record<I18nKey, string>` vérifie que chaque langue porte chaque clé,
      jamais qu'un écran passe par une clé.

- [ ] **Deux projets Supabase, et celui qui s'appelle « Zabelie » n'est PAS la
      base de Zabelie.** Constaté le 2026-08-09 en cherchant où appliquer
      `0043`. Le projet nommé **`Zabelie`** (`oqnt…`, us-east-1) porte un tout
      autre schéma — `vendors`, `affiliates`, `courses`, `rentals`,
      `registries` — sans aucune table `zabelie_*` ni registre de migrations.
      La production de ce dépôt est le projet nommé **`zabelie-digi`**
      (`dddi…`). Un jour de fatigue, l'éditeur SQL ouvert sur le mauvais
      projet, et une migration part dans une base étrangère : le nom est le
      seul repère visible dans l'interface, et il désigne l'inverse de ce
      qu'on croit. À renommer, ou à archiver s'il ne sert plus.

- [ ] **Quatre fonctions de `0042` ont un `search_path` mutable** —
      `zabelie_order_ref_candidate`, `zabelie_assign_order_ref`,
      `zabelie_orders_ref_on_insert`, `zabelie_orders_ref_immutable`. Relevé
      par le linter Supabase (WARN), antérieur au 2026-08-09 et sans rapport
      avec `0043`. C'est la règle dure n°4 (« `search_path` épinglé ») non
      tenue sur un lot. Correctif : une migration qui refait les quatre avec
      `set search_path = public`, rien d'autre.

- [ ] **`seller_is_active` est exécutable par `anon` en `security definer`** —
      même relevé. Peut être délibéré (elle sert l'affichage public d'une
      fiche vendeur), mais aucune trace ne le dit. À confirmer ou révoquer,
      comme `0049` et `0050` l'ont fait pour deux oublis du même genre.
      `zabelie_biz_get_invoice_by_token` est dans le même cas et paraît, elle,
      volontairement publique (facture consultable par jeton) — à écrire noir
      sur blanc plutôt qu'à laisser deviner.

- [ ] **Catégories sans `label_es`** — la garde de `0052` est un contrôle
      PONCTUEL : elle ne voit que les catégories existant à sa position dans
      la suite des migrations. Une catégorie créée ensuite s'affichera en
      français **sans que rien ne le dise** — le repli `label_es || label_fr`
      est silencieux par construction.

      Y répondre en durcissant la garde transformerait le `nullable` en
      décoration et bloquerait une migration produit sur une question de
      vocabulaire. La bonne forme est un contrôle **quotidien et non
      bloquant**, du même genre que `zabelie_objets_requis` (`0048`) :
      compter et NOMMER les catégories non traduites dans
      `/api/admin/coherence`. Vaut aussi pour `label_en` et `label_kr`.

## Paiements (rappels)

> **Une seule de ces décisions bloque la première commande : D-4.** Un produit
> à 25 gourdes, sans coupon, sous la règle actuelle, traverse tout le parcours
> — D-5 (seuil zéro), D-6 (qui paie la remise de fidélité) et le palier Elite
> ne s'y opposent pas. Elles gagnent même à être tranchées **après**, avec ce
> que la vente aura appris.
>
> D-4 n'est pas plus bloquante — elle est seulement plus simple à prendre
> avant. Un registre append-only accueille très bien un changement de règle
> dans le temps : c'est même sa raison d'être. Ce qu'il exige, c'est que
> chaque ligne dise **sous quelle règle** elle a été produite — et ça, rien ne
> l'enregistre aujourd'hui. Donc deux chemins valables : trancher D-4 avant
> (le plus simple), ou **acheter d'abord et noter à la main que la ligne n°1 a
> été produite sous `round`**. Ce qu'il ne faut pas faire, c'est changer la
> règle sans que personne ne sache laquelle s'appliquait à quoi.

- [ ] **🔴 `0045_profile_on_signup.sql` — À APPLIQUER, et à vérifier AVANT la
      première commande.** Le profil n'était créé qu'à un seul endroit :
      l'insert côté client de `connexion-form.tsx`, et **uniquement** dans la
      branche où `signUp` renvoie une session — donc uniquement si la
      confirmation par e-mail est **désactivée**. Aucun déclencheur en base ne
      prenait le relais.
      **Si la confirmation est active : aucun acheteur n'obtient jamais de
      profil.** Ce n'est pas un cas de test, c'est le parcours d'inscription
      entier. Le réglage se lit en un clic dans les paramètres Auth de
      Supabase — commence par là.
      **Forme de l'échec, vérifiée** : `orders.buyer_id` référence
      `profiles(id)`, donc l'achat échoue en violation de clé étrangère et
      `/api/checkout` renvoie « Création commande échouée » (500). **Rien
      n'est écrit** — pas de commande orpheline, pas de ligne de grand livre.
      Bénin pour le registre, bloquant pour l'acheteur, et illisible pour lui.
      **⚠️ Ne PAS désactiver la confirmation e-mail pour débloquer** : toute
      la légitimité de l'auto-réception de `0043` repose sur un avis envoyé à
      une adresse joignable. Le contournement le plus tentant casse le
      mécanisme d'expédition.
      **Exposition de `display_name` — mesurée le 2026-07-27, avant d'allonger
      quoi que ce soit.** Le nom n'apparaît sur **aucune page publique** (ni
      fiche produit, ni avis) ; les e-mails vendeur ne portent **pas** le nom
      de l'acheteur ; il n'existe **aucune messagerie**. Donc aujourd'hui
      **aucun chemin ne mène d'un compte renommé à un autre utilisateur**, et
      l'usurpation a peu de portée. C'est pour ça que le filtre actuel suffit
      — et c'est aussi pourquoi allonger la liste (« MonCash », « Digicel »)
      serait du théâtre : `Zabelye`, un « I » à la place du « l » ou une
      lettre cyrillique passent tous.
      **Conséquence assumée, à ne pas découvrir plus tard** : le filtre est
      sans exemption de rôle, donc **la plateforme elle-même** ne peut plus
      créer de compte affiché « Zabelie » ou « Support Zabelie » — ni depuis
      l'app, ni en back-office avec la clé de service. C'est voulu. Si un
      compte support devient nécessaire, la voie n'est PAS de retirer le
      filtre : c'est d'ajouter une colonne de marquage officiel, de l'afficher
      partout où le nom l'est, puis de n'autoriser le nom réservé qu'aux
      lignes marquées. Le nom d'abord et le marqueur ensuite laisserait une
      fenêtre où « Support Zabelie » n'est vérifiable par personne.
      **À traiter DANS le même geste que le marqueur** : le repli d'inscription
      est « Kont » pour tout le monde. Invisible aujourd'hui, puisque le nom
      n'est exposé nulle part — mais le jour où il s'affiche, plusieurs
      comptes « Kont » indistinguables apparaîtront ensemble. La réponse
      (suffixe, nom déduit autrement, invitation à se nommer) se décide avec
      l'exposition, pas avant : c'est le même chantier.
      **⚖️ La vraie décision arrive avec la première exposition** : le jour où
      `display_name` s'affiche sur une fiche boutique, dans un avis ou dans un
      message reçu par un vendeur, aucune liste ne suffira — il faudra un
      **marqueur visuel de compte officiel**. À trancher AVANT d'exposer le
      nom, pas après.
      Le nom affiché vient du navigateur, sans validation serveur : un compte
      « Support Zabelie » qui écrit à des vendeurs est le scénario le plus
      coûteux sur un marché où la confiance passe par WhatsApp. `0045` refuse
      les variantes de `zabelie`/`zabely` (comparaison sur une forme
      normalisée, donc « Z-a-b-e-l-i-e » aussi) et **replie** sur l'e-mail
      plutôt que de rejeter — un rejet fermerait l'inscription, ce qu'un
      déclencheur ne doit jamais faire. Restent deux choix qui te
      reviennent : **la liste** (faut-il y ajouter « MonCash », « Digicel »,
      des noms d'employés ?) et **la sanction** (repli silencieux, ou refus
      explicite en amont, côté formulaire, où l'on peut expliquer).
      Contrôle à passer une fois appliquée :
      `select u.email, u.email_confirmed_at, p.id as profil from auth.users u
       left join profiles p on p.id = u.id order by u.created_at desc limit 5;`
      — aucun `profil` à `null`.
- [ ] **⚖️ D-4 — TRANCHER LE SENS DE L'ARRONDI (décision porteur).** `round`
      (état actuel, la fraction va à la plateforme) ou `floor` (elle va au
      vendeur, ≤ 1 HTG par vente). Personne n'a tranché : le porteur a donné
      un avis (`floor`) sans « go », l'agent recommande `floor`. À décider
      **avant la première vente** — le registre est append-only, chaque ligne
      écrite avant porte l'ancienne règle pour toujours. Analyse chiffrée :
      `docs/02` §D-4.
      **Si `floor` : trois gestes, et l'ORDRE est la sécurité** —
      (1) appliquer `0044_commission_floor.sql` ; (2) passer
      `ROUNDING_IN_FORCE` à `"floor"` dans `lib/commission.ts` ;
      (3) redéployer. Dans cet ordre, l'intervalle donne au vendeur **plus**
      que ce qui lui est annoncé. Dans l'autre, il lui promet une gourde qu'on
      ne verse pas. Puis inscrire l'empreinte au registre `0041` — c'est ce
      que lit la sonde d'arrondi de `/api/admin/coherence`, qui signale un
      désaccord entre la constante et le journal. Les annonces (FAQ,
      estimation vendeur, console pro, FR + KR) suivent automatiquement la
      constante — rien à réécrire à la main.
      **Si `round` : rien à faire**, `0044` reste au dépôt.
- [ ] **📋 Jour J `0043` + PR 2/2 — les contrôles du premier passage,
      écrits AVANT d'en avoir besoin** (revue 2026-08-08). L'ordre gravé :
      #70 → #71 → #64 rebasée → appliquer `0043` (registre `0041` vérifié) →
      signal à l'agent → PR 2/2 le même jour → déploiement → `docs/22`.
      Trois lectures au premier passage du balayage, dans cet ordre :

      **(0) Noter ICI l'horodatage exact du déploiement de la PR 2/2** — il
      n'existe qu'à cet instant et ne se reconstruit pas après coup :
      `DEPLOIEMENT_PR22 = ____-__-__T__:__:__Z`

      **(1) Le journal du balayage** : les six compteurs existent (clé
      absente = `null`, jamais « rien à faire ») ; `orphelins_repares` =
      nombre de commandes physiques payées pendant la fenêtre ;
      `orphelins_tardifs` **= 0, sinon SIGNAL D'ARRÊT** — un tardif au
      premier passage contredit l'hypothèse même de la fenêtre courte et
      invalide le déroulé, pas une ligne.

      **(2) L'ancrage, instrument calibré** — deux régimes, et le seuil est
      une TOLÉRANCE PRAGMATIQUE (retries, routes lentes), pas la frontière
      exacte : une ligne à 2 min n'appartient à aucun régime et passe sans
      signal — l'instrument ne la voit pas, c'est dit ici pour être su :
      ```sql
      -- réparée (F16) : delta = 0 exactement · nominale : quelques secondes
      select f.order_id, f.created_at, f.created_at - a.ancre as delta
        from zabelie_fulfillment f
        cross join lateral (
          select min(p.confirmed_at) as ancre from payments p
           where p.order_id = f.order_id and p.status = 'confirmed') a
       where f.created_at < a.ancre
          or f.created_at - a.ancre > interval '5 minutes';
      -- zéro ligne attendu
      ```

      **(3) Le contrôle de fenêtre, EXÉCUTABLE** — remplacer le paramètre
      par la valeur du (0) : toute ligne née de la fenêtre n'a pu venir que
      du filet, donc delta = 0 exactement :
      ```sql
      select f.order_id, f.created_at - a.ancre as delta
        from zabelie_fulfillment f
        cross join lateral (
          select min(p.confirmed_at) as ancre from payments p
           where p.order_id = f.order_id and p.status = 'confirmed') a
       where a.ancre < 'DEPLOIEMENT_PR22'::timestamptz
         and f.created_at <> a.ancre;
      -- zéro ligne attendu ; toute ligne = F16 réel ≠ F16 testé
      ```
- [ ] **🔐 Audit transversal des routes service-role (chantier, pas urgent
      avant lancement — inscrit 2026-08-08, revue PR #71).** Les 13 routes
      `app/api/admin/**` (menu-counts compris) tiennent toutes sur le même
      étage unique : garde applicative `getCurrentUser()` puis
      `createAdminClient()` — c'est-à-dire sur l'hypothèse « la garde est
      correcte et la clé service-role ne fuit jamais ».
      `protect_profile_privileges` (0015) ferme le chemin « devenir admin »,
      pas le chemin « contourner la garde » : un bug de garde ou une clé dans
      un journal = lecture-écriture totale. Le point a été jugé NON bloquant
      pour menu-counts (compteurs agrégés, sans PII ni montants) précisément
      parce que durcir la route la moins sensible en laissant refund et
      confirm-zelle sur l'étage unique serait du théâtre. Périmètre du
      chantier, arbitré en revue :
      (1) inventaire des routes service-role ; (2) classement par sensibilité
      — les MUTATIONS FINANCIÈRES d'abord (refund, confirm-zelle, payouts,
      topup) ; (3) décision PAR CLASSE : garde renforcée, RLS admin, ou statu
      quo documenté. ⚠️ Piège connu à ne pas reproduire : une RPC à contrôle
      `auth.uid()` interne appelée via service role ne vérifie rien —
      `auth.uid()` y est NULL. Les deux étages n'existent qu'avec le client
      SESSION. C'est exactement le genre de dette qui devient invisible parce
      que « c'est le motif du dépôt ».
- [ ] **⚖️ D-6 — Qui paie la remise de fidélité ? (décision porteur).** La
      commission porte sur `orders.amount_htg`, le prix **remisé**. Pour un
      coupon vendeur (`zabelie_coupons`) c'est juste : il l'a créé lui-même.
      Pour un coupon de fidélité (`coupons`, `0021`) il n'y a **pas de
      vendeur** — c'est un engagement de la plateforme, et le vendeur en
      paierait la note sans l'avoir choisi ni pouvoir le distinguer d'une
      baisse de prix. Rien n'est câblé aujourd'hui (vérifié) et aucun point
      n'a jamais été émis : la décision est encore **gratuite**, elle ne le
      sera plus après une ligne de grand livre. Trois sorties dans `docs/02`
      §D-6. Garde en place : `tests/fidelite-discipline.test.ts` empêche le
      câblage par inadvertance, pas le programme.
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

## 🚨 Incidents de secrets — journal (`docs/11-SECRETS.md` §5)

> Une ligne par incident. **Jamais la valeur de la clé**, même partielle, même
> « juste le début » : un préfixe suffit souvent à identifier le projet, et ce
> fichier est dans Git.

### 2026-08-04 — clé secrète Supabase collée dans une conversation

| | |
|---|---|
| **Clé** | `SUPABASE_SERVICE_ROLE_KEY`, forme `sb_secret_…` |
| **Cause** | collée en clair dans un échange, pour illustrer une consigne |
| **Portée** | contourne toute la RLS : comptes, commandes, grand livre, en lecture **et** en écriture |
| **Dépôt touché ?** | **Non** — vérifié, aucune occurrence dans les fichiers suivis par Git |

- [ ] **1. Révoquer et regénérer** — Supabase → *Settings › API Keys*.
- [ ] **2. Remplacer** dans Vercel → *Environment Variables*, **Production ET
      Preview** (deux environnements distincts, l'un ne met pas l'autre à jour).
- [ ] **3. Redéployer** — la variable n'est lue qu'au démarrage.
- [ ] **4. Vérifier** que `/api/admin/coherence` répond encore : c'est la route
      qui utilise la clé de service. Si elle rend 500, la nouvelle valeur n'est
      pas arrivée.

**Ce qui rend cet incident sournois** : rien ne casse. Le site tourne
exactement pareil avec une clé compromise qu'avec une clé saine — il n'y a
aucun symptôme à attendre, aucune alerte à guetter. C'est pourquoi la rotation
se fait **maintenant** et pas « quand on aura le temps ».

**Ce qui n'aurait servi à rien** : supprimer le message. Une clé sortie du
coffre est sortie. La seule protection est de la rendre inutile.

## Écarts de réconciliation topup

_(à compléter au fil de l'eau — date, order_id, nature de l'écart, résolution)_

## Dossiers juridiques — REPORTÉS par le porteur (2026-08-01)

Les deux existaient en prose (`docs/17`, `docs/03`) mais dans **aucune liste
d'action**. C'est la façon la plus sûre d'oublier quelque chose : le texte
reste juste, et personne ne le rouvre. Ils sont donc inscrits ici, au statut
que le porteur leur a donné — **reportés, pas clos**.

- [ ] **Encaissement USD par Zelle** — `ZELLE_RECIPIENT` est un e-mail ou
      téléphone **US** enrôlé Zelle, adossé à un compte bancaire américain.
      Les fonds diaspora atterrissent donc aux États-Unis, ce qui appelle le
      même *merchant of record* que Stripe. La différence entre les deux rails
      est **opérationnelle** (API contre confirmation manuelle), pas juridique
      — ouvrir Zelle ne contourne pas le blocage Stripe. → `docs/03` §1 et
      « Rails diaspora USD ».
      ⚠️ **À instruire en premier des deux** : c'est le seul des deux flux qui
      dépend d'un tiers — la banque — **qui n'a jamais été consulté**. Un flux
      dont une partie ignore qu'elle y participe n'a pas d'accord à révoquer,
      donc rien ne l'a jamais validé. La rétention, elle, est mal cadrée mais
      interne : on sait qui décide.
- [ ] **Rétention des fonds vendeurs (escrow, maturation J+7)** — compte
      marchand unique, fonds vendeurs et revenus plateforme mêlés, aucun
      cantonnement. → `docs/17`.

**Ce que ces deux dossiers ont en commun, et qui interdit de les « corriger »
côté texte** : les phrases de façade qui les décrivent sont **vraies**.
`why.1.b` (escrow), `why.3.b` (Zelle), `faq.a1` (Zelle), `faq.a4` (J+7) —
dans les deux langues — décrivent fidèlement ce que le code fait. Les
réécrire sans changer le flux ne réduirait pas le risque : ça le déplacerait
vers l'écart entre la page et la réalité, qui est le pire endroit où le
loger, parce que plus personne ne l'y voit.

Ne rien construire qui **aggrave** l'un ou l'autre sans avis écrit.
