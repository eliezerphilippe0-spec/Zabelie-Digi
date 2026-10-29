# 77 — L'assistant d'achat et la proximité (relevé du 2026-10-29)

Question du porteur : *comment l'IA du site pourrait-elle aider un client à
trouver un vendeur à proximité ?* Ce document est un **constat et une
proposition** : rien n'y est tranché, rien n'est codé, et les points qui
engagent un positionnement ou une dépense restent au porteur.

## 1. Ce qui existe (lu dans le code)

- **Un assistant public**, `/assistant` → `app/api/ai/shopping/route.ts`. L'IA
  (OpenAI, `gpt-4.1-mini` par défaut, ou Gemini, selon la clé posée) ne fait
  qu'**extraire une intention** : `query`, `need`, `budgetHtg`, `location`,
  `kind` (`SHOPPING_EXTRACTION_PROMPT`, `lib/shopping-ai-provider.ts`). Elle ne
  voit **ni le catalogue ni les vendeurs** : le classement est du code
  déterministe, trois résultats au plus (`rankShoppingCandidates`,
  `lib/shopping-ai.ts:49-73`). L'IA ne peut donc pas inventer un vendeur.
- **Des zones** : `zabelie_zones` (`0069`, `docs/33`), trois niveaux
  (département · commune · quartier), 34 zones dont 5 quartiers, libellés en
  quatre langues. Le catalogue sait filtrer par zone (`getSellerIdsInZone`,
  `lib/zones.ts`, `app/catalogue/page.tsx`) et le vendeur déclare la sienne
  (`components/profile-form.tsx`, `app/api/profile/route.ts`).
- **Des points de retrait** : `0082`, répertoire admin (`app/admin/points-retrait`).
- **Zabelie ne livre pas** (`docs/26` v3.3) : le vendeur organise la remise. La
  proximité sert donc à la remise en main propre, au retrait et aux
  prestations ; elle est **sans objet pour un fichier numérique**.

## 2. Le défaut trouvé : une question posée dont la réponse n'est jamais lue

`nextShoppingQuestion` exige `location` (« Dans quelle ville ou localité
êtes-vous ? », `lib/shopping-ai.ts:38`) avant de rendre un résultat. Mais ni
`rankShoppingCandidates` ni `getShoppingRecommendations`
(`lib/shopping-ai-catalogue.ts:7-26`, qui ne transmet que `query`, `kind` et
`sellerId`) ne la lisent. Les seules autres occurrences de `.location` sont
l'interface et les tests. L'acheteur répond donc à une question **obligatoire
pour rien**, sur une connexion qui est souvent lente.

⚠️ Établi par la lecture des deux fonctions et une recherche des consommateurs,
pas par une exécution.

## 3. Mesuré en production le 2026-10-29 (lecture seule)

| Mesure | Valeur |
|---|---|
| Zones actives | 34 (dont 5 quartiers) |
| Profils avec une zone déclarée | **0 sur 4** |
| Offres publiées dont le vendeur a une zone | **0 sur 1** |
| Points de retrait | **0** |

**Même câblée, la proximité rendrait un résultat vide aujourd'hui.** Le
goulot est la donnée, pas l'IA.

⚠️ **Non vérifié** : une clé `OPENAI_API_KEY` ou `GEMINI_API_KEY` est-elle posée
en production ? C'est un secret Vercel, illisible d'ici. Sans clé,
`/assistant` répond 503 à tout message libre (`route.ts:35`) ; le parcours par
formulaire, lui, ne dépend pas de l'IA.

## 4. Comment l'IA aiderait — proposition

1. **Normaliser la localité en zone, sous contrainte.** L'IA reçoit la liste des
   zones actives et renvoie l'identifiant d'**une** zone ou `null`, jamais un
   toponyme libre. « Delmas », « Pétion-Ville », « Okap » deviennent une zone de
   `zabelie_zones`. Si rien n'est reconnu, on le **dit** : jamais de filtre
   silencieux (même règle que la sentinelle `ZERO_UUID` de `lib/zones.ts`).
2. **Classer par proximité hiérarchique** : même quartier, puis même commune,
   puis même département, puis ailleurs. L'écran dit ce qu'il montre (« dans
   votre commune »), et s'il n'y a personne il élargit au niveau parent **en le
   disant**.
3. **Seulement pour les types où elle compte** (physique, prestation), pas pour
   le fichier numérique.
4. **Pas de GPS.** La zone déclarée suffit : aucune permission à demander, aucune
   coordonnée envoyée à un tiers, et ça marche sur un Android d'entrée de gamme.
5. **Si personne n'est proche**, proposer un point de retrait ouvert de la zone
   (`0082`) — il n'y en a aucun aujourd'hui.
6. **Aucune promesse de délai ni de livraison** : Zabelie ne livre pas, le
   vendeur organise la remise.

## 5. Garde-fous et zones d'arrêt

- **Donnée personnelle** : la localité saisie part au fournisseur IA dans le
  message. Relire la politique de confidentialité (`lib/policy-privacy.ts`) avant
  d'étendre l'usage. ⚠️ Non vérifié ici.
- **« Près de chez vous » est une promesse commerciale** (positionnement, zone
  d'arrêt porteur). Ne l'afficher que s'il existe réellement un vendeur dans la
  zone : dans un catalogue vide, ce serait faux par omission.
- **Coût** : une résolution de zone par requête ajoute un appel au fournisseur.
  Les plafonds actuels (10 par minute et par IP, 50 par jour et par IP, 500 par
  jour au total, `route.ts:39-41`) sont à réévaluer avant. Toute dépense nouvelle
  est une décision du porteur.

## 6. Ordre proposé

1. **Maintenant, petit, sans dépendance** : cesser de faire répondre à la
   question de localité tant qu'elle n'est pas lue (la retirer, ou la rendre
   facultative **et** le dire).
2. **Données** : que les vendeurs déclarent leur zone (0 sur 4). Sans cela le
   point 3 ne sert à rien.
3. **Puis le câblage** du §4, derrière les deux conditions précédentes.

**Décision porteur** : retirer la question dès maintenant (point 1), ou la garder
en préparation du point 3 ? Le dépôt a un test qui fige l'ordre actuel des
questions (`tests/shopping-ai.test.ts`) : le changer est un geste volontaire.

---

## 7. Mise à jour du 2026-10-29 — décision du porteur et lot 1 livré

**Décisions du porteur (directes, en session).**
1. Brancher la proximité. *« Livrer loin n'est pas une option viable pour le moment.
   Les vendeurs auront à faire leur propre livraison. »* La proximité cesse d'être
   un confort : elle conditionne l'achat d'un objet physique.
2. *« Par zones, j'entends ville, commune, etc. »* — la hiérarchie existante
   (département · commune · quartier, `docs/33`) est la bonne granularité.
   Approximatif voulu : pas de position précise.
3. **Ajouter aux informations d'inscription du vendeur ses ZONES DE SERVICE**
   (là où il livre, plusieurs possibles) — lot 2, ci-dessous.

**Lot 1 livré — l'assistant classe par proximité.**
- `lib/proximite.ts` (pur) : reconnaît la localité saisie (`zoneDepuisTexte`),
  calcule les périmètres de l'acheteur, le niveau d'un vendeur. `lib/proximite-serveur.ts`
  lit les vendeurs par zone. `lib/proximite-niveaux.ts` ne porte que les types et
  l'ordre (le fournisseur IA importe `lib/shopping-ai.ts` : aucun chemin d'import
  vers la base, test de confinement).
- ⚠️ **Écart avec la proposition du §4** : la reconnaissance du lieu est faite par
  le **code**, pas par l'IA. Elle coûte zéro appel de plus, n'envoie aucune donnée
  de plus à un tiers, et reste déterministe. Elle est fail-closed : lieu inconnu,
  ambigu ou contradictoire → `null`, et l'écran le **dit**.
- Seuls les produits **physiques** sont classés (`compteProximite`). Un vendeur
  lointain reste **proposé** (on peut commander pour un proche, ailleurs) ; il
  passe après. « Zone du vendeur non renseignée » n'est pas « loin » : tant que
  personne n'a déclaré de zone, l'ordre ne change pas.
- Éprouvé : 40 tests, 18 mutations, toutes attrapées.

**Ce que le lot 1 ne fait PAS, et pourquoi.**
- **Pas de GPS.** `zabelie_zones` n'a aucune coordonnée ; en fabriquer de mémoire
  serait inventer une donnée de référence. Une détection de position demanderait
  d'abord un jeu de coordonnées validé.
