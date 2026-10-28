# Rapport de revue — Zabelie — 2026-10-28

**Mode** : CIBLÉ · **Périmètre** : UI d'affiliation (option B, livrée PR #434) + chemin de la première transaction · **Stack** : Next.js (App Router, TS) + Supabase (Postgres/RLS) + Vercel

## Résumé exécutif

La fonctionnalité d'affiliation et le chemin monétaire sont **solides** : aucun
constat Critique ni Élevé. Le money-path (idempotence en base, validation du
montant, ledger append-only, RLS, `SECURITY DEFINER` révoqués et `search_path`
figé, dormance **fail-closed**, attribution figée et immuable, cascade au centime
sans flottant) est bien armé — c'est la partie la plus sensible, et c'est la plus
soignée. Les trois risques à connaître sont **non bloquants** et pour deux d'entre
eux **opérationnels, pas de code** : (1) côté produit, un affilié n'a aujourd'hui
**aucun moyen de voir quels produits offrent une commission** — il partagerait à
l'aveugle (à régler **avant** d'armer le programme) ; (2) MonCash est encore en
**sandbox** ; (3) l'offre test est à **5 HTG**, sous le minimum opérateur. Les
points 2 et 3 sont déjà consignés dans `docs/76` et sont des **zones d'arrêt
porteur**, pas des défauts du code.

## Tableau de bord par axe

| Axe | Posture | Constats (🔴/🟠/🟡/🔵) |
|-----|---------|------------------------|
| Sécurité       | Solide    | 0 / 0 / 0 / 4 |
| UX             | Correcte  | 0 / 0 / 1 / 1 |
| UI             | Correcte  | 0 / 0 / 0 / 1 |
| Responsivité   | Correcte  | 0 / 0 / 0 / 1 |

Aucun Critique, aucun Élevé. 1 Moyen (UX-01), 6 Faibles.

## Constats détaillés

### 🟡 Moyens

