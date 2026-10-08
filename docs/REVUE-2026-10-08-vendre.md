# Rapport de revue — Zabelie, page `/vendre` — 2026-10-08

**Mode** : COMPLET sur un périmètre restreint (les quatre axes, une seule page) · **Périmètre** : https://zabelie.com/vendre (et `/ht/vendre`, `/fr/vendre`) — `app/vendre/page.tsx`, ses composants vendeur, et les 11 routes d'API qu'ils appellent · **Stack** : Next.js 16 (App Router) + Tailwind, Supabase (Postgres, Auth, Storage, RLS), Vercel · **Version auditée** : `main` à `b2726d9`

> Méthode : ce que zabelie.com SERT a été mesuré (HTML, en-têtes, poids, rendu navigateur à 360 / 768 / 1280 px en clair et en sombre, axe-core WCAG 2.2 AA, 3G simulée) ; l'espace vendeur connecté a été rendu en local avec les doublures du dépôt (`e2e/fixtures/stub-supabase.mjs`, jeton `vendeur-preparation-studio`) ; la base de production a été lue, jamais écrite. Rien n'a été corrigé.

## Résumé exécutif

La page publique est saine : aucune violation axe-core sur 16 rendus, aucun débordement horizontal, contenu lisible en 2,3 à 2,6 s sur une 3G lente simulée, en-têtes de sécurité stricts, et les 11 routes vérifient l'identité ET la propriété du produit. Les problèmes sont dans le **parcours vendeur après l'inscription**, et le plus coûteux est la photo : la galerie annonce 5 Mo, le stockage n'en accepte que 1,5, et rien ne compresse l'image en chemin (UX-01) — tandis qu'un fichier numérique ou un service n'a aucun moyen de recevoir une photo principale, la seule que le catalogue affiche (UX-02). En base, les 6 fiches numériques ont 0 photo ; la seule fiche avec photo est la fiche physique, qui passe par le chemin compressé. Ensuite : les photos d'une fiche approuvée peuvent être changées sans nouvelle revue (SEC-01), et la page ne dit pas au futur vendeur quand ni comment il est payé (UX-03).

## Tableau de bord par axe

| Axe | Posture | Constats (🔴/🟠/🟡/🔵) |
|-----|---------|------------------------|
| Sécurité       | Correcte | 0 / 1 / 1 / 3 |
| UX             | À améliorer | 0 / 3 / 5 / 1 |
| UI             | Correcte | 0 / 0 / 1 / 3 |
| Responsivité   | Correcte | 0 / 0 / 2 / 1 |

**Aucun constat 🔴.** Ce que la revue n'a PAS trouvé, et qui compte autant : prix toujours lu en base, aucun `dangerouslySetInnerHTML`, aucune clé `service_role` côté client, fonctions SQL exécutables par `service_role` seul avec contrôle `seller_id = p_user_id` et `search_path` figé (vérifié en production), téléversement du livrable numérique robuste (chemin construit par le serveur, taille lue sur l'objet réel, liste blanche, plafonds).

## Constats détaillés

### 🔴 Critiques

Aucun.

### 🟠 Élevés

#### [UX-01] Photo de galerie : 5 Mo annoncés, 1,5 Mo réels, aucune compression
- **Axe** : UX
- **Emplacement** : `app/api/products/media/route.ts:17` (`MAX_BYTES = 5 * 1024 * 1024`), `:64-69` ; `components/galerie-manager.tsx:73-81` (envoi brut) ; à comparer à `lib/image-limits.ts:22` (`COVER_MAX_OCTETS = 1_500 * 1024`) et `components/physical-product-form.tsx:211` (`compresserImage`)
- **Constat** : la route de galerie accepte jusqu'à 5 Mo, mais le bucket `product-covers` est plafonné à **1 536 000 octets** en production (lu dans `storage.buckets`). Le composant envoie la photo telle quelle. Le chemin de la photo principale (`/vendre/physique`) compresse dans le navigateur et applique la limite partagée ; celui de la galerie, non.
- **Impact** : une photo de téléphone ordinaire (2 à 5 Mo) passe le contrôle de la route puis est refusée par le stockage ; le vendeur lit « Envoi de l'image échoué » (`media/route.ts:112`, en français) sans savoir pourquoi ni quoi faire. C'est la première étape que la page lui demande (« Ajoutez de vraies photos »).
- **Preuve** : configuration de production lue ; en base, les 6 fiches « fichier » ont 0 photo de galerie, la seule fiche avec photo est physique. ⚠️ Échec non reproduit en production : aucun compte vendeur, et l'écriture en production est exclue — il est déduit de la configuration mesurée.
- **Correctif proposé** : brancher `compresserImage` dans `GalerieManager` et faire lire à la route la limite partagée de `lib/image-limits.ts` (une seule source), avec un message qui nomme la limite.
- **Effort** : S

