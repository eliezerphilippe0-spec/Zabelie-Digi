# 70 — Chantier « Création éditoriale » (Zabelie Studio) : lot 0, découverte (2026-10-15)

Demande : `PRD-ZABELIE-STUDIO.md` v1.0 du 2026-10-15 et sa transmission
`PROMPT-CLAUDE-CODE-ZABELIE-STUDIO.md` (hors dépôt). Le PRD est une **annexe
d'évolution** : il ne remplace ni `CLAUDE.md`, ni `docs/26`, ni les contrats de
paiement et de livraison numérique. Ce document est son lot 0 : **lecture
seule, aucun code, aucune écriture en base.** Il dit ce qui existe, ce qui
manque, ce qui contredit la demande et ce qui reste à trancher. Le plan
d'exécution vit dans `tasks/plan.md`, la liste de tâches dans `tasks/todo.md`.

**Mesuré sur** : `origin/main` = `172579269270f7089c3400d6e4826dafe6d3d1a2`
(PR #356, 2026-10-14), identique à la référence du PRD. Worktree
`C:\Users\Philippe\Zabelie-Creation`, branche `docs/creation-editoriale-lot0`.
Toute référence `fichier:ligne` ci-dessous a été lue sur cet arbre.

---

## 0. Objectif vérifiable, périmètre, borne (`docs/25` §0)

**Objectif du MVP, tranchable par une machine.** Sur une preview, drapeaux
allumés et fournisseur **simulé** : un vendeur de test crée un guide en
kreyòl, le rédige sans IA, demande une suggestion simulée pour une section,
l'accepte, approuve la révision, génère le PDF, approuve cet export exact, puis
prépare sa fiche. Résultat attendu : **exactement un** produit `fichier` en
brouillon lié au projet, portant **un** `product_assets` dont la taille réelle
et l'empreinte SHA-256 égalent celles de l'export approuvé ; et les cas T01 à
T31 du PRD passent (tests SQL dans le job CI `sql-tests`, le reste en local).

**Périmètre.** Dépôt `Zabelie-Digi`, une branche par phase, base de test
jetable de la CI. Hors périmètre : `marketplace-hub`, le Studio images
(`/tableau-de-bord/studio`, `0118`/`0119`), tout rail de paiement, le ledger,
la facturation IA existante, l'accueil, toute écriture en production.

**Borne.** Cinq tours par tâche (`docs/25` §0), un tour = une mutation suivie
de son observation. Au cinquième, arrêt et compte rendu, même inachevé.

---

## 1. Les faits qui commandent

**1.1 L'usage n'est pas remesuré.** `docs/67` §1 (2026-10-04) : 0 produit
publié, 4 comptes, 0 commande en argent réel ; `docs/62` §0 (2026-09-23) : un
seul vendeur. Le 2026-10-15, la remesure a échoué : le connecteur Supabase de
la session rend `You do not have permission to perform this action` sur une
simple lecture. **NON VÉRIFIÉ** — ces chiffres sont datés, pas actuels.

**1.2 Ce chantier ne tombe pas sous la règle « pas de filet sur un chemin
vide » de la même façon que le Studio images.** `docs/62` §0 a buté sur un
fait : générer une image fidèle exige un produit et une photo qui n'existaient
pas. Ici c'est l'inverse : le Studio éditorial **produit** l'offre, et
`docs/67` §4.3 nomme l'offre comme « le vrai goulot ». L'argument tient pour le
parcours manuel et le PDF. Il ne tient **pas** pour l'IA réelle tant qu'aucun
créateur pilote n'est nommé : elle ne servirait personne et coûterait.

**1.3 La pile est maigre, et c'est voulu.** `package.json` ne porte que huit
dépendances d'exécution (`next`, `react`, `react-dom`, `@supabase/*`, `serwist`,
`stripe`, `zod`). Aucune bibliothèque PDF. Toute dépendance nouvelle est une
décision (§5).

---

## 2. Contradictions à arbitrer avant les lots qui écrivent

