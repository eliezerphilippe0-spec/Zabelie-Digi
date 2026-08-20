# 41 — Audit de la configuration Vercel, section par section

> **⚠️ CE DOCUMENT N'EST PAS UNE LECTURE DU TABLEAU DE BORD.** L'egress du
> conteneur bloque `vercel.com` et `zabelie.com` (`CONNECT 403`) : je n'ai vu
> aucun de ces écrans. Ce qui suit est l'audit fait **dans l'autre sens** —
> mesuré dans le dépôt (`bd7fe3a`, 85 migrations) et dans la production
> Supabase, il dit pour chaque section **ce que le code exige**, **la valeur
> attendue pour Zabelie**, et **ce qui casse si elle est fausse**.
>
> C'est donc une grille à exécuter, pas un verdict. Chaque ligne ⛔ marque ce
> que je n'ai pas pu vérifier — jamais estimé.
>
> Ce qui EST lu du tableau de bord vient d'une capture du 2026-08-20 : projet
> `uniondigitale`, domaine `www.zabelie.com`, dernier déploiement de
> production = « Merge pull request #142 », coche verte, plan **Hobby**.

---

## 0. La question à poser avant toutes les autres

**Les 8 crons passent-ils ?** C'est le contrôle qui domine cet audit, parce
qu'il est silencieux quand il échoue et qu'il conditionne l'argent.

`app/api/admin/coherence/route.ts:23-32` — les routes cron s'autorisent ainsi :

```ts
const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
if (cron && bearer === cron) return true;          // CRON_SECRET
if (manual && bearer === manual) return true;      // RECONCILE_SECRET
return (await getCurrentUser())?.role === "admin";
```

**Vercel n'envoie l'en-tête `Authorization` que si `CRON_SECRET` est défini.**
Si la variable manque, les huit crons reçoivent **401 tous les jours**, et
personne n'est prévenu : ni maturation des soldes, ni réconciliation des
paiements, ni contrôle de cohérence, ni purge KYC.

**À vérifier** : Deployments → Logs, filtrer sur `/api/reconcile` ou
`/api/admin/coherence` — un `200` par jour, pas un `401`. ⛔ Non vérifié.

---

## 1. Projects

| | |
|---|---|
| Attendu | **un seul** projet sert le domaine : `uniondigitale` |
| Lu sur la capture | ✅ `uniondigitale` → `www.zabelie.com` |
| Bruit | `union-digitale` (dépôt `marketplace-hub`) et `nextjs-with-supabase`, **sans déploiement de production** |

Les deux projets fantômes ne nuisent pas aujourd'hui. Ils comptent le jour où
un domaine est pointé au mauvais endroit : ce sont les deux candidats à
l'erreur. Rien à faire, sauf les supprimer si tu es sûr de ne plus t'en servir.

## 2. Deployments

| | |
|---|---|
| Branche de production | **`main`** (réglé le 2026-07-26) |
| Dernier déploiement lu | « Merge pull request #142 », coche verte, 2 h |
| Ce que ça implique | `main` fusionné **est en ligne** — donc le correctif des quatre chemins morts (`0084` côté base, `lib/creators.ts` côté code) est déployé |

**Le test d'une seconde** : `www.zabelie.com/boutik/bebeto` doit afficher la
boutique, pas un 404. C'est le seul contrôle que je ne peux pas faire d'ici.
⛔ Non vérifié.

## 3. Logs

C'est la seule fenêtre sur ce qui échoue. Trois choses à savoir chercher :

| Chercher | Pourquoi |
|---|---|
| le `digest` affiché par `app/error.tsx` | l'écran utilisateur ne montre **jamais** le message ; le journal, oui |
| les préfixes `[stock/expire]`, `[search/purge]`, `[zones]`, `[boutik]` | **chaque passage est journalisé, y compris à zéro** — « pas de ligne » = le cron n'a PAS tourné, jamais « rien à faire » |
| `purges: -1` dans `/api/fulfillment/sweep` | dégradation **prévue** : `0056` n'est pas appliquée. `-1` ≠ `0`. Ce n'est pas une panne |

⛔ Non vérifié.

## 4. Analytics · Speed Insights · Observability

**Mesuré : aucun paquet `@vercel/analytics`, `@vercel/speed-insights` ni
`@vercel/otel` n'est installé.** Ces trois sections seront donc **vides**, et
c'est normal — pas un défaut de configuration.

