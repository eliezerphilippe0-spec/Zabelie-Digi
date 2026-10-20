# 74 — Essayage virtuel (pilote)

Statut : **spécification à valider** (2026-10-19, version 2 : choix du fournisseur, modèle maison en troisième candidat, propriété et dépendance). Aucune ligne de code avant le « oui » du porteur sur ce document.

## 1. Objectif

Un acheteur connecté envoie une photo de lui et voit un vêtement d'un vendeur pilote porté sur lui, en une dizaine de secondes. Le but n'est pas la vitrine : on veut savoir, chiffres à l'appui, si l'essayage réduit les colis refusés à la livraison et les litiges, et s'il augmente les achats sur la mode.

Décisions du porteur (2026-10-19) :

- **Accès** : vendeurs pilotes (5 à 10 vendeurs mode), activés un par un par l'administration. Plus tard, avantage Elite et option payante ; hors de ce pilote.
- **Fournisseur** : Genlook en premier choix, FASHN en plan B, et notre propre modèle (FASHN VTON v1.5, open source) en troisième candidat. Le choix définitif se fait après un test sur 20 photos de clientes haïtiennes (§4). Le code ne dépend d'aucun d'eux.
- **Paiement** : Zabelie paie, avec un plafond mensuel qui coupe l'essayage tout seul.

Utilisateurs :

- **Acheteur** : connecté, sur téléphone d'entrée de gamme, souvent en 3G.
- **Vendeur pilote** : vend des vêtements avec une photo principale de face, sur fond uni. Il n'a rien à faire, sauf soigner cette photo.
- **Administration** : active les vendeurs, règle le plafond et le quota, met en pause.

## 2. Périmètre

### Dans le pilote

1. **Éligibilité d'une fiche** : publiée, de type physique, vendeur pilote actif, sous-rayon dans la liste autorisée (§2.1), photo principale présente.
2. **Bouton « Essayer sur moi »** sous « Ajouter au panier », pour un acheteur connecté du groupe essai (§7). Ni bouton ni appel pour les visiteurs anonymes.
3. **Consentement** avant la première photo, dans les 4 langues : c'est ma photo, j'ai 18 ans ou plus, j'accepte qu'elle parte chez le prestataire, qui l'efface. La version acceptée est gardée sur l'appareil.
4. **Photo** : prise ou choisie sur le téléphone, compressée sur l'appareil (`lib/image-compress.ts`), puis envoyée. Option « Garder ma photo sur ce téléphone », décochée par défaut, avec un bouton pour l'effacer.
5. **Résultat** : affiché avec la mention « Aperçu généré par IA. La coupe et la couleur réelles peuvent différer. », puis « Ajouter au panier ». Il n'est jamais conservé par Zabelie.
6. **Limites** : quota par acheteur et par jour (5 par défaut), plafond mensuel global (1 000 par défaut), pause. Un essai échoué ne compte ni dans le quota ni dans le plafond.
7. **Administration** (`/admin/essayage`, rôle admin avec double authentification) : liste des vendeurs pilotes (ajouter, retirer), réglages (plafond, quota, pause), compteur du mois. Chaque geste va au journal d'audit.
8. **Mesure** : groupe essai et groupe témoin, expositions enregistrées, requête d'analyse documentée (§7).
9. **Outil de comparaison** des trois candidats (Genlook, FASHN, modèle maison) : il fait passer N photos de personnes × M photos de produits chez chacun, puis produit une planche à juger, avec le temps d'attente et le coût de chaque essai. Mode « à blanc » par défaut, qui annonce le coût sans rien dépenser.

### 2.1 Sous-rayons autorisés (taxonomie `zabelie_categories`, 0035 et 0077)

| Catégorie (niveau 2) | Sous-rayons autorisés (niveau 3) | Exclus |
|---|---|---|
| `rad-fanm` | `wob`, `blouz-chemizye`, `pantalon-djin-fanm`, `jip`, `ansanm-taye`, `ves-manto-fanm`, `rad-tradisyonel` | `lenjri`, `mayo-beny` |
| `rad-gason` | `chemiz`, `mayo-polo`, `pantalon-djin-gason`, `chot`, `kostim`, `ves-gason` | `souvetman-gason` |
| `rad-espo` | `mayo-chot-espo`, `sivetman` | `soulye-espo`, `akseswa-espo` |
| `rad-timoun` et tout le reste | aucun | tout |