#### [UX-02] Aucune photo principale possible pour un fichier ou un service
- **Axe** : UX
- **Emplacement** : seule `components/physical-product-form.tsx` appelle `/api/products/cover` ; seule écriture de `cover_url` : `app/api/products/cover/route.ts:126` ; le catalogue lit `cover_url` (`lib/products.ts:154`, `components/product-card.tsx:85`) ; `lib/seller-readiness.ts:15` compte une photo de galerie comme « photo renseignée » ; `lib/i18n.ts:998` promet des photos « en plus de la photo principale »
- **Constat** : depuis `/vendre`, une fiche numérique ou un service ne peut recevoir que des photos de galerie. La photo principale, la seule affichée sur les cartes du catalogue et de l'accueil, n'a aucun champ.
- **Impact** : toute fiche numérique ou service publiée depuis cette page apparaîtra sans image dans le catalogue, même avec six photos — pendant que sa liste de préparation affiche « Photo du produit · renseigné ».
- **Preuve** : lecture du code (aucun autre appelant de `/api/products/cover`, aucune autre écriture de `cover_url`, aucun trigger en base) ; rendu connecté : la checklist marque la photo comme présente.
- **Correctif proposé** : soit un champ « Photo principale » réutilisant l'envoi compressé de `/vendre/physique`, soit la promotion côté serveur de la première image de galerie en `cover_url`.
- **Effort** : M

#### [UX-03] La page ne dit pas quand ni comment le vendeur est payé
- **Axe** : UX
- **Emplacement** : textes affichés sur `/vendre` — `home.s1.b`, `home.s2.b`, `home.s3.b`, `sell.landing.body`, `sell.fee.*` (`lib/i18n.ts`) ; `app/vendre/page.tsx:84-97`
- **Constat** : rien sur le séquestre, la confirmation de remise, la maturation J+7, le moyen de versement, ni l'état des moyens de paiement (MonCash « En test », NatCash et carte « Bientôt » n'apparaissent que dans le pied de page). La seule mention est « votre solde disponible ».
- **Impact** : la première question d'un vendeur — « quand est-ce que je touche mon argent ? » — n'a pas de réponse avant l'inscription. Frein direct à l'inscription, et source de malentendus après la première vente.
- **Preuve** : texte servi extrait de `/vendre` et `/ht/vendre` (aucune occurrence de J+7, retrait, versement, MonCash).
- **Correctif proposé** : un bloc « Comment vous êtes payé » (encaissement → séquestre → confirmation de remise → J+7 → retrait), délais lus en configuration comme le taux de commission, en quatre langues. ⚠️ Un délai écrit est une **promesse commerciale** : la formulation se valide avec le porteur.
- **Effort** : S

#### [SEC-01] Les photos et la vidéo d'une fiche approuvée changent sans nouvelle revue
- **Axe** : Sécurité (intégrité de la modération)
- **Emplacement** : `app/vendre/page.tsx:478` (galerie rendue quel que soit le statut) ; `app/api/products/media/route.ts:31-40`, `:78-82` et `app/api/products/media/video/route.ts:55-59` (propriété vérifiée, statut jamais) ; à comparer à `app/api/products/digital-studio/route.ts:35` (une modification repasse la fiche en brouillon)
- **Constat** : un vendeur peut ajouter, retirer ou remplacer photos et vidéo d'une fiche déjà publiée ; l'effet est immédiat et public.
- **Impact** : une fiche approuvée peut montrer, le lendemain, un autre article ou un contenu interdit — ce qui contredit « Chaque fiche est examinée » (`app/vendre/page.tsx:56`) et la politique des produits interdits. Conditionnel : il faut un vendeur dont une fiche a été approuvée.
- **Preuve** : lecture des deux routes et du trigger `0073` (plafond seulement, aucune règle de statut).
- **Correctif proposé** : même règle que l'atelier numérique — toute modification de média sur une fiche publiée la renvoie en revue ; ou un média « en attente » invisible jusqu'à validation.
- **Effort** : M

