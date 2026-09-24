# 65 — Documentation fournisseurs vérifiée (Studio Créatif)

Chaque point porte sa **source** : une page de documentation officielle
**copiée par le porteur** (le proxy des sessions agent bloque
`docs.higgsfield.ai`), ou une **capture de sa console** Higgsfield. Rien n'est
déduit ni recopié d'une source secondaire. Ce qui n'a pas de source reste
`NON VÉRIFIÉ`, et le code ne s'écrit pas dessus (`docs/62` §3).

Distinction à garder (consigne de la doc Higgsfield elle-même) : **disponibilité
documentée** ≠ **accès vérifié avec le compte du porteur**. Aucun appel à l'API
n'a encore été fait.

## 1. Higgsfield — commun à tous les modèles

| Point | Statut | Réponse | Source |
|---|---|---|---|
| Adresse de base | VÉRIFIÉ | `https://api.higgsfield.ai` | docs « How the API works » (copiée le 2026-09-23) |
| Cycle de requête | VÉRIFIÉ | asynchrone : soumettre du JSON à l'endpoint du modèle → garder `request_id` → interroger `status_url` **ou** attendre un webhook → télécharger quand l'état vaut `completed` | idem |
| Authentification | VÉRIFIÉ | côté serveur uniquement ; en-tête `Authorization: Key ${HF_API_KEY_ID}:${HF_API_KEY_SECRET}` | exemple `curl` de la page « Marketing Studio Image — 2.0 Alpha API » (copiée le 2026-09-24) |
| États possibles, annulation, **conservation** | NON VÉRIFIÉ | page `/docs/concepts/requests` à lire | — |
| Erreurs, 429 | NON VÉRIFIÉ | page `/docs/concepts/errors` à lire | — |
| Webhooks | NON VÉRIFIÉ | page `/docs/how-to/webhooks` à lire | — |
| Catalogue des modèles | VÉRIFIÉ | la **console** (`console.higgsfield.ai`) fait foi, chaque modèle a sa propre doc ; `/docs/openapi.json` n'est qu'un complément | consignes de l'index `llms.txt` (copiées le 2026-09-24) |
| Production ou préversion | à vérifier par modèle | la doc du modèle le précise ; ne pas substituer un environnement à un autre | idem |

## 2. Modèles d'image — prix relevés sur la console du porteur (2026-09-24)

| Modèle | Résolution | Prix actuel (à partir de) |
|---|---|---|
| Marketing Studio Image (3 modes) | jusqu'à 4K | 0,0107 $/image |
| Grok Imagine 2.0 | jusqu'à 2K | 0,04 $/image |
| Soul Standard | jusqu'à 1080p | 0,0938 $/image |
| Soul 2 Standard | jusqu'à 1080p | 0,0032 $/image |
| Ideogram 4.0 | — | 0,03 $/image |
| Qwen Image 3 (2 modes) | jusqu'à 2K | 0,04 $/image |
| Recraft 4.1 | jusqu'à 2K | 0,035 $/image |

Ce sont les prix **du compte du porteur** à cette date (remises comprises),
pas un tarif contractuel.

## 3. Marketing Studio Image — candidat principal

> « Generate and edit campaign images, with optional preset-based prompt
> enhancement. » — page « Marketing Studio Image API » (copiée le 2026-09-24)

| Version | Endpoint | Statut |
|---|---|---|
| 2.0 Alpha — « generate and edit » | `POST /marketing-studio/image` | endpoint et champs VÉRIFIÉS (§3.1) |
| 2.5 Flare | `POST /marketing-studio/image/flare` | endpoint VÉRIFIÉ ; champs NON VÉRIFIÉS |
| 2.5 Sunburst | `POST /marketing-studio/image/sunburst` | endpoint VÉRIFIÉ ; champs NON VÉRIFIÉS |

### 3.1 2.0 Alpha — schéma d'entrée

Source : page « Marketing Studio Image — 2.0 Alpha API », copiée par le porteur
le 2026-09-24. La page parle de « current production mappings » ; « Alpha »
reste dans le nom, et l'accès avec le compte du porteur n'est pas encore vérifié.

