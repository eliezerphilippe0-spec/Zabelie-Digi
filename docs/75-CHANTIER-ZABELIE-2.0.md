# 75 — Chantier « Zabelie 2.0 » : attirer, vendre, encaisser, fidéliser

> **Statut : SPÉCIFICATION. Aucune ligne de code applicatif, aucune migration.**
> Rédigée le 2026-10-27 contre `origin/main` = `636acd3` (PR #424) et la
> production `ddditxykopuxxqzgkqwy` (lecture seule). Demande du porteur :
> prompt « Zabelie 2.0 via la méthode REA », avec la consigne « regarde ce qui
> existe déjà, tu peux améliorer s'il le faut, éviter les doublons ».
>
> **Positionnement = zone d'arrêt** (`CLAUDE.md`, Méthode ; `docs/25` §4).
> Ce document analyse et propose. Les arbitrages du §9 ont été **tranchés par
> le porteur le 2026-10-27** (les dix recommandations, `docs/02` V-24).

---

## 0. Le constat qui commande tout le reste

**Zabelie 2.0 est déjà construit aux deux tiers.** Le brief décrit trois modules
à créer. Le dépôt en contient déjà l'essentiel, livré par des chantiers
séparés qui ne se sont jamais présentés comme une seule offre :

| Le brief demande | Ce qui existe déjà |
|---|---|
| Smart Store `zabelie.com/store/<slug>` | **`/boutik/<slug>`** : vitrine publique sur le même catalogue (`app/boutik/[slug]/page.tsx:10-21`), partage WhatsApp, note et ancienneté (`0153`, appliquée le 2026-10-26), pixels publicitaires (`0123`), **domaine personnalisé** branché dans le proxy (`0125`, `proxy.ts:9,26`) |
| AI Seller branché sur la recherche réelle | **Assistant d'achat V1** (`docs/68`), en ligne : `/assistant` et `/assistant?vendeur=<id>` limité à une boutique, lien depuis chaque vitrine (`components/boutique-vue.tsx:138`) |
| Business CRM léger | Ventes et contact acheteur par commande payée (`app/mes-ventes/page.tsx:139,153`), relance des paiements échoués (`0124`), suivi des boutiques (`0102`), panier serveur (`0058`), recherches sans résultat (`0047`) ; il manque la **vue agrégée** |

Ce qui manque est petit : un QR code, une mesure de visites, une page
« Mes clients » en lecture seule et quelques signaux de demande. Aucun de ces
manques ne touche à l'argent.

**Le second constat est plus dur.** Mesuré en production le 2026-10-27 :

```
products published        0     (10 au total, tous brouillons ou archivés)
profiles role = creator   1
orders payées/livrées     0
payments confirmed        1     (la commande en litige du 2026-08-22)
payments failed          14
zabelie_search_misses    69     (des gens cherchent, et ne trouvent rien)
zabelie_shop_follows      0  · zabelie_seller_domains 0 · zabelie_seller_pixels 0
zabelie_carts             2  · zabelie_affiliates 0 · zabelie_events 0
```

Une vitrine sans produit, un assistant sans catalogue et un CRM sans client
mesurent zéro. Leurs tests restent verts quand même. C'est le piège que
`CLAUDE.md` nomme « un filet sur un chemin impraticable », et la même
conclusion que `docs/46` (« rien avant la première gourde ») et `docs/62` §0.

**Recommandation (pas une décision) :** traiter Zabelie 2.0 comme un
**assemblage** de l'existant, pas comme une construction. Ne livrer que les
manques qui servent dès le premier vendeur actif. Le reste attend des données
réelles.

---

## 1. Ce que le brief affirme, et ce que le dépôt dit

Même méthode que `docs/40` §2.1 : un brief s'écrit de mémoire, un dépôt se
mesure. Aucune de ces lignes n'est un reproche.

| Affirmation du brief | Mesuré le 2026-10-27 |
|---|---|
| Livrable `docs/4X-…`, « prochain numéro libre » | 40 à 74 sont pris. **`68` aussi**, par `68-ASSISTANT-ACHAT.md`, qui est justement l'AI Seller. → **ce document est `docs/75`.** |
| « Zabelie Entelijan (CHANTIER-ZABELIE-ENTELIJAN.md) : couches E1/E2/E3, lister les 4 arbitrages bloquants » | **Référence morte**, déjà relevée deux fois : `docs/31-CHECKLIST-PRODUCTION.md:17-18`, `docs/62-CHANTIER-STUDIO-CREATIF.md:39-47`. Le fichier n'existe sur aucune branche. Aucune couche E1/E2/E3 n'est définie nulle part. **Les « 4 arbitrages bloquants » ne peuvent pas être listés sans être inventés.** La couche IA réelle est `lib/shopping-ai*.ts` (§5). |
| « Le LLM ne lit ni n'écrit les tables financières (preuve par confinement de rôle DB) » | **Aucun rôle Postgres dédié n'existe** (zéro `create role` dans `supabase/migrations/`, constat déjà fait en `docs/62:43-47`). Le confinement réel est **plus fort** : le modèle ne reçoit jamais la base, seulement `{previous, message, allowedKinds}` (`lib/shopping-ai-provider.ts:12-16`). Le catalogue est lu par le code, sous la RLS de session (`lib/shopping-ai-catalogue.ts:6-9`). Voir §5.3. |
| « `create_pending_order`, le RPC serveur existant » | **N'existe pas.** `supabase/migrations/0042_order_ref.sql:18-22` le dit déjà, pour un brief antérieur qui demandait la même chose. Les commandes naissent par insertion serveur, et le numéro par trigger. |
| « Checklist production `docs/29` (C1–C6) » | `docs/29` = FACTURATION-VENDEUR. La checklist est **`docs/31`** (§3 ci-dessous). |
| « Minimisation BL-115 » | `BL-115` = « `redactPayment` sur le pipeline topup » (`docs/REVUE-2026-07-15-team-agents.md:147`). L'exigence (pas d'export libre des numéros) est juste, mais elle ne porte pas ce numéro. Elle est **déjà tenue** : l'export de compte ne lit que les commandes dont on est l'acheteur (`app/api/account/export/route.ts:31`, `lib/collection-export.ts:51`). |
| « Les 7 invariants agents, invariant 7 (anti-doublon) » | Aucun document ne les énonce (déjà relevé en `docs/40:54`). La règle anti-doublon existe, elle, dans `CLAUDE.md` (Méthode) et `docs/25`. |
| « Ce qui relève du marketing avancé reste dans Zabelie Visibilité » | **Aucun module de ce nom.** Le seul « Visibilité » du dépôt est un mot d'un rapport technique (`docs/67:2097`). |
| « Produits numériques payants : hors périmètre, à valider par le Cabinet Volmar » | **Déjà en ligne** depuis la V1 : kind `fichier`, téléchargement gardé par le paiement (`docs/31` C1.5), entitlements `0104`. La question Volmar ouverte est celle de la **rétention en général** (`docs/17`), pas du numérique en particulier. |
| « Domaine personnalisé : hors périmètre v1, juste noté » | **Déjà construit** le 2026-10-04 (`0125`, `proxy.ts`, `/admin/domaines`), avec branchement manuel par l'admin et réservé aux vendeurs vérifiés. Il est utilisé zéro fois. |
| « Route `zabelie.com/store/<slug>` » | **Ce serait un doublon** de `/boutik/<slug>`. `/createur/<id>` répond déjà en second (`app/boutik/[slug]/page.tsx:13-16`). Une troisième adresse ferait trois URL pour une seule vitrine. |
| Commission 2 paliers, J+7 | ✅ Conforme à V-12 (`docs/02:27`). ⚠️ Le palier Elite **n'a pas de porte** (V-16, `docs/02:25`) et `docs/71` laisse **7 décisions ouvertes** sur la commission. |
| Afrique exclue | ✅ Aucune occurrence de rail, langue ou fonction africaine dans `docs/02` ni `CLAUDE.md`. Rien à retirer. |

