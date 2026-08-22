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
| `RESEND_API_KEY` · `EMAIL_FROM` | aucun e-mail transactionnel. Le paiement marche quand même. ⚠️ **Les deux ensemble** — voir §15.2 : la clé seule retombe sur le bac à sable de Resend |
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

* **Les §1 à §14 ne lisent aucune valeur réelle** — ils forment la grille.
  Les deux écrans qui la ferment, **Environment Variables** et **Domains**,
  ont été relevés le 20 août 2026 : voir **§15**. Les lignes ⛔ qui restent
  ouvertes après ce relevé sont recensées au §15.7.
* **Les sauvegardes ne sont pas ici** — elles sont côté Supabase, et le plan
  Hobby de Vercel ne dit rien du plan Supabase. C2.4 / C2.5 de `docs/31`
  restent ouvertes, et c'est ce qui laisse les **RPO/RTO de `docs/38` §6
  délibérément vides**.
* **Rien ici n'atteste que le site fonctionne.** Une configuration juste et
  une page qui s'affiche sont deux constats différents ; le second se fait
  dans un navigateur.
---

## 15. Relevé du 20 août 2026 — les écrans ont été lus

> **Provenance.** Cette section est l'œuvre d'une session parallèle disposant
> de l'accès aux écrans (session `01L37vJcZYQVyR32USUKYLnn`), livrée en patch
> et jamais poussée faute d'accès en écriture au dépôt. Reconstruite ici à
> l'identique depuis le patch, à trois détails près : le rendu du chat avait
> transformé trois occurrences de `www.zabelie.com` en liens markdown —
> réparées.

Les deux écrans qui manquaient ont été ouverts : projet **`uniondigitale`**,
équipe `eliezerphilippe0-1474's projects`, plan **Hobby**. Cette section
remplace les ⛔ des §7, §8 et §12 par des constats datés.

**Aucune valeur secrète n'a été lue.** Les 16 variables sont toutes marquées
« Sensitive » : leur contenu est invisible au tableau de bord. Ce qui est
affirmé ici l'est soit par le **nom** de la variable, soit par une **mesure
faite depuis l'extérieur** du site.

### 15.1 Les 16 variables posées

| Variable | Environnements |
| --- | --- |
| `CRON_SECRET` | Production + Preview |
| `RECONCILE_SECRET` | Production + Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | Production + Preview |
| `NEXT_PUBLIC_SUPABASE_URL` | Production + Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production + Preview |
| `NEXT_PUBLIC_SITE_URL` | Production + Preview |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Production + Preview |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Production + Preview |
| `SEARCH_FINGERPRINT_SALT` | Production + Preview |
| `GEMINI_API_KEY` | Production + Preview |
| `MONCASH_CLIENT_ID` | Production + Preview |
| `MONCASH_CLIENT_SECRET` | Production + Preview |
| `MONCASH_MODE` | Production + Preview |
| `RELOADLY_CLIENT_ID` | **Preview seulement** |
| `RELOADLY_CLIENT_SECRET` | **Preview seulement** |
| `RELOADLY_MODE` | **Preview seulement** |

Onglet **Shared** : « No shared variables linked ». Il n'y a rien d'autre.
**Aucune variable n'est posée en Development** : un `vercel env pull` local
ramène un fichier vide.

Les deux constats qui ferment le §0 et le §7.4 :

* **`CRON_SECRET` est posée en Production.** L'hypothèse du 401 silencieux
  sur les huit routes est morte. Ce n'est pas là qu'il faut chercher.
* **`ZABELIE_DEMO_FIXTURES` n'existe pas.** Le catalogue servi est le vrai.

### 15.2 Les 14 variables que le code lit et qui ne sont pas posées

Le code applicatif lit 33 noms, dont 3 que Vercel fournit lui-même
(`NODE_ENV`, `VERCEL_URL`, `NEXT_PUBLIC_VERCEL_URL`). Restent **30 à poser
soi-même**, dont **16 le sont**. Voici les 14 absentes et ce que leur absence
produit — lu dans le code, pas supposé :

