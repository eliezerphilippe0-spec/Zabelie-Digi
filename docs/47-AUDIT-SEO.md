# 47 — Audit de la surface indexable

**Date : 2026-08-28.** Périmètre : SEO technique de la marketplace (pas le
topup, pas `app/rechaj`). Méthode : lecture du dépôt + une lecture en base.

⚠️ **Chaque ligne porte sa qualité de preuve.** « Constaté » = lu dans le
dépôt ou mesuré en base. « Supposé » = hors de portée de mesure depuis une
session d'agent (variables d'environnement Vercel, DNS, Search Console). Les
deux ne se valent pas et ne doivent jamais être lus comme équivalents.

---

## 0. Le fait qui commande tout le reste

Mesuré en base le 2026-08-28, projet `zabelie-digi`, lecture seule :

| | |
|---|---|
| produits publiés | **2** |
| produits avec image (`cover_url`) | **0** |
| recherches sans résultat enregistrées | **1** |
| termes distincts | **1** |
| sessions distinctes | **1** |
| fenêtre du capteur | 2026-08-14 → 2026-08-14 (un seul jour) |
| seuil `min_sessions` en config | **3** |

**Aucune stratégie de mots-clés ne se classe sur un catalogue de deux
prestations sans visuel.** Google ne peut pas classer ce qui n'existe pas, et
un acheteur qui atterrirait dessus repartirait. Tant que ce tableau ne change
pas, **le SEO n'est pas le goulot d'étranglement de Zabelie.**

Ce document existe donc pour deux raisons, et deux seulement :

1. consigner les correctifs **peu coûteux et qui ne se démodent pas**, faits
   dans `fd14175` ;
2. poser l'**arbitrage de la langue dans l'URL** (§3), qui est le seul point
   dont le coût augmente avec le temps — et qui est donc le seul à ne pas
   pouvoir attendre.

---

## 1. Corrigé le 2026-08-28 — `fd14175`

Les quatre relèvent du même motif : **un fichier décidait seul d'une chose
qu'un autre fichier décidait déjà, et les deux divergeaient en silence.**

### 1.1 Une seule fonction résout l'origine du site

`app/robots.ts` et `app/sitemap.ts` lisaient
`process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"`. `app/layout.tsx`
passe, lui, par `siteUrl()` (`lib/site-url.ts`), qui retombe **d'abord** sur
l'URL injectée par Vercel. Sur un déploiement sans la variable, les canoniques
annonçaient une origine et le sitemap une autre.

### 1.2 Six replis de domaine, trois comportements → un seul

`lib/stripe.ts`, `lib/zabelie-notify.ts` (×2), `lib/messagerie-notify.ts`,
`lib/fulfillment-notices.ts`, `app/pro/facture/[id]/page.tsx`.

Deux d'entre eux retombaient sur `""`, ce qui produisait des URLs **relatives**
dans des e-mails transactionnels et dans le lien de partage de facture. **Ce
n'était pas du référencement : c'était un lien mort envoyé à un client.**

⚠️ **Deux lectures directes SUBSISTENT, et c'est voulu** — les appelants de
`siteOrigin()` (`app/auth/callback/route.ts`, `app/api/moncash/return/route.ts`)
ont besoin de la valeur *configurée* **et** de l'URL de la requête pour ne pas
casser le cookie de session entre apex et `www`. Leur passer `siteUrl()`, qui a
déjà tranché, leur retirerait l'information dont ils vivent.

### 1.3 Le sitemap déclare l'adresse canonique

Il émettait `/createur/<uuid>` — précisément l'URL que
`app/createur/[id]/page.tsx` canonicalise vers `/boutik/<slug>` — et omettait
`/boutik/<slug>`, la seule des deux qui porte un `generateMetadata` et la seule
qu'un vendeur colle dans WhatsApp. Il appelle désormais `hrefBoutique`.

`getBoutikSlug` (`lib/creators.ts`) est ajoutée pour ne pas charger le
catalogue complet de chaque vendeur au passage du crawler — `getCreator`
appelle `getProductsBySeller`. **Coût N+1 restant, documenté avec son seuil :
une lecture de fiche par vendeur, à remplacer par une fonction SQL en lot avant
quelques centaines de vendeurs.**

### 1.4 `/facture/[token]` n'est plus indexable

La page rend la facture d'un client identifié : numéro, montant, lignes, nom du
professionnel. Elle n'avait aucun `robots`.