---

## 2. Phase REA : les quatre modèles

**Statut de cette section : inférence.** Les mécanismes ci-dessous viennent de
la connaissance publique de ces produits. **Aucune de leurs pages n'a été
ouverte ni instrumentée pour ce document.** C'est la leçon de `docs/45` : un
argument n'est pas une mesure. On extrait des principes, on ne copie ni
interface, ni texte, ni marque.

### 2.1 Linktree / Liinks : une adresse qu'on retient

- **Mécanisme central.** Une URL courte et stable, posée une fois dans une bio,
  qui renvoie vers tout le reste. La valeur vient de **la stabilité de
  l'adresse** : on change ce qu'il y a derrière, jamais le lien.
- **Modèle de données implicite.** Profil → liste ordonnée de liens → compteur
  de vues et de clics par lien et par jour.
- **Parcours clés.** Le créateur colle son lien dans Instagram ou TikTok. Le
  visiteur tape dessus et arrive sur une page qui charge vite. Il clique.
- **Ce qui retient.** Les statistiques (« 340 visites cette semaine ») et la
  facilité de mise à jour. Le QR code fait le pont avec le monde physique.
- **Transposable.** `/boutik/<slug>` **est déjà** cette adresse stable. Il
  manque **le QR** et **le compteur de visites**.
- **Non transposable.** Les **liens sortants libres**. Une vitrine Zabelie qui
  renvoie vers un paiement externe sort l'acheteur du séquestre, qui est la
  raison d'acheter sur Zabelie (principe P4 de `REVUE-2026-10-26-audit-rea.md`).
  C'est aussi un vecteur d'hameçonnage sous la marque Zabelie.

### 2.2 Shopify : un catalogue, plusieurs portes

- **Mécanisme central.** Un seul catalogue (produit → variantes → stock),
  projeté sur plusieurs canaux : boutique, réseaux, point de vente. Le stock
  ne se décompte qu'à un endroit.