⚠️ Conséquence réelle, elle : **il n'existe aucune mesure de performance
terrain**. Sur la cible (Android d'entrée de gamme, 3G), c'est une information
qui manque et qui ne se déduit pas. C6 de `docs/31` porte déjà « Lighthouse »
comme reste à faire.

## 5. Firewall

Rien n'en dépend côté code. Le plafonnement d'appels est **en base**, pas au
bord : `zabelie_rate_limit(text,integer,integer)` et la table
`zabelie_rate_limits`, appelés notamment par `/api/moncash/return` (20/IP —
`route.ts:33`, un point d'entrée public qui coûte 2 appels MonCash par hit).

Si un jour tu actives une règle de pare-feu Vercel, **elle ne remplacera pas
ces plafonds** : ils protègent la dépense chez le fournisseur, pas la bande
passante. ⛔ État non vérifié.

## 6. CDN

Rien à régler. ⚠️ **Mais un service worker est en production** (`app/sw.ts`,
Serwist) — et il l'emporte sur le CDN pour ce qu'il a mis en cache.
`docs/32-PWA-SERVICE-WORKER.md` le qualifie de « **pire artefact adressé par
chaîne du répertoire** » : il survit aux déploiements, et une version
défectueuse sert du HTML périmé **indéfiniment**, sans qu'aucun journal de la
plateforme ne s'en aperçoive puisque les requêtes n'arrivent jamais.

**Symptôme** : « le site ne se met pas à jour ». **Sortie de secours, déjà
écrite** : `www.zabelie.com/sw-desinstaller`.

## 7. Environment Variables — la section décisive

**Mesuré : le code lit 32 variables.** La liste ci-dessous est mécanique
(`grep -roP 'process\.env\.\K[A-Z0-9_]+'` sur `app/`, `lib/`, `components/`,
`middleware.ts`), pas recopiée.

### 7.1 Obligatoires — sans elles, rien ne marche

| Variable | Attendu | Si absente ou fausse |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ddditxykopuxxqzgkqwy.supabase.co` | **panne totale**. C'est l'incident du 2026-08-04 : 3 h de diagnostic. Désormais **gardée au build** (`scripts/verifier-config-supabase.mjs`, PR #135) — le build échoue au lieu de déployer |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clé **publiable** (`sb_publishable_…`) | idem. La garde refuse une `sb_secret_` ou un JWT `service_role` posé ici par erreur |
| `SUPABASE_SERVICE_ROLE_KEY` | la clé de service | tableau de bord vendeur, admin, **et tout téléversement**. Réparée le 2026-08-14 — avant, **aucune écriture de stockage n'avait jamais réussi** |
| `CRON_SECRET` | une chaîne longue | **les 8 crons en 401 tous les jours**, en silence → §0 |
| `MONCASH_CLIENT_ID` · `MONCASH_CLIENT_SECRET` · `MONCASH_MODE` | `MODE=production` pour encaisser | aucun paiement possible |

### 7.2 La variable du problème du jour

| Variable | Attendu | Si absente |
|---|---|---|
| **`NEXT_PUBLIC_SITE_URL`** | **`https://www.zabelie.com`** | le code retombe sur `VERCEL_URL`, donc `uniondigitale.vercel.app` : **tout renvoi après connexion ou après paiement part là-bas**. C'est le « ça m'envoie à vercel » déjà signalé |

⚠️ Deux pièges, tous deux vécus dans ce projet :

1. **`NEXT_PUBLIC_*` est figée au BUILD.** La modifier sans **redéployer** ne
   change rien. C'est ce qui fait perdre des heures.
2. **Ne jamais coller la valeur — la retaper.** Un `\n` invisible produit une
   variable présente, invalide, et sans aucune trace (incidents du 04-08 et
   du 15-08, `docs/38` §4).

Et même posée juste, l'apex reste un problème si les deux hôtes sont servis :
PR #144 rend le code robuste au saut `zabelie.com` ↔ `www.zabelie.com`, mais
**le bon réglage est de n'en servir qu'un** → §8.

### 7.3 Optionnelles — leur absence MASQUE une fonctionnalité, sans erreur

| Variable | Ce qui disparaît en silence |
|---|---|
| `RESEND_API_KEY` · `EMAIL_FROM` | aucun e-mail transactionnel. Le paiement marche quand même |
| `RELOADLY_*` | `/rechaj` affiche « à venir » |
| `USD_HTG_RATE` · `ZELLE_*` | le rail Zelle est masqué au checkout |
| `STRIPE_*` | ⚠️ inutilisable de toute façon sans entité étrangère *merchant of record* |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | l'aide à la description ne répond plus |
| `NEXT_PUBLIC_WHATSAPP_*` · `NEXT_PUBLIC_CONTACT_EMAIL` | le canal de contact disparaît de l'interface |
| **`SEARCH_FINGERPRINT_SALT`** | ⚠️ **le capteur de demande est DÉSACTIVÉ** — et `lib/search-demand.ts:85` le journalise explicitement : « le journal restera vide : ce n'est pas l'absence de recherches, c'est l'absence de collecte ». Doit faire ≥ 16 caractères |

### 7.4 ⛔ À NE JAMAIS poser en production

| Variable | Pourquoi |
|---|---|
| `ZABELIE_DEMO_FIXTURES=true` | fait servir le **catalogue de démonstration** (`lib/products.ts:82`). En production, ce sont de faux produits devant de vrais acheteurs |

**À vérifier** : qu'elle n'existe pas dans l'environnement Production.

### 7.5 Constat d'audit — `.env.example` est incomplet

Croisé mécaniquement : **32 variables lues par le code, 21 documentées**.
Onze manquent, dont neuf réelles (`VERCEL_URL` et `NEXT_PUBLIC_VERCEL_URL`
sont injectées par Vercel, leur absence est normale) :

```
GEMINI_API_KEY · GEMINI_MODEL · OPENAI_API_KEY · OPENAI_MODEL
NEXT_PUBLIC_CONTACT_EMAIL · NEXT_PUBLIC_WHATSAPP_LINK
NEXT_PUBLIC_WHATSAPP_NUMBER · NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM
ZABELIE_DEMO_FIXTURES
```

Dans l'autre sens : **aucune** variable documentée n'est morte. Le fichier ne
ment pas, il est seulement en retard — ce qui suffit pour qu'un nouvel
environnement démarre amputé sans que rien ne le dise.

→ Complété, et tenu synchrone par `tests/env-example-complet.test.ts`.

## 8. Domains

| | |
|---|---|
| Attendu | **un seul hôte servi**, l'autre en **redirection permanente** |
| Recommandé | `zabelie.com` → 308 → `www.zabelie.com` (l'hôte de la capture) |

Si les deux répondent, le couple casse le cookie de session au saut :
`components/forgot-password-form.tsx:44` le dit depuis le 2026-08-11 (« le
couple zabelie.com / www.zabelie.com suffit à le casser »). PR #144 rattrape
côté code ; **la redirection rend le problème impossible plutôt que rattrapé.**

⛔ Non vérifié.

## 9. Connect · Integrations

Attendu : l'intégration **Supabase** (elle a déjà servi à poser les variables).
Rien d'autre n'est requis — `CLAUDE.md` interdit tout service externe non
listé, et **notamment tout fournisseur SMS**.

**À vérifier** : qu'aucune intégration n'ait été ajoutée sans décision.
⛔ Non vérifié.

## 10. Storage

**Mesuré : aucun paquet `@vercel/blob`, `@vercel/kv` ni `@vercel/postgres`.**
Cette section doit être **vide** : tout le stockage est sur Supabase
(`product-covers` public, `product-files` et `kyc-documents` privés).

Un store Vercel qui apparaîtrait ici serait une facture sans usage.

## 11. Flags

Aucun drapeau Vercel n'est lu par le code. Les bascules de Zabelie sont **en
base**, dans les tables de configuration (`zabelie_commission_config`,
`zabelie_kyc_config`, `zabelie_flash_config`…) — conformément à `CLAUDE.md`
règle 3 : « tout paramètre commercial vit en table de config, jamais en dur ».

Section attendue **vide**.

## 12. Settings → Cron Jobs

Huit, déclarés dans `vercel.json` — heures UTC :

| Heure | Route |
|---|---|
| 12:00 | `/api/reconcile` |
| 12:30 | `/api/fulfillment/sweep` |
| 13:00 | `/api/maturation` |
| 13:30 | `/api/admin/coherence` |
| 13:45 | `/api/stock/expire` |
| 14:00 | `/api/points/expire` |
| 14:15 | `/api/search/purge` |
| 14:45 | `/api/kyc/purge` |

⚠️ **Le plan Hobby limite les crons à une exécution par jour.** Ces huit sont
tous quotidiens, donc compatibles — mais aucune marge : un besoin horaire
(par exemple drainer l'outbox plus souvent) exigerait le plan Pro.

**À vérifier** : les huit sont listés et leur dernière exécution est un succès.
⛔ Non vérifié.

## 13. Plan et consommation

Lu sur la capture, plan **Hobby** :

| | Consommé | Plafond |
|---|---|---|
| Fluid Active CPU | 22 min 49 s | 4 h |
| Edge Requests | 20 K | 1 M |
| Function Invocations | 17 K | 1 M |
| Fast Origin Transfer | 83,6 Mo | 10 Go |

Rien ne sature — le trafic est celui d'un site qui n'a pas encore ouvert.
**Aucune raison de passer à Pro pour la charge.** Les deux raisons qui
pourraient l'imposer plus tard sont ailleurs : la fréquence des crons (§12) et
les alertes d'anomalie (proposées à l'écran, réservées à Pro).

---

## 14. Ce que cet audit ne dit pas

* **Aucune valeur réelle n'a été lue.** Toutes les lignes ⛔ attendent un
  écran, et deux suffiraient à fermer l'essentiel : **Environment Variables**
  et **Domains**.
* **Les sauvegardes ne sont pas ici** — elles sont côté Supabase, et le plan
  Hobby de Vercel ne dit rien du plan Supabase. C2.4 / C2.5 de `docs/31`
  restent ouvertes, et c'est ce qui laisse les **RPO/RTO de `docs/38` §6
  délibérément vides**.
* **Rien ici n'atteste que le site fonctionne.** Une configuration juste et
  une page qui s'affiche sont deux constats différents ; le second se fait
  dans un navigateur.
