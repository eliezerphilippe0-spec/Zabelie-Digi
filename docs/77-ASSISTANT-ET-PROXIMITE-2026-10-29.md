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

## 8. Lot 2 — zones de service à l'inscription (à construire)

Le vendeur ne **dessert** pas que l'endroit où il est installé. Il déclare, à
l'inscription et dans les réglages de sa boutique, les zones où il livre :
une ou plusieurs (ville, commune, quartier, ou tout un département).
- Une table dédiée `zabelie_seller_service_zones`, lisible publiquement (une zone
  desservie est une information commerciale, pas une donnée personnelle), écrite
  par son seul propriétaire (RLS), plafonnée par une valeur de **config**.
- L'acheteur voit « dessert votre commune », **attribué au vendeur** (« déclaré par
  le vendeur ») : Zabelie ne livre pas et ne garantit aucun délai.
- Le classement du lot 1 lit alors la zone d'installation **et** les zones desservies.
