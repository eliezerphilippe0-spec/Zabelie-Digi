# API v1 — contrats de lecture « tool-ready »

> **Statut : routes servies.** Guide public : `/developpeurs`. Spécification générée depuis les contrats : `/api/v1/openapi.json`. Huit fonctions publiques, deux fonctions de commandes réservées à la session Zabelie.
>
> ⚠️ **Écart de nommage assumé.** Le brief demandait `docs/08-API-V1.md` ;
> `docs/08-INSPIRATION-P1.md` occupe déjà ce numéro. Renommer si le porteur
> préfère.

## ✅ SERVIE DEPUIS LE 2026-08-22 — et ce qu'elle n'était pas avant

⚠️ **Pendant environ trois semaines, cette couche n'a existé qu'en types.** Neuf
contrats déclarés dans `V1_ENDPOINTS`, 28 tests verts, et **aucune route
HTTP** : `grep -rn "V1_ENDPOINTS" app/ lib/` ne rendait que la ligne de sa
propre déclaration. Les tests prouvaient une chose vraie et inutile — que des
schémas valident ce qu'on leur donne.

Trouvé par l'inventaire `docs/44` sur une question du porteur, servi le même
jour. La section « Endpoints » de ce document se terminait alors par
« *à compléter au fil des commits 3 à 7* » : ces commits n'ont jamais eu lieu,
et rien ne l'avait signalé. **Un artefact jamais invoqué ne lève rien, ne
journalise rien, ne ralentit rien.**

Le garde qui empêche que ça recommence est `tests/api-v1-routes.test.ts` : il
croise `V1_ENDPOINTS` et `V1_HANDLERS` **dans les deux sens**, et il échoue si
la route disparaît.

### Comment on l'appelle

```bash
curl -X POST https://zabelie.com/api/v1/search_products \
     -H 'content-type: application/json' \
     -d '{"query":"preset","limit":5}'
```

**Une seule route** — `app/api/v1/[endpoint]/route.ts` — pilotée par le
registre. Un nom absent de `V1_ENDPOINTS` rend 404 avant d'atteindre le moindre
code. Neuf fichiers de route auraient rouvert le trou que le registre existe
pour fermer : rien n'empêche d'écrire une route sans jamais toucher au
registre.

### ⚠️ Pourquoi `POST` sur une API de LECTURE

Contre-intuitif, et c'est le contrat qui tranche, pas le goût. Les entrées sont
typées en JSON strict — `limit: z.number().int()`, `ids: z.array(UuidSchema)`.
Une chaîne de requête ne transporte que du texte : `?limit=20` arriverait en
`"20"` et serait **refusé**. Servir en `GET` exigerait une couche de coercition
entre l'appelant et le schéma — c'est-à-dire de deviner ce que l'appelant
voulait dire, dans la seule couche qui existe pour ne rien deviner. Et
`compare_products` prend un **tableau**, que les chaînes de requête ne savent
pas représenter sans convention.

L'alternative honnête serait de passer les schémas en `z.coerce` — mais
« modifier un champ existant est une rupture qui exige `/v2/` ».

Ces requêtes ne mutent rien : `POST` y désigne le **transport**, pas un effet.

---

## Ce que cette couche est

Des contrats de **lecture seule**, strictement typés, destinés à être
consommés aujourd'hui par la marketplace et demain par un agent **sans
réécriture**. La règle d'architecture cible :

> L'agent décide, les tools exécutent, le backend Zabelie reste l'autorité.

## Ce que cette couche n'est pas

Aucun appel à un modèle, aucun orchestrateur, aucun widget. **Aucun tool
d'écriture** : pas de panier, pas de commande, pas de dossier de support.
L'écriture reste dans l'interface existante.

---

## ⚠️ Écart au §6 du brief — l'isolation RLS n'a PAS été testée sous vrai JWT

**À lire avant de citer cette PR comme conforme.** Cette section est
volontairement placée avant les endpoints : elle décrit une limite, pas un
détail d'implémentation.