Les slugs autorisés sont des sous-rayons de **niveau 3** de l'arbre : `rad-fanm`, `rad-gason`, `rad-espo` et `rad-timoun` sont de niveau 2, sous les départements `mod-akseswa` et `espo-lwazi`, et il n'existe pas de niveau 4. Une fiche est éligible si son `category_id` désigne un sous-rayon autorisé. Une fiche rangée au seul niveau 2 (« Vêtements femme » sans sous-rayon) ou sans `category_id` n'est pas éligible : elle pourrait être de la lingerie.

**Liste validée par le porteur le 2026-10-19.**

### 2.2 Chaussures : fermées au départ, à l'essai

FASHN ne prend pas les chaussures (son modèle n'accepte que hauts, bas et pièces entières). Genlook ne les annonce pas, sans les exclure. Les chaussures restent donc **fermées** au lancement, et une série d'essai passe chez Genlook pendant le test (§4.2). Si le rendu est bon, on ouvre les chaussures adultes ci-dessous, sur « oui » du porteur ; c'est une donnée à ajouter (liste de `lib/essayage/regles.ts` et table `zabelie_essayage_rayons`), plus une pièce « pieds » pour les fournisseurs.

| Catégorie (niveau 2) | Sous-rayons candidats (niveau 3) |
|---|---|
| `soulye-fanm` | `sandal-fanm`, `talon`, `basket-fanm`, `balerin`, `bot-fanm`, `mil-klaket` |
| `soulye-gason` | `basket-gason`, `soulye-vil`, `mokasen`, `sandal-gason`, `bot-gason`, `tong` |
| `rad-espo` | `soulye-espo` |

`soulye-timoun` et tous ses sous-rayons (bébé, fille, garçon, scolaires, baskets enfant) restent fermés dans tous les cas : photos de mineurs. Pour les chaussures, la photo de l'acheteur doit montrer les pieds, et ce qui fait renvoyer une paire est surtout la pointure, qu'un essai en image ne dit pas.

### Hors pilote

Essayage par la caméra en direct (lunettes, maquillage, perruques, chaussures en 3D), chaussures tant que la série d'essai n'a pas conclu (§2.2), accessoires, guide des tailles, photo d'une autre personne (cas « pour un proche » de la diaspora), avantage Elite, facturation aux vendeurs.

## 3. Architecture

```
Fiche produit (serveur) ── éligible ? groupe essai ? ──► bouton
   │
   ▼  (client) consentement → photo → compression
POST /api/essayage            (session, éligibilité, réservation atomique)
   │   └─ RPC zabelie_essayage_reserver → ligne « en_cours », sans photo
   │   └─ fournisseur.creer(photo, image produit) → identifiant de travail
   ▼
GET /api/essayage/[id]        (toutes les 2 s, 60 s au plus)
   │   └─ fournisseur.statut(identifiant) → image (URL fournisseur ou data URI)
   │   └─ RPC zabelie_essayage_terminer → « reussi » ou « echec »
   ▼
Affichage du résultat, mention IA, « Ajouter au panier »
```

- **Adaptateur** (`lib/essayage/fournisseurs/`) : `creer()`, `statut()`, `effacer()`, avec trois mises en œuvre dans le pilote : `genlook`, `fashn`, `simulation`. La simulation sert aux tests et à l'e2e : elle ne coûte rien et ne sort pas de la machine. Un quatrième, `maison`, s'ajoute sans toucher au reste si le modèle maison est retenu (§4).
- **Interrupteurs** (même règle que le Studio : seule la valeur exacte `true` ouvre) : `ZABELIE_ESSAYAGE_ENABLED`, `ZABELIE_ESSAYAGE_FOURNISSEUR` (`genlook`, `fashn` ou `simulation` ; absent = aucun fournisseur, jamais de défaut qui dépenserait), `GENLOOK_API_KEY`, `FASHN_API_KEY`. Ajoutés à `.env.example`.
- **FASHN** : `moderation_level: "conservative"` (bloque sous-vêtements et maillots), `return_base64: true` (le résultat n'est gardé qu'une heure chez eux). La photo de l'acheteur part **en base64, jamais en URL** : FASHN garde sans limite les URL envoyées dans l'historique des requêtes et n'offre pas de suppression en libre-service, alors que la copie d'une entrée base64 est effacée à la fin du traitement. La photo du produit, publique, peut partir en URL.
- **Genlook** : conservation des envois réglée au minimum (1 jour), effacement des images de l'acheteur après le résultat (point de suppression de l'API).
- **Taille des envois** : photo compressée côté client (côté long de 1 024 px au plus, quelques centaines de kilo-octets), sous la limite de 4,5 Mo des fonctions Vercel.

