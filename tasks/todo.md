# Tâches : création éditoriale (Zabelie Studio)

Plan : `tasks/plan.md`. Découverte : `docs/70-CHANTIER-CREATION-EDITORIALE.md`.
Règles de boucle (`docs/25`) : cinq tours au plus par tâche, une mutation puis
son observation ; chaque garde critique est éprouvée par un cas autorisé, un
cas refusé, et une mutation qui fait échouer son test.

Commandes du dépôt : `npm run preflight`, `npm run typecheck`, `npm run lint`,
`npm test`, `npm run build`, `npm run test:e2e` ; SQL : `supabase/tests/run.sh`
(job CI `sql-tests`). Aucun appel payant, aucune écriture en production.

---

## Phase 1 — Fondation (lot 1)

### 1.1 Contrats métier purs
**Description :** schémas `zod` du brief, du plan et des sections (identifiants stables), limites par défaut du PRD §11.1 (titre 160, brief 6 000, 12 sections, 12 000 par section, 120 000 au total), langue du contenu `ht`|`fr`, public, machine d'états des opérations, empreinte d'entrée normalisée, aide à la comparaison de révision. Aucun accès réseau ni base.
**Critères :**
- [x] Une entrée hors limites, une clé inconnue ou un caractère de contrôle est refusée ; une entrée valide ressort normalisée.
- [x] Les transitions interdites (`succeeded → running`, sortie d'un état final) sont refusées.
- [x] Deux entrées sémantiquement identiques donnent la même empreinte ; un seul caractère change l'empreinte.
**Vérification :** `node --import tsx --test tests/digital-authoring-contrats.test.ts` ; typecheck ; lint ; mutation de chaque garde → test rouge.
**Dépendances :** aucune.
**Fichiers :** `lib/digital-authoring/schema.ts`, `lib/digital-authoring/operations.ts`, `lib/digital-authoring/revision.ts`, `lib/digital-authoring/empreinte.ts` (serveur, `node:crypto`), `tests/digital-authoring-contrats.test.ts`.
**Taille :** M.

### 1.2 Drapeaux et fournisseur simulé
**Description :** `ZABELIE_AUTHORING_ENABLED` et `ZABELIE_AUTHORING_AI_ENABLED` (`=== "true"`, éteints par défaut, indépendants de `ZABELIE_STUDIO_ENABLED`) ; interface fournisseur (contexte autorisé seulement, sortie structurée bornée) ; fournisseur simulé déterministe, marqué comme simulation. Inventaire `.env.example`.
**Critères :**
- [x] IA éteinte ou configuration absente : aucun fournisseur rendu, aucun `fetch` appelé (espion).
- [x] Le simulé rend la même sortie pour la même entrée et porte `provider = "mock"`.
- [x] Aucun drapeau du Studio images ne change le comportement du module, ni l'inverse.
**Vérification :** tests ciblés ; `npm test` complet ; build.
**Dépendances :** 1.1.
**Fichiers :** `lib/digital-authoring/flags.ts`, `lib/digital-authoring/provider.ts`, `lib/digital-authoring/provider-mock.ts`, `.env.example`, `docs/11-SECRETS.md` (registre des clés, exigé par `tests/registre-secrets-complet.test.ts`), `tests/digital-authoring-fournisseur.test.ts`.
**Taille :** M.

## Checkpoint 1
Mesuré le 2026-10-15 sur la branche `feat/creation-editoriale-fondation` (base `1725792`) :
`npm run preflight` OK (20/20) ; `npm run typecheck` OK ; `npm run lint` 0 erreur (10 avertissements,
tous dans des fichiers antérieurs au chantier) ; `npm test` **1693/1693** (24 nouveaux) ; `npm run build` OK.
Mutations sur le code final : 32 sur 32 tuées (18 pour 1.1, 14 pour 1.2) ; une mutation équivalente écartée et remplacée.
- [x] `npm run preflight`, typecheck, lint, `npm test`, build verts, nombre de tests noté.
- [x] Aucun fichier hors `lib/digital-authoring/`, `.env.example`, `tests/`.
- [ ] PR 1 ouverte et relue par le porteur.

---

## Phase 2 — Un projet privé, sans IA (lots 2 et 3)

### 2.1 Table des projets, RLS, sauvegarde CAS en base
**Description :** migration additive (numéro lu au moment d'écrire) : `zabelie_authoring_projects`, `zabelie_authoring_config` (une ligne), RLS dès la création, `GRANT UPDATE` limité aux colonnes éditoriales, trigger `revision = old.revision + 1` et dates serveur, RPC de création sous `auth.uid()`. Post-conditions `ZBnnn`. **Bloquée par C1.**
**Critères :**
- [ ] Vendeur B ne liste, ne lit ni ne modifie le projet de A ; anonyme refusé (T01).
- [ ] Deux mises à jour sur la même révision : une ligne modifiée, l'autre zéro (T04).
- [ ] Le propriétaire ne peut écrire ni `revision`, ni l'approbation, ni l'état calculé par SQL direct (T31, partie projets).
**Vérification :** `supabase/tests/authoring_projects.test.sql` dans le job CI `sql-tests` (NON VÉRIFIÉ en local) ; mutation : retirer une politique → test rouge.
**Dépendances :** 1.1, C1.
**Fichiers :** `supabase/migrations/NNNN_zabelie_authoring_projects.sql`, `supabase/tests/authoring_projects.test.sql`.
**Taille :** M.

### 2.2 API projets sous JWT
**Description :** `/api/digital-authoring/projects` (liste en résumés, création) et `/[id]` (lecture, sauvegarde CAS), session et `requireActiveAccount` à chaque acte, `erreurTraduite`, `Cache-Control: private, no-store`, aucun `createAdminClient`. Drapeau éteint → 404.
**Critères :**
- [ ] Révision attendue périmée → 409 exploitable, rien d'écrasé.
- [ ] Réponse perdue après commit : la relecture rend la révision et l'empreinte (T05).
- [ ] Compte suspendu → refus canonique (T02, partie projets).
**Vérification :** tests de route avec client simulé ; test de source « aucun `createAdminClient` dans `app/api/digital-authoring/projects` » éprouvé par mutation.
**Dépendances :** 2.1.
**Fichiers :** `app/api/digital-authoring/projects/route.ts`, `app/api/digital-authoring/projects/[id]/route.ts`, `lib/digital-authoring/server.ts`, `lib/i18n.ts`, `tests/digital-authoring-api-projets.test.ts`.
**Taille :** M.

### 2.3 Liste des projets et création
**Description :** page `/tableau-de-bord/creation` (résumés, prochaine action utile), création d'un projet, liens conditionnels depuis `/tableau-de-bord` et le parcours numérique de `/vendre`, `noindex`. Libellés dans les quatre langues.
**Critères :**
- [ ] Drapeau éteint : aucune entrée visible, page en 404.
- [ ] 360 px sans défilement horizontal, focus clavier visible, quatre langues.
- [ ] Un projet créé est retrouvé après déconnexion et reconnexion.
**Vérification :** e2e ciblé (config dédiée, `stub-supabase`) ; captures 360 px ; tests i18n existants verts.
**Dépendances :** 2.2.
**Fichiers :** `app/tableau-de-bord/creation/page.tsx`, `components/authoring-project-list.tsx`, `app/tableau-de-bord/page.tsx`, `app/vendre/page.tsx`, `lib/i18n.ts`.
**Taille :** M.

### 2.4 Éditeur : brief, plan, sections
**Description :** `/tableau-de-bord/creation/[projectId]` : brief validé côté serveur, plan éditable (ajouter, supprimer, réordonner, identifiants stables), approbation explicite du plan, sections en texte brut. Confirmation avant suppression d'une section rédigée.
**Critères :**
- [ ] Ordre et identifiants conservés après sauvegarde et reprise ; réordonner n'efface rien.
- [ ] Langue d'interface et langue du contenu indépendantes ; changer la langue du projet ne traduit rien.
- [ ] Aucun HTML saisi n'est interprété à l'affichage (T12, partie éditeur).
**Vérification :** tests de composant ou e2e ; 360 px ; quatre langues.
**Dépendances :** 2.3.
**Fichiers :** `app/tableau-de-bord/creation/[projectId]/page.tsx`, `components/authoring-editor.tsx`, `components/authoring-plan.tsx`, `lib/i18n.ts`, `e2e/creation-editeur.spec.ts`.
**Taille :** M.

### 2.5 Sauvegarde robuste
**Description :** états « modifications locales », « enregistrement », « enregistré » (après confirmation serveur seulement), « connexion interrompue », « conflit à résoudre » ; sauvegarde après une seconde d'inactivité et bouton explicite ; brouillon local par utilisateur et projet, purgé à la déconnexion ; avertissement avant de quitter. **Bloquée par D6.**
**Critères :**
- [ ] Deux onglets sur la même révision : conflit explicite, aucune écriture gagnante silencieuse.
- [ ] Coupure puis retour : brouillon local plus récent proposé avant remplacement (T15) ; stockage refusé : édition en ligne possible et limite annoncée (T16).
- [ ] Changement de compte sur le même appareil : aucun brouillon du précédent visible (T14).
**Vérification :** e2e (deux contextes, réseau coupé, stockage bloqué) ; 360 px.
**Dépendances :** 2.4, D6.
**Fichiers :** `lib/digital-authoring/local-draft.ts`, `components/authoring-save-state.tsx`, `components/authoring-editor.tsx`, `app/api/auth/signout/route.ts` (ou le bouton de déconnexion), `e2e/creation-sauvegarde.spec.ts`.
**Taille :** M.

## Checkpoint 2
- [ ] Un guide ht et un guide fr créés et repris sans IA, à 360 px.
- [ ] SQL vert dans le job CI ; e2e ciblés verts ; suite complète verte.
- [ ] PR 2 : migration rédigée, **non appliquée**, protocole de vérification écrit.

---

## Phase 3 — Assistance IA simulée (lot 4)

### 3.1 Opérations, instantanés, quotas, bail
**Description :** migration : `zabelie_authoring_revisions` (immuables), `zabelie_authoring_operations` (unique `(seller_id, idempotency_key)`, empreinte, instantané source, bail à jeton), quotas réservés sous verrou consultatif par jour civil haïtien, RPC de création d'intention sous `auth.uid()`, RPC de résultat réservée au service role et conditionnée au jeton.
**Critères :**
- [ ] Même clé, même empreinte : même opération (T06) ; dix réservations concurrentes sur le dernier quota : une seule admise (T08).
- [ ] Un ancien jeton ne peut pas écrire de résultat (T10) ; l'instantané d'une opération en attente ne change pas si le document change (T29).
- [ ] Le vendeur ne peut fabriquer ni état, ni résultat, ni compteur (T31).
**Vérification :** `supabase/tests/authoring_operations.test.sql` + `supabase/tests/authoring_quota_concurrent.sh` dans le job CI ; mutations des gardes.
**Dépendances :** 2.1, 1.1.
**Fichiers :** `supabase/migrations/NNNN_zabelie_authoring_operations.sql`, `supabase/tests/authoring_operations.test.sql`, `supabase/tests/authoring_quota_concurrent.sh`, `supabase/tests/run.sh`.
**Taille :** M.

### 3.2 Exécuteur par étapes et routes d'opérations
**Description :** `POST /api/digital-authoring/operations` (contrôles, intention, réservation), `GET …/[id]` (lecture, prise de bail, revérification juste avant l'envoi, appel au simulé, validation, persistance sous jeton). Délai après envoi → `uncertain` définitif.
**Critères :**
- [ ] Même clé avec une autre entrée : conflit, aucun appel (T07) ; délai après envoi : `uncertain`, aucune relance (T09).
- [ ] Sortie invalide, excessive ou partielle rejetée avec un code borné (T11).
- [ ] IA coupée ou vendeur suspendu entre attente et envoi : aucun appel, état explicite, quota cohérent (T25, T30).
**Vérification :** tests d'intégration avec `fetcher` et horloge injectés ; aucun réseau.
**Dépendances :** 3.1, 1.2.
**Fichiers :** `app/api/digital-authoring/operations/route.ts`, `app/api/digital-authoring/operations/[id]/route.ts`, `lib/digital-authoring/executor.ts`, `tests/digital-authoring-executeur.test.ts`.
**Taille :** M.

### 3.3 Proposition séparée
**Description :** information préalable sur les données transmises, puis action du créateur ; affichage de la proposition à côté du texte ; accepter (nouvelle révision sous CAS), copier une partie, rejeter ; révision source affichée si le texte a changé.
**Critères :**
- [ ] Une saisie humaine pendant la génération est conservée ; la proposition reste séparée (T13).
- [ ] Rejeter ou annuler conserve le texte courant.
- [ ] Aucun HTML ni script de la réponse n'est exécuté (T12).
**Vérification :** e2e avec le simulé ; 360 px.
**Dépendances :** 3.2, 2.5.
**Fichiers :** `components/authoring-suggestion.tsx`, `components/authoring-editor.tsx`, `lib/i18n.ts`, `e2e/creation-suggestion.spec.ts`.
**Taille :** M.

### 3.4 Adaptateur réel préparé, éteint
**Description :** adaptateur OpenAI ou Gemini à sortie JSON structurée, reprenant le choix du fournisseur, la clé en en-tête et le délai de `lib/ai-description.ts` ; consignes construites sans données inutiles ; jamais actif sans `ZABELIE_AUTHORING_AI_ENABLED`, budget et liste pilote.
**Critères :**
- [ ] Testé uniquement avec un `fetcher` injecté ; aucune requête réseau dans la suite.
- [ ] Une réponse non conforme au schéma n'est jamais persistée comme résultat.
**Vérification :** tests unitaires ; test de source « aucune clé dans l'URL ».
**Dépendances :** 3.2.
**Fichiers :** `lib/digital-authoring/provider-llm.ts`, `tests/digital-authoring-llm.test.ts`.
**Taille :** S.

## Checkpoint 3
- [ ] T06–T13, T25, T29–T31 verts (SQL en CI).
- [ ] Aucun service payant appelé ; journaux sans corps de livre ni brief.
- [ ] PR 3 relue.

---

## Phase 4 — Vérification et PDF (lot 5)

### 4.1 Essai PDF borné (décision D1)
**Description :** générateur interne minimal (polices standard, WinAnsi, chasses AFM, césure, pagination, sommaire en deux passes) ; rendu d'un guide de 30 pages en kreyòl avec longues chaînes, listes et sauts de page ; caractères hors WinAnsi refusés avec un message clair.
**Critères :**
- [ ] Toutes les pages inspectées : aucun texte tronqué ni recouvert, accents corrects (T17).
- [ ] Deux rendus de la même révision donnent les mêmes octets.
- [ ] Taille ≤ 5 Mio pour le guide d'essai.
**Vérification :** captures de chaque page ; test de déterminisme ; décision D1 rendue au porteur avec les captures.
**Dépendances :** 1.1.
**Fichiers :** `lib/digital-authoring/pdf/writer.ts`, `lib/digital-authoring/pdf/metrics.ts`, `lib/digital-authoring/pdf/layout.ts`, `tests/digital-authoring-pdf.test.ts`.
**Taille :** M.

### 4.2 Contrôles qualité et approbation de révision
**Description :** liste de contrôle (sections vides, marqueurs inachevés, références déclarées séparées des suggérées, faits à vérifier), confirmation non précochée de responsabilité, approbation liée à une révision exacte (RPC).
**Critères :**
- [ ] Section vide ou marqueur inachevé signalé avant approbation.
- [ ] Toute modification invalide l'approbation pour un nouvel export.
**Vérification :** tests unitaires et SQL ; e2e court.
**Dépendances :** 2.4, 3.1.
**Fichiers :** `lib/digital-authoring/quality.ts`, `components/authoring-review.tsx`, `supabase/migrations/NNNN_…` (RPC d'approbation), `tests/digital-authoring-qualite.test.ts`.
**Taille :** M.

### 4.3 Export privé et approbation de l'export exact
**Description :** table `zabelie_authoring_exports` ; rendu depuis une révision approuvée ; dépôt au stockage privé (service role confiné, C1-A) ; empreinte, taille réelle, date ; prévisualisation et lien vendeur expirant ; approbation de l'export exact (auteur, date, empreinte). **Bloquée par C1 et D1.**
**Critères :**
- [ ] Export ancien après modification : rattachement refusé ou nouvelle approbation exigée (T18).
- [ ] Non approuvé refusé, exact approuvé accepté, empreinte différente refusée (T28).
- [ ] Taille réelle affichée avant téléchargement ; aucun lien sans contrôle de propriété.
**Vérification :** tests SQL et API ; inspection du PDF téléchargé.
**Dépendances :** 4.1, 4.2, C1, D1.
**Fichiers :** `supabase/migrations/NNNN_zabelie_authoring_exports.sql`, `app/api/digital-authoring/exports/route.ts`, `lib/digital-authoring/export.ts`, `supabase/tests/authoring_exports.test.sql`, `tests/digital-authoring-export.test.ts`.
**Taille :** M.

## Checkpoint 4
- [ ] PDF d'essai inspecté en entier ; D1 tranchée par le porteur.
- [ ] PR 4 relue.

---

## Phase 5 — Rattachement à la marketplace (lot 6)

### 5.1 Extraction sans changement de comportement
**Description :** sortir la création de brouillon de `app/api/products/route.ts` et la confirmation d'actif de `app/api/products/asset/route.ts` en fonctions partagées ; les deux routes les appellent.
**Critères :**
- [ ] Tous les tests existants des deux routes passent sans modification.
- [ ] Les réponses des routes sont identiques avant et après (test d'équivalence).
**Vérification :** `npm test` complet ; e2e publication existants.
**Dépendances :** aucune (peut avancer en parallèle de la phase 4).
**Fichiers :** `lib/product-draft.ts`, `lib/product-asset-confirm.ts`, `app/api/products/route.ts`, `app/api/products/asset/route.ts`, `tests/product-draft-extraction.test.ts`.
**Taille :** M.

### 5.2 « Soumettre à la revue » : un seul produit par projet
**Description :** colonne additive `products.zabelie_authoring_project_id` + index unique partiel ; action idempotente qui crée ou retrouve le brouillon, dépose et confirme l'export approuvé, et laisse la modération existante décider. **Bloquée par C4 et D2.**
**Critères :**
- [ ] Deux soumissions simultanées, même clé puis clés différentes : un seul produit, aucune fiche orpheline (T19).
- [ ] Panne entre dépôt et association : aucun produit public invalide, reprise prudente (T20) ; produit d'un autre vendeur refusé (T03).
- [ ] Aucune publication automatique : le produit reste `draft`.
**Vérification :** test concurrent SQL en CI ; tests d'intégration avec panne injectée.
**Dépendances :** 4.3, 5.1, C4, D2.
**Fichiers :** `supabase/migrations/NNNN_zabelie_authoring_product_link.sql`, `app/api/digital-authoring/submit/route.ts`, `lib/digital-authoring/submit.ts`, `supabase/tests/authoring_submit_concurrent.sh`, `tests/digital-authoring-soumission.test.ts`.
**Taille :** M.

### 5.3 Atelier numérique, suppression et export de compte
**Description :** extrait, résultats, prérequis, FAQ et détails numériques remplis via `parseDigitalStudio` et les contrats existants ; suppression et archivage de projet ; tables du Studio dans l'export de compte.
**Critères :**
- [ ] Suppression du projet après une release acquise : droit et livrable intacts (T21).
- [ ] Paiement en attente, annulé ou remboursé : règles d'accès inchangées (T22) ; drapeaux absents ou schéma ancien : marketplace fonctionnelle (T24).
- [ ] L'export de compte contient les projets du vendeur, sans données d'un autre.
**Vérification :** SQL en CI ; tests de régression des téléchargements.
**Dépendances :** 5.2.
**Fichiers :** `lib/digital-authoring/listing.ts`, `app/api/account/export/route.ts`, `app/api/digital-authoring/projects/[id]/route.ts`, `supabase/tests/authoring_retention.test.sql`, `tests/digital-authoring-fiche.test.ts`.
**Taille :** M.

## Checkpoint 5
- [ ] Un projet → un produit, sous concurrence ; achats intacts.
- [ ] PR 5 relue ; migrations toujours non appliquées.

---

## Phase 6 — Mesure et assistance (lot 7)

### 6.1 Indicateurs du pilote
**Description :** vue ou RPC calculant démarrage, activation, export approuvé, publication, fiabilité par type, à partir des transitions persistées ; exclusion de `profiles.is_test` ; simulation distinguée du réel.
**Critères :**
- [ ] Un rafraîchissement ne recrée aucun événement ; les simulations n'apparaissent jamais comme des ventes.
**Vérification :** tests SQL ; nombres bruts et périodes affichés.
**Dépendances :** 5.2.
**Fichiers :** `supabase/migrations/NNNN_zabelie_authoring_metrics.sql`, `supabase/tests/authoring_metrics.test.sql`.
**Taille :** S.

### 6.2 État des opérations et support
**Description :** liste des opérations du vendeur avec état lisible et identifiant non sensible à transmettre au support existant.
**Critères :**
- [ ] Aucun corps de livre, brief ou coordonnée dans les journaux et messages.
**Vérification :** test de source sur les journaux ; e2e court.
**Dépendances :** 3.2.
**Fichiers :** `components/authoring-operations.tsx`, `lib/i18n.ts`.
**Taille :** S.

---

## Phase 7 — Revue et validation (lot 8)

### 7.1 Revue indépendante
**Description :** un correcteur séparé relit le diff complet avec le mandat de `docs/25` §3 (constate, cite `file:line`, publie ses ratés) ; corrections du lot, puis vérifications rejouées.
**Critères :**
- [ ] Chaque constat traité ou explicitement reporté, avec sa priorité.
**Vérification :** rapport du correcteur joint à la PR.
**Dépendances :** phases 1–6.

### 7.2 Validation intégrée et dossier de PR
**Description :** `preflight`, typecheck, lint, `npm test`, build, e2e ciblés, SQL en CI ; captures 360 px dans les quatre langues ; extrait PDF ; migrations, drapeaux, configuration, limites, rollback ; mise à jour de `docs/26`, `docs/54`, `docs/62`, `OPS_TODO.md`.
**Critères :**
- [ ] Le compte rendu distingue : code, tests locaux, preview, schéma appliqué, activé, usage réel.
**Vérification :** commandes et nombres de tests notés avec le commit mesuré.
**Dépendances :** 7.1.

## Checkpoint 7
- [ ] Critères STU 01–10 couverts avec preuves ; aucune fusion implicite.

---

## Phase 8 — Ouverture contrôlée (lot 9) — gardée par C2, D3, D4, D5, D7, D8

- [ ] 8.1 Appliquer les migrations sur autorisation explicite ; lire post-conditions et registre.
- [ ] 8.2 Fusionner sur autorisation ; vérifier le commit servi ; activer `ZABELIE_AUTHORING_ENABLED` pour la liste pilote.
- [ ] 8.3 Ouvrir l'IA réelle seulement après fournisseur, budget et conditions de données validés.
