# Zabelie — Checklist de test sandbox (chemin de l'argent)

But : dérouler un paiement de bout en bout en **sandbox MonCash** et vérifier, à
chaque étape, l'état réel en base. Toutes les requêtes SQL ci-dessous sont en
**lecture seule** (à coller dans le SQL Editor Supabase).

Prérequis : `schema.sql` appliqué, `.env` rempli (`MONCASH_MODE=sandbox`,
`client_id`/`secret`, clés Supabase, `RECONCILE_SECRET`), app déployée ou `npm run dev`.

> En sandbox, utilise un **compte de test MonCash** (jamais ton vrai numéro/argent).

---

## 0. Préparer un compte vendeur + un produit
1. Inscris-toi (`/connexion`), puis publie un produit (`/vendre`) — note son prix.
2. Récupère son `id` :
   ```sql
   select id, slug, title, price_htg, status, seller_id from products
   order by created_at desc limit 5;
   ```

---

## 1. Lancer le checkout → état « pending »
Sur la fiche produit, clique **Payer … avec MonCash**. Tu es redirigé vers MonCash.

Vérifie qu'une commande + un paiement `pending` ont été créés :
```sql
select o.id as order_id, o.status as order_status, o.amount_htg,
       p.status as payment_status, p.idempotency_key, p.raw->'payment_token' as token
from orders o join payments p on p.order_id = o.id
order by o.created_at desc limit 1;
```
✅ Attendu : `order_status = pending`, `payment_status = pending`,
`idempotency_key = order_id`, un `token` présent.

---

## 2. Payer sur MonCash → retour → « confirmed »
Paie avec le compte de test. Au retour, tu atterris sur `/paiement/succes`.

```sql
-- Paiement + commande
select o.status as order_status, p.status as payment_status, p.provider_ref
from orders o join payments p on p.order_id = o.id
order by o.created_at desc limit 1;

-- Escrow + wallet (net en attente) + commission plateforme
select e.status as escrow_status, e.amount_htg as net, e.matures_at
from escrow_entries e order by e.created_at desc limit 1;

select balance_htg as disponible, pending_htg as en_attente
from wallets order by created_at desc limit 1;

select gross_htg, commission_htg, rate_bps
from platform_earnings order by created_at desc limit 1;
```
✅ Attendu : `order=paid`, `payment=confirmed`, `escrow=maturing`,
`pending_htg = net` (brut − commission), `disponible = 0`,
`platform_earnings` = ta commission (10 % standard / 6 % Elite).

---

## 3. Test « redirect coupé » (LE test qui compte pour Haïti)
Refais un achat (étape 1) mais **ferme l'onglet juste après avoir payé**, sans
laisser revenir le navigateur. La commande reste `pending`. Déclenche le
réconciliateur manuellement :
```bash
curl -X POST https://<domaine>/api/reconcile \
  -H "Authorization: Bearer <RECONCILE_SECRET>"
```
✅ Attendu : réponse `{"confirmed":1,...}` et, en base, la commande passe
`paid` / le paiement `confirmed` (mêmes requêtes qu'à l'étape 2). Aucun
paiement orphelin, aucune double livraison.

---

## 4. Livraison (fichier) — accès réservé au payeur
Connecté en tant qu'**acheteur**, va sur `/mes-achats` → **Télécharger**.
✅ Attendu : un lien signé temporaire s'ouvre. Avant paiement, l'accès est
refusé (`/api/download` renvoie 403 si la commande n'est pas `paid`).

---

## 5. Maturation J+7 (pending → disponible)
En prod, le cron horaire `/api/maturation` s'en charge à l'échéance. Pour
**tester tout de suite**, avance l'échéance d'une commande payée puis déclenche
le job :
```sql
-- ⚠️ TEST uniquement : antidater l'échéance
update escrow_entries set matures_at = now() - interval '1 minute'
where order_id = '<ORDER_ID>' and status = 'maturing';
```
```bash
curl -X POST https://<domaine>/api/maturation \
  -H "Authorization: Bearer <RECONCILE_SECRET>"
```
✅ Attendu : `{"matured":1}`, puis `pending_htg = 0`, `balance_htg = net`,
`escrow_status = matured`.

---

## 6. Remboursement avant maturité = aucun solde fantôme
Sur un autre achat encore `maturing` : connecte-toi en **admin**, va sur
`/admin` → section **Commandes** → bouton **Rembourser** sur la commande.
(Équivalent API : `POST /api/admin/refund {"orderId":"…"}` avec session admin.)
✅ Attendu : `escrow=reversed`, `order=refunded`, `pending_htg` réduit du net,
`balance_htg` inchangé. Relancer la maturation ne crédite **rien** (pas de solde
fantôme).

---

## 7. Plafond (refus propre)
Publie un produit à > 25 000 HTG et tente de l'acheter.
✅ Attendu : `/api/checkout` renvoie **422** avec un message clair, **avant**
toute création de commande (rien en base).

---

## Récap des invariants vérifiés
| Étape | Invariant |
|------|-----------|
| 1–2 | Confirmation serveur-à-serveur, commission (net crédité) |
| 3 | Réconciliateur rattrape le redirect coupé, idempotence |
| 4 | Livraison réservée au payeur (URL signée) |
| 5 | Maturation J+7 |
| 6 | Remboursement sans solde fantôme |
| 7 | Plafond par rail |