| Champ | Valeurs | Défaut |
|---|---|---|
| `prompt` (obligatoire) | texte, 1 à 5 000 caractères | — |
| `image_urls` | 0 à 16 URL (JPEG, PNG, WebP) | aucune → texte vers image |
| `enhance_prompt` | booléen | `false` |
| `preset_id` | uuid d'un preset existant | — |
| `quality` | `low` · `medium` · `high` | `high` |
| `resolution` | `1k` · `2k` · `4k` | `2k` |
| `aspect_ratio` | `auto` · `1:1` · `3:2` · `2:3` · `4:3` · `3:4` · `16:9` · `9:16` · `21:9` | — |
| `moderation` | `auto` · `low` | — |

`additionalProperties: false` : un champ inconnu est refusé, jamais ignoré.

Règles d'usage de la page :
* **sans** `enhance_prompt` : jusqu'à 16 images, pour **éditer** ;
* **avec** `enhance_prompt=true` : `preset_id` obligatoire, 1 ou 2 images
  (produit en premier, personne ou mannequin en second), et la qualité doit
  valoir `high`.

Presets : `GET /marketing-studio/image/presets`, avec les paramètres `search`,
`size` (≤ 100) et `cursor`.

Réponse : `{"status":"queued","request_id","status_url","cancel_url"}`, puis,
une fois terminé, `{"status":"completed","request_id","images":[{"url"}]}`.
**Il existe une annulation** (`cancel_url`).

### 3.2 Confrontation à R-STUDIO-01

| Critère | Verdict | Conséquence |
|---|---|---|
| **Photo du produit en entrée** (éliminatoire) | ✅ **REMPLI** — `image_urls`, mode édition | le Studio est faisable sur ce modèle |
| Prompt négatif | ❌ **aucun champ** | les 7 exclusions de `NEGATIF_SYSTEMATIQUE` doivent passer en **contraintes écrites dans le prompt positif** (« no text, no logo… ») — moins sûr, à mesurer |
| Ratio `4:5` | ❌ **absent** | le plus proche est `3:4` ; `1:1` et `9:16` existent. À arbitrer : `3:4` ou recadrage côté Zabelie |
| Empêcher le texte dans l'image | ❌ aucun paramètre | idem prompt négatif : consigne dans le prompt, et contrôle a posteriori |
| `enhance_prompt` / presets | ⚠️ **réécrit le prompt** | contraire au contrôle voulu par R-STUDIO-01 (aucun texte libre, exclusions) → **rester à `enhance_prompt=false`** tant qu'aucune mesure ne dit le contraire |
| Idempotence | NON VÉRIFIÉ | aucune clé visible sur cette page ; à chercher dans `/docs/concepts/requests` |
| `moderation` | à arbitrer | recommandation : `auto` (la valeur la plus stricte des deux) |

## 4. Vidéo — hors périmètre v1, prix relevés pour mémoire

Seedance 2.5 (≤ 720p, 4–30 s, 0,1748 $/s) · Seedance 2.0 (≤ 4K, 4–15 s,
0,1196 $/s) · Kling 3.0 (≤ 1080p, 1–15 s, 0,0714 $/s) · Kling 2.6 (1/5/10 s,
0,0595 $/s) · Kling 2.5 (≤ 1080p, 5/10 s, 0,0357 $/s) · Kling O1 Omni et O3
(0,0714 $/s). Le Studio v1 produit des **visuels fixes** ; la vidéo serait un
chantier distinct.

## 5. Écarts avec le code déjà en place

`lib/creative/providers/creative.ts` suppose : soumission → référence
fournisseur → sondage borné jusqu'à un état final. **Compatible** avec le cycle
vérifié au §1 (`request_id` ↔ `providerRef`, `status_url` ↔ `status()`, `cancel_url` disponible pour un délai dépassé). Écarts
à trancher une fois la page `requests` lue : noms exacts des états, et si
Higgsfield offre une clé d'idempotence (sinon, l'idempotence reste gardée côté
Zabelie par le journal, Phase 3).

## 6. Reste à lire, dans l'ordre

1. `/docs/models/marketing-studio-image/flare.md` et `sunburst.md` (négatif ? `4:5` ?)
2. `/docs/concepts/requests.md` : états exacts, **conservation des images**, idempotence
3. `/docs/concepts/errors.md` (429), `/docs/how-to/webhooks.md`