### Ce qui est fait

`supabase/tests/orders_rls_isolation.test.sql` exerce les policies **réelles**
de `orders` — celles lues dans `pg_policies` de la production le 2026-08-02 —
sur un PostgreSQL 16 avec les migrations appliquées. Six cas :

| # | Cas | Attendu |
|---|---|---|
| 1 | l'acheteur lit sa commande | 1 ligne |
| 2 | l'acheteur lit celle d'un autre | **0 ligne** |
| 3 | un tiers sans lien lit tout | 0 ligne |
| 4 | le **vendeur** lit les commandes de son produit | **2 lignes** |
| 5 | vendeur + filtre `buyer_id = auth.uid()` | 0 ligne |
| 6 | écriture sous rôle `authenticated` | refusée |

Éprouvé par trois mutations, chacune tombant sur le cas visé : retirer
`orders_buyer_read` → cas 1 ; la rendre `using (true)` → cas 2 ; retirer
`orders_seller_read` → cas 4.

### Ce qui n'est pas fait

**Aucun JWT n'est émis, signé ni vérifié.** `auth.uid()` est un **stub** qui
lit un réglage de session (`supabase/tests/_bootstrap.sql`). Ce qui est exercé
est le **moteur de policies** avec une identité choisie — pas la chaîne
complète « jeton GoTrue → PostgREST → policy ».

Ce n'est pas une conformité au §6. C'est une preuve plus étroite, dont la
portée exacte est écrite ci-dessus.

### Pourquoi

Le test réel exige une branche Supabase, réservée au plan Pro — constaté le
2026-08-02 : `PaymentRequiredException — Branching is supported only on the
Pro plan or above`. La branche elle-même coûte **0,01344 $/heure** ; c'est
l'abonnement mensuel qui a été jugé un mauvais échange pour protéger un chemin
que personne n'emprunte : **0 commande, 0 produit, 1 profil** en base.

⚠️ **CETTE PRÉMISSE A EXPIRÉ, ET L'ÉCART S'EST AGGRAVÉ LE MÊME JOUR.**
Mesuré le 2026-08-22 : **9 produits, 3 profils, et 1 commande `paid`**. Le
chemin n'est plus désert.

Et depuis ce jour les routes sont **servies** : la chaîne « jeton GoTrue →
PostgREST → policy » est désormais réellement empruntée en production, alors
qu'elle n'a jamais été éprouvée. Servir l'API ne referme pas cet écart — **elle
le rend opérant**. Ce qui était une preuve manquante sur du code dormant est
maintenant une preuve manquante sur du code atteignable.

#### Ce qui a ÉTÉ mesuré en production, le 2026-08-22

Quatre requêtes lancées par le porteur depuis son poste contre
`https://zabelie.com`, rapportées ici parce qu'elles déplacent la frontière du
prouvé — et **parce qu'elles ne la déplacent pas autant qu'il y paraît**.

| Requête | Réponse | Ce que ça prouve |
| --- | --- | --- |
| `POST /api/v1/inconnu` | `404 not_found` | le répartiteur refuse ce qui n'est pas au registre |
| `POST /api/v1/search_products` `{"limit":50}` | `400 invalid_input`, `field:limit` | le contrat d'entrée **refuse** au lieu de tronquer, en production |
| `POST /api/v1/search_products` `{"limit":3}` | `200 product_results`, `results: []` | **le chemin de données a répondu** — première fois |
| `POST /api/v1/get_user_orders` | `401 unauthenticated` | Supabase est joignable et la frontière d'authentification tient |

⚠️ **`results: []` est CORRECT, et il faut le dire pour ne pas le relire comme
une panne.** Le catalogue affiche `2 résultat(s)` le même jour, et les deux
produits portent le badge `Service`. `search_products` exclut délibérément les
prestations (`isSearchableByApiV1`, décision porteur du 2026-08-01). Zéro est
donc la bonne réponse — mais c'est exactement la forme de zéro que `CLAUDE.md`
met en garde : *« aucun cas » et « aucun cas possible » ne se distinguent pas
d'eux-mêmes*. Ici on peut les distinguer, parce qu'on connaît le contenu du
catalogue. Le jour où un produit `file` ou `physical` sera publié, ce même
appel deviendra une vraie mesure du chemin de données.

