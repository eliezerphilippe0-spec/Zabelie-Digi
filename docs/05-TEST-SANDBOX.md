# Zabelie — Checklist de test sandbox (chemin de l'argent)

But : dérouler un paiement de bout en bout en **sandbox MonCash** et vérifier, à
chaque étape, l'état réel en base. Toutes les requêtes SQL ci-dessous sont en
**lecture seule** (à coller dans le SQL Editor Supabase).

Prérequis : `schema.sql` appliqué, `.env` rempli (`MONCASH_MODE=sandbox`,
`client_id`/`secret`, clés Supabase, `RECONCILE_SECRET`), app déployée ou `npm run dev`.

> En sandbox, utilise un **compte de test MonCash** (jamais ton vrai numéro/argent).

---

## ⛔ 0 bis — LE PRÉREQUIS QUE CE DOCUMENT N'AVAIT JAMAIS NOMMÉ

> **Deux faits qui n'en font qu'un, vus des deux côtés, tous deux du
> 2026-08-21 :**
>
> * le porteur rapporte que **toutes ses tentatives de créer un numéro de
>   téléphone de test en bac à sable ont échoué** ;
> * la mesure en base montre **cinq commandes du 11 au 14 août, cinq paiements
>   `failed`**, motif `moncash_unknown_48h` — MonCash répond **404**,
>   `provider_ref` null sur les cinq.
>
> Ce ne sont pas deux problèmes. C'est **le même**, et il a un nom : *il n'y a
> personne pour payer.*

### Ce que ce document faisait de faux

La ligne ci-dessus — « utilise un **compte de test MonCash** » — est une
parenthèse de prudence. Elle dit de ne pas se servir de son vrai numéro. **Elle
ne dit nulle part d'où vient le compte de test, ni qu'il ne s'invente pas.**

Écrite ainsi, elle se lit comme un détail d'hygiène. C'est en réalité **le
premier verrou du document.**

### Jusqu'où le parcours est allé — mesuré, et ce n'est pas « nulle part »

⚠️ **Une première rédaction de cette section affirmait que « pas une des neuf
étapes n'a jamais été franchie ». C'est faux, et la mesure le dit.**

| Étape | État |
|---|---|
| **0–1** (panier, checkout, redirection, `pending` en base) | ✅ **PARCOURUE, cinq fois.** Jeton signé, `api:true`, commande et paiement `pending` créés. L'« ✅ Attendu » de l'étape 1 est une **observation**. |
| **2** (payer, retour, `confirmed`) | ❌ **Jamais atteinte.** Aucun compte ne pouvait honorer un paiement de bac à sable. |
| **3–9** (réconciliation, livrable, maturation, remboursement, garde de taux) | ❌ Jamais atteintes — elles sont en aval de l'étape 2. |

**Conséquence, et c'est le fait le plus lourd du dépôt aujourd'hui :
`confirm_payment` n'a jamais tourné une seule fois en production.** Ni la
commission, ni l'escrow, ni la maturation, ni l'invariant `0033` n'ont jamais
été traversés par une vraie gourde.

Les « ✅ Attendu » des étapes 2 à 9 sont donc des **prédictions**, pas des
observations. C'est le motif que `CLAUDE.md` décrit — *« avant d'instrumenter
un chemin, le parcourir une fois de bout en bout »* — avec une aggravation :
ici le document n'est pas un filet posé à côté du chemin, **il EST le
parcours**, et il s'arrête à la deuxième marche sans le dire.

### Ce qui est libre-service, et ce qui ne l'est pas

⚠️ **Niveau de preuve** : le tableau ci-dessous vient d'extraits de recherche
web, **pas d'une page ouverte** (`WebFetch` est bloqué par la sortie réseau) ni
d'un parcours réel. Il oriente, il n'atteste pas.

| Côté | Ce qu'il faut | Obtenable seul ? |
|---|---|---|
| **MARCHAND** (celui qui encaisse) | `client_id` / `client_secret` de test | **Oui, semble-t-il.** Portail bac à sable : `https://sandbox.moncashbutton.digicelgroup.com/Moncash-business/Login?environment=test` → créer un *business* de test → *View* → *Create ClientRestAPI* |
| **PAYEUR** (le portefeuille qui paie) | un compte MonCash capable de payer en bac à sable | ❌ **Non documenté publiquement.** Deux recherches, aucun numéro de test, aucune procédure. **C'est ce qui a échoué.** |

L'asymétrie est le fait à retenir : **on peut se donner un marchand de test,
on ne peut pas se donner un client de test.** Un paiement a besoin des deux.

### Conséquence, et elle est plus large que ce fichier

Le chemin de l'argent n'a **aucune** voie de preuve ouverte au-delà de
l'étape 1 :

- **en bac à sable** — bloqué ici, faute de payeur ;
- **en réel** — `docs/22`, qui a ses propres préalables.

Tant que l'une des deux ne s'ouvre pas, la moitié aval du rail reste **prouvée
par des tests SQL et par rien d'autre**. Les tests SQL sont bons ; ils
éprouvent la base, jamais l'aller-retour avec MonCash, ni la confirmation
serveur-à-serveur contre le vrai fournisseur, ni ce que le retour navigateur
fait réellement.

> **Ce qui marche, et qui mérite d'être dit** : le réconciliateur a mené les
> cinq paiements à un état terminal, **aucun orphelin**. La moitié qui
> surveille fonctionne. C'est la moitié qui encaisse qui n'a jamais abouti.

### Le geste — et il demande une relance, pas un envoi

La question est **`docs/42` §1, question 6** : comment obtient-on des comptes
de test bac à sable, côté payeur **et** côté bénéficiaire d'un `Transfert` ?

⚠️ **Elle n'est PAS partie avec le courriel.** Le courriel Digicel a été envoyé
le 2026-08-21 avec les questions 1→5 ; la question 6 a été rédigée le même
jour, **après**. Elle attend donc le fil de relance prévu au **2026-09-01**.

**Ne pas renvoyer le courriel entier** : un fournisseur qui reçoit deux fois la
même demande répond une fois de moins. La relance pose la question 6 seule, en
rappelant la référence du premier envoi.

⚠️ **Ne pas contourner en basculant `MONCASH_MODE=production` « juste pour
voir ».** Ce serait un paiement réel, avec de l'argent réel, sur le compte
marchand réel — et un paiement orphelin dans un registre append-only ne se
retire pas, il se compense.

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