### 3.1 Données (migration `0150`, appliquée en production seulement sur « oui »)

| Objet | Contenu | Accès |
|---|---|---|
| `zabelie_essayage_config` | une ligne : `plafond_mois`, `quota_jour`, `en_pause` | lecture et écriture par le rôle service seul |
| `zabelie_essayage_vendeurs` | `seller_id`, `actif`, `active_par`, `active_le` | rôle service seul |
| `zabelie_essayage_rayons` | les sous-rayons autorisés (§2.1) ; la migration s'arrête si l'arbre n'en rend pas quinze | lecture par le rôle service seul, écriture par migration |
| `zabelie_essayage_essais` | `id`, `acheteur_id`, `produit_id`, `vendeur_id`, `fournisseur`, `travail_id`, `statut`, `cree_le`, `termine_le` | rôle service seul |
| `zabelie_essayage_expositions` | `acheteur_id`, `produit_id`, `groupe`, `jour`, unique par trio | rôle service seul |
| `zabelie_essayage_eligible(...)` | fiche publiée, physique, avec photo, vendeur pilote actif, sous-rayon ouvert, pas celle de l'acheteur | `security definer`, `search_path` figé, accordée au rôle service seul |
| `zabelie_essayage_reserver(...)` | éligibilité, pause, plafond, quota et insertion, sous un verrou ; rend l'essai ou un refus | idem |
| `zabelie_essayage_lancer(...)` | note une fois l'identifiant du travail chez le fournisseur | idem |
| `zabelie_essayage_terminer(...)` | passe un essai en cours en `reussi` ou en `echec` avec sa raison, une fois | idem |
| `zabelie_essayage_exposer(...)` | une exposition par acheteur, fiche et jour haïtien, fiche éligible seulement | idem |
| `zabelie_essayage_compteur()` | pour l'administration : réussis, en cours et échecs du mois haïtien, avec les réglages ; même règle que la réservation | idem |

Aucune colonne ne contient de photo, d'URL de photo ou de résultat. Seul un essai **échoué** ne compte ni dans le quota ni dans le plafond ; un essai abandonné « en cours » compte, car le fournisseur facture dès la création. Pourquoi tout au rôle service : un acheteur qui pourrait clore lui-même un essai le dirait « échoué » et obtiendrait des essais payants sans limite ; le serveur passe donc l'identité tirée de la session vérifiée. Aucune de ces fonctions n'est exposée à `anon` ni à `authenticated` : la liste gelée du garde `definer_exposition` ne change pas, et ce test le prouve. La sonde `zabelie_objets_requis()` les surveille toutes les six, redéfinie dans 0150 avec leurs appels `.rpc()` (`lib/essayage/base.ts`, `lib/essayage/admin.ts`). Le registre `zabelie_schema_migrations` est rempli à la main après application, selon la méthode 0086.

## 4. Fournisseurs, coûts et choix

### 4.1 Les trois candidats (relevé du 2026-10-19)