Le jeton fait 24 caractères base64url (`estTokenFacture`, `lib/business.ts`) :
**il ne se devine pas.** Le risque n'était donc pas l'énumération mais la
**permanence** — un lien collé dans un groupe WhatsApp, un referrer qui fuit, et
la facture entre dans l'index pour des mois. Le jeton protège contre celui qui
cherche, pas contre celui qui tombe dessus.

### ⚠️ 1.5 Le piège qu'on a failli poser en croyant renforcer

**`disallow` et `noindex` se DÉFONT l'un l'autre.** Une URL interdite au crawl
n'est jamais lue, donc son `noindex` n'est jamais vu — et le moteur peut
indexer l'adresse nue sur la seule foi d'un lien entrant.

Ajouter `« /facture/ »` au `disallow` de `robots.ts` a **toutes les apparences
d'un renforcement** et **annulerait** la protection du §1.4.

C'est pourquoi `/facture` est **délibérément absent** du `disallow`. Cette
absence est *load-bearing*, rien dans aucun des deux fichiers ne le dit à qui
l'édite, et c'est exactement pourquoi elle est gardée par un croisement :
`tests/seo-surface.test.ts` **N2**.

Le partage qui en découle, et qui n'est pas une préférence :

* **`disallow`** pour ce qui n'a aucun intérêt d'entrée et rien à cacher — du
  budget de crawl, rien de plus (`/panier`, `/messages`, `/connexion`, ajoutés) ;
* **`noindex`** pour ce qui doit rester hors de l'index *même si* quelqu'un en
  partage le lien.

### 1.6 Les gardes, et leurs mutations

`tests/seo-surface.test.ts` — cinq contrôles, six mutations passées au rouge.

| | Mutation | |
|---|---|---|
| V-A | retirer le `noindex` | 🔴 |
| V-B | **ajouter** `/facture/` au `disallow` | 🔴 |
| V-C | revenir à la lecture directe dans `sitemap.ts` | 🔴 |
| V-D | refabriquer `/createur/` en dur | 🔴 |
| **V-E** | **détacher `robots:{index:false}` de `metadata`, sous-chaîne intacte** | 🔴 |
| V-F | vraie lecture directe dans un fichier sans commentaire | 🔴 |

**V-E est la seule qui apprenne quelque chose.** Elle laisse `index: false`
dans le fichier et le sort de l'export `metadata`. Une assertion écrite sur le
texte serait restée verte ; celle de N1 porte sur la liaison
`export → robots → index` et rougit. C'est la règle du dépôt appliquée : *une
assertion structurelle porte sur ce qui COMMANDE, jamais sur ce qui est
produit.*

**N4 a rougi avant qu'on le lui demande**, sur le commentaire qui explique la
correction — le filtre de commentaires ne connaissait pas `/*`. Le filtre a été
corrigé plutôt que le fichier exempté : exempter aurait ouvert exactement
l'angle mort que le test existe pour fermer. **V-F est le connu-négatif qui
prouve que le filtre ne cache pas de vrai code.**

---

## 2. Ce qui reste

### 2.1 Grave

| Problème | Fichier | Correction |
|---|---|---|
| **Aucune donnée structurée produit.** Le seul JSON-LD est `Organization` + `WebSite` + `SearchAction`. Zéro `Product`, `Offer`, `AggregateRating`, `BreadcrumbList`, `ItemList`. *(constaté)* | `app/page.tsx:219-243` | `Product`+`Offer`+`AggregateRating` sur `/produit/[slug]` : prix, devise, `in_stock` (`0040`), `rating_avg`/`rating_count` sont **déjà en base**. Meilleur impact/effort restant — mais il faut des fiches à décrire. |
| **`/catalogue` n'a ni `generateMetadata` ni canonical.** Sept paramètres (`q, cat, sous, page, zd, zk, zq`) partagent titre, description, et se canonicalisent sur eux-mêmes. *(constaté)* | `app/catalogue/page.tsx:21,33-45` | `generateMetadata` dynamique + canonical vers la version sans tri/zone ; `noindex` sur `q`, `zd`, `zk`, `zq`. |
| **Le sitemap déclare des URLs à query string** pour les rayons : `/catalogue?cat=<label_FR_encodé>`. Cimente le français comme langue canonique et lie le rayon à un libellé, pas à un slug. *(constaté)* | `lib/taxonomy.ts:256-259` | Routes de rayon en chemin (`/rayon/<slug>`). |

### 2.2 Moyen

