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

## 15. Création physique — réponse perdue (21 octobre 2026)

Inventaire repris sur `main a5a5001`, après fusion de #398 : formulaire et
page physiques, POST `/api/products/physical`, route de photo `cover`, tables
produit/extension/variantes/stock/fitment de `0036` et caractéristiques de
`0074`, tests physiques et mécanisme de publication de #397 existent. Aucun
équivalent ouvert parmi les PR ; seules #385–#387 concernent les dépendances.

P1 confirmé avec le vrai composant et le vrai handler, E/S substituées : le
POST termine ses écritures, la réponse se perd, `createdProductId` reste nul
dans le formulaire et le clic suivant crée une seconde fiche. La reprise de
photo, une fois l'identifiant confirmé, réutilisait déjà la même fiche.

Le lot étend ce formulaire et réutilise `publishReviewKey`, `useSessionDraft`
et les messages de vérification existants. Seul un booléen de prudence est
gardé dans la session, par compte/type, sans expiration automatique ; aucune
photo, saisie physique ou attestation n'est sauvegardée. Le marqueur est
écrit avant POST. Une réponse indécidable bloque une nouvelle création après
rechargement jusqu'à vérification de Mes produits et acquittement explicite,
qui remet l'attestation à faux. Ce n'est ni une clé d'idempotence SQL ni une
coordination entre onglets. Un stockage refusé ne garantit pas la reprise.

La page remonte le formulaire par compte, qui transmet `expectedActorId`.
Le POST compare cette précondition facultative à l'utilisateur Auth, après
les contrôles existants de suspension/acceptation légale et avant les effets
métier (cadence, attestation, lectures produit, INSERT). Les lectures internes
du compte restent prioritaires. Les anciens clients restent compatibles ;
la session reste la seule source d'identité et de propriété.

La frontière de refus demeure prudente : 400/401/403/429 précèdent INSERT et
autorisent une nouvelle saisie ; 422 peut provenir du fitment après INSERT,
avec DELETE de compensation non confirmé. Il reste indécidable, comme 5xx,
perte réseau ou succès mal formé. L'identifiant confirmé doit être un UUID
valide ; la reprise de photo réutilise ce produit et les callbacks démontés
ne doivent plus naviguer ou réécrire l'état local.

Validation locale : 2 201 tests unitaires passants (+10 handlers physiques),
compilation TypeScript réussie, lint sans erreur ni nouvel avertissement,
88 paires de contraste conformes. Les neuf nouveaux scénarios navigateur
passent avec les trois parcours vendeurs par type et les dix parcours de
confiance existants, en parallèle à deux workers et sans retry (22/22).
Les deux mocks photo de succès sont alignés sur le contrat API complet
(`ok`, `productId`, `slug`), sans affaiblir les assertions de reprise.
Avant correction, le vrai POST terminé puis
perdu crée deux UUID après rechargement ; après correction, un seul produit,
avec vérification exigée et nouvelle attestation après acquittement. Les
relectures runtime et tests ne trouvent aucun blocage ; Auth/REST/Storage
sont doublés localement, les refus ambigus sont injectés après un vrai 200.

Les détails avant/après, leurs limites et la CI du SHA final sont portés
dans la PR. Aucune nouvelle table, migration, route applicative, dépendance,
écriture de production ou paiement réel ; validation humaine sans fusion
ni déploiement dans ce lot.

## 16. Rabais — type du prix JSON (21 octobre 2026)

Inventaire sur `main 762b496`, après #399 : `RabaisManager` envoie un nombre
JSON à POST `/api/products/discount` et retire le barré par DELETE sur la même
route. Les quatre RPC de `0075`/`0109`, avec les gardes de `0112`, contrôlent
la propriété, la baisse stricte, les variantes et le flash actif ; elles
modifient les tables produit/variantes existantes. Le prix barré vient du
prix pratiqué, jamais d'un champ client. `tests/rabais.test.ts`, les tests SQL
rabais et les trois parcours de `playwright.rabais.config.ts` existent déjà.
Les seules PR ouvertes à l'inventaire sont #385–#387 de dépendances.

P1 confirmé par le vrai handler avec E/S simulées : `Number(newPriceHTG)`
transforme `true`, `[1]` et `[[1]]` en 1 HTG, avant une RPC produit ou variante.
Les gardes SQL voient ensuite un prix numériquement valide et ne peuvent plus
reconnaître le type JSON original. Aucun accès à la production ni incident
réel n'est déduit de cette contrepreuve locale.

Le correctif exige un prix JSON de type nombre, entier positif, sûr et dans
la capacité existante de 2 147 483 647 HTG. Les chaînes numériques, booléens,
tableaux et objets sont refusés ; le nombre 1 demeure valide. POST et DELETE
refusent aussi les corps non objets et les identifiants invalides avant le
client métier et les RPC, en réutilisant `UUID_RE`. L'identité vient toujours
de la session ; Auth et les contrôles existants de compte restent prioritaires.
Leurs lectures internes ne sont pas supprimées.

La route, les règles SQL, les paramètres des quatre RPC, les messages et les
réponses métier sont réutilisés. Aucun autre endpoint de prix, interface,
objet SQL, migration, dépendance ou moteur de rabais n'est ajouté. Les tests
du handler et les parcours existants doivent conserver les montants valides,
le retrait du seul barré et les refus métier. La validation finale du SHA sera
portée dans la PR de revue humaine, sans fusion ni action de production.

Validation locale ciblée : 27 cas unitaires passent (18 nouveaux, quatre
rabais existants, cinq cliquet i18n), ainsi que quatre E2E sans retry sur un
build neuf. Le cas HTTP négatif lit la variante inchangée après chacun des
quatre corps coercibles ; les parcours existants conservent prix affichés,
prix commandés et retrait du seul barré à 390/1 280 px. Avant correction,
le booléen obtenait HTTP 200 et modifiait réellement le prix du stub de 2 000
à 1 HTG. Compilation TypeScript, lint sans nouvelle alerte et 88 paires de
contraste passent ; relecture indépendante sans blocage. Les résultats
unitaires et CI globaux sont à lire sur le SHA final dans la PR.

Le premier run CI échoue avant les rabais dans l'attente d'un ancien parcours
physique. Une sonde DOM contrôlée reproduit un interleaving du helper : le
champ disparaît entre la lecture de l'alerte et `isEditable`, empêchant de
relire l'alerte déjà visible. Une attente unique sur l'union des deux cibles
remplace ce poll ; le titre doit être activé et non readonly. Aucun délai,
retry ou contrôle métier n'est assoupli, et aucun formulaire n'est modifié.
Cette stabilisation ajoute uniquement un second fichier E2E au périmètre ;
les neuf parcours physiques et la CI finale restent à confirmer sur leur SHA.

