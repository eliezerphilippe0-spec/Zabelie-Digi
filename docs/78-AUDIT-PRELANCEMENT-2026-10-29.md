# Audit pré-lancement — 2026-10-29

Demande du porteur : tester toutes les fonctionnalités comme un nouvel
utilisateur, chercher les failles, rendre un rapport honnête avec captures, et
« perpétuer dans le temps ». Ce document est le **constat** ; rien n'y est
tranché. Les décisions d'argent, de positionnement, de variables
d'environnement et de réglages Auth restent au porteur (`docs/25` §4).

Le rapport illustré (captures mobile et ordinateur) est publié à part, en page
privée ; ce fichier en garde le contenu vérifiable dans le dépôt.

## 0. Verdict

**Techniquement solide, pas encore prête pour le grand public.** Aucune faille
critique trouvée : rien ne permet aujourd'hui de voler de l'argent ou de lire
les données d'un autre utilisateur. Ce qui sépare Zabelie d'un lancement n'est
pas le code : aucun paiement réel n'a jamais abouti, et le catalogue compte
**un** produit publié.

## 1. Méthode

| Volet | Comment | Limite |
|---|---|---|
| Visiteur anonyme, production | 84 pages (sitemap + liens), Android 390 px et ordinateur 1440 px, console, sous-ressources, débordement, `alt`, `h1` | réseau du bac à sable : l'hôte Supabase est bloqué, donc les images produits ne s'affichent pas dans les captures |
| Comptes acheteur, vendeur, admin | copie locale du site branchée sur un faux Supabase, 28 écrans | pas en production : une inscription réelle exige une boîte mail, un paiement réel est une zone d'arrêt |
| Sécurité publique | en-têtes, redirections ouvertes, fichiers sensibles, API sans session, webhook sans signature | sondes non destructives, aucune écriture |
| Base de production | lecture seule : RLS en rôle `anon`, droits, fonctions, cohérence du registre, conseillers Supabase | aucune écriture |
| Code | routes de paiement, commande, remise, facture, téléchargement | — |
| Accessibilité | axe-core WCAG 2.2 AA, 10 pages × 2 largeurs | outil éprouvé d'abord sur une page piégée (il voit `button-name` et `image-alt` injectés) |

## 2. Ce qui marche

* **Pages** : 84/84 en 200, aucun lien interne cassé, aucun débordement
  horizontal à 390 px, toutes les images ont un `alt`, un seul `h1` par page,
  vraie 404 pour une adresse inconnue. Premier octet serveur 0,35 à 0,8 s.
* **Quatre langues** : accueil kreyòl complet, adresses `/ht` et `/fr` servies.
* **En-têtes** : CSP à nonce unique par réponse + `strict-dynamic`,
  `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS un an avec
  sous-domaines, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` (caméra, micro, géolocalisation, paiement refusés).
* **Pièges refusés** : `/auth/callback?next=https://evil.example` et
  `?next=//evil.example` renvoient à l'accueil ; `//evil.example/` reste sur le
  site ; `.env` et `.git/config` en 404 ; cartes source en 403 ; sept API
  privées en 401 sans session ; webhook Stripe exige sa signature ; `/admin`
  renvoie à la connexion, un vendeur non admin est renvoyé à l'accueil.
* **Base** : RLS active sur toutes les tables, un visiteur anonyme ne lit que
  le public, registre vendeur cohérent (écart 0), buckets restreints, compte
  admin avec double authentification vérifiée.
* **Accessibilité** : 0 violation WCAG 2.2 AA sur 20 vues.
* **Parcours connectés** (copie locale) : 28 écrans, 0 erreur JavaScript,
  0 débordement.
* **Filet** : 2 685 tests unitaires, E2E en CI, vérification après chaque
  déploiement (commit attendu + protections publiques).

## 3. Ce qui bloque le lancement

Mesuré en lecture seule le 2026-10-29.