- **Les zones ne couvrent que le Nord** (10 départements, 19 communes du Nord,
  5 quartiers du Cap-Haïtien — seed par vagues, `docs/33`). Un acheteur ou un
  vendeur de l'Ouest (Port-au-Prince, Delmas, Pétion-Ville…) ne peut **pas**
  déclarer de zone : la règle `ZB069` exige une commune au minimum. **C'est le
  prérequis le plus lourd** : sans communes, la fonction ne sert qu'au Nord.
- **Aucun acheteur n'a d'endroit où déclarer sa zone** (le sélecteur n'existe que
  dans la page boutique du vendeur) ; l'assistant la lit dans sa question.
- **Aucune recherche de vendeurs** n'existe, seulement des fiches individuelles.

**Un choix de conception à connaître : la zone n'est PAS un verrou.** Le lieu qui
compte pour un objet est celui où il sera **livré**, pas celui de la personne qui
paie. La diaspora — marché explicite de Zabelie — commande pour un proche resté en
Haïti. Un « même zone obligatoire » bloquerait ces achats. Le classement favorise
donc le proche sans exclure le lointain ; si le porteur veut un blocage strict, c'est
une décision à part.

## 8. Lot 2 — zones de service du vendeur (livré le 2026-10-29)

Le vendeur ne **dessert** pas que l'endroit où il est installé. Il déclare les zones
où il livre : une ou plusieurs, au niveau qu'il veut — un quartier, une commune, ou
un département entier.

**Ce qui est construit.**
- **Migration `0158`** (`zabelie_seller_service_zones`, `zabelie_service_zone_config`) :
  lecture publique (une zone desservie est une information commerciale que le
  vendeur choisit de publier), écriture **sous la session du vendeur** (RLS,
  `seller_id = auth.uid()`), `insert` et `delete` seulement — **aucun `update`**.
  Le trigger `ZB158` refuse une zone inconnue ou fermée et le dépassement du
  plafond. **Le plafond (20 au départ) est une valeur de config, pas du code**
  (règle dure n°3). Un verrou consultatif sérialise deux ajouts simultanés.
  Aucune fonction `security definer`, aucune RPC, aucun `drop`.
- **Pas de condition de rôle**, volontairement : `creator` n'est promu qu'à la
  création du premier produit (`lib/product-draft.ts`) ; l'exiger aurait interdit
  de déclarer ses zones **avant** de publier, c'est-à-dire à l'inscription. Une
  ligne posée par un compte qui ne vend pas ne produit rien : le classement ne lit
  que les zones des vendeurs dont une offre est publiée.
- **Écran** : `/tableau-de-bord/boutique`, section « Où livrez-vous ? » (cascade
  département → commune → quartier ; la zone ajoutée est la plus profonde choisie).
  La section n'apparaît que si la migration est appliquée.
- **Route** `PUT /api/seller/service-zones` : la liste complète voulue, **seule la
  différence est écrite** (retraits avant ajouts, pour qu'un remplacement ne bute
  pas sur le plafond). Les refus reviennent avec un **code** que l'écran traduit ;
  le message de la base ne part jamais au client.
- **Classement** : le niveau d'un vendeur est le plus proche de deux sources — son
  installation et ses zones desservies (`fusionnerNiveaux`). Une zone desservie
  **plus large** que l'acheteur (« toute la commune » pour un acheteur d'un
  quartier) donne le niveau de sa propre largeur : « commune », pas « quartier ».
- **Libellé** : « Le vendeur **déclare** livrer dans votre commune ». Attribué au
  vendeur, sans promesse de délai : **Zabelie ne livre pas et ne garantit rien**. À
  égalité, le fait de localisation (« dans votre commune ») prime sur la déclaration.

**Appliquée en production le 2026-10-29** (autorisation permanente du 2026-08-17) : SQL reçu par Supabase == fichier du dépôt (sha256 `4490c529…`), ligne de registre `journal_supabase`, vérifiée après coup (RLS, 0 ligne, plafond 20, `anon` sans écriture, aucun `update`, garde `SECURITY INVOKER`).

**Éprouvé.** 34 tests TS, un test SQL (S1–S7 dont l'insertion groupée) et un test
**concurrent** (dix sessions, plafond de 1, une seule passe). **29 mutations TS et
10 mutations SQL, toutes attrapées.** Une seule a d'abord survécu : le test
concurrent ne creusait pas la fenêtre de course (les sessions se suivaient sans se
chevaucher) — la mutation « sans verrou » passait. Corrigé en gardant chaque
transaction ouverte 0,4 s, puis re-mesuré.

**Ce que le lot 2 ne fait PAS.**
- Les zones restent **le Nord seulement** : un vendeur de l'Ouest ne peut toujours
  rien déclarer. Prérequis porteur, inchangé (§7).
- L'acheteur n'a toujours pas d'endroit où déclarer sa zone ; la fiche produit ne
  montre pas encore « Livre à : … (déclaré par le vendeur) » ; aucun rappel au
  vendeur qui n'a déclaré aucune zone. Lot 3.
- Rien n'est vérifié par Zabelie : une zone desservie est **déclarative**.

## 9. Lot 3a — le filtre « Zone » du catalogue (livré le 2026-10-29)

Le filtre « Zone » de `/catalogue` ne montrait que les vendeurs **installés** dans la
zone. Un vendeur installé à Delmas qui déclare livrer à Cap-Haïtien en était absent :
l'acheteur de Cap-Haïtien ne le trouvait pas, alors que c'est exactement ce que la
décision du porteur voulait rendre possible.

- `getSellerIdsInZone` réunit désormais, **sans doublon**, les vendeurs installés et
  ceux qui **déclarent livrer** dans une zone qui recouvre la zone filtrée
  (`zonesRecouvrantes`) : la zone elle-même, une zone **dans** elle (le vendeur en
  sert une partie), une zone qui la **contient** (il sert tout le département).
  Un quartier **frère** ne recouvre pas : qui ne déclare que Haut-du-Cap ne sert pas
  Carénage.
- Table absente (code déployé avant `0158`) ou lecture en échec → le filtre garde les
  seuls vendeurs installés, c'est-à-dire le comportement d'avant. Une table absente
  ne journalise pas à chaque page ; toute autre erreur, si.
- L'écran le dit sous le filtre : « Vendeurs installés dans cette zone, et vendeurs
  qui déclarent y livrer. Zabelie ne livre pas : la remise est organisée par le
  vendeur. » Quatre langues.
- ⚠️ Plafonné par la limite de lignes de PostgREST (1000) : au-delà, des vendeurs
  sont omis. La troncature dégrade vers **moins** de résultats, jamais vers un
  vendeur proposé à tort.

**Éprouvé** : 11 tests, 12 mutations (recouvrement sans ancêtres, sans sous-arbre,
avec les frères, cycle non borné, union perdue, table absente bruyante, note affichée
sans filtre…), toutes attrapées.

**Reste (lot 3b, porteur ou suite)** : un endroit où l'acheteur déclare sa zone ; la
mention « Livre à : … (déclaré par le vendeur) » sur la fiche produit ; un rappel au
vendeur qui n'a déclaré aucune zone ; une page de recherche de vendeurs.

## 10. Les communes des neuf autres départements (migration `0159`, 2026-10-29)

**Demande directe du porteur** : « ajoute les communes et les autres départements ». Les
dix départements existaient déjà (`0069`) ; ce qui manquait, ce sont leurs communes — et
`ZB069` exige une commune au minimum pour déclarer une zone. Sans elles, un vendeur ou un
acheteur de l'Ouest ne pouvait rien déclarer, et tout le chantier de proximité (§7 à §9)
ne servait que le Nord.

**Ce qui est construit.** 121 communes (AR 15 · CE 12 · GA 12 · NI 11 · NE 13 · NO 10 ·
OU 20 · SD 18 · SE 10) qui, avec les 19 du Nord, font **140**. Elles entrent **fermées**
(`is_active = false`) : la RLS de `zabelie_zones` ne montre que les zones ouvertes, donc
**rien ne change de visible** tant que le porteur n'a pas ouvert une zone. Il le fait
depuis `/admin/zones` (« Rouvrir », journalisé dans `zabelie_admin_actions`), par vagues,
après relecture.

**Appliquée en production le 2026-10-29** (autorisation permanente du 2026-08-17 + instruction directe du porteur) : SQL reçu par Supabase == fichier du dépôt (sha256 `507d3397…`), ligne de registre `journal_supabase`, vérifiée après coup (140 communes, 19 ouvertes — le Nord —, 0 ouverte ailleurs, 10 départements et 5 quartiers intacts).

**Vague 1 — l'Ouest ouvert le 2026-10-29**, sur instruction directe du porteur (« ouvre l'ouest dans admin zone »). Les 20 communes (Port-au-Prince, Delmas, Carrefour, Pétion-Ville, Tabarre, Cité Soleil, Kenscoff, Gressier, Léogâne, Petit-Goâve, Grand-Goâve, Cabaret, Arcahaie, Croix-des-Bouquets, Ganthier, Thomazeau, Fonds-Verrettes, Anse-à-Galets, Pointe-à-Raquette, Cornillon) sont ouvertes ; 20 lignes `zone.activate` au journal `zabelie_admin_actions` (acteur : le porteur, `metadata.via = agent-mcp`, même effet que le bouton « Rouvrir »). Vérifié sous le rôle `anon` réel : 39 communes visibles (Nord + Ouest), une commune encore fermée (Les Cayes) invisible. L'effectif de l'Ouest (20) est l'un des cinq recoupés avec une source externe ; les graphies kreyòl restent à relire. **Vague 2 — le Sud et le Sud-Est ouverts le même jour**, sur instruction directe du porteur (« ouvre aussi le sud et le sud-est »). 18 + 10 communes, 28 lignes `zone.activate` de plus (48 au total). Les effectifs du Sud (18) et du Sud-Est (10) sont, eux aussi, parmi les cinq recoupés avec une source externe. Vérifié sous le rôle `anon` réel : 67 communes visibles (Nord 19 + Ouest 20 + Sud 18 + Sud-Est 10), les villes encore fermées invisibles.

