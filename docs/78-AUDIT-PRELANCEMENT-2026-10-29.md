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
