# 67 — Audit d'architecture avant mise en production commerciale (2026-10-04)

Demande porteur du 2026-10-04 : « avant d'écrire du code, produire :
Executive Summary, architecture actuelle, inventaire des fonctionnalités
existantes, analyse ». **Aucun code n'est modifié par ce document.**

Sources : le dépôt sur `main` (`540c29d`, après #309), la base de production
(`ddditxykopuxxqzgkqwy`, lectures seules), et le site en ligne (zabelie.com,
requêtes HTTP). Chaque chiffre ci-dessous a été **mesuré aujourd'hui**, sauf
mention contraire. Les informations juridiques manquantes ne sont **pas**
inventées : elles sont listées comme bloquantes.

---

## 1. Executive Summary

**Zabelie a une infrastructure plus avancée que son marché.** Le paiement,
l'escrow, le ledger, les retraits, le digital protégé, le panier, la
messagerie, les litiges, l'API et les webhooks existent et sont testés.
**Ce qui manque n'est pas d'abord du code** :

| | Mesuré le 2026-10-04 |
|---|---|
| Produits publiés | **0** (7 brouillons, 3 archivés) |
| Rayons actifs / avec au moins une offre | **83 / 0** |
| Comptes | **4** |
| Dossiers d'identité (KYC) | **0** |
| Commandes en argent réel | **0** (14 annulées en test, 1 litige sur un produit gratuit) |
| Champs juridiques vides affichés en ligne | **7** (4 dans `/conditions`, 3 dans `/confidentialite`) |
| Rail de paiement en production | **aucun** (MonCash en test ; NatCash et carte « bientôt ») |

Trois conclusions :

1. **Le diagnostic du porteur est juste sur le P0 légal**, et il faut l'élargir :
   aux 4 blancs des conditions s'ajoutent 3 blancs de la politique de
   confidentialité, et le dossier BRH sur la rétention des fonds
   (`docs/17`) reste ouvert. Ces sept champs ne se remplissent pas par du
   code : 5 sont des décisions juridiques, 2 sont des faits techniques que je
   peux mesurer et proposer (§4.1).
2. **Le vrai goulot est l'offre, pas l'interface.** Avec 0 produit publié, une
   homepage « à la Amazon » dont chaque module disparaît quand il est vide
   afficherait… la barre de recherche seule. Les modules « tendances »,
   « meilleures ventes », « recommandé pour vous » exigent des ventes qui
   n'existent pas. L'ordre utile est : légal → paiement réel → **20 premiers
   vendeurs et leurs fiches** → puis la surface acheteur.
3. **Je dois une correction sur mon propre travail récent.** Le domaine
   personnalisé (#309) est réservé aux vendeurs vérifiés, et il y en a **zéro**.
   Les relances (#308) ne visent que des paiements réels, et il y en a **zéro**.
   Les deux sont corrects et testés, mais ce sont des filets posés sur des
   chemins que personne n'emprunte encore — exactement le défaut que
   `CLAUDE.md` décrit (« un filet sur un chemin impraticable mesure zéro »).
   Ce document propose de ne plus rien construire de ce type avant que le
   chemin principal ait été parcouru une fois avec de l'argent réel.

---

## 2. Architecture actuelle

| Couche | Technologie | Remarques |
|---|---|---|
| Front + API | Next.js 16 (App Router, TS, Tailwind), 58 pages, 97 routes API | `proxy.ts` (ex-middleware) : CSP à nonce, session Supabase, affiliation, domaines vendeurs |
| Base | Supabase Postgres, **125 migrations**, RLS sur toutes les tables, registre `zabelie_schema_migrations` (124 lignes appliquées ou volontairement non appliquées) | Garde de migration, sonde `zabelie_objets_requis()` |
| Auth | Supabase Auth, rôles `profiles.role` (acheteur, vendeur, admin) | Admin : MFA pour la file d'opérations (0113) |
| Stockage | Supabase Storage : buckets privés (KYC, livrables digitaux), URL signées courtes | |
| Paiement | Adaptateurs MonCash, Kobara (NatCash), Stripe, Zelle semi-manuel ; confirmation **serveur-à-serveur** uniquement | Idempotence en base, réconciliation par cron |
| Argent | Ledger `wallet_transactions` append-only, invariant `Σ ledger = balance + pending` (0033), maturation J+7, commission en table (10 % / 6 % Elite) | Contrôle quotidien `/api/admin/coherence` |
| Hébergement | Vercel, **crons quotidiens seulement** (10 crons ; plan Hobby a priori) | ⚠️ voir §4.2 |
| E-mail | Resend, **non configuré** (`RESEND_API_KEY` absente) | Aucun e-mail ne part |
| i18n | `lib/i18n.ts`, 4 langues (fr, ht, en, es), langue dans un cookie | Aucune URL par langue (`docs/47`) |
| Tests | 224 fichiers unitaires (~1 445 tests), 78 fichiers SQL, 8 suites e2e Playwright, CI GitHub (build, sql-tests, e2e) | Discipline de mutation sur chaque garde |

---

## 3. Inventaire, rangé selon les 6 piliers proposés

Légende : ✅ existe et fonctionne (testé) · 🟡 existe mais incomplet ·
❌ absent · 🐞 bug potentiel · 🔐 risque sécurité · 💼 risque business.

### 3.1 Zabelie Market (physique)

| Élément | État | Où |
|---|---|---|
| Variantes, stock disponible/réservé, réservation atomique | ✅ | `0036`, `zabelie_reserve_stock` |
| Galerie d'images | ✅ | `0073` product_media |
| Vidéo produit | 🟡 Phase 0 seulement, aucun code | `docs/66` |
| Rabais / prix barré par variante | ✅ | `0037`–`0040`, e2e `rabais` |
| Remise : retrait chez le vendeur, points de retrait | ✅ | `0082`, `0043` fulfillment |
| Livraison avec prix, zones, suivi, preuve, transporteurs | ❌ | Zabelie « ne stocke ni ne livre » (texte public) |
| Avis | ✅ **un avis par commande** (`product_reviews.order_id unique`) = achat vérifié par construction | `0008` |
| Questions / réponses | ❌ | |
| Favoris, boutiques suivies, partage | ✅ | `0102` |
| Produits similaires / recommandations | ✅ (seuils : ≥ 5 acheteurs, donc **inactif** aujourd'hui) | `0110`, `0111` |
| Marque, attributs par rayon, poids, dimensions | 🟡 spécifications physiques partielles | `physical_specs` |

### 3.2 Zabelie Digital

| Élément | État |
|---|---|
| Stockage privé, URL signée temporaire, téléchargement réservé à l'acheteur | ✅ |
| Journal des téléchargements | ✅ `zabelie_digital_accesses` |
| Versions figées par acheteur, mises à jour | ✅ `zabelie_digital_releases`, entitlements immuables |
| Formations (leçons, chapitres, extrait gratuit, progression) | ✅ Studio numérique `0104` |
| Porte de publication (pas de fiche sans livrable) | ✅ `0059` |
| Licence personnelle/commerciale, bundles, limite de téléchargements configurable | 🟡 licence décrite, pas de types de licence en base ; bundles ❌ |

### 3.3 Zabelie Services

| Élément | État |
|---|---|
| Format prestation, suivi de remise, filet « service sans suivi » | ✅ `0020`, `zabelie_service_sans_suivi_sweep` |
| Prise de rendez-vous, devis | ❌ |

### 3.4 Zabelie Diaspora

| Élément | État |
|---|---|
| Payeur ≠ destinataire (nom, téléphone, adresse, consentement) | ✅ `zabelie_order_recipients` (`0102`) |
| Paiement depuis l'étranger | 🟡 Zelle semi-manuel ; carte (Stripe) **construite mais éteinte**, et exige une entité étrangère *merchant of record* |
| Parcours dédié « J'achète pour un proche » | 🟡 le guide existe, pas d'entrée produit dédiée |
| Affichage USD/CAD/EUR | ❌ (HTG seulement ; règle : la devise comptable ne doit jamais changer en silence) |

### 3.5 Zabelie Protection

| Élément | État |
|---|---|
| Escrow, maturation J+7, gel en cas de litige | ✅ |
| Remise confirmée par l'acheteur pour physique/service | ✅ `zabelie_mark_received` |
| Dossiers de litige, messages, justificatifs de remboursement | ✅ `0113` |
| Remboursement via le ledger | ✅ `refund_order` |
| Nom commercial « Protection Zabelie » affiché sur le parcours | 🟡 la mécanique existe, le libellé n'est pas unifié |
| Machine d'états | ✅ `pending → paid → delivered / disputed → refunded`, maturation séparée ; **ne pas créer de seconde machine** |
| 💼 Qualification juridique de la rétention | ⚠️ dossier BRH ouvert (`docs/17`) : fonds vendeurs et plateforme **mêlés** sur un compte marchand unique |

### 3.6 Zabelie Seller

| Élément | État |
|---|---|
| Boutique publique `/boutik/<slug>`, domaine personnalisé | ✅ (domaine : 0 vendeur éligible) |
| Commission en table, niveau Elite | ✅ |
| Retraits avec KYC manuel | ✅ (0 dossier) |
| API vendeur, webhooks signés, pixels publicitaires | ✅ |
| IA : description de fiche, studio d'images (Higgsfield) | 🟡 construits, **éteints** (clés et drapeaux absents) |
| Tableau de bord : CA, commandes, conversion, visiteurs, stock | 🟡 partiel (ventes, statistiques digitales et offres) ; pas de visiteurs ni de conversion par vendeur |
| Copilot « photo → fiche complète » | 🟡 briques présentes (description IA, studio), pas d'assemblage |

### 3.7 Transverse

| Élément | État |
|---|---|
| Panier multi-vendeurs | 🟡 **le panier existe (`0058`), mais on paie article par article** ; le paiement unique pour N commandes (`order_groups`) est spécifié (`docs/27`) et non construit |
| Recherche : approximative, demande non servie | ✅ `zabelie_search_fuzzy`, `0047` ; synonymes kreyòl ❌ |
| Catégories : 83 rayons actifs | 🐞 **la page `/categories` affiche 36 fois « aucune offre publiée »** |
| SEO : sitemap, robots, canonique, données structurées | ✅ ; 💼 aucune URL par langue (`docs/47`) |
| Événements analytics, entonnoir admin | ✅ `0086`, entonnoir hebdomadaire |
| Notifications | 🟡 file `outbox` ✅, **aucun envoi** (pas de clé e-mail) |
| Sécurité : RLS partout, CSP à nonce, plafonds d'appels, audit admin, isolation vendeur testée | ✅ |
| Sauvegarde / restauration réelle | 🟡 répétition fictive seulement (`docs/operations-haiti.md`) |

---

## 4. Analyse

### 4.1 P0 juridique — BLOCKER (rien n'est inventé ici)

Mesuré en ligne aujourd'hui :

| Page | Champ vide | Nature | Qui le remplit |
|---|---|---|---|
| `/conditions` | Entité juridique et adresse | décision juridique | porteur + conseil |
| `/conditions` | Âge minimum et capacité juridique | décision juridique | porteur + conseil |
| `/conditions` | Résiliation et suspension à l'initiative de la plateforme | décision juridique | porteur + conseil |
| `/conditions` | Droit applicable et juridiction | décision juridique | porteur + conseil |
| `/confidentialite` | Entité juridique et adresse | même valeur que ci-dessus | porteur |
| `/confidentialite` | Région d'hébergement et garanties de transfert | **fait technique** (région Supabase/Vercel) + formulation des garanties | je peux mesurer la région ; le porteur valide |
| `/confidentialite` | Durée de conservation des pièces d'identité | **fait du code** : `zabelie_kyc_config.retention_jours = 90` | je peux le brancher sur la config, comme la purge des paiements |

À ajouter au P0 juridique : le **dossier BRH** (`docs/17`) et la mention
« le paiement reste protégé », qui ne doit pas présenter le registre interne
comme un compte ou un portefeuille.

### 4.2 P0 paiement réel — BLOCKER

* Aucun rail en production. MonCash attend le dossier MonCash Business ;
  `MONCASH_MODE=production` est une zone d'arrêt ferme.
* 🐞 **Réconciliation une fois par jour.** Les crons sont quotidiens (plan
  Vercel). `docs/04` exige toutes les 5 minutes en production réelle : sinon un
  paiement qui revient mal reste en attente jusqu'à 24 h. Options : plan Pro
  (dépense : décision porteur) ou cron externe gratuit qui appelle
  `/api/reconcile` avec son secret.
* 💼 Plan Hobby : réservé par Vercel à un usage non commercial.
* Diaspora : Stripe exige une entité étrangère *merchant of record* (décision
  porteur) ; Zelle reste semi-manuel.
* Essai exigé avant lancement : **une** vente réelle de bout en bout, paiement →
  confirmation serveur → commande → ledger → remise → maturation → retrait →
  et un remboursement. C'est `docs/22`, « le seul essai qui manque ».

### 4.3 P0 offre — le goulot réel

* 0 produit publié, 0 image. Aucune fonctionnalité acheteur ne produit de
  valeur avant la première fiche.
* 🐞 Les rayons vides sont exposés (36 mentions « aucune offre publiée » sur
  `/categories`). **Correctif technique sans décision** : masquer
  automatiquement tout rayon sans offre active, partout (menu, `/categories`,
  sitemap). C'est le seul P0 que je peux livrer seul aujourd'hui.

### 4.4 Ce que je recommande de NE PAS faire maintenant

* **Homepage « surface commerciale » complète** : avec 0 produit, tous les
  modules seraient masqués. Et passer d'un H1 vendeur (« Votre savoir-faire
  mérite sa boutique ») à un H1 acheteur est une décision de
  **positionnement** (zone d'arrêt, `docs/25` §4). Je la prépare quand il y
  aura une offre à montrer.
* **Zabelie Livraison avec prix et suivi** : engage un prix, un partenaire et
  une promesse commerciale. L'abstraction `DeliveryProvider` peut être
  construite sans partenaire, mais elle n'a de sens qu'après la première
  commande physique réelle.
* **Multi-devises** : affichage seulement, et après le rail diaspora.
* **Plus aucun filet sur un chemin vide** (voir §1, point 3).

### 4.5 Sur le « master prompt » pour Codex/Javis

Il est solide, et il recoupe largement ce que le dépôt fait déjà. Quatre
ajustements pour qu'il ne fasse pas reculer le projet :

1. **Lui faire lire `CLAUDE.md` et `docs/25` d'abord.** Le dépôt a des règles
   qu'un agent neuf ignorerait : une mutation par tour, zones d'arrêt
   (argent, migration, variable d'environnement, positionnement, dépense),
   migrations numérotées à la suite, préfixe `zabelie_`, RLS dès la création,
   ledger append-only, `product_kind` uniquement via `lib/product-kind.ts`.
2. **Lui donner cet inventaire.** Sinon il reconstruira le panier, les avis,
   la messagerie, l'escrow ou le digital protégé, qui existent tous.
3. **Retirer « Tu agis comme Principal Architect, … DevOps »** au profit de la
   règle zéro du dépôt : *une instruction directe du porteur prime, et en cas
   de contradiction l'agent s'arrête et demande.*
4. **Les phases 2 et 10 à 12 supposent des données** (ventes, avis,
   visiteurs) : elles viennent après la première vente réelle, pas avant.

---

## 5. Ordre proposé

| Lot | Priorité | Contenu | Qui | Bloqué par |
|---|---|---|---|---|
| L0 | P0 | Brancher la durée KYC sur la config ; mesurer et proposer la région d'hébergement | agent | — |
| L1 | P0 | Masquer automatiquement les rayons sans offre (menu, `/categories`, sitemap) | agent | — |
| L2 | P0 | Remplir les 5 champs juridiques ; trancher le dossier BRH | **porteur + conseil** | — |
| L3 | P0 | MonCash en production ; réconciliation toutes les 5 min (Pro ou cron externe) | **porteur** (dépense, variables) | L2 |
| L4 | P0 | Première vente réelle de bout en bout + remboursement (`docs/22`) | porteur + agent | L3 |
| L5 | P0 | 20 premiers vendeurs, fiches avec photos, KYC | **porteur** (terrain) | — |
| L6 | P1 | Paiement unique du panier multi-vendeurs (`docs/27`, money-path) | agent | L4 |
| L7 | P1 | « Protection Zabelie » : libellé unique sur fiche, panier, checkout, confirmation, Mes achats (sans parler de compte ni de portefeuille) | agent ; formulation validée par le porteur | L2 |
| L8 | P1 | Fiches physique et digital séparées et enrichies (vidéo, licence, formats, Q&A) | agent | L5 |
| L9 | P1 | Homepage acheteur, modules masqués quand vides | agent ; **positionnement : porteur** | L5 |
| L10 | P2 | Livraison (`DeliveryProvider`), Copilot vendeur, tableau de bord vendeur | agent | L4, L5 |
| L11 | P2 | Diaspora complète (carte, devises d'affichage) | porteur (entité étrangère) puis agent | L3 |

## 6. Décisions demandées au porteur

1. Les 5 champs juridiques et le dossier BRH (avec un conseil, malgré la
   consigne du 2026-10-03 pour les cookies : ici ce sont des engagements
   contractuels, pas une pratique d'usage).
2. MonCash Business en production, et le choix pour la réconciliation
   (plan Vercel Pro ou cron externe gratuit).
3. Valider l'ordre §5, en particulier : **plus de nouvelle fonctionnalité
   acheteur avant la première vente réelle**, hors L0, L1 et L7.