| | Genlook (loué) | FASHN (loué) | Modèle maison |
|---|---|---|---|
| Ce que c'est | API de Genlook | API de FASHN (v1.6) | FASHN VTON v1.5, open source, sur un GPU loué à la seconde (RunPod ou équivalent) |
| Prix d'un essai | 0,04 $ à l'unité, ou 20 $ par mois pour 1 000 puis 0,02 $ | 0,075 $ | environ 0,002 $ de calcul, si la machine tourne sans arrêt |
| Pilote (1 000 essais par mois) | **20 $ par mois** | 75 $ au plus | environ 580 $ par mois si la machine reste allumée ; sinon, une longue attente au premier essai après une pause |
| Test gratuit | 10 essais | aucun (achat minimum 7,50 $) | quelques dollars de calcul |
| Échecs | remboursés | non facturés | à nos frais |
| Confidentialité | effacement des images d'un utilisateur, conservation réglable de 1 à 7 jours | résultat gardé 1 heure au plus (`return_base64`), filtre `conservative` | tout reste chez nous et chez l'hébergeur GPU |
| Peaux foncées | à tester | à tester | à tester, et **corrigeable** : la licence permet de réentraîner sur des photos haïtiennes (avec consentement) |
| Travail en plus | aucun | aucun | plusieurs semaines : service GPU, préparation des images, filtre de nudité et de mineurs, surveillance, **et remplacement de l'analyseur de silhouette** (voir ci-dessous) |

Licences du modèle maison, vérifiées aux sources le 2026-10-19 :
- **Le modèle** (code et poids) : Apache-2.0, sur le fichier `LICENSE` du dépôt officiel (« Copyright 2025 FASHN AI ») et sur la fiche Hugging Face. Usage commercial permis.
- **DWPose** (détecteur de pose) : Apache-2.0 (« Copyright 2023 IDEA »). YOLOX : Apache-2.0 d'après la liste du dépôt.
- **FASHN Human Parser** (analyseur de silhouette, téléchargé automatiquement au premier usage) : **licence NVIDIA de SegFormer**, car il est affiné à partir de `nvidia/mit-b4`. Sa section 3.3 dit que l'œuvre et ses dérivés « only may be used or intended for use non-commercially », c'est-à-dire pour la recherche ou l'évaluation seulement.

Conséquence : **le modèle maison peut servir au test**, qui est une évaluation. **Il ne peut pas servir en production** tant que l'analyseur n'est pas remplacé par un composant sous licence commerciale ; il faudrait alors refaire le test, car la qualité peut changer. Les droits sur les données d'entraînement du modèle ne sont pas décrits. Besoin matériel : environ 8 Go de mémoire graphique, environ 5 secondes par image sur une H100.

### 4.2 Le test et la règle de choix