- **Modèle de données implicite.** Shop → Products → Variants → Inventory →
  Orders. Le **client est dérivé des commandes**, il n'est pas saisi à part.
- **Parcours clés.** Le marchand publie une fois, le produit apparaît partout.
  Le client paie dans le tunnel du marchand.
- **Ce qui retient.** Le coût de départ : les données, les thèmes et les apps
  accumulés.
- **Transposable.** « Un catalogue, plusieurs portes » est **déjà vrai** :
  vitrine, catalogue, assistant et API v1 lisent les mêmes `products` /
  `zabelie_product_variants` / `zabelie_stock` (`0036`). Le principe utile
  pour le CRM est que **le client se dérive de la commande**.
- **Non transposable.** Les **thèmes libres**, qui casseraient la porte de
  contraste en CI, le poids 3G (P6) et la cohérence A4 (« l'incohérence se lit
  comme du risque »). Le **paiement au nom du marchand** non plus : Zabelie
  est l'intermédiaire unique, avec séquestre, et le domaine du vendeur ne voit
  jamais un paiement (`0125`, commentaire de tête). Pas de magasin d'apps.

### 2.3 HighLevel : le contact, l'étape, le déclencheur

- **Mécanisme central.** Une fiche contact unique, une suite d'étapes
  (« pipeline ») et des **automatismes** (SMS, e-mail) déclenchés par le
  passage d'une étape à l'autre.
- **Modèle de données implicite.** Contact → Opportunité → Étape → Workflow →
  Messages envoyés.
- **Parcours clés.** Un prospect entre, il est relancé automatiquement, il
  avance d'étape, il achète.
- **Ce qui retient.** Les automatismes qui tournent seuls. Une fois en place,
  partir coûte cher.
- **Transposable.** Les **étapes existent déjà** : ce sont les états de
  commande et de remise (`zabelie_fulfillment`, `0043`). Le « À traiter » du
  tableau vendeur (`docs/73`) est déjà une vue de pipeline. Il manque la vue
  **par client**.
- **Non transposable.** **L'import et l'export libres de contacts**, et les
  **relances de masse**. Un vendeur qui extrait les numéros de ses acheteurs
  les emmène sur WhatsApp, et la commande suivante sort de la plateforme
  (fuite, `docs/71` décision 6). Les relances exigent un consentement que
  Zabelie ne recueille pas aujourd'hui pour le vendeur, et un SMS est un
  service externe payant (règle de `CLAUDE.md`, Stack). Le brief les désactive
  en v1, à juste titre.

### 2.4 WhatsApp Business : la conversation est la boutique

- **Mécanisme central.** On vend là où le client parle déjà : catalogue dans
  le chat, réponses rapides, étiquettes de clients.
- **Modèle de données implicite.** Conversation → messages → étiquettes ;
  catalogue court attaché au numéro.
- **Parcours clés.** Le client écrit, le vendeur répond avec une fiche, on se
  met d'accord, on paie… souvent en dehors de l'app.
- **Ce qui retient.** Zéro installation : en Haïti, le client a déjà l'app.
- **Transposable.** **La conversation amène, la plateforme encaisse.** Le
  partage `wa.me` de la vitrine et des fiches existe déjà
  (`components/boutique-vue.tsx:127-136`). L'aperçu du lien (image OG) reste à
  prouver dans un vrai partage (`docs/31` C1.4). La messagerie interne existe
  (`0090`).
- **Non transposable.** **Payer dans le chat**, qui ferait sortir du séquestre.
  **L'API WhatsApp Cloud** : service externe, coût par conversation, numéro
  vendeur exposé, et elle ne peut rien garantir sur le paiement.

### 2.5 Ce qu'on en retient

| # | Principe | Vient de | Déjà chez Zabelie ? |
|---|---|---|---|
| R1 | Une adresse stable qu'on peut imprimer | Linktree | Adresse oui ; **QR non** |
| R2 | Le vendeur voit que sa vitrine vit (visites, conversion) | Linktree | **Non** : aucune mesure de visite |
| R3 | Un catalogue, plusieurs portes, un seul stock | Shopify | **Oui** |
| R4 | Le client se dérive de la commande, il ne se saisit pas | Shopify / HighLevel | Données oui ; **vue non** |
| R5 | La demande non servie est une information pour le vendeur | HighLevel (inversé) | Mesurée (`0047`) mais **vue par l'admin seulement** |
| R6 | La conversation amène, la plateforme encaisse | WhatsApp | **Oui** (partage + messagerie + séquestre) |

---

## 3. Prérequis : la checklist de production (`docs/31`)

Lu le 2026-10-27, en-têtes de section. ⚠️ `docs/31` prévient lui-même qu'il
se périme (lignes 30-36). Ces statuts sont ceux du document, pas une nouvelle
mesure.

