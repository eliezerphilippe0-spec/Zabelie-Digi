# Tâches : essayage virtuel (pilote)

Plan : `tasks/essayage-plan.md`. Spécification : `docs/74-ESSAYAGE-VIRTUEL.md`.

Commandes de vérification (à lancer dans `C:\Users\Philippe\Zabelie-Essayage`) :
- unitaires et gardes : `npm test` ; ciblé : `node --import tsx --test tests/essayage-*.test.ts`
- types : `npx tsc --noEmit` ; lint : `npx eslint <fichiers>`
- build : `npm run build`
- e2e : `PW_CHROMIUM_PATH=… npx playwright test --project=physique`
- SQL : CI `sql-tests` (`bash supabase/tests/run.sh`)

Définition de « fait » pour chaque tâche : tests ajoutés et verts, `tsc` et lint propres, build qui passe dès qu'une route ou une page change, aucun texte hors de `lib/i18n.ts`, aucun appel payant, commit atomique.

---

## Phase 0 — Lectures

### 0.1 Conditions des fournisseurs et licences des composants
**Description :** lire les conditions de Genlook et de FASHN (utilisation des photos pour l'entraînement, durée de conservation, droits sur les images générées), et les licences de FASHN Human Parser et de DWPose. Consigner les réponses, sources à l'appui, dans `docs/74` §13.
**Critères :**
- [x] Q1, Q6 et Q7 ont une réponse sourcée, ou la mention « non écrit, à demander au fournisseur » avec le texte de la question à envoyer. (Fait le 2026-10-19 : réponses sourcées pour les trois, `docs/74` §13.)
- [x] Si un fournisseur n'exclut pas l'entraînement, c'est signalé comme bloquant pour lui. (Les deux l'excluent par écrit.)
**Résultat :** l'analyseur de silhouette du modèle maison est sous licence non commerciale (NVIDIA SegFormer) : le modèle maison sert au test, pas à la production sans remplacement (`docs/74` §4.1). Chez FASHN, la photo de l'acheteur doit partir en base64 (`docs/74` §3).
**Vérification :** relecture par le porteur.
**Dépendances :** aucune. **Fichiers :** `docs/74-ESSAYAGE-VIRTUEL.md`. **Taille :** XS.

---

## Phase 1 — Fondation