| Absente | Ce qui se tait en production |
| --- | --- |
| `RESEND_API_KEY` | `isEmailEnabled()` → `false`, `sendEmail()` retourne `false` sans lever. **Aucun e-mail transactionnel ne part.** |
| `EMAIL_FROM` | ⚠️ **PAS « sans objet » — corrigé le 2026-08-22.** Le repli `onboarding@resend.dev` est le BAC À SABLE de Resend : il ne livre qu'à l'adresse du titulaire du compte. Poser `RESEND_API_KEY` seule donne donc une clé valide, une sonde qui dit « configuré », et **zéro e-mail livré à un acheteur**. Les deux variables, ou aucune. |
| `STRIPE_SECRET_KEY` | `isStripeEnabled()` → `false` : le rail carte n'est **jamais affiché** sur la fiche produit. |
| `STRIPE_WEBHOOK_SECRET` | Sans objet tant que la précédente manque. |
| `ZELLE_RECIPIENT` | `isZelleEnabled()` → `false` : le rail Zelle n'est jamais affiché. |
| `ZELLE_RECIPIENT_NAME` | Sans objet (repli `"Zabelie"`). |
| `USD_HTG_RATE` | `Number(undefined)` → `NaN`. Voir §15.3 — c'est la plus coûteuse. |
| `ZABELIE_TOPUP_FIRSTPARTY_ENABLED` | La vente de recharges première partie reste close (`topup_firstparty_closed`). |
| `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM` | ≠ `"1"` : **les transformations d'image sont éteintes**. Les visuels partent en taille d'origine — sur cible Android d'entrée de gamme, c'est le poste le plus cher de la page. |
| `NEXT_PUBLIC_WHATSAPP_LINK` | Repli propre sur le numéro. Sans conséquence. |
| `OPENAI_API_KEY` | Le fournisseur IA retombe sur Gemini, qui est posé. Voir l'avertissement §15.4. |
| `OPENAI_MODEL` | Sans objet. |
| `GEMINI_MODEL` | Repli sur le modèle par défaut du code. |
| `ZABELIE_DEMO_FIXTURES` | Son absence est **le bon état**. |

Aucune de ces absences ne casse un déploiement. Toutes se taisent. C'est la
même famille que le §7.3, mais mesurée cette fois.

### 15.3 Un nombre absent éteint deux rails de paiement

`app/produit/[slug]/page.tsx` place l'ajout du rail Stripe **et** du rail
Zelle à l'intérieur d'un même test :

```ts
const rate = Number(process.env.USD_HTG_RATE);
if (Number.isFinite(rate) && rate > 0) {
  if (isStripeEnabled()) options.push({ rail: "stripe", ... });
  if (isZelleEnabled())  options.push({ rail: "zelle",  ... });
}
```

`USD_HTG_RATE` n'étant pas posée, `rate` vaut `NaN` et le bloc entier est
sauté. Poser demain `STRIPE_SECRET_KEY` et `ZELLE_RECIPIENT` ne suffirait
donc **pas** : les deux rails resteraient invisibles, sans erreur et sans
journal, tant que le taux manque. Un seul nombre absent gouverne deux
moyens de paiement.

**Conséquence du jour : MonCash est le seul rail de paiement vivant en
production.**

### 15.4 « Sensitive » sur seize variables sur seize

Les cinq `NEXT_PUBLIC_*` sont marquées « Sensitive » alors que Next.js les
**inline dans le paquet client** : leur valeur est déjà lisible par n'importe
quel visiteur dans le JavaScript servi. Le marquage n'ajoute donc aucune
protection ; il retire seulement la possibilité de relire la valeur au
tableau de bord — y compris `NEXT_PUBLIC_SITE_URL`, précisément celle qu'on
a besoin de vérifier le plus souvent (§7.2). Coût réel, bénéfice nul.

Un avertissement à garder : `aiProviderDisponible()` teste `OPENAI_API_KEY`
**avant** `GEMINI_API_KEY`. Poser un jour la première bascule silencieusement
tout le générateur de descriptions sur OpenAI.

### 15.5 Domains — l'hypothèse apex ↔ www est confirmée

L'écran liste deux entrées, **toutes deux en Production, toutes deux
« Valid Configuration », et aucune n'est une redirection** :

| Hôte | Statut |
| --- | --- |
| `zabelie.com` | Production · Valid Configuration |
| `www.zabelie.com` | Production · Valid Configuration |

Mesuré depuis l'extérieur, sur les deux hôtes :

* `https://zabelie.com/` répond `200` et **ne redirige pas** vers `www`.
* `https://www.zabelie.com/` répond `200` et **ne redirige pas** vers l'apex.
* Sur les deux, un service worker distinct est enregistré et actif :
  `zabelie.com/sw.js` et `www.zabelie.com/sw.js`.
* Sur **www**, `<link rel="canonical">` pointe vers `https://zabelie.com/`.
* `robots.txt` déclare `Sitemap: https://zabelie.com/sitemap.xml`, et chaque
  `<loc>` du sitemap est en apex.

De quoi on déduit, sans avoir lu la variable : **`NEXT_PUBLIC_SITE_URL` vaut
`https://zabelie.com`** — l'apex. Et pourtant le tableau de bord Vercel
affiche `www.zabelie.com` comme URL de production du projet. C'est là que
naît la contradiction.

Deux origines servies en parallèle, c'est **deux pots de cookies, deux
service workers, deux caches** — et un seul canonique qui renvoie tout le
monde vers l'apex. Une session ouverte sur `www` ne survit donc pas au
premier lien interne. C'est exactement la prémisse de la PR #144, désormais
appuyée sur des mesures et non sur une hypothèse.