| Bloc | Statut déclaré | Effet sur Zabelie 2.0 |
|---|---|---|
| C1 Clé storage (`:38`) | ✅ avec deux restes | Le QR et l'aperçu WhatsApp supposent des images ; C1.4 (OG dans un vrai partage) reste à prouver |
| C2 Observabilité (`:66`) | ☐ « le vrai chantier neuf » | Une mesure de visites sans observabilité ne dira pas quand elle s'arrête |
| C3 Anti-fuite RLS en CI (`:96`) | 🟡 trois quarts | Toute vue CRM s'appuie dessus |
| C4 Chaîne financière vendeur (`:124`) | 🟡 deux tiers | Hors périmètre de ce chantier, mais aucun « encaisser » réel sans elle |
| C5 Litiges et remboursements (`:149`) | ☐ | Le litige du 2026-08-22 est toujours ouvert |
| C6 Recherche et onboarding (`:164`) | 🟡 | C'est le goulot réel : 0 produit publié |

**Prérequis non négociable avant tout PR-Z de code :** au moins un vendeur avec
des produits **publiés avec photo**. Sinon, chaque écran ci-dessous affiche zéro.

---

## 4. Matrice d'audit : les 15 services

Légende : ✅ fonctionnel · 🟡 partiel · 📝 spécifié, pas codé · ⬜ absent ·
⛔ volontairement bloqué. « Prod » = lignes mesurées le 2026-10-27.

| # | Service | Statut | Preuve | Prod | Réutilisable ? |
|---|---|---|---|---|---|
| 1 | Mini-site vendeur | ✅ | `app/boutik/[slug]/page.tsx`, `components/boutique-vue.tsx` (173 l.) ; confiance `0153` | 1 vendeur, 0 produit publié | **Oui, c'est la base du Smart Store** |
| 2 | Boutique intelligente | 🟡 | catalogue + variantes + stock `0036:87`, panier `0058:25,35`, groupage `0128` ; **pas de QR, pas de stats** | 2 paniers | Oui |
| 3 | Assistant vendeur IA | ✅ V1 | `docs/68`, `app/api/ai/shopping/route.ts`, `lib/shopping-ai*.ts` (282 l.), `tests/shopping-ai.test.ts` | n/a (aucune table, voulu) | **Oui, c'est l'AI Seller** |
| 4 | Paiements intégrés | 🟡 | MonCash, Stripe, Zelle (`CLAUDE.md` règle 2) ; séquestre, J+7 | 1 confirmé, 14 échoués | Hors périmètre (argent) |
| 5 | CRM vendeur | 🟡 | contact par commande payée `app/mes-ventes/page.tsx:139,153` ; « À traiter » `docs/73` ; **pas de vue client agrégée** | 0 commande payée | Oui, en lecture |
| 6 | WhatsApp Business | 🟡 | partage `wa.me` `components/boutique-vue.tsx:127-136` ; pas d'API, voulu | — | Partage oui ; API non |
| 7 | Réservations | 📝 + ⛔ | Tikè Lakay `docs/40` ; `0086:72,125` crée événements **gratuits seulement**, aucun code applicatif ne les lit | 0 événement | Plus tard : acompte = argent + rétention |
| 8 | Produits numériques | ✅ | kind `fichier`, `0104:40`, `app/api/download` | — | Déjà en V1 |
| 9 | Marketing automatisé | 🟡 | relance des paiements échoués `0124:67` (e-mail, une fois, désabonnement) ; ventes flash `0080:43` ; codes promo | 0 relance | Oui, sans extension v1 |
| 10 | Affiliation | ✅ code, 0 usage | `0081:76,119` (attribution figée), `lib/affiliation.ts`, `proxy.ts` | 0 affilié | Hors périmètre (argent) |
| 11 | Fidélisation | ⛔ | points `0021:97`, débranchés, **bloqués par D-6** (`CLAUDE.md:319-330`, `tests/fidelite-discipline.test.ts`) ; suivi de boutique `0102:25` ✅ | 0 point, 0 suivi | Le **suivi** oui ; les points non |
| 12 | Analytics IA | ⬜ | aucune mesure de visite (grep `vues/visites/views` = 0 dans `app/tableau-de-bord`) ; recherches sans résultat `0047:146` vues par l'admin seulement (`lib/entonnoir.ts`) | 69 recherches ratées | `0047` oui, côté vendeur à construire |
| 13 | Livraison intelligente | 🟡 | remise par le vendeur (`zabelie_fulfillment` `0043:105`), points de retrait `0082`, zones ; Zabelie ne livre pas (consigne du 2026-10-05) | — | Hors périmètre |
| 14 | Générateur de contenu IA | ✅ | Studio créatif `0118:44`, `0119`, `app/tableau-de-bord/studio` ; description IA `app/api/ai/description` ; création éditoriale `0141`–`0149` (`docs/70`) | — | **Ne rien recréer** |
| 15 | Automatisation commerciale | 🟡 | API v1, clés `0121`, webhooks `0122`, pixels `0123` | 0 pixel | Oui, sans extension v1 |

**Lecture.** Sur 15 services : 5 fonctionnels, 7 partiels, 1 spécifié, 1
bloqué volontairement, 1 absent. L'absent (analytics vendeur) et deux partiels
(QR, vue client) forment le vrai périmètre du chantier.