| # | Constat | Mesure | Qui |
|---|---|---|---|
| B1 | aucun paiement réel n'a jamais abouti ; MonCash en **sandbox**, annoncé sur l'accueil | `payments` : 14 `moncash` `failed`, 1 `gratis` `confirmed` | porteur — `docs/56`, puis `docs/76` + `docs/22` |
| B2 | catalogue quasi vide | 1 produit publié sur 11 (« formation en IA », 5 HTG) | porteur — recrutement vendeurs, photos |
| B3 | e-mails transactionnels jamais envoyés | `zabelie_outbox` : 2 lignes, 0 `sent_at` | porteur — `RESEND_API_KEY` (variable d'environnement) |
| B4 | litige ouvert depuis le 2026-08-22, sans dossier | commande `c797080d…`, 0 HTG | porteur |
| B5 | recharges téléphoniques « en test : aucun crédit réel » | affiché honnêtement sur `/recharges` | porteur — masquer ou activer |

Défauts visibles non bloquants : champ photo natif « Choose File / No file
chosen » en anglais sur une page française ou kreyòl ; adresses inconnues sous
`/tableau-de-bord/` qui affichent la page introuvable avec un statut **200**
(soft 404) ; `/assistant` porte le titre générique de l'accueil.

## 4. Failles

Aucune critique. Trois moyennes, dix faibles. Exposition mesurée aujourd'hui :
0 vente flash active, 0 facture pro, 0 domaine personnalisé, 1 portefeuille à
0 HTG.

| Réf | Gravité | Constat | Exposition | Qui tranche |
|---|---|---|---|---|
| M1 | moyenne | `app/api/checkout/route.ts` : le prix flash (`prixFlashHtg × quantité`) s'applique à **n'importe quelle variante** ; `0080` ne compare qu'à `products.price_htg` | 0 vente flash | porteur (argent) : refuser le flash sur un produit à plusieurs prix, ou un prix flash par variante |
| M2 | moyenne | `app/api/facture/[token]/pay` ne vérifie que l'état de la facture, pas celui du pro (suspendu, fermé) ; le net est crédité au solde **disponible** sans maturation | 0 facture | porteur + conseil (`docs/17`) |
| M3 | moyenne | cookie de session lisible par JavaScript (défaut `@supabase/ssr`, `httpOnly: false`) ; les pixels vendeurs chargés après consentement héritent de `strict-dynamic` | selon pixels | chantier de durcissement ; pixels vendeurs : porteur |
| L1 | faible | `max_uses` d'un code promo dépassable par des commandes en attente parallèles | 0 | technique |
| L2 | faible | `boutik_slug` modifiable par PostgREST direct, seuls le format et une courte liste réservée le bornent (usurpation de nom) | — | porteur (règle de nommage) + technique |
| L3 | faible | secrets comparés avec `===` (refus par défaut, pas à temps constant) | — | technique |
| L4 | faible | `error.message` brut de la base renvoyé au client (cinq routes de remise, codes promo, affiliation, demande de zone, référence Zelle, profil, avis) | — | technique |
| L5 | faible | API publique v1 : un seul compartiment anonyme de limitation, qu'un client peut vider pour tous | — | technique |
| L6 | faible | quelques routes ne vérifient pas la suspension du compte | — | technique |
| L7 | faible | `proxy.ts` : redirection ouverte plausible via un domaine personnalisé | 0 domaine | technique |
| L8 | faible | CSP autorise `*.supabase.co` (tout projet), et le matcher d'extensions statiques est contournable | — | technique |
| L9 | faible | panier et préférences restent sur l'appareil après déconnexion (cybercafé, téléphone partagé) | — | technique |
| L10 | faible | `anon` détient `INSERT` sur des tables protégées seulement par RLS (défense en profondeur) | — | technique (migration) |

Informations : `npm audit` signale 4 « high » dans `zod` embarqué par
`serwist` à la construction seulement ; le cookie de source de vente est signé
avec la clé service-role (réutilisation de clé) ; un `GET` de téléchargement
change un état ; la sonde de domaine admin peut appeler une adresse interne
(admin seulement) ; les filtres d'adresse des webhooks ignorent NAT64/IPv6.

Réglages et performance : la protection Auth contre les mots de passe divulgués
est **désactivée** (case du tableau de bord Supabase — porteur) ; conseillers
Supabase : 63 `auth_rls_initplan`, 37 clés étrangères sans index, 37 doubles
politiques permissives — sans effet au volume actuel, à traiter avant la charge.

## 5. Non testé

Inscription réelle et e-mail de confirmation ; connexion Google ; paiement
réel MonCash ou Stripe ; images produits depuis le bac à sable (l'objet existe
en stockage) ; espace admin en production ; vrais téléphones Android d'entrée de
gamme sur réseau lent ; charge ; restauration de sauvegarde (`docs/57`, encore
à prouver).

## 6. Perpétuer

`.github/workflows/post-deploy.yml` rejouait la sonde publique après chaque
déploiement. Depuis ce lot, il la rejoue aussi **chaque jour à 10:17 UTC**
(6 h 17 à Port-au-Prince), sans déploiement : une protection peut tomber par la
configuration Vercel, un domaine ou un en-tête. La sonde passe de six à douze
contrôles :

* ajoutés : HSTS d'un an avec sous-domaines, `Referrer-Policy` sûre,
  `Permissions-Policy` qui refuse la géolocalisation (cohérent avec la zone
  choisie à la main, jamais la position précise), `X-Frame-Options: DENY`,
  cartes source non servies, `.env` et `.git/config` non servis, trois
  redirections ouvertes refusées, huit API privées en 401/403 ;
* éprouvés : site sain accepté, onze défauts injectés un par un tous détectés,
  chaque API protégée et chaque fichier caché exposé seul détecté ; onze
  mutations de la sonde et du workflow, toutes tuées ; production réelle
  acceptée (12/12) le 2026-10-29.

⚠️ La forme `//evil.example/` est celle qui trompe `new URL(path, origin)` : la
sonde aurait interrogé `evil.example` au lieu du site. Elle concatène donc
l'origine et le chemin, et un test exige qu'aucune requête ne quitte le site.

Ce n'est toujours **pas** une supervision permanente (`docs/57`) : un échec
quotidien produit une notification GitHub, pas une alerte d'astreinte. À
refaire en entier avant chaque grande étape : ouverture, première campagne,
nouveau rail de paiement.

## 7. Correctifs appliqués

Sur instruction du porteur (« applique aussi les correctifs », 2026-10-29).
Chaque garde est éprouvée par mutation (`tests/audit-correctifs-lot1.test.ts`,
`tests/domaines.test.ts` DM6).

**Lot 1 — code, sans migration**

| Réf | Correctif |
|---|---|
| L7 | `renvoiVersZabelie` (`lib/domaines.ts`) POSE le chemin sur l'adresse du site au lieu de le résoudre contre elle : `//evil.example/x` et `/\evil.example/x` restent sur Zabelie |
| L3 | `secretEgal` (`lib/secret-egal.ts`) : SHA-256 des deux côtés puis `timingSafeEqual` ; les douze lecteurs de `CRON_SECRET`/`RECONCILE_SECRET` y passent |
| L4 | `echecBase` (`lib/api-erreur.ts`) : le texte de Postgres part au journal, le visiteur reçoit `api.write.failed`/`api.read.failed` ; onze routes hors administration. Les refus de saisie rédigés par un garde (ZB069, ZB070, ZB058) gardent leur message |
| L6 | compte suspendu refusé avant toute écriture : espace pro (inscription, clients, factures, lignes, envoi), avis, profil, création et réactivation d'un code promo. Restent ouverts : désactiver un code, annuler une facture, retirer une ligne, et tout le parcours de remise d'une commande déjà payée (le bloquer gèlerait l'argent d'un tiers) |
| M2 (volet sûr) | `/api/facture/[token]/pay` refuse d'ouvrir un paiement si le PRO de la facture est suspendu ou illisible. La confirmation d'un paiement déjà fait n'est pas bloquée (aucun paiement orphelin). ⛔ La date de disponibilité du versement reste un arbitrage porteur + conseil : ajouter une maturation aggraverait la rétention (`docs/17`) |
| soft 404 | `lib/pages-desactivees.ts` : `/tableau-de-bord/creation*` et `/tableau-de-bord/studio` répondent un vrai 404 quand leur interrupteur est éteint, décidé par le proxy avec les mêmes fonctions que les pages |
| champ photo | la fiche produit physique n'affiche plus « Choose File » : bouton libellé dans la langue du vendeur (`sell.physical.photo.pick`), champ `sr-only` joignable au clavier |
| `/assistant` | titre d'onglet tiré de sa copie traduite |

**Lot 2 — migration `0166` et son code**

| Réf | Correctif |
|---|---|
| M1 | ZB080 refuse une vente flash sur un produit à plusieurs variantes actives (`ZB166`, même règle que les rabais de `0109`) ; le checkout n'applique l'offre qu'à une unité au prix contre lequel elle a été validée — une variante ajoutée après l'offre paie son prix |
| L2 | `protect_profile_privileges` fige `boutik_slug` côté client (INSERT et UPDATE) : seule l'attribution serveur l'écrit. `zabelie`, `zabelie-…`, `officiel`, `official`, `support`, `assistance`, `securite`, `service-client` réservés, en base et dans `lib/boutik-slug.ts` (test de concordance) |
| L10 | `anon` perd INSERT/UPDATE/DELETE/TRUNCATE sur toutes les tables publiques, `authenticated` perd TRUNCATE (que RLS ne contrôle pas), y compris pour les tables à venir. Aucune policy d'écriture ne laissait passer un visiteur sans `auth.uid()` (mesuré) |

⚠️ Angle mort assumé : le bootstrap SQL local n'accorde pas TRUNCATE à
`authenticated` ; la mutation qui retire cette révocation survit au test SQL.
La preuve est la sonde de `0166`, exécutée en production où la condition
existait (64 tables mesurées avant application).

**Lot 3 — durcissements sans décision métier**

| Réf | Correctif |
|---|---|
| L8 | CSP : images, médias et API vers le SEUL projet Supabase configuré, plus `*.supabase.co` ; le matcher du proxy n'exempte plus tout chemin finissant par `.png` (`/boutik/x.png` était rendu sans CSP à nonce) |
| L9 | déconnexion : `Clear-Site-Data: "cache", "storage"` — liste hors ligne, photo et consentement de l'essayage (IndexedDB) effacés sur l'appareil ; les cookies de langue et de zone restent |
| L5 | API v1 anonyme : 60/min par visiteur (empreinte SHA-256 de l'adresse) dans une borne globale de 600/min par endpoint ; documentation publique corrigée dans les quatre langues |

**Restent au porteur, non appliqués — et pourquoi**

* **L1** (plafond d'un code promo dépassable par des commandes en attente
  simultanées) : le fermer, c'est réserver l'usage au checkout. BL-133 a
  délibérément déplacé la consommation au paiement confirmé pour qu'une
  session MonCash abandonnée ne brûle pas un usage. Les deux ne tiennent pas
  ensemble sans arbitrage : dépassement borné par les paiements simultanés,
  ou usages gelés par des sessions abandonnées.
* **M2, volet argent** : la date à laquelle le versement d'une facture
  devient disponible. Ajouter une maturation aggraverait la rétention
  (`docs/17`) : avis du conseil requis.
* **M3** : le cookie de session reste lisible par JavaScript tant que six
  composants utilisent le client Supabase du navigateur (connexion, mot de
  passe, téléversements, suivi de commande). Les passer côté serveur est un
  chantier ; garder ou retirer les pixels des vendeurs est une décision.

**Trouvé en vérifiant les correctifs en production**

* `list_categories` (API v1 publique) répondait **500** : 9 rayons actifs sur
  83 ont une adresse kreyòl accentuée (`luil-motè`, `krem-kò`, `sewòm`…) et
  `SlugSchema` n'acceptait que `[a-z0-9-]`. Le contrat de sortie étant vérifié
  avant envoi, une seule adresse accentuée retenait toute la page. Défaut
  antérieur à l'audit, de la même famille que `\b` contre `vandè`. Corrigé :
  minuscules Unicode (`\p{Ll}`, `\p{Mn}`, chiffres, tirets), éprouvé sur des
  accents en fin et en début de mot (`tests/api-v1-slug-kreyol.test.ts`) ;
  l'ancien motif fait rougir deux tests sur trois.

**Mots de passe divulgués — le contrôle fait dans le code**

La case native de Supabase Auth exige le plan Pro (projet en Free, mesuré
le 2026-10-29). Instruction du porteur : « fais le contrôle dans le code ».

* Inscription et nouveau mot de passe consultent Have I Been Pwned par
  **k-anonymat** : le navigateur calcule le SHA-1, n'envoie que ses cinq
  premiers caractères à `/api/auth/fuites/<préfixe>`, qui relaie vers
  `api.pwnedpasswords.com/range` avec `Add-Padding` ; la comparaison se fait
  dans le navigateur. Ni Zabelie ni HIBP ne voient le mot de passe ni son
  empreinte complète ; HIBP ne voit ni l'adresse ni les cookies du visiteur.
  Aucune donnée personnelle ne part : la politique de confidentialité ne
  change pas.
* Route publique (on la consulte avant d'avoir un compte), 20/min par
  adresse hachée, préfixe validé avant tout appel.
* ⚠️ **Contournable** : un appel direct à Supabase Auth ne passe pas par ce
  contrôle. Il protège les vrais utilisateurs, pas la plateforme contre un
  attaquant ; seule la protection native (plan Pro) le ferait côté serveur.
* ⚠️ **Fail-open voulu** : HIBP injoignable → le mot de passe passe. Bloquer
  toutes les inscriptions pour une panne tierce serait pire que le risque.
* Éprouvé : `tests/mot-de-passe-divulgue.test.ts` (SHA-1 de référence,
  lignes de remplissage ignorées, seul le préfixe sort) et
  `tests/reset-password-form.test.ts` (un mot de passe divulgué n'atteint
  jamais `updateUser`) ; neuf mutations tuées. Le sandbox ne joint pas HIBP
  (proxy) : le format réel se vérifie sur la route déployée.

## 8. Inventaire des services — mesuré le 2026-10-29 au soir

Les variables Vercel ne sont pas lisibles depuis une session d'agent : chaque
service est mesuré par ce qu'il PRODUIT (page publique, réponse d'API sans
effet, trace en base). Méthode à rejouer telle quelle.

| Service | État mesuré | Comment |
|---|---|---|
| MonCash direct | ⚠️ **bac à sable** | pied de page « MonCash En test » ; 14 paiements, tous `failed`, aucune référence opérateur |
| Kobara (NatCash, MonCash via Kobara) | ✅ clés posées, **jamais utilisé** | boutons rendus sur la fiche ; 0 paiement `kobara` ; mode test/live non lisible de l'extérieur |
| Stripe (carte, USD) | ⛔ éteint | pied de page « Carte bancaire (USD) Bientôt » ; aucun bouton carte |
| Zelle | ⛔ éteint | aucun bouton Zelle (`ZELLE_RECIPIENT` absent) |
| E-mails (Resend) | ⛔ éteint | 2 e-mails en file depuis le 2026-08-22, 0 tentative — **annulés le 2026-10-30 sur instruction du porteur** (`abandonne_a`, audit n° 139), file vide ; la relance de paiement s'arrête avant son bail (aucune ligne `relances_paiement`) |
| Recharge vendue par Zabelie | ⛔ fermée, **voulu** | `POST /api/zabelie/topup/orders` → 410 `topup_firstparty_closed` (consigne produit) |
| Salle d'essayage | ⛔ éteinte | `POST /api/essayage` → 404 « pas encore activée » ; base prête (config non en pause, vendeur pilote actif) — variables Vercel au porteur |
| Studio Créatif (Higgsfield) | ✅ **allumé** | `/tableau-de-bord/studio` redirige vers `/connexion` (le `notFound()` fournisseur passe avant) ; 0 génération |
| Création assistée (digital) | ⛔ éteinte | `/tableau-de-bord/creation` → 404 |
| IA (description, assistant d'achat) | ✅ fournisseur configuré | `POST /api/ai/description` → 401 (503 sans fournisseur) |
| Connexion Google | ✅ marche | bouton rendu ; 2 comptes Google, dernier le 2026-10-19 |
| Tâches planifiées | ✅ 9 sur 11 tracées aujourd'hui | `zabelie_cron_leases` ; `relances` attend Resend ; `admin/coherence` ne prend pas de bail (journal Vercel seulement) |
| KYC pour retrait | ⚙️ non exigé | `zabelie_kyc_config.requis_pour_retrait = false` — décision porteur |
| Webhooks vendeurs | ✅ disponible, 0 abonné | `zabelie_webhook_endpoints` vide |
| Plan Supabase | ⚙️ Free | mots de passe divulgués : contrôle dans le code (§7) ; sauvegardes, transformations d'image, absence de mise en veille : plan Pro |

Trouvé en mesurant : le titre « Diaspora ? Payez en USD : » coiffait TOUTES
les options secondaires, donc en production deux boutons en GOURDES (NatCash,
MonCash via Kobara) sans aucun rail USD dessous. Corrigé : le titre ne précède
plus que Stripe et Zelle (`tests/buy-button-titre-usd.test.ts`, rouge sur
l'ancien composant).
