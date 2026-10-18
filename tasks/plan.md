# Plan d'implémentation : création éditoriale (Zabelie Studio)

Source : PRD v1.0 du 2026-10-15 (hors dépôt) et son lot 0, `docs/70-CHANTIER-CREATION-EDITORIALE.md`.
Tâches détaillées, critères et vérifications : `tasks/todo.md`.
Référence mesurée : `origin/main` `1725792`. Statut : **phase 1 faite (2026-10-15), phases 2 à 8 à venir.**

## Vue d'ensemble

Un atelier privé dans `/tableau-de-bord/creation` : un vendeur écrit un guide
(kreyòl ou français), avec ou sans suggestions d'IA, l'approuve, produit un PDF
privé dont il approuve l'export exact, puis le soumet à la modération
existante sous forme de produit `fichier`. Tout ce qui existe est réutilisé :
comptes, création de brouillon, dépôt signé, atelier numérique, publication,
releases, droits acheteurs. L'IA réelle reste éteinte ; le développement
entier tourne avec un fournisseur simulé.

## Décisions d'architecture (proposées, voir `docs/70` §9)

- **Privilèges** : tables neuves lues et écrites par le vendeur sous son JWT et
  la RLS ; écritures limitées aux colonnes éditoriales ; transitions,
  résultats, empreintes et compteurs réservés à des RPC. Le service role est
  confiné à trois usages nommés : stockage, limiteur de débit, persistance d'un
  résultat fournisseur sous bail (C1-A, tranchée le 2026-10-15).
- **Sauvegarde** : comparaison atomique sur `revision` (`update … where
  revision = attendue`), instantanés immuables seulement aux moments utiles.
- **Opérations** : motifs de `0118` (unicité `(seller_id, idempotency_key)`,
  quota sous verrou consultatif, jour civil haïtien, config en base) + bail à
  jeton ; `uncertain` définitif, jamais de relance automatique.
- **Exécution** : étapes courtes déclenchées par des requêtes authentifiées
  (création, puis sondage à la lecture). Aucun moteur de tâches.
- **PDF** : générateur interne sans dépendance (D1-A), après un essai borné ;
  `pdfkit` en repli.
- **Fiche** : brouillon produit créé au geste « Soumettre à la revue » (C4-A),
  unicité garantie par une colonne additive unique sur `products` (D2-A).
- **Un PR par phase**, migrations rédigées mais **non appliquées** ; chaque
  application et chaque fusion attendent un « oui » explicite (C2-A, tranchée le
  2026-10-15).

## Graphe de dépendances

```
Contrats purs (schémas, transitions, CAS) ── Drapeaux ── Fournisseur simulé
        │
        ├── Projets (migration + RLS) ── API projets ── Pages liste/éditeur ── Sauvegarde robuste
        │                                                     │
        ├── Opérations (migration + quotas + bail) ── Exécuteur ── UI proposition
        │                                                     │
        ├── Qualité + approbation de révision ── Essai PDF ── Exports privés + approbation
        │                                                     │
        └── Extraction des fonctions partagées (brouillon, confirmation d'actif)
                                   └── Soumettre à la revue (unicité) ── Suppression / export de compte
                                                                  │
                                         Mesure ── Revue indépendante ── Ouverture contrôlée
```

## Liste des tâches (index)

### Phase 1 — Fondation (lot 1)
- [x] 1.1 Contrats métier purs : schémas, limites, transitions, CAS
- [x] 1.2 Drapeaux et interface fournisseur, avec le simulé

**Checkpoint 1** — tests, typecheck, lint, build verts ; aucun effet sur le catalogue ; PR 1 relue.