| Problème | Fichier | Note |
|---|---|---|
| **Tout est `force-dynamic`** — 33 pages, zéro ISR/SSG. Chaque crawl frappe Supabase ; le TTFB est le premier levier CWV sur 3G. *(constaté)* | 33 fichiers | ISR sur `/produit/[slug]` et `/boutik/[slug]`. |
| **`next/image` seulement sur l'accueil.** Les cartes rendent un `<img>` nu, sans `srcset` ni `sizes`. *(constaté)* | `components/product-card.tsx:70-79` | ⚠️ À relativiser : **0 produit a une image**. Le problème amont est plus grave que l'optimisation. |
| **`getProductsForSitemap()` retombe sur les fixtures de démo** si Supabase n'est pas configuré → sitemap de produits fictifs. *(constaté)* | `lib/products.ts:568` | Rendre `[]` dans un contexte sitemap. |
| Limite **5000** produits, sans index de sitemaps. *(constaté)* | `app/sitemap.ts` | Plafond connu, non bloquant. |
| Produits retirés → `notFound()` (404), jamais 410, aucune redirection. *(constaté)* | `app/produit/[slug]/page.tsx:163` | Correct par défaut. |

### 2.3 À vérifier par le porteur — hors de portée d'un agent

* **`NEXT_PUBLIC_SITE_URL` est-elle posée en production ?** *(supposé — non
  mesurable ici, une variable d'environnement est une zone d'arrêt.)* Depuis
  `fd14175` le repli est l'URL Vercel plutôt que `localhost`, ce qui est
  meilleur mais reste un repli. ⚠️ `robots.txt` est **prérendu statiquement**
  (`○` au build) : sa valeur est figée au moment du build.
* **La redirection `www` → apex existe-t-elle au niveau Vercel/DNS ?**
  *(supposé — aucune redirection d'hôte dans le code, voir §4.)*

---

## 3. ⛔ L'arbitrage ouvert — la langue vit dans un cookie

**C'est le seul point de ce document dont le coût augmente avec le temps.**

### Le constat

`lib/i18n-server.ts:5-9` — `getLang()` lit `LANG_COOKIE`, repli `"fr"`.
**Un crawler n'envoie aucun cookie.** Donc :

> **Tout le site est indexé en FRANÇAIS. Il n'existe aucune URL kreyòl à
> indexer.**

Dans un produit kreyòl-first, sur un marché dont `docs/45` a mesuré que les
recherches se font **en kreyòl**. C'est une contradiction entre la stratégie
produit et la surface indexable, et elle est totale.

Le commentaire de `app/page.tsx:31-35` a raison sur le diagnostic — *« un
hreflang qui pointe quatre fois sur la même adresse est un signal faux »* — mais
la conclusion tirée fut de retirer hreflang. La conclusion juste est de **donner
une URL par langue**.

### Le coût, mesuré

| | |
|---|---|
| `href="/…"` statiques distincts | **24** |
| `href={\`/…\`}` dynamiques | **14** |
| routes publiques (`page.tsx` hors admin/api) | **31** |
| `redirect("/…")` serveur | **6** |
| URLs dans les e-mails transactionnels | **8** |
| **total des points de contact** | **83** |

**Une journée de travail aujourd'hui.** Ce chiffre ne fait que monter, et il
monte plus vite que le catalogue, parce que chaque page ajoutée en ajoute
plusieurs. **Avec deux produits, cette migration coûte presque rien.**

Et le point d'entrée existe déjà : **`proxy.ts`** (Next 16 a renommé
`middleware`) porte un `matcher` qui couvre déjà toutes les pages. La détection
de langue et la redirection depuis `/` y ont leur place toute trouvée.

### Recommandation — segment de chemin

`/ht/produit/<slug>`, `/fr/produit/<slug>`. Restructuration en `app/[lang]/…`,
détection et redirection dans `proxy.ts`, hreflang réel + `x-default`.

**Écartés, avec la raison :**

* **Sous-domaine (`ht.zabelie.com`)** — non. `lib/site-origin.ts` documente
  déjà, dans ce dépôt, que le changement d'origine casse le cookie de session :
  *« le couple zabelie.com / www.zabelie.com suffit à le casser »*. Quatre
  sous-domaines, c'est ce problème ×4 sur le chemin d'authentification.
* **Paramètre `?lang=ht`** — non. Traité comme du contenu dupliqué, pas comme
  une variante linguistique. Ça ressemble à une solution.

**Ne pas traduire les noms de routes** (`/ht/pwodwi/`) : double la surface de
redirection pour un gain marginal, et s'ajoute route par route plus tard.

