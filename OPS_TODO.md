# OPS_TODO — Zabelie

Actions opérationnelles côté porteur (aucune n'est du code). Les écarts de
réconciliation topup détectés par le cron doivent aussi être consignés ici.

## 🔴 EN TÊTE — la panne d'inscription : deux écrans, pas un formulaire

**Statut au 2026-08-01 : NON RÉSOLUE.** C'est la seule chose de ce fichier qui
casse un parcours utilisateur aujourd'hui.

**Constat, pas déduction :** `auth.users` ne contient qu'une ligne, du
2026-07-09. Aucun trafic d'authentification n'atteint Supabase.

**Hypothèse principale :** `NEXT_PUBLIC_SUPABASE_URL` et
`NEXT_PUBLIC_SUPABASE_ANON_KEY` absentes **au moment du build**. Next.js les
inline à la compilation : absentes, le client lève avant tout appel réseau, et
la page affiche « Mode démo ».

### Le geste : ouvrir DEUX pages de connexion, ne rien remplir

1. la préversion de la PR #55 ;
2. la production.

La comparaison tranche plus vite que n'importe quelle inscription. Pas de
saisie, pas de console, pas de compte créé — ce qui élimine du même coup les
deux faux positifs qui traînaient : « l'adresse était déjà inscrite » et
« erreur de manipulation ».

### Lire le résultat — Preview et Production sont DEUX environnements Vercel

Chacun a ses propres variables. Être réglé en Production ne met rien en Preview,
et l'inverse est vrai aussi. D'où quatre lectures, pas deux :

| Préversion | Production | Ce qu'on en conclut |
|---|---|---|
| « Mode démo » | « Mode démo » | mécanisme confirmé, variables manquantes des deux côtés |
| « Mode démo » | formulaire normal | mécanisme confirmé sur Preview ; **rend l'hypothèse très probable en production sans la prouver** |
| formulaire normal | « Mode démo » | même mécanisme, variables présentes en Preview et absentes en **Production** — c'est le scénario le plus cohérent avec « aucune requête depuis le 9 juillet » |
| formulaire normal | formulaire normal, et l'inscription échoue **avec une requête visible vers Supabase** dans l'onglet réseau | **seul cas qui fait tomber l'hypothèse.** C'est autre chose ; le F12 redevient nécessaire |

⚠️ **Un formulaire normal sur la préversion ne réfute rien à lui seul.**
L'hypothèse ne tombe pas, elle se **déplace** vers Production. Seule la
quatrième ligne la réfute, et elle exige de voir une requête partir.

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