### 🟡 Moyens

#### [SEC-02] Galerie : type fixé par le navigateur, ni contenu ni dimensions contrôlés, bucket public sans liste de types
- **Axe** : Sécurité
- **Emplacement** : `app/api/products/media/route.ts:70-76` (extension seule), `:110` (`contentType: file.type`) ; production : `product-covers.allowed_mime_types = null` ; à comparer à `app/api/products/cover/route.ts:79-99` (en-tête lu, refus si illisible, 4000 px maximum)
- **Constat** : un fichier nommé `.png` est accepté quel que soit son contenu, avec le type MIME choisi par le client, dans un bucket public.
- **Impact** : un vendeur peut héberger un fichier non-image sur le domaine de stockage du projet (⚠️ la façon exacte dont le stockage le sert est à vérifier), ou publier une « bombe de décompression » (image de quelques Ko mais de 40 000 px de côté) qui ferait planter le navigateur d'un acheteur sur Android d'entrée de gamme.
- **Preuve** : lecture des deux routes ; configuration des buckets lue en production.
- **Correctif proposé** : reprendre dans la route galerie la lecture d'en-tête (`dimensionsDepuisEntete`) et `COVER_MAX_DIMENSION`, fixer le type depuis le format détecté ; poser `allowed_mime_types = {image/jpeg, image/png, image/webp}` sur `product-covers` (migration). À faire dans le même commit qu'UX-01.
- **Effort** : S

#### [UX-04] « 6 % pour les vendeurs Elite » : aucun critère, aucun moyen de le devenir
- **Axe** : UX (confiance)
- **Emplacement** : `lib/i18n.ts:399` (`sell.fee.line`) affiché par `components/commission-annonce.tsx` ; le palier n'est que lu (`app/vendre/page.tsx:241-247`, `lib/auth.ts:45`) ; aucune écriture de `tier = 'elite'` dans le code ni en SQL
- **Constat** : la page promet un taux réduit sans dire comment l'obtenir ; en production, les 4 comptes sont `standard`.
- **Impact** : une promesse commerciale invérifiable, affichée au moment où le vendeur décide de s'inscrire.
- **Correctif proposé** : ⛔ décision porteur (promesse commerciale) — publier les critères Elite, ou retirer la mention tant qu'ils n'existent pas.
- **Effort** : S

#### [UX-05] Formulaire de publication : case d'attestation après le bouton, champs sans libellé visible
- **Axe** : UX
- **Emplacement** : `components/publish-form.tsx:310` (bouton) avant `:321` (case obligatoire) ; `:185-192`, `:250-259`, `:269-277` (texte indicatif seul) ; `:316` (erreur)
- **Constat** : ordre mesuré au rendu : … → « Publier le produit » → case « J'accepte… ». Titre, type, catégorie, prix et description n'ont qu'un texte indicatif, qui disparaît à la saisie. L'erreur s'affiche en 12 px, centrée sous le bouton, loin du champ en cause.
- **Impact** : sur mobile, le vendeur appuie sur « Publier », le navigateur l'arrête sur une case située plus bas, avec un message natif dans la langue du téléphone ; une fois la saisie commencée, il ne voit plus quel champ est le prix.
- **Correctif proposé** : case avant le bouton ; libellés visibles au-dessus des champs ; erreur sous le champ concerné (`aria-describedby`).
- **Effort** : S

#### [UX-06] Erreurs en français codées en dur sur les routes de la page
- **Axe** : UX (langue)
- **Emplacement** : `app/api/products/asset/route.ts:71-173`, `app/api/products/media/route.ts:48-176`, `app/api/products/media/video/route.ts`, `app/api/products/flash/route.ts:68-106` (`ZB080: …` transmis tel quel), `app/api/ai/description/route.ts:45-64` ; affichées telles quelles par `components/galerie-manager.tsx:84` et `components/upload-asset.tsx:52` ; à comparer à `app/api/products/route.ts`, qui passe par `t(lang, …)`
- **Constat** : un vendeur kreyòl lit « Type de fichier non autorisé… », « Fichier refusé : 50 Mo maximum » ou « ZB080: rabais de … » en français.
- **Impact** : les messages arrivent en français précisément aux étapes où le vendeur bloque, sur un produit kreyòl-first.
- **Correctif proposé** : un code d'erreur par refus, traduit par `t(lang, …)` côté route, comme `/api/products` le fait déjà.
- **Effort** : M

