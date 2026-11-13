# 79 — Chantier Services v2 (spec, sans code)

> **Statut : proposition du 2026-11-06, révisée le 2026-11-07 (revue
> anti-doublon de tous les lots, §0 bis). En attente d'un « go » explicite du
> porteur.** Aucun code, aucune migration dans ce document. Dépôt lu à
> `bfc52fb` (clone superficiel), puis relu à `1c89e3a` (`origin/main`, #477)
> pour la revue du 2026-11-07. Les numéros de migration (`0170` et suivantes)
> et de document (`79`) se relisent au moment d'écrire
> (`ls supabase/migrations | tail -1`), ils ne se recopient pas d'ici. Au
> 2026-11-07, la dernière migration de `main` est `0169`.
>
> **Ce que ce document ne prétend pas** : avoir exécuté le code, ni vérifié
> l'état de production de `0068`. `lib/purchase-price.ts`, le checkout et le
> panier groupé ont été lus le 2026-11-07 (S1). Chaque point non vérifié est
> marqué **À VÉRIFIER** et listé au §8.

## 0. Principe directeur

Un service est déjà dans la machine de remise depuis `0068` (déclaration par le
vendeur, confirmation par l'acheteur, auto-réception, litige). **On n'en
construit pas une seconde.** Tout ce chantier est **additif** : tables
séparées, aucune valeur ajoutée aux énumérations (`order_status`,
`fulfillment_status` : porte à sens unique, leçon de `0036`), aucune ligne
d'argent touchée, **sauf à deux endroits, isolés et soumis à décision** :

- **S1** touche le chemin de prix : garde du déclencheur `0040`, réservation de
  stock conditionnée au kind, `readPurchasePrice` ouvert au `service`.
- **S4** ne touche l'argent que dans son option 2 (§2), et seulement par un
  gel qui existe déjà. Le balayage `zabelie_fulfillment_sweep` n'est modifié
  dans aucune option recommandée.

## 0 bis. Revue anti-doublon (2026-11-07)

Consigne du porteur (`CLAUDE.md`, `docs/26` §0) : réutiliser sans doublons,
identifier l'implémentation, ses appelants, ses tables et ses tests, puis
l'étendre. Chaque lot a été confronté au code de `main` :

| Lot | Ce qui existe déjà | Décision |
|---|---|---|
| S1 niveaux | variantes `zabelie_product_variants` (`0036`), prix par `readPurchasePrice`, rabais par variante (`0109`) | réutilisées (fait le 2026-11-07) |
| S2 pièces jointes | upload en deux temps `app/api/products/asset/route.ts`, confirmation `lib/product-asset-confirm.ts`, config `zabelie_message_limits` (`0090`), `lib/zabelie-rate-limit` | protocole et confirmation à **factoriser**, pas à réécrire |
| S3 brief | fil append-only `0090`, modèles `lib/service-starters.ts` ; aucun brief acheteur | le brief devient un message du fil ; seules les questions du vendeur et le lien commande sont neufs |
| S4 révisions | dossiers de support `0113` (raison `wrong`, échéance, file admin, messages append-only) et leur pont vers le gel `zabelie_report_not_received` | passer par les dossiers ; la table de révisions et la modification du balayage deviennent l'option de dernier recours |
| S6 devis | rien pour un produit non listé ; **décision contraire** dans `docs/services-marche-haitien.md` (#328) | lot retiré, question au porteur (D-S7) |

## 1. État des lieux vérifié

| Sujet | Constat | Source |
|---|---|---|
| Kind | `fichier \| service \| physical`, littéraux interdits hors `lib/product-kind.ts` | `lib/product-kind.ts` |
| Champs service | `delivery_days` (affichage seulement) et `service_includes text[]` ; prix et délai uniques par produit | `0020` |
| Commande | une ligne = un produit, `amount_htg` entier, aucune colonne variante | `0001` |
| Variantes | `zabelie_product_variants` (prix, `active`, `options`) ; `in_stock` recalculé par déclencheurs sans regarder le kind | `0036`, `0040` |
| Remise | table `zabelie_fulfillment`, 5 états, RPC `declare_shipment` / `mark_received` / `report_not_received` | `0043` |
| Services dans la machine | `zabelie_open_fulfillment` admet `physical` et `service`, plus un filet orphelin | `0068` |
| Délais | `shipment_deadline_days` 5 (ancre : paiement), `auto_receive_days` 7 (ancre : déclaration), en table de config | `0043` |
| Messagerie | un fil par (produit, acheteur), messages append-only par déclencheur, 2000 caractères, **aucune pièce jointe** ; plafonds dans `zabelie_message_limits` | `0090` |
| Stockage | uploads par service role uniquement, aucune policy `storage.objects` côté client ; noms de buckets en source unique, croisés par `tests/buckets-croisement.test.ts` | `0039`, `lib/storage-buckets.ts` |
| Upload en deux temps | `demande` → lien signé sur un chemin fabriqué par le serveur → `confirme` qui relit l'objet réel (taille, chemin) et supprime l'objet hors contrat | `app/api/products/asset/route.ts`, `lib/product-asset-confirm.ts` |
| Dossiers de support | un dossier par commande, raisons `debited / not_received / wrong / digital / other`, statuts `open / waiting_buyer / waiting_seller / resolved`, échéance `response_due_at`, messages append-only, actions admin journalisées ; un dossier `not_received` de l'acheteur déclenche le gel `report_not_received` | `0113`, `app/api/support/cases/route.ts` |
| Litiges Stripe | rétrofacturations, plafond hebdomadaire | `0151` |
| Offres associées | montée / descente de gamme entre produits du même vendeur et du même kind, prix ordonnés | `0110` |
| Devis | « convenu via la messagerie, sans nouveau moteur d'acceptation de devis » | `docs/services-marche-haitien.md` (#328) |
| Test de parcours | `e2e/parcours-service.spec.ts` | dépôt |

## 2. Les lots, dans l'ordre de livraison

L'ordre suit les dépendances puis le risque : ce qui est sans effet sur l'argent
passe d'abord.

### S2 — Pièces jointes de messagerie (en premier)

**Pourquoi d'abord** : sans elles, la livraison d'un service (maquette, rapport,
photo de diagnostic) sort de la plateforme, et le fil ne prouve plus rien le
jour d'un litige. `0090` les a exclues pour une raison précise : le stockage
vendeur n'avait aucune policy. On ne contourne pas cette raison, on la traite.

- Nouveau **bucket privé** dédié (source unique dans `lib/storage-buckets.ts`,
  migration qui le crée, test de croisement bucket ↔ migration déjà en place).
- Écriture **par service role confiné** à une route, comme `0039`, jamais de
  policy client ; lecture par **lien signé de courte durée**, comme les
  téléchargements numériques (5 minutes, `app/api/download/route.ts`).
- Liste blanche de types (images, PDF, archives bornées), taille plafonnée en
  **table de config**, pas en dur. Aucun fichier exécutable.
- Un message peut porter 0 à N pièces ; la ligne de pièce est **append-only**
  comme le message. Suppression de compte : même arbitrage que `0090` (le
  contenu d'une personne qui part s'efface, la trace financière non).
- Lecture : les deux parties du fil, plus l'admin sur dossier de litige.

**Réutiliser, ne pas réécrire** :
- Le protocole en deux temps de `app/api/products/asset/route.ts` (`demande`
  → `createSignedUploadUrl` sur un chemin fabriqué par le serveur →
  `confirme`).
- La confirmation existe dans `lib/product-asset-confirm.ts` : chemin attendu,
  objet réellement présent, taille lue dans les métadonnées, objet hors
  contrat supprimé. Elle est câblée sur `DIGITAL_BUCKET` et `product_assets`.
  Le §9 décrit une seconde implémentation (« les objets sont relus au stockage
  avant d'écrire le message ») : c'est un doublon. Avant la PR, extraire la
  partie générique (bucket, motif de chemin, plafond en paramètres) et la
  faire appeler par les deux routes ; test : les mêmes refus des deux côtés.
  **À VÉRIFIER** sur le code S2, qui n'est ni sur GitHub ni sur ce poste.
- Plafonds : clés dans `zabelie_message_limits` (qui porte déjà
  `messages_par_heure` et `fils_ouverts_par_jour`), pas une table de config
  neuve. Cadence : `rateLimit` de `lib/zabelie-rate-limit`, comme les autres
  routes.

### S1 — Niveaux d'offre (réutiliser les variantes, pas de table parallèle)

**Règle anti-doublon appliquée, 2026-11-07.** Le prix d'une commande passe
par UNE fonction, `readPurchasePrice` (`lib/purchase-price.ts`), appelée par
`app/api/checkout/route.ts` et `app/api/coupons/validate/route.ts`. Elle sait
déjà lire un prix par variante (`zabelie_product_variants` : `price_htg`,
`active`, `position`, `options` libre) et le rabais par variante (`0109`, sur
la base de `0075`) y est déjà branché. Un niveau de service EST une variante :
on réutilise, on ne crée pas `service_tiers`.

En attendant S1, un vendeur peut déjà vendre trois niveaux comme trois services
liés en montée et descente de gamme (`0110` : même kind, prix ordonnés). S1 les
rassemble sur une seule fiche.

**Périmètre réduit** : les *options* (suppléments) sont retirées de ce lot.
Aucun mécanisme existant ne les porte, et le besoin n'est pas établi ; un
supplément peut se vendre comme produit lié (`zabelie_product_offers`, `0110`).
À rouvrir sur demande réelle, pas avant.

**Ce que la lecture du code a établi (vérifié, pas supposé)** :
- 🔴 **Piège bloquant** : `0040` pose deux déclencheurs (`zabelie_variant_flag` sur
  `zabelie_product_variants`, `zabelie_stock_flag` sur `zabelie_stock`). Ils
  appellent `zabelie_refresh_in_stock`, qui recalcule `products.in_stock` à
  partir du STOCK des variantes, sans regarder le kind, et qui n'a jamais été
  redéfinie depuis. Un service n'a aucune ligne de stock : ajouter une seule
  variante à un service le fait passer à `in_stock = false`, et le catalogue
  filtre sur `in_stock`. **Sans garde, chaque service doté d'un niveau
  disparaîtrait du catalogue, sans erreur.** La garde (ne recalculer que pour
  `physical`) est le premier changement et le premier test, avec mutation :
  retirer la garde doit faire échouer le test.
- 🟠 Le checkout réserve du stock dès qu'un `variantId` existe
  (`route.ts` ~l.877, `zabelie_reserve_stock`). Pour un service il n'y a pas de
  stock : la réservation doit être conditionnée à `isTrackedStockKind`.
- 🟠 `readPurchasePrice` refuse toute variante pour un kind sans stock suivi
  (`variant_invalid`) : à ouvrir au `service` seulement, `fichier` reste fermé.
  Réutiliser sa branche existante : une seule variante active est prise
  d'office, plusieurs sans choix donnent `variant_required`.
- 🟠 **Panier groupé (vérifié)** : `app/api/panier/payer/route.ts` envoie chaque
  article au checkout individuel avec `productId` seul, jamais de `variantId`,
  et `zabelie_cart_items` (`0058`) n'a pas de colonne variante. Un service à
  plusieurs niveaux arrive donc au checkout sans niveau. Avec la branche
  ci-dessus, il est refusé (`variant_required`), l'article est nommé et le
  groupe abandonné, exactement comme un physique à plusieurs variantes
  aujourd'hui. C'est le comportement voulu : payer le prix du produit ferait
  payer un prix que l'acheteur n'a pas choisi.
- 🟢 Idempotence déjà couverte : `checkoutIntentHash` inclut `variantId`. Deux
  achats du même service à deux niveaux ne se confondent pas.
- 🟢 Rabais par niveau gratuit (variantes), flash : le calcul actuel ne s'applique
  qu'au prix du produit, un niveau à un autre prix paie son prix (`docs/78` M1).
- 🟠 `lib/api/v1/handlers.ts` (~l.485) lit les variantes : vérifier ce que l'API
  publique v1 expose pour un service avant d'en créer.
- Une commande ne garde pas sa variante (`orders` n'a pas de colonne variante ;
  pour le physique c'est la réservation de stock qui la porte). Un service n'a
  pas de réservation : **une table d'instantané par commande reste nécessaire**
  (commande, niveau, titre, prix et délai figés), seule table nouvelle du lot.

**Colonnes** : le délai et la liste « inclus » par niveau ne tiennent pas
proprement dans `options`. Deux colonnes nullables additives sur la table des
variantes (`delivery_days`, `service_includes`), ignorées par le physique.
Aucune donnée existante n'est touchée. Décision D-S6 si le porteur préfère les
mettre dans `options` (moins propre, zéro changement de schéma).

**Compatibilité** : un service sans variante se comporte exactement comme
aujourd'hui (prix du produit). Test de non-régression exigé.

**Interface vendeur** : l'éditeur de variantes existe pour le physique
(`app/api/products/physical`, `RabaisManager`). Le service a besoin de son propre
éditeur de niveaux, mais il écrit dans la même table.

### S3 — Briefing structuré

Rien n'existe pour un brief d'acheteur. Le `brief` de `digital-authoring` est
celui du vendeur pour son propre Studio : autre métier, à ne pas réemployer.

- Après paiement confirmé, l'acheteur remplit un **brief** : des questions
  définies par le vendeur sur l'offre, des réponses courtes, des pièces via S2.
- **Le brief est un message du fil `0090`**, pas une table à part : le fil est
  déjà append-only par déclencheur, donc le brief est figé sans nouvelle RLS ni
  nouveau garde. Il tient dans la limite de 2000 caractères d'un message.
- Questions par défaut : les modèles de `lib/service-starters.ts`, qui
  affichent déjà avant l'achat ce qu'il faut convenir (travail, livrables,
  délai, révisions).
- **Seuls éléments neufs** : les questions du vendeur (une colonne nullable
  `text[]` sur `products`, voisine de `service_includes`, `0020`) et le lien
  entre la commande et le message. Ce lien est nécessaire parce que le fil est
  par (produit, acheteur) et non par commande : deux commandes du même service
  partagent le même fil. Table de lien minimale (commande, message), lisible
  par les deux parties.
- Il alimente le litige : « ce qui était demandé » devient une pièce, pas un
  souvenir.
- Ne bloque pas l'argent : le délai du vendeur court depuis le paiement, comme
  aujourd'hui. Un brief non rempli est signalé au vendeur, pas sanctionné.

### S4 — Révisions (passer par les dossiers de support)

**Ce qui existe déjà (vérifié le 2026-11-07)** : les dossiers de support de
`0113` font presque tout ce que la première version de ce lot voulait
construire. Un dossier par commande (`unique(order_id)`), ouvert par une des
deux parties, avec la raison `wrong` (« Article reçu incorrect », libellé à
adapter au service), des statuts `waiting_seller` et `resolved`, une échéance
de réponse et une file admin indexée, des messages append-only, chaque action
admin journalisée dans `zabelie_admin_actions`. Et un pont vers l'argent :
quand l'acheteur ouvre un dossier `not_received`, `zabelie_submit_support`
appelle `zabelie_report_not_received`, qui passe la remise en
`disputed_by_buyer`. La branche (a) du balayage n'agit que sur `shipped` : le
gel des fonds pendant une contestation existe donc déjà, sans toucher au
balayage.

**Le piège de la conception d'origine, constaté dans `0043`** (il reste vrai et
justifie de ne pas commencer par elle) : le balayage d'auto-réception
(branche a) agit sur `status = 'shipped'` et
`shipped_at < now() - auto_receive_days`. La branche vendeur silencieux (b)
agit sur `awaiting_shipment` avec `created_at` ancien. Donc :

- Renvoyer la commande à `awaiting_shipment` pour une révision la fait
  **basculer immédiatement en `action_required`** (son `created_at` date du
  paiement). Inacceptable.
- Laisser `shipped` et repousser `shipped_at` laisserait l'auto-réception
  libérer les fonds même si le vendeur n'a **jamais** livré la révision.
  Inacceptable aussi.
- `zabelie_declare_shipment` répond « doublon » si le statut est déjà
  `shipped`, et les avis `(order_id, kind)` sont uniques : une seconde
  déclaration n'enverrait ni nouvel avis ni nouveau rappel.

**Trois options, de la moins risquée à la plus risquée (D-S1)** :

1. **Dossier `wrong` sans gel.** Aucune migration, aucune ligne d'argent :
   la raison existe. La commande de service affiche « demander une
   correction », qui ouvre le dossier ; le vendeur répond dans le dossier et
   re-livre dans le fil. Limite : l'auto-réception peut libérer les fonds
   pendant le dossier. C'est la limite de la re-livraison manuelle, avec en
   plus une trace et une échéance.
2. **Dossier et gel existant.** Étendre le pont de `zabelie_submit_support`
   pour qu'un dossier `wrong` ouvert par l'acheteur sur une commande `service`
   appelle le même gel. Une condition dans une fonction, aucun changement du
   balayage, aucun balayage neuf : l'échéance du dossier fait la relance.
   Reste à construire : la sortie. Aucune RPC trouvée ne ramène
   `disputed_by_buyer` à `shipped` (recherche par nom dans les migrations), et
   la page `app/admin/livraisons` liste ces commandes sans action. L'avis
   `shipped_buyer` étant unique par (commande, type), une re-livraison n'en
   renverrait pas. Effets à accepter : `orders.status` passe à `disputed`, et
   la note de remise reçoit « acheteur : … ».
3. **Conception d'origine** : table de révisions, modification ciblée de la
   branche (a) (ne pas auto-recevoir tant qu'une révision est ouverte),
   balayage séparé sur le patron de `0059` et `0068`, RPC de re-livraison qui
   remet les avis. Plafond de config, par défaut 0. Seulement si 1 et 2 ne
   suffisent pas : c'est la seule option qui rouvre le money-path.

**Recommandation** : l'option 1 d'abord, livrable avec S2 (les pièces de la
correction passent par le fil). L'option 2 si des acheteurs voient leurs fonds
libérés pendant une correction.

**Repère concurrent (§10)** : chez une place française de micro-services, une retouche demandée pendant les
7 jours de validation renvoie la commande « en cours » et le vendeur n'est payé
qu'après la nouvelle livraison. Seules les options 2 et 3 donnent ce
comportement ; l'option 1 ne bloque pas l'argent.

### S6 — Offre sur mesure (devis) : retiré, en attente du porteur

**Contradiction avec une consigne existante.** `docs/services-marche-haitien.md`
(lot du 8 octobre, #328) écrit : le devis est convenu via la messagerie, sans
nouveau moteur d'acceptation de devis. S6 serait ce moteur. Règle zéro : on
s'arrête et on demande (D-S7). Le lot sort du plan tant que le porteur n'a pas
levé cette décision.

Ce qui a été vérifié pour le jour où il rouvrirait : `product_status` ne
connaît que `draft`, `published` et `archived` (`0001`). Aucun statut « non
listé », aucune restriction par acheteur. S6 créerait un concept de
visibilité, ce n'est pas une réutilisation.

Ce qui marche aujourd'hui sans code : le vendeur publie un service au prix
convenu, ou applique un coupon produit (`0012`, `max_uses` disponible) dont il
donne le code dans le fil, et l'acheteur paie par le checkout existant.

### S5 — Délais propres aux services (reporté, volontairement)

`0068` a choisi les mêmes délais que le physique, parce qu'un délai par kind
oblige à brancher la branche d'auto-réception par kind, donc à rouvrir le
money-path. Ce choix reste valable. Le délai du niveau (S1) est **informatif**.
Si le porteur veut un délai appliqué, c'est une décision de config + une
migration bornée, après S4, pas avant.

## 3. Données (en prose, noms indicatifs)

Toutes en préfixe `zabelie_`, **RLS activée dès la création** :
- **S1** : l'instantané par commande (commande, niveau, titre, prix, délai ;
  lecture des deux parties), seule table neuve ; deux colonnes nullables sur
  `zabelie_product_variants` (D-S6).
- **S2** : la table des pièces (append-only) et le bucket privé ; les plafonds
  sont des clés de `zabelie_message_limits`.
- **S3** : une colonne de questions sur `products` et la table de lien
  commande ↔ message du brief.
- **S4** : rien pour les options 1 et 2. L'option 3 seule ajoute une table de
  révisions (écriture par RPC) et des clés dans `zabelie_fulfillment_limits`.
- **S6** : rien (retiré).

Aucune de ces tables ne touche `escrow_entries`, `wallet_transactions` ni le
grand livre.

## 4. Invariants à respecter (rappel, pas à redéfinir)

- Règle 3 : prix serveur, entiers, paramètres en config.
- Règle 4 : RLS à la création, pas de `SECURITY DEFINER` exposé à `anon` sans
  garde, `revoke` explicite, `search_path` fixé.
- Migrations à la suite, registre à jour, post-conditions dans la migration
  (patron `0068`), test SQL sous un **vrai rôle** (patron
  `supabase/tests/messagerie.test.sql`).
- UI **Kreyòl d'abord**, quatre langues, vocabulaire « remise / prestation »,
  jamais « expédition ».
- Aucun service externe non listé ; pas de fournisseur SMS.
- Réutiliser avant de construire (`docs/26` §0, `docs/67`).
- Règle zéro : toute contradiction avec une consigne directe du porteur, on
  s'arrête et on demande.

## 5. Décisions attendues du porteur

- **D-S1** : révisions par dossier sans gel (option 1, recommandée), par
  dossier avec le gel existant (option 2), ou par table dédiée et
  modification du balayage (option 3). Le repère une place française de micro-services (§10) correspond aux
  options 2 et 3, pas à l'option 1.
- **D-S2** : seulement si l'option 3 est retenue : plafond de révisions par
  commande et durée maximale d'une révision ouverte.
- **D-S3** : nombre de niveaux par service (proposé 3).
- **D-S4** : types et taille maximale des pièces jointes.
- **D-S5** : le seuil de gel des publications de service posé le 2026-08-13
  (`docs/26` §3, `OPS_TODO`) était lié à `0068`. À confirmer s'il est levé.
- **D-S6** : délai et « inclus » par niveau en colonnes additives (proposé) ou dans `options`.
- **D-S7** : devis. Maintenir la décision du lot #328 (devis convenu dans la
  messagerie, aucun moteur ; proposé) ou la lever pour rouvrir S6.

## 6. Critères d'acceptation (vérifiables)

- **S2** : un fichier hors liste blanche est refusé côté serveur ; un lien
  signé expire ; un tiers non partie au fil reçoit un refus ; le test de
  croisement des buckets passe ; la confirmation d'une pièce et celle d'un
  livrable numérique passent par la même fonction et refusent les mêmes cas.
- **S1** : un POST avec un montant forgé est ignoré ; l'instantané d'une
  commande payée ne change pas quand le vendeur modifie son offre ; un produit
  sans niveau produit la même commande qu'avant (test de non-régression) ;
  ajouter un niveau à un service ne change pas `in_stock` (retirer la garde
  fait échouer le test) ; un service à plusieurs niveaux dans le panier groupé
  est refusé et nommé, jamais payé au prix du produit.
- **S3** : le brief est lisible par les deux parties et par l'admin sur
  litige, par personne d'autre ; une modification du message de brief est
  refusée par le déclencheur de `0090`.
- **S4, option 1** : la demande de correction crée un dossier `wrong` visible
  des deux parties et de la file admin, sans changer le statut de remise.
  **Option 2** : un dossier `wrong` d'acheteur sur un service met la remise en
  `disputed_by_buyer` ; le balayage ne l'auto-reçoit pas ; la sortie ramène à
  `shipped` et redémarre le délai. **Option 3** : avec plafond 0, aucune
  demande acceptée ; révision ouverte, pas d'auto-réception ; révision trop
  longue, `action_required` et non un remboursement ; test de concurrence
  (demande et auto-réception simultanées).
- Pour chaque lot : citations `fichier:ligne` dans la PR, comme la checklist de
  production.

## 7. Hors périmètre

Zabelie Pay autonome, livraison par Zabelie, nouveau rail de paiement, appels
d'offres inversés, moteur d'acceptation de devis (décision du lot #328, voir
D-S7), abonnement vendeur payant (prématuré tant que la liquidité
n'existe pas), messagerie temps réel, visioconférence.

## 8. Ce que je n'ai pas vérifié

- L'état d'application de `0068` en production (le registre
  `zabelie_schema_migrations` fait foi).
- Le code S2 décrit au §9 (`0170`, routes, écran, tests) : il n'est ni sur
  GitHub ni sur ce poste (recherche du 2026-11-07). Le doublon de confirmation
  signalé en S2 n'a donc pas pu être constaté dans ce code.
- Ce que l'API publique v1 (`lib/api/v1/handlers.ts`) expose des variantes
  d'un service.
- Qu'aucune RPC de sortie de `disputed_by_buyer` n'existe sous un autre nom :
  la recherche a porté sur les noms de fonctions des migrations.
- Aucun test n'a été exécuté pour cette révision (lecture seule de `main`).

*Vérifié le 2026-11-07 et retiré de cette liste* : le panier groupé (S1), les
lignes 295–455 de `0043` (`mark_received`, `report_not_received`, avis
`shipped_buyer` / `reminder_buyer` / `auto_received`), l'outil admin
(`app/admin/livraisons` liste, ne tranche pas), l'absence de statut « non
listé » (`0001`).

## 9. Plan d'exécution S2 (état au 2026-11-06)

**Livré dans ce lot, en brouillon, non appliqué (base)** : `0170_zabelie_messages_pieces_jointes.sql`
(bucket privé `message-files`, table, gardes ZB170, RLS, plafonds en config),
`supabase/tests/messagerie_pieces_jointes.test.sql` (13 cas, dont 3 mutations
tuées : policy d'attache, append-only, garde d'insertion) et la constante
`MESSAGE_BUCKET` dans `lib/storage-buckets.ts`. Le test de croisement des
buckets exige que migration et constante arrivent **dans la même PR**.

**Vérifié** (Postgres 16 nu, 0001→0170) : toutes les suites `*.test.sql` du
dépôt passent, dont `search_path_epingle` (qui a refusé une première version de
la fonction append-only sans `search_path` épinglé, corrigée) ; `npm test` :
2769 passent, 0 échec. **Non vérifié** : le script de concurrence Stripe (exige
la base CI isolée) et le comportement contre un vrai Supabase (plafond du
bucket, `allowed_mime_types`).

**Code applicatif écrit (2026-11-06), non déployé** :
1. `POST /api/messages/attachment` : session, compte actif, participation au fil
   lue par la session (RLS), type et taille contrôlés, cadence `pj_par_heure`,
   chemin `<fil>/<expéditeur>/<uuid>.<ext>` **fabriqué par le serveur**, lien
   d'envoi signé pour ce seul chemin.
2. `POST /api/messages` étendu : `attachments[]` (chemin, nom, type). Les objets
   sont relus au stockage **avant** d'écrire le message (taille et type réels) ;
   un objet hors contrat est supprimé. Les pièces sont rattachées sous la
   session ; un échec partiel est dit à l'utilisateur (`warning`), pas tu.
   Un message qui ne porte qu'un fichier a pour corps le nom du fichier.
3. `GET /api/messages/attachment?id=` : participation lue par la session, puis
   redirection vers un lien signé de 5 minutes, `Cache-Control: private, no-store`.
4. Écran : sélecteur (3 fichiers, images et PDF), retrait, affichage dans le fil
   (image en ligne, PDF en lien), seulement dans un fil existant. Sept clés i18n
   dans les quatre langues.
5. `tests/messagerie-pj.test.ts` : 10 cas, dont les croisements avec `0170`
   (types, plafonds, borne du nom, bucket) et un contrôle que la page n'incruste
   jamais l'URL signée.

**Vérifié** : `tsc` propre, lint propre, 2779 tests passent (dont les 10 nouveaux
et les gardes i18n du dépôt), une mutation du validateur de chemin est tuée.
**Non vérifié** : tout parcours réel contre Supabase (envoi direct au stockage,
signature, plafond du bucket), le rendu à l'écran, et le script de concurrence
Stripe. À faire en préproduction avant d'ouvrir la fonction.

**Doublons à résorber avant la PR (revue du 2026-11-07)** :
- Le point 2 relit les objets au stockage par sa propre logique : la faire
  passer par la confirmation factorisée de `lib/product-asset-confirm.ts`
  (voir S2).
- La cadence `pj_par_heure` et les plafonds vont dans `zabelie_message_limits`
  et passent par `rateLimit` : vérifier que `0170` n'a pas créé de table de
  config à part.
- Ce code n'est ni sur GitHub ni sur ce poste : la PR S2 part de l'endroit où
  il a été écrit, sur une base `main` à jour (`0170` est encore libre au
  2026-11-07).

**Reste** : admin en lecture sur dossier de litige (service role, journalisé dans
`zabelie_admin_actions`), décisions D-S4 (types, taille), et la mention
« payer hors Zabelie fait perdre l'escrow », déjà affichée sous le champ.

**Avant application en production** : confirmer que le bucket est bien créé
privé avec le plafond de 10 Mo (`select id, public, file_size_limit,
allowed_mime_types from storage.buckets where id = 'message-files'`), puis
inscrire la ligne de registre à la main, comme pour les migrations précédentes.

## 10. Repère : une place française de micro-services (relevé du 2026-11-07)

La place retenue est la place de micro-services française la plus proche
de ce chantier. Les pages officielles citées en sources ont été **ouvertes** le
2026-11-07 ; deux points ne viennent que de sites tiers et sont marqués comme
tels. Ce relevé compare, il ne recommande aucun prix : la commission et tout
abonnement restent des décisions de positionnement (`docs/25` §4, `docs/71`).

| | Une place française de micro-services | Zabelie Services (`main` au 2026-11-07) |
|---|---|---|
| Marché | France et francophonie, en euros, services surtout à distance | Haïti et diaspora, kreyòl d'abord, en gourdes ; services à distance et sur place |
| Paiement | Carte ; frais bancaires et de sécurité ajoutés au prix final, montant non publié | MonCash, Kobara, Stripe, Zelle semi-manuel |
| Commission vendeur | 20 % en formule gratuite ; 1 € par commande avec la formule payante de base (12 € HT/mois) ou supérieure (40 € HT/mois) | 10 % Standard, 6 % Elite (sans porte d'accès, V-16) ; commission de lancement ouverte (`docs/71`) ; aucun abonnement |
| Acceptation | 48 h pour accepter, sinon annulation et remboursement intégral | Aucune étape d'acceptation ; 5 jours pour déclarer la remise, sinon `action_required` et décision humaine |
| Validation | 7 jours après livraison pour retouche ou validation, sinon validation automatique | 7 jours après déclaration, sinon auto-réception ; puis maturation J+7 |
| Retouches | Dans la commande : 48 h au vendeur pour accepter, la commande repasse « en cours » | Rien de structuré, convenues dans la messagerie (S4) |
| Annulation | Demandée par l'acheteur, 48 h au vendeur ; en cas de retard, l'acheteur annule seul et le vendeur n'est pas payé | Pas d'annulation par l'acheteur ; « pas reçu » gèle et passe à un humain |
| Litiges | Médiateur, quatre issues (remboursement total ou partiel, reprise, validation), décision définitive ; seul ce qui s'est passé sur la plateforme compte | Gel par `disputed_by_buyer`, dossiers de support `0113` avec échéance ; aucune RPC pour trancher (§8) |
| Niveaux et options | Options payantes (10 au plus en formule gratuite, illimitées en formule payante) | Prix unique (S1 : niveaux ; options écartées) |
| Offre sur mesure | Offres personnalisées et lien de paiement, réservés à Plus | Devis dans la messagerie, sans moteur (#328, D-S7) ; lien payable sans compte limité à la facturation pro (`app/facture/[token]`) |
| Fichiers | Livraison du travail dans la commande | Aucune pièce jointe (S2) |
| Consignes acheteur | Transmises après la commande, sans formulaire imposé | Guide avant achat (`lib/service-starters.ts`) ; brief prévu (S3) |
| Avis | À la validation, possibles pendant 6 mois | Avis (`0008`) et réponse du vendeur (`0139`) |
| Visibilité | Mise en avant payante et crédit de promotion (formule payante) | Rabais, ventes flash, coupons, offres liées, affiliation ; pas de visibilité payante |

**Ce que le relevé apprend au chantier** :
- **Retouches (S4)** : le modèle d'une place française de micro-services retient l'argent pendant la correction.
  Côté Zabelie, seules les options 2 et 3 le font (D-S1).
- **Pièces jointes (S2)** : Une place française de micro-services ne juge un litige que sur ce qui est passé
  par la plateforme. Sans fichiers dans le fil, Zabelie n'a rien à juger ;
  cela confirme S2 en premier.
- **Acceptation en 48 h** : absente de Zabelie. L'ajouter avec un
  remboursement automatique toucherait l'argent : décision du porteur, hors de
  ce chantier tant qu'elle n'est pas prise.
- **Abonnement** : Une place française de micro-services fait payer commission réduite, offres sur mesure et
  visibilité. Le §7 garde l'abonnement hors périmètre.
- **Ce qu'une place française de micro-services n'a pas** : prestations sur place en Haïti (commune,
  déplacement), mobile money, kreyòl, et un argent gelé qui ne part pas sans
  décision humaine en cas de contestation.

**Non vérifié** : le montant des frais côté acheteur (non publié) ; les
conditions du badge « freelance vérifié » (site tiers seulement) ; le délai
de retrait du portefeuille vendeur.

Sources :
pages officielles de la place comparée (processus de commande, formules
payantes, frais par achat, litiges) et deux sites tiers, consultés le
2026-11-07. Les adresses ne sont pas reproduites ici.
