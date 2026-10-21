# 67 — Audit d'architecture avant mise en production commerciale (2026-10-04)

Demande porteur du 2026-10-04 : « avant d'écrire du code, produire :
Executive Summary, architecture actuelle, inventaire des fonctionnalités
existantes, analyse ». **Aucun code n'est modifié par ce document.**

Sources : le dépôt sur `main` (`540c29d`, après #309), la base de production
(`ddditxykopuxxqzgkqwy`, lectures seules), et le site en ligne (zabelie.com,
requêtes HTTP). Chaque chiffre ci-dessous a été **mesuré aujourd'hui**, sauf
mention contraire. Les informations juridiques manquantes ne sont **pas**
inventées : elles sont listées comme bloquantes.

**Mise à jour de périmètre du 2026-10-05.** Le porteur confirme : Zabelie ne fait
pas de livraison, Zabelie Pay autonome est exclu pour le marché haïtien, et
aucune fonction existante ne doit être reconstruite. Le contrat est amendé
dans `docs/26` §0. Les mesures du 4 octobre restent datées : elles ne constituent
pas une nouvelle lecture de la base. Ne pas utiliser l'ancien clone
`marketplace-hub` comme état de la production actuelle.

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

## 2. Architecture relevée le 4 octobre 2026

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

## 3. Inventaire du 4 octobre, avec mises à jour explicitement datées

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
| Livraison opérée par Zabelie | Hors périmètre | La remise et une éventuelle livraison sont organisées par le vendeur ; réutiliser les déclarations existantes |
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
| Panier multi-vendeurs | Mise à jour 2026-10-05 : panier (`0058`) et paiement groupé (`0128`, `0129`) construits ; `panier/payer` réutilise le checkout existant. Schéma appliqué et vérifié à 18:12Z (§10) ; ouverture automatique après la première vente réelle admissible, hors auto-achat et comptes test (`0132`) |
| Recherche : approximative, demande non servie | ✅ `zabelie_search_fuzzy`, `0047` ; synonymes kreyòl ❌ |
| Catégories : 83 rayons actifs | 🐞 **la page `/categories` affiche 36 fois « aucune offre publiée »** |
| SEO : sitemap, robots, canonique, données structurées | Mise à jour 2026-10-05 : URL publiques par langue construites (`78e830f`, `proxy.ts`, `lib/langue-url.ts`) ; ne pas recréer une seconde couche de routage |
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

**Mise à jour du 2026-10-04 (soir).** Deux des sept champs sont remplis
(PR #313, migration `0126`) :

* **Région** : mesurée — Supabase `us-east-1`, fonctions Vercel `iad1`.
  Aucune garantie de transfert affirmée (rien de signé n'a été constaté).
* **Pièces d'identité : 5 ans**, décision porteur, alignée sur la loi
  haïtienne du 11/11/2013 contre le blanchiment. ⚠️ Écart connu : la purge
  compte depuis la DÉCISION sur le dossier, la loi depuis la FIN DE LA
  RELATION ; un vendeur actif plus de 5 ans verrait ses pièces purgées trop
  tôt si Zabelie était soumise à l'obligation.
* 🐞 **Défaut trouvé en passant** : supprimer un compte qui n'a jamais vendu
  (`DELETE /api/account`, mode `deleted`) efface en cascade les lignes
  `zabelie_kyc_documents`, mais PAS les fichiers du bucket privé — ils
  deviennent orphelins et échappent à toute purge. Aujourd'hui : 0 pièce
  stockée, donc aucun fichier concerné. À corriger avant le premier KYC.

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
* **Zabelie Livraison, y compris `DeliveryProvider` propre à la plateforme** :
  exclu par la consigne du porteur du 2026-10-05. Réutiliser les déclarations de
  remise/retrait/livraison du vendeur et la machine de fulfillment existante.
* **Zabelie Pay autonome** : exclu du périmètre actuel. Le checkout et le
  registre vendeur existants ne sont pas une autorisation de créer un nouveau
  portefeuille ou service financier ; le dossier de qualification BRH reste
  ouvert (`docs/17`).
* **Multi-devises** : affichage seulement, et après le rail diaspora.
* **Plus aucun filet sur un chemin vide** (voir §1, point 3).

### 4.5 Sur le « master prompt » pour Codex/Javis

Il est solide, et il recoupe largement ce que le dépôt fait déjà. Quatre
ajustements de méthode, complétés par les contraintes produit du 2026-10-05 :

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
5. **Retirer le module et l'objectif « Zabelie Livraison »** des sections 5
   et 18 du texte reçu. Dans les parcours physique, checkout et diaspora,
   remplacer la livraison plateforme par les conditions de remise du vendeur.
6. **Retirer Zabelie Pay autonome et le wallet acheteur** des objectifs.
   Les sections 14 à 17 réutilisent les paiements, le ledger, les litiges et
   règlements vendeurs existants ; toute extension financière dépend de la
   qualification juridique applicable en Haïti. Renommer un escrow
   « Protection Zabelie » ne résout pas cette qualification.
7. **Éviter aussi les doublons de documentation** : amender `docs/26`, conserver
   cet inventaire, et vérifier les composants/routes/tables/tests existants
   avant tout ajout. Ne pas importer un second moteur depuis `marketplace-hub`.

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
| L6 | P1 | Paiement groupé déjà construit : éprouver l'existant et vérifier migrations/ouverture selon `OPS_TODO`, sans second checkout | agent + porteur | État réel des migrations et gardes |
| L7 | P1 | « Protection Zabelie » : libellé unique sur fiche, panier, checkout, confirmation, Mes achats (sans parler de compte ni de portefeuille) | agent ; formulation validée par le porteur | L2 |
| L8 | P1 | Fiches physique et digital séparées et enrichies (vidéo, licence, formats, Q&A) | agent | L5 |
| L9 | P1 | Homepage acheteur, modules masqués quand vides | agent ; **positionnement : porteur** | L5 |
| L10 | P2 | Copilot vendeur, tableau de bord vendeur, en réutilisant les briques présentes | agent | L4, L5 |
| L11 | P2 | Diaspora complète (carte, devises d'affichage) | porteur (entité étrangère) puis agent | L3 |

## 6. Décisions demandées au porteur

1. Les 5 champs juridiques et le dossier BRH (avec un conseil, malgré la
   consigne du 2026-10-03 pour les cookies : ici ce sont des engagements
   contractuels, pas une pratique d'usage).
2. MonCash Business en production, et le choix pour la réconciliation
   (plan Vercel Pro ou cron externe gratuit).
3. Valider l'ordre §5, en particulier : **plus de nouvelle fonctionnalité
   acheteur avant la première vente réelle**, hors L0, L1 et L7.

## 7. Vérification ciblée du 5 octobre 2026

**Périmètre.** Lecture du dépôt `Zabelie-Digi` au commit
`35a9b4eea4c63d83c4d52584491a8f6533b3bbf1`, navigation publique sans compte
ni paiement, et tests existants. Les données et le registre de migrations
Supabase n'ont pas été interrogés dans ce passage. Les mesures de la base
dans les sections précédentes conservent leur date ; une migration présente
sur disque ne prouve pas son application.

**Attribution de production.** `/api/deployment` répond 200 avec
`d1a8f95c3917ade01221fb0d93dfa2992d19b1e5d2f7a857aaf438f15dd02733`,
identique au SHA-256 du commit complet ci-dessus. Cette correspondance
identifie le code publié, pas les secrets ni l'état de la base.

**Constats publics.** L'accueil indique explicitement que Zabelie ne stocke
ni ne livre les produits et que la remise se prépare avec le vendeur.
MonCash reste annoncé en test, sans paiement réel. `/recharges` répond 200 ;
`/zabely-pay` répond 404. À 390 × 844, `/recharges`, `/conditions`,
`/confidentialite` et cette page 404 n'ont produit aucune erreur JavaScript
de page ni débordement horizontal. Cela ne valide pas un paiement réel,
tous les navigateurs ou les six largeurs du Master Prompt.

**Légal encore incomplet.** Le rendu public contient quatre mentions
« À COMPLÉTER » dans les conditions et une dans la confidentialité : entité
juridique/adresse (dans les deux documents), capacité/âge, résiliation et
droit/juridiction. Aucune valeur n'est inventée. Le dossier BRH reste ouvert ;
J+7 et un registre comptable ne suffisent pas à conclure à la conformité.
La [circulaire 121, §4.1](https://www.brh.ht/wp-content/uploads/Circulaire-121-FSP.pdf)
prévoit l'autorisation ou l'avis de non-objection pour les activités relevant
de son champ. La qualification du dispositif Zabelie nécessite les faits et
l'avis juridique documentés dans `docs/17`.

**Étape documentaire, avant l'implémentation §8 : 83 réussites, aucun échec.** Disponibilité des paiements,
mode MonCash, panier groupé, fidélité désactivée, promesses vendeur/livraison,
schémas API (dont refus de `platformFulfilled: true`), fermeture des recharges,
CGU et i18n. Aucun second module, route, table, moteur financier ou test n'a
été ajouté. `git diff --check` passe. Seuls les trois documents existants
`CLAUDE.md`, `docs/26` et ce document sont amendés localement.

**Défauts relevés avant l'implémentation §8 :**
- **P1, retry du checkout** : `app/api/checkout/route.ts` insère une nouvelle
  commande par POST (bloc `orders.insert`, lignes 507–531 au commit inspecté).
  La clé de paiement basée sur `order.id` ne déduplique pas la répétition de
  création. Définir et tester l'idempotence de l'opération de checkout ; ne
  pas confondre idempotence de confirmation et de création.
- **P1, rattrapage Stripe groupé** : `app/api/panier/payer/route.ts:210`
  ignore l'erreur d'enregistrement de `stripe_session_id`, alors que
  `lib/stripe-reconcile.ts:22` en dépend. Réutiliser le contrôle de persistance
  déjà présent dans la branche Kobara et tester son échec avant redirection.
- **P2, trace des accès digitaux** : `app/api/download/route.ts:104` ignore
  l'erreur du journal d'accès. La clé unique compte une ouverture par
  commande/version/fichier, pas chaque tentative ; elle ne doit pas être
  présentée comme un historique exhaustif ou une limite de téléchargement.

Ces constats sont statiques ; aucune exploitation, perte de paiement ou
transaction réelle n'a été démontrée pendant cet audit. Aucune écriture
de production, activation de rail, migration, dépense ou publication n'a
été effectuée.

## 8. Implémentation locale autorisée — 5 octobre 2026

Instruction du porteur : « implémenté, tout en restant focus sur la loi
haïtienne sur le ecommerce ». Ce lot corrige les trois défauts du §7 dans le
checkout, le panier et le téléchargement existants. Aucun second checkout,
rail, portefeuille acheteur, registre, transporteur ou objet SQL n'est créé.
Les conditions commerciales, montants et activations restent ceux de l'existant.

- **Création de commande** : le checkout public exige une `checkoutKey`
  UUID v4. Le serveur dérive un identifiant de commande de cette clé et de
  l'acheteur authentifié ; la clé primaire `orders.id` existante arbitre les
  requêtes simultanées en base. Un rejeu ne crée pas de paiement, ne réserve
  pas à nouveau le stock et ne relance pas l'opérateur. Il reprend une session
  persistée si la commande et son paiement sont encore `pending`, sinon il
  mène à la vérification des achats. Le contexte groupé reste exclusivement
  serveur. Les deux clients du checkout transmettent la clé.
- **Rechargement / réseau haïtien** : le brouillon existant conserve pendant
  30 minutes dans le même onglet la clé et une empreinte SHA-256 de l'intention,
  sans coordonnées du destinataire ni consentement en clair. Le bouton garde
  un repli en mémoire si le stockage est indisponible. Une nouvelle clé est
  une nouvelle tentative : cette garantie ne déduplique pas universellement
  tous les achats d'un même produit. Une issue opérateur incertaine invite à
  vérifier les achats, sans supposer qu'aucun paiement n'existe.
- **Sessions opérateur** : `persistPaymentSession` dans `lib/payment-utils.ts`
  est partagé par les deux checkouts et les trois rails existants. Une erreur,
  une ligne absente ou une mauvaise commande interdit la redirection.
  Stripe reçoit également l'idempotence `order.id`. Une reprise utilise
  uniquement l'URL enregistrée côté serveur, en HTTPS et sur les hôtes des
  opérateurs existants ; aucun lien fourni par l'acheteur n'est accepté.
- **Accès digital** : le journal `zabelie_digital_accesses` existant doit
  accepter la trace avant l'exposition de l'URL et la déclaration de remise.
  Une panne produit 503 sans cache. L'unicité commande/version/fichier est
  conservée ; aucun quota de téléchargement n'est inventé.
- **Information contractuelle** : CGU et confidentialité corrigées en
  français, kreyòl, anglais et espagnol. Le vendeur annonce et organise la
  remise ; aucun transport ni frais de livraison Zabelie. Le registre est
  décrit par ses capacités, sans transformer sa description en qualification
  juridique. Les affirmations pénales non établies et l'application automatique
  du RGPD selon la seule résidence sont retirées. Export, correction,
  fermeture du compte et demandes de droits applicables restent décrits.

**Sources primaires consultées** : [CONATEL, signature électronique et amendement
2025](https://www.conatel.gouv.ht/signature-electronique),
[communiqué CONATEL](https://www.conatel.gouv.ht/sites/default/files/NOTE%20DE%20PRESSE%20SIGNATURE%20ELECTRONIQUE%20OCTOBRE%202025.pdf),
[BRH, circulaire 121](https://www.brh.ht/wp-content/uploads/Circulaire-121-FSP.pdf),
[BRH, présentation des circulaires 121 et 131 (2026)](https://www.brh.ht/la-confiance-au-coeur-de-lecosysteme-des-paiements-numeriques-la-vision-de-la-brh-pour-une-protection-renforcee-des-consommateurs/),
[MCI, carte d'identité professionnelle](https://mci.gouv.ht/cip.php).
L'applicabilité d'une obligation à l'exploitant ou à chaque catégorie de vendeur
doit être qualifiée ; aucune CIP n'est imposée automatiquement à tout particulier.

**Limite juridique** : l'entité exploitante et son adresse ne sont pas
renseignées ; les trois marqueurs CGU (capacité/âge, suspension/préavis,
droit applicable/juridiction) restent visibles. Le dossier BRH `docs/17`
reste ouvert, notamment sur les fonds marchands et leur rétention.
L'implémentation ne certifie aucune conformité globale ou signature électronique
certifiée, et ne remplace pas les décisions et la validation juridique manquantes.

**Validation finale** : voir les résultats de ce lot dans `OPS_TODO.md`.
Aucune écriture de données réelles, application de migration ou activation de
rail n'est effectuée par ce lot. La publication du code est autorisée le
5 octobre par « pousse et met le en ligne », après la validation locale.
Le rejeu individuel lit la commande sans exiger `group_id` (0128 non appliquée),
tout en conservant la garde groupe si la colonne existe. Un ancien client sans
clé reçoit un message invitant à actualiser : aucun repli non dédupliqué.

## 9. Corrections de l'audit de la version en ligne — 5 octobre 2026

Le nouvel audit porte sur `6a1f2ca`, publié après le §8. Il a reproduit un
blocage d'achat numérique et quatre défauts de priorité secondaire : reprise
inaccessible, session physique exposée après libération du stock, décision
KYC écrasée par un dépôt concurrent et filtrage incomplet des IPv4 privées
mappées en IPv6. Les deux défauts de sécurité sont préexistants. Le blocage
de reprise numérique et certains chemins d'incertitude ont été introduits
par le lot précédent. Ces reproductions utilisent des I/O simulées ; elles
n'attestent aucun débit ou incident de production.

**Implémentation autorisée :** instruction « implémenté » après ce compte
rendu. Les corrections réutilisent les modules canoniques :

- `app/api/checkout` répare une préparation sans paiement sur le même ordre
  et conserve montant, coupon et snapshot. Un montant/coupon changé entraîne
  un conflit, sans encaissement silencieux. Seule la requête gagnant l'INSERT
  unique de `payments` peut réserver le stock et appeler l'opérateur.
  Le destinataire et les métadonnées déjà acquis ne peuvent pas changer
  à la reprise. Une ancienne commande physique sans paiement ne stockant
  pas sa variante/quantité reste en vérification, sans création de session.
  Le paiement gagnant fixe une empreinte de l'intention normalisée dans
  son `raw` existant ; elle est conservée avec la session, sans seconde
  copie des coordonnées privées. Les requêtes concurrentes divergentes
  sont refusées et seul ce gagnant écrit les métadonnées obligatoires.
- `recoveryOnly` relit une tentative ou une commande appartenant à l'acheteur,
  sans créer de commande, paiement ou session. La reprise utilise le rail
  enregistré et une URL opérateur autorisée. Les états en attente restent
  en attente ; seul un état terminal vérifié autorise l'oubli de la tentative.
  Les instructions Zelle exigent une preuve persistée de préparation
  complète, à la reprise comme sur leur page directement accessible.
  Une ligne de paiement en attente seule ne constitue pas cette preuve.
- Le bouton existant et le contrôle de suivi exposent cette vérification
  depuis la fiche, Mes achats et la page d'attente, dans les quatre langues.
  Le stockage de la clé/alerte non sensible est distinct des saisies privées
  expirant après 30 minutes. Une panne de rapprochement ne fait pas expirer
  l'identité de la tentative côté navigateur.
- Une exception de création/persistance opérateur ne libère plus le stock
  d'une session potentiellement payable. Une ancienne session physique dont
  la réservation est absente, libérée ou expirée n'est pas exposée au rejeu.
- `0130` ajoute une RPC KYC transactionnelle, `SECURITY INVOKER` et réservée
  au serveur : profil verrouillé avant dossier, comparaison de la décision
  relue et insertion du document avec la remise en attente atomique. Les
  fichiers refusés sont nettoyés ; une réponse RPC perdue après commit ne
  conduit pas à supprimer une pièce déjà enregistrée.
- `lib/webhooks` compare les mots numériques des IPv6 et applique aux IPv4
  mappées les interdictions IPv4 existantes, lors de la résolution de connexion.

**Validation et publication :** résultats consignés dans `OPS_TODO.md`.
La migration KYC a passé la CI/Postgres, a été appliquée à 14:54:29Z puis
publiée par la PR #324.
Les migrations groupées `0128`/`0129`, les activations de rails, les secrets,
les paramètres commerciaux et les données financières réelles ne font pas
partie de ce lot. Le contrat sans livraison Zabelie et sans Pay autonome
reste celui de `docs/26` §0.

**Limites de lancement :** les mentions légales à compléter et la
qualification du circuit des fonds ne se déduisent pas des tests de code.
La cadence de rapprochement toutes les cinq minutes nécessite encore le
choix/configuration du porteur prévu au §5 L3 ; le cron quotidien actuel ne
prouve pas cette cadence. Le premier achat réel complet et son remboursement
restent à valider avec des acteurs, une offre et un montant autorisés.
Une insertion de paiement dont la réponse est perdue, ou un échec de
métadonnées après cette insertion, conserve l'état en attente sans lancer
une seconde session. La reprise affiche alors la vérification nécessaire ;
elle ne prétend pas réparer automatiquement ces états ambigus.

## 10. Compléments techniques avant lancement — 5 octobre 2026

Le porteur demande d'implémenter maintenant les compléments au §9, sans
attendre le lancement. Ils réutilisent le checkout, le panier, les gardes de
compte, le registre d'acceptations et le rapprochement existants. Le contrat
de `docs/26` reste sans livraison Zabelie ni service Pay autonome.

**Documents publics :** les trois clauses CGU auparavant en attente sont
rédigées dans les quatre langues : capacité selon les règles applicables,
restriction motivée avec recours par le contact existant, droit haïtien et
droits impératifs applicables à la diaspora. Aucune majorité uniforme ou
juridiction exclusive n'est inventée. L'identité et l'adresse ne sont pas
fabriquées. Les formalités des vendeurs professionnels sont distinguées des
ventes de particuliers. `docs/17` décrit les contrats, responsables et
preuves nécessaires à la qualification des fonds ; un ledger ne prouve
ni ségrégation bancaire ni règlement effectif.

**KYC (`0131`) :** cinq années calendaires après la clôture du profil,
avec conservation pendant la relation active. La décision KYC ne lance
plus le délai. La clôture sans date est conservée, une suspension temporaire
reste réversible, et un compte clôturé anonymisé ne peut pas être restauré.
La purge reste réservée au serveur, revérifie les identifiants expirés et
traite le stockage avant les métadonnées. Le test inclut l'anniversaire
du 29 février, les limites temporelles, les dossiers absents/en attente,
les droits anon/authenticated et la conservation du premier horodatage.

**Achat et retour (`0132`) :** auto-achat refusé par les routes et par le
trigger de commande ; l'ouverture groupée exige une véritable commande
payée/remise entre acteurs distincts hors test. La méthode originale
MonCash/NatCash/Stripe/Zelle est conservée sans payload personnel et devient
immuable ; un Kobara historique dont le fournisseur est inconnu ne permet
pas d'inventer une preuve de remboursement. L'annulation comptable et
la preuve opérateur du retour sont présentées comme deux opérations.
Le scénario SQL couvre achat, remise vendeur, réception, annulation au
ledger, retour documenté, idempotence et équilibre. `docs/22` reste le
protocole de l'exercice réel à réaliser.

**Acceptation (`0133`) :** les deux déclarations non précochées réutilisent
`zabelie_policy_acceptances` : `cgu-v1` pour les CGU et
`confidentialite-v1` pour l'information de confidentialité. Elles ne sont
ni un consentement global à tous les traitements ni une signature certifiée.
Le trigger Auth enregistre la déclaration initiale dans la transaction
de création email, même lorsque la confirmation ne fournit pas de session.
Il ne déduit aucune acceptation de modifications ultérieures des metadata.
Une RPC authentifiée sans identifiant de tiers enregistre l'acceptation
explicite du parcours OAuth, avec verrou contre une clôture concurrente.
La garde juridique est activée aux seuls points métier nommés : nouvel achat,
panier groupé, création de produit et dépôt KYC, avec présentation sur les
écrans vendeurs concernés. La reprise `recoveryOnly`, les droits, l'export,
la fermeture, le support et l'historique restent accessibles. Le refus
redirige vers l'acte explicite puis revient au contexte, sans achat automatique.
Ce contrôle applicatif ne constitue pas un verrou de tous les accès SQL.

**Cadence :** le workflow facultatif réutilise `/api/reconcile` et son bail.
Un HTTP 200 contenant des erreurs de rails ou des divergences échoue ;
les réponses sont bornées et aucune réémission automatique ne suit une
issue incertaine. L'activation exige un plan confirmé ou la configuration
GitHub autorisée. Aucun plan n'est souscrit ; les retards possibles de
GitHub empêchent de promettre cinq minutes exactes. Le cron quotidien
reste le secours. `docs/04` contient la configuration unique.

**Sources et portée :** [MCI, CIP](https://mci.gouv.ht/cip.php),
[guichet MCI](https://guichet.mci.ht/aide-et-questions),
[CONATEL, signature électronique](https://www.conatel.gouv.ht/signature-electronique),
[BRH, circulaire 129-1 du 6 février 2026, §14](https://www.brh.ht/wp-content/uploads/Circulaire-CIR-.-BRH-IF-2026-129-1-Aux-Institutions-FinancieEres-6-feevrier-2026-Lutte-contre-le-blanchiment-de-capitaux._0001.pdf),
[BRH, circulaire 121](https://www.brh.ht/wp-content/uploads/Circulaire-121-FSP.pdf).
Le §14 vise les institutions financières ; l'applicabilité à l'exploitant
Zabelie reste à qualifier, et les cinq ans sont aussi la décision explicite
du porteur. La société, le dépôt, les contrats et les mouvements réels
ne se déduisent pas de tests logiciels.

**Validation :** [CI verte](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/actions/runs/37353277158)
sur `25e440f6768dfc29e59604ed2af5b48b74e37c85` : 1 564 tests unitaires,
185 tests navigateur, PostgreSQL 17 et toutes les suites SQL, confirmations
simultanées, courses KYC entre sessions et restauration synthétique avec RLS.
TypeScript, lint sans erreur (10 avertissements existants), contraste,
audit des dépendances de production, scanner Linux et compilation réussis.
La QA FR/HT/EN/ES à 360 px vérifie les documents publics versionnés, les cases
non précochées, le refus sans les deux actes, la déclaration exacte sans
session e-mail et le retour OAuth sans achat automatique. Aucun compte,
paiement, remise ou retour réel n'est créé par ces essais.

**Applications de production — 5 octobre 2026 :**

| Fichier | UTC | SHA-256 canonique |
|---|---|---|
| `0128_zabelie_paiement_groupe.sql` | 18:11:50Z | `14a4752dc04df53dd6a74a20cea5776d51438d300f2ce747face4fa7de6b7738` |
| `0129_zabelie_objets_requis_panier.sql` | 18:12:31Z | `08ef8d8962c6f6aa756dc9f8c36fff6835e3597b7b2bc3c3f3cac5e23ffa9555` |
| `0131_zabelie_kyc_retention_cloture.sql` | 18:12:38Z | `071584a880ea8e0a2dec43f6bc8ec7a4514a645af2f1fe8982ef7e5db3540f4f` |
| `0132_zabelie_achat_distinct.sql` | 18:12:46Z | `8e323283002c6534148f0a27d6ce98cff25e47f05fc23c8384e50a251f723b2c` |
| `0133_zabelie_acceptation_compte.sql` | 18:12:53Z | `836197e0b191a68c7967c0a8760bdf561fd147ed9d738f226b6c5d21dd63bc0e` |

Pour chaque fichier, le SQL intégral reçu est identique à la source contrôlée
par la CI ; le journal Supabase et le registre opérationnel concordent
(`appliquee`, `journal_supabase`). Autorisation : instruction du porteur du
5 octobre et règle permanente du 17 août. `0130` était déjà appliquée.
Postconditions lues : panier fermé et armement automatique conservé, KYC
cinq ans, zéro candidat à la purge, trigger Auth actif, RPC juridique
refusée à anon et autorisée à authenticated. Les deux anciens reçus produits
sont conservés ; aucune acceptation historique de compte n'est inventée.
La seule absence reste `0056`, gelée et annulée antérieurement par le porteur
jusqu'aux décisions D-10 à D-14 sur les preuves de litige. Aucun nouvel objet
requis n'est absent et aucune purge d'avis n'est activée par ce lot.

**Publication :** [PR #325](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/pull/325),
avec statut, commit de déploiement et contrôles du domaine dans sa description.
Les changements de suivi après application ne modifient aucun SQL appliqué.

## 11. Petit lot de corrections après inventaire — 20 octobre 2026

Demande du porteur : compléter l'existant sur branche dédiée, tests puis PR
de validation humaine, sans fusion, déploiement de production, paiement réel
ni écriture en base de production. Référence inventoriée : `68c191e` de `main`.
Les mesures du 4 octobre ci-dessus restent historiques ; aucune nouvelle
mesure de données de production n'a été effectuée pour ce lot.

**Inventaire statique avant correction :** 68 pages App Router, 111 routes API,
150 migrations, 290 fichiers `tests/**/*.test.ts`, 95 fichiers SQL
`supabase/tests/*.test.sql` et 56 specs `e2e*/**/*.spec.ts` suivis par Git.
Lecture de `CLAUDE.md`, `docs/25`, `docs/26`, de cet inventaire et d'`OPS_TODO`.
GitHub (liste REST directe) : trois PR Dependabot préexistantes ouvertes,
`#385` (mises à jour mineures), `#386` (ESLint) et `#387` (TypeScript), sans
recouvrement avec ce lot ; 100 PR fermées récentes examinées, avec recherches
ciblées dans l'historique. Une recherche du connecteur omettait ces trois PR :
la liste REST fait foi pour ce relevé. La PR de ce lot s'ajoute à ces trois PR.

| Chemin | Implémentation et données existantes | Tests et PR déjà fusionnées |
|---|---|---|
| Inscription | `components/connexion-form.tsx`, `/connexion?mode=signup`, `safeNext`, création `profiles` et acceptations juridiques par triggers | Auth navigateur, `safe-next`, #265, #325, #346 |
| Publication et médias | Brouillons via `/api/products`, publication humaine `/api/admin/product-status`, `products`, `product_assets`, `zabelie_product_media` (`0073`), versions et droits digitaux (`0104`) | `galerie-photos`, `product-media`, `api-publication`, `publication-discipline`, #324, #384 |
| Stripe | Checkout idempotent, webhook signé, confirmation et réconciliation serveur ; `payments`, `orders`, escrow, commandes groupées et support (`0113`, `0128`) | `stripe-config`, `stripe-webhook`, `stripe-reconcile`, SQL, #267, #268 |
| Supabase | Gardes de compte, propriété, RLS, droits des fonctions, clés publiques contrôlées, jointures commandes/produits explicites | `config-supabase`, `api-auth-coverage`, SQL `definer_exposition`, #332, #354, #357, #378 |

**Deux corrections P1 initiales, sans nouvelle table, migration ni moteur :**

- `/inscription` renvoie temporairement (307) vers `/connexion?mode=signup`.
  Le retour interne `next` passe par `safeNext` ; les autres paramètres ne sont
  pas propagés. Le `Location` relatif préserve l'origine et les cookies du
  navigateur, même si Next normalise l'hôte de la requête côté serveur.
  Le formulaire, l'authentification et les consentements restent
  ceux de `/connexion`. La suite Auth existante couvre également cet alias.
- Après une tentative d'insertion de photo ou vidéo, une réponse perdue peut
  suivre un COMMIT réussi. Les routes médias ne suppriment plus alors le
  fichier Storage susceptible d'être référencé, suivant le précédent de
  `lib/product-asset-confirm.ts`. Le HTTP 500 est conservé ; une vidéo invalide
  détectée avant insertion reste supprimée. Un vrai rejet peut laisser un objet
  orphelin : tout nettoyage ultérieur doit prouver l'absence de référence.

**Litiges Stripe différés, manque confirmé :** `charge.dispute.created` est
encore acquitté comme événement ignoré par `/api/stripe/webhook`. Le support et
les litiges acheteur existent déjà (`0113`) malgré l'ancien en-tête de `docs/28`
qui annonce une simple spécification ; ne pas reconstruire leurs tables.
`zabelie_stripe_payment_failed` ne gèle pas un paiement confirmé et
`zabelie_report_not_received` exige un acheteur et son suivi de remise.
Changer uniquement `orders.status` ne gèle pas la maturation ; réutiliser son
verrou de livraison serait insuffisant car la réception peut le lever.
Une correction sûre exige une transaction couvrant paiements groupés, escrow,
réception, maturation et résolution. Ce lot ne prétend pas la fournir.

**Vérification :** les nouveaux tests médias échouent sur les deux suppressions
initiales puis passent après correction ; ils exécutent les vraies routes avec
E/S factices, dont COMMIT simulé suivi d'erreur réseau ou de réponse vide.
L'alias est vérifié avec retours internes et malveillants ; les résultats
complets de compilation, lint, suites et CI sont consignés dans la PR.
Relecture indépendante du code et 51 tests ciblés réussis avant publication
de la PR. Aucun contrôle local ne vaut attestation de l'état de la production.

**Complément de la même PR, 20 octobre 2026 : cadence vidéo.** Après nouvelle
lecture des routes et des PR ouvertes, la route vidéo émettait des liens
d'envoi uniques sans appeler le limiteur, alors que la galerie photo le fait.
Le plafond d'une vidéo confirmée ne limite pas les demandes non confirmées.
La vraie route, avec E/S factices et cadence refusée, acceptait encore les
demandes ; trois nouveaux tests échouaient avant la correction.
Les étapes `demande` et `confirme` passent désormais par `rateLimit` avant
toute lecture produit/média ou opération Storage. Elles partagent le budget
de galerie existant des photos : 20 appels par vendeur et par fenêtre de
60 secondes, quel que soit le produit. Une panne ou une réponse indécidable
du compteur interdit l'accès ; le HTTP 429 réutilise les traductions existantes.
Le helper et sa RPC atomique ne sont pas recréés ; aucun schéma ne change.
Le traitement Stripe est proposé séparément dans la PR #391 (`docs/28`) et
ne fait pas partie de cette branche. Les limites de production restent celles
énoncées au début de ce §11.

## 12. Matrice de clôture des constats connus — 20 octobre 2026

Cette section réconcilie les constats des §3–11, de la
[revue de `/vendre`](REVUE-2026-10-08-vendre.md), de
[docs/55](55-audit-priorites-2026-09-08.md) et de
[docs/72](72-ANGLES-MORTS-EXPLOITATION-2026-10-17.md). Elle ne remplace pas leurs
mesures historiques et n'est pas une nouvelle mesure de la production.

**Référence livrée :** `main` à
`56b76a6763f0e3e158f6b3bb1f1084719a5850d0`, arbre
`42a240e62f604e81c6d624dedb5811a8de7c7f96`. Les six PR #390 à #395 sont
fusionnées. La liste REST directe ne relève plus que les trois PR de dépendances
#385, #386 et #387 ; aucun lot fonctionnel parallèle ne doit être recréé.

La [CI de main](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/actions/runs/39453341741)
a ses trois checks `build`, `e2e` et `sql-tests` verts.
Le [check post-déploiement](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/actions/runs/39453341899)
est également vert. Ces métadonnées GitHub ne prouvent ni l'application de 0151,
ni la configuration Stripe, ni une transaction réelle. L'arbre est identique
à celui de la
[validation combinée](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/actions/runs/39451209757) :
2 132 tests unitaires et un test ClamAV, 378 cas navigateur dont 22 Auth,
96 fichiers SQL et 16 mutations détectées. Dans ce run combiné, 377 cas
navigateur passent directement et un cas préexistant d'apparence passe au
premier retry ; aucun échec final ni test ignoré.

### 12.1 Livré et testé : ne pas reconstruire

| Constat | État du code à la référence ci-dessus | Preuve et limite |
|---|---|---|
| Alias `/inscription` absent | Corrigé, PR #390 : 307 relatif vers `/connexion?mode=signup`, retour interne contrôlé par `safeNext` | `tests/inscription-route.test.ts`, Auth navigateur ; formulaire et acceptations existants réutilisés |
| Photo/vidéo supprimée après INSERT dont la réponse est perdue | Corrigé, PR #390 : conserver l'objet susceptible d'être référencé | `tests/galerie-photos.test.ts` ; un nettoyage futur doit prouver l'absence de référence |
| Demandes vidéo non confirmées sans limite de cadence | Corrigé dans #390 : même budget atomique que les photos, refus si compteur indécidable | Vraies routes et helper testés avec E/S factices ; aucun second limiteur |
| Événements de litige Stripe ignorés | Code livré, PR #391 : cinq types signés, reçus immuables, rapprochement unique, file admin, garde de maturation dormante | `tests/stripe-disputes-webhook.test.ts`, `tests/operations.test.ts`, SQL SD1–SD13 et deux ordres de concurrence ; mise en service non attestée |
| Pixels effacés par corps JSON invalide | Corrigé, PR #392 : refus avant upsert, effacement volontaire conservé | `tests/pixels-route.test.ts` |
| Récupération de mot de passe utilisant une ancienne session | Corrigé, PR #393 : identité du lien vérifiée, writer mémoire lié à cette session | `tests/reset-password-form.test.ts`, `e2e-auth/reinitialisation.spec.ts` ; aucun envoi d'e-mail réel par ces tests |
| Coordonnées de remise effacées par corps/type invalide | Corrigé, PR #394 : refus avant écriture, identité Auth et remplacement explicite conservés | `tests/delivery-info.test.ts` ; aucune livraison opérée par Zabelie |
| Export de compte partiel annoncé comme complet | Corrigé, PR #395 : erreurs bloquantes, pagination et décompte exact sur les familles existantes | `tests/account-export.test.ts`, tests collections/juridiques ; les lectures ne constituent pas un instantané transactionnel |
| Retry du checkout, session opérateur non persistée, trace digitale ignorée (§7) | Corrigés avant les six lots, §8–10 : clé de création et PK existante, `persistPaymentSession`, trace avant URL | Suites checkout/panier/download ; aucun nouveau checkout ni paiement réel nécessaire pour reproduire les refus |
| Reprise numérique, réservation physique incertaine, course KYC, IPv4 mappée privée (§9) | Correctifs existants à conserver : reprise seule, session non exposée après libération, RPC KYC atomique, résolution IP filtrée | §9–10 et suites checkout/KYC/webhooks ; aucune preuve d'incident financier réel déduite |
| KYC orphelin et durée partant de la décision (§4.1) | Correctifs existants 0127/0131 : stockage protégé, conservation pendant la relation et délai depuis clôture | §10, suites KYC/fermeture ; l'état actuel des fichiers de production n'a pas été relu |
| Rayons vides, langue et surface indexable (§3–5) | Filtre `rayonsPeuples`, garde sitemap, URLs publiques par langue et métadonnées existent | `app/categories/page.tsx`, `app/sitemap.ts`, `lib/langue-url.ts`, suites taxonomie/SEO ; ne pas créer une seconde taxonomie ou couche de routes |
| Publication, support, remboursements, RLS et mesures admin | Mécanismes existants, dont 0113 : publication humaine, dossiers par commande, retour documenté, séparation vendeur et métriques | Suites publication, droits RPC/RLS et opérations ; ni le support ni le ledger ne doivent être reconstruits à partir de l'ancienne spec M3 |

### 12.2 Revue initiale de `/vendre` : liste finie des 21 constats

Les numéros ci-dessous sont ceux du rapport du 8 octobre. « Opportunité »
désigne une amélioration mesurée ou proposée, sans nouveau défaut P0/P1 démontré
dans cette clôture. « Reste code » n'est pas une autorisation implicite de
modifier tout le parcours.

| ID | Classe et état | Ancre actuelle / suite bornée |
|---|---|---|
| UX-01 | Corrigé et testé | Compression navigateur et `COVER_MAX_OCTETS` partagés ; vraie route et scénario galerie |
| UX-02 | Corrigé et testé | `PhotoPrincipale` sur les brouillons des trois types ; la préparation mesure `cover_url` |
| UX-03 | Réserve produit et opérationnelle | Le bloc « quand/comment je suis payé » reste à valider avec le porteur ; ne pas promettre un versement ni activer un rail depuis un texte |
| SEC-01 | Correctif dans la PR #396, validation humaine attendue | Médias/couverture d'une fiche publiée : revue transactionnelle, garde avant Storage, tests réels de concurrence/RLS ; SHA et résultats finaux consignés dans la PR |
| SEC-02 | Corrigé et testé côté code | En-tête réel, dimensions, MIME et limite communs ; 0134 est la migration existante, son état de production reste un relevé historique |
| UX-04 | Décision commerciale ouverte | Critères Elite / annonce du palier : `CommissionAnnonce`, modèle dormant 0108 et `docs/71` ; ne pas inventer les critères ou changer les taux |
| UX-05 | Corrigé localement dans le nouveau lot, validation finale attendue | Attestation avant le bouton, libellés visibles associés aux champs ; erreur globale annoncée et associée au formulaire, sans inventer de diagnostic serveur par champ |
| UX-06 | Corrigé localement sur les chemins du rapport, validation finale attendue | Asset et sa confirmation, flash et description IA traduits ; clés existantes réutilisées et trois messages de fichier ajoutés dans les quatre langues ; cliquet conservé |
| UX-07 | Opportunité de fiabilité 3G | Envoi direct signé existant ; pas de progression/reprise ni `accept` sur `UploadAsset`, message de taille générique ; aucune seconde chaîne Storage à créer |
| UX-08 | Opportunité produit | Ordre de l'espace connecté et poids des portes de création à arbitrer ; pas de nouvelle page vendeur parallèle |
| UI-01 | Opportunité UI | Petits textes/focus à reprendre dans les composants existants ; les mesures du 8 octobre n'ont pas été remesurées ici |
| RES-01 | Galerie corrigée ; complément local du lien dans le nouveau lot | Galerie et lien « Lire les règles » portent `min-h-11` ; aucune nouvelle mesure tactile réelle prétendue |
| RES-02 | Opportunité performance | Imports clients statiques encore présents ; poids actuel non remesuré, optimisation à valider par mesure avant/après |
| SEC-03 | Corrigé localement dans le nouveau lot, validation finale attendue | Brouillon et flash : message traduit, aucun détail SQL client ; journal limité au code d'erreur. L'erreur d'INSERT ambiguë n'affirme pas que rien n'a été enregistré |
| SEC-04 | Corrigé localement dans le nouveau lot, validation finale attendue | Prix du brouillon borné à la capacité `integer` après arrondi ; zéro conservé et aucun plafond commercial ajouté. Flash : unités `integer`, prix `bigint` limité à la précision sûre JS, date représentable avant accès DB |
| SEC-05 | Corrigé et testé | Compte actif pour suppression, budget galerie existant ; le complément vidéo de #390 ferme aussi les demandes non confirmées |
| UX-09 | Opportunité de feedback | Statut de revue visible après retour ; message explicite de succès encore à ajouter si retenu |
| UI-02 | Corrigé localement dans le nouveau lot, validation finale attendue | `UploadAsset` distingue message de danger/`alert` et succès/`status` ; aucun changement de protocole d'envoi |
| UI-03 | Corrigé localement dans le nouveau lot, validation finale attendue | Flèche `→` sur le lien interne physique ; aucun nouveau parcours |
| UI-04 | Opportunité éditoriale | Harmonisation vouvoiement/graphie kreyòl à vérifier dans le dictionnaire ; aucune clôture textuelle globale prétendue |
| RES-03 | Opportunité à borner par le volume | Galerie déjà lue en parallèle ; liste vendeur encore sans pagination, plusieurs autres lectures séquentielles ; ne pas confondre avec la correction d'export #395 |

### 12.3 Reste de sécurité opérationnelle du schéma

**Défaut confirmé, nouveau lot en cours :** une version pré-0151 de
`zabelie_objets_requis()` peut rendre uniquement ses anciens objets tous
présents. `verdictObjets` annonçait alors un schéma complet, bien que cette
réponse ne dise rien des sept objets Stripe. Le repli registre n'exigeait que
0046. Une sonde de disponibilité publique verte ne démontre pas la présence
du nouveau RPC.

Le correctif local réutilise `lib/schema-requis.ts` et sa suite existante :
ancienne sonde ou résultat indécidable → `indetermine`, objet explicitement
absent → `manquant`, présence de tous les objets attendus → `ok`. Les
diagnostics explicites des objets historiques restent conservés. Le helper
pur `verifierPresenceObjets` permet à une route de vérifier son seul
sous-ensemble de dépendances, sans lui imposer Stripe. Le verdict admin et le
registre contrôlent aussi 0152 et ses quatre gardes média ; la liste exportée
`OBJETS_MEDIAS_0152` est partagée avec les routes. Sans présence attestée de
ces gardes, une mutation de couverture, photo ou vidéo peut répondre 503
avant Storage : la fusion du code ne dispense pas de sa dépendance de schéma.
La forme
`source/statut/message` de `schemaRequis` et le HTTP de `coherence` sont
conservés ; `readyz` reste une sonde de disponibilité des catégories.

Preuve locale avant correction : 18 tests exécutés, 5 échecs comportementaux.
Une seconde reproduction 0152 a fait échouer ses deux cas avant correction.
Après correction : 23 tests de schéma réussis. L'ensemble ciblé final de 13
suites compte 112 tests réussis, aucun échec ni test ignoré : schéma et sa
couverture, migrations, brouillon, flash, IA/facturation, cliquet i18n, gratuit,
acceptations, service jour même, choix des types vendeur et discipline des types.
Les refus SQL traduits sont exercés dans les quatre langues sur les vraies
routes flash ; les corps JSON incompatibles, dates non représentables et
débordements techniques sont refusés avant accès DB. Ce résultat local ne remplace
pas la validation globale et le SHA final à consigner dans la PR du nouveau lot.
Il n'affirme pas que 0151 ou 0152 manque en production et n'applique aucune migration.

Le relevé public anonyme livré séparément (`cloture-pages-publiques.json`)
porte sur 60 URL : 59 réponses 200 et l'alias 307 relatif attendu, aucun titre
manquant et un H1 par document HTML ; robots et sitemap répondent 200.
Ce contrôle HTTP ne remplace ni les parcours connectés ni une relecture de base.

Le sitemap annonçait encore `/fr/categories` et `/ht/categories` quand le
répertoire vide portait `noindex`. Le lot réutilise `rayonsPeuples` et la
lecture existante du menu pour omettre ces entrées. Quatre appels au vrai
générateur couvrent vide, rayons vides, rayon peuplé et panne ; trois cas
échouaient avant correction. Les autres routes statiques restent disponibles.

#### Contrat du lot : revue des médias et conservation des fichiers

`0152_zabelie_product_media_review.sql` étend le garde de galerie existant
aux INSERT/UPDATE/DELETE, sous verrou du produit. Ajout/retrait d'un média
ou changement effectif de couverture remet atomiquement une fiche publiée
en brouillon ; les fiches archivées refusent ces mutations. Les quotas
existants de six photos et une vidéo sont comptés après verrouillage.
Les livrables et versions numériques immuables gardent leurs mécanismes.
La couverture reçoit un chemin UUID neuf, sans écrasement, et partage la
cadence de galerie. Le vendeur est averti et le statut est rafraîchi après
les quatre mutations de galerie ; les contrôles archivés sont désactivés.

Les quatre attestations 0152, dont les triggers actifs et leurs événements,
sont exigées avant toute opération Storage. Sans migration attestée, les
mutations répondent 503 ; leur lecture reste disponible. L'application de
0152 doit être planifiée et validée séparément avant la mise en service du
code. Elle n'est pas effectuée ici ; le fichier de migration est la source
de ce lot, sans régénération globale du vieux `schema.sql`.

Le retrait ne détruit plus l'objet Storage : une ancienne confirmation vidéo
peut réattacher ce chemin après DELETE. Cette course a été reproduite sur
les deux vraies routes avec E/S factices. Une simple relecture d'absence ne
la ferme pas. Les réponses d'écriture incertaines conservent aussi les
objets ; un retrait de fiche n'est donc pas une garantie d'effacement de
l'ancienne URL publique. Aucun quota commercial global ou nettoyage général
n'est ajouté : le manifeste paginé de `storage-recovery` existe déjà, et les
purges KYC/Authoring gardent leurs propres règles.

Le dépôt KYC avait la même ambiguïté après sa RPC : une transaction pouvait
committer après la relecture vide qui autorisait la suppression. Le lot
conserve le fichier sur réponse inconnue, invalide ou contradictoire et
répond 503. Seul un refus métier conclusif avant INSERT, ou `PGRST202` avant
dispatch, permet le nettoyage. Les 23 tests KYC passent ; trois régressions
étaient démontrées avant correction. Le rejeu média contre `56b76a6` fait
échouer 12 cas sur 44 ; les six nouveaux parcours navigateur passent sans
retry. Les preuves finales SQL et le SHA du lot sont à lire dans sa PR.

Les verrous ordonnent les commits de publication et de révision ; ils ne
prouvent pas que l'écran de l'administrateur affichait la même révision au
clic. Aucune version attendue ni nouveau moteur de modération n'est inventé.

#### Complément de validation navigateur

Le parcours de tarification pouvait remplir le champ Prix de l'ancienne
instance pendant la navigation vers Service ; son remplacement effaçait
ensuite cette saisie. La course a été reproduite en retenant la réponse de
navigation, puis le test attend le titre et le contrôle propres au service.
Les montants attendus restent identiques ; aucun retry ni délai arbitraire
n'est ajouté. Les huit parcours de cette suite passent localement.

Le contrôle des ventes flash a révélé un défaut d'hydratation réel :
`FlashCountdown` calculait le premier texte avec deux `Date.now()` distincts,
côté serveur et navigateur. Deux horloges séparées de sept secondes suffisent
à faire échouer le test de rendu ; les cas navigateur décalé et déjà expiré
reproduisent l'erreur React. Le correctif rend le premier HTML déterministe,
puis utilise l'horloge cliente avec un instantané stable et un abonnement
nettoyé au dernier démontage. Les assertions `pageerror` sont conservées.
La fenêtre de prix reste contrôlée par le serveur au checkout.

La [PR #396](https://github.com/eliezerphilippe0-spec/Zabelie-Digi/pull/396)
porte le SHA et les résultats globaux de ce lot, ainsi que les limites de
mise en service ; son ouverture n'applique aucune migration.

### 12.4 Réserves d'exploitation et décisions : aucune activation implicite

| Sujet | Ce qui existe / reste à prouver | Décision ou preuve attendue |
|---|---|---|
| Stripe 0151 | Reçus et garde dormante livrés ; pas de procédure de résolution/dégel implémentée, file toujours en revue humaine | Checklist de mise en service dans `docs/28` ; application vérifiée, cinq événements configurés et test signé isolé ; décision humaine avant tout gel |
| Juridique et fonds | Clauses techniques, conservation KYC et acceptations codées ; identité/adresse de l'exploitant, qualification des fonds/BRH et garanties contractuelles ne se déduisent pas du dépôt | Faits du porteur et validation du conseil ; rétention au-delà de J+7 dormante selon `docs/26` |
| Rails et recette réelle | Checkout, rapprochement et protocole `docs/22` existent | Configuration et première vente/remise/versement/remboursement avec acteurs et montant autorisés ; aucune recette réelle exécutée par cette clôture |
| Cadence de rapprochement | Workflow facultatif toutes les cinq minutes et bail existants, cron quotidien de secours | Vérifier activation et exécutions dans le cadre autorisé ; ne pas recréer un ordonnanceur ni promettre une cadence exacte |
| Notifications, alertes et scanner | Outbox, expéditeurs, indicateurs de présence de configuration, scanner et tests synthétiques existent | Fournisseurs, clés, domaine d'envoi, hébergement et preuve réelle d'acheminement/analyse ; ne pas créer une deuxième file à partir de M1 historique |
| Sauvegarde et reprise | Scripts de sauvegarde/Storage et restauration synthétique en CI existent | Copie chiffrée indépendante et restauration réelle isolée chronométrée ; RPO/RTO à mesurer ; CI fictive ne clôt pas cette réserve |
| Prévisualisations | Aucun accès de configuration effectué ici | Vérifier séparation Preview/Production avant tout essai connecté ; absence de preuve ne signifie pas fuite établie |
| Catalogue et exploitation humaine | Publication, métriques géographiques et entonnoir admin existent ; couverture visiteurs/conversion encore partielle | Vraies offres, vendeurs, routine quotidienne et second opérateur à fournir/organiser ; aucun produit, avis ou chiffre fictif |
| Opportunités de docs/72 | Push, instrumentation complémentaire et seuils antifraude proposés | Besoin, collecte minimale et paramètres à décider avant un nouveau lot ; ne pas recréer les mesures admin existantes |

**Frontière de clôture.** Les six lots fusionnés sont livrés et testés. SEC-01,
la vérification des dépendances et les corrections secondaires nommées sont
proposés dans la PR #396 ; son SHA et sa CI font foi avant validation humaine.
Les réserves et les améliorations non réalisées restent explicitement ouvertes ; les
opportunités ne sont pas transformées en engagement. L'application de 0151,
l'activation du gel, les données de production, les paiements réels et les
décisions commerciales/juridiques ne sont pas exécutés par cette section.
`0056` reste volontairement gelée ; cette clôture ne recommande pas de l'appliquer.

## 13. Reprise du formulaire fichier/service — 20 octobre 2026

Le lot étend `PublishForm` dans `/vendre` pour les fichiers et services, en
réutilisant `useSessionDraft`, `purgerBrouillons` et `POST /api/products`.
`lib/publish-draft.ts` borne et valide le brouillon ; les messages de
`lib/publish-draft-copy.ts` couvrent les quatre langues. Aucun second éditeur,
service de stockage ou chemin de création n'est ajouté.

Les trois cartes « Nouveau produit » et « Changer de type » utilisent des
liens natifs `<a>`. Avec Next 16.4.0, le retour fichier → service → fichier
dupliquait l'ancre en `#formulaire#formulaire` malgré un `href` correct.
Le chargement complet du document lors de ces changements est accepté ;
les modifications du brouillon sont écrites synchroniquement dans l'onglet.

Les champs restent dans le `sessionStorage` de l'onglet pendant 30 minutes,
durée contrôlée à la restauration. Le contenu restauré est traité comme une
entrée non fiable : version, forme, tailles, compte et type sont vérifiés ;
les catégories sont rapprochées de la taxonomie active. La clé et le montage
du formulaire sont isolés par compte et `kind`. La purge existante retire les
champs des autres comptes, ou tous ces champs après déconnexion, au premier
affichage de l'en-tête correspondant. Aucune attestation n'est conservée :
l'acceptation des règles doit être cochée à nouveau.

Un booléen de vérification sans texte privé utilise le préfixe séparé
`zabelie:publish-review:v1:`. Comme les marqueurs du checkout, il survit à
l'expiration des champs et à leur purge lors d'un changement de compte ou
d'une déconnexion. Il est posé avant le POST. Seul un succès explicite valide
efface le brouillon et ce marqueur ; une réponse ambiguë bloque une nouvelle
création et invite à vérifier « Mes produits », puis à reprendre manuellement.
Aucun renvoi automatique n'a lieu au rechargement. Les refus conclusifs avant
INSERT permettent de corriger la saisie. Le paramètre facultatif
`expectedActorId` est comparé à l'identité Auth par la route existante avant
la création ; il ne remplace ni l'authentification ni les contrôles serveur.

Cette reprise n'apporte pas d'idempotence SQL ni de coordination entre
plusieurs onglets. Elle ne garantit pas une récupération après fermeture de
l'onglet ou refus du stockage : un message demande alors de garder la page
ouverte. Les marqueurs locaux ne prouvent jamais l'absence d'un produit en
base.

Validation locale : suite unitaire à 2 183 tests passants, puis 26 tests ciblés
repassés après les derniers ajustements ; build TypeScript réussi, lint sans
erreur ni nouvel avertissement, 88 paires de contraste conformes. Chrome a
passé 14 parcours sans retry (11 de reprise et 3 modèles de services existants),
dont les deux slugs limites du générateur serveur, à 390 et 1 280 px sans
débordement horizontal ni erreur JavaScript. Les POST navigateur sont simulés ;
les quatre tests de route exécutent le handler avec son helper substitué.
La CI du SHA de la PR reste la preuve de validation globale, notamment pour
les consommateurs checkout du hook partagé. Aucune migration, action sur les
données de production ou paiement réel n'est exécuté par ce lot.

## 14. Support — identité du formulaire (21 octobre 2026)

Un formulaire resté ouvert pour A pouvait transmettre son texte privé sous
l'identité de B après un changement de session, lorsque B était lui aussi
participant à la commande ou administrateur. Les gardes de participation et
de rôle étaient correctes ; elles ne reliaient pas l'envoi à l'identité
affichée lors de la saisie. Le défaut a été reproduit avec le vrai composant
et les vrais handlers, en remplaçant uniquement leurs E/S.

Le lot étend `SupportCaseForm`, `supportInput`, `caseUpdateInput` et les
routes `POST /api/support/cases` et `POST /api/admin/support`. Le paramètre
facultatif `expectedActorId` doit correspondre à la session vérifiée avant
création d'un client privilégié, limiteur, audit ou RPC. Son absence conserve
la compatibilité des anciens clients ; ce paramètre ne confère aucun droit.
L'identité de l'auteur provient toujours de la session, avec les contrôles
participant, admin/MFA et SQL existants.

Le formulaire attend la restauration effective de `useSessionDraft`. Sa clé
React inclut acteur, commande et mode ; les réponses tardives d'un exemplaire
démonté ne doivent ni effacer un nouveau brouillon ni rafraîchir une autre vue.
La clé de sessionStorage, la durée de 30 minutes, les requestId et les messages
traduits restent ceux de l'existant. Le lot n'ajoute aucune purge de support.

Les trois tables de `0113`, le dossier unique par commande, les messages
append-only et le rejeu exact par acteur/requestId sont réutilisés. Aucun
nouveau moteur de support, endpoint applicatif, objet SQL ou service externe.

Contrepreuves navigateur sur `e9812ac` : les deux envois sous une autre
identité autorisée renvoient 200 et enregistrent le texte de A sous B ; une
réponse ancienne, après navigation React aller-retour, efface le nouveau
brouillon au rechargement. Auth/REST/RPC restent simulés en boucle locale ;
le cas tardif reçoit la vraie réponse réseau avant de retenir sa résolution
JavaScript. Le rejeu navigateur vérifie le même requestId et un message dans
le stub ; il ne constitue pas une nouvelle preuve d'idempotence SQL.

Validation locale : 2 191 tests unitaires passants, 19 cas de routes support
revérifiés sur leur état final, compilation TypeScript réussie, lint sans
erreur ni nouvel avertissement (10 avertissements préexistants sous Windows)
et 88 paires de contraste conformes. Les 11 parcours support passent sans
retry : les quatre existants, les changements d'identité en quatre langues
à 360 px et en administration à 1 280 px, le rejeu après réponse perdue et
la réponse tardive après navigation. Captures mobile/desktop relues et
relecture indépendante sans blocage ; la CI globale du commit reste requise.

La validation définitive du SHA est portée dans la PR ; aucun merge,
déploiement, accès aux données de production, migration ou paiement réel
dans ce lot.
