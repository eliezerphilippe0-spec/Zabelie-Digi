# Zabelie — Politique des secrets (clés API, mots de passe, tokens)

> Règle d'or, sans exception : **AUCUNE clé API, aucun secret, dans le code,
> dans le dépôt Git, ni dans une conversation (chat, e-mail, WhatsApp).**

## 1. Où vont les secrets

| Environnement | Où poser les secrets |
|---|---|
| **Production / Preview** | Vercel → *Settings → Environment Variables* (uniquement) |
| **Local (dev)** | `.env.local` — jamais commité (couvert par `.gitignore`) |
| **Nulle part ailleurs** | Pas dans le code, pas dans un `.md`, pas dans un ticket, pas dans le chat |

## 2. Les secrets du projet (liste de référence)

Tous déclarés dans `.env.example` **avec des valeurs vides** — ce fichier sert
de gabarit, jamais de stockage :

- `SUPABASE_SERVICE_ROLE_KEY` — ⚠️ **le plus critique : contourne toute la
  sécurité RLS.** Ce n'est pas un secret parmi d'autres, c'est la clé de la
  maison : comptes, commandes et grand livre, en lecture comme en écriture.
  Serveur uniquement, jamais préfixé `NEXT_PUBLIC_`.
  **Deux formes coexistent chez Supabase**, et la confusion est facile :
  `sb_secret_…` (nouvelle) et `eyJ…` (JWT, ancienne). Les deux sont
  également dangereuses ; `tests/secrets-hors-depot.test.ts` reconnaît les
  deux.
  ⚠️ **À ne pas confondre avec `sb_publishable_…`**, qui remplace la clé
  *anon* et est **publique par nature** — celle-là a sa place dans une
  variable `NEXT_PUBLIC_`.
- `MONCASH_CLIENT_ID` / `MONCASH_CLIENT_SECRET`
- `RELOADLY_CLIENT_ID` / `RELOADLY_CLIENT_SECRET`
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `RECONCILE_SECRET` / `CRON_SECRET`

Seules les variables **préfixées `NEXT_PUBLIC_`** peuvent être vues par le
navigateur — et donc seules des valeurs **publiques par nature** (URL du site,
clé *anon* Supabase conçue pour être publique) portent ce préfixe.

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
   MonCash, Reloadly, Stripe, Resend) — c'est la seule vraie protection ;
   supprimer un message ou un commit ne suffit jamais.
2. Remplacer la valeur sur Vercel.
3. Redéployer.
4. Consigner l'incident dans `OPS_TODO.md` (date, clé concernée, cause).