### 15.6 Cron Jobs — la fonction est active, l'exécution est inobservable

`Settings → Cron Jobs` : la fonctionnalité est **Enabled** et les **huit**
routes de `vercel.json` y figurent, aux horaires attendus (UTC). Rien n'est
tronqué par le plan.

Mais leur exécution ne peut pas être vérifiée :

* `Observability → Cron Jobs` affiche « No data found ». La fenêtre par
  défaut est de 12 h et, relevé fait à 04:30 UTC, elle ne **couvre aucun**
  des créneaux 12:00–14:45 UTC. Ce vide ne prouve donc rien.
* Les journaux d'exécution s'ouvrent sur « Last 30 minutes » et la rétention
  Hobby est trop courte pour remonter au créneau de la veille.
* Les traces que les routes produisent partent toutes en **journal
  d'exécution**, jamais en base. Cinq des huit en émettent : quatre passent
  par un `journal()` local qui n'est qu'un `console.log` structuré
  (`fulfillment/sweep`, `stock/expire`, `search/purge`, `kyc/purge`), et
  `admin/coherence` journalise même quand tout va bien — le bon réflexe.
  Mais la rétention Hobby les efface avant qu'on puisse les relire.
* **Trois routes n'émettent rien du tout** — zéro appel à `console` :
  `/api/reconcile`, `/api/maturation`, `/api/points/expire`. Réconciliation
  des paiements, maturation des soldes, expiration des points : les trois
  qui touchent à l'argent sont les trois muettes, qu'elles réussissent,
  qu'elles ne trouvent rien à faire ou qu'elles échouent.

Le vrai manque n'est donc pas le 401 qu'on cherchait : c'est qu'**il
n'existe aucun moyen de savoir si un cron a réussi**. Une ligne d'audit
écrite en base par chaque route — l'heure, le résultat, le compte traité —
fermerait ce trou sans changer de plan, et survivrait à la rétention.

Un second point, propre au plan Hobby, est affiché à l'écran : **« flexible
time window of 1-hour »**. Les huit créneaux sont espacés de 15 à 30 minutes
et deux couples sont ordonnés par nécessité — `/api/reconcile` (12:00) avant
`/api/fulfillment/sweep` (12:30), `/api/maturation` (13:00) avant
`/api/admin/coherence` (13:30). Une tolérance d'une heure **autorise
l'inversion**. L'ordre supposé par la chaîne n'est pas garanti par le plan.

### 15.7 Ce qui reste non vérifié après ce relevé

* Les **valeurs** des 16 variables, hors `NEXT_PUBLIC_SITE_URL` déduite en
  §15.5 — le marquage « Sensitive » les rend illisibles.
* Le **résultat** des huit crons, pour les raisons du §15.6.
* Firewall (§5) et CDN (§6), non ouverts ce jour.

### 15.8 Addendum — second relevé du même jour, et ce qui a suivi

Rapporté par la même session parallèle, quelques heures plus tard ; le point
sur le cache a été **revérifié dans le dépôt** avant d'être écrit ici.

* **Firewall et CDN, les deux derniers ⛔ du §15.7, sont fermés** : Firewall
  actif, « All systems normal », Bot Protection inactive, 0 règle, 0 requête
  déniée. CDN : 0 % de 5xx, TTFB p90 à 2 ms, **taux de succès de cache
  31,2 %**, « No ISR activity ».
* **Ce 31 % n'est pas un réglage Vercel, c'est le code** — mesuré :
  **25 pages sont `force-dynamic`, aucune n'utilise `revalidate`**, accueil,
  catalogue et fiche produit compris. Le CDN ne peut rien mettre en cache,
  par construction. Ajouté aux transformations d'image éteintes (§15.2),
  chaque page coûte une invocation de fonction et chaque image part en
  taille d'origine — sur Android d'entrée de gamme.
* **Le geste de redirection n'est pas là où son nom l'annonce** :
  `CDN → Redirects` affiche « Upgrade to Pro » — mais cela ne concerne que
  les redirects de *chemins*. La redirection d'un **domaine** se règle dans
  `Settings → Domains`, bouton `Edit` sur la ligne — **disponible sur
  Hobby**. Décision porteur.
* **Suites déjà données dans le code** : les trois routes muettes du §15.6
  journalisent désormais chaque passage (PR #146), et sept crons sur huit
  prennent le bail `0060` — dont la table `zabelie_cron_leases` porte,
  durablement, la *dernière heure de démarrage* de chacun (PR #147). Le
  bail répond à « ont-ils tourné » ; « ont-ils réussi » demande encore une
  écriture de résultat en base — chantier ouvert, nommé dans la PR #147.