**Vague 3 — les six départements restants ouverts le même jour, un par un**, sur instruction directe du porteur (« ouvre tous les départements qui restent un par un ») : Artibonite (15), Centre (12), Grand'Anse (12), Nord-Est (13), Nippes (11), Nord-Ouest (10), soit 73 communes. Chaque département a eu sa propre requête, sa propre trace d'audit et sa propre vérification. **Total : 121 lignes `zone.activate`, 140 communes ouvertes sur 140, 10 départements, 5 quartiers.** Vérifié sous le rôle `anon` réel : les 140 communes sont visibles.

**⚠️ Ce qui reste vrai malgré l'ouverture.** Pour AR, CE, GA, NE et NO, l'effectif n'a **jamais été recoupé** avec une source ouverte : la liste est celle de l'agent, de mémoire. Les graphies kreyòl attendent une relecture native. Les communes sont en ligne **avant** ce recoupement, à la demande du porteur. Une commune manquante s'ajoute par un `insert` ; une commune fausse se ferme depuis `/admin/zones` (« Fermer »). Aucune donnée d'acheteur ni de vendeur n'est liée à ces zones tant que personne ne les déclare : fermer une zone fausse avant usage ne casse rien.

**⚠️ Provenance non vérifiée.** Le 2026-10-29, le réseau de la session refusait
`fr.wikipedia.org` et `en.wikipedia.org`, et le scraper n'avait pas de clé valide : aucune
page de référence n'a pu être ouverte. La liste est celle de l'agent, de mémoire. Sa seule
vérification est **interne** : les effectifs somment à 140, et cinq départements (OU 20,
ND 19, SD 18, NI 11, SE 10) ont été recoupés avec un résumé de recherche externe ; les
cinq autres (AR, CE, GA, NE, NO) ne reposent que sur la mémoire et la somme. Une source
relève aussi **146 communes** (création par décret, 2015) : il peut en **manquer**. Ajouter
une commune est un simple `insert`. **À recouper avec l'IHSI ou Wikipédia avant d'ouvrir
un département.**

**⚠️ Graphies kreyòl** : de l'agent, best-effort, **en attente de relecture native** (même
statut que le seed du Nord). Quand une graphie n'était pas certaine, le nom français a été
repris tel quel.

**Éprouvé.** Test SQL K1–K5 (effectifs par département, fermeture vue d'`anon`, et tout le
chemin : une commune fermée est refusée, rouverte elle est déclarable, `region_code` dérive
`HT-OU` et la zone de service s'écrit) ; 9 tests TS (dont : **chacune des 140 communes est
retrouvée par son nom français ET kreyòl** par le moteur de reconnaissance de lieu, aucune
ambiguïté) ; **8 mutations SQL et 8 mutations TS, toutes attrapées**.

**Ce que `0159` ne fait pas.** Aucun quartier (optionnel), aucune coordonnée, aucun
département modifié, rien d'ouvert. Pas de bouton « ouvrir tout un département » : il
faut ouvrir les communes une à une dans `/admin/zones`, ou demander l'ouverture d'un
département entier (une écriture sur des données de référence réelles, annoncée).

## 11. La zone de l'acheteur, mémorisée (cookie `zabelie_zone`, politique v4)

**Demande directe du porteur (2026-10-29)** : « Mémoriser la zone de l'acheteur ». Devant le choix
(cookie, compte ou rien de stocké), le porteur a retenu **« Cookie + politique v4 »**.

**Ce qui est construit.**
- **Le cookie `zabelie_zone`** ne contient qu'**un identifiant de zone** (département, commune ou
  quartier) — jamais une position précise, jamais un texte libre. **Posé seulement au clic** sur
  « Mémoriser ma zone » ; `HttpOnly`, `SameSite=Lax`, `Secure` en production, **180 jours**. Aucune
  écriture en base, aucun compte requis. `POST /api/zone` valide l'identifiant contre la liste des zones
  **ouvertes** (le cookie ne reçoit jamais le texte reçu) ; `DELETE` l'efface avec les mêmes attributs ;
  l'origine est contrôlée aux deux verbes. Un cookie forgé, périmé ou désignant une zone fermée est
  **ignoré**, jamais une erreur.
- **`/assistant`** : la localité est **préremplie** par la zone mémorisée — visible et modifiable. Un nom
  de moins de trois lettres n'étant pas reconnu par le moteur (« Nò » en kreyòl), le nom français est
  alors utilisé ; un quartier est suivi de sa commune, parce que des quartiers homonymes existent.
- **`/catalogue`** : la zone mémorisée est **proposée** (« Voir le catalogue de ma zone »), **jamais
  appliquée d'office** — le filtre actif ne dépend que de l'adresse, donc ni un robot ni un lien partagé
  ne voient autre chose. Le bloc vit dans le panneau repliable « Filtrer les produits », à côté du filtre
  « Zone » (il n'est visible qu'une fois le panneau ouvert ; sur `/assistant` il est visible d'emblée).

**La politique de confidentialité passe en `confidentialite-v4`.** Le cookie est déclaré dans le §8, dans
les quatre langues — un test du dépôt l'exige — et le texte de la politique est **empreint** : le changer
impose une nouvelle version, une migration et une ré-acceptation. Le §8 passe de trois à **quatre**
catégories : ce cookie n'est pas « nécessaire au fonctionnement » (le site marche sans), c'est **une
préférence que l'utilisateur demande** en cliquant.
- **`0160`** redéfinit les deux fonctions d'acceptation pour accepter `v1`, `v3` **et** `v4` : la fenêtre de
  déploiement est traitée (un client en vol déclare encore `v3`, et le reçu porte exactement ce qui a
  été déclaré). Elle est **additive**, donc sans danger appliquée avant le code.
- ⚠️ **ORDRE OBLIGATOIRE : appliquer `0160` AVANT de fusionner le code.** L'inverse laisserait
  l'application exiger un reçu `v4` que la RPC ne sait pas écrire : ré-acceptation en boucle.
- **Coût** : chaque compte existant repasse **une fois** par `/connexion?mode=legal`. Le moment est le
  moins cher qu'il y aura (4 profils au relevé du 2026-10-29).
- ⚖️ **À faire valider par le conseil** : la lecture « préférence demandée, sans consentement séparé »
  (le cookie n'est posé qu'au clic et ne sert qu'à l'utilisateur). Les versions kreyòl, anglaise et
  espagnole de la politique ne sont relues ni par un juriste ni par un locuteur natif.

**Éprouvé.**
- **28 tests** (logique, route, composant, intégration des pages, déclaration dans la politique, durée
  écrite == durée du code) et **31 mutations, toutes attrapées** ; test SQL **LA12** (`v1`/`v3`/`v4` acceptés
  tels que déclarés, `v2` et `v5` refusés), suite SQL complète rejouée sur un Postgres neuf.
- **Parcours dans un vrai navigateur** (application construite + faux Supabase patché, trois passes) :
  aucun cookie avant le clic ; bouton désactivé sans zone ; cookie `HttpOnly`/`Secure`/`Lax`/180 jours,
  illisible par `document.cookie` ; le catalogue propose sans appliquer ; l'assistant préremplit ;
  « Oublier » efface le cookie **et** la localité ; trois valeurs forgées × deux pages → 200 sans zone ; la
  route refuse zone inconnue (422), autre origine (403, POST et DELETE) et corps illisible (400) sans
  poser de cookie ; rendu kreyòl vérifié.
- **Trois défauts trouvés par ces instruments, avant la fusion** : (1) « Nò » (2 lettres) n'est pas reconnu
  par le moteur — le prérempli kreyòl du département Nord aurait été « non reconnu » ; (2) mon test de
  casse était **vide** (identifiants sans lettre : la majuscule ne changeait rien) — une mutation a
  survécu ; (3) le bloc est dans un panneau **replié** — invisible tant qu'on ne l'ouvre pas, ce que
  seuls les tests unitaires ne pouvaient pas montrer.

**Ce qui n'est PAS couvert, dit tel quel.**
- Le harnais e2e de la CI **ne peut pas** exercer ce parcours : son faux Supabase ne sert des zones qu'à
  un scénario d'identité authentifié. La vérification en navigateur ci-dessus est manuelle, pas un test
  committé. Servir des zones à tous, c'est changer le catalogue de tous les parcours physiques.
- Le cookie suit l'**appareil**, pas la personne : un acheteur qui change de téléphone doit la remémoriser.
- La zone mémorisée **ne classe pas** le catalogue : elle propose un lien et préremplit l'assistant.


## 12. La suite demandée le 2026-10-29 : sept lots (A à G)

**Demande directe du porteur** : après l'analyse de pertinence (cookie de zone, Mercado Libre Flex, Jumia,
TikTok Shop), « appliquer numéro 2, 3, 4, 5, 6, 7, 8, puis tes recommandations en tant que dev expérimenté ».
Les huit points de l'analyse, tels qu'ils sont devenus des lots :