### Phase 2 — Un projet privé, de bout en bout, sans IA (lots 2 et 3)
- [x] 2.1 Table des projets, RLS et sauvegarde CAS en base (`0141`, CI `sql-tests` verte, P1–P11 lus au journal)
- [x] 2.2 API projets sous JWT (11 tests de route, 12 mutations tuées, 1704/1704)
- [x] 2.3 Accueil à trois entrées, liste des projets, création, liens conditionnels
- [x] 2.4 Éditeur : brief, plan, sections, approbation du plan (e2e 7/7 local)
- [x] 2.6 Modèles de guide (recette, métier, démarche, liste de contrôle)
- [x] 2.5 Sauvegarde robuste : états, conflit, brouillon local, coupure (e2e 13/13 local)

**Checkpoint 2** — un guide ht et un guide fr créés et repris sans IA à 360 px ; conflit entre onglets et coupure réseau reproduits ; SQL vert en CI ; PR 2 (migration non appliquée).

### Phase 3 — Assistance IA simulée (lot 4)
- [x] 3.1 Opérations, instantanés, quotas et bail en base
- [x] 3.2 Exécuteur par étapes et routes d'opérations
- [x] 3.3 Proposition séparée : accepter, copier, rejeter
- [x] 3.4 Adaptateur réel préparé, éteint, testé sans réseau

**Checkpoint 3** — doubles clics, dernier quota, réponse tardive, sortie malformée, délai après envoi : ni écrasement ni deuxième appel ; aucun service payant appelé ; PR 3.

### Phase T — Tableau du Studio (décisions du 2026-10-16)
Demande du porteur : « tu dois t'inspirer de Tunafrik, de CreateurSuite pour construire ton tableau » ; puis « oui suis tes recommandations » et « on laisse tomber les pubs ». Tranché :
- **Formats** : l'ebook (le guide) est actif ; « Pack audio » et « Formation vidéo » sont annoncés « Bientôt », sans bouton ni coût.
- **Opportunités** : calculées sur les données réelles de Zabelie, agrégées, sans donnée personnelle (migration, donc « oui » du porteur avant application).
- **Modèles** : remplacés par des modèles de savoir-faire (Tunafrik : formateurs, coachs, couturières, cuisiniers, coiffeurs, éleveurs…) ; plus aucun exemple qui ressemble à un produit physique.
- **Tunnel de vente** (page de vente, offre complémentaire, version allégée) : plus tard, après le PDF et la fiche (phases 4-5) ; il touche au panier et à l'escrow.
- **Publicités** : abandonnées dans le Studio. L'entrée « Créer une publicité » disparaît ; le Studio images existant n'est pas touché.
- Recommandations des captures : la langue du guide suit par défaut celle de l'interface (ht ou fr) ; un seul compteur de suggestions.

- [x] T.1 Modèles de savoir-faire et exemples de produits digitaux
- [x] T.2 Tableau façon CreateurSuite : menu, accueil personnalisé, deux entrées (analyser un marché, créer un produit digital) + modèles, projets avec statut, « Comment ça marche » en trois étapes (Tunafrik)
- [x] T.3 Choix du format (ebook actif ; audio et vidéo « Bientôt »), langue par défaut, compteur unique
- [x] T.4 Opportunités sur données réelles (`0143`) : recherches sans résultat et produits digitaux qui se vendent, seuils de confidentialité
- [x] T.5 Parcours e2e, captures 360 px et bureau, relecture des textes

**Checkpoint T** — tableau lisible à 360 px et sur ordinateur ; aucun chiffre inventé (état vide honnête tant que les seuils ne sont pas atteints) ; aucune entrée vers une fonction absente ; PR T (migration non appliquée).

### Phase T2 — Accueil façon Chariow (demande du 2026-10-17)
Demande du porteur, capture du tableau de Chariow à l'appui : « inspire-toi de Chariow pour le faire ». Ce qu'on reprend : la salutation selon l'heure, une rangée d'actions rapides, trois chiffres en cartes (revenu, 7 derniers jours, clients) qu'on peut masquer, « Produits les plus vendus », un menu à icônes, « Voir ma boutique ». Ce qu'on ne reprend pas : l'assistant IA, les automatisations, l'affiliation, le marketing (absents du Studio, donc absents du menu) et l'émoji de la salutation.

