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
