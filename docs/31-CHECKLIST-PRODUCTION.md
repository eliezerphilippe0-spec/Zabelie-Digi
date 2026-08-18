# 31 — Checklist production — Zabelie

> **Statut :** version DÉDUPLIQUÉE du brouillon porteur du 2026-08-18, mesurée
> contre `main` (`2f3806e`, PR #133) le jour même. Le brouillon visait
> `docs/29` : ce numéro est pris (`29-FACTURATION-VENDEUR.md`), et son état des
> lieux datait d'avant deux semaines de travail parallèle — **la moitié de ce
> qu'il commandait est déjà construite et appliquée.** Chaque ligne ci-dessous
> porte sa preuve ou son manque ; rien d'autre ne compte.
>
> **Règles conservées du brouillon, telles quelles :**
> un chantier = une branche = une PR = un checkpoint humain · aucune case
> cochée sans `file:line` ou sortie de commande · invariants non négociables
> (préfixe `zabelie_`, RLS partout, ledger append-only, registre + empreinte,
> Kreyòl d'abord, thème `app/zabelie-theme.css`).
>
> **Corrections au brouillon :** le titre disait « Zabelie Digi » — le nom est
> **Zabelie** (tranché 2026-07-24). `CHANTIER-ZABELIE-ENTELIJAN.md` n'existe
> pas dans le dépôt (référence morte). `zabelie_ai_jobs` n'existe pas —
> l'objet réel est `zabelie_ai_surplus` (`0071`/`0072`).

---

## Légende

✅ fait, preuve citée · 🟡 partiel, reste nommé · 🔒 bloqué par un arbitrage
nommé (ne pas coder) · ☐ à faire, rien n'existe · ✗ retiré (faux ou caduc)

---

## C1 — Clé storage · ✅ RÉSOLU LE 2026-08-14, deux restes

Le diagnostic du brouillon était le bon et il est **déjà traité** : la clé
exposée le 2026-08-04 était morte, `storage.objects` portait RLS **sans aucune
policy**, donc aucune écriture de stockage n'avait jamais réussi — le kind
`fichier` était structurellement invendable (`OPS_TODO.md`, ligne « RECLASSÉ
2026-08-11 »).

- ✅ C1.1–C1.2 — clé régénérée par le porteur, posée Production+Preview,
  redéployée. Preuve : **premier objet jamais écrit** dans `product-covers`,
  premier `cover_url` non nul (`OPS_TODO.md`, « RÉSOLU le 2026-08-14 »).
- ✅ C1.3 — la clé de service n'apparaît que côté serveur ; gardé par
  `tests/secrets-hors-depot.test.ts` (sur `main`) et `docs/11-SECRETS.md` §4.
- 🟡 C1.4 — le téléversement de couverture est prouvé ; le **dérivé OG dans un
  partage WhatsApp réel** ne l'est pas. À faire une fois, à la première fiche.
- ☐ C1.5 — le **connu-négatif** manque : un acheteur non payé doit recevoir un
  refus sur l'URL du livrable (sortie `curl` à consigner). Même famille que le
  plafond de bucket posé le 2026-08-16 dont « l'APPLICATION n'est pas
  éprouvée » (`OPS_TODO.md`) — les deux se prouvent dans la même séance.
- 🔒 C1.6 — « cours du créole » attend **le fichier du vendeur**, en brouillon.
  Un PDF de substitution serait un livrable inventé (`OPS_TODO.md:58-61`).
  Geste vendeur, pas agent.

## C2 — Observabilité & exploitation · ☐ LE VRAI CHANTIER NEUF

Le seul des six où presque tout reste à faire.

- ☐ C2.1 — Sentry : **absent** (mesuré, zéro occurrence). ⚠️ Service externe →
  la règle dure « aucun service externe non listé sans validation » s'applique.
  La proposition dans ce document **est** la demande de validation ; un mot du
  porteur la clôt, dans un sens ou l'autre.
- 🟡 C2.2 — les crons journalisent chaque passage, y compris à zéro
  (`app/api/stock/expire/route.ts:40`, motif généralisé) ; `0055_admin_audit`,
  `0060_cron_leases`, `0061_outbox_notifications`, `0067_garde_observation`
  existent et sont appliquées. Manque : logs structurés `request_id` sur les
  routes, corrélation.
- ☐ C2.3 — aucune **alerte** ne sort du système : un échec MonCash ou un cron
  mort se lit dans un journal que personne n'ouvre. C'est l'écart le plus
  dangereux du dépôt aujourd'hui — « l'absence de signal doit être un signal »
  vaut aussi pour l'exploitation.
- ☐ C2.4–C2.5 — sauvegardes : configuration jamais vérifiée, restauration
  jamais répétée. Un test de restauration daté sur projet jetable.
- ☐ C2.6 — `RUNBOOK` : absent (mesuré — `docs/30` est l'audit Izikit, pas un
  runbook). Numéro à prendre : le suivant libre au moment de l'écriture.

## C3 — Anti-fuite RLS en CI · 🟡 LES TROIS QUARTS EXISTENT

- ✅ socle — **46 fichiers** de tests SQL, job `sql-tests`
  (`.github/workflows/ci.yml:102`), protection de `main` avec
  `build`·`e2e`·`sql-tests` exigés (le critère 4 du brouillon est **fait**
  depuis le 2026-08-03). Isolation acheteur d'`orders` prouvée par mutations
  (`supabase/tests/orders_rls_isolation.test.sql`) ; ledger anti-UPDATE/DELETE
  testé ; révocations `SECURITY DEFINER` balayées.
- ☐ C3.1 — la **matrice table × rôle** n'existe pas. 80+ tables maintenant :
  elle se génère depuis `pg_policies`, elle ne s'écrit pas à la main.
- ☐ C3.2 — les tentatives **vendeur A → données de B** ne sont pas
  systématiques (l'existant couvre acheteur/commandes et le ledger). À
  compléter : brouillons, wallet, KYC de B.
- ☐ C3.4 — le garde « nouvelle table `zabelie_*` sans RLS = CI rouge »
  n'existe pas (mesuré : aucun test ne lit `pg_policies`). C'est le cousin de
  `zabelie_objets_requis`, à éprouver par une table-témoin (connu-positif)
  puis suppression.

## C4 — Chaîne financière vendeur · 🟡 CONSTRUITE AUX DEUX TIERS PAR LE TRAVAIL PARALLÈLE

- ✅ C4.3 — `0043` est **appliquée**. Restent ses **trois valeurs à arbitrer**
  (5 j / 7 j / 0 j), en base, modifiables par `UPDATE` tant qu'aucune commande
  physique n'existe (`OPS_TODO.md`, registre ; `docs/21` §2). C'est un
  arbitrage porteur, pas une procédure.
- ✅ C4.4.1–.3 — politique de confidentialité §9 (4 langues), CGU §7, dossier
  d'arbitrage `docs/36-DOSSIER-RETENTION-KYC.md` : **faits** (2026-08-15).
- 🔒 C4.4.2/.4 — la **durée de rétention KYC** attend HDIT/Cabinet Volmar —
  `docs/36` retourne le cadrage : 90 j est probablement faux dans les deux
  branches (GAFI 5 ans si assujettie, suppression immédiate sinon).
  L'armement (`requis_pour_retrait = true`) reste un geste porteur, après
  fenêtre de vérification des vendeurs. **Ne rien coder ici.**
- 🟡 C4.1 — le tableau de bord lit déjà `balance_htg`/`pending_htg`
  (`app/tableau-de-bord/page.tsx:130-135`). Manque le **relevé** : détail
  commission par vente, historique de retraits. ⚠️ Contrainte du registre :
  les totaux par lots de `lib/somme-htg.ts` sont un pis-aller documenté — le
  relevé ne doit pas en ajouter un deuxième.
- 🟡 C4.2 — `0061_outbox_notifications` + `lib/zabelie-notify.ts:25`
  (`notifyOrderPaid`) existent. Croiser la liste réelle des événements émis
  avec les cinq attendus (vente, fonds mûris, retrait initié/payé/échoué) —
  **mesurer avant d'écrire**, le manque exact est inconnu.
- 🟡 C4.5 — T1–T4 de `0072` couvrent recouvrement + invariant `0033` ; la
  traversée complète vente → J+7 → retrait en un seul test n'existe pas.

## C5 — Litiges & remboursements · ☐ LE DEUXIÈME CHANTIER NEUF

- Existant : l'embryon de `0043` (`zabelie_report_not_received`,
  `app/api/fulfillment/not-received/route.ts`) et la spec
  `docs/28-NOTIFICATIONS-SUIVI-LITIGES.md`. **Aucune table de litige, aucune
  machine à états** (mesuré : `zabelie_disputes` = 0 fichier).
- ⚠️ C5.2 (gel de maturation) touche l'**argent** → zone d'arrêt §4 de
  `docs/25` : l'agent écrit la spec et la migration, le porteur arbitre avant
  toute application. Le remboursement par écriture inverse existe déjà
  (`refund_order`, réécrit par `0081`) — le litige doit s'y brancher, pas le
  dupliquer.
- C5.5 s'appuie sur `0055_admin_audit` (appliquée) : la journalisation admin
  existe, il manque la file et la décision motivée.
- 🔒 C5.6 — clause CGU litiges → même dossier Volmar que le reste.

## C6 — Recherche & onboarding · 🟡 LA RECHERCHE EXISTE, LE PARCOURS NON

- ✅ C6.1-recherche — trigrammes + normalisation kreyòl : **construit et
  appliqué** depuis `0047` (`zabelie_search_fuzzy`,
  `supabase/migrations/0047_search_demand.sql:370`), révoqué d'`anon`
  (`0050`), indexes `0028`. Le brouillon commandait de le construire :
  **doublon évité.**
- ☐ C6.1-synonymes — la table de synonymes multilingues n'existe pas
  (mesuré). C'est le seul morceau manquant de E1.
- 🟡 C6.2 — la normalisation (accents, kreyòl à l'oreille) est testée en SQL ;
  les requêtes réelles nommées (« fòmasyon », « kou kreyòl ») ne sont pas un
  jeu de test consigné. Petit.
- ☐ C6.3 — onboarding guidé avec progression persistée : n'existe pas.
- 🟡 C6.4 — états vides : accueil gardé (`tests/home-empty-state.test.ts`) ;
  tableau de bord vendeur sans vente : à vérifier à l'écran.
- ☐ C6.5 — Lighthouse 3G, parcours chronométré par un testeur externe :
  jamais mesurés. ⚠️ Le registre porte déjà la piste la plus rentable :
  transformations d'images Supabase (2 241 Ko → ~40 Ko) — vérifier **avant**
  d'optimiser autre chose.

---

## Ordre proposé (dédupliqué)

| # | Chantier | Pourquoi cet ordre |
|---|---|---|
| 1 | **C1-restes** : connu-négatif du 403 livrable + plafond bucket éprouvé + OG WhatsApp | une séance, ferme le chantier storage pour de bon |
| 2 | **C2** : alertes d'abord, runbook ensuite, Sentry si validé | seul chantier où une panne reste invisible aujourd'hui |
| 3 | **C3-restes** : garde « table sans RLS » + matrice générée + A→B systématique | mécanique, sans arbitrage |
| 4 | **C4-restes** : relevé vendeur + croisement des notifications | lecture seule du ledger, aucun risque |
| 5 | **C5** : spec + migration litiges, application sur arbitrage | dépend des valeurs de `0043` et de Volmar pour les CGU |
| 6 | **C6-restes** : synonymes, onboarding, mesures de perf | l'expérience, quand le socle tient |

Hors périmètre inchangé (V2) : MFA, API publique versionnée, webhooks
sortants, marketing, multi-tenant, Zapier/n8n, signature électronique.

## Journal des vérifications

| Date | Chantier | Vérifié par | Preuve |
|---|---|---|---|
| 2026-08-18 | État des lieux complet de ce document | agent (session accueil) | mesures `git grep`/`git ls-tree` sur `2f3806e`, citées ligne à ligne ci-dessus |