Décisions prises :
- **Produit digital** = `KIND_FILE`, comme l'univers « Digital » du catalogue.
- **Chiffres** lus sous le JWT du vendeur (RLS de `0002` : commandes de ses produits, son grand livre), jamais par la clé de service : **aucune migration**. Ventes = commandes payées ou livrées de ses produits digitaux. Revenus = crédits de son grand livre sur ces commandes, la même définition que « Revenus nets » du tableau vendeur (commission déduite). « 7 derniers jours » se compte à la date du crédit. Clients = acheteurs distincts.
- **Total complet ou signalé** : lecture par lots de 1 000 ; au-delà du plafond, le chiffre s'affiche « ≥ », comme sur le tableau vendeur.
- **Masquer les montants** : préférence du navigateur seulement (Chariow le propose pour partager son écran).
- Le menu garde ses entrées et ajoute des liens vers des pages qui existent : mes ventes, revenus (tableau vendeur), codes promo, centre d'aide.

- [x] T2.1 Calculs purs (moment de la journée à l'heure d'Haïti, résumé des ventes, produits les plus vendus) et leurs tests
- [x] T2.2 Lecture sous JWT, textes en quatre langues (module à part de `copy.ts`, que la phase 4 modifie)
- [x] T2.3 Accueil : salutation, actions, cartes masquables, produits les plus vendus ; menu à icônes
- [x] T2.4 Faux Supabase : ventes de test et état vide ; parcours e2e ; captures 360 px et bureau

**Checkpoint T2** — état vide honnête sans vente ; aucun montant inventé ; montants masquables au clavier ; aucune entrée vers une fonction absente ; 360 px sans défilement horizontal.

### Phase 4 — Vérification et PDF (lot 5)
- [ ] 4.1 Essai PDF borné (décision D1)
- [ ] 4.2 Contrôles qualité et approbation de révision
- [ ] 4.3 Export privé, approbation de l'export exact

**Checkpoint 4** — PDF inspecté page par page ; export figé, nouvel export exigé après modification ; PR 4.

### Phase 5 — Rattachement à la marketplace (lot 6)
- [ ] 5.1 Extraire la création de brouillon et la confirmation d'actif (sans changement de comportement)
- [ ] 5.2 « Soumettre à la revue » : un seul produit par projet
- [ ] 5.3 Atelier et détails numériques remplis ; suppression et export de compte

**Checkpoint 5** — un projet mène à un seul produit, même sous concurrence ; panne après dépôt récupérable ; achats et versions acquises intacts ; PR 5.

### Phase 6 — Mesure et assistance (lot 7)
- [ ] 6.1 Indicateurs du pilote calculés depuis les transitions
- [ ] 6.2 État des opérations et diagnostic de support

### Phase 7 — Revue indépendante et validation intégrée (lot 8)
- [ ] 7.1 Revue du diff complet par un correcteur séparé, corrections
- [ ] 7.2 Validation intégrée et dossier de PR

**Checkpoint 7** — critères STU 01–10 couverts avec preuves ; rien n'est fusionné implicitement.

### Phase 8 — Ouverture contrôlée (lot 9) — **gardée par les décisions**
- [ ] 8.1 Appliquer les migrations (autorisation explicite), vérifier les post-conditions et le registre
- [ ] 8.2 Fusionner, vérifier le commit servi, activer le parcours pour la liste pilote
- [ ] 8.3 IA réelle : seulement après D3 et D4

## Risques et parades