| Lot | Contenu | Points de l'analyse |
|---|---|---|
| **A** | Zone de REMISE structurée sur la commande physique (`0161`), choisie à chaque commande | recommandation, base de 4, 5, 8 ; **7** (repère) |
| B | « Personne ne livre ici » + demande capturée par zone | 2 |
| C | Code de remise qui confirme la réception | 3 |
| D | Frais et délai ANNONCÉS par zone, pause de zone | 4, 6 |
| E | Délai CONSTATÉ (mesuré) ; ventes du vendeur groupées par zone | 5, 8 |
| F | Points de retrait par zone (Jumia, `0082`) | recommandation |
| G | Lien partagé du catalogue d'une zone (TikTok Shop) | recommandation |

### 12.1 Lot A — la zone de remise (`0161`)

**Le trou.** Ce que le vendeur savait de l'endroit de la remise était du **texte libre**
(`zabelie_order_recipients.locality`, `zabelie_delivery_info.adres_liv`) : lisible par un humain, inutilisable
par le logiciel. Sans zone **structurée** sur la commande, on ne peut ni grouper les remises d'un vendeur, ni
mesurer un délai par zone, ni comparer la zone de remise à ce que le vendeur déclare desservir (`0158`).

**La zone utile n'est pas celle de l'appareil.** Un acheteur de la diaspora commande pour un proche resté en
Haïti : la zone se choisit **à chaque commande**.

⚠️ **Le cookie `zabelie_zone` (§11) ne préremplit PAS le sélecteur — décision prise après qu'un garde du
dépôt a réagi.** La politique (§8) le déclare « pour classer en premier les offres proches de vous » :
le lire pour préremplir la remise serait un second usage, donc une nouvelle version de la politique et une
ré-acceptation par chaque compte. `tests/zone-acheteur.test.ts` (qui liste les fichiers lisant le cookie) a
rougi sur ma première version, et c'est exactement son rôle. **Décision porteur possible** : si le
préremplissage vaut une troisième ré-acceptation, il s'ajoute avec une phrase de plus au §8.

**Ce qui est construit.**
- **`zabelie_order_zones`** (`0161`) : une ligne par commande physique, `zone_id` au niveau **commune ou
  quartier** (le garde ZB161 refuse un département seul, une zone fermée ou inconnue, une commande
  numérique ou déjà payée). **Écrite par le service-role uniquement** ; le client ne peut ni écrire, ni
  modifier, ni supprimer. Lecture : l'acheteur, et le vendeur **une fois la commande payée** (même fenêtre
  que le destinataire, `0102`). Aucune fonction `security definer`, aucun `drop`.
