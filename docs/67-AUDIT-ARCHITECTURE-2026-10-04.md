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
| Panier multi-vendeurs | Mise à jour 2026-10-05 : panier (`0058`) et paiement groupé (`0128`, `0129`) construits ; `panier/payer` réutilise le checkout existant. Migrations et activation encore en attente selon `OPS_TODO`, non vérifiées en base dans ce passage |
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
La migration KYC doit passer la CI/Postgres avant application et publication.
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

**Validation et publication :** en cours, après gel des sources ; voir
`OPS_TODO`. L'ordre préparé est `0128`, `0129`, `0131`, `0132`, `0133`.
`0130` est déjà appliquée. Chaque application devra croiser le SQL exact
du journal Supabase, l'empreinte canonique et le registre opérationnel.