#### [UX-01] L'affilié partage à l'aveugle — aucune liste des produits qui offrent une commission
- **Axe** : UX
- **Emplacement** : `components/affiliation-manager.tsx` (section partageur — le lien affiché est `` `${baseUrl}/?ref=${monCode}` ``, un lien d'accueil) ; aucune vue listant les produits portant une ligne `zabelie_affiliate_rates`.
- **Constat** : la face partageur donne un code et un lien générique vers l'accueil, plus un texte « ajoutez `?ref=` à n'importe quelle fiche produit ». Mais l'affilié ne dispose d'**aucune liste des produits qui ont réellement un taux offert** (option B : une vente ne rapporte que si le produit acheté porte une ligne de taux). Il peut donc partager un lien qui ne rapportera jamais, sans le savoir.
- **Impact** : une fois le programme armé, l'affilié ne sait pas quoi promouvoir ; la distribution WhatsApp visée par option B perd son levier. Tant que le programme est **dormant** (503), le constat ne mord pas encore — d'où Moyen et non Élevé.
- **Preuve** : lecture de `components/affiliation-manager.tsx` (face partageur) ; la seule donnée produit passée au composant concerne l'opt-in VENDEUR (`produits` = produits du vendeur courant), pas les produits commissionnés du catalogue.
- **Correctif proposé** : une vue « produits qui rapportent » — lecture publique de `zabelie_affiliate_rates` (déjà `using(true)`) jointe au catalogue publié, avec le lien `?ref=<code>` pré-fabriqué par produit. À livrer **avant** l'armement.
- **Effort** : M

### 🔵 Faibles

#### [SEC-01] `DELETE /api/products/affiliate-rate` ne vérifie pas le compte actif
- **Axe** : Sécurité
- **Emplacement** : `app/api/products/affiliate-rate/route.ts:82` (handler DELETE) vs `:45` (POST appelle `requireActiveAccount`).
- **Constat** : le POST passe par `requireActiveAccount`, le DELETE non — il ne vérifie que la session et la propriété du produit.
- **Impact** : négligeable — un compte suspendu pourrait **retirer** une offre d'affiliation sur son propre produit ; aucun effet sur l'argent ni les données d'autrui (la propriété reste vérifiée). Incohérence de garde plus que faille.
- **Preuve** : comparaison des deux handlers du même fichier.
- **Correctif proposé** : ajouter `requireActiveAccount(user.id)` en tête du DELETE, comme le POST.
- **Effort** : S

#### [SEC-02] Message d'erreur SQL brut renvoyé au client sur dépassement de borne
- **Axe** : Sécurité
- **Emplacement** : `app/api/products/affiliate-rate/route.ts:77` (`error: error.message`, statut 422).
- **Constat** : un taux hors bornes renvoie au client le message exact du trigger (« ZB081: taux … hors bornes [500, 4000] »).
- **Impact** : très faible — l'information divulguée est une **règle métier** (les bornes), pas une structure interne ni une stack trace. Utile à l'UX, même. Noté pour cohérence avec la politique « pas de message interne au client ».
- **Preuve** : lecture du handler POST.
- **Correctif proposé** (optionnel) : mapper vers un libellé i18n (« Le taux doit être entre {min} % et {max} % ») au lieu du message brut. À ne faire que si une politique stricte le demande.
- **Effort** : S

#### [SEC-03] `zabelie_affiliate_rates` en lecture publique (`using (true)`) — par conception
- **Axe** : Sécurité
- **Emplacement** : `supabase/migrations/0081_affiliation.sql:96-97`.
- **Constat** : la policy SELECT autorise tout le monde à lire les taux d'affiliation de tous les produits. Les écritures, elles, passent par la route (service-role) avec contrôle de propriété.
- **Impact** : aucun au sens fuite — un taux de commission par produit est une information **commerciale publique** (un affilié doit la voir pour savoir ce qu'il gagne), pas une donnée personnelle ni un solde. C'est cohérent avec le besoin d'UX-01. Signalé pour que le choix reste **conscient**.
- **Preuve** : lecture de la policy dans 0081.
- **Correctif proposé** : aucun — documenter que c'est voulu. Si un jour un taux doit être privé, restreindre par `auth.uid()` côté vendeur + une vue publique agrégée.
- **Effort** : — (décision, pas code)

#### [SEC-04] `zabelie_order_attribution` : RLS active, aucune policy SELECT — l'affilié ne lit pas ses attributions
- **Axe** : Sécurité
- **Emplacement** : `supabase/migrations/0081_affiliation.sql:119-139` (RLS activée `:127`, triggers d'immuabilité, mais aucune `create policy ... for select`).
- **Constat** : la table est **fail-closed** (default-deny hors service-role) — bon pour la sécurité. Conséquence : un affilié ne peut pas lire ses propres attributions côté client ; ses gains se lisent via le wallet (`wallet_transactions` `affiliate_credit:`), pas via cette table.
- **Impact** : nul en sécurité (c'est le bon sens du fail-closed). Devient une contrainte d'implémentation quand on construira l'écran « mes gains d'affilié » : il faudra une route serveur (service-role) ou une policy `auth.uid() = affiliate_id`.
- **Preuve** : lecture de 0081 (aucune policy SELECT sur la table).
- **Correctif proposé** : au moment de l'écran gains, ajouter une policy SELECT `auth.uid() = affiliate_id` **ou** une route serveur dédiée. Pas avant.
- **Effort** : S (le jour venu)

#### [UX-02] Pas de confirmation explicite après « Offrir » / « Retirer » un taux
- **Axe** : UX
- **Emplacement** : `components/affiliation-manager.tsx` (`ProduitTaux`, fonctions `offrir`/`retirer` → `router.refresh()`).
- **Constat** : le bouton montre « … » pendant la requête (bon), puis la ligne se met à jour après `router.refresh()`. Il n'y a pas de message affirmatif « Taux enregistré ».
- **Impact** : faible — le changement d'état (« Commission : X % ») fait office de retour. Sur une 3G lente, le délai entre le clic et le rafraîchissement peut laisser un bref flou.
- **Preuve** : lecture du composant.
- **Correctif proposé** (optionnel) : un court message de succès inline, ou un état optimiste local avant refresh.
- **Effort** : S

#### [UI-01] `focus:outline-none` sur les champs — focus clavier peu visible (motif repo-wide)
- **Axe** : UI / accessibilité
- **Emplacement** : `components/affiliation-manager.tsx` (inputs, `focus:border-brand/60 focus:outline-none`) — **même motif** que `components/zabelie-coupon-manager.tsx:95` et d'autres champs du dépôt.
- **Constat** : l'outline de focus est retiré, remplacé par un simple changement de couleur de bordure — discret pour la navigation clavier.
- **Impact** : faible, et **non spécifique à ce code** : c'est le motif existant du dépôt. À traiter globalement, pas localement, sinon incohérence.
- **Preuve** : comparaison avec le gestionnaire de codes promo.
- **Correctif proposé** : décision transverse (anneau de focus `focus-visible:ring` sur tous les champs). Hors périmètre de l'affiliation seule.
- **Effort** : S par champ, mais transverse.

#### [RES-01] Ligne de taux dense à 360px
- **Axe** : Responsivité
- **Emplacement** : `components/affiliation-manager.tsx` (`ProduitTaux` : input `w-20` + bouton « Offrir » + bouton « Retirer » dans un `flex`).
- **Constat** : sur un écran de 360px, les trois contrôles côte à côte sont serrés (ils tiennent, le conteneur extérieur est `flex-wrap`, le titre passe au-dessus).
- **Impact** : cosmétique ; pas de débordement mesuré, pas de scroll horizontal.
- **Preuve** : lecture des classes ; calcul de largeur (~230px de contrôles pour ~328px utiles).
- **Correctif proposé** (optionnel) : passer les boutons sous l'input en dessous de `sm:` si on veut plus d'air.
- **Effort** : S

## Ce qui est SOLIDE (à préserver)

Non des constats — des forces vérifiées, à ne pas casser dans un futur refactor :

- **Idempotence** : `idempotency_key = order.id`, un paiement par commande (`app/api/checkout/route.ts:690,704`) ; `confirm_payment` no-op au rejeu (`0081:196-198`).
- **Prix serveur** : `amount_htg` vient de `products.price_htg`, jamais du client (`app/api/checkout/route.ts:74,619`).
- **Validation du montant** : opérateur ≠ commande → rejet + litige (`0081:203-212`).
- **Cascade au centime, sans flottant** : commission affilié = `floor(net * rate_bps / 10000)` sur le NET, au taux **figé à la commande** (`0081:274-282`) ; `affiliate_credit:<order_id>` dans le bloc idempotent du crédit vendeur (`0081:316-338`).
- **Remboursement des deux escrows** : boucle sur chaque escrow, clé d'idempotence portant le wallet (`0081:366-393`).
- **Attribution figée et immuable** : écrite à la création de commande (`checkout:827-839`), `update` interdit par trigger (`0081:129-139`).
- **Dormance fail-closed** : `actif=false` → `attribuerCommande` sort tôt, aucun crédit possible même si des taux/liens existent (`lib/affiliation.ts:57`, `0081:418-420`).
- **`SECURITY DEFINER` maîtrisés** : `confirm_payment`/`refund_order` révoqués de `public/anon/authenticated`, `search_path` figé (`0081:171,344-345,352,410`).
- **Capture `?ref=` validée** : cookie posé seulement sur un code au format strict, `httpOnly`, `sameSite=lax`, `secure` en https (`proxy.ts:108-117`).
- **Bundle client allégé** : le composant client n'embarque pas le dictionnaire i18n (libellés en props) — pertinent en 3G.

## Chemin de la première transaction — posture

Le **code** est prêt (voir « SOLIDE »). Les blocages sont **opérationnels** et
déjà consignés en `docs/76` §0bis — ce ne sont pas des constats de ce rapport,
mais le contexte qui conditionne tout essai :

- 🛑 MonCash en **sandbox** (14/14 paiements échoués, 0 référence opérateur).
- 🛑 Offre test à **5 HTG**, sous le minimum opérateur.

Les deux sont des **zones d'arrêt porteur** (secret/env/montant), pas du ressort
de l'agent.

## Plan d'action priorisé

| Ordre | Constat | Action concrète | Sévérité | Effort |
|-------|---------|-----------------|----------|--------|
| 1 | UX-01 | Construire une vue « produits qui rapportent » (lecture publique `zabelie_affiliate_rates` jointe au catalogue + lien `?ref=<code>` par produit) — **avant** d'armer le programme | 🟡 | M |
| 2 | SEC-01 | Ajouter `requireActiveAccount` en tête du handler DELETE de `affiliate-rate` | 🔵 | S |
| 3 | UX-02 | Message de succès inline après « Offrir »/« Retirer » (ou état optimiste) | 🔵 | S |
| 4 | SEC-02 | Mapper le dépassement de borne vers un libellé i18n au lieu du message SQL brut | 🔵 | S |
| 5 | RES-01 | Empiler les contrôles de taux sous l'input en dessous de `sm:` | 🔵 | S |
| 6 | SEC-04 | (Le jour de l'écran « mes gains ») policy SELECT `auth.uid()=affiliate_id` ou route serveur | 🔵 | S |
| 7 | UI-01 | (Transverse, hors affiliation) anneau de focus visible sur tous les champs | 🔵 | S |
| — | SEC-03 | Décision : acter que la lecture publique des taux est voulue (documenter) | 🔵 | — |

**Par où commencer :** rien n'est urgent côté sécurité (aucun 🔴/🟠). Le seul
constat qui change la valeur du produit est **UX-01**, et il se traite **avant**
l'armement du programme — c'est le complément naturel de la face vendeur déjà
livrée. Les 🔵 SEC-01 / SEC-02 / UX-02 sont des quick wins groupables en une
petite PR. **Premier point de contrôle humain** : aucune opération prod n'est
requise par ce rapport ; l'armement du programme (`config.actif=true`) reste la
décision du porteur, inchangée.

## Suivi des constats

Mis à jour le 2026-10-28, après le rapport. Un constat n'est « traité » que par
un commit qui l'ancre dans un test éprouvé par mutation.

| Constat | État | Où |
|---------|------|----|
| UX-01 | ✅ traité | liste « produits qui rapportent » : `lib/affiliation-catalogue.ts`, `tests/affiliation-catalogue.test.ts`, `docs/37` |
| SEC-01 | ✅ traité | `requireActiveAccount` en tête du DELETE : `tests/affiliation-correctifs-audit.test.ts` |
| SEC-02 | ✅ traité | la route ne renvoie plus le message de la base : code `ZB081` (libellé i18n côté client), 500 générique sinon |
| UX-02 | ✅ traité | « Taux enregistré » / « Offre retirée », jamais annoncé sur un échec |
| SEC-03 | ✅ documenté | lecture publique des taux voulue : policy de `0081` (appliquée le 2026-08-17), dont dépend la liste « produits qui rapportent » (UX-01) |
| SEC-04 | ⏳ le jour venu | policy à ajouter avec l'écran « mes gains » |
| UI-01 | ⏳ transverse | anneau de focus, hors affiliation |
| RES-01 | ⏳ optionnel | ligne de taux à 360 px |

## Annexe — Couverture

- **Vérifié (lu)** : `app/tableau-de-bord/affiliation/page.tsx`, `components/affiliation-manager.tsx`, `app/api/affiliate/route.ts`, `app/api/products/affiliate-rate/route.ts`, `supabase/migrations/0081_affiliation.sql`, `proxy.ts`, `lib/affiliation.ts`, `app/api/checkout/route.ts` (sections attribution + prix + idempotence + gratis), `components/zabelie-coupon-manager.tsx` (comparaison de motif), `app/globals.css` (tokens `code-lisible`/`numeric`). État prod sondé en lecture seule le 2026-10-28 (dormance, bornes, compteurs, solvency).
- **Non vérifié / à confirmer** : ⚠️ comportement runtime réel sur appareil (rendu 360px, focus clavier, 3G) non testé en exécution — jugé sur le code. ⚠️ les policies SELECT de `wallet_transactions` (lecture des gains affilié) hors périmètre, non auditées ici. ⚠️ `e2e` ne couvre pas spécifiquement la page affiliation (non vérifié).