Après cet ajustement de test, la sonde positive/négative et les neuf parcours
physiques passent sans retry à deux workers, dont les cas EN/ES auparavant
en échec. Types, lint ciblé et 29 tests ciblés sont verts ; aucun runtime ni
build applicatif supplémentaire n'a été modifié. La CI finale du nouveau
commit est la preuve globale attendue dans la PR.

## 17. Profil public — identité attendue du formulaire (21 octobre 2026)

Inventaire repris sur `main d9b8e52`, après #400 : l'unique appelant
`/tableau-de-bord/boutique`, `ProfileForm` et POST `/api/profile` existent.
La route utilise `auth.getUser()`, UPDATE `profiles` sous RLS puis attribution
du slug best-effort. Nom réservé, géographie et cohérence de zone restent
portés par leurs validations et les migrations `0015`, `0045`, `0069`, `0083`
et leurs tests existants. Aucun doublon parmi les PR ouvertes #385–#387 de
dépendances ; #397–#400 corrigent d'autres parcours.

P1 confirmé avec le vrai composant et le vrai handler, E/S locales doublées :
un formulaire du compte A reste ouvert, la session devient B, puis les champs
A écrasent le profil B et alimentent son attribution de slug. Le filtre
`id = user.id` continue de fonctionner ; ce défaut d'intention après changement
de compte ne démontre aucun contournement RLS ni incident réel en production.

La page transmet désormais `actorId` et remonte le formulaire par `key=user.id`.
Le composant envoie `expectedActorId`. La route valide cette précondition
facultative avec `UUID_RE` puis la compare à l'utilisateur vérifié, avant
toute UPDATE, client métier de slug ou attribution. Identité différente : 403 ;
identité mal formée ou corps non objet : 400, avec les traductions existantes.
Auth reste prioritaire et la propriété continue de provenir de la session.
Un ancien client sans précondition conserve son contrat ; cette compatibilité
ne garantit pas l'intention d'un formulaire externe qui ne transmet aucun ID.

Aucun stockage, brouillon, RPC, endpoint applicatif, objet SQL, migration ou dépendance
ajouté. Les validations de nom/géographie, les erreurs ZB069 et le caractère
best-effort du slug sont conservés. La proposition de zone du même composant
reste hors de ce petit lot ; aucune protection de tous les formulaires n'est
revendiquée.

