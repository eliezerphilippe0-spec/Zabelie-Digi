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

- `SUPABASE_SERVICE_ROLE_KEY` — ⚠️ le plus critique : contourne toute la
  sécurité RLS. Serveur uniquement, jamais préfixé `NEXT_PUBLIC_`.
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
- Scan de motifs de clés (`sk_live_`, `AKIA…`, `ghp_…`) : **zéro occurrence**
  dans le code.
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
