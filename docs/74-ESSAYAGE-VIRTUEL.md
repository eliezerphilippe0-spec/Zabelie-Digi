# 74 — Essayage virtuel (pilote)

Statut : **spécification à valider** (2026-10-19). Aucune ligne de code avant le « oui » du porteur sur ce document.

## 1. Objectif

Un acheteur connecté envoie une photo de lui et voit un vêtement d'un vendeur pilote porté sur lui, en une dizaine de secondes. Le but n'est pas la vitrine : on veut savoir, chiffres à l'appui, si l'essayage réduit les colis refusés à la livraison et les litiges, et s'il augmente les achats sur la mode.

Décisions du porteur (2026-10-19) :

- **Accès** : vendeurs pilotes (5 à 10 vendeurs mode), activés un par un par l'administration. Plus tard, avantage Elite et option payante ; hors de ce pilote.
- **Fournisseur** : comparer l'API Genlook et FASHN sur 20 photos de clientes haïtiennes avant de choisir. Le code ne dépend d'aucun des deux.
- **Paiement** : Zabelie paie, avec un plafond mensuel qui coupe l'essayage tout seul.

Utilisateurs :

- **Acheteur** : connecté, sur téléphone d'entrée de gamme, souvent en 3G.
- **Vendeur pilote** : vend des vêtements avec une photo principale de face, sur fond uni. Il n'a rien à faire, sauf soigner cette photo.
- **Administration** : active les vendeurs, règle le plafond et le quota, met en pause.

## 2. Périmètre

### Dans le pilote

1. **Éligibilité d'une fiche** : publiée, de type physique, vendeur pilote actif, sous-rayon dans la liste autorisée (§2.1), photo principale présente.
2. **Bouton « Essayer sur moi »** sous « Ajouter au panier », pour un acheteur connecté du groupe essai (§5). Ni bouton ni appel pour les visiteurs anonymes.
3. **Consentement** avant la première photo, dans les 4 langues : c'est ma photo, j'ai 18 ans ou plus, j'accepte qu'elle parte chez le prestataire, qui l'efface. La version acceptée est gardée sur l'appareil.
4. **Photo** : prise ou choisie sur le téléphone, compressée sur l'appareil (`lib/image-compress.ts`), puis envoyée. Option « Garder ma photo sur ce téléphone », décochée par défaut, avec un bouton pour l'effacer.
5. **Résultat** : affiché avec la mention « Aperçu généré par IA. La coupe et la couleur réelles peuvent différer. », puis « Ajouter au panier ». Il n'est jamais conservé par Zabelie.
6. **Limites** : quota par acheteur et par jour (5 par défaut), plafond mensuel global (1 000 par défaut), pause. Un essai échoué ne compte ni dans le quota ni dans le plafond.
7. **Administration** : liste des vendeurs pilotes (ajouter, retirer), réglages (plafond, quota, pause), compteur du mois.
8. **Mesure** : groupe essai et groupe témoin, expositions enregistrées, requête d'analyse documentée (§5).
9. **Outil de comparaison** des fournisseurs : il fait passer N photos de personnes × M photos de produits chez chaque fournisseur, puis produit une planche à juger. Mode « à blanc » par défaut, qui annonce le coût sans rien dépenser.

### 2.1 Sous-rayons autorisés (taxonomie `zabelie_categories`, 0035 et 0077)

| Département | Autorisés | Exclus |
|---|---|---|
| `rad-fanm` | `wob`, `blouz-chemizye`, `pantalon-djin-fanm`, `jip`, `ansanm-taye`, `ves-manto-fanm`, `rad-tradisyonel` | `lenjri`, `mayo-beny` |
| `rad-gason` | `chemiz`, `mayo-polo`, `pantalon-djin-gason`, `chot`, `kostim`, `ves-gason` | `souvetman-gason` |
| `rad-espo` | `mayo-chot-espo`, `sivetman` | `soulye-espo`, `akseswa-espo` |
| `rad-timoun` et tout le reste | aucun | tout |

Une fiche rangée au niveau 3 hérite de son parent de niveau 2. Une fiche sans sous-rayon (rangée au seul département) n'est pas éligible : elle pourrait être de la lingerie.