Les quinze nouveaux tests exécutent le vrai handler avec E/S doublées : 11
passent avant correction et quatre échouent comme attendu (changement de
compte, types d'identité, null et traductions des refus). Après correction,
52 tests ciblés passent avec les tests existants de profils, zones et slug.

La contrepreuve navigateur sur l'ancien build obtient 200, une UPDATE de B
et une attribution de slug B avec les champs A ; A reste inchangé. Les six
parcours finaux passent ensuite en 29,3 s à deux workers sans retry : refus 403
visible dans les quatre langues à 360 px sans aucun effet de profil/slug,
succès par compte et compatibilité historique à 1 280 px, puis changement SSR
vers B après une vraie sauvegarde A dont seule la livraison JS est retardée.
Le marqueur de document et la réponse RSC empêchent un faux vert par reload.

Le test de remontage est éprouvé séparément : retirer seulement `key=user.id`
et reconstruire laisse les champs A après ce refresh B ; le test échoue
précisément sur ce nom, après succès du POST et des témoins document/RSC.
La clé est restaurée, les empreintes des trois sources runtime correspondent
à celles de la suite unitaire, et un nouveau build précède les six cas finaux.

Validation locale globale : 2 234 unitaires sans échec/ignoré/annulé, types et
build réussis, contraste 88/88, lint sans erreur ni nouvelle alerte et lint
ciblé sans avertissement. Captures mobile/desktop relues ; pageerror,
console, overlay et débordement contrôlés. Les erreurs console 403 attendues
des requêtes volontairement refusées sont distinguées des erreurs inattendues.
Relectures indépendantes sans blocage ; la CI exacte du SHA final est portée
dans la PR de validation humaine. Aucune fusion, mise en production, écriture
sur des données réelles ou paiement réel dans ce lot.

## 18. Création numérique — type du prix JSON (21 octobre 2026)

Inventaire repris sur `main 9574764`, après #401 : `docs/26` §0, POST
`/api/products`, helper `creerBrouillonProduit`, soumission Studio, formulaires,
tables et tests existants. Les PR ouvertes #385–#387 concernent les dépendances
et #402 un skill distinct ; aucun correctif équivalent de création numérique.
Les deux appelants inventoriés transmettent déjà un nombre JSON : `PublishForm`
convertit son champ et le Studio valide `entree.prix` avant le helper partagé.

P1 de validation monétaire confirmé avec le vrai POST et le vrai helper,
contre un stockage local doublé : `Number(priceHTG)` transforme `false`, `null`
et `[]` en zéro, puis crée une fiche à zéro HTG. `true`, `[1]` et les chaînes
numériques sont aussi convertis. La fiche reste en brouillon pour revue
humaine ; cette contrepreuve ne démontre ni mise en vente automatique,
contournement RLS, ni perte réelle en production.

Deux lignes du helper changent : le prix est conservé tel que reçu et son
type doit être `number`, avant normalisation de catégorie, client métier,
attestation, cadence, promotion de profil et INSERT. Les types non numériques
reçoivent le refus 400 traduit existant. Les contrôles de session et de compte
restent prioritaires dans les routes ; aucune seconde règle n'est ajoutée au
Studio qui valide déjà ce type.

Le nombre zéro, les fractions numériques avec `Math.round` et la capacité
integer après arrondi sont conservés exactement. Ainsi `0.4` reste arrondi à
zéro et `2147483647.4` à la borne existante : ce lot ne change pas la politique
de gratuité ni d'arrondi. Création physique, stocks, délai de service et
proposition de quartier restent hors portée. Aucune route, table, migration,
dépendance ou traduction ajoutée.

Dix tests ajoutés au fichier d'extraction existant exécutent le vrai helper
pour fichier et service, avec une fixture neuve par valeur. Avant correction,
six nouveaux cas échouent comme attendu ; les contrôles déjà refusés passent.
Après correction, 31 tests ciblés passent avec les routes numérique et physique
existantes. Les refus vérifient l'absence réelle de requêtes, RPC et autres
E/S métier ; les nombres valides vérifient une seule INSERT en brouillon,
le vendeur, le prix arrondi et l'attestation unique.

Trois cas sont ajoutés au fichier de mise en ligne existant, sans configuration
ni fixture nouvelle. Ils passent par le vrai POST, relisent les fiches du
stockage doublé après chaque refus et contrôlent les prix numériques sauvegardés.
Avant correction, le premier booléen obtient HTTP 200 et une fiche à zéro,
ce qui fait échouer l'attente 400. Les trois parcours antérieurs de création,
modération et Studio restent dans cette même suite. La validation locale
globale et la CI du SHA final sont consignées dans la PR de revue humaine.
Aucune fusion ni action de production, donnée réelle ou paiement réel dans ce lot.

Validation locale finale : 2 244/2 244 unitaires, sans échec, ignoré ou annulé ;
six parcours navigateur, six tentatives, un worker et zéro retry en 27,6 s.
Les douze POST invalides sont refusés sans INSERT ; les six témoins numériques
et les trois parcours antérieurs passent. Types, build et contraste 88/88
réussissent ; lint sans erreur ni nouvelle alerte (dix existantes sous Windows),
lint ciblé sans avertissement. Relectures indépendantes du runtime, du harnais
et de la documentation sans blocage. La CI globale reste à confirmer sur le
SHA final dans la PR.

## 19. Création physique — type JSON des prix (22 octobre 2026)

Inventaire repris sur `main 6477600`, après #403 : docs/26 §0, route physique,
unique formulaire appelant, tables `products`, `zabelie_physical_products`,
`zabelie_product_variants`, `zabelie_stock`, catégories et tests existants.
Le formulaire sérialise déjà des nombres pour le prix produit et les variantes.
Les PR ouvertes #385–#387 concernent les dépendances, #402 un skill distinct ;
aucun correctif équivalent. #399 protège la reprise de création et #403 les
prix numériques/digitaux : ces mécanismes ne sont pas reconstruits.

P1 de validation monétaire reproduit par deux vrais POST locaux avec services
Auth/PostgREST doublés : `true` devient 1 via `Number()`. Pour le prix produit,
HTTP 200 crée une fiche à 1 HTG, son extension, sa variante par défaut et son
stock. Pour le prix d'une variante, HTTP 200 crée le produit à 1 500 HTG mais
sa variante à 1 HTG avec le stock demandé. Les fiches restent en brouillon
pour revue humaine ; aucune vente automatique, perte réelle ou violation RLS
n'est déduite de cette preuve. Les contraintes SQL reçoivent déjà le nombre
converti ; cette contrepreuve locale ne prétend pas éprouver ces contraintes.

Quatre lignes applicatives changent dans la route existante : chaque prix
reste tel que reçu, et le garde exige `typeof ... === "number"` avant les
contrôles integer et minimum existants. Les refus gardent HTTP 400 pour le
produit, 422 pour une variante, ainsi que leurs messages. Aucun nouvel arrondi,
plafond commercial ou helper parallèle. Les entiers positifs valides, y compris
1 HTG, les prix sauvegardés et la variante par défaut restent identiques.
Les chaînes numériques d'un client externe sont désormais refusées ; aucune
exigence de ce format n'a été trouvée dans les appelants inventoriés.

Les effets antérieurs restent à leur place : Auth, compte, identité attendue,
client admin et cadence précèdent le refus du prix produit ; attestation et
lecture catégorie précèdent aussi le refus d'une variante. Aucune INSERT de
produit, extension, variante ou stock ne doit avoir lieu après ces refus.
Quantités, dimensions, compatibilité véhicule et politique d'arrondi numérique
restent hors portée ; aucune nouvelle route, table, migration, fixture,
configuration, dépendance ou traduction. Aucune fusion ni action de production,
donnée réelle ou paiement réel dans ce lot.

Huit cas sont ajoutés au fichier de tests du vrai handler : trois échouent
avant correction comme attendu, quinze des dix-huit passent. Le contrôle d'une
variante invalide placée après une variante valide empêche un faux vert limité
au premier élément. La fixture existante renvoie désormais chaque ID/position
créé, puis les tests vérifient chaque prix, position et quantité de stock.
Après correction, 46 tests ciblés passent avec spécifications physiques et
routes numériques existantes. Les assertions vérifient événements et requêtes
réelles du double, ce qui détecte aussi une INSERT suivie d'une compensation.

Trois cas HTTP sont ajoutés au fichier de reprise physique existant, sans
fixture ni configuration nouvelle. Deux rouges avant correction relisent les
produits/extensions/variantes/stocks, puis échouent sur 200 au lieu de 400/422.
Les témoins numériques et les neuf parcours antérieurs restent dans la suite.
La validation locale globale et la CI du SHA final seront consignées dans la PR
de revue humaine ; aucune clôture de l'audit entier n'est revendiquée.

Validation locale finale : 2 252/2 252 unitaires sans échec, ignoré ou annulé ;
12/12 parcours physiques, douze tentatives, deux workers et zéro retry en
50,4 s. Les dix-huit refus n'écrivent aucune fiche, extension, variante ou stock ;
les six créations numériques témoins conservent leurs prix et quantités, puis
les neuf anciens cas passent. Types, build et contraste 88/88 réussissent ;
lint sans erreur ni nouvelle alerte (dix existantes sous Windows), lint ciblé
sans avertissement. Relectures indépendantes runtime/tests/documentation sans
blocage. Un premier typecheck a rencontré TS6053 car le build lancé en parallèle
régénérait `.next/types` ; le contrôle séquentiel après build passe sans retouche
du code ni de la configuration. Le journal initial est conservé comme raté
d'instrument. La CI globale reste à confirmer sur le SHA final de la PR.

## 20. Demande de quartier — identité du formulaire (22 octobre 2026)

Inventaire repris sur `main 8a6cbd5`, après #404 et sa CI main verte :
docs/26 §0, unique appelant `ProfileForm`, route `/api/zones/request`,
table/demandes modérées de 0070 et tests existants. Le profil reçoit déjà
`actorId` et se remonte sur changement d'utilisateur depuis #401 ; ce mécanisme
est réutilisé. Aucun doublon trouvé parmi les PR ouvertes #385–#387 et #402.
RLS, index anti-doublon pending, garde ZB070 et décision administrative finale
existent déjà : aucune table, migration, RPC ou voie admin n'est ajoutée.

P2 d'attribution reproduit avec le vrai formulaire : A le remplit, les cookies
deviennent ceux de B sans rechargement, puis le POST obtient 200 et inscrit
une proposition pending sous B avec le nom saisi par A. Les profils et zones
restent inchangés. Cette preuve locale observe les E/S du handler avec
Auth/PostgREST doublés ; elle ne démontre ni contournement RLS, ni création
automatique de quartier, ni incident de production ou paiement.

Le formulaire transmet désormais son `expectedActorId`. Après authentification
et lecture JSON, la route refuse une identité mal formée avec 400 et une
identité différente de la session avec 403, avant toute INSERT. Elle réutilise
UUID_RE et les traductions existantes. La session vérifiée reste seule source
de `requester` ; les champs requester/status envoyés par le client sont ignorés.
La précondition est facultative pour les anciens clients, qui restent liés à
leur session sans bénéficier de cette liaison à l'intention du formulaire.
Les corps non objets et champs non textuels sont refusés sans exception trim.
Les limites 2–80 caractères, le trim, les succès A/A et B/B et les réponses
23505→409, ZB070→400 et panne→500 conservent leur contrat existant.

Onze tests du vrai handler sont ajoutés aux sept contrôles existants. Avant
correction, cinq échouent comme attendu ; après correction, les 50 tests
ciblés passent. Le fichier navigateur existant garde ses six anciens parcours
et reçoit quatre refus multilingues à 360 px et un témoin A/A, B/B et client
ancien. Un mode facultatif du stub existant fournit deux zones fictives et
journalise token et INSERT par scénario isolé ; il ne simule pas la preuve
SQL de modération. La contrepreuve FR échoue sur 200 au lieu de 403 avant
correction, sans retry. Les refus doivent laisser journaux, profils et zones
inchangés ; les témoins doivent rester pending sous leur session.

Philippe autorise désormais les petits lots successifs, la validation technique
autonome et la fusion après revue/CI verte. Chaque lot conserve une PR et la
vérification du SHA exact avant fusion normale, puis des sondes publiques en
lecture seule. Aucun accès en écriture aux données réelles, paiement réel,
migration distante ou déploiement manuel ; aucune clôture de l'audit entier
n'est revendiquée. Les résultats finaux sont consignés dans la PR du lot.

Validation locale finale : 2 263/2 263 unitaires sans échec, ignoré ou annulé ;
50/50 ciblés. Les onze parcours profil passent en 43,6 s à deux workers, onze
tentatives et zéro retry : quatre refus quartier sans INSERT, trois demandes
autorisées, puis les six anciens cas profil. Aucun pageerror, console inattendue,
overlay ou débordement horizontal. Types, build et contraste 88/88 réussissent ;
lint sans erreur ni nouvelle alerte (dix existantes sous Windows), ciblé sans
avertissement. Relecture indépendante sans blocage ; CI du SHA final à vérifier
avant fusion, sondes publiques après le déploiement automatique existant.

## 21. Fermeture de compte — identité de l'écran (22 octobre 2026)

Inventaire sur `main da18726`, après #405 livré et vérifié : docs/26 §0,
DELETE `/api/account`, unique `AccountActions` et son montage sur la page
Compte, contrôles backend de compte/KYC/confidentialité et harnais existants.
Les cinq PR ouvertes lors de l'inventaire (quartier #405 alors en cours,
dépendances #385–#387 et skill #402) ne corrigent pas ce chemin. Les anciens
correctifs de fermeture/conservation et les registres d'API V1/vendeur sont
relus ; aucune intégration externe de fermeture sans corps n'est documentée.

P1 d'intégrité confirmé avec le vrai DELETE et le vrai écran, sur doubles
locaux uniquement : A ouvre Compte, les cookies deviennent B sans navigation,
le dialogue générique est confirmé, puis HTTP 200 ferme B. Avec quatre
compteurs fiables 0/0/0/2, le profil B est nettoyé et marqué account_closed,
ses données ciblées sont traitées, son Auth est anonymisé/banni puis déconnecté
globalement. Avec quatre zéros, Auth deleteUser(B) est appelé puis la session
est déconnectée. Les effets réels reçus par le stub sont vérifiés avant
l'assertion attendue 403 qui échoue. Aucune perte en production, violation RLS
ou action sur un compte réel n'est déduite de cette preuve.

L'écran reçoit désormais actorId depuis la session SSR et se remonte avec
key=user.id ; il transmet expectedActorId dans le DELETE JSON. Après Auth,
avant même createAdminClient, la route exige un objet et un UUID attendu :
absence ou format invalide →400, divergence avec user.id →403. La session
vérifiée reste seule source du compte cible. UUID_RE et les traductions déjà
importées sont réutilisés ; aucun nouvel état global ou effet React ajouté.

La précondition est obligatoire pour cette action irréversible. Un ancien
JavaScript sans corps pouvait encore fermer B si le garde restait facultatif.
Faute de contrat externe imposant ce format, corps absent/vide, objet vide ou
autre objet sans identité sont maintenant refusés avant tout effet ; recharger
l'écran fournit le nouveau protocole. Les scénarios métier antérieurs sont
adaptés à ce protocole avec une vraie Request JSON et un UUID courant, sans
affaiblir leurs assertions de comptabilité, KYC, purge ou erreurs fiables.

Les quatre compteurs, leur vérification d'erreur/null, la suppression si tous
sont à zéro, l'anonymisation sinon, les filtres par utilisateur, les pages de
destinataires, la fermeture KYC, les reçus conservés, les métadonnées nettoyées
et la déconnexion globale restent identiques. Aucune nouvelle réauthentification,
règle de conservation, migration, table ou voie parallèle. L'export de données
et les coordonnées privées ne changent pas dans ce lot.

Le harnais existant observe désormais chaque ID Auth, filtre SQL, création
admin et signOut. Les deux branches et les identités concordantes A/A et B/B
restent témoins ; des cibles forgées ne changent pas le propriétaire. La version
finale des tests de contrat compte 21 cas, dont 13 anciens scénarios métier :
avant patch, six refus attendus rougissent et quinze cas passent. Auth absente
ou en erreur garde sa priorité sur JSON et identité ; les quatre traductions
existantes sont vérifiées. Les preuves initiales sont conservées séparément.

Le fichier navigateur et le stub A/B existants sont étendus par un mode
facultatif de fermeture, isolé par scénario. Ils observent les quatre compteurs
et les opérations reçues sans fabriquer un refus d'identité. Les onze parcours
profil/quartier sont conservés. La contrepreuve ancienne conserve aussi une
erreur CSP secondaire après succès, due à la divergence locale 127.0.0.1/
localhost lors du POST signout ; ce transport est diagnostiqué séparément,
sans modifier le serveur signout ou la politique CSP. Le premier run corrigé
conserve cette limite même sur localhost : son fetch suit un 303 vers HTTPS
local, sans serveur TLS. Le composant utilise désormais redirect:manual sur
ce seul POST, dont il ignore déjà la réponse, puis garde router.push('/') et
refresh. Le vrai POST serveur, sa révocation et ses cookies restent exercés.
Les témoins UI doivent observer le POST 303, l'accueil et les cookies Auth
absents ; aucun mock, réécriture de Location ou exception CSP n'est ajouté.
Le test de déconnexion existant vérifie toujours l'endpoint et la méthode POST,
en autorisant ces options supplémentaires. Les seules lectures SSR tardives
du journal d'observation sont distinguées de l'état métier, qui reste comparé
intégralement. Le run initial corrigé 15/18 est conservé comme diagnostic.

Le run suivant16/18 valide les quatre vrais succès UI, mais son contrôle de
console révèle les images fictives HTTP de l'accueil bloquées par img-src.
Le stub réutilise maintenant pour PRODUCT le même PNG dataURI déjà employé
par SHOP_PRODUCTS, centralisé sans double lecture ni copie de fixture. Le
point de service HTTP reste disponible ; la CSP et les contrôles console
restent stricts. Ce run intermédiaire est conservé séparément.

Validation locale finale : 2 271/2 271 unitaires, 59/59 ciblés métier voisins,
31/31 compte/déconnexion ; dix-huit parcours, dix-huit tentatives, zéro retry
en40,6 s. Quatre divergences403 et quatre anciens corps400 n'ont aucun effet ;
les quatre succès UI A/A et B/B exercent deux anonymisations, deux suppressions,
le vrai POST signout303, l'accueil et les cookies Auth absents. Annuler le
dialogue n'envoie aucun DELETE. Les onze anciens parcours restent verts.
Aucun défaut JS, console inattendue, overlay ou débordement ; captures360 et
1280 relues. Types, build et contraste88/88 passent ; lint sans erreur ni
nouvelle alerte (dix existantes Windows), ciblé sans avertissement. La preuve
navigateur utilise Auth/PostgREST fictifs ; elle ne démontre pas les cascades
ou la RLS SQL réelle. Les anciennes preuves rouges restent archivées.

Validation finale, revue indépendante, CI du SHA exact, fusion normale et
sondes publiques seront consignées dans la PR. Aucune donnée réelle, paiement
réel, migration distante ou déploiement manuel ; l'audit entier reste ouvert.

## 22. Coordonnées privées — identité du formulaire (22 octobre 2026)

Inventaire sur `main e764547`, après #406 fusionnée et publiquement vérifiée :
docs/26 §0, docs/35 V-5, unique POST /api/delivery-info et DeliveryInfoForm,
montage Compte, table/policies0076 et tests unitaires/SQL existants. Aucun
appelant externe de ce POST ni contrat d'API publique sans identité identifié.
Les PR ouvertes de dépendances et du skill distinct ne traitent pas ce chemin.
Aucun nouveau carnet, destinataire par commande ou service de livraison.

P1 d'intégrité/confidentialité confirmé localement : vrai écran Compte A,
trois saisies fictives privées, cookies devenus B sans navigation, puis vrai
POST200 et upsert sous le token de session B. Sa ligne B reçoit les trois
valeurs A ; la ligne A reste intacte. Ces effets sont vérifiés avant l'attente
403 rouge. La preuve ne démontre aucune lecture vendeur, violation RLS ou
fuite en production : seuls Auth/PostgREST sont doublés localement.

Une seconde contrepreuve emploie le vrai LangToggle FR→EN : réponse RSC200
text/x-component, nouvelle lecture SSR filtrée B et ses trois valeurs, titre
anglais et sentinelle du même document. Le formulaire conserve pourtant les
champs saisis sous A avant l'attente des valeurs B qui échoue. Le premier essai
de ce cas conserve son diagnostic CDP de corps indisponible ; les observations
serveur et document remplacent cette lecture de transport, sans mock RSC ni
reload complet. Aucun POST après ce refresh n'est exécuté sur l'ancien build.

Le formulaire reçoit désormais actorId et key=user.id depuis la page SSR ;
le POST envoie expectedActorId. Après Auth et forme JSON, avant normalisation
et upsert, UUID absent/mal formé →422, divergence avec user.id →403. UUID_RE
et traductions existantes sont réutilisés. La précondition est obligatoire :
les anciens écrans sans identité doivent être rechargés. L'identité attendue
n'est jamais utilisée comme user_id écrit ; cette propriété reste la session.

Les trois champs métier restent facultatifs ; identité valide seule ou
chaînes vides conserve l'effacement par null. Types textuels, trim, plafonds
120/30/240,400 JSON invalide,422 métier et503 table absente sont inchangés.
Le client de session et la RLS0076 restent en place. La lecture Compte reste
filtrée par user.id ; mes-ventes et la priorité des destinataires par commande
ne changent pas. Aucune nouvelle collecte, règle Auth, policy, table, migration,
RPC, dépendance ou infrastructure parallèle.

Le harnais livraison() existant observe deux UUID, deux lignes, Auth et upsert.
Les quatorze anciens cas gardent leurs assertions ; leurs corps métier portent
explicitement l'identité valide, tandis qu'envoyer(raw) reste brut. Cinq cas
complémentaires donnent avant patch19 tests,16 verts et3 rouges causaux :
écrasement B, objet sans identité et identité mal formée. Ces deux derniers
expriment le nouveau protocole requis, sans qualifier l'ancien effacement
documenté de défaut indépendant. Auth absente/erreur sans utilisateur reste
prioritaire ; aucune nouvelle sémantique Auth n'est imposée.

Le stub A/B et le fichier navigateur existants sont étendus en mode opt-in :
deux lignes et journaux des vrais GET/upserts, token et service-role observés,
aucune garde d'identité ou RLS simulée. Les dix-huit anciens parcours restent
conservés ; six nouveaux couvrent quatre langues, succès A/A et B/B, effacement,
anciens corps refusés et vrai refresh RSC B avant enregistrement B. L'état
entier est comparé hors seul journal de lectures diagnostique, sans masquer
les autres opérations. Les tests SQL existants restent la preuve des policies.

Validation locale finale :2 276/2 276 unitaires, sans échec/ignoré/annulé,
61/61 ciblés, dont19 cas livraison. Vingt-quatre parcours et24 tentatives,
deux workers, zéro retry en59,8 s ; les dix-huit anciens restent verts. Les
quinze POST livraison comportent quatre divergences403 et six anciens corps/
identités mal formées422 sans effet, puis cinq upserts autorisés : deux
sauvegardes A/A et B/B, deux effacements (vides et omissions), et le POST B
après vrai refresh RSC B, sans altération de A. Chaque token et propriétaire
correspond ; l'ID fourni comme cible forgée reste ignoré. Aucun défaut JS,
console inattendue, overlay ou débordement ; captures360/1280 relues. Types,
build et contraste88/88 passent ; lint sans erreur ni nouvelle alerte (dix
existantes Windows), ciblé sans avertissement. Revue indépendante sans blocage.

La première CI39806033558 sur3bc43eda est officiellement verte mais ne satisfait
pas la porte zéro retry :444 tests uniques,445 tentatives, un flaky ancien du
bandeau à1280px. Les24parcours d'identité passent directement. Une lecture CSS
ponctuelle reçoit une chaîne vide ; un remplacement de nœud pendant le montage
est compatible avec ce résultat, sans cause produit démontrée. La fusion est
suspendue. Les quatre assertions CSS de e2e/barre-annonce.spec.ts emploient
désormais toHaveCSS avec les mêmes propriétés/valeurs exactes et attente
standard ; aucun changement de composant, CSS, configuration, timeout ou
nombre de retries. Logs initiaux conservés ; répétitions ciblées puis nouvelle
CI sur la tête exacte sont exigées. Ce seul fichier de test étend le lot.

Les cinq cas bandeau passent ensuite chacun trois fois :15exécutions et
15tentatives, zéro retry/flaky/échec/ignoré en52,9 s. Les huit unités bandeau,
le contrôle des types et le lint ciblé passent ; aucun rebuild applicatif
n'est requis pour cette modification du test. La première preuve CI reste
archivée sous sa tête initiale, sans réécriture de son résultat flaky.

CI du SHA exact, fusion normale et sondes publiques seront consignées dans
la PR. Aucune donnée réelle, paiement,
migration distante ou déploiement manuel ; l'audit entier reste ouvert.

## 23. Pièces KYC privées — identité de l'écran (22 octobre 2026)

Inventaire sur main28d1b2ff, après #407 fusionnée et publiquement vérifiée :
docs/26 §0, docs/35 V-6, unique POST /api/kyc, KycForm et montage Compte,
bucket privé0079, RPC atomique0130, conservation0131, tests de dépôt et SQL
existants. Les PR325/396 traitent concurrence/conservation ; aucun contrat
externe de multipart sans identité n'est identifié. Aucun fournisseur,
endpoint, table, policy, migration, dépendance ou règle de retrait ajouté.

P1 d'attribution privée confirmé sur le vrai handler local puis navigateur :
écran Compte A, cookies devenus B sans navigation et sélection d'un PNG
entièrement fictif. Avant l'attente403 rouge, le POST200 stocke les1065octets
et le digest observés sous le chemin privé B ; la RPC reçoit user_idB et le
snapshot B exact, crée le document B et met son dossier en attente. A reste
intact. L'unitaire observe le même effet avec59octets synthétiques. Aucune
approbation, URL publique, violation RLS ou donnée réelle n'est démontrée.

La seconde contrepreuve utilise le vrai LangToggle FR→EN : réponse RSC200,
nouvelle lecture SSR B, titre anglais et sentinelle du même document. La liste
garde pourtant la CIN de A au lieu du passeport de B avant l'attente rouge.
Le diagnostic initial de corps multipart CDP indisponible est conservé ;
les effets serveur et métadonnées prouvent la première cause indépendamment.

Le multipart porte désormais expectedActorId obligatoire, fourni par actorId
SSR, et le montage porte key=user.id. Après Auth, garde actif/légal et parsing
multipart, UUID absent/mal formé →422, divergence →403. UUID_RE et traductions
existantes sont réutilisés. Refus avant validation/signature de pièce, SELECT
de dépôt, stockage et RPC ; le parsing reçoit nécessairement le multipart et
le garde conserve ses propres lectures, sans promesse de zéro octet ou E/S.
La session reste l'unique propriétaire ; anciens écrans sans identité à
recharger. Types, tailles, MIME serveur, bucket privé, chemin aléatoire,
verrou/snapshot, refus approved et nettoyage conservateur des COMMIT ambigus
restent inchangés. Aucun assouplissement de la conservation ou des paiements.

Le seul depotFixture existant est étendu aux acteurs A/B. Les23anciens corps
de tests gardent leurs assertions ; leur builder valide fournit explicitement
l'identité, les envois bruts restent bruts. Six cas donnent avant patch29tests,
26verts et3rouges : attribution B démontrée et deux refus du nouveau protocole
obligatoire, sans présenter ces derniers comme deux incidents indépendants.
Les preuves avant correction sont conservées. Résultats finaux, revue, CI du
SHA exact, fusion normale et sondes publiques seront consignés après contrôle.

Validation locale :88/88 tests ciblés, dont29KYC. Trente parcours et30
tentatives, deux workers, zéro retry/flaky/échec/ignoré en66,3 s ; les24anciens
restent verts. Treize POST KYC : quatre divergences403 dans les quatre langues,
six identités absentes/mal formées/File422 sans effet, puis trois succès200
(A/A, B/B, B après vrai refresh RSC). Exactement trois objets privés fictifs
et trois RPC, digest du File PNG vérifié ; A inchangé. Chaque formulaire porte
un seul expectedActorId textuel égal à l'acteur attendu, observé en transmettant
les méthodes natives FormData sans modifier fetch ou les valeurs. Seuls les
journaux de GET sont exclus des comparaisons ; les refus stale vérifient aussi
zéro lecture du snapshot KYC de dépôt à quatre colonnes, sans masquer les
lectures actif/légal. Le stub ne prouve pas les verrous ou la RLS SQL.

Aucun défaut JS, avertissement console, console inattendue, overlay ou
débordement ;20erreurs HTTP403 attendues couvrent les cinq API testées, dont
quatre KYC. Captures360/1280 relues, aucune pièce affichée en image. Types,
build et contraste88/88 passent ; lint sans erreur ni nouvelle alerte (dix
existantes Windows), ciblé sans avertissement. Revue logique indépendante sans
blocage. Suite globale :2 282/2 282 unitaires, sans échec/ignoré/annulé en303,7 s.
CI du SHA exact, fusion normale et sondes publiques restent à consigner dans
la PR. Aucune donnée réelle, paiement, migration distante ou déploiement manuel.
L'écart de texte « suppression après décision » dans kyc.why est un candidat
distinct, identifié pendant la relecture des captures ; aucune règle de
conservation n'est modifiée par le présent lot. L'audit entier reste ouvert.

Le journal de la CI initiale39813807287 sur d613ea1d révèle450tests uniques,
451tentatives et un flaky ancien (repli du bandeau, e2e/barre-annonce.spec.ts).
Le locator large header rencontre deux en-têtes avant l'attente de l'attribut ;
le retry passe. Les30cas d'identité sont directs. Le contexte ne prouve pas
une duplication persistante d'en-têtes visibles ni un défaut produit. La
fusion reste suspendue, même si l'agrégat devient vert. Extension bornée au
seul fichier de test existant : observer un unique en-tête accessible avant
défilement, garder les assertions d'attribut et de bandeau caché, puis répétitions
ciblées et nouvelle CI exacte. Aucun changement de runtime/CSS/configuration,
timeout ou nombre de retries ; première preuve conservée avec son flaky.

Après cette synchronisation, les cinq cas bandeau passent chacun trois fois :
15exécutions et15tentatives, zéro retry/flaky/échec/ignoré en39,8 s. Les huit
unités bandeau, les types et le lint ciblé passent. Les quatre autres cas et
leurs attentes CSS restent inchangés ; aucun rebuild applicatif n'est requis
pour ce seul témoin. Une nouvelle CI complète sur la tête supplémentaire est
requise avant toute fusion ; l'ancienne preuve450/451 reste inchangée.

Mise à jour de livraison : #408 fusionnée à16:58:33Z sur f307396c, arbre
fa3ed82f identique au testé. CI2 39816444153, tête f2503966 :2 282unitaires
et450parcours/450tentatives, zéro retry/flaky/échec/ignoré ;97fichiers SQL,
152migrations vérifiées en environnement isolé, concurrence/restauration
et scans verts. Déploiement automatique Vercel Ready : commit attendu et
readyz200oktrue au17e contrôle, puis six protections publiques réussies.
La première CI avec451tentatives reste conservée ; aucune donnée réelle,
migration distante, paiement ou mise en ligne manuelle.

## 24. Information KYC — conservation annoncée (22 octobre 2026)

Inventaire sur main f307396c, après #408 livrée et publiquement vérifiée :
les quatre clés kyc.why, leur montage unique Compte/KycForm, confidentialité
§9 et0131, tests de politique/rétention et six parcours KYC existants. Les
quatre notices annonçaient une suppression après décision ; la politique et
le code conservent pendant la relation de compte, puis cinq années calendaires
après clôture, sans départ du délai lors d'une décision. Ce constat de texte
ne démontre ni purge immédiate, ni perte de fichier ou violation juridique.
La configuration et les fichiers de production ne sont pas relus ici.

Les quatre libellés existants expliquent désormais le même déclencheur et
la même durée que la politique. Retrait conditionnel, accès privé/admin et
lien temporaire restent dans le résumé. Aucun composant, endpoint, table,
policy, durée, règle de purge, document juridique ou version d'acceptation
modifié ; docs/35 marque son ancien délai comme historique. Quatre fichiers
seulement, sans nouvelle infrastructure ni nouveau test recopiant le texte.
Relecture sémantique indépendante favorable ; validations existantes, revue
du diff exact, PR/CI normale puis sondes publiques à consigner.

Validation locale :81/81 tests ciblés existants (KYC, politique/rétention,
i18n/clés et gardes compte), sans échec/ignoré. Six parcours KYC et six
tentatives, deux workers, zéro retry/flaky/échec/ignoré en31,7 s, dans les
quatre langues. Types après build, build, contraste88/88 et lint passent,
sans erreur ni nouvelle alerte (dix existantes Windows). Le diff mécanique
du dictionnaire porte exactement les quatre valeurs annoncées ; tous les
tests, stubs et configurations sont identiques à la base. Revue finale et
CI sur la tête exacte, fusion normale et sondes publiques restent à consigner.

Diagnostics des six cas : zéro erreur JS, avertissement, console inattendue,
overlay ou débordement, quatre HTTP403 volontaires. Captures FR360/HT1280
relues, nouvelle information lisible ; EN/ES couverts par les parcours, sans
revue visuelle dédiée revendiquée. Le premier filtre n'a sélectionné aucun
cas ; ce diagnostic est conservé séparément et ne représente aucun échec
de test. Les six cas réellement exécutés passent directement.

## 25. Dépendances — réutilisation de la PR 385 (22 octobre 2026)

Après livraison publique de #409, l'audit npm de production sur main be890065
signale une critique Next.js 16.4.0 et arrête le job avant types, tests et build.
Le prémerge, vert avec zéro vulnérabilité à 17:09:50Z, reste distinct de ce
nouveau résultat à 17:25:24Z. Ni défaillance de compilation ni exploitation
production ne sont établies par cet audit.

La PR #385 propose déjà Next.js et eslint-config-next 16.4.2 ainsi que
Supabase JS 2.118.0. Réutilisation de ce groupe existant, intégration de main
par fusion normale, aucun doublon. Le verrou conserve sharp 0.35.5 ; les
composants Next/Supabase associés suivent leurs versions couplées. Les PR
majeures ESLint/TypeScript et la skill restent distinctes. Aucun changement
de route, fonction applicative, table, test, migration, configuration ou secret.

Sources mainteneur : [avis images](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
[avis Server Actions](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r)
et [release 16.4.2](https://github.com/vercel/next.js/releases/tag/v16.4.2).
Les deux correctifs commencent en 16.4.1 ; 16.4.2 est le patch proposé par npm
et déjà porté par #385. Installation, audit, suites existantes, compilation,
revue indépendante, CI exacte puis sondes publiques restent à consigner.

Revue du [diff Supabase 2.118.0](https://github.com/supabase/supabase-js/releases/tag/v2.118.0) :
typage PostgREST et options Storage opt-in non utilisées ici, sans modification
du code d'exécution Auth inspecté. Le verrou change 18 versions, sans ajout
ni suppression de paquet ; SSR et Node restent compatibles. Après npm ci,
l'audit de production au seuil CI rend zéro vulnérabilité ; l'audit complet
conserve cinq alertes hautes dans l'outillage ESLint, distinctes. Aucun retour
à une ancienne majeure ni affaiblissement de l'audit n'est appliqué.

Validation locale : 2 282/2 282 tests unitaires existants, build Next 16.4.2,
types après build, contraste 88/88 et lint sans erreur ni nouvelle alerte
(dix existantes Windows). Trente parcours existants d'identité Compte/KYC
passent directement contre les fixtures locales ; aucune pièce réelle ni
base distante. Revue logique indépendante favorable, sans preuve de RLS ou de
verrous SQL tirée des stubs. CI complète sur le SHA final, fusion normale et
vérification du commit public restent à consigner dans la PR.

## 26. Outillage ESLint — chaîne braces (22 octobre 2026)

Inventaire sur main f2b9f401 après #385 : cinq alertes hautes npm complètes,
zéro de production. Elles proviennent toutes de GHSA-vfj7-8cjw-p6xm :
eslint-config-next → plugin Next → fast-glob 3.3.1 → micromatch 4.0.8 →
braces 3.0.3. L'[avis](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
n'indique aucune version corrigée ; le registre npm conserve 3.0.3 en latest.
Les PR 386/387 ne retirent pas cette chaîne. Aucun appel applicatif ni flux
de production vers braces identifié ; le risque d'outillage reste suivi.

Le plugin Next utilise seulement globSync dans get-root-dirs. Réutilisation
de tinyglobby 0.2.17 et picomatch 4.0.7 déjà installés, au moyen d'un adaptateur
local privé et d'un override limité au plugin 16.4.2. Le remplacement nu est
écarté : expandDirectories, le format absolu, les slashs finaux et l'inclusion
des dossiers liés diffèrent. Le contrat testé
doit préserver les racines et le diagnostic réel no-html-link-for-pages,
ou refuser explicitement les formes non prises en charge : plages à accolades
et motifs vides. Les littéraux gardent leur forme par stat ; les dossiers liés
sont observés via fs puis filtrés, sans remplacer le parcours ni ses garde-cycles.
Le paquet privé est une dépendance directe nommée fast-glob et l'override
référence $fast-glob : npm ci et npm ls ne résolvaient pas un chemin file
transitif depuis le même parent. Aucun script post-installation ou réglage npm.
Quatre exceptions de style no-require-imports documentent les imports CJS ;
aucune règle Next désactivée, copie de braces, exclusion d'avis ou rétrogradation.
Contrepreuves, installation reproductible, audits, revue et CI à consigner.

Validation locale finale : installation propre et graphe npm valides ; audits
complet et production zéro vulnérabilité. Dix-neuf contrats réels du plugin
passent sans saut, dont motifs absolus, accolades littérales, liens lexicaux,
racines système et diagnostic no-html-link-for-pages. Les témoins ont détecté
deux défauts d'accolades avant correction et une inclusion indue de lien sous
mutation ; les journaux rouges restent distincts des résultats finaux verts.
Suite complète 2 301/2 301, build Next 16.4.2, types après build, contraste 88/88,
lint sans erreur ni nouvelle alerte (dix existantes Windows). Revue logique
indépendante favorable ; montage d'installation vérifié avec npm 10.9.9 et
11.13.0 sous Windows/Node 24. CI exacte Linux/Node 22 et publication à consigner
dans la PR ; aucune correction amont de braces ni exploitation reproduite
n'est revendiquée.

Dernier garde : contrairement à fast-glob, fdir masque par défaut les erreurs
de lecture. Le témoin réel getRootDirs avec EACCES synthétique échouait ; les
trois opérations fs synchrones sont désormais observées et la première erreur
autre qu'ENOENT propagée, sans changer parcours ou garde-cycles. Les 19 contrats
et la suite finale passent. La CI verte de 6241e51 (2 300 unités, 450 parcours
sans retry) reste une preuve antérieure ; la nouvelle tête exige sa propre CI.

## 27. Demande de retrait — identité du formulaire (22 octobre 2026)

Lot sur fix/retrait-identite-formulaire, base main 247fc659 après #410.
Inventaire : unique montage PayoutRequest dans le tableau de bord, unique
appelant POST /api/payouts, gardes UUID et erreurs traduites déjà disponibles.
Les PR ouvertes 386/387 (dépendances) et 402 (skill), les anciens lots frais
IA/KYC et les gardes Compte/profil ne corrigent pas ce chemin. Aucun listener
Auth global ne retire le formulaire déjà rendu lors d'un changement de cookies.

Contrepreuve du vrai handler : dans les quatre langues, expectedActorId=A
sous session vérifiée B obtient 200 et appelle zabelie_request_payout pour B,
au lieu du refus 403 sans client administratif attendu. Six témoins positifs
préservent demande même compte, anonymat, montant et réponses métier/KYC.
Contrepreuve navigateur à 360 px : vrai tableau de bord et formulaire A,
cookies B sans navigation, corps montant seul, RPC locale pour B et demande
requested B ; le modèle fictif passe de 9 000 à 8 500, A reste à 7 000.
Autre rouge : un vrai refresh RSC FR→EN rend profil/portefeuille B dans le même
document, mais conserve le champ A à 100 et son message de refus métier.
Ces observations locales ne prouvent ni incident réel ni ledger/RLS distante.
Une première tentative navigateur n'a pas démarré faute de headless shell ;
elle reste distincte de la contrepreuve obtenue avec Chrome déjà installé.

Correction limitée à trois fichiers applicatifs : le serveur rend actorId et
key=user.id ; le formulaire envoie expectedActorId ; la route impose un UUID
valide (422 absent/malformé), compare à la session (403 divergent), avant
validation du montant et création du client administratif. Les messages de
ces nouveaux refus réutilisent les quatre dictionnaires. p_user_id reste
exclusivement user.id de session. La clé React remonte un formulaire fermé
et vide quand le compte rendu change. Les anciens écrans sans identité doivent
être rechargés : les accepter garderait accessible le défaut reproduit.

Aucun changement de la normalisation du montant, des plafonds/minimums, des
commissions, du délai, du KYC, de la RPC, des tables ou du ledger. La RPC 0079
conserve ses contrôles sous verrou et le recouvrement IA ; le versement externe
reste séparé. Les suites SQL payout_requests, kyc, ai_surplus_reglement et
studio_facturation existent. Leurs résultats isolés, la CI de tête et la
publication après fusion normale sont à consigner dans la PR.

Validation ajoutée : 16 contrats du vrai handler (harnais existant), six
parcours navigateur, extension opt-in du faux Supabase existant avec comptes
et soldes synthétiques isolés par scénario. Le double de RPC ne contient
aucun garde expectedActorId et ne remplace pas le test du handler. Toute preuve
de refus compare les appels et états avant/après ; le cas refresh exige le même
document, les lectures B, l'effacement de l'état A et une nouvelle demande B.
Les 16 contrats et 2 317 unités passent après patch, build Next 16.4.2 puis
types, contraste 88/88, audit npm complet zéro alerte, lint zéro erreur et dix
avertissements existants. Deux revues logiques indépendantes sont favorables ;
suffixe métier depuis la normalisation du montant identique à la base. Les
352 parcours principaux locaux et la CI exacte restent à consigner dans la PR
avant fusion ; aucune preuve d'une autre tête n'est réutilisée comme vert.
Aucun appel financier réel, migration distante, donnée de production, secret,
nouveau service, dépendance ou déploiement manuel.