### 1.1 Règles pures
**Description :** `lib/essayage/regles.ts` : les sous-rayons autorisés (slugs de niveau 3, §2.1 ; une fiche rangée au seul niveau 2 est fermée), le groupe d'un acheteur (hachage stable, `essai` ou `temoin`), le jour haïtien d'un instant, les codes de refus (`interrupteur`, `anonyme`, `non_eligible`, `quota`, `plafond`, `pause`, `photo`). `lib/essayage/flags.ts` : `lireEnvEssayage()` et `essayageActif()`, sur le modèle de `lib/digital-authoring/flags.ts` (seule la valeur exacte `true` ouvre). Variables ajoutées à `.env.example`.
**Critères :**
- [x] Chaque sous-rayon autorisé passe ; `lenjri`, `mayo-beny`, `souvetman-gason`, `soulye-espo`, `akseswa-espo` et tout `rad-timoun` sont refusés ; une fiche sans sous-rayon est refusée.
- [x] Le groupe d'un même identifiant ne change jamais ; sur 10 000 identifiants, chaque groupe fait 50 % ± 2.
- [x] `"1"`, `"TRUE"`, `"true "` laissent fermé ; `simulation` est refusé quand `VERCEL_ENV=production`.
**Fait le 2026-10-19 :** 10 tests (liste confrontée à l'arbre réel des migrations 0035 et 0077, groupes figés), 5 mutations tuées.
**Vérification :** `node --import tsx --test tests/essayage-regles.test.ts` ; `tests/env-example-complet.test.ts` vert.
**Dépendances :** aucune. **Fichiers :** `lib/essayage/regles.ts`, `lib/essayage/flags.ts`, `tests/essayage-regles.test.ts`, `.env.example`. **Taille :** M.

### 1.2 Adaptateur et simulation
**Description :** `lib/essayage/fournisseurs/types.ts` : l'interface `creer(photo, produit) → travail`, `statut(travail) → en_cours | reussi(image) | echec(raison)`, `effacer(travail)`, avec délais bornés. `simulation.ts` : rend une image fixe après un délai réglable, ou un échec à la demande, sans réseau. `lib/essayage/fournisseur.ts` : `lireFournisseur(env)` (exemple de la spec, §8).
**Critères :**
- [x] Sans `ZABELIE_ESSAYAGE_FOURNISSEUR`, ou sans la clé du fournisseur choisi, `lireFournisseur` rend `null`.
- [x] La simulation passe par `en_cours` puis `reussi`, et sait échouer sur demande.
**Fait le 2026-10-19 :** 8 tests, 7 mutations tuées ; simulation sans état (le travail porte sa date et son issue) ; Genlook et FASHN rendent `null` jusqu'aux tâches 2.1 et 2.2. Variables inscrites au registre `docs/11-SECRETS.md` (garde RS1).
**Vérification :** `node --import tsx --test tests/essayage-fournisseurs.test.ts`.
**Dépendances :** 1.1. **Fichiers :** `lib/essayage/fournisseurs/types.ts`, `lib/essayage/fournisseurs/simulation.ts`, `lib/essayage/fournisseur.ts`, `tests/essayage-fournisseurs.test.ts`. **Taille :** M.

### Point de contrôle 1
- [x] `npm test`, `tsc`, lint verts (1964/1964 le 2026-10-19).
- [x] Revue rapide avec le porteur : règles et sous-rayons conformes au §2.1. (Liste validée le 2026-10-19 ; chaussures fermées au départ, série d'essai au §4.2.)

---

## Phase 2 — Fournisseurs réels et test à l'aveugle

### 2.1 Adaptateur Genlook
**Description :** `lib/essayage/fournisseurs/genlook.ts` sur l'API documentée (envoi de la photo, essai à partir de l'URL de la photo principale, lecture du résultat, effacement des images de l'acheteur, conservation minimale). `fetch` seul, pas de SDK. Tests sur des réponses enregistrées (fichiers JSON), jamais sur le réseau.
**Critères :**
- [x] Les trois états (`en_cours`, `reussi`, `echec`) sont lus correctement depuis des réponses enregistrées, y compris une erreur 4xx et un délai dépassé.
- [x] La clé ne sort jamais du serveur et n'apparaît dans aucun message d'erreur.
**Fait le 2026-10-19 :** 10 tests, 14 mutations tuées. Réponses rejouées d'après la documentation officielle (pas encore d'un vrai compte : le premier essai du test à l'aveugle confirmera les formes). Photo envoyée en fichier, gardée 1 jour, sous un identifiant neutre par essai (`zab_<uuid>`), effacée par `DELETE /customers/:id` ; résultat récupéré sans la clé ; panne passagère = « en cours ». Brique commune `lib/essayage/fournisseurs/http.ts`. Fournisseurs payants refusés sur une prévisualisation Vercel.
**Vérification :** `node --import tsx --test tests/essayage-genlook.test.ts`.
**Dépendances :** 1.2. **Fichiers :** `lib/essayage/fournisseurs/genlook.ts`, `tests/essayage-genlook.test.ts`, `tests/fixtures/essayage/genlook-*.json`. **Taille :** S.

### 2.2 Adaptateur FASHN
**Description :** `lib/essayage/fournisseurs/fashn.ts` : `POST /v1/run` (`tryon-v1.6`, `moderation_level: "conservative"`, `return_base64: true`, catégorie déduite du sous-rayon : `tops`, `bottoms` ou `one-pieces`), puis lecture du statut. La photo de l'acheteur part en base64 (data URI), jamais en URL : FASHN garde les URL envoyées dans son historique, sans suppression en libre-service.
**Critères :**
- [ ] La photo de l'acheteur est envoyée en data URI ; aucune URL ne la désigne (test).
- [ ] La catégorie envoyée suit le sous-rayon (une robe donne `one-pieces`, une jupe `bottoms`, une chemise `tops`).
- [ ] Une réponse « bloqué par la modération » devient un `echec` de raison `moderation`.
**Vérification :** `node --import tsx --test tests/essayage-fashn.test.ts`.
**Dépendances :** 1.2. **Fichiers :** `lib/essayage/fournisseurs/fashn.ts`, `tests/essayage-fashn.test.ts`, `tests/fixtures/essayage/fashn-*.json`. **Taille :** S.

### 2.3 Outil de comparaison
**Description :** `scripts/essayage-comparer.mjs --candidats genlook,fashn,maison --photos <dossier> --produits <liste>` ; la série chaussures se lance à part, avec `--candidats genlook` seulement. À blanc par défaut : il compte les essais et annonce le coût par candidat, sans aucun appel. Avec `--payer` : il appelle, mesure le temps de chaque essai, et écrit dans un dossier **hors du dépôt** une planche HTML où les images sont mélangées et anonymisées, plus une clé de correspondance séparée, à ouvrir seulement après la notation.
**Critères :**
- [ ] Sans `--payer`, aucune requête réseau (vérifié par test).
- [ ] Le script refuse d'écrire sa sortie dans le dépôt.
- [ ] La planche ne révèle pas le candidat ; la clé reconstitue les notes par candidat.
**Vérification :** `node --test tests/essayage-comparer.test.mjs` ; essai à blanc sur un dossier de 3 photos factices.
**Dépendances :** 2.1, 2.2. **Fichiers :** `scripts/essayage-comparer.mjs`, `tests/essayage-comparer.test.mjs`. **Taille :** M.

### 2.4 (sur « oui ») Point d'accès GPU du modèle maison
**Description :** un petit service qui fait tourner FASHN VTON v1.5 chez un hébergeur GPU à la seconde (RunPod ou équivalent), éteint entre deux séries, appelé par `--candidats maison`. Compte et carte : porteur. Mentions de licence Apache-2.0 conservées. **Usage d'évaluation seulement** : l'analyseur de silhouette FASHN Human Parser est sous licence NVIDIA de SegFormer, non commerciale (tâche 0.1). Le service ne sert qu'au test et n'est jamais branché à l'application en l'état.
**Critères :**
- [ ] Une image de test revient du point d'accès ; le coût réel de la série est relevé.
- [x] Licences de Human Parser et DWPose vérifiées (tâche 0.1) avant la première image.
- [ ] Le README du service dit en tête : évaluation seulement, analyseur sous licence non commerciale.
**Vérification :** série de 3 essais annoncée puis lancée avec accord.
**Dépendances :** 0.1, 2.3. **Fichiers :** `services/essayage-maison/` (Dockerfile, gestionnaire, README). **Taille :** M.

### Point de contrôle 2 — le test à l'aveugle
- [ ] Coût annoncé à blanc, puis série payante lancée **avec l'accord du porteur**.
- [ ] Notation à l'aveugle faite par le porteur et deux personnes ; résultat et choix consignés dans `docs/74` §4.2.
- [ ] Si aucun candidat ne rend bien les clientes haïtiennes : arrêt du chantier et retour au porteur.
- [ ] Série chaussures chez Genlook (15 essais, `docs/74` §4.2) notée à l'aveugle ; question écrite envoyée au support de Genlook par le porteur, réponse consignée au §13.
- [ ] Si les chaussures sont retenues, sur « oui » : tâche à ouvrir pour les ajouter (liste de `lib/essayage/regles.ts`, pièce « pieds », table `zabelie_essayage_rayons`, catégorie côté fournisseur).

---

## Phase 3 — Base

### 3.1 Migration 0150 : tables
**Description :** `supabase/migrations/0150_zabelie_essayage.sql` (avec `zabelie_migration_garde`) : `zabelie_essayage_config` (une ligne : `plafond_mois` 1000, `quota_jour` 5, `en_pause` false), `zabelie_essayage_vendeurs`, `zabelie_essayage_rayons` (amorcée avec les slugs du §2.1), `zabelie_essayage_essais`, `zabelie_essayage_expositions`. RLS activée partout ; aucun droit pour `anon` et `authenticated`, sauf la lecture de `zabelie_essayage_rayons`. Sonde `zabelie_objets_requis()` mise à jour.
**Critères :**
- [ ] `anon` et `authenticated` ne lisent ni n'écrivent aucune table d'essai (test SQL).
- [ ] Aucune colonne ne peut contenir une photo ou un résultat (revue du schéma).
**Vérification :** CI `sql-tests` ; `supabase/tests/zabelie_essayage.test.sql`.
**Dépendances :** 1.1. **Fichiers :** `supabase/migrations/0150_zabelie_essayage.sql`, `supabase/tests/zabelie_essayage.test.sql`. **Taille :** M.

### 3.2 Migration 0150 : fonctions
**Description :** dans la même migration, `zabelie_essayage_eligible(produit)`, `zabelie_essayage_reserver(acheteur, produit, fournisseur)` (fiche publiée et physique, vendeur pilote actif, sous-rayon de niveau 3 autorisé, pause, quota du jour haïtien, plafond du mois hors échecs, verrou consultatif, insertion `en_cours`), `zabelie_essayage_terminer(essai, statut, travail)`, `zabelie_essayage_exposer(acheteur, produit, groupe)`. Toutes en `security definer`, `search_path` figé, accordées au rôle service seul ; ajoutées à la liste gelée de `definer_exposition` et à sa revue.
**Critères :**
- [ ] Le 6e essai du jour est refusé (`quota`) ; le compteur repart au jour haïtien suivant ; un échec ne compte pas.
- [ ] 20 réservations simultanées au bord du plafond ne le dépassent jamais.
- [ ] Une fiche de lingerie, d'enfant, sans sous-rayon, en brouillon ou d'un vendeur non pilote est refusée (`non_eligible`).
**Vérification :** CI `sql-tests` (dont `definer_exposition.test.sql`).
**Dépendances :** 3.1. **Fichiers :** `supabase/migrations/0150_zabelie_essayage.sql`, `supabase/tests/zabelie_essayage.test.sql`, `supabase/tests/definer_exposition.test.sql`, `docs/REVUE-2026-10-08-fonctions-definer.md`. **Taille :** M.

### Point de contrôle 3
- [ ] Branche poussée, PR en brouillon, CI `sql-tests` verte.
- [ ] Migration **non appliquée** en production.

---

## Phase 4 — Parcours acheteur

### 4.1 Cœur serveur
**Description :** `lib/essayage/serveur.ts` : `demarrerEssai()` et `suivreEssai()` avec leurs dépendances injectées (client de base, fournisseur, horloge), pour être testées sans réseau. Contrôle du type et du poids de la photo (JPEG, PNG, WebP ; plafond sous 4,5 Mo), réservation, appel du fournisseur, passage en `echec` au-delà de 60 s, résultat converti en `data:` sans écriture.
**Critères :**
- [ ] Chaque code de refus du §1.1 sort au bon moment.
- [ ] Un échec ou un délai dépassé appelle `terminer(echec)`, et l'essai ne compte pas.
- [ ] Aucune écriture dans Storage, aucun journal contenant l'image (garde en test).
**Vérification :** `node --import tsx --test tests/essayage-serveur.test.ts`.
**Dépendances :** 1.2, 3.2. **Fichiers :** `lib/essayage/serveur.ts`, `tests/essayage-serveur.test.ts`. **Taille :** M.

### 4.2 Routes
**Description :** `app/api/essayage/route.ts` (POST : interrupteur, session, compte actif via `requireActiveAccount`, limite de débit `rateLimit`, `demarrerEssai`) et `app/api/essayage/[id]/route.ts` (GET : seul l'auteur de l'essai le suit, `suivreEssai`). 404 quand l'interrupteur est éteint, 401 sans session.
**Critères :**
- [ ] Interrupteur éteint : 404 ; anonyme : 401 ; essai d'un autre acheteur : 404.
- [ ] Les messages d'erreur viennent de `lib/i18n.ts` dans la langue de l'acheteur.
**Vérification :** tests de routes ; `npm run build`.
**Dépendances :** 4.1. **Fichiers :** `app/api/essayage/route.ts`, `app/api/essayage/[id]/route.ts`, `tests/essayage-routes.test.ts`, `lib/i18n.ts`. **Taille :** M.

### 4.3 Fiche produit
**Description :** dans `app/produit/[slug]/page.tsx`, pour un acheteur connecté : éligibilité (`zabelie_essayage_eligible`), groupe, exposition enregistrée dans les deux groupes, et le composant `EssayageBouton` sous `AddToCart` pour le groupe `essai` seulement. Rien pour les anonymes ni pour le vendeur de la fiche.
**Critères :**
- [ ] Bouton absent : interrupteur éteint, anonyme, groupe témoin, fiche non éligible, vendeur qui regarde sa propre fiche.
- [ ] Une exposition par acheteur, fiche et jour, dans les deux groupes.
**Vérification :** tests de source (comme `tests/vendre-produits-par-type.test.ts`) ; `npm run build`.
**Dépendances :** 4.2. **Fichiers :** `app/produit/[slug]/page.tsx`, `lib/essayage/fiche.ts`, `components/essayage-bouton.tsx`, `tests/essayage-fiche.test.ts`. **Taille :** M.

### 4.4 Feuille d'essayage
**Description :** `components/essayage-feuille.tsx` : consentement versionné (gardé sur l'appareil), choix ou prise de photo avec conseils (de face, en pied, bonne lumière), compression (`compresserImage`, côté long de 1 024 px au plus), envoi, attente visible, résultat avec « Aperçu généré par IA… », « Ajouter au panier », messages d'erreur (quota, pause, échec, délai). Option « Garder ma photo sur ce téléphone », décochée par défaut, et bouton pour l'effacer.
**Critères :**
- [ ] Sans consentement, aucune photo ne part.
- [ ] La photo gardée sur l'appareil ne quitte l'appareil qu'au moment d'un essai, et l'effacement la supprime vraiment.
- [ ] À 360 px : pas de défilement horizontal, cibles de 44 px, clair et sombre.
**Vérification :** tests de composant ou de source ; contrôle à 360 px dans le navigateur.
**Dépendances :** 4.3. **Fichiers :** `components/essayage-feuille.tsx`, `lib/essayage/photo-locale.ts`, `lib/i18n.ts`, `tests/essayage-feuille.test.ts`. **Taille :** M.

### 4.5 E2E avec la simulation
**Description :** le faux Supabase (`e2e/fixtures/stub-supabase.mjs`) répond aux fonctions d'essayage ; le projet `physique` démarre avec `ZABELIE_ESSAYAGE_ENABLED=true` et `ZABELIE_ESSAYAGE_FOURNISSEUR=simulation`. Spec `e2e/parcours-physique-essayage.spec.ts`.
**Critères :**
- [ ] Parcours complet : bouton, consentement, photo, attente, résultat avec la mention IA, ajout au panier.
- [ ] Cas refusés : quota, pause, fiche non éligible, groupe témoin, anonyme.
- [ ] 360 px et 4 langues sans défilement horizontal.
**Vérification :** `npx playwright test --project=physique` (tout le projet reste vert).
**Dépendances :** 4.4. **Fichiers :** `e2e/fixtures/stub-supabase.mjs`, `e2e/parcours-physique-essayage.spec.ts`, `playwright.config.ts`. **Taille :** M.

### Point de contrôle 4
- [ ] Toutes les suites vertes (unitaires, SQL, e2e), build propre.
- [ ] Démonstration au porteur dans le navigateur, à 360 px, avec la simulation.
- [ ] Mutations ciblées sur l'éligibilité, le quota et le plafond : toutes tuées.

---

## Phase 5 — Administration

### 5.1 Vendeurs pilotes et réglages
**Description :** section « Essayage virtuel » dans `/admin` : ajouter ou retirer un vendeur pilote, changer plafond, quota et pause, voir le compteur du mois (réussis, échecs, plafond restant). Route `app/api/admin/essayage/route.ts` sur le modèle de `app/api/admin/user-status` (`getAdminUser`, double authentification).
**Critères :**
- [ ] Sans session administrateur avec double authentification : 403.
- [ ] Un vendeur retiré n'a plus de bouton sur ses fiches dès le rendu suivant.
- [ ] Le compteur du mois correspond aux essais réussis et en cours.
**Vérification :** tests de route ; e2e administration avec le faux MFA existant (`e2e/fixtures/stub-mfa.mjs`).
**Dépendances :** 3.2, 4.3. **Fichiers :** `app/admin/page.tsx`, `components/admin/essayage-panneau.tsx`, `app/api/admin/essayage/route.ts`, `tests/essayage-admin.test.ts`, `lib/i18n.ts`. **Taille :** M.

### Point de contrôle 5
- [ ] Suites vertes ; revue avec le porteur.

---

## Phase 6 — Textes, mesure, mise en ligne

### 6.1 Textes à valider
**Description :** consentement (4 langues), paragraphe de `/confidentialite` (prestataire, photo non conservée, conservation chez le prestataire), mention « aperçu non contractuel » dans les conditions de vente, entrée du fournisseur retenu dans `docs/69-SOUS-TRAITANTS-RELEVE-2026-10-10.md`. Textes passés au crible du style maison (pas de jargon, kreyòl relu).
**Critères :**
- [ ] Le porteur a validé chaque texte avant la fusion.
**Vérification :** relecture.
**Dépendances :** 2.x (fournisseur choisi), 4.4. **Fichiers :** `lib/i18n.ts`, `app/confidentialite/page.tsx`, `docs/69-SOUS-TRAITANTS-RELEVE-2026-10-10.md`. **Taille :** S.

### 6.2 Mesure
**Description :** requête SQL d'analyse (par groupe : expositions, ajouts au panier, commandes payées, livrées sans refus, litiges) versionnée dans `docs/74` §7, avec le seuil de décision choisi par le porteur (Q5).
**Critères :**
- [ ] La requête tourne sur les tables de 0150 et sur les commandes existantes, en lecture seule.
**Vérification :** exécution sur la base de test de la CI.
**Dépendances :** 3.2. **Fichiers :** `docs/74-ESSAYAGE-VIRTUEL.md`. **Taille :** S.

### 6.3 Mise en ligne (chaque étape sur « oui »)
- [ ] PR prête, CI verte → **« oui »** du porteur → fusion.
- [ ] Migration 0150 en production → **« oui »** → application, registre `zabelie_schema_migrations` à la main, sonde vérifiée.
- [ ] Variables posées dans Vercel par le porteur (clé du fournisseur retenu, `ZABELIE_ESSAYAGE_FOURNISSEUR`) ; interrupteur encore éteint.
- [ ] Prérequis tenus : double authentification de l'administrateur, fiches mode publiées par les vendeurs pilotes.
- [ ] Vendeurs pilotes activés dans `/admin`, puis interrupteur allumé → **« oui »**.
- [ ] Premier essai réel vérifié par le porteur sur son téléphone ; journal Sentry et Vercel relus.

### Point de contrôle final
- [ ] Les 13 critères de réussite de `docs/74` §11 sont vérifiés.
- [ ] Mesure lancée pour 4 à 6 semaines ; date du bilan fixée.