### Hors pilote

Essayage par la caméra en direct (lunettes, maquillage, perruques), chaussures, accessoires, guide des tailles, photo d'une autre personne (cas « pour un proche » de la diaspora), avantage Elite, facturation aux vendeurs.

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

- **Adaptateur** (`lib/essayage/fournisseurs/`) : `creer()`, `statut()`, `effacer()`, avec trois mises en œuvre : `genlook`, `fashn`, `simulation`. La simulation sert aux tests et à l'e2e : elle ne coûte rien et ne sort pas de la machine.
- **Interrupteurs** (même règle que le Studio : seule la valeur exacte `true` ouvre) : `ZABELIE_ESSAYAGE_ENABLED`, `ZABELIE_ESSAYAGE_FOURNISSEUR` (`genlook`, `fashn` ou `simulation` ; absent = aucun fournisseur, jamais de défaut qui dépenserait), `GENLOOK_API_KEY`, `FASHN_API_KEY`. Ajoutés à `.env.example`.
- **FASHN** : `moderation_level: "conservative"` (bloque sous-vêtements et maillots), `return_base64: true` (le résultat n'est gardé qu'une heure chez eux).
- **Genlook** : conservation des envois réglée au minimum (1 jour), effacement des images de l'acheteur après le résultat.
- **Taille des envois** : photo compressée côté client (côté long de 1 024 px au plus, quelques centaines de kilo-octets), sous la limite de 4,5 Mo des fonctions Vercel.

### 3.1 Données (migration `0150`, appliquée en production seulement sur « oui »)

| Objet | Contenu | Accès |
|---|---|---|
| `zabelie_essayage_config` | une ligne : `plafond_mois`, `quota_jour`, `en_pause` | lecture et écriture par le rôle service seul |
| `zabelie_essayage_vendeurs` | `seller_id`, `actif`, `active_par`, `active_le` | rôle service seul |
| `zabelie_essayage_rayons` | les sous-rayons autorisés (§2.1) | lecture publique, écriture par migration |
| `zabelie_essayage_essais` | `id`, `acheteur_id`, `produit_id`, `vendeur_id`, `fournisseur`, `travail_id`, `statut`, `cree_le`, `termine_le` | rôle service seul |
| `zabelie_essayage_expositions` | `acheteur_id`, `produit_id`, `groupe`, `jour`, unique par trio | rôle service seul |
| `zabelie_essayage_reserver(...)` | éligibilité, quota, plafond et insertion, en une transaction sous verrou | `security definer`, `search_path` figé, accordée au rôle service seul |
| `zabelie_essayage_terminer(...)` | passe un essai en `reussi` ou `echec` | idem |

Aucune colonne ne contient de photo, d'URL de photo ou de résultat. Les fonctions `security definer` entrent dans la liste gelée du garde `definer_exposition` et dans sa revue. La sonde `zabelie_objets_requis()` les inclut. Le registre `zabelie_schema_migrations` est rempli à la main après application, selon la méthode 0086.

## 4. Commandes

```bash
npm test                                   # tests unitaires et gardes (node --test)
npx tsc --noEmit                           # types
npx eslint <fichiers modifiés>             # lint
npm run build                              # build de production, doit passer
npx playwright test --project=physique     # e2e, fournisseur « simulation »
node scripts/essayage-comparer.mjs --photos <dossier hors dépôt> --produits <liste>          # à blanc : coût annoncé
node scripts/essayage-comparer.mjs --photos <dossier hors dépôt> --produits <liste> --payer  # appels réels, après accord
```

Local Playwright : `PW_CHROMIUM_PATH` vers le headless shell 1208. Jamais de `npm ci` ni de `npm install` dans cette copie : son `node_modules` est une jonction partagée.

## 5. Mesure

