# Zabelie — Politique des secrets (clés API, mots de passe, tokens)

> Règle d'or, sans exception : **AUCUNE clé API, aucun secret, dans le code,
> dans le dépôt Git, ni dans une conversation (chat, e-mail, WhatsApp).**

## 1. Où vont les secrets

| Environnement | Où poser les secrets |
|---|---|
| **Production / Preview** | Vercel → *Settings → Environment Variables* (uniquement) |
| **Local (dev)** | `.env.local` — jamais commité (couvert par `.gitignore`) |
| **Nulle part ailleurs** | Pas dans le code, pas dans un `.md`, pas dans un ticket, pas dans le chat |

## 2. Le registre — TOUTE variable d'environnement, classée

> ⚠️ **Ce registre est tenu par un test**, `tests/registre-secrets-complet.test.ts` :
> toute variable de `.env.example` doit apparaître dans **exactement un** des
> trois tableaux ci-dessous, et tout nom cité ici doit exister dans
> `.env.example`. Le croisement se périme dans les deux sens.
>
> **Pourquoi une garde et pas de la discipline** : le 2026-08-20, l'audit
> `docs/41` §7.5 a ajouté onze variables à `.env.example` et câblé un
> croisement `.env.example` ↔ **code**. Personne n'a étendu CE fichier, et
> rien ne l'a signalé. Mesuré le 2026-09-05 : le registre nommait 15 variables
> pour 31 déclarées — **`OPENAI_API_KEY`, `GEMINI_API_KEY` et
> `SEARCH_FINGERPRINT_SALT` étaient absents**, c'est-à-dire deux clés API
> facturables et un poivre cryptographique. Aucune n'avait fuité ; simplement,
> aucune procédure de fuite ne les couvrait, et le §5 ne les nommait pas.
> Un registre qu'aucun instrument ne croise dérive en silence.

### 2.1 — Secrets (Vercel uniquement, valeur toujours vide dans `.env.example`)

| Variable | Ce que sa fuite permet |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ **tout** — voir la note ci-dessous |
| `MONCASH_CLIENT_ID` | encaisser au nom de Zabelie |
| `MONCASH_CLIENT_SECRET` | idem |
| `RELOADLY_CLIENT_ID` | acheter de la recharge sur le compte du projet |
| `RELOADLY_CLIENT_SECRET` | idem |
| `STRIPE_SECRET_KEY` | mouvements de fonds, remboursements |
| `STRIPE_WEBHOOK_SECRET` | forger une confirmation de paiement |
| `RESEND_API_KEY` | envoyer du courriel au nom du domaine |
| `RECONCILE_SECRET` | déclencher la réconciliation à volonté |
| `CRON_SECRET` | déclencher toutes les tâches planifiées |
| `OPENAI_API_KEY` | **facturable** — dépenser sur le compte du projet |
| `GEMINI_API_KEY` | **facturable** — idem |
| `SEARCH_FINGERPRINT_SALT` | ré-identifier les empreintes de recherche |

⚠️ **`SUPABASE_SERVICE_ROLE_KEY` n'est pas un secret parmi d'autres, c'est la
clé de la maison** : elle contourne toute la sécurité RLS — comptes, commandes
et grand livre, en lecture comme en écriture. Serveur uniquement, jamais
préfixée `NEXT_PUBLIC_`. **Deux formes coexistent chez Supabase** et la
confusion est facile : `sb_secret_…` (nouvelle) et `eyJ…` (JWT, ancienne).
Les deux sont également dangereuses ; `tests/secrets-hors-depot.test.ts`
reconnaît les deux. ⚠️ **À ne pas confondre avec `sb_publishable_…`**, qui
remplace la clé *anon* et est **publique par nature** — celle-là a sa place
dans une variable `NEXT_PUBLIC_`.

⚠️ **`SEARCH_FINGERPRINT_SALT` ne se dérive JAMAIS de la clé de service.**
Faire tourner la clé de service ré-anonymiserait tout l'historique de
recherche, ce qui revient à le perdre. C'est un secret indépendant, propre à
l'environnement, 16 caractères minimum.

⚠️ **Fournisseurs de connexion tiers (V-19)** — client ID / client secret
Google, Microsoft (Entra), Facebook, Apple. **Ils ne passent PAS par Vercel** :
ils se posent dans le tableau de bord Supabase (Authentication → Providers),
qui est le seul à les lire. Ils n'ont donc **pas de ligne** dans les tableaux
ci-dessus, qui ne recensent que des variables d'environnement. Vercel ne porte
que la liste publique `NEXT_PUBLIC_AUTH_PROVIDERS` (des noms, aucun secret).
Un client secret Google collé dans Vercel ou dans `.env.local` serait un
secret posé là où rien ne le lit — et là où il finit par fuir.

### 2.2 — Configuration serveur (pas des secrets, mais pas à publier)