⚠️ **ET LE `401` NE PROUVE PAS LE CHEMIN AUTHENTIFIÉ.** Il prouve que la route
sait dire non. La question ouverte — *un porteur de jeton reçoit-il exactement
ses commandes, et rien d'autre ?* — exige un appel **avec** un jeton GoTrue
valide et au moins deux acheteurs distincts. Aucune des quatre requêtes
ci-dessus ne s'en approche. L'écart décrit plus haut reste **entier**.

La mitigation applicative existe et elle est testée : `get_order` et
`get_user_orders` filtrent **explicitement** sur `buyer_id`, exactement le
cas 5 du tableau ci-dessus, et `tests/api-v1-routes.test.ts` V5 échoue si ce
filtre disparaît. Elle ne remplace pas la preuve de bout en bout — elle la rend
moins urgente, pas inutile.

L'alternative — écrire des commandes fictives en production — a été écartée :
`orders` est liée au registre financier, et la première commande de ce registre
serait un faux. `docs/22-PREMIERE-COMMANDE-REELLE.md` existe pour l'éviter.

### Quand ça se ferme

**`OPS_TODO.md` § Conditions d'ouverture**, à lever avant la première
transaction réelle — pas une tâche flottante, une condition avec un moment de
fermeture nommé.

---

## Ce que le test RLS a imposé au code

Le cas 4 n'est pas décoratif. `orders` porte **deux** policies de lecture :

```
orders_buyer_read   → auth.uid() = buyer_id
orders_seller_read  → le vendeur du produit voit la commande
```

La seconde est légitime. Mais elle signifie que **la RLS seule ne suffit pas**
à honorer « mes commandes » : un vendeur qui appellerait `get_user_orders`
recevrait ses **ventes** sous une étiquette qui annonce ses **achats**.

> **Règle pour les handlers** : `get_order` et `get_user_orders` filtrent
> `buyer_id = auth.uid()` **explicitement**, en plus de la RLS. Le cas 5 du
> test constate que ce filtre donne bien 0.

## Ce que les sorties n'exposent jamais

Vérifié par assertion sur la forme de l'objet validé, pas à l'œil
(`tests/api-v1-schemas.test.ts`) : `commission`, `commissionHtg`,
`commissionBps`, `cashback`, `points`, `netHtg`, **`role`**.

`role` a rejoint la liste sur constat : `profiles_public_read` a pour prédicat
`true`, donc la base laisse voir le rôle. Que la base le laisse voir n'oblige
pas l'API à le relayer — `get_seller` expose le **tier**, qui décrit une
relation commerciale publique, jamais le **rôle**, qui décrit un privilège
interne.

## Statuts de commande — ce qui existe vraiment

Constaté dans `pg_enum` de la production le 2026-08-02, pas lu dans les
fichiers de migration :

- `order_status` **existe** : `pending, paid, delivered, cancelled, refunded,
  disputed`. C'est lui que `get_order` rend.
- `fulfillment_status` **n'existe pas**. `0043` n'est pas appliquée — le
  registre saute de `0042` à `0045`, et `zabelie_fulfillment_notices` est
  absente.

En conséquence, le champ d'expédition est **absent** des sorties, et non `null`.
`null` dirait « pas d'expédition » ; l'absence dit « cette base ne sait pas
encore répondre ». Les confondre est exactement ce qu'un modèle rapporterait
de travers.

## Endpoints

Neuf, tous en `POST /api/v1/<nom>`. La colonne « ne fait pas » est celle qui
compte : elle dit ce qu'un lecteur automatique ne doit pas déduire.

