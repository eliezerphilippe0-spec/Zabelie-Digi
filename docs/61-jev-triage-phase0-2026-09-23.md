# Jev × triage WhatsApp : Phase 0, reconnaissance (2026-09-23)

Demande : « évaluation kreyòl puis triage WhatsApp », Phase 0 seule, **sans
code**. Ce document dit ce qui existe, ce qui manque, et ce qui contredit la
demande. **Rien n'est tranché ici** : la suite attend le « go » du porteur.

## 0. Trois contradictions avec la demande, à lever avant toute ligne de code

1. **Les deux documents de référence n'existent pas dans le dépôt.**
   `MASTER_PROMPT_ZABELIE_AI.md` : aucun fichier, dans aucune branche, dans
   aucun commit (`git log --all -- '*MASTER_PROMPT*'` vide).
   `CHANTIER-ZABELIE-ENTELIJAN.md` : même résultat, et c'est déjà consigné
   comme « référence morte » (`docs/31-CHECKLIST-PRODUCTION.md:17-18`).
   → La « couche E3 », la « couche E2 » et les « quatre arbitrages bloquants »
   **ne sont définis nulle part ici**. Je ne peux pas dire s'ils sont tranchés.
   Il faut me donner ces deux fichiers, ou me dire qu'ils sont caducs.

2. **Jev est déjà intégré, et pas par OpenRouter.** La demande prévoit un
   nouveau client OpenRouter piloté par `JEV_MODEL` / `JEV_BASE_URL` /
   `OPENROUTER_API_KEY`. Le dépôt appelle déjà TypeSafe **en direct** :
   * URL fixée dans le code : `https://api.typesafe.ai/v1/systemone`
     (`lib/jev.ts:21`), modèle `jev-latest` fixé lui aussi (`lib/jev.ts:25`) ;
   * clé `TYPESAFE_API_KEY` (`lib/jev-server.ts:5`, `.env.example:146-147`,
     `docs/11-SECRETS.md:49`) ;
   * surface : `POST /api/admin/jev`, admin + MFA + même origine
     (`app/api/admin/jev/route.ts:24-26`), en mode observation, résultat
     toujours `reviewRequired: true` (`lib/jev.ts:12`).
   Écrire un deuxième client violerait l'invariant 5 (anti-doublon). La voie
   propre : **faire évoluer `lib/jev.ts`** pour lire l'URL de base et le modèle
   dans l'environnement, et garder un seul transport.

3. **Il n'existe aucun point d'entrée WhatsApp côté serveur.** Voir §1.

## 1. État réel : où arrivent les messages WhatsApp aujourd'hui

**Sur le téléphone du porteur, dans l'app WhatsApp Business. Le serveur ne les
voit jamais.**

* `lib/whatsapp.ts:34-56` ne fait que **construire un lien sortant**
  (`wa.me/message/…` si `NEXT_PUBLIC_WHATSAPP_LINK`, sinon `wa.me/<numéro>`).
  Le visiteur clique et la conversation s'ouvre dans WhatsApp, hors Zabelie.
* Aucune route webhook WhatsApp : `app/api/` ne contient que `stripe/webhook`
  et `kobara/webhook` comme récepteurs entrants ; aucune occurrence de
  `graph.facebook`, `hub.challenge` ou `wa_id` dans le dépôt.
* L'API Meta Cloud n'existe qu'en **placeholder** :
  `WHATSAPP_BUSINESS_API_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` sont listées dans
  `docs/API_KEYS_REGISTRY.md:59`, absentes de `.env.example:128-129` (seules les
  deux variables `NEXT_PUBLIC_` du lien y sont), avec la réserve de coût notée
  juste en dessous (facturation par conversation, onboarding Meta de 1 à 3
  semaines).

Conséquence pour la Phase 2 : **« brancher le triage sur le point d'entrée
WhatsApp » n'a pas d'objet tant que ce point d'entrée n'existe pas.** Trois
options, qui sont des décisions porteur (dépense, variables, positionnement) :