1. Les mêmes 20 photos (clientes haïtiennes, morphologies et teintes variées, accord écrit) × 5 vêtements des rayons autorisés passent chez les trois candidats, avec l'outil de comparaison.
2. Le porteur et deux personnes de son choix notent chaque résultat **sans savoir de quel candidat il vient** : fidélité du vêtement (coupe, couleur, motif), rendu de la peau et des cheveux, morphologie respectée, défauts visibles (mains, visage).
3. Règle :
   - **Genlook** si sa note est au moins égale à celle de FASHN (les deux excluent par écrit l'entraînement sur nos photos, voir §13) ;
   - sinon **FASHN** ;
   - le **modèle maison** seulement s'il est nettement le meilleur sur les peaux et morphologies haïtiennes, ou plus tard, quand le volume dépasse le seuil du §4.3, et dans les deux cas **après remplacement de l'analyseur de silhouette** (§4.1) et un nouveau test.
4. **Série chaussures**, chez Genlook seulement (FASHN ne les prend pas) : 5 photos en pied, pieds visibles, × 3 paires des sous-rayons candidats du §2.2, soit 15 essais (environ 0,60 $, ou sur les 10 essais offerts). Même notation à l'aveugle. En parallèle, le porteur envoie au support de Genlook la question écrite du §13. Ouverture sur « oui » seulement si le rendu des chaussures est jugé bon et si Genlook ne les déconseille pas.
5. Le résultat du test et le choix sont consignés ici, avant d'allumer le pilote.

### 4.3 Seuils de rentabilité

Hypothèse : une machine GPU allumée en permanence à environ 580 $ par mois (L40S à environ 0,79 $ de l'heure). Elle devient moins chère que Genlook à partir d'environ 30 000 essais par mois (à 0,02 $ l'essai), et que FASHN à partir d'environ 8 000. Ces seuils sont à recalculer avec les prix du jour avant toute décision.

## 5. Propriété et dépendance

**À Zabelie** : tout le code (bouton, consentement, envoi, quotas, plafond, administration, mesure, adaptateur), les règles (qui, quels rayons, combien), les données du pilote dans notre base, et la relation avec l'acheteur, qui reste sur zabelie.com.

**Loué** (avec Genlook ou FASHN) : le modèle qui habille la personne. Il tourne sur leurs serveurs et se paie à l'image. Prix, conditions et disponibilité peuvent changer.

**Ce qui limite la dépendance** :
- l'adaptateur : changer de fournisseur, c'est changer `ZABELIE_ESSAYAGE_FOURNISSEUR` ;
- deux fournisseurs testés dès le départ, donc un plan B prêt ;
- rien d'important chez eux : ni règles, ni données, et les photos effacées au plus tôt ;
- une sortie possible vers le modèle maison (licence Apache-2.0, une fois l'analyseur de silhouette remplacé), sans réécrire le reste.

**Ce que disent les conditions des fournisseurs** (lues le 2026-10-19, détail au §13) :
- **Images générées** : elles appartiennent à Zabelie chez les deux. Genlook : « you own the try-on images generated from your content ». FASHN : « you own the outputs generated for you », et FASHN nous cède ses droits éventuels. La licence qu'ils gardent sert seulement à faire tourner le service.
- **Entraînement** : exclu chez les deux, pour les photos envoyées comme pour les images générées.
- **Rôles** : Zabelie est **responsable du traitement** des données de ses acheteurs, et le fournisseur est sous-traitant, au titre de son accord de traitement des données (DPA) : chez Genlook il est intégré aux conditions et s'obtient à `privacy@genlook.app` ; chez FASHN il est publié sur `fashn.ai/legal/dpa`. À nous donc la mention dans notre politique de confidentialité, le consentement, et l'inscription du fournisseur au registre des sous-traitants (`docs/69`).
- **Sous-traitants des fournisseurs** : Genlook héberge et calcule dans l'Union européenne, mais certains traitements passent hors de l'Espace économique européen, et sa liste compte des services américains d'IA (Google Vertex AI, Comfy Cloud, Decart, Anthropic). FASHN annonce combiner sa technologie et des « services d'IA tiers », listés dans son DPA. Une photo d'acheteur peut donc passer chez un tiers du fournisseur : à dire dans le consentement et dans `/confidentialite`.

## 6. Commandes

```bash
npm test                                   # tests unitaires et gardes (node --test)
npx tsc --noEmit                           # types
npx eslint <fichiers modifiés>             # lint
npm run build                              # build de production, doit passer
npx playwright test --project=physique     # e2e, fournisseur « simulation »
node --import tsx scripts/essayage-comparer.ts --candidats genlook,fashn --photos <dossier hors dépôt> --produits <produits.json>                                    # à blanc : coût annoncé
node --import tsx scripts/essayage-comparer.ts --candidats genlook,fashn --photos <dossier hors dépôt> --produits <produits.json> --sortie <dossier hors dépôt> --payer  # appels réels, après accord
```

Le candidat `maison` est un point d'accès HTTP vers FASHN VTON v1.5 sur un GPU loué à la seconde, éteint entre deux séries (`ZABELIE_ESSAYAGE_MAISON_URL`, `ZABELIE_ESSAYAGE_MAISON_CLE`, dans l'environnement local du porteur seulement). Il sert au test ; il n'entre dans l'application que s'il est retenu.

Local Playwright : `PW_CHROMIUM_PATH` vers le headless shell 1208. Jamais de `npm ci` ni de `npm install` dans cette copie : son `node_modules` est une jonction partagée.

## 7. Mesure

- **Groupes** : pour une fiche éligible, un acheteur connecté est en groupe `essai` ou `temoin` selon un hachage stable de son identifiant (moitié-moitié). Le témoin voit la fiche sans bouton.
- **Exposition** : première vue d'une fiche éligible par un acheteur, une fois par jour, dans les deux groupes.
- **Indicateurs** par groupe, sur 4 à 6 semaines : ajout au panier, commande payée, livraison sans refus, litige ouvert. Requête SQL d'analyse versionnée dans ce document une fois le schéma écrit.
- **Seuil de décision**, à fixer avant le lancement : le groupe essai doit faire mieux que le témoin sur les refus à la livraison et les litiges, pas seulement sur les clics.

## 8. Style de code

On écrit comme le reste du dépôt : noms et commentaires en français, pourquoi daté dans le commentaire, littéraux de type de produit seulement dans `lib/product-kind.ts`, textes seulement dans `lib/i18n.ts` (4 langues, garde des clés mortes), module pur testable séparé de l'accès réseau.

```ts
/** Le fournisseur choisi par l'environnement ; aucun si la variable manque (jamais un défaut qui dépense). */
export function lireFournisseur(env: EnvEssayage): FournisseurEssayage | null {
  if (env.ZABELIE_ESSAYAGE_ENABLED !== "true") return null;
  if (env.ZABELIE_ESSAYAGE_FOURNISSEUR === "genlook" && env.GENLOOK_API_KEY) return genlook(env.GENLOOK_API_KEY);
  if (env.ZABELIE_ESSAYAGE_FOURNISSEUR === "fashn" && env.FASHN_API_KEY) return fashn(env.FASHN_API_KEY);
  if (env.ZABELIE_ESSAYAGE_FOURNISSEUR === "simulation" && env.VERCEL_ENV !== "production") return simulation();
  return null;
}
```

## 9. Tests

- **Unitaires** (`tests/essayage-*.test.ts`) : éligibilité (chaque sous-rayon autorisé et exclu, fiche rangée au seul niveau 2, sans sous-rayon, vendeur inactif, fiche non publiée), lecture des interrupteurs, répartition des groupes (stable, environ 50/50), adaptateurs face à des réponses enregistrées.
- **SQL** (`supabase/tests`, CI `sql-tests`) : quota du jour, plafond du mois, essais échoués non comptés, 20 réservations simultanées qui ne dépassent jamais le plafond, refus pour un acheteur anonyme, aucune lecture par `anon` ou `authenticated`.
- **E2E** (`e2e/parcours-physique-essayage.spec.ts`, fournisseur `simulation`) : bouton visible ou absent selon les cas, consentement, envoi, attente, résultat avec la mention IA, quota atteint, pause, 360 px sans défilement horizontal, cibles de 44 px, 4 langues.
- **Gardes** : aucune route d'essayage n'écrit dans Supabase Storage ; aucun journal ne contient d'image ; `.env.example` complet.
- **Mutations ciblées** sur l'éligibilité, le quota et le plafond : chacune doit faire échouer un test.

## 10. Limites

**Toujours**
- Interrupteurs éteints par défaut ; tout passe par le serveur, clés côté serveur seulement.
- Vérifier session, compte actif et éligibilité dans chaque route, pas seulement dans l'interface.
- Mention « Aperçu généré par IA » sur chaque résultat.
- Fournisseur `simulation` dans les tests et la CI.
- Annoncer le coût et attendre l'accord avant tout appel payant (outil de comparaison compris).
- Noter les résultats du test à l'aveugle, sans savoir de quel candidat vient l'image.
- Vérifier la licence de chaque composant d'un modèle open source avant tout usage commercial, et garder les mentions de licence Apache-2.0.

**Demander d'abord**
- Créer le point d'accès GPU du modèle maison (compte, coût) ; le brancher dans l'application.
- Appliquer la migration `0150` en production ; fusionner une PR.
- Le texte du consentement, de la politique de confidentialité (`/confidentialite`) et des conditions de vente (aperçu non contractuel).
- Ajouter le fournisseur retenu à la liste des sous-traitants (`docs/69-SOUS-TRAITANTS-RELEVE-2026-10-10.md`).
- Changer la liste des sous-rayons autorisés, le plafond ou le quota par défaut.
- Ajouter une dépendance (le SDK `@genlook/api`, par exemple ; un `fetch` suffit sinon).

**Jamais**
- Conserver la photo d'un acheteur : ni Storage, ni base, ni journal, ni cache.
- Ouvrir l'essayage aux sous-vêtements, aux maillots de bain ou à tout ce qui concerne les enfants.
- Committer une clé, ou lire une valeur de variable d'environnement dans une conversation.
- Appeler un fournisseur payant depuis un test, la CI ou une prévisualisation Vercel.
- Utiliser l'image générée comme description du produit dans un litige : la photo du vendeur fait foi.

## 11. Critères de réussite

1. Interrupteur éteint : aucun bouton, et `POST /api/essayage` répond 404.
2. Fiche non éligible (lingerie, enfant, sans sous-rayon, vendeur non pilote, brouillon) : aucun bouton, et l'API refuse même appelée directement.
3. Acheteur anonyme : aucun bouton, et l'API répond 401.
4. Le sixième essai du jour est refusé avec un message clair ; le compteur repart le lendemain (heure d'Haïti).
5. Au plafond du mois, l'essayage affiche « en pause ce mois-ci » et l'API refuse ; un essai échoué ne compte pas.
6. Aucune photo d'acheteur n'est écrite côté Zabelie (vérifié par test et par revue).
7. Résultat en 30 secondes au plus en 3G simulée, avec une attente visible ; au-delà de 60 secondes, message d'échec, et l'essai ne compte pas.
8. À 360 px : pas de défilement horizontal, cibles de 44 px, dans les 4 langues, en clair et en sombre.
9. Un même acheteur reste toujours dans le même groupe ; les expositions des deux groupes sont enregistrées.
10. L'administration active ou retire un vendeur, change plafond, quota et pause, et voit le compteur du mois.
11. Changer de fournisseur ne demande que de changer une variable d'environnement.
12. L'outil de comparaison produit une planche par candidat (Genlook, FASHN, modèle maison), avec temps d'attente et coût de chaque essai, et le mode à blanc annonce le coût sans rien appeler.
13. Le résultat du test à l'aveugle et le choix du fournisseur sont consignés au §4.2 avant d'allumer le pilote.

## 12. Préalables hors code (porteur)

- **Double authentification de l'administrateur** sur `/securite` : sans elle, pas d'accès à la page d'administration, donc pas d'activation de vendeur depuis l'interface.
- **Catalogue ouvert** : modération accessible, et fiches mode publiées par les vendeurs pilotes.
- **Comptes chez Genlook et FASHN**, clés posées dans Vercel par le porteur ; carte pour les crédits. Test de comparaison : environ 12,50 $ à avancer (pack Genlook de 5 $ et minimum FASHN de 7,50 $), en bonne partie réutilisables ensuite.
- **Compte GPU à la seconde** (RunPod ou équivalent) pour le modèle maison : quelques dollars pour le test.
- **20 photos de clientes haïtiennes**, avec accord écrit, gardées hors du dépôt, et deux personnes pour la notation à l'aveugle.

## 13. Questions ouvertes et réponses

### Réponses de la phase 0 (tâche 0.1, lues aux sources le 2026-10-19)

1. **Entraînement : non, chez les deux, par écrit.**
   - Genlook, conditions §5 : « We do not use uploaded photos or generated results to train AI models. » Sa politique de confidentialité ajoute qu'il n'utilise ni les photos des clients ni les images générées pour entraîner des modèles.
   - FASHN, conditions : « FASHN will not use Customer Content to train, fine-tune, or otherwise improve FASHN or third-party AI models », sauf adhésion volontaire par un accord séparé. Le « Customer Content » comprend les images générées.
   - Conservation chez Genlook : photos et images générées effacées au bout de la durée réglée (1, 3 ou 7 jours au plus), originaux non traités sous 1 jour. Chez FASHN : entrée en base64 effacée à la fin du traitement (nettoyage de secours sous 1 jour), résultat en base64 disponible 60 minutes, résultat sur leur CDN 3 jours. Historique des requêtes gardé sans limite, sans image mais avec les URL envoyées, et sans suppression en libre-service (demande à `legal@fashn.ai`). D'où la règle du §3 : la photo de l'acheteur part en base64.
6. **Images générées : elles appartiennent à Zabelie, chez les deux.**
   - Genlook, conditions §5 : « As between you and Genlook, you own the try-on images generated from your content », sous réserve des droits des personnes représentées ; licence à Genlook limitée à fournir et sécuriser le service. Ses conditions nous interdisent aussi de présenter l'image générée comme une vraie photo de l'acheteur ou comme une garantie de taille, ce que fait déjà la mention « Aperçu généré par IA ».
   - FASHN, conditions : « you own the outputs generated for you » ; FASHN nous cède ses droits éventuels ; sa licence sert seulement à faire tourner le service et prend fin à l'effacement ; pas d'usage marketing sans notre accord.
7. **Composants du modèle maison** : DWPose et YOLOX sous Apache-2.0 ; **FASHN Human Parser sous licence NVIDIA de SegFormer, non commerciale** (recherche ou évaluation seulement). Conséquences au §4.1 : le modèle maison sert au test, pas à la production tant que l'analyseur n'est pas remplacé. Droits sur ses données d'entraînement : non décrits.

Les deux fournisseurs interdisent d'envoyer la photo d'une autre personne sans son accord, et tout contenu impliquant des mineurs ou sexuellement explicite : cela conforte les choix du §2 (rayons fermés, « c'est ma photo, j'ai 18 ans ou plus »).

### Encore ouvertes (porteur)

2. **Photo d'une autre personne** (le proche en Haïti) : exclue du pilote. On s'en tient à « c'est ma photo, j'ai 18 ans ou plus ».
3. **Vendeurs pilotes** : la liste est à fournir par le porteur.
4. **Plafond et quota** : 1 000 essais par mois et 5 par jour et par acheteur conviennent-ils ?
5. **Seuil de décision** de la §7 : quel écart faut-il voir sur les refus et les litiges pour généraliser ?

### Question écrite à envoyer au support de Genlook (par le porteur)

Objet : *Footwear support in the Try-On API*

> Hello, we run Zabelie, a marketplace in Haiti, and we are evaluating your Try-On API for a pilot. Does the API support footwear (sneakers, sandals, heels, boots) on a full-length photo of the shopper? If so, are there requirements for the product image (angle, background) and for the shopper photo (feet visible, resolution)? Thank you.

La réponse est consignée ici, avec sa date, avant toute ouverture des chaussures (§2.2).

### Sources, relevées le 2026-10-19

- Prix et API : [Genlook, API](https://genlook.app/developers) (0,04 $ l'essai à l'unité, 20 $ les 1 000 par mois, 10 essais offerts, échecs remboursés), [FASHN, API](https://fashn.ai/products/api) et [doc v1.6](https://docs.fashn.ai/api-reference/tryon-v1-6) (0,075 $ l'image, échecs non facturés, modération `conservative`, `return_base64`).
- Conditions et confidentialité : [Genlook, conditions](https://genlook.app/terms), [Genlook, confidentialité](https://genlook.app/privacy), [FASHN, conditions](https://fashn.ai/legal/terms-of-service), [FASHN, conservation des données](https://docs.fashn.ai/api-overview/data-retention-privacy), [FASHN, DPA](https://fashn.ai/legal/dpa).
- Modèle maison : [annonce FASHN VTON v1.5](https://fashn.ai/blog/fashn-vton-1-5-open-source-release), [dépôt GitHub et fichier LICENSE](https://github.com/fashn-AI/fashn-vton-1.5), [fiche Hugging Face](https://huggingface.co/fashn-ai/fashn-vton-1.5), [FASHN Human Parser](https://huggingface.co/fashn-ai/fashn-human-parser), [licence NVIDIA de SegFormer](https://github.com/NVlabs/SegFormer/blob/master/LICENSE), [licence DWPose](https://github.com/IDEA-Research/DWPose/blob/onnx/LICENSE).
- Licences des autres modèles ouverts (IDM-VTON et CatVTON non commerciaux) : [IDM-VTON](https://huggingface.co/yisol/IDM-VTON), [comparatif FASHN](https://fashn.ai/blog/comparing-the-top-4-open-source-virtual-try-on-viton-models).
- Prix GPU : [RunPod](https://www.runpod.io/gpu-cloud/pricing) (L40S environ 0,79 $ de l'heure, facturation à la seconde).
