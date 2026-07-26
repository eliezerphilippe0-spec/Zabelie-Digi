# Zabelie — Guide de déploiement

Mise en production de la Vague 1 : **Supabase** (base + storage) → **MonCash**
(rail de paiement) → **Vercel** (hébergement + cron réconciliateur).

> Rappel dépendances bloquantes (`00-CONTEXTE.md §14`) : MonCash ✅ déployable ;
> **NatCash ⛔** et **retraits BRH ⛔** restent différés.

---

## 1. Supabase

1. Créer un projet sur https://supabase.com.
2. Appliquer les migrations **dans l'ordre** (`supabase/migrations/`, **22 fichiers** — `0001`→`0022`) :
   - le plus simple : **SQL Editor** → coller **tout `supabase/schema.sql`** (concaténation à jour) → *Run* ;
   - ou via CLI : `supabase link --project-ref <ref>` puis `supabase db push`.
   > ℹ️ `0021_points_rewards` (programme de fidélité) : **dégelé** par décision porteur (2026-07-11), analyse de risque dans `docs/BRH-question-fidelite.md`.
   > ℹ️ Base **déjà en prod** à mettre à jour (et non installation neuve) : ne
   > pas recoller tout `schema.sql` — suivre `docs/14-MIGRATIONS-SUPABASE.md`
   > (appliquer uniquement les migrations nouvelles, une par une).
3. Vérifier la création du bucket privé **`product-files`** (migration `0004`).
4. Auth → activer l'**e-mail/mot de passe**. Renseigner l'**URL du site** et les
   **Redirect URLs** : `https://<domaine>/auth/callback`.
5. Récupérer dans *Project Settings → API* :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (secret — jamais côté client)
6. **Devenir admin** (après inscription via `/connexion`) — impossible depuis
   l'app (trigger de sécurité `0015`), à faire dans le **SQL Editor** :
   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'ton-email@exemple.com');
   ```
7. **Advisors** : *Database → Advisors* → corriger tout warning de sécurité
   restant (l'audit du code était statique ; la prod peut en révéler d'autres).

### Test d'idempotence (recommandé avant prod)
```bash
psql "$DATABASE_URL" -f supabase/tests/payment_idempotency.test.sql
# Doit afficher : OK — idempotence confirmée …
```

---

## 2. MonCash (sandbox puis production)

1. Compte business MonCash → obtenir `client_id` / `client_secret`.
2. Configurer l'**URL de retour** vers `https://<domaine>/api/moncash/return`.
3. Renseigner :
   - `MONCASH_CLIENT_ID`, `MONCASH_CLIENT_SECRET`
   - `MONCASH_MODE=sandbox` (puis `production` le moment venu)
4. **Test « redirect coupé »** : lancer un paiement sandbox, **couper le réseau
   avant le retour navigateur**, puis vérifier que `/api/reconcile` confirme la
   commande (aucune double livraison, aucun paiement orphelin).

---

## 2 bis. Rails diaspora USD — Stripe & Zelle (optionnels, V-10)

Non configurés = invisibles au checkout (MonCash seul). Pour les activer :

1. **Taux** : `USD_HTG_RATE` (ex. `132`) — obligatoire pour les deux rails.
2. **Zelle** (recommandé en premier — aucun prérequis) : `ZELLE_RECIPIENT`
   (e-mail/téléphone US enrôlé Zelle) + `ZELLE_RECIPIENT_NAME`. Les virements
   arrivent avec un mémo `ZD-XXXXXXXX` ; l'admin confirme depuis le back-office
   (`/admin`, section « Paiements Zelle à confirmer ») **après vérification du
   relevé** (montant exact + mémo).
3. **Stripe** ⚠️ : nécessite un compte Stripe adossé à une **entité US**
   (Haïti non supporté comme pays marchand). `STRIPE_SECRET_KEY` +
   webhook `https://<domaine>/api/stripe/webhook` (événement
   `checkout.session.completed`) → `STRIPE_WEBHOOK_SECRET`.

---

## 3. Vercel

1. Importer le dépôt, brancher **`main`** (le tronc — toutes les PR y fusionnent).
2. **Environment Variables** : recopier tout `.env.example` (clés Supabase,
   MonCash, `NEXT_PUBLIC_SITE_URL=https://<domaine>`, `RECONCILE_SECRET`,
   `CRON_SECRET`).
3. Les crons sont définis dans `vercel.json` en fréquence **quotidienne**
   (compatible plan Hobby — Vercel REJETTE tout le déploiement si un cron
   dépasse la limite du plan). Vercel injecte `Authorization: Bearer
   $CRON_SECRET` sur l'appel GET.
   > 🔧 En production réelle, le réconciliateur doit tourner **toutes les
   > 5 min** : passer au plan **Pro** (et remettre `*/5 * * * *`), ou brancher
   > un cron externe gratuit (ex. cron-job.org) qui appelle
   > `POST /api/reconcile` avec l'en-tête `Authorization: Bearer
   > $RECONCILE_SECRET` toutes les 5 min. Idem `/api/maturation` (1×/h suffit).
4. Déployer. Vérifier `https://<domaine>` puis un achat de bout en bout.

---

## 4. Checklist de mise en prod

- [ ] Migrations `0001→0020` appliquées, bucket `product-files` privé.
- [ ] Test SQL d'idempotence : OK.
- [ ] Variables d'env Supabase (dont `SUPABASE_SERVICE_ROLE_KEY`) sur Vercel.
- [ ] Auth : redirect URL `/auth/callback` configurée côté Supabase.
- [ ] MonCash : identifiants + URL de retour `/api/moncash/return`.
- [ ] `NEXT_PUBLIC_SITE_URL` = domaine de prod.
- [ ] `RECONCILE_SECRET` et `CRON_SECRET` définis ; cron actif.
- [ ] Test « redirect coupé » validé en sandbox.
- [ ] Parcours complet : publier → uploader fichier → acheter → télécharger.
- [ ] `npm run build` + `npm test` verts en CI.

---

## 5. Différé (Vague 2 — bloqué)

- **NatCash** : ajouter `'natcash'` à l'enum `payment_rail` + un client dédié.
- **Retraits BRH** : activer `payouts` selon les règles BRH (KYC, plafonds,
  reporting). Voir `00-CONTEXTE.md §11`.