| Option | Ce qu'elle suppose | Coût |
|---|---|---|
| A. Brancher Jev sur le **support dans l'app** | `zabelie_support_cases` / `_messages` existent (`supabase/migrations/0113_haiti_marketplace_operations.sql:56,75`), dossier lié à une commande, historique append-only (`:95-99`) | aucun service nouveau, mais ce n'est pas WhatsApp |
| B. Ouvrir l'**API WhatsApp Cloud** (Meta) | webhook entrant, vérification Meta Business, secrets | dépense récurrente + délai externe : zone d'arrêt |
| C. Rester en **copier-coller admin** | `POST /api/admin/jev` existe déjà | zéro, mais aucun triage automatique |

La messagerie acheteur ↔ vendeur (`0090_messagerie.sql`) n'est **pas** un
canal support plateforme, et son en-tête le dit (`0090_messagerie.sql:14-17`).

**Jev n'a jamais classé un seul vrai message Zabelie** : aucun appel émis
(`docs/60-audit-supervision-jev-2026-09-21.md:182-183`), et « la qualité en
créole n'est pas attestée » (`docs/JEV-INTEGRATION.md:36`). La Phase 1 est
donc bien la première mesure, pas une redite.

## 2. Ce qui se réutilise

| Besoin | Existant | Réutilisable tel quel ? |
|---|---|---|
| Transport HTTP Jev | `classifyWithJev` (`lib/jev.ts:15-55`) : fetcher injectable, zod en sortie, délai 8 s, `redirect: "error"`, erreurs opaques (`:49-51`) | **Oui, après paramétrage** de l'URL et du modèle. Pas de retry aujourd'hui (la demande veut un retry borné sur 429/529). |
| Tests du transport | `tests/jev.test.ts`, 5 tests sur transport simulé | Oui, à étendre |
| Lecture bornée du corps | `readJevInput` (`lib/jev.ts:58-76`) | Oui |
| Garde « message = donnée non fiable » | consignes `lib/jev.ts:30,37` | Oui |
| Limiteur | `rateLimit` (`lib/zabelie-rate-limit.ts:10`) | Oui |
| Journal | `exigerTraceAdmin` (`lib/admin-audit.ts:52`) écrit dans `zabelie_admin_actions` | Pour les actes admin. Pour le journal de décisions de la Phase 2 (intention, probabilités, version, latence), c'est un **objet différent**, qui demanderait sa propre table : une migration, donc arbitrage. |
| Drapeau | motif `process.env.X === "true"`, défaut fermé (`lib/topup-flag.ts:44-45`) | Oui, pour `ZABELIE_JEV_TRIAGE_ENABLED` |
| **Redaction** | `redactPayment` (`lib/moncash.ts:512-515`) retire le champ `payer` d'un **objet MonCash structuré** ; `redactKobaraPayment` (`lib/kobara.ts:275`) idem | **Non.** Aucun des deux ne traite du texte libre. **Aucun masquage de texte libre n'existe dans `lib/`** (recherche `mask|anonymi|scrub|pii` : seul `masquer()` d'adresse courriel, `lib/zabelie-email.ts:53`). Une fonction dédiée est à écrire, avec tests positifs et négatifs. |

Éléments déjà disponibles pour cette redaction : le format exact du numéro de
commande est `^ZB-[0-9]{6}-[2345679ACDEFGHJKMNPQRSTVWXYZ]{5}$`
(`supabase/migrations/0042_order_ref.sql:32`), donc masquable sans deviner.
Les numéros haïtiens (`+509`, 8 chiffres, séparateurs variables) et les noms
propres sont plus durs : **les noms ne se retirent pas de façon fiable par
motif**, et ce point doit être dit avant de promettre la minimisation. Les
motifs devront suivre la règle `\b` du `CLAUDE.md` (lettres accentuées en
frontière).

**Confinement de rôle DB « comme E2/E3 »** : aucun rôle Postgres dédié n'existe
dans les migrations (recherche `create role` : aucun résultat). Les routes
serveur passent par `createAdminClient()` (service role). Pour la Phase 1,
qui ne touche aucune base, la preuve adaptée est un **test de graphe
d'imports** : `scripts/jev-eval/` et `lib/jev*` n'importent aucun client
Supabase. Un vrai rôle confiné en Phase 2 serait une migration.

## 3. Schéma de l'API : NON vérifié dans la doc officielle

L'invariant 1 exige cette vérification **avant** d'écrire le client. Elle n'a
pas pu être faite : depuis cette session, `docs.typesafe.ai` et `openrouter.ai`
sont refusés par le proxy sortant (403 sur CONNECT, mesuré ; même mur que
`docs/60` §2).

Ce que disent des **sources secondaires** (tickets GitHub publics, pas la doc) :

* OpenRouter : `POST https://openrouter.ai/api/alpha/decisions`, endpoint
  **alpha**, modèle `typesafe/jev-latest` (ou `typesafe/jev-1.13`) ;
* même protocole que TypeSafe (`state` + `questions` de type
  `choice`/`noul`/`score` → `answers`), réponse enrichie de `id`, `provider`,
  `usage.cost`, ce qui donnerait le **coût réel** demandé par la Phase 1 ;
* écart signalé : sur OpenRouter, les `criteria` d'une question `noul` doivent
  porter **les deux** valeurs `true` et `false` ; or `lib/jev.ts:37` n'en envoie
  aucune ;
* fiabilité signalée : environ 15 % d'appels bloqués jusqu'au délai de lecture
  sur l'endpoint alpha, d'où un retry borné indispensable.

**Le client ne s'écrit pas sur ces seules bases.** Pour lever le blocage : me
coller la page de référence de l'endpoint, ou autoriser ces deux domaines dans
la politique réseau de l'environnement.

Sources : [pydantic-ai#8552](https://github.com/pydantic/pydantic-ai/issues/8552),
[oh-my-pi#12458](https://github.com/can1357/oh-my-pi/issues/12458),
[OpenRouter, page Jev](https://openrouter.ai/docs/guides/community/jev) (non ouverte, proxy).

## 4. Taxonomie d'intentions : proposition, à valider

Il existe **déjà deux taxonomies**, et elles ne se recouvrent pas :

* Jev, 8 catégories en français : `produit`, `paiement`, `livraison`,
  `acces_numerique`, `remboursement`, `compte`, `vendeur`, `autre`
  (`lib/jev.ts:3`) ;
* le support dans l'app, 5 motifs, contrainte SQL : `debited`, `not_received`,
  `wrong`, `digital`, `other` (`lib/support-case.ts:2`,
  `0113_haiti_marketplace_operations.sql:60`).

Aucun message réel n'a pu fonder la proposition, **parce qu'il n'en existe
aucun en base**. Mesuré le 2026-09-23 en lecture seule sur le projet
`ddditxykopuxxqzgkqwy` (⚠️ `list_projects` renvoie `[]`, mais l'accès direct
par identifiant fonctionne : le premier constat « aucun projet visible » était
faux) :

```
zabelie_support_cases      0     zabelie_messages (0090)       0
zabelie_support_messages   0     product_reviews avec texte    0
orders                    15     profiles                      4
```

Les seuls textes clients de Zabelie sont donc dans WhatsApp Business (§1). La proposition part donc des
deux listes existantes et de celle de la demande :

| Proposé | Existant Jev | Existant support | Note |
|---|---|---|---|
| `swivi_komand` | `livraison` | `not_received` | |
| `pwoblem_peman` | `paiement` | `debited` | « débité mais pas confirmé » est le cas n°1 attendu (`docs/49` : 14 paiements MonCash, tous échoués) |
| `ranbousman` | `remboursement` | `wrong` | |
| `akse_nimerik` | `acces_numerique` | `digital` | **absent de la liste de départ**, mais présent dans les deux existantes (produits digitaux = un des trois piliers) |
| `kont` | `compte` | — | **absent de la liste de départ** (connexion, mot de passe) |
| `kesyon_pwodwi` | `produit` | — | question avant achat |
| `vande` | `vendeur` | — | ⚠️ identifiant **sans accent** : `vandè` a l'accent en position finale, exactement le cas où `\b` échoue (`CLAUDE.md`, règle kreyòl) |
| `plent` | — | — | ⚠️ **chevauche** `ranbousman` et `swivi_komand` (une plainte porte presque toujours sur l'un des deux). À définir étroitement (plainte sur un vendeur ou sur le service), ou à retirer au profit de la question `eskalade` |
| `lot` | `autre` | `other` | |

`eskalade` (noul) et `ijans` (noul ou score) restent des **questions
séparées** de l'intention, comme dans la demande. Hors taxonomie : la recharge
(`app/rechaj`) est fermée par drapeau (`lib/topup-flag.ts:44-45`).

À trancher par toi : garder ou retirer `plent`, ajouter `akse_nimerik` et
`kont`, et la graphie des identifiants (ASCII recommandé).

## 5. Préalables à la Phase 1, qui ne dépendent pas de moi

1. **Le jeu de données.** 150 à 200 messages WhatsApp réels, anonymisés et
   étiquetés à la main. Vu le trafic mesuré (`docs/49`), il faut vérifier que
   l'historique WhatsApp Business en contient autant ; sinon le rapport de
   Phase 1 aura des intervalles de confiance trop larges pour décider, et il le
   dira.
2. **Une clé** (OpenRouter ou TypeSafe) posée en local, jamais dans le dépôt.
   `docs/JEV-INTEGRATION.md:17` demande déjà de révoquer une clé partagée en
   conversation : à faire d'abord si ce n'est pas fait.
3. **La doc de l'endpoint** (§3).
4. **Le transport** : OpenRouter (alpha, retry nécessaire) ou TypeSafe direct
   (déjà câblé, liste d'attente). Le code peut porter les deux par variables ;
   le choix de celle qu'on mesure reste le tien.

## 6. Questions ouvertes, remontées sans les trancher

* **Rétention chez OpenRouter / TypeSafe** de messages clients, même
  anonymisés : à valider avec Cabinet Volmar avant la production. Note : la
  redaction par motif ne retire pas les noms de façon fiable (§2), donc
  « anonymisé » ne sera pas absolu.
* **Passage à l'API TypeSafe directe** quand le volume le justifiera. Elle est
  déjà le transport actuel du dépôt : la question est plutôt l'inverse.
* **Point d'entrée de la Phase 2** (§1, options A/B/C).

Stop. Rien de la Phase 1 n'est commencé.

---

## 7. Phase 1 — harnais d'évaluation livré (2026-09-23, après « go »)

Transport retenu : **TypeSafe direct** (le porteur a un compte). Rien n'est
branché en production : aucune route, aucune migration, aucune base.

⚠️ **Écart avec le §0.2, assumé** : `lib/jev.ts` n'a PAS été modifié. Le
paramétrer aurait touché la route admin en production, hors du périmètre
« script local » de la Phase 1. Le harnais porte donc son propre transport
(~60 lignes, même forme). La fusion dans `lib/jev/` est le premier geste de la
Phase 2, si elle est décidée — pas avant.

| Fichier | Rôle |
|---|---|
| `scripts/jev-eval/taxonomy.ts` | la taxonomie du §4, **seul endroit** où elle vit |
| `scripts/jev-eval/csv.ts` | lecteur `message,entansyon,eskalade,ijans`, fail-closed avec numéro de ligne |
| `scripts/jev-eval/redact.ts` | masquage du texte libre ; le client refuse tout objet qui n'en sort pas |
| `scripts/jev-eval/jev-client.ts` | un appel par message, trois questions groupées, relance ≤ 2 sur 429/529 |
| `scripts/jev-eval/metrics.ts`, `report.ts` | métriques pures et rapport Markdown |
| `scripts/jev-eval/run.ts` | CLI |
| `tests/jev-eval.test.ts` | 17 tests, aucun réseau |

### Lancer

1. Mettre le CSV étiqueté dans `jev-eval-data/` (ignoré par Git ; le script
   **refuse** un CSV du dépôt qui ne l'est pas).
2. Clé dans `.env.local` : `TYPESAFE_API_KEY=…` (jamais dans une conversation).
3. Vérifier sans appel ni clé :
   `JEV_EVAL_CSV=jev-eval-data/messages.csv node --import tsx scripts/jev-eval/run.ts --dry-run`
   — affiche le nombre de masquages et le corps exact d'une requête.
4. Passage réel :
   `JEV_EVAL_CSV=jev-eval-data/messages.csv node --env-file=.env.local --import tsx scripts/jev-eval/run.ts`
   → `agent-reports/jev-eval/rapport-<date>.md` (+ JSON brut), ignorés par Git.

Variables optionnelles : `JEV_BASE_URL` (URL **complète** de l'endpoint, pour
basculer vers OpenRouter `…/api/alpha/decisions` sans changer le code),
`JEV_MODEL` (`typesafe/jev-latest` côté OpenRouter), `JEV_TIMEOUT_MS`
(défaut 8000), `JEV_EVAL_MAX` (plafond d'appels facturables, défaut 250).

⚠️ **Depuis une session agent, le passage réel est impossible** :
`api.typesafe.ai` est refusé par le proxy (403 sur CONNECT, mesuré le
2026-09-23). Il se lance sur la machine du porteur.

### Choix qui changent les chiffres, écrits pour ne pas être découverts

* Un **échec d'appel** compte comme erreur d'intention, et comme « wi » pour
  `eskalade`/`ijans` (échec sûr : file humaine). Le rapport isole ces
  rattrapages dans une colonne, pour qu'ils ne se lisent pas comme du mérite.
* `eskalade` et `ijans` sont des questions **`noul`** : `score` n'est vu dans
  aucun client existant et son schéma n'a pas pu être vérifié (§3).
* Les seuils de décision 0,3 / 0,5 / 0,7 sont **affichés côte à côte**. Aucun
  seuil d'acceptation n'est appliqué.
* Délai ou erreur réseau : **pas de relance** (l'appel a pu être facturé).
* Coût : additionné si la réponse porte `usage.cost` ; sinon le rapport dit
  « coût non rendu » et renvoie au tableau de bord, jamais « 0 ».

### Éprouvé, pas seulement écrit

**Trou trouvé par le test lui-même** : la première version marquait l'objet
redacté d'un symbole privé. `{ ...redactForJev("x"), text: brut }` copie ce
symbole avec le spread, et **un texte brut serait parti chez Jev**. Le test
de contrefaçon a rougi ; la marque est devenue un registre `WeakSet` des
objets réellement émis, qu'aucune copie ne rejoint.

Douze mutations, post-condition assurée avant lecture, fichier restauré et
comparé après chacune : **les douze rougissent**, chacune sur le test visé.

| Mutation | Test rouge |
|---|---|
| garde de redaction rendue inatteignable (`return true`) | refus d'un état non redacté |
| registre jamais alimenté | 4 tests client |
| **source** du `state` changée, contrôle gardé | texte redacté envoyé |
| 500 ajouté aux relances · relances portées à 5 | relance bornée |
| `choice` non restreint à la taxonomie | réponse hors schéma |
| échec compté comme non escaladé | métriques sur jeu connu |
| motif téléphone affaibli (`\d{9,}`) | 3 tests (redaction, client, rapport) |
| rapport lisant le message brut | rapport |
| import Supabase ajouté au harnais | confinement |
| garde du jeu non ignoré désactivée (`if (false)`) | jeu commitable refusé |
| étiquette non validée (`if (false && …)`) | CSV |

Passage de bout en bout du CLI sur un CSV fictif de 4 messages avec transport
simulé : `--dry-run` correct, CSV suivi par Git refusé (sortie 1), clé
absente refusée (sortie 1), rapport généré, **chaque chiffre recalculé à la
main et conforme**. Validation : `tsc --noEmit` propre, lint propre, suite
complète **1219/1219**.

### Non vérifié

* Le schéma réel de TypeSafe (§3) : le premier passage réel le tranchera. Un
  écart rend `invalid_response` sur tous les messages, pas des chiffres faux.
* La redaction des **noms** hors formule de présentation (§2) : le CSV doit
  arriver anonymisé.