- **Sélecteur** (`components/zone-remise.tsx`, dans le bouton d'achat, **objets physiques seulement**) :
  département → commune → quartier ; un département seul est refusé comme par la base. Réserve **neutre** :
  « Ce vendeur ne déclare pas livrer dans cette zone » — affichée **seulement** si le vendeur a déclaré des
  zones ET qu'aucune ne recouvre la destination. **Rien déclaré = on ne sait pas = aucune réserve**
  (même doctrine que `inconnue` ≠ `ailleurs`). Elle n'empêche ni le choix ni l'achat.
- **Le paiement ne dépend de rien de tout ça.** La zone est une **classification**, pas une condition :
  l'écriture est « au mieux » après l'acquisition du paiement, son échec est journalisé et **ignoré**, et
  elle n'entre pas dans la comparaison d'idempotence. Une zone qui ne s'enregistre pas ne rend aucune
  commande indélivrable (contrairement au destinataire ou au numéro de recharge, qui bloquent).
- **Affichage** : « Zone de remise · Ouest › Delmas › Delmas 33 » dans `/mes-ventes` (fenêtre « payée ») et
  `/mes-achats`, sous la session — aucun service-role, la policy reste le garde.
- **Export de compte** : `order_zones` rejoint l'export des données.

**Point 7 (le repère) : déjà là, il fallait le nommer.** Le champ `note` du destinataire (500 caractères) est
exactement un repère ; le libellé le disait mal (« Précisions utiles »). Il devient « Repère et précisions
utiles » dans les quatre langues. **Aucune nouvelle donnée personnelle, donc aucune nouvelle version de la
politique** : la zone de remise est la même « adresse de remise » que le §3 décrit déjà (« Coordonnées de
remise »), montrée au vendeur dans les mêmes conditions. ⚖️ À faire confirmer par le conseil en même temps
que la lecture du cookie (§11).

**Choix à connaître.**
- **La zone n'est pas effacée à la fermeture d'un compte.** Le destinataire (nom, téléphone) l'est ; la zone
  est une classification de commune sur une commande conservée pour la comptabilité, rattachée à un compte
  devenu anonyme. Elle ne désigne plus personne. ⚖️ À valider avec le reste.
- **Le panier groupé ne porte pas la zone** : la route du panier n'a jamais porté de destinataire non plus.
  Les commandes passées par le panier n'ont donc pas de zone structurée.
- **Une zone fermée après coup n'est plus affichée** (la RLS de `zabelie_zones` la masque) : jamais un
  chemin inventé.
- **Ordre de déploiement** : appliquer `0161` AVANT de fusionner. Le code tolère la table absente à
  l'affichage et à l'écriture, mais l'**export de compte** lit la table et refuse son fichier s'il ne la
  trouve pas (règle du dépôt : jamais un export partiel).

**Éprouvé (lot A).**
- **SQL** `supabase/tests/order_zones.test.sql` (Z1→Z5) : connu-positif (commune, quartier), **six connus-négatifs
  du garde** (département seul, zone fermée, zone inconnue, commande numérique, commande déjà payée, `update`
  vers un département), fenêtre de lecture (acheteur oui, tiers non, vendeur non avant paiement / oui après,
  anon aucun droit), client sans écriture, cascade. **Six mutations de la migration, toutes attrapées**
  (niveau, zone fermée, commande payée, produit numérique, fenêtre vendeur, droit d'écriture).
- **Paiement** : quatre cas ajoutés au harnais d'idempotence (zone enregistrée avec le bon identifiant
  **après** l'acquisition du paiement ; formes invalides et produit non physique n'écrivent rien ; **l'échec de
  l'écriture — quatre codes d'erreur — ne bloque jamais le paiement** ; le rejeu ne double rien). **Quatre
  mutations de la route attrapées**, dont « l'échec de zone devient un 503 » et « garde rendu inatteignable ».
- **Logique pure** (`tests/zone-remise.test.ts`, 14 tests) : recouvrement sur toutes les paires de l'arbre,
  **identique à `zonesRecouvrantes`** de `lib/zones` (deux implémentations du même arbre, garde de dérive) ;
  « rien déclaré = aucune réserve » ; département seul refusé ; cycle de données terminé. **Six mutations
  attrapées.**
- **Deux gardes du dépôt ont réagi, à raison** : `tests/promesse-vendeur.test.ts` (la clé `zr.notCovered`
  affirme quelque chose d'un vendeur — faux positif du mot anglais *agree*, classé avec sa raison, comme ses
  voisines) et `tests/zone-acheteur.test.ts` (ma première version lisait le cookie pour préremplir : second
  usage non déclaré — **retiré**, voir plus haut).
- **Navigateur réel** (application construite + faux Supabase patché hors dépôt, 390 px) : sélecteur présent
  sur un objet physique ; **vide malgré un cookie `zabelie_zone`** ; département seul →
  « Choisissez au moins la commune. » **et** le paiement part quand même, sans `deliveryZoneId` ; réserve
  affichée sur une commune non déclarée, absente sur une commune déclarée, **absente quand le vendeur n'a
  rien déclaré** ; le corps de paiement porte l'identifiant du quartier choisi ; rendu kreyòl ; aucun
  débordement horizontal ; aucune erreur de console.
- Suites complètes : **TypeScript 2601 tests**, **SQL** rejouée sur un Postgres neuf (les trois scripts de
  concurrence relancés à part avec l'URL `localhost` qu'ils exigent).

**Appliquée en production le 2026-10-29 à 14:09:48 UTC** (PR #450, `6ad07b1`), **avant** la fusion, sous
l'autorisation permanente du 2026-08-17 et l'instruction directe du jour : SQL reçu par Supabase == fichier,
à l'octet (SHA-256 `1a07a836…`, MD5 `9d4c4c7b…`), ligne de registre `journal_supabase` (empreinte canonique
`89d7182a…`) — registre à **161 lignes pour 161 fichiers**. Les post-conditions de la migration (RLS, droits,
garde, trigger) ont tourné en production.

**Ce que ce lot ne prouve pas.** La CI e2e ne sert pas de zones à la fiche produit (son faux Supabase ne le
fait que pour un scénario d'identité) : le sélecteur y est donc **masqué**, et le parcours d'achat y reste
celui d'avant — c'est voulu, mais ce n'est pas un test du sélecteur. La vérification navigateur ci-dessus est
manuelle et n'est pas committée.

### 12.2 Lot B — « Aucune offre pour cette zone » + la demande capturée (`0162`)

**Le trou.** L'acheteur qui filtrait une zone vide lisait « aucun résultat » : personne n'apprenait rien. Or une
zone ouverte sans vendeur est **le seul signal de recrutement** qu'une marketplace sans offre locale puisse
produire (la logique de `0047`, appliquée aux zones). Inspiré de Mercado Libre et de Jumia : savoir **où**
l'offre manque avant de la construire.

**Ce qui est construit.**
- **Écran « zone sans vendeur »** dans le catalogue — affiché **seulement** quand la zone est le **seul**
  filtre actif (ni recherche, ni rayon, ni sous-rayon, ni prix, ni univers). Avec un autre filtre, le vide ne
  dit plus rien de la zone, et l'écran générique reste. Deux gestes : **« Je cherche un vendeur ici »** et
  **« Inviter un vendeur (WhatsApp) »** (lien `wa.me/?text=` sans numéro, message prérempli avec le nom de la
  zone et le lien `/vendre` — c'est le canal WhatsApp, puisque `RESEND_API_KEY` est absente).
- **`0162`** : `zabelie_zone_demand`, un **compteur par zone et par jour**. **Aucun identifiant** — ni compte,
  ni IP, ni empreinte de session, ni texte libre. Écriture par une fonction `security definer` retirée à
  `public`/`anon`/`authenticated`, appelée par le service-role depuis la route ; RLS active, **aucune
  policy** : un client ne lit ni n'écrit rien. La fonction refuse une zone inconnue ou fermée.
- **`POST /api/zone/demande`** : publique par conception, gardée par le contrôle d'origine **et** un débit borné
  (IP **hachée** à la minute et au jour, puis global) ; elle ne transmet à la base que l'identifiant de zone.
- **Administration** (`/admin/zones`) : « Demande par zone — 30 jours », avec le nombre de vendeurs qui
  **déclarent** y livrer. « Zéro vendeur et des clics » = une zone où recruter. Le nombre de vendeurs est un
  **plancher** (un vendeur installé là sans rien déclarer n'y figure pas) : l'écran le dit.

**Choix à connaître.**
- **Un clic explicite, pas un compteur passif.** Les robots d'indexation parcourent les URL de filtre : un
  compteur de visites compterait des fantômes (la règle de `0047` : « on irait recruter un commerçant sur un
  fantôme »). Un clic est un signal plus rare mais honnête.
- **Pas d'identifiant, donc pas de ligne de politique** : le compteur lui-même ne contient aucune donnée
  personnelle. (Le débit de la route, lui, passe par l'IP hachée dans `zabelie_rate_limit`, comme l'assistant
  d'achat — pratique existante, non modifiée.)
- **Une conséquence assumée de « pas d'identifiant »** : on ne compte pas de personnes distinctes. Un appareil
  ne clique qu'une fois par zone (commodité du navigateur), la route borne le reste ; le chiffre est un ordre
  de grandeur, pas un décompte.
- **La sonde de présence est étendue** : `tests/objets-requis-couverture.test.ts` exige que tout `.rpc()` du code
  figure dans `zabelie_objets_requis()` (sinon `/api/admin/coherence` resterait vert pendant que le clic serait
  mort) — il a rougi à la première version. `0162` redéfinit donc la sonde **en entier** (forme de 0085→0156),
  avec une ligne de plus. Vérifié avant l'écriture : la définition déployée en production est **identique** à
  celle de `0156` (même MD5 de `pg_get_functiondef`), donc la copie ne perd rien. La production signale **une**
  absence (`zabelie_purge_sent_notices`, de `0056`) : c'est l'absence VOLONTAIRE documentée par `CLAUDE.md`
  (migration gelée jusqu'aux arbitrages D-10→D-14).
- Aucune purge n'est nécessaire (au plus une ligne par zone et par jour, sans donnée personnelle), donc aucune
  fonction de maintenance sans appelant n'est créée (`tests/crons-appelants.test.ts`).

**Appliquée en production le 2026-10-29 à 14:30:35 UTC** (PR #451, `95cadcf`), **avant** la fusion, sous l'autorisation
permanente du 2026-08-17 et l'instruction directe du jour : SQL reçu par Supabase == fichier, à l'octet (SHA-256
`e34bedaf…`, MD5 `6021f829…`), ligne de registre `journal_supabase` (empreinte canonique `1f049c6b…`) — registre à
**162 lignes pour 162 fichiers**. Vérifié en production après coup : la sonde compte **176 objets dont 175
présents** et voit `zabelie_record_zone_demand(uuid)` ; la fonction n'est exécutable ni par `anon` ni par
`authenticated`.

**Éprouvé (lot B).** SQL `zone_demand.test.sql` (D1→D5) et **6 mutations de la migration attrapées** ; 11 tests
TypeScript (route, classement pur, structures qui commandent) et **12 mutations attrapées** (débit par IP,
zone brute, origine, refus de la base ignoré, panne déguisée en succès, IP brute comme clé, couverture,
tri, compteurs nuls, trois conditions de l'écran).

### 12.3 Lot C — le code de remise (`0163`)

**Le point 3 de l'analyse** : « code de remise qui libère le séquestre ». C'était le seul point à **toucher
le chemin de l'argent** (arrêt ferme du porteur) ; la demande directe du 2026-10-29 le lève. Voici la forme
retenue, et pourquoi elle ne change **aucune règle d'argent**.

**Deux risques, un seul geste.**
- **Le contournement** : quand le vendeur remet lui-même, acheteur et vendeur peuvent finir la vente par
  WhatsApp, hors du séquestre. Le code les rend à l'écran de Zabelie au moment de la remise.
- **Le silence** : l'acheteur qui ne confirme jamais est payé par le délai (« le réglage par défaut est : le
  vendeur est payé », `docs/21` §3 bis). Le code est une **confirmation explicite de l'acheteur**, faite à la
  main : il le lit dans « Mes achats », le dit au vendeur **devant l'objet**, le vendeur le saisit.

**Ce que ça ne change pas — le point qui compte.** Un bon code appelle `zabelie_mark_received` avec l'identité
de l'**acheteur** — le chemin d'écriture **unique** qui libère l'escrow (`docs/21` §3), le même que le bouton
« J'ai reçu ». Donc :
- **le plancher anti-fraude est conservé** : `matures_at = greatest(matures_at, now() + délai)` — le J+7 posé
  au paiement reste un plancher. **Une réception confirmée au 2ᵉ jour ne paie pas le vendeur au 2ᵉ jour.**
  Le test SQL l'éprouve : après un bon code, `matures_at` est resté dans le futur, `mature_wallets()` rend 0,
  aucun solde ne bouge, l'identité de `0033` tient ;
- la migration **ne contient aucune écriture d'argent** (ni escrow, ni portefeuille, ni grand livre) — un test
  TypeScript le vérifie sur le fichier SQL sans ses commentaires ;
- le code **ne remplace pas** la confirmation de l'acheteur dans l'application : il s'y ajoute, et un code
  verrouillé laisse la confirmation intacte.

**Le code.** Six chiffres d'un aléa cryptographique (`gen_random_uuid`), créés **à la demande de l'acheteur**
(rien à changer dans le chemin de paiement). **Lisible par l'acheteur seul** : la table n'a aucun droit client
et la lecture passe par une fonction qui vérifie que l'appelant est l'acheteur — le vendeur **ne peut pas** le
lire. 10⁶ possibilités, `handover_code_max_attempts` essais (config, **5**) : un vendeur qui devine a 5 chances
sur un million, puis le code se verrouille. Un essai faux est **enregistré même si l'appel « échoue »** (les
fonctions rendent un refus au lieu de lever : une exception annulerait l'incrément et rendrait l'essai gratuit) ;
une valeur qui n'a pas la forme de six chiffres n'use pas d'essai. Un bon code vaut **déclaration** (une
remise en main propre n'a souvent jamais été déclarée) et ne crée aucun avis (l'acheteur est celui qui vient
de parler).

**Les écrans.** `/mes-achats` : « Afficher mon code de remise » (à `awaiting_shipment` comme à `shipped`),
avec l'avertissement « donnez-le seulement quand vous avez l'objet en main ». `/mes-ventes` : champ « Code de
remise de l'acheteur » (six chiffres, bouton actif à six), erreurs dites (essais restants, verrouillé, code non
affiché, état). Quatre langues. Le code est un **secret de session** : jamais dans l'URL, jamais dans le
stockage du navigateur, **jamais journalisé** (les deux routes ne contiennent aucun `console.*`, vérifié).
Les routes lisent l'identité dans la **session** ; un `sellerId` forgé dans le corps est ignoré.

**Ce que ça n'est pas.**
- **Pas une preuve de livraison** : une preuve que l'acheteur a donné son code. Un acheteur contraint de le
  donner avant d'avoir l'objet est un risque social, que l'écran dit.
- **Pas une défense contre la collusion** acheteur-vendeur fabriquant une fausse vente : le plancher J+7 est
  ce qui la borne.
- **Hérité de `0043`, non modifié** : un avis `reminder_buyer` déjà programmé peut partir après une réception
  (déjà vrai du bouton « J'ai reçu »). Le code n'aggrave rien ; la lacune reste à traiter à part.

**Appliquée en production le 2026-10-29 à 14:47:13 UTC** (PR #452, `211bb26`), **avant** la fusion, sous l'autorisation
permanente du 2026-08-17 et l'instruction directe du jour : SQL reçu par Supabase == fichier, à l'octet (SHA-256
`527667bf…`, MD5 `f1cb684e…`), ligne de registre `journal_supabase` (empreinte canonique `02c0c749…`) — registre à
**163 lignes pour 163 fichiers**. Vérifié en production après coup : la sonde compte **178 objets dont 177
présents** (seule absente : `zabelie_purge_sent_notices`, `0056` gelée), voit les deux fonctions ; ni l'une ni l'autre
n'est exécutable par `anon` ou `authenticated`, la table n'a aucun droit client, RLS active, plafond d'essais = 5,
**aucun code émis** à ce jour.

**Éprouvé (lot C).** SQL `handover_code.test.sql` (H1→H7) et **15 mutations de la migration attrapées**
(plancher rogné, n'importe quel code accepté, essai non enregistré, plus de verrou, autre vendeur,
lecture par le vendeur, garde de forme, table lisible, réception « automatique », litige clos par code,
plafond en dur, `confirmed_at`, code délivré après réception, avis créés, fonction exposée) ; 10 tests
TypeScript et **21 mutations attrapées** (identité dans le corps, cache, débit, code journalisé, borne de
longueur, motifs HTTP, stockage navigateur, saisie non filtrée, écrans).

### 12.4 Lot D — les conditions d'une zone : frais annoncés, délai annoncé, pause (`0164`)

**Les points 4 et 6 de l'analyse.** Mercado Libre Flex et Jumia affichent avant tout deux choses : **combien** et
**en combien de temps**. Le vendeur, lui, a besoin d'une **pause** : un barrage, une panne de carburant, une zone
devenue impraticable ne doivent pas l'obliger à supprimer puis re-déclarer ses zones — ni laisser l'écran promettre
ce qu'il ne peut pas tenir. `0158` disait OÙ le vendeur livre ; `0164` dit à quelles conditions.

**⚠️ Les frais ne font PAS partie du paiement — décision d'argent NON prise.** `fee_htg` est une **information
affichée**, attribuée au vendeur (« Frais annoncés par le vendeur »). Elle n'est ajoutée à aucun montant de
commande, ne passe par aucun rail, n'entre dans aucun escrow ni grand livre, et la migration ne touche ni `orders`,
ni les paiements, ni les soldes. **Les ajouter au paiement est une décision d'argent** (commission sur les frais ?
séquestre des frais ?) liée au dossier BRH de rétention (`docs/17`) : elle appartient au porteur, et le texte
affiché le dit à chaque fois (« Ces frais ne font pas partie du paiement Zabelie : à convenir avec lui »). C'est
aussi la réalité d'aujourd'hui : la fiche demande déjà de convenir des frais avec le vendeur avant d'acheter.

**Ce qui est construit.**
- **`0164`** : trois colonnes sur `zabelie_seller_service_zones` — `fee_htg` (0 à 100 000, `NULL` = à convenir,
  **0 = offerts** : deux choses distinctes), `delay_hours` (1 à 720), `paused_until` (une **date**, pas un drapeau).
  Le vendeur modifie **SES** lignes sous sa session (RLS), et le droit de modification est limité **PAR COLONNE** à
  ces trois-là : `zone_id` et `seller_id` restent **immuables** (le post-contrôle de la migration le vérifie).
- **La pause est bornée** (garde **ZB164**) par `max_pause_days` en config (30 par défaut, jamais en dur), à
  l'insertion comme à la modification, et **expire d'elle-même** : un vendeur qui oublie de la lever ne disparaît pas
  pour toujours. Sa date est calculée **par le serveur** (« suspendre 7 jours »), jamais par le navigateur.
- **Éditeur vendeur** (`/tableau-de-bord/boutique`) : chaque zone devient une carte — frais, délai, pause — avec le
  rappel que ce sont SES annonces, hors paiement. `PUT { zones: [{ zoneId, feeHtg?, delayHours?, pause? }] }` ;
  **`undefined` = ne pas toucher, `null` = effacer** : le format d'avant (`{ zoneIds }`) **n'efface aucune** condition
  existante. On n'écrit que la **différence** (une ligne inchangée n'est jamais réécrite).
- **Fiche produit** : pour la zone de remise choisie, les conditions de la zone déclarée **la plus proche** qui la
  recouvre (la zone elle-même, sinon l'ancêtre le plus bas ; **jamais** un descendant : « je ne dessers qu'un
  quartier » ne donne pas de conditions à toute la commune). Une zone en pause affiche « Le vendeur a suspendu la
  livraison dans cette zone jusqu'au … » à la place des conditions — et jamais « ne déclare pas livrer ». La pause n'est
  montrée que si le **serveur** la juge en cours : le navigateur ne compare aucune date à son horloge.
- **Classement et filtre catalogue** : une zone en pause **ne compte pas** comme desservie (assistant, filtre « Zone »).
  Pause échue = zone de nouveau desservie, sans geste.

**Choix à connaître.**
- **Base en retard de migration** : les lectures retombent sans les colonnes (`42703`), l'éditeur relit les zones
  seules — le code peut se déployer avant `0164`. **Mais l'écriture** de conditions exige la migration : appliquer
  `0164` **avant** de fusionner.
- Le délai annoncé est en **heures** (1 à 720), affiché « 24 h » jusqu'à 48 heures puis « 3 j ».
- Les frais sont des **HTG entiers** (règle du dépôt : jamais de flottant).

**Appliquée en production le 2026-10-29 à 15:01:56 UTC** (PR #453, `7d6a5b4`), **avant** la fusion, sous l'autorisation
permanente du 2026-08-17 et l'instruction directe du jour : SQL reçu par Supabase == fichier, à l'octet (SHA-256
`61636424…`, MD5 `4d433e69…`), ligne de registre `journal_supabase` (empreinte canonique `eff76a64…`) — registre à
**164 lignes pour 164 fichiers**. Vérifié en production après coup : les trois colonnes sont là, `max_pause_days` = 30,
`zone_id` **non** modifiable par `authenticated`, `fee_htg` modifiable, `anon` ne modifie rien, trigger `ZB164` et
policy de modification présents. Aucune fonction nouvelle : pas de sonde à redéfinir.

**Éprouvé (lot D).** SQL `service_zone_terms.test.sql` (T1→T5) et **9 mutations de la migration attrapées** ;
18 tests TypeScript (forme du corps, planificateur, zone la plus proche, route de bout en bout — retrait avant
modification avant ajout, identité de session, refus traduits en codes sans fuite du message de la base, repli base
ancienne) et **22 mutations attrapées**, dont une **équivalente** (non comptée : une réécriture qui ne change aucun
comportement) ; les tests structurels de `0158` ont été **mis à jour** à la nouvelle forme, sans en affaiblir l'intention.
**Navigateur réel** (390 px, kreyòl) : le vendeur déclare, relit, lève la pause ; l'acheteur lit les conditions
attribuées au vendeur (150 HTG, 24 h, « offerts », ancêtre le plus bas, note hors paiement) ; pause → fiche et
catalogue le disent ; pause échue → desservie toute seule ; refus 400/401 sans écriture ; aucune erreur console.

### 12.5 Lot E — le délai CONSTATÉ et les tournées du vendeur (`0165`)

**Les points 5 et 8 de l'analyse.** Mercado Libre l'a appris avant tout le monde : une promesse **mesurée** vaut
plus qu'une promesse **déclarée**. Le lot D laisse le vendeur annoncer « 24 h » ; ce lot montre ce que ses remises
passées disent. Les deux s'affichent côte à côte, chacun attribué à sa source — et c'est l'écart entre eux qui
renseigne l'acheteur.

**Ce qui est mesuré.** `zabelie_delai_constate(vendeur)` : le **délai médian** entre le paiement d'une commande
physique et la réception **confirmée** par l'acheteur (bouton « J'ai reçu » ou code de remise, lot C). Trois entiers
sortent — nombre de commandes (`nb`), médiane en heures (`mediane_heures`), seuil (`seuil`) — **aucun identifiant**.
Lecture seule (`stable`), service-role seulement ; aucune écriture d'argent (un test le vérifie sur le fichier SQL).

**Pourquoi c'est honnête — et ce que ça ne dit pas.**
- **Les réceptions automatiques sont exclues** : quand l'acheteur se tait, la plateforme conclut au bout du délai ;
  compter ces lignes mesurerait la plateforme, pas le vendeur.
- **Seuil d'échantillon** (`delay_min_samples`, config, **5**) : une médiane sur une ou deux commandes est une
  anecdote — et à ce volume elle désignerait des transactions précises. Sous le seuil, **rien n'est affiché**.
- **Fenêtre** (`delay_window_days`, config, **180**) : un vendeur qui s'améliore ne traîne pas ses premières livraisons.
- Une horloge qui recule (réception avant le paiement) n'est pas un délai : ignorée. Un délai de six minutes s'affiche
  « 1 h », jamais « 0 h ».
- **Ce n'est pas un délai de livraison** : c'est le délai **jusqu'à ce que l'acheteur confirme**. Un acheteur qui
  confirme tard allonge le chiffre ; la ligne le dit (« jusqu'à la réception confirmée par l'acheteur ») et précise
  « Mesuré par Zabelie… ce n'est pas un engagement du vendeur ».
- La médiane est **par vendeur**, pas par zone : par zone, l'échantillon serait presque toujours sous le seuil.

**Ce qui est construit.**
- **`0165`** : deux clés de config, la fonction, la sonde `zabelie_objets_requis` redéfinie en entier (une ligne de
  plus ; définition de production comparée à la copie locale avant l'application : MD5 identiques).
- **Fiche produit physique** : dans « Avant de payer, convenez de la remise », la ligne « Délai constaté chez ce
  vendeur : environ 30 h… sur 7 commandes récentes », **seulement** si la base a rendu une médiane **et** que
  l'échantillon atteint le seuil. Fail-closed : fonction absente (code déployé avant `0165`), erreur, réponse bancale →
  la fiche est celle d'avant, avec une trace dans les journaux (« aucune ligne » et « lecture échouée » ne doivent pas
  se confondre).
- **« Mes ventes »** : un bandeau « Votre délai constaté » — le vendeur voit **ce que voient les acheteurs**, ou, sous le
  seuil, « Pas encore affiché. Commandes reçues et confirmées : 3 sur 5 nécessaires. Une remise confirmée par le code de
  remise compte. » (un levier de plus pour le code de remise).
- **« Mes ventes » rangé par zone** : les commandes sont regroupées par zone de remise (lot A), triées par ordre
  alphabétique (les quartiers d'une commune se suivent), « Zone non précisée » en dernier, ordre d'origine conservé
  dans chaque groupe. Les **titres n'apparaissent qu'à partir de deux groupes** : un vendeur à une seule zone, ou dont
  les commandes datent d'avant `0161`, voit la liste d'avant, inchangée. On ne fait que **ranger** ce que l'acheteur a
  déclaré : aucune lecture de plus, aucune donnée nouvelle.

**Choix à connaître.**
- Le délai est lu avec la clé **service-role** côté serveur (les lignes de `zabelie_fulfillment` ne sont pas publiques),
  sur l'identifiant du vendeur de la fiche ou de la **session** — jamais d'un paramètre de requête.
- À l'échelle actuelle (1 suivi de remise en base) le calcul par page vue est négligeable ; si le volume grandit, la
  médiane se met en cache court ou se matérialise — décision à prendre sur mesure, pas avant.
- Aucune valeur n'est affichée tant que **personne** n'a confirmé 5 réceptions : aujourd'hui, **aucune fiche** ne montre
  cette ligne. C'est voulu.

**Appliquée en production le 2026-10-29 à 15:18:33 UTC** (PR #454, `ea77977`), **avant** la fusion, sous l'autorisation
permanente du 2026-08-17 et l'instruction directe du jour : SQL reçu par Supabase == fichier, à l'octet (SHA-256
`6d822cfd…`, MD5 `a7dcaafb…`), ligne de registre `journal_supabase` (empreinte canonique `ef5e5ce2…`) — registre à
**165 lignes pour 165 fichiers**. Sonde de production comparée à la copie locale **avant** le `create or replace` :
MD5 identiques (`e6c8f084…`). Vérifié après coup : la sonde compte **179 objets dont 178 présents** (seule absente :
`zabelie_purge_sent_notices`, `0056` gelée) ; la fonction est `stable`, exécutable par `service_role` seul ; les deux clés
de config sont là (5 et 180).

**Éprouvé (lot E).** SQL `delai_constate.test.sql` (E1→E7) et **13 mutations de la migration attrapées** (réception
automatique comptée, horloge qui recule, fenêtre et seuil en dur, jamais zéro, filtre vendeur, médiane discrète, seuil
strict, fonction volatile, médiane sous le seuil, seuil rendu faux, droit client) ; 18 tests TypeScript et **28
mutations attrapées** (forme de la réponse, seuil contourné, médiane brute à la place de la valeur affichable,
identité du vendeur, trace de l'échec, tri, titres de groupe, commandes perdues, textes des écrans, absence
d'écriture dans la migration…). **Navigateur réel** (390 px, français et kreyòl) : la ligne s'affiche à 30 h sur 7
commandes, devient « environ 3 j » à 71 h, disparaît sous le seuil / sur une réponse bancale / vide (la fiche reste en
200) ; « Mes ventes » : trois groupes (Delmas 1 commande, Tabarre 2 commandes, Zone non précisée), aucune vente perdue,
identité de session transmise, pas de titres avec une seule zone. **Il a trouvé un défaut** : le titre de groupe lisait
« Delmas1 commande » pour un lecteur d'écran (espace manquant) — corrigé. Un passage a échoué une fois sur une lecture
du script qui n'attend pas ; corrigé (attente explicite) puis quatre passages verts d'affilée.

### 12.6 Lot F — les points de retrait d'une zone (Jumia, `0082`, aucune migration)

**La recommandation.** Dans un pays sans adresses normalisées, ce qui a tenu chez Jumia n'est pas la livraison à
domicile : ce sont les **stations de retrait** (`docs/46` §3.2). `0082` en tient le répertoire depuis le 2026-08-15 —
table, route admin, page admin — et **aucun acheteur n'en a jamais vu une ligne** (« aucun usage acheteur »). Ce lot
montre à l'acheteur ceux qui recouvrent sa zone. **Aucune migration** : on réutilise la table (`docs/67` : pas de
doublon).

**Où ça s'affiche.**
- **« Aucune offre pour cette zone »** (catalogue, lot B) : sous le texte, les points de retrait **ouverts** de la zone
  — c'est précisément l'écran où l'acheteur n'a, sinon, que « je cherche un vendeur ici ». Chargés **uniquement** dans
  ce cas (zone seule, zéro résultat) : la page normale ne paie pas une lecture de plus.
- **Fiche produit physique**, sous le sélecteur de zone de remise (lot A) : pour la zone **choisie**, sans rechargement.
  Un département seul (trop large) n'en montre aucun.

**Quels points.** Ceux dont la zone est la destination, un **ancêtre** (un point « à Delmas » sert un acheteur de « Delmas
33 ») ou un **descendant** (acheteur « Delmas » : un point du quartier Delmas 33 est dans sa commune) ; **jamais un
quartier frère** — même règle que la couverture d'un vendeur (`zoneCouverte`, réutilisée). Ordre : la zone exacte
d'abord, puis la `position` donnée par l'admin, puis le nom (tri selon la langue, accents inclus) — déterministe.
Un point **sans zone** n'est rapprochable d'aucune destination : jamais montré.

**⚠️ Ce que c'est — un ANNUAIRE, pas un service de Zabelie.**
- Zabelie **ne livre pas** : la note le dit à chaque affichage (« convenez avec le vendeur de la remise à ce point, et des
  frais éventuels, avant de payer »). Choisir un point n'est **pas** un geste de la commande : rien n'est stocké,
  rien n'est ajouté au paiement.
- **Aucune commission affichée ni promise** : son montant est un arbitrage du porteur, **non tranché** (`0082`). Un test
  interdit les mots « commission », « gratuit », « offert » dans le composant.
- Un point n'est visible que s'il est **ouvert** (`actif`), c'est-à-dire quand l'accord avec la boutique est **réel**
  (`0082`). Le filtre `actif` est **répété** côté code : si une policy de lecture était un jour élargie « pour dépanner »,
  un point fermé ne deviendrait pas visible pour autant.
- Fail-soft **avec trace** : table absente → liste vide sans bruit ; autre erreur → liste vide **et** un avertissement.

**Aujourd'hui : zéro point** (vérifié en production, 0 ligne). **Rien ne s'affiche** — voulu : `0082` le dit
(« un sélecteur vide est une promesse vide »). Le lot rend la fonction **prête** pour le jour où l'administration ouvre
le premier point (`/admin/points-retrait`). ⚠️ **Le recrutement des boutiques est un travail d'opérations** que le code
ne fait pas : tant qu'aucun accord n'existe, l'écran reste celui du lot B. C'est le vrai goulot, pas le code.

**Choix à connaître.**
- Le répertoire est chargé en entier (**200 lignes au plus**, tenu à la main par l'administration) et rapproché côté
  écran ; au-delà, le filtrage par zone devra se faire en base.
- Le téléphone est un lien `tel:` réduit aux chiffres et au « + » initial ; un numéro sans chiffre s'affiche en texte,
  sans lien vide.
- `anon` détient `INSERT` sur `zabelie_pickup_points` par les droits par défaut de Supabase ; seule la RLS (aucune policy
  d'écriture) l'en empêche — `0082` le vérifie en post-condition. Pas modifié ici ; à resserrer à l'occasion d'une
  prochaine migration sur cette table.

**Éprouvé (lot F).** 18 tests TypeScript et **24 mutations attrapées** (lecture tolérante, zone exacte / ancêtre /
descendant / frère, destination absente, ordre — dont la position **contredisant** le nom, sans quoi sa mutation
survivait —, lien `tel:`, filtres `actif` et zone, borne, trace d'échec, ligne mal formée, chargement limité au cas
sans résultat, composant vide, absence de commission, note « Zabelie ne livre pas » dans les quatre langues).
**Navigateur réel** (390 px, français et kreyòl) : Delmas montre la pharmacie puis le kiosque du quartier, ni Tabarre ni la
boutique fermée ; Tabarre montre la sienne, sans lien vide ; Delmas 33 montre le kiosque puis la pharmacie ; répertoire vide
→ aucun encadré ; fiche produit : rien avant le choix, rien pour un département seul, la liste suit le changement de
commune ; la base est interrogée avec `actif=eq.true`, zone non nulle et `limit=200`. Le premier `build` a échoué sur le
typage d'un **test** (le build typé inclut `tests/`) : corrigé ; `tsc` se lance désormais **après** l'écriture des tests,
pas avant.

### 12.7 Lot G — partager le catalogue d'une zone (TikTok Shop, aucune migration)

**La recommandation.** La leçon de TikTok Shop : un lien qui **porte son contexte**. Pour Zabelie, le contexte est la
zone : « les produits et les vendeurs de Delmas » doit s'envoyer en un geste, et celui qui l'ouvre doit arriver sur le
catalogue **déjà filtré**. Le filtre « Zone » (`zd`, `zk`, `zq`) existait depuis le lot 3a — l'ouverture d'un tel lien
présélectionne déjà la zone ; **ce qui manquait est l'envoi**.

**Ce qui est construit.** Sur `/catalogue`, quand la zone est le **seul filtre** et qu'elle a **au moins une offre**, un
lien « Partager le catalogue de cette zone (WhatsApp) » sous la note du filtre. Message prérempli, dans la langue de
celui qui envoie : « Les produits et les vendeurs de Delmas sur Zabelie : <lien> » (pour un quartier : « Delmas 33,
Delmas » — des quartiers homonymes existent). Le lien partagé est l'adresse absolue du catalogue filtré,
`/catalogue?zd=…&zk=…&zq=…`, **construite par `paramsCatalogue`** (la même fonction que « Ma zone » : un seul endroit
fabrique ces adresses).

**⚠️ Aucune donnée.**
- **Rien n'est stocké ni écrit** : pas de cookie, pas de stockage navigateur, pas de réseau, pas de base (un test le
  vérifie sur le module). Aucun cookie `zabelie_zone` n'est posé par le partage (vérifié dans le navigateur).
- **La zone partagée vient du FILTRE de la page, jamais du cookie `zabelie_zone`** : la politique de confidentialité (§8)
  ne déclare ce cookie que pour classer les offres proches — un usage de plus demanderait une version de plus de la
  politique. Un test interdit `maZone` dans ce bloc, et la mutation « la zone vient du cookie » est attrapée.
- **Aucun paramètre de suivi** : le lien ne porte que `zd`, `zk`, `zq` — trois identifiants de zone publics. Pas de
  `utm_*`, pas d'identifiant de personne.
- L'envoi est un lien `wa.me` que l'**acheteur** ouvre lui-même et dont il choisit le destinataire — même doctrine que
  « Inviter un vendeur » (lot B).

**Quand il n'y a PAS de lien.** Zone sans offre (l'écran du lot B propose déjà « je cherche un vendeur ici » ; partager
un catalogue vide n'aide personne) ; zone **plus** une catégorie, un prix ou un tri (le lien ne porterait pas ce filtre :
il montrerait autre chose que ce que l'envoyeur voit) ; aucune zone ; univers « numérique » (la zone n'y compte pas).

**Ce qui n'est PAS fait — et pourquoi.**
- **Aperçu par zone** : le titre et l'image du lien partagé restent ceux du catalogue (« Catalogue — Zabelie ») ; la
  canonique n'est pas modifiée. Un titre par zone demanderait de dupliquer, dans `generateMetadata`, la validation de la
  cascade `zd › zk › zq` que des tests ancrent dans la page — à faire avec elle, pas à côté.
- **Présélectionner la zone de REMISE de la fiche produit depuis le filtre du catalogue** (`/produit/…?zone=`) :
  commodité réelle, mais la zone de remise « se choisit à chaque commande » (lot A) — une valeur préremplie risquerait
  d'enregistrer une zone que l'acheteur n'a pas voulue. **Décision du porteur**, non prise ici ; aucun code mort laissé
  derrière (rien ne produit ce paramètre aujourd'hui).
- **Lien de partage par vendeur et par zone** (« mes produits à Delmas ») : le vendeur partage déjà sa vitrine
  (`/boutik/…`) ; ajouter une zone à une vitrine est un chantier de produit, pas un lien.

**Éprouvé (lot G).** 9 tests TypeScript et **12 mutations attrapées** (zone hors liste, barres finales, paramètre de
suivi, message non encodé, nom du paramètre WhatsApp, lien pour toute zone, lien sans résultat, **zone issue du
cookie**, `rel="noopener"`, libellé du lieu, lien absent du message, bloc sans lien). Aller-retour : l'analyseur du
catalogue relit exactement les identifiants du lien. **Navigateur réel** (390 px, français et kreyòl) : le lien existe
pour Delmas (message « Les produits et les vendeurs de Delmas sur Zabelie : … ») et pour un quartier (« Delmas 33,
Delmas ») ; le destinataire ouvre l'adresse sans compte et voit « Ouest › Delmas » présélectionné avec les mêmes offres ;
aucun lien pour une zone sans offre, avec catégorie, avec prix, sans zone, ni en « numérique » ; aucun cookie posé.