### ⛔ Ce qui appartient au porteur, pas à l'agent

**Quelles langues méritent une URL indexée, et laquelle est à la racine ?**

`lib/i18n.ts` en porte quatre (ht, fr, en, es). Publier quatre versions quasi
identiques d'un catalogue de deux produits, c'est du *thin content* ×4.

Recommandation : **`/ht/` et `/fr/` indexées, `en` et `es` en cookie et
`noindex`** jusqu'à ce qu'il y ait de quoi les remplir. Mais c'est une décision
de **positionnement** — `docs/25` §4, zone d'arrêt. Elle se propose, elle ne se
prend pas.

⚠️ **Le repli `"fr"` de `getLang()` est déjà une réponse implicite à cette
question, et personne ne l'a jamais choisie.**

**Dépendance, et elle n'est pas bloquante** : la répartition Haïti / diaspora
détermine la langue racine. Construire la langue par défaut comme un
**paramètre** et non comme une constante permet de poser l'architecture
maintenant et de trancher la racine plus tard.

---

## 4. Corrections apportées à cet audit lui-même

Consignées parce que le mode d'échec compte plus que l'erreur.

* **« Pas de `middleware.ts` » était vrai au pied de la lettre et faux sur le
  fond.** Next 16 a renommé la convention : le fichier est **`proxy.ts`**, il
  existe, et il porte déjà un `matcher` universel. Conclure de l'absence d'un
  nom de fichier est le travers que `CLAUDE.md` nomme *« sans appelant n'est
  jamais une conclusion de grep »*, appliqué à un `ls`. **Le constat de fond
  tient : `proxy.ts` ne fait aucune redirection d'hôte** — il rafraîchit la
  session Supabase et pose le cookie d'affiliation.
* **`/facture/[token]` était marqué « supposé », il est devenu « constaté »**
  après lecture du fichier : `export const metadata = { title: … }` et rien
  d'autre.

---

## 5. Le capteur de recherche — ce qu'il capte, et ce qu'il ne capte pas

Trois corrections à une prémisse répandue :

1. **Le capteur, c'est `0047` seule** — pas 0045–0048. `0045` = profil à
   l'inscription, `0046` = acceptation CGU, `0048` = objets requis.
2. **Il ne capte QUE les recherches SANS RÉSULTAT.** `zabelie_search_misses`
   (`0047:146`). **Aucune table ne stocke les recherches abouties.** « Les
   termes les plus cherchés » n'existe pas dans ce dépôt. C'est un choix
   assumé : la table est un outil de **sourcing vendeur**, pas d'analytique.
3. **Il ne faut pas écrire de requête — la fonction existe.**
   `zabelie_search_demand(p_days, p_min_sessions)` (`0047:212`), révoquée à
   `anon`/`authenticated`, servie par `app/api/admin/search-demand/route.ts`.

```sql
-- ⚠️ p_min_sessions => 1 est INDISPENSABLE au démarrage : la config vaut 3,
-- aucun terme ne l'atteint à ce trafic, et la sortie vide se lirait comme
-- « le capteur ne capte rien ».
select * from zabelie_search_demand(p_days => 90, p_min_sessions => 1);
```

**Ce que ça rend aujourd'hui : une ligne** (voir §0). Avec le seuil par défaut :
**zéro**. Rétention 90 jours (`0053`) — le 2026-08-14 sortira de la fenêtre le
2026-11-12.

> C'est le cas que la doctrine du dépôt nomme : *un compteur à zéro doit pouvoir
> être opposé à une preuve que le chemin est praticable, sans quoi il atteste
> seulement qu'on n'a rien vu.* Ici la cause est en amont — 2 produits, 0 image.

---

## 6. Ordre recommandé

1. ✅ **Fait** (`fd14175`) — origine unique, replis unifiés, sitemap canonique,
   `noindex` facture.
2. ⛔ **Trancher §3** — la langue dans l'URL. Le seul point qui se paie plus
   cher chaque semaine.
3. **Mettre des produits et des images en ligne.** Rien de ce qui suit n'a
   d'effet avant.
4. JSON-LD `Product`/`Offer`/`AggregateRating` — dès qu'il y a des fiches.
5. `generateMetadata` + canonical sur `/catalogue`.
6. ISR sur `/produit` et `/boutik`.

**Et rien de tout ça avant la première gourde réelle** (`docs/22`, `docs/46`).
Un rail de confiance dont le chemin d'argent n'a jamais fonctionné une fois
n'est pas une stratégie.