| Endpoint | Auth | Ce qu'il rend | ⚠️ Ce qu'il NE fait PAS |
|---|---|---|---|
| `search_products` | non | jusqu'à 20 résumés, `nextCursor` | **n'expose pas les prestations** (décision porteur 2026-08-01) ; `totalEstimate` est toujours `null` — un `count` exact scannerait la table à chaque appel, et une estimation inventée serait pire qu'une absence |
| `get_product` | non | un résumé + délai déclaré, `serviceIncludes`, `createdAt` | ne rend pas les brouillons ; `declaredDeliveryDays` vaut `null` quand le vendeur a déclaré **0 jour** — voir l'encadré ci-dessous |
| `compare_products` | non | 2 à 3 produits **dans l'ordre demandé** + `notFound` | ne tronque jamais : 4 identifiants sont refusés, pas réduits à 3. Si moins de deux survivent, `not_found` — une comparaison à un seul produit n'est pas une comparaison |
| `get_seller` | non | profil public, agrégats sur produits **publiés** | **jamais le taux de commission** ; les brouillons ne gonflent pas le compte |
| `get_reviews` | non | avis paginés + agrégats du produit | **n'identifie jamais l'auteur** — `buyer_id` n'est même pas sélectionné : `product_reviews.order_id` est unique, exposer l'auteur reviendrait à publier qui a acheté quoi |
| `check_inventory` | non | `inStock`, `totalAvailable`, variantes | `totalAvailable: null` ≠ `0` — `null` = « ne suit pas de stock » (un fichier ne s'épuise pas), `0` = « suivi, épuisé » |
| `get_delivery_terms` | non | déclaration du vendeur, `platformFulfilled: false` | **n'estime rien et ne chiffre aucun frais** : Zabelie ne livre pas |
| `get_order` | **oui** | une commande de l'appelant | `not_found` pour une commande d'autrui, **jamais `forbidden`** — distinguer les deux permettrait d'énumérer les références |
| `get_user_orders` | **oui** | commandes de l'appelant, paginées | rend ce que l'appelant a **acheté**, jamais ce qu'il a vendu — la RLS seule ne suffirait pas ici |

### ⚠️ Le seul endroit où la v1 en dit moins que la base

`declaredDeliveryDays` est `z.number().int().positive().nullable()` : **zéro n'y
est pas représentable**. Or depuis `0088` (appliquée le 2026-08-22), `0`
signifie « livré le jour même » pour un service ou un fichier — une valeur qui
n'existait pas quand ces schémas ont été écrits.

Rendre `0` ferait échouer la sortie entière ; l'autoriser exigerait de modifier
un schéma v1, donc `/v2/`. `get_product` rend donc `null`, et
`get_delivery_terms` porte la nuance complète : `source: "seller_declared"`
même à zéro jour, parce qu'un vendeur qui a déclaré « jour même » **a déclaré
quelque chose**.

C'est écrit ici plutôt que subi ailleurs.

### Erreurs

Toutes de la forme `{ type: "error", code, message, field? }`, `code` pris dans
`API_ERROR_CODES`. `field` nomme le premier champ fautif — sans lui, l'appelant
devine lequel.

⚠️ **Y COMPRIS QUAND LA BASE EST INJOIGNABLE.** Défaut trouvé en parcourant le
chemin le 2026-08-22, pas en le relisant : `createClient()` lève si les
variables d'environnement manquent, et la route rendait alors **un 500 au corps
vide**. Une API dont le chemin d'échec échappe à son propre contrat est
exactement ce que ce contrat existe pour empêcher. Corrigé : la création des
clients est dans la garde.

### La sortie est validée avant de partir

C'est la promesse entière de cette couche. Un handler qui rendrait une forme
non conforme produit `internal` **et un journal nommant l'endpoint et les
écarts** — jamais une réponse approximative. Une sortie refusée signale presque
toujours un écart base ↔ contrat : colonne disparue, valeur d'énumération
ajoutée, migration non appliquée. C'est un signal d'exploitation, pas un bogue
de sérialisation.


## Publication pour les partenaires — septembre 2026

Le guide `/developpeurs` existe en FR/HT/EN/ES selon la langue du site. OpenAPI 3.1 est généré depuis les schémas Zod effectivement utilisés par la route. Les contraintes conditionnelles de `get_product` et les identifiants uniques de comparaison y sont déclarés ; la relation minPriceHtg <= maxPriceHtg reste vérifiée au serveur.

Les huit fonctions publiques répondent aux requêtes CORS avec `Access-Control-Allow-Origin: *`, sans credentials. Elles utilisent systématiquement un client anonyme : aucun cookie ou Authorization du partenaire n'est transféré vers Supabase. La session conserve les deux endpoints de commandes privés, sans CORS. La v1 ne fournit ni jeton partenaire, ni authentification Bearer pour application mobile, ni endpoint d'écriture.

`list_categories` reçoit `{language?: "fr"|"ht"|"en"|"es", limit?: 1..20, cursor?: uuid}`. Il rend les catégories actives, triées par identifiant, avec `nextCursor`, y compris les catégories sans offre. `departmentFilter` contient le libellé canonique utilisable dans `search_products.category` uniquement pour le niveau 1. Les traductions absentes retombent sur le français.

Corps JSON limité à 16 Kio effectivement lus (y compris sans Content-Length). Les erreurs sont aussi `no-store`. Réponse 429 avec `Retry-After: 60`. Le quota public actuel demeure partagé : 60 appels par minute et par endpoint pour l'ensemble des anonymes ; ce n'est pas un quota par partenaire. Les limites historiques de la recherche et de `get_delivery_terms` sont explicites dans le guide.

Tests : contrats OpenAPI, erreurs JSON, corps en flux, CORS navigateur depuis une autre origine, refus des commandes anonymes, projection publique et pagination des catégories. Aucun schéma ou secret supplémentaire requis.


## Serveur MCP, lecture seule (lot 1, 2026-11-11)

`POST /api/mcp` sert les lectures publiques de cette couche à un assistant compatible avec le Model Context Protocol. C'est le « demain par un agent sans réécriture » annoncé plus haut.

| Point | Choix |
|---|---|
| Outils | Les opérations publiques de `V1_ENDPOINTS`, dérivées de `PUBLIC_OPERATIONS` : aucune seconde liste. `get_order` et `get_user_orders` exigent une session et n'y sont pas |
| Exécution | Déléguée à `POST /api/v1/{nom}` : même validation, même quota par adresse et par opération, même contrôle de sortie |
| Identité | Aucune : pas de clé, pas de session ; ni cookie ni en-tête d'autorisation ne sont transmis à la v1 |
| Transport | Streamable HTTP sans état : une requête JSON-RPC, une réponse JSON. Pas de flux SSE (GET rend 405), pas de `Mcp-Session-Id` |
| Révisions | `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05` ; lots JSON-RPC bornés à 10 messages |
| Dépendance | Aucune ajoutée : le protocole tient dans `lib/mcp/serveur.ts` |

Éprouvé avec le client officiel (`@modelcontextprotocol/sdk` 1.32.2, hors dépôt) contre un serveur local : négociation de version, liste des outils, appel, validation de la sortie contre son schéma, refus d'un outil hors registre. Gardes : `tests/mcp-serveur.test.ts` (12 mutations, 12 rouges), et l'entrée `mcp/route.ts` de `tests/api-auth-coverage.test.ts`.

### Outils vendeur, avec une clé d'API (lot 3a, 2026-11-11)

Si la requête porte une clé d'API vendeur (`Authorization: Bearer zb_live_…` ou `X-API-Key`), les opérations de `SELLER_ENDPOINTS` s'ajoutent aux outils : `seller_products`, `seller_sales`, `create_product_link`. Les trois ne font que lire.

| Règle | Tenue par |
|---|---|
| La clé n'est transmise qu'à `POST /api/v1/seller/{nom}`, qui juge seule sa validité, sa portée et son quota ; elle n'accompagne jamais un appel d'outil public | `app/api/mcp/route.ts`, `tests/mcp-serveur.test.ts` |
| Sans clé, les outils vendeur ne sont ni listés ni appelables (même refus qu'un nom inconnu) | `lib/mcp/serveur.ts` |
| Un en-tête de clé présent mais mal formé est refusé en 401 : pas de rétrogradation silencieuse vers l'anonyme | `app/api/mcp/route.ts` |
| Une réponse obtenue avec une clé ne porte aucun en-tête CORS, et `Authorization` n'est pas un en-tête CORS admis : une clé ne vit pas dans un navigateur | idem |

Ce que ce serveur ne fait toujours pas : aucune création de produit, aucune connexion OAuth. Un `oneOf` à la racine du schéma de `get_product` est retiré de la description d'outil (plusieurs clients le refusent) ; la contrainte reste dite en clair et appliquée par la v1.

### Fiche préparée par un assistant (lot 3b, 2026-11-11, migration `0171`)

`prepare_product` est la seule opération vendeur qui dépose quelque chose, et ce n'est **pas** un produit. Trois décisions étaient ouvertes ; elles sont prises dans le sens recommandé par l'agent, et la PR est marquée à arbitrer.

| Décision | Ce qui est construit |
|---|---|
| Une portée d'écriture | `products:prepare`, ajoutée à la contrainte de `0121` par `0171` |
| Le choix de la portée | Une case, décochée d'office, à la création d'une clé (`/tableau-de-bord/api`). Une clé existante ne la gagne jamais : `0121` fige les portées |
| L'acceptation de la politique | **Un assistant ne la coche jamais.** Il dépose une fiche préparée ; le vendeur l'ouvre, la relit, accepte lui-même la politique et envoie par le formulaire habituel |

Le parcours : l'assistant appelle `prepare_product` (type, titre, description, prix proposé) et reçoit une adresse. Le vendeur l'ouvre, connecté. Un bloc lui montre ce qui a été préparé ; « Reprendre dans le formulaire » remplit le titre, la description et le prix. Une saisie existante n'est remplacée qu'avec son accord, un prix déjà saisi sur un article physique n'est pas écrasé, et l'acceptation de la politique reste à cocher. La création, la revue humaine et la publication ne changent pas.

| Règle | Tenue par |
|---|---|
| `prepare_product` n'écrit que dans `zabelie_fiches_preparees` : ni `products`, ni attestation de politique | `lib/api/v1/seller.ts`, `tests/fiche-preparee.test.ts` |
| Entrée fermée : ni statut, ni rayon, ni `policyAccepted`, ni vendeur | schéma `PrepareProductInput` (strict) |
| Le texte reçu est ramené à du texte (balises et caractères invisibles retirés) | `lib/fiche-preparee.ts` |
| La portée n'est jamais donnée par défaut ; seul `prepare: true` la donne | `lib/api-keys.ts`, route `api/account/api-keys` |
| L'outil MCP ne se dit pas en lecture seule ; l'annotation vient du drapeau `ecrit` du registre | `lib/mcp/serveur.ts` |
| Le vendeur lit ses fiches seulement (RLS), n'écrit rien en direct ; `anon` ne lit rien | `0171`, `supabase/tests/fiches_preparees.test.sql` |
| 20 fiches en attente au plus par vendeur, 7 jours, 30 dépôts par heure et par vendeur ; contenu figé après dépôt | trigger de `0171`, `prepareProduct` |
| La reprise est cloisonnée au vendeur de la session | route `api/account/fiches-preparees/[id]/reprise` |

Ce que ce lot ne fait pas : ni photo, ni fichier, ni rayon, ni stock ne passent par l'assistant ; aucune liste des fiches préparées dans le tableau de bord (le vendeur passe par l'adresse que l'assistant lui remet) ; un outil vendeur reste listé pour une clé qui n'a pas la portée, et l'appel est alors refusé avec un message lisible.

⚠️ Ordre : appliquer `0171` **avant** de fusionner le code. Sans elle, créer une clé qui prépare rend 503 ; les clés ordinaires continuent de marcher.