- **Groupes** : pour une fiche éligible, un acheteur connecté est en groupe `essai` ou `temoin` selon un hachage stable de son identifiant (moitié-moitié). Le témoin voit la fiche sans bouton.
- **Exposition** : première vue d'une fiche éligible par un acheteur, une fois par jour, dans les deux groupes.
- **Indicateurs** par groupe, sur 4 à 6 semaines : ajout au panier, commande payée, livraison sans refus, litige ouvert. Requête SQL d'analyse versionnée dans ce document une fois le schéma écrit.
- **Seuil de décision**, à fixer avant le lancement : le groupe essai doit faire mieux que le témoin sur les refus à la livraison et les litiges, pas seulement sur les clics.

## 6. Style de code

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

## 7. Tests

- **Unitaires** (`tests/essayage-*.test.ts`) : éligibilité (chaque sous-rayon autorisé et exclu, niveau 3, sans sous-rayon, vendeur inactif, fiche non publiée), lecture des interrupteurs, répartition des groupes (stable, environ 50/50), adaptateurs face à des réponses enregistrées.
- **SQL** (`supabase/tests`, CI `sql-tests`) : quota du jour, plafond du mois, essais échoués non comptés, 20 réservations simultanées qui ne dépassent jamais le plafond, refus pour un acheteur anonyme, aucune lecture par `anon` ou `authenticated`.
- **E2E** (`e2e/parcours-physique-essayage.spec.ts`, fournisseur `simulation`) : bouton visible ou absent selon les cas, consentement, envoi, attente, résultat avec la mention IA, quota atteint, pause, 360 px sans défilement horizontal, cibles de 44 px, 4 langues.
- **Gardes** : aucune route d'essayage n'écrit dans Supabase Storage ; aucun journal ne contient d'image ; `.env.example` complet.
- **Mutations ciblées** sur l'éligibilité, le quota et le plafond : chacune doit faire échouer un test.

## 8. Limites

**Toujours**
- Interrupteurs éteints par défaut ; tout passe par le serveur, clés côté serveur seulement.
- Vérifier session, compte actif et éligibilité dans chaque route, pas seulement dans l'interface.
- Mention « Aperçu généré par IA » sur chaque résultat.
- Fournisseur `simulation` dans les tests et la CI.
- Annoncer le coût et attendre l'accord avant tout appel payant (outil de comparaison compris).

**Demander d'abord**
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

## 9. Critères de réussite

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
12. L'outil de comparaison produit une planche par fournisseur, et le mode à blanc annonce le coût sans rien appeler.

## 10. Préalables hors code (porteur)

- **Double authentification de l'administrateur** sur `/securite` : sans elle, pas d'accès à la page d'administration, donc pas d'activation de vendeur depuis l'interface.
- **Catalogue ouvert** : modération accessible, et fiches mode publiées par les vendeurs pilotes.
- **Comptes chez Genlook et FASHN**, clés posées dans Vercel par le porteur ; carte pour les crédits (comparaison : moins de 5 $).
- **20 photos de clientes haïtiennes**, avec accord écrit, gardées hors du dépôt.

## 11. Questions ouvertes

1. **Entraînement** : Genlook et FASHN utilisent-ils les photos reçues pour entraîner leurs modèles ? Il faut une réponse écrite « non » avant le pilote. Ni l'une ni l'autre page développeurs ne le dit.
2. **Photo d'une autre personne** (le proche en Haïti) : exclue du pilote. On s'en tient à « c'est ma photo, j'ai 18 ans ou plus ».
3. **Vendeurs pilotes** : la liste est à fournir par le porteur.
4. **Plafond et quota** : 1 000 essais par mois et 5 par jour et par acheteur conviennent-ils ?
5. **Seuil de décision** de la §5 : quel écart faut-il voir sur les refus et les litiges pour généraliser ?
6. **Texte juridique** : relecture du consentement et de la mention « aperçu non contractuel » par un juriste ?

Sources prix et API, relevées le 2026-10-19 : [Genlook, API](https://genlook.app/developers) (0,04 $ l'essai à l'unité, 20 $ les 1 000 par mois, 10 essais offerts, échecs remboursés), [FASHN, API](https://fashn.ai/products/api) et [doc v1.6](https://docs.fashn.ai/api-reference/tryon-v1-6) (0,075 $ l'image, échecs non facturés, modération `conservative`, `return_base64`).