Aucune ne donne d'accès si elle est connue. Elles restent hors du navigateur
parce qu'elles décrivent le paramétrage commercial ou opérationnel.

| Variable | Ce qu'elle règle |
|---|---|
| `MONCASH_MODE` | bac à sable ou production |
| `RELOADLY_MODE` | idem, côté recharge |
| `USD_HTG_RATE` | taux figé au checkout ⚠️ paramètre commercial — sa place à terme est une table de config (`CLAUDE.md` règle 3) |
| `EMAIL_FROM` | expéditeur des courriels ⚠️ **inséparable de `RESEND_API_KEY`** : sans elle, tout part dans le bac à sable de Resend |
| `ZELLE_RECIPIENT` | destinataire Zelle, montré à l'acheteur diaspora |
| `ZELLE_RECIPIENT_NAME` | titulaire affiché |
| `OPENAI_MODEL` | nom du modèle |
| `GEMINI_MODEL` | nom du modèle |
| `ZABELIE_TOPUP_FIRSTPARTY_ENABLED` | rouvre la vente de recharge en propre — fermée par V-17 |
| `ZABELIE_DEMO_FIXTURES` | ⛔ **jamais en production** : sert le catalogue de démonstration à de vrais acheteurs |

### 2.3 — Publiques par nature (`NEXT_PUBLIC_`, lisibles dans le navigateur)

Seules les variables **préfixées `NEXT_PUBLIC_`** peuvent être vues par le
navigateur — et donc seules des valeurs publiques par nature en portent le
préfixe. Le test refuse qu'un secret prenne ce préfixe.

| Variable | Contenu |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | l'URL du projet |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé *anon* / `sb_publishable_…`, conçue pour être publique |
| `NEXT_PUBLIC_SITE_URL` | domaine public |
| `NEXT_PUBLIC_AUTH_PROVIDERS` | des noms de fournisseurs, aucun secret |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | canal de contact affiché |
| `NEXT_PUBLIC_WHATSAPP_LINK` | idem |
| `NEXT_PUBLIC_CONTACT_EMAIL` | idem |
| `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM` | redimensionnement d'images |

## 3. Comment le code lit un secret

Toujours `process.env.NOM_DU_SECRET`, côté serveur, au moment de l'usage —
jamais de valeur en dur, jamais de repli codé (« si la clé manque, utiliser
telle valeur »). Si un secret manque, le module concerné **échoue clairement**
ou la fonctionnalité **se masque** (ex. rails de paiement non configurés =
invisibles au checkout).

## 4. Garde-fous déjà en place (vérifiés à l'audit)

- `.gitignore` couvre `.env` et `.env*.local` ; l'historique Git a été vérifié :
  **aucun `.env` n'a jamais été commité**.
- **`tests/secrets-hors-depot.test.ts` — le scan n'est plus un audit, c'est un
  test qui casse la CI.** Il balaie tous les fichiers **suivis par Git** et
  reconnaît onze familles de clés : Supabase secrète (`sb_secret_`), Stripe
  (live, test, webhook), GitHub, AWS, SendGrid, Brevo, Resend, OpenAI, et les
  JWT signés (`eyJ…`, l'ancienne forme de la clé service_role).
  Éprouvé dans les deux sens : un échantillon synthétique par famille doit
  être détecté, et `SUPABASE_SERVICE_ROLE_KEY=` nu doit passer.
  État au 2026-08-04 : **zéro occurrence**, aucun `.env` suivi, aucun JWT en
  dur.
  ⚠️ Il regarde l'**arbre courant**, pas l'historique Git ni les
  conversations. Une clé committée puis retirée reste dans l'historique et ce
  test se taira — d'où le §5, qui reste la seule vraie réponse.
  ⚠️ Une seule exemption, nominative : ce fichier-ci, qui **nomme** les motifs.
  Un quatrième test vérifie qu'il ne porte aucune **valeur**.
- `createAdminClient()` (clé service role) n'apparaît que dans du code
  serveur — jamais dans un composant `"use client"`.
- Le test CI `api-auth-coverage` empêche d'ajouter une route API sans garde.

## 5. Si un secret fuite (procédure)

1. **Révoquer/regénérer immédiatement** la clé chez le fournisseur (Supabase,
   MonCash, Reloadly, Stripe, Resend, **OpenAI, Google AI Studio**) — c'est la
   seule vraie protection ; supprimer un message ou un commit ne suffit jamais.
   ⚠️ `SEARCH_FINGERPRINT_SALT` n'a pas de fournisseur : la « révoquer », c'est
   en tirer une nouvelle — et **l'historique des recherches devient
   irréconciliable avec le nouveau poivre**. C'est le prix, et il se paie
   sciemment.
2. Remplacer la valeur sur Vercel.
3. Redéployer.
4. Consigner l'incident dans `OPS_TODO.md` (date, clé concernée, cause).