| Risque | Impact | Parade |
|---|---|---|
| Chantier sans utilisateur (pilote non nommé) | Élevé | Phases 1–5 utiles seules (produire une offre) ; IA réelle gardée par D7 |
| Moteur PDF interne trop sobre ou fragile | Moyen | Essai borné (4.1) avant tout export ; `pdfkit` en repli |
| Course entre deux « Soumettre » | Élevé | Unicité portée par l'insertion du produit (D2-A), test concurrent SQL |
| Résultat IA tardif qui écrase une saisie | Élevé | Proposition séparée, bail à jeton, acceptation sous CAS |
| Appel payant dupliqué après délai | Élevé | `uncertain` définitif, aucune relance automatique, quota consommé |
| Fuite de contenu privé (cache, journaux, props) | Élevé | `noindex`/`no-store`, SW déjà `NetworkOnly`, journaux sans corps, test T26 |
| Collision de numéro de migration avec V-23 (`0141`) | Faible | Numéro lu au moment d'écrire, renuméroté si V-23 fusionne avant |
| Régression du parcours de publication existant (extraction 5.1) | Moyen | Tâche dédiée, tests existants inchangés et test d'équivalence |
| Tests SQL non exécutables en local | Moyen | Exécutés par le job CI `sql-tests` ; marqués NON VÉRIFIÉ en local |

## Questions ouvertes

✅ Tranchées le 2026-10-15 (« oui valide les six et lance ») : C1-A, C2-A,
C4-A, D1-A (sous réserve de l'essai 4.1), D2-A, D6.

Restent ouvertes, et ne bloquent que l'ouverture (phase 8) : D3 fournisseur
réel, D4 budget et plafonds, D5 conservation, D7 liste pilote, D8 libellés
publics.

## Idées tirées de CreateurSuite (2026-10-15) — PROPOSÉES, à valider

Source : createursuite.com (page publique) et capture de son tableau de bord.
Ce qui s'y voit : un accueil « Que souhaitez-vous faire aujourd'hui ? » à trois
entrées (analyser un marché, créer un produit digital, créer une publicité),
des projets à reprendre (« Continuer », état Prêt / Brouillon), des
« opportunités » notées, des modèles, un export PDF, des maquettes 3D, et des
crédits achetables (« Research Points ») qui n'expirent pas.

| Idée | Chez Zabelie, à partir de | Coût | Statut |
|---|---|---|---|
| Accueil à trois entrées + projets « Continuer » | 2.3 : écrire un guide, partir d'un modèle, créer une pub (Studio images s'il est allumé) ; « trouver une idée » attend l'idée 6 | nul, dans 2.3 | ✅ validé, fait |
| Modèles de guide prêts à remplir (plan pré-rempli, ht/fr, sans IA) | motif existant `lib/service-starters.ts` | faible, tâche 2.6 | ✅ validé, fait |
| Compteur visible des suggestions restantes (quota non monétaire) | phase 3 (quotas) ; le compteur de projets actifs est déjà affiché | nul | ✅ validé |
| Couverture automatique + maquette (titre, couleurs) | `next/og` déjà utilisé (`app/**/opengraph-image.tsx`), aucune dépendance ; alimente la photo principale ET le Studio images | moyen, tâche 4.4 | à décider (gabarit visuel) |
| Kit de lancement : textes de partage WhatsApp/Facebook en kreyòl + lien | `ShareButtons` existant | faible, tâche 5.4 | à décider |
| « Idées qui se cherchent » : recherches sans résultat sur Zabelie | capteur `zabelie_search_misses` (`0047`), agrégé avec un seuil de sessions distinctes | moyen, tâche T.4 | ✅ validé le 2026-10-16 (« Opportunités », données réelles agrégées) |
| Entrée « Créer une publicité » | Studio images | — | ❌ abandonnée le 2026-10-16 (« on laisse tomber les pubs ») |
| Analyse des publicités concurrentes (bibliothèque publicitaire) | rien d'existant ; API externe, coût et conditions | élevé | écarté pour l'instant |
| Crédits achetables qui n'expirent pas | contraire au PRD §11 (aucun crédit prépayé au MVP) et à la prudence BRH | — | non recommandé |