**C1 — `service_role` et stockage.** Le PRD (§8.2) et `docs/25` §5 disent :
jamais `service_role` sur un chemin atteignable par une requête utilisateur.
Le dépôt fait autrement partout où il touche au stockage ou à un adaptateur
partagé, toujours **après** un contrôle de session :

- `app/api/products/asset/route.ts:106` (`createAdminClient`) puis `:136`
  `createSignedUploadUrl` — le dépôt signé ;
- `app/api/download/route.ts:39` puis `:92` `createSignedUrl` — la livraison ;
- `lib/zabelie-rate-limit.ts:10` — `rateLimit(admin, …)` ;
- `app/api/studio/generations/route.ts` — tables `0118` révoquées à
  `authenticated`, écrites par le service role seul.

`CLAUDE.md` le dit : stockage sous RLS sans aucune politique, donc tout passe
par le service role. Un PDF privé ne peut pas être stocké autrement aujourd'hui.

| Option | Conséquence |
|---|---|
| **A (recommandée)** — Exception nommée : le service role reste confiné au **stockage** (signer, déposer, lire l'objet réel), au limiteur partagé et à la persistance des **résultats fournisseur** (contrat système, §7). Toute lecture et écriture des tables neuves par le vendeur passe par son JWT et la RLS. | Conforme à l'existant ; la frontière est testable (aucune route Studio n'appelle `createAdminClient` hors de trois fonctions nommées). |
| B — Politiques RLS sur `storage.objects` pour un bucket dédié | Plus pur, mais c'est la **première** politique de stockage du dépôt : un chantier de sécurité à part, avec ses propres tests. |

**C2 — Qui autorise la migration et la fusion.** `CLAUDE.md` (règle dure n°5)
porte l'autorisation permanente du 2026-08-17 : appliquer une migration rédigée
et éprouvée par la CI, fusionner une PR verte. Le PRD §19 et la transmission §6
disent l'inverse pour ce chantier : « ne pas importer une autorisation
historique d'un autre chantier ». Les deux textes viennent du porteur.

| Option | Conséquence |
|---|---|
| **A (recommandée)** — Pour ce chantier, le PRD prime : chaque migration et chaque fusion attendent un « oui » explicite. | Plus lent, mais cohérent avec un chantier neuf et à coût IA. |
| B — L'autorisation permanente s'applique aussi ici. | Plus rapide ; contredit le PRD qu'il faudrait alors amender. |

**C3 — Le précédent du Studio images n'est pas un modèle de privilèges.** `0118`
garde très bien l'idempotence (unique `(seller_id, idempotency_key)`), les
quotas (trigger sous `pg_advisory_xact_lock`, jour civil haïtien, table de
config à une ligne) et les transitions (append-only). Ces motifs sont repris.
Son modèle d'accès (tables fermées à `authenticated`, tout par le service
role) ne l'est pas : le PRD exige JWT + RLS pour le vendeur. Pas d'arbitrage
requis, seulement un écart assumé et écrit.

**C4 — Il n'existe pas d'état « soumis à la revue » distinct du brouillon.**
`app/api/admin/menu-counts/route.ts:56` compte **tous** les brouillons comme
file de modération ; `docs/54` : « les brouillons apparaissent dans la
modération existante ». Un brouillon préparé par le Studio entrerait donc dans
la file dès sa création. Le PRD (STU 08) veut « préparer » puis « soumettre ».

| Option | Conséquence |
|---|---|
| **A (recommandée)** — Ne créer le brouillon produit qu'au geste « Soumettre à la revue », après approbation de l'export. « Préparer ma fiche » reste un état du **projet**. | Aucun changement de la modération ; la file ne voit que des fiches complètes. |
| B — Ajouter un état « prêt pour revue » aux produits | Touche `products`, l'admin et le parcours manuel existant : hors MVP. |

---

## 3. Matrice existant → extension minimale

| Besoin | Existant vérifié (fichiers, appelants) | Tables / tests | Extension minimale |
|---|---|---|---|
| Identité, compte actif, acceptations | `lib/auth.ts:70` `requireActiveAccount(id, {legalAcceptance})`, `:63` `requireLegalAccountPage` ; appelés par `app/api/products/route.ts`, `app/api/studio/generations/route.ts` | `profiles`, `zabelie_policy_acceptances` | Réutiliser à chaque route et page. Aucun compte Studio. |
| Drapeau de capacité | `lib/creative/studio.ts:14` `studioEnabled` (`=== "true"`), `lib/studio-server.ts` ; lien conditionnel `app/tableau-de-bord/page.tsx:503` | — | `lib/digital-authoring/flags.ts` : `ZABELIE_AUTHORING_ENABLED`, `ZABELIE_AUTHORING_AI_ENABLED`, éteints par défaut, indépendants de `ZABELIE_STUDIO_ENABLED`. Éteint → 404 `api.feature.off`. |
| Type de produit | `lib/product-kind.ts` (`fichier`, `isDownloadable`) | `tests/product-kind-discipline.test.ts` | Aucun type neuf : l'ebook est un `fichier`, mode numérique `file`. |
| Création d'un brouillon | `app/api/products/route.ts` (POST : session, acceptation, `rateLimit` 10, rayon et sous-rayon validés, prix serveur, insertion `draft` au service role) ← `components/publish-form.tsx` | `products` | Extraire la création en fonction partagée **sans changer son comportement** ; l'appeler depuis « Soumettre ». Unicité par projet : §7.4. |
| Atelier numérique | `zabelie_digital_studio` (`0104`) via `app/api/products/digital-studio/route.ts` ; validation `lib/digital-studio.ts:16` `parseDigitalStudio` (aperçu ≤ 6 000, résultats ≤ 1 600, prérequis ≤ 1 200, 8 FAQ, 40 leçons, 20 fichiers, 50 Mio) | `supabase/tests/digital_studio.test.sql`, `tests/digital-studio.test.ts` | Remplir mode `file`, extrait, résultats, prérequis, FAQ en passant par `parseDigitalStudio`. Limites importées, jamais recopiées. |
| Détails numériques | `zabelie_digital_details` (`0103`) : contenu, formats, compatibilité, licence ; `lib/digital-details-server.ts` | — | Proposer sommaire, « PDF », licence choisie par le vendeur. |
| Dépôt du livrable | `app/api/products/asset/route.ts` : deux temps (`demande` → lien signé ; `confirme` → taille réelle lue dans les métadonnées de l'objet, insertion `product_assets`), bucket privé `product-files` (`lib/storage-buckets.ts`), produit `draft` exigé, 20 fichiers max, conservation de l'objet sur échec ambigu | `product_assets` | Le serveur détient déjà les octets du PDF : dépôt côté serveur, puis **la même confirmation** (objet réel, taille réelle) extraite en fonction partagée. Aucun chemin ni taille venant du client. |
| Publication et versions | Admin `app/api/admin/product-status/route.ts` (MFA, refus sans livrable) → `zabelie_digital_publish` (`0104:96`) crée la release | `zabelie_digital_releases`, `zabelie_digital_entitlements` (`release_id … on delete restrict`, `0104:42`) | Inchangé. Le Studio s'arrête au brouillon. |
| Accès acheteur | `app/api/download/route.ts` ; `lib/digital-studio.ts` `digitalAccessAllowed` (`paid`/`delivered`, `buyer_id`) ; `lib/digital-studio-server.ts` `resolveDigitalRelease` | `zabelie_digital_accesses` | Inchangé (T21, T22 en régression). |
| Destinataire de commande | `zabelie_order_recipients` ; le téléchargement reste lié à `buyer_id` | — | Rien au MVP. Cadeau = lot dédié (PRD §18.2). |
| IA texte | `lib/ai-description.ts` : OpenAI ou Gemini selon la clé posée (décision porteur du 2026-08-14, « pas Claude »), clé en en-tête, `AbortSignal.timeout`, `fetcher` injectable, `max_tokens` 800, **texte libre** borné à 1 800 caractères ← `app/api/ai/description/route.ts` | `tests/ai-description.test.ts`, `tests/ai-billing.test.ts` | Contrat **insuffisant** (texte libre, un seul coup, aucune sortie structurée). Reprendre le choix du fournisseur, la clé en en-tête, le délai et l'injection ; écrire un adaptateur éditorial à sortie JSON validée par `zod`, et un fournisseur simulé déterministe. |
| Quotas et coûts IA | `lib/ai-billing.ts` (surplus des descriptions), `0119` (déduction du Studio images) | `tests/ai-billing.test.ts`, `supabase/tests/studio_facturation.test.sql` | **Ne pas réutiliser** (PRD §11.3) : compteurs neufs, non monétaires. |
| Idempotence, quotas, transitions | Motifs de `0118` : unique `(seller_id, idempotency_key)`, trigger de quota sous verrou consultatif, config à une ligne, événements append-only, sondage à la lecture (`app/api/studio/generations/[id]`) | `supabase/tests/studio_creatif.test.sql`, `tests/studio-route.test.ts` | Reprendre les motifs ; pas le modèle de privilèges (C3). |
| Limiteur de débit | `lib/zabelie-rate-limit.ts:10` `rateLimit(admin, clé, limite, fenêtre)` | — | Réutiliser (adaptateur privilégié existant, C1-A). |
| Erreurs traduites | `lib/api-erreur.ts:27` `erreurTraduite` ; cliquet `i18n-api` | `tests/i18n-api-cliquet.test.ts`, `tests/i18n-chaines-en-dur.test.ts` | Réutiliser ; aucun message d'API en dur. |
| Langues | `lib/i18n.ts` (`DICT`, quatre langues) et modules de libellés par fonction (`lib/marketplace-copy.ts`) | `tests/pluriel.test.ts`, `tests/i18n-cles-mortes.test.ts` | Libellés neufs dans les quatre langues. Langue du **contenu** (ht, fr) indépendante de l'interface. |
| Brouillon local | `lib/use-session-draft.ts` : `sessionStorage`, par onglet, âge maximal | — | Insuffisant pour STU 05 (un onglet fermé perd tout). Stockage local **par utilisateur et par projet**, purgé à la déconnexion (`app/api/auth/signout/route.ts`) et au changement de compte. Décision D6. |
| Cache du service worker | `lib/pwa-routes.ts:25` `CHEMINS_JAMAIS_CACHES` : `^/api/`, `^/tableau-de-bord` ; navigations `NetworkOnly` (`app/sw.ts:76`) | `tests/pwa-service-worker.test.ts` | `/tableau-de-bord/creation` hérite déjà ; ajouter un test qui le nomme (T26). |
| Exécution différée | `vercel.json` : crons **quotidiens** seulement ; le Studio images sonde à la lecture | — | Étapes courtes déclenchées par des requêtes authentifiées (§6). Aucun moteur de tâches. |
| Export et suppression de compte | `app/api/account/export/route.ts` (lecture par table), `app/api/account/route.ts` (suppression) | — | Ajouter les tables du Studio à l'export ; projets en cascade sur le compte, jamais sur une release ou un droit acquis. |
| Comptes de test | `0101_compte_essai.sql` : `profiles.is_test` | — | Exclure `is_test` des indicateurs du pilote (STU 10). |
| Mesure | `lib/metrics.ts` (`logLanding`, liste fermée), `zabelie_digital_metrics(uuid)` | — | Indicateurs **calculés** depuis les transitions persistées (vue ou RPC), aucun corps de livre dans les journaux. |
| Migrations | `zabelie_migration_garde`, registre `zabelie_schema_migrations`, dernier fichier `0140_zabelie_kyc_types.sql` | `supabase/tests/run.sh` (CI) | Numéro lu au moment d'écrire. ⚠️ La PR du délai promis (V-23) visera aussi `0141` : la première fusionnée le prend. |
| Tests | `tests/*.test.ts` (node), `supabase/tests/*.test.sql` + scripts concurrents (`seller_pricing_concurrent.sh`), e2e Playwright avec `e2e/fixtures/stub-supabase.mjs` | CI `build`, `e2e`, `sql-tests` | Tests SQL d'isolation et de concurrence ; une config e2e dédiée. |

---

## 4. Chemin d'interface : `/tableau-de-bord/creation` confirmé

- Libre sur `main` (`app/tableau-de-bord/` ne contient que `page.tsx`, `api/`,
  `studio/`).
- Hérite de `^/tableau-de-bord` dans `CHEMINS_JAMAIS_CACHES` et des navigations
  `NetworkOnly` : aucune page privée n'est copiée sur l'appareil.
- Lien depuis `/tableau-de-bord` et depuis le parcours numérique de `/vendre`,
  affiché seulement si `ZABELIE_AUTHORING_ENABLED` est vrai, sur le modèle exact
  du lien du Studio images (`app/tableau-de-bord/page.tsx:503`).
- Détail : `/tableau-de-bord/creation/[projectId]`, `noindex` et `no-store`.
- API : `/api/digital-authoring/projects[/id]` et
  `/api/digital-authoring/operations[/id]`, sous le JWT de l'appelant.

---

## 5. Stratégie PDF — options et conséquences (décision D1)

Contraintes : runtime Node de Vercel, caractères kreyòl et français
(`è ò à é ç ô` et guillemets typographiques), pagination réelle, octets
**déterministes** (l'approbation porte sur une empreinte), aucune ressource
distante, coût d'exécution borné, licence compatible.

| Option | Dépendances | Pour | Contre |
|---|---|---|---|
| **A — Générateur interne minimal** (polices standard PDF Helvetica/Times, encodage WinAnsi, chasses AFM en constantes, césure simple, sommaire en deux passes) | **0** | Aucune dépendance ; octets déterministes ; fichiers de quelques dizaines de Kio ; tout le texte kreyòl et français tient dans WinAnsi | Le moteur de mise en page est à nous (~500 lignes à tester) ; typographie sobre, pas les polices de la marque ; un caractère hors WinAnsi doit être refusé ou remplacé explicitement |
| **B — `pdfkit` 0.20.2** (MIT) | `fontkit`, `linebreak`, `fflate`, `png-js`, `@noble/*` | Mise en page éprouvée, pagination automatique, polices de la marque embarquées | 6 dépendances directes et leur arbre ; fichiers de données à tracer dans le bundle Vercel (`serverExternalPackages`) ; déterminisme des octets à vérifier (dates, identifiants) |
| C — `@react-pdf/renderer` 4.9.0 (MIT) | `pdfkit` + 10 paquets `@react-pdf/*` | Mise en page déclarative en React | Le plus lourd ; même question de déterminisme |
| D — Chromium sans tête | binaire de plusieurs dizaines de Mo | Meilleure typographie (HTML/CSS) | Démarrage à froid, poids, surface d'attaque : écarté par le PRD §8.4 |

**Recommandation : A, après un essai borné.** L'essai (lot 5, tâche 5.1) produit
un guide de 30 pages en kreyòl, longues chaînes et listes comprises, et
l'inspecte page par page. Si la sobriété typographique est jugée insuffisante
par le porteur, B est le repli, avec la marque embarquée. Licence des polices :
les polices standard PDF ne s'embarquent pas, donc aucune question de licence
pour A.

---

## 6. Orchestration : étapes courtes, persistées, reprenables

Aucun exécuteur durable n'existe (crons quotidiens). Le MVP n'en promet pas.

1. `POST /api/digital-authoring/operations` : contrôles (session, compte actif,
   propriété, révision, drapeaux, configuration), puis **une transaction**
   inscrit l'intention unique `(seller_id, idempotency_key)`, l'empreinte
   d'entrée, la référence de l'**instantané** source immuable, et réserve le
   quota sous verrou. Rejeu de la même clé et même empreinte : même opération.
   Même clé, autre empreinte : conflit, sans appel.
2. Dans la même requête si le budget de temps le permet, sinon à la lecture
   suivante (`GET …/operations/[id]`, comme le Studio images) : l'exécuteur
   prend un **bail** atomique (`queued → running`, jeton aléatoire, échéance),
   revérifie compte, drapeau IA, liste pilote, configuration et budget
   **juste avant** l'envoi, lit l'instantané figé, appelle le fournisseur.
3. Résultat validé par schéma, puis écrit **seulement si le jeton du bail est
   toujours le sien** : un ancien exécuteur ne peut pas écraser une reprise.
4. Délai dépassé **après** l'envoi : `uncertain`, définitif. Ni OpenAI ni
   Gemini n'offrent de clé d'idempotence ni de consultation d'état sur ces
   appels (`lib/ai-description.ts` n'en utilise aucune) : il n'y a rien à
   rapprocher. Le quota reste consommé ; le vendeur peut relancer
   **explicitement** avec une nouvelle clé, dans ses quotas.
5. Fermeture de l'IA ou suspension entre 1 et 2 : l'opération passe en
   `cancelled` sans appel (T30). Un appel déjà accepté par le fournisseur n'est
   pas annulable : l'interface le dit.

---

## 7. Modèle de données réduit (proposition, non écrite)

**7.1 `zabelie_authoring_projects`** : propriétaire, titre, langue du contenu
(`ht`|`fr`), public (`haiti`|`diaspora`|`both`), brief et sections en `jsonb`
validés, `revision` entière, révision approuvée, état éditorial
(`draft`|`review_ready`|`approved`|`archived`), dates. Écriture vendeur :
`GRANT UPDATE` limité aux colonnes éditoriales ; un trigger impose
`revision = old.revision + 1`, les dates serveur, et refuse toute écriture des
colonnes calculées. La sauvegarde est un `update … where id = $1 and revision
= $attendue` : zéro ligne = conflit (T04).

**7.2 `zabelie_authoring_revisions`** : instantanés immuables (unique projet +
numéro), créés seulement aux moments utiles (avant remplacement accepté,
approbation, export, opération), jamais à la frappe.

**7.3 `zabelie_authoring_operations`** : intention, empreinte, instantané
source, état (`queued`|`running`|`succeeded`|`failed`|`uncertain`|`cancelled`),
bail, résultat privé, code d'erreur borné, usage. Le vendeur **lit** ses
opérations et crée une intention par RPC ; il n'écrit ni état, ni résultat, ni
compteur (T31). La persistance d'un résultat fournisseur passe par une
fonction réservée au service role, avec contrôle du jeton de bail : c'est le
« contrat système » que le PRD §8.2 autorise, et l'option C1-A le nomme.

**7.4 `zabelie_authoring_exports`** : révision, empreinte du contenu, version
de modèle, chemin privé, empreinte et taille réelles des octets, approbation
(auteur, date, empreinte approuvée). **Unicité produit par projet** : deux
options pour T19.

| Option | Conséquence |
|---|---|
| **A (recommandée)** — Colonne additive `products.zabelie_authoring_project_id uuid` + index unique partiel | L'insertion du produit **elle-même** garantit l'unicité : deux intentions concurrentes, une seule fiche, aucune orpheline. Seule modification d'une table existante, nullable. |
| B — Table de liaison `projet → produit` uniques | Ne touche pas `products`, mais la création du produit et la liaison ne sont plus atomiques (l'insertion passe par supabase-js) : une panne entre les deux laisse une fiche orpheline à rapprocher. |

**7.5 Configuration** : une ligne `zabelie_authoring_config` (limites et
quotas lus en base, règle dure n°3) et une liste pilote ; compteurs d'usage
non monétaires. Aucune réutilisation du ledger.

**7.6 Suppression** : projets en cascade sur le compte ; lien produit en
`set null` ; aucune clé étrangère d'un projet vers une release ou un droit
acquis. Les releases restent protégées par `on delete restrict` (`0104:42`).

---

## 8. Les deux scénarios de bout en bout

**Manuel (IA éteinte).** Lien du tableau de bord (drapeau) → créer un projet
(RPC sous JWT, RLS) → brief validé `zod` côté serveur → plan édité, sections à
identifiants stables → approbation explicite du plan → rédaction, sauvegarde
CAS, conflit entre onglets, brouillon local restauré → contrôles qualité →
approbation de la révision → export PDF (service role confiné au stockage) →
approbation de l'export exact → « Soumettre à la revue » : création du
brouillon par la fonction partagée extraite de `app/api/products/route.ts`,
dépôt et confirmation du PDF par la logique de `app/api/products/asset/route.ts`,
atelier et détails numériques remplis via `parseDigitalStudio` → modération
existante → `zabelie_digital_publish` → droits acheteur inchangés.

**IA simulée.** Identique, plus : demande de suggestion pour une section →
intention + instantané + réservation de quota → bail → fournisseur simulé →
résultat validé → proposition séparée affichée → accepter, copier ou rejeter →
nouvelle révision sous CAS. Les cas T06–T11, T13, T29, T30 s'exercent avec le
simulé, sans aucun appel payant.

---

## 9. Décisions — registre (à reporter en tête d'`OPS_TODO.md`)

| Décision | Recommandation | Ce qu'elle bloque |
|---|---|---|
| C1 — Frontière `service_role` | A : confinée au stockage, au limiteur et au contrat système | Lots 2, 5, 6 |
| C2 — Régime migration et fusion | A : « oui » explicite par geste pour ce chantier | Toute application et toute fusion |
| C4 — Moment de création du brouillon produit | A : au geste « Soumettre à la revue » | Lot 6 |
| D1 — Moteur PDF | A (interne, 0 dépendance) après essai ; B en repli | Lot 5 |
| D2 — Unicité produit/projet | A : colonne additive sur `products` | Lot 6 |
| D3 — Fournisseur et modèle texte réels | OpenAI ou Gemini existants, choisis après mesure du coût | IA réelle seulement (lot 9) |
| D4 — Budget, plafonds, unité d'usage | Limites techniques en base, aucun crédit monétaire | IA réelle seulement |
| D5 — Conservation des brouillons, révisions, exports non acquis | Préserver toute référence ; durée à fixer | Purge automatique ; pilote réel |
| D6 — Brouillon local | `localStorage` par utilisateur et projet, purgé à la déconnexion | Lot 3 |
| D7 — Liste pilote et support | 5 à 10 créateurs nommés | Lot 9 |
| D8 — Libellés publics (« Zabelie Studio », « Créer un produit numérique ») | Ceux du PRD | Ouverture publique |

Aucune de ces décisions n'empêche le lot 1 (contrats, drapeaux, fournisseur
simulé, sans schéma ni interface publique).

**✅ Tranché le 2026-10-15** — réponse du porteur : « oui valide les six et
lance ». Retenues : **C1-A** (service role confiné au stockage, au limiteur et
au contrat système), **C2-A** (« oui » explicite à chaque migration et chaque
fusion de ce chantier ; l'autorisation permanente du 2026-08-17 ne s'y applique
pas), **C4-A** (brouillon produit créé au geste « Soumettre à la revue »),
**D1-A** (moteur PDF interne, confirmé ou remplacé par `pdfkit` après l'essai
de la tâche 4.1), **D2-A** (colonne additive unique sur `products`), **D6**
(brouillon local par utilisateur et projet, purgé à la déconnexion). Restent
ouvertes : D3, D4, D5, D7, D8 — elles ne bloquent que l'ouverture.

---

## 10. Ce qui est rendu au porteur

Ce document, `tasks/plan.md` et `tasks/todo.md`. Aucun fichier de code, aucune
migration, aucune écriture en base, aucune dépense. Prochaine action proposée :
trancher C1, C2 et C4 (les seules qui bloquent les lots 2 à 6), puis lancer le
lot 1.

**Non vérifié pendant ce lot :** l'usage actuel en production (connecteur
refusé) ; le déterminisme réel d'un PDF produit par `pdfkit` ; le comportement
de l'export et de la suppression de compte au-delà de leur lecture.