---

## 5. Spécification des trois priorités

Règles communes à tout ce qui suit : préfixe `zabelie_`, RLS dès la création,
aucune fonction `security definer` exposée à `anon` sans garde (et
`revoke … from public, anon, authenticated` explicite, piège Supabase relevé à
l'audit Etsy), textes en kreyòl d'abord dans les quatre langues, tokens de
`app/zabelie-theme.css`, tests connu-positif **et** connu-négatif, et une
mutation qui rougit chaque garde.

### 5.A Smart Store = `/boutik/<slug>` complété

**On ne crée pas de route.** On complète la vitrine existante.

| Élément | Existe | À faire | Migration ? |
|---|---|---|---|
| Adresse stable | ✅ `/boutik/<slug>` | — | — |
| Même catalogue, stock, commandes | ✅ | — | — |
| Nom, bio, avatar, note, ancienneté | ✅ `0153` | — | — |
| Partage WhatsApp | ✅ | Prouver l'aperçu OG dans un vrai partage (`docs/31` C1.4) | — |
| Entrée vers l'assistant de la boutique | ✅ `boutique-vue.tsx:138` | — | — |
| **QR code** | ⬜ | SVG généré côté serveur, sans service externe, dans `/tableau-de-bord/boutique` (page créée par `docs/73`) : « Télécharger mon QR » + affiche imprimable A5 | Non |
| **Visites et conversion** | ⬜ | Compteur first-party agrégé (ci-dessous) | **Oui** |
| Logo | 🟡 avatar | Rien en v1 : l'avatar fait office de logo | — |
| Couleurs | ⬜ | **Arbitrage A5.** Recommandation : aucune en v1 | Peut-être |
| Domaine personnalisé | ✅ `0125` | Rien | — |

**Compteur de visites (PR-Z2), conçu pour ne rien apprendre sur personne :**

- Table envisagée `zabelie_boutik_visites (seller_id uuid → profiles.id, jour date, vues integer ≥ 0, primary key (seller_id, jour))`. Aucune IP, aucun identifiant, aucun cookie, aucun référent stocké.
- Incrément par une fonction `security definer`, `search_path` épinglé, **réservée au service** (`revoke … from public, anon, authenticated`), appelée depuis le rendu serveur de `/boutik/<slug>` et du domaine personnalisé. Les robots connus sont filtrés par user-agent. Le rendu n'échoue jamais si le compteur échoue.
- RLS : `select` pour le seul propriétaire (`seller_id = auth.uid()`), rien pour `anon`, aucune écriture client.
- Conversion = commandes **payées** du vendeur sur la période ÷ vues. Le numérateur se lit dans `orders`, **jamais dans `sales_count`**, qui n'est pas adossé au paiement (`REVUE-2026-10-26-audit-rea.md`, annexe).
- Le service worker et le cache faussent les mesures (gotcha du 2026-10-12) : la page reste `force-dynamic` (`page.tsx:8`), donc le compteur voit chaque rendu serveur.
- Rétention : 400 jours glissants, purgés par un cron journalisé (motif `app/api/stock/expire/route.ts:40`). **Durée à trancher (A4).**

**Tests.** Positifs : la vue incrémente, le propriétaire lit ses lignes. Négatifs :
`anon` ne lit rien, un autre vendeur ne lit rien, `authenticated` ne peut pas
appeler l'incrément, un robot n'incrémente pas, une erreur du compteur n'empêche
pas la page de s'afficher. Mutation : retirer le `revoke` doit faire rougir le
test d'appel `anon`.

**Risques.** (1) Le compteur mesure des zéros tant qu'il n'y a pas de produit.
(2) Une stat flatteuse mais fausse (robots, rechargements) se lit comme une
promesse. Afficher « vues de la page », jamais « clients ».

### 5.B AI Seller = l'assistant d'achat V1, consolidé

**On ne crée pas d'« Entelijan ».** La couche existe et respecte déjà toutes
les exigences du brief :

| Exigence du brief | Où c'est tenu |
|---|---|
| Recherche réelle, jamais de prix, stock ou délai inventé | Le catalogue est lu par le code sous RLS (`lib/shopping-ai-catalogue.ts:9`) ; prix = minimum des variantes **en stock** (`:17-19`) ; zéro à trois offres, jamais de produit fictif (`docs/68:29-30`) ; le prompt interdit d'inventer (`lib/shopping-ai-provider.ts:9-10`) |
| Assistant global et assistant de la boutique, isolés | `/assistant` et `/assistant?vendeur=<id>` ; filtre `sellerId` dans la lecture (`shopping-ai-catalogue.ts:9`) **et** dans le classement (`:25`) |
| L'IA propose, l'utilisateur crée la commande | « Choisir et payer » ouvre la fiche, puis le checkout existant ; prix et stock revérifiés par la base (`docs/68:37-42`) |
| Aucun accès aux tables financières | Le modèle ne reçoit que `{previous, message, allowedKinds}` (`shopping-ai-provider.ts:12-16`), aucun outil, sortie JSON validée par schéma |
| Kreyòl | Quatre langues, test de collecte « goud » présent (`tests/shopping-ai.test.ts`) |

**Ce qui manque vraiment (PR-Z5, sans migration) :**

1. **Le cas du brief en test.** « Mwen bezwen yon telefòn Samsung ki pa depase
   20 000 goud. » Connu-positif : `budgetHtg = 20000`, `query` contient
   « samsung » ou « telefòn », kind physique, au plus trois offres sous
   20 000 HTG, toutes en stock. Connu-négatif : « 200 dola » donne
   `budgetHtg = null` (jamais de conversion, `docs/68:22`). Second négatif : une
   boutique sans offre sous budget rend zéro, pas un produit hors budget. Le
   fournisseur IA est simulé, sans appel facturable.
2. **Le confinement prouvé par la structure, puisqu'il n'y a pas de rôle
   DB.** Test statique : `lib/shopping-ai-provider.ts` n'importe aucun client
   Supabase, aucun module `wallet`/`payout`/`escrow`/`ledger`, et le corps
   envoyé au fournisseur ne contient que les trois clés autorisées. Mutation :
   ajouter un import Supabase au module doit faire rougir le test. C'est
   l'équivalent honnête de la « preuve par confinement de rôle » demandée,
   tant que l'arbitrage A1 n'a pas créé de rôle.
3. **Un compteur d'usefulness sans données personnelles** : nombre de
   sessions qui rendent ≥ 1 offre, nombre de zéros. Il entre dans le même
   motif que les recherches ratées (`0047`) : **une requête de l'assistant qui
   ne trouve rien est une demande non servie.** Rien n'est stocké du message.
   **Option à trancher (A7)**, parce que ça demande une écriture en base.

**Ce qu'on ne fait pas.** Pas de mémoire de conversation, pas de canal
WhatsApp ou Messenger, pas de vecteurs (`docs/68:77-83`, choix déjà posés).
Pas d'assistant « qui parle au nom du vendeur » : il répondrait sur des délais
et des conditions que personne n'a écrits.

### 5.C Business CRM léger = « Mes clients », en lecture seule

**On ne crée pas de table client.** `zabelie_biz_clients` (`0022:63`) existe,
mais c'est le carnet du module de facturation pro (`docs/12`), saisi à la main.
Le réutiliser mêlerait deux notions. Le client du CRM se **dérive** des
commandes payées (principe R4).

Page envisagée : `/tableau-de-bord/clients`, dans le menu de `docs/73`
(`components/vendeur-shell.tsx`), avec la même garde que les autres pages
vendeur (session, compte suspendu renvoyé vers l'accueil).

| Bloc | Source | Données personnelles | Migration ? |
|---|---|---|---|
| Clients distincts et clients revenus (≥ 2 commandes payées) sur 30 / 90 jours | `orders` du vendeur, statuts payés, sous RLS existante | Prénom et commune seulement dans la liste ; le téléphone reste sur la commande, comme aujourd'hui | Non (PR-Z3) |
| Produits les plus vendus | `orders` payées, groupées par produit | Aucune | Non |
| Commandes à traiter | existe (`docs/73`) | — | — |
| Nombre d'abonnés à la boutique | `zabelie_shop_follows` (`0102:25`) : la RLS ne laisse lire que ses propres suivis, donc il faut une fonction de **comptage** | **Le nombre seul**, jamais qui | Oui (PR-Z4) |
| « Dans des paniers en ce moment » | `zabelie_cart_items` (`0058:35`) : comptage par produit du vendeur | **Le nombre seul**, jamais qui ; masqué sous 3 | Oui (PR-Z4) |
| Demande non servie dans ses catégories | `zabelie_search_misses` (`0047:146`) agrégé par catégorie | Termes agrégés, **seuil d'anonymat** (≥ 5 occurrences, à trancher en A7) | Oui (PR-Z4) |

**Garde-fous :**

- **Aucun export.** Pas de bouton CSV, pas de route d'export côté vendeur.
  L'export de compte reste limité à ses propres achats (`app/api/account/export/route.ts:31`).
- **Aucune relance du vendeur vers l'acheteur en v1.** La seule relance
  existante (`0124`) est envoyée par Zabelie, une fois, avec désabonnement en
  un clic. On ne l'étend pas.
- **Un panier abandonné n'est jamais nominatif** pour le vendeur. Sinon,
  l'acheteur qui hésite reçoit un WhatsApp du vendeur, et la commande sort de
  la plateforme.
- Les fonctions de comptage (PR-Z4) sont `security definer`, ne rendent
  **que des entiers** pour `seller_id = auth.uid()`, et sont révoquées
  d'`anon`.

**Tests.** Positifs : le vendeur A voit ses compteurs. Négatifs : A ne voit
rien de B ; `anon` ne voit rien ; une commande `pending` ou `failed` ne compte
pas comme client ; un compteur de panier à 2 s'affiche « moins de 3 » ; aucune
réponse de fonction ne contient d'uuid d'acheteur (test sur la forme du JSON).
Mutation : retirer le filtre `seller_id = auth.uid()` doit faire rougir le
test croisé A/B.

**Risques.** Afficher des chiffres flatteurs sans volume : « 0 client » est
honnête, « Aucun client pour l'instant : partagez votre QR » est utile.

---

## 6. Hors périmètre : à valider par le Cabinet Volmar

Ces sujets impliquent un flux d'argent ou une valeur stockée. Ils relèvent du
dossier ouvert `docs/17` (rétention sur compte marchand unique, `CLAUDE.md:295-305`).
**On les signale, on ne les conçoit pas.**

| Sujet | État réel | Pourquoi il attend |
|---|---|---|
| Affiliation | **Construite** (`0081`), 0 affilié | Commission versée à un tiers ; argent |
| Cashback / points | **Construits et débranchés** (`0021`), bloqués par D-6 | Valeur stockée ; qui paie la remise (`docs/71` décision 7) |
| Réservations avec acompte | Spécifiées (`docs/40`), table gratuite seulement (`0086`) | 60 jours de rétention possibles ; verrou `docs/40` §1 |
| Produits numériques payants | **Déjà en ligne** | Rien de nouveau à valider ; la question Volmar est générale |

---

## 7. Abonnements : un conflit de noms, et un problème avant les noms

**Conflit de noms (confirmé).**

- « **Elite** » est le palier de commission (V-12). Un abonnement « Pro AI »
  ou « Business » à côté brouillerait la seule hiérarchie que le vendeur doit
  comprendre.
- « **Business** » existe déjà : *Zabelie Business*, le module pro de
  facturation (`docs/12`, `/pro`, tables `zabelie_biz_*`).
- « **Pro** » existe aussi : la route `/pro`, et c'est le nom d'un palier déjà
  refusé dans V-12 (« 4 tiers Starter/Standard/Pro/Elite… n'est PAS retenu »).

**Noms proposés** (kreyòl d'abord, aucun ne recoupe un palier ou un module) :

| Proposition | Sens |
|---|---|
| **Boutik Plis** | la vitrine avec QR, stats et page clients |
| **Boutik Asistan** | la même, plus l'assistant de boutique mis en avant |

**Le problème avant les noms.** Un abonnement est un **nouveau revenu
récurrent** à côté de la commission, donc une décision de positionnement
(zone d'arrêt). Côté argent :

- `docs/03-PAIEMENTS.md` ne décrit **aucun prélèvement récurrent** (recherche
  « récurren / recurring / abonnement » : zéro résultat). Un abonnement MonCash
  serait donc un **paiement manuel chaque mois**, avec relance et coupure
  d'accès.
- Les 7 décisions de `docs/71` (minimum par commande, frais MonCash, offre
  fondateur…) fixent le prix réel de Zabelie pour le vendeur. Ajouter un
  abonnement avant de les trancher, c'est empiler deux tarifs dont aucun n'est
  calibré, sur 0 vente.

**Recommandation :** aucun abonnement tant que `docs/71` n'est pas tranché.
Les fonctions du §5 sont gratuites et incluses. Elles coûtent peu et elles
servent l'objectif réel : la première vente.

---

## 8. Découpage en PR

Une PR = une branche = un checkpoint humain. Les PR sont **indépendantes**
(aucune ne dépend du code d'une autre). L'ordre proposé suit le coût et la
réversibilité.

| PR | Contenu | Migration | Critères d'acceptation vérifiables |
|---|---|---|---|
| **PR-Z0** | Ce document | Non | Relu par le porteur ; arbitrages du §9 tranchés ou reportés par écrit |
| **PR-Z5** | Assistant : cas kreyòl du brief en test + test de confinement structurel | Non | (1) le test « 20 000 goud » passe, sa variante « 200 dola » rend `budgetHtg = null` ; (2) le test de confinement rougit quand on ajoute un import Supabase à `lib/shopping-ai-provider.ts` (mutation vérifiée par `grep -c` avant lecture du verdict) ; (3) zéro appel IA facturable en CI |
| **PR-Z1** | QR de la vitrine : SVG serveur + affiche A5 dans `/tableau-de-bord/boutique` | Non | (1) le QR décodé redonne exactement `https://zabelie.com/boutik/<slug>` (test de décodage) ; (2) vendeur sans slug : renvoi vers `/createur/<id>` via `hrefBoutique` (`lib/boutique-href.ts:20`), jamais un QR vide ; (3) compte suspendu : aucun QR ; (4) libellés en 4 langues, parité i18n verte ; (5) poids de la page < +5 Ko sur 3G ; (6) dépendance validée (A3), `npm audit --omit=dev` à zéro |
| **PR-Z3** | « Mes clients » sans migration : clients distincts, revenus, top produits, depuis `orders` payées | Non | (1) une commande `failed`/`pending` ne compte pas (test) ; (2) vendeur A ne voit pas B (test croisé) ; (3) aucun téléphone dans la liste ; (4) aucun bouton ni route d'export (test statique) ; (5) capture 360 px et bureau |
| **PR-Z2** | Compteur de visites + conversion | **Oui**, rédigée **non appliquée** | (1) RLS : `anon` 0 ligne, autre vendeur 0 ligne ; (2) `authenticated` ne peut pas incrémenter (`revoke` testé) ; (3) robot filtré ; (4) erreur du compteur → page rendue quand même ; (5) migration inscrite au registre avec SHA-256 ; (6) application **par le porteur** |
| **PR-Z4** | Signaux de demande : abonnés, « dans des paniers », recherches ratées par catégorie | **Oui**, rédigée **non appliquée** | (1) les fonctions ne rendent que des entiers ou des termes agrégés (test de forme JSON, aucun uuid) ; (2) seuil « moins de 3 » et seuil d'anonymat respectés ; (3) `anon` refusé ; (4) croisé A/B ; (5) application par le porteur |

**Ce qui n'a pas de PR, volontairement :** couleurs personnalisées (A5),
bouton WhatsApp direct vers le vendeur (A6), abonnements (§7), tout ce qui est
au §6.

**Quand ouvrir PR-Z2 et PR-Z4 :** recommandation, après le premier vendeur
actif avec des produits publiés. Avant, elles mesurent zéro.

---

## 9. Arbitrages pour Philippe

> ✅ **Tranché le 2026-10-27** : « Suis les recommandations pour les 10
> arbitrages, fusionne ». Chaque ligne ci-dessous est retenue telle que
> recommandée. Inscrit au registre : **`docs/02-DECISIONS.md` V-24**.

| # | Question | Options | Recommandation de l'agent |
|---|---|---|---|
| **A1** | « Zabelie 2.0 » et « Entelijan » : quels noms, et pour quoi ? | (a) « 2.0 » reste un nom de chantier interne, l'assistant garde son nom actuel ; (b) « Entelijan » devient le nom public de l'assistant ; (c) Entelijan désigne une future couche avec rôle DB dédié, à spécifier | (a). Entelijan n'existe nulle part ; lui donner un sens maintenant, c'est créer une nouvelle couche sans besoin mesuré |
| **A2** | Adresse de la vitrine | (a) `/boutik/<slug>` (existante) ; (b) ajouter `/store/<slug>` | (a). Une troisième adresse pour la même page serait un doublon, et `boutik` est déjà kreyòl |
| **A3** | QR code : ajouter une petite bibliothèque npm (génération locale, aucun service externe) ? | oui / non (alors, écrire l'encodeur à la main) | Oui, une bibliothèque pure, version épinglée, auditée avant ajout |
| **A4** | Mesurer les visites des vitrines (migration) ? Durée de conservation ? | oui 400 j / oui 90 j / non | Oui, 400 jours (comparer une année sur l'autre), agrégé par jour, sans IP |
| **A5** | Couleurs choisies par le vendeur | (a) aucune en v1 ; (b) palette fermée de 4 à 6 teintes validées par la porte de contraste | (a). L'orange est réservé au CTA et aux prix (`docs/02` V-22 ; `REVUE-2026-10-26-audit-rea.md:170`) ; une palette libre casse la cohérence |
| **A6** | Bouton « Écrire sur WhatsApp » vers le numéro du vendeur | (a) non : partage + messagerie interne ; (b) oui | (a). C'est la fuite que `docs/71` décision 6 propose de mesurer, pas d'encourager |
| **A7** | Signaux de demande : seuils | « moins de 3 » pour les paniers ; ≥ 5 occurrences pour les recherches ; compteur de zéros de l'assistant oui/non | Ces seuils, et le compteur de l'assistant oui |
| **A8** | Abonnements | (a) aucun avant `docs/71` ; (b) « Boutik Plis » / « Boutik Asistan » en HTG, paiement manuel mensuel MonCash | (a). Puis (b) quand le prix de la commission est fixé |
| **A9** | Ordre de travail | (a) PR-Z5 et PR-Z1 maintenant, Z3 ensuite, Z2/Z4 après le premier vendeur actif ; (b) tout maintenant ; (c) rien avant le premier vendeur actif | (a). Z5 et Z1 ne coûtent rien et servent le premier vendeur ; Z2/Z4 demandent une migration qui mesurerait zéro |
| **A10** | Rappel, hors de ce chantier mais bloquant pour « encaisser » | `docs/71` (7 décisions), litige du 2026-08-22, `docs/31` C2 et C5 | Les trancher avant toute fonction payante |

---

## 10. Ce que ce document n'a pas fait

- **Aucune page des quatre modèles ouverte** : le §2 est une inférence (§2, en-tête).
- **Aucun rendu de `/boutik/<slug>` en ligne vérifié** pour ce document : il
  n'y a pas de produit publié à montrer. L'état de la vitrine vient du code et
  de `0153`.
- **Aucune écriture en production** : seulement des `select` de comptage, le
  2026-10-27.
- **Aucun code, aucune migration, aucune fusion.** Le checkpoint est la PR.