#### [UX-07] Livrable jusqu'à 50 Mo : ni progression, ni reprise, et un refus qui invite à réessayer
- **Axe** : UX (3G)
- **Emplacement** : `components/upload-asset.tsx:61` (envoi en un bloc), `:107` (« Envoi… » seul), `:43` (taille refusée avec `upload.error`, « Envoi échoué. », `lib/i18n.ts:1118`), `:98` (pas d'attribut `accept`)
- **Constat** : aucune barre de progression, aucune reprise ; un fichier trop lourd reçoit le même message qu'une coupure réseau ; le sélecteur propose tous les types de fichiers alors que le serveur n'en accepte qu'une liste.
- **Impact** : en 3G (0,4 à 1,6 Mbit/s simulés), 50 Mo prennent 4 à 17 minutes sans indicateur ; une coupure fait tout recommencer ; un fichier trop lourd pousse à réessayer en vain.
- **Correctif proposé** : progression, envoi reprenable (protocole TUS de Supabase Storage), message « 50 Mo maximum » explicite, `accept` aligné sur la liste blanche du serveur.
- **Effort** : M

#### [UX-08] Espace vendeur long et répétitif ; deux portes de création de poids inégal
- **Axe** : UX
- **Emplacement** : `app/vendre/page.tsx:124-129` (bouton orange « Publier un produit physique » en tête), `:136-146` (carte des frais réaffichée au vendeur connecté), `:153-169` (« Pour vendre » réaffiché), `:360` (création numérique / service repliée dès le premier produit)
- **Constat** : rendu connecté à 360 px : 5,2 écrans pour 2 produits, 49 éléments interactifs, 6 sections repliables ; les produits du vendeur commencent au deuxième écran, après deux blocs de présentation.
- **Impact** : le vendeur qui revient tous les jours fait défiler la vitrine avant son travail ; le physique est mis en avant, le numérique et le service sont repliés.
- **Correctif proposé** : pour un vendeur connecté, « Mes produits » et un seul bouton « Créer une fiche » (choix du type ensuite) en tête ; présentation et frais réservés au visiteur.
- **Effort** : M

#### [UI-01] Texte de 12 px dominant dans l'espace vendeur, focus réduit à une bordure
- **Axe** : UI
- **Emplacement** : `components/publish-form.tsx:168` (`outline-none … focus:border-accent`), `:316` ; `components/galerie-manager.tsx:197`, `:201`, `:275` ; `components/upload-asset.tsx:109`
- **Constat** : mesuré au rendu connecté à 360 px : 40 éléments de texte à 12 px, 59 à 14 px, 6 à 16 px. Le focus clavier des champs se réduit à un changement de couleur de bordure de 1 px. Sur la page publique, deux textes sont à 12 px (« Ce qui ne peut pas être vendu », la mention de gratuité).
- **Impact** : lecture difficile sur un petit écran en plein soleil ; repère de focus faible pour la navigation au clavier.
- **Correctif proposé** : corps 14–16 px, aides 13–14 px ; anneau de focus visible (`focus-visible:ring-2`).
- **Effort** : S

#### [RES-01] Cibles tactiles trop petites dans l'espace vendeur
- **Axe** : Responsivité
- **Emplacement** : `components/galerie-manager.tsx:197` (« Photos (0/6) », 252 × 16 px), `:228` (« Ajouter une photo », 130 × 30), `:261` (« Ajouter une vidéo », 236 × 30) ; lien « Lire les règles », 31 px
- **Constat** : 11 cibles de moins de 44 px de haut mesurées à 360 px.
- **Impact** : l'ouverture de la galerie — l'étape photo — se fait sur une bande de 16 px.
- **Correctif proposé** : `min-h-11` sur le `summary` et les libellés d'envoi.
- **Effort** : S

#### [RES-02] Le visiteur non connecté télécharge l'espace vendeur et le client Supabase
- **Axe** : Responsivité (performance 3G)
- **Emplacement** : `app/vendre/page.tsx:4-50` (11 composants de l'espace vendeur importés) ; `components/galerie-manager.tsx:5` et `components/upload-asset.tsx` importent `lib/supabase/client`
- **Constat** : la page publique charge le client d'authentification Supabase (`GoTrueClient`, morceaux de 15 et 52 Ko compressés) et le code des éditeurs, qu'elle n'affiche jamais. Mesuré : 351 à 388 Ko transférés au premier chargement, dont environ 238 Ko de JavaScript, pour une page de deux liens.
- **Impact** : données mobiles payées et temps processeur sur Android d'entrée de gamme, pour rien. Le premier affichage n'en souffre pas (rendu serveur), le reste oui.
- **Correctif proposé** : charger l'espace connecté à la demande (`next/dynamic`) ou le déplacer sur sa propre route ; n'importer le client Supabase qu'au moment de l'envoi (`import()` dynamique).
- **Effort** : M

### 🔵 Faibles

#### [SEC-03] Messages internes de la base renvoyés au navigateur
- **Axe** : Sécurité
- **Emplacement** : `app/api/products/route.ts:297` (`error?.message`, statut 500) ; `app/api/products/flash/route.ts:106` (tout message de base, pas seulement `ZB080`)
- **Constat** : un échec d'écriture renvoie le texte de Postgres (noms de contraintes, de colonnes).
- **Impact** : fuite mineure de structure interne ; texte non traduit.
- **Correctif proposé** : journaliser côté serveur, renvoyer `t(lang, "api.publish.failed")` et un code.
- **Effort** : S

#### [SEC-04] Prix sans borne haute
- **Axe** : Sécurité
- **Emplacement** : `app/api/products/route.ts:100` (`price < 0` seulement) ; colonne `integer` (`supabase/migrations/0001_schema.sql:44`)
- **Constat** : au-delà de 2 147 483 647 HTG, l'insertion échoue et l'erreur brute revient au vendeur (SEC-03).
- **Correctif proposé** : borne serveur (paramètre en configuration) et `max` sur le champ.
- **Effort** : S

#### [SEC-05] Galerie : pas de plafond de cadence, suppression sans contrôle de compte suspendu
- **Axe** : Sécurité
- **Emplacement** : `app/api/products/media/route.ts` (aucun `rateLimit`, contrairement à `app/api/products/asset/route.ts:121`) ; `DELETE` `:135-152` (pas de `requireActiveAccount`)
- **Correctif proposé** : `rateLimit` sur l'envoi, `requireActiveAccount` sur la suppression.
- **Effort** : S

#### [UX-09] Pas de confirmation explicite après publication
- **Axe** : UX
- **Emplacement** : `components/publish-form.tsx:158-159` (redirection et rafraîchissement, sans message)
- **Constat** : atténué par le statut « En attente de revue » affiché dans la liste.
- **Correctif proposé** : un message « Fiche envoyée en revue » après la redirection.
- **Effort** : S

#### [UI-02] Succès et erreur identiques dans l'envoi du livrable
- **Axe** : UI
- **Emplacement** : `components/upload-asset.tsx:109` (`text-mist` pour les deux, pas de `role="alert"`)
- **Correctif proposé** : couleur de danger et `role="alert"` pour l'erreur.
- **Effort** : S

#### [UI-03] Flèche de lien externe sur un lien interne
- **Axe** : UI
- **Emplacement** : `app/vendre/page.tsx:91` (« Publier un produit physique ↗ » vers `/vendre/physique`)
- **Correctif proposé** : la flèche `→` utilisée par les autres liens internes de la page.
- **Effort** : S

#### [UI-04] Registre et orthographe incohérents à l'écran
- **Axe** : UI (texte)
- **Emplacement** : `lib/i18n.ts:992` (« Publie ton produit ou ta prestation. », au tutoiement, sur une page au vouvoiement) ; en kreyòl, « pwodui » (`sell.physical.q`, `sell.physical.cta`) et « pwodwi » (`home.s3.b`) sur le même écran — 51 contre 42 occurrences dans le dictionnaire kreyòl
- **Correctif proposé** : vouvoiement ; une seule graphie kreyòl (la graphie standard est « pwodwi »), dans le dictionnaire seulement, sous garde de test.
- **Effort** : S

#### [RES-03] Requêtes en série et liste non paginée côté vendeur
- **Axe** : Responsivité (performance)
- **Emplacement** : `app/vendre/page.tsx:176-350` (21 `await`, en grande partie en série), `:262-266` (tous les produits, sans limite), `:292-294` (une lecture de galerie par produit)
- **Constat** : sans effet aujourd'hui (10 fiches au total en base, dont 7 brouillons), coûteux dès quelques dizaines de fiches sur Android d'entrée de gamme.
- **Correctif proposé** : `Promise.all` des lectures indépendantes ; pagination.
- **Effort** : M

## Plan d'action priorisé

| Ordre | Constat | Action concrète | Sévérité | Effort |
|-------|---------|-----------------|----------|--------|
| 1 | UX-01 + SEC-02 | Brancher `compresserImage` dans `GalerieManager`, faire lire à la route galerie la limite et le contrôle d'en-tête de `lib/image-limits.ts`, fixer le type depuis le format détecté (un seul commit) | 🟠 | S |
| 2 | UX-03 | Rédiger le bloc « Comment vous êtes payé » en quatre langues, délais lus en configuration — formulation validée par le porteur | 🟠 | S |
| 3 | SEC-01 | Renvoyer en revue une fiche publiée dont un média change (même règle que `digital-studio/route.ts:35`) | 🟠 | M |
| 4 | UX-02 | Ajouter une photo principale aux fiches numériques et services (ou promouvoir la première image de galerie) | 🟠 | M |
| 5 | SEC-02 | Poser `allowed_mime_types` image sur `product-covers` par migration | 🟡 | S |
| 6 | UX-04 | Trancher Elite : publier les critères ou retirer la mention (décision porteur) | 🟡 | S |
| 7 | RES-01 | Agrandir les cibles de la galerie (`min-h-11`) | 🟡 | S |
| 8 | UX-05 | Placer la case avant le bouton, libellés visibles, erreurs sous le champ | 🟡 | S |
| 9 | UI-01 | Relever les tailles de texte de l'espace vendeur, anneau de focus | 🟡 | S |
| 10 | UX-06 | Traduire les erreurs des routes vendeur par codes et `t(lang, …)` | 🟡 | M |
| 11 | UX-08 | Réordonner l'espace connecté : produits et « Créer » d'abord | 🟡 | M |
| 12 | RES-02 | Charger l'espace connecté et le client Supabase à la demande | 🟡 | M |
| 13 | UX-07 | Progression et envoi reprenable (TUS) pour le livrable, `accept` aligné | 🟡 | M |
| 14 | SEC-03 | Journaliser les erreurs de base, renvoyer un message traduit | 🔵 | S |
| 15 | SEC-04 | Borner le prix côté serveur et dans le champ | 🔵 | S |
| 16 | SEC-05 | `rateLimit` sur l'envoi galerie, `requireActiveAccount` sur la suppression | 🔵 | S |
| 17 | UX-09 | Message « Fiche envoyée en revue » après publication | 🔵 | S |
| 18 | UI-02 | Erreur d'envoi du livrable en couleur de danger, `role="alert"` | 🔵 | S |
| 19 | UI-03 | Remplacer `↗` par `→` sur le lien physique | 🔵 | S |
| 20 | UI-04 | Vouvoiement et graphie kreyòl unique, sous garde de test | 🔵 | S |
| 21 | RES-03 | Paralléliser les lectures, paginer la liste des produits | 🔵 | M |

Par quoi commencer aujourd'hui : la ligne 1. Elle touche une seule route et un seul composant, elle réutilise du code déjà éprouvé sur `/vendre/physique`, et c'est l'étape où chaque vendeur numérique passe en premier. Premier point de contrôle humain avant toute opération en production : la migration de la ligne 5 (écriture en production), et les textes des lignes 2 et 6, qui sont des promesses commerciales.

## Quick wins (< 30 min chacun)

- **UX-01 + SEC-02** — compression et contrôle d'en-tête dans la galerie : le plus gros gain du rapport, en réutilisant du code existant.
- **RES-01** — cibles de la galerie à 44 px.
- **UX-05** — case d'attestation avant le bouton.
- **SEC-03**, **SEC-04**, **SEC-05** — trois gardes de route.
- **UI-02**, **UI-03**, **UI-04**, **UX-09** — finitions de texte et d'états.

## Suivi des correctifs

| Constat | État | Ce qui a changé |
|---------|------|-----------------|
| UX-01 | corrigé le 2026-10-08 | `GalerieManager` compresse la photo avant l'envoi (`compresserImage`, comme `/vendre/physique`) et la refuse sur place si elle dépasse encore 1,5 Mo ; la route lit `COVER_MAX_OCTETS`. Mesuré dans Chromium : une photo de 6,3 Mo part à 287 Ko, en WebP (`e2e/parcours-physique-galerie.spec.ts`). |
| SEC-02 | corrigé le 2026-10-08 ; `0134` appliquée le même jour à 19:17:23Z | Format lu dans l'en-tête (`formatDepuisEntete`), dimensions bornées à 4 000 px, type et extension stockés déduits du format réel, pour la galerie **et** la photo principale. `0134` pose sur `product-covers` les trois types image et le plafond de 1,5 Mo, au même octet que le code. |
| SEC-05 | corrigé le 2026-10-08 | Cadence bornée à 20 envois par minute ; la suppression exige un compte actif. |
| RES-01 | corrigé pour la galerie | Résumé, envois et retraits à 44 px. Le lien « Lire les règles » (31 px) reste à reprendre. |
| UX-06 | en partie | Les routes `products/cover`, `products/media` et `products/media/video` répondent dans les quatre langues (cliquet : 249 → 212 messages en dur). Les autres routes de la page restent en français. |

Tests : `tests/galerie-photos.test.ts` exécute les vraies routes (faux PNG, vraie image sous un faux nom, bombe de décompression, plafond au même octet que le bucket, cadence, compte suspendu) ; treize mutations, toutes détectées.

## Annexe — Couverture

- **Vérifié** :
  - en ligne, le 2026-10-08 : `/vendre`, `/ht/vendre`, `/fr/vendre` (statut, en-têtes de sécurité, CSP, texte servi en français et en kreyòl), poids transféré (HTML 12 Ko, JS ≈ 238 Ko, CSS 14 Ko, polices 77 Ko compressés ; 351 à 388 Ko au total), 12 rendus navigateur (360 / 768 / 1280 px, clair et sombre, deux langues) avec axe-core WCAG 2.2 AA (0 violation), débordements (0), CLS (≤ 0,034), 3G simulée avec processeur ×4 (Slow 3G : FCP 1,9–2,2 s, LCP 2,3–2,6 s ; Fast 3G : LCP 1,1 s) ;
  - espace connecté : 4 rendus locaux (360 et 1280 px, français et kreyòl) sur les doublures du dépôt, axe-core (0 violation), cibles, tailles de texte, ordre du formulaire ;
  - code lu en entier : `app/vendre/page.tsx`, `components/publish-form.tsx`, `components/galerie-manager.tsx`, `components/upload-asset.tsx`, `app/api/products/route.ts`, `app/api/products/asset/route.ts`, `app/api/products/media/route.ts` ; lu en partie : `app/api/products/cover/route.ts`, `app/api/products/flash/route.ts`, `lib/image-limits.ts`, `lib/seller-readiness.ts`, `lib/theme.ts` ; contrôles d'identité, de propriété et de cadence relevés sur `discount`, `offers`, `commitments`, `digital-studio`, `digital-details`, `media/video`, `ai/description` ;
  - production, en lecture seule : configuration des buckets, fiches par type avec photo et livrable, droits d'exécution, contrôle de propriété et `search_path` des fonctions SQL appelées, paliers des comptes, configuration KYC.
- **Non vérifié / à confirmer** :
  - un envoi réel de photo ou de fichier en production : pas de compte vendeur, et l'écriture en production est exclue — UX-01 est déduit de la configuration mesurée ;
  - la façon dont le stockage sert un fichier dont le type n'est pas une image (SEC-02) ;
  - l'espace connecté avec de vraies données (les doublures portent 2 produits), un vrai téléphone Android, un vrai lecteur d'écran ;
  - les éditeurs secondaires (`digital-studio-editor`, `digital-details-editor`, `product-offers-editor`, `product-commitment-editor`, `rabais-manager`, `flash-manager`, `seller-pricing-panel`, `commission-annonce`), lus au niveau de leurs appels réseau seulement ;
  - `/vendre/physique`, page distincte, hors périmètre (seul son rendu non connecté a été relevé).
- **Hors périmètre, noté au passage** : le site impose le thème clair par défaut, même quand le téléphone demande le sombre (`lib/theme.ts:6`) — choix global, pas propre à cette page.
- **Instrument** : deux chargements du navigateur d'audit ont échoué côté proxy de sortie de la session — une page (« upstream request failed ») et un morceau de JavaScript (la page s'est alors rechargée seule, `app/error.tsx:58`, ce qui est le filet prévu). Ils ont été écartés et rejoués ; ce ne sont pas des défauts du site.
