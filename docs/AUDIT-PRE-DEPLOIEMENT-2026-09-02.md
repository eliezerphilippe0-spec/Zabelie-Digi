# Audit pré-déploiement — 2026-09-02

Lecture seule. Aucun fichier de code modifié, aucune migration appliquée.
Mesures : dépôt à `885f02c` (`main`), base de production `zabelie-digi`
(`ddditxykopuxxqzgkqwy`) en lecture, suite de tests exécutée localement.

⚠️ **Le prompt demandait de comparer avec `docs/29-CHECKLIST-PRODUCTION-READY.md`.
Ce fichier n'existe pas** — `docs/29` est `FACTURATION-VENDEUR`. La checklist
C1–C6 est **`docs/31-CHECKLIST-PRODUCTION.md`**, et `docs/40:55` avait déjà
consigné cette confusion. C'est `docs/31` qui est comparée ici.

---

## Verdict

**NO-GO — 1 BLOQUANT.** Le rail de paiement primaire route les acheteurs réels
vers le bac à sable MonCash ; 7 tentatives par 3 acheteurs distincts ont
échoué entre le 11 et le 22 août, zéro gourde encaissée depuis l'origine.
Tout le reste est corrigible sans arrêter la ligne.

---

## Constats

| # | Sév. | Fichier:ligne | Constat | Correction |
|---|---|---|---|---|
| 1 | **BLOQUANT** | `lib/moncash.ts:80,82` · `app/api/checkout/route.ts` (aucune lecture de `source`) | `MONCASH_MODE` absente → repli **sandbox**, et le checkout crée quand même le paiement. Mesuré en base : 7 paiements `failed`/`moncash_unknown_48h`, `raw.moncash_mode = sandbox` sur ceux qui le portent, **0 en `production`**, 3 `buyer_id` distincts, 0 encaissement réel. Le repli est journalisé depuis `885f02c` mais reste **pris**. | En `NODE_ENV=production`, refuser la création de paiement si `source !== "explicite"` (503 + journal), au lieu de router vers le bac à sable. Puis poser `MONCASH_MODE=production` + identifiants marchands et redéployer. |
| 2 | MAJEUR | `supabase/migrations/0091_registre_0089_0090.sql` vs `zabelie_schema_migrations` | **91 fichiers sur disque, 90 lignes au registre.** `0091` est dans le journal Supabase (1 ligne) et a inscrit `0089`/`0090`, mais **n'a aucune ligne pour elle-même** — le motif exact de `0067` (`CLAUDE.md` : « un registre qui se déclare complet doit être croisé avec le disque »). | Migration `0092` qui inscrit `0091` (statut `appliquee`, preuve `journal_supabase`, SHA-256 croisé avec `statements`). |
| 3 | MAJEUR | `CLAUDE.md:82` | « dernière écrite : `0086` » — il y en a 91. Un agent qui s'y fie numérote par-dessus `0087`→`0091`. | Remplacer par « `ls supabase/migrations \| tail -1` fait foi ». |
| 4 | ~~MAJEUR~~ **TRANCHÉ** | `lib/i18n-server.ts:8` | Langue par défaut **`"fr"`** sans cookie. Un produit annoncé kreyòl-first sert le français à tout visiteur nouveau — et à tout crawler (`docs/47` §3). | **Décision porteur du 2026-09-02 : `fr` reste à la racine** (« Oui fr »). Consignée dans le code et `docs/02`. Ce qui reste ouvert : la langue dans l'URL, seule voie pour indexer le kreyòl. |
| 5 | MAJEUR | `docs/31` C2.3 · `app/api/admin/coherence/route.ts:199` | **Aucune alerte ne sort du système.** Depuis `885f02c` le chemin d'argent rend un verdict, mais il ne va que dans `console.error` — un journal Vercel que personne n'ouvre. C'est ce qui a coûté 11 jours de silence. | Un canal sortant (e-mail via `zabelie_outbox`, déjà en place) sur `verdict ∈ {bac_a_sable, divergence, indetermine}` et sur `ok: false` du registre. |
| 6 | MAJEUR | Vercel (non mesurable ici) | `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `EMAIL_FROM` : présence en production **inconnue depuis le dépôt**. Sans la 1re, `robots.txt` (prérendu statique) fige l'URL de déploiement ; sans les 2 autres, `zabelie_outbox` se draine dans le vide. | `OPS_TODO` §1–2 : vérifier les trois, redéployer. Verdict lisible sur `/api/admin/email-verify` et `/api/admin/coherence`. |
| 7 | MINEUR | `package.json:10` · `.github/workflows/*.yml` | `next lint` est **mort** sous Next 16 (« Invalid project directory … /lint »). Aucun job CI ne lint. Un `npm run lint` rend une erreur qui se lit comme un échec de lint. | Passer à `eslint .` (config flat) et l'ajouter au job `build`. |
| 8 | MINEUR | `next.config.mjs:34` | CSP réduite à `frame-ancestors 'none'`. Décision documentée (nonce = chantier, `unsafe-inline` = décoratif) — mais pas de `script-src`. | Tel quel jusqu'au chantier CSP ; ne pas poser une CSP qui casse. |
| 9 | MINEUR | `supabase/migrations/0090_messagerie.sql:120` | `zabelie_messages_touch_conversation()` — `security definer`, **exécutable par `anon`** (mesuré via `has_function_privilege`). `0049` révoque ce type de fonction ; `0090` a oublié. Risque faible (`returns trigger`, non invocable via PostgREST). | `revoke all on function … from public, anon, authenticated` dans `0092`. |
| 10 | MINEUR | `supabase/migrations/0008_reviews.sql:15` | `product_reviews.buyer_id` filtré par RLS, **sans index** (seule colonne dans ce cas sur 77 tables). | `create index on product_reviews (buyer_id)`. |
| 11 | MINEUR | `app/api/admin/zones/route.ts:29` | Rend **401** là où les 15 autres routes admin rendent 403 sur le même refus. | 403. |
| 12 | MINEUR | `zabelie_admin_actions.actor_id`, `zabelie_topup_ledger.buyer_id` | Seules colonnes `uuid *_id` de base sans FK (61 avant exclusion des vues, **2** après). Toutes deux défendables : audit et ledger append-only ne doivent pas cascader. | Aucune ; documenter l'intention. |
| 13 | INFO | `supabase/migrations/0042_order_ref.sql:18` | Critère « `create_pending_order` avec `SELECT FOR UPDATE` » : **la fonction n'existe pas**, et c'est écrit. Le verrou est dans `confirm_payment` (`schema.sql:265,431,579,853`), `refund_order` (`:711`), topup (`:1111,1175`). | Critère à reformuler. |
| 14 | INFO | `docs/19` §1 | Critère « payout automatique » : le versement est **manuel par décision** (apurement, `0032`/`0034`). Non tenu, volontairement. | Arbitrage porteur, pas un défaut. |
| 15 | INFO | `lib/search-demand.ts:63-65` · `docs/41:157` | `SEARCH_FINGERPRINT_SALT` : `docs/41` la dit absente. La purge est **câblée** (`vercel.json` + `tests/crons-appelants`) mais son **exécution** n'est lisible que dans Vercel. 1 ligne existe en base (2026-08-14) — collecte au moins ponctuelle. | Poser la variable **après** avoir lu une ligne `[search/purge]` dans les journaux. |

---

## Vérifié conforme — ne pas retoucher

**Sécurité**
- Aucun secret en dur (`sk_live`, `re_…`, JWT, `service_role`) dans `app/ lib/ components/ scripts/`.
- `SUPABASE_SERVICE_ROLE_KEY` lue uniquement dans `lib/supabase/config.ts:161` ; **aucun fichier `"use client"`** n'importe `createAdminClient`.
- **RLS activée sur 77/77 tables `public`.** 26 tables avec RLS et zéro policy = fermées à tout sauf service-role (config, ledgers, limites, registre) — c'est le fail-closed voulu, pas un oubli.
- **Toutes** les fonctions `security definer` ont `search_path` fixé. 5 exécutables par `anon`, dont 4 publiques par conception (`seller_is_active`, `zabelie_biz_get_invoice_by_token`, `zabelie_boutik_public`, `zabelie_vande_nan_zon`) — la 5e est le #9.
- **16/16 routes `/api/admin`** gardées (`autoriserAdmin` ou `user.role !== "admin"`).
- **8/8 crons** de `vercel.json` ont une route existante et gardée par `CRON_SECRET` (directement ou via `lib/admin-gate.ts`).
- Validation d'entrée manuelle sur les routes publiques lues (`messages:90-94` borne 1–2000 **et** en base ; `panier:33-40` ; `download:17-26`). Pas de zod — pas requis.
- Headers : `frame-ancestors 'none'` + `X-Frame-Options DENY`, HSTS 1 an sans preload (délibéré, domaine non figé), `nosniff`, `Referrer-Policy`, `Permissions-Policy`. **Aucun `Access-Control-Allow-*`** — pas de CORS ouvert.

**Argent**
- Ledger append-only : triggers `zabelie_wallet_ledger_immutable` et `zabelie_topup_ledger_immutable` **présents en production** (mesuré `pg_trigger`).
- Invariant `0033` : Σ écritures = 0 = soldes + en attente. Tient.
- Contrôle du montant : `confirm_payment` (`0038:142`) lève si `p_amount <> amount_htg` ; les 3 appelants passent le montant (`moncash/return:85,119,140`, `reconcile:66`). Une seule source de vérité.
- `redactPayment()` aux **4 sites** d'écriture de charge MonCash : `moncash/return:118,139`, `reconcile:65`, `zabelie-topup/reconcile:53`.
- Commission en table (`0054`, 1000/600 bps), maturation J+7 plancher (`0043:71`), `commission_rate_bps` signature intacte.
- `ZABELIE_TOPUP_FIRSTPARTY_ENABLED` : `false` sauf `=== "true"` (`lib/topup-flag.ts:45`).
- `applied_by` renseigné sur **100 %** des lignes `appliquee` ; SHA-256 sur 100 % ; 0 doublon.

**Qualité — résultats réels**
```
tsc --noEmit        exit 0
npm run build       ✓ Compiled successfully in 21.5s
npm test            836 tests · 836 pass · 0 fail · 0 skipped
sql-tests (CI)      ✅ run 33527005757 (2026-09-01)
npm run lint        ✗ « Invalid project directory » — voir #7
```

**UX**
- 4 langues (`ht/fr/en/es`), `Record<I18nKey,string>` + `tests/i18n-cles-mortes`.
- Script contraste `scripts/zabelie-contrast.mjs` présent.
- États chargement/erreur : `buy-button.tsx` (24 occ.), `rechaj/page.tsx` (5), `vendre/page.tsx` (11).
- Responsive : `viewport` posé, 106 points de rupture `sm:/md:/lg:`.

---

## Comparaison `docs/31` — critères non tenus

| Critère | État | Note |
|---|---|---|
| C1.5 connu-négatif téléchargement | ☐ | un acheteur non payé doit recevoir 403 — non prouvé |
| C1.6 fichier « cours du créole » | 🔒 | attend le vendeur |
| C2.1 Sentry | ☐ | service externe → validation porteur |
| **C2.3 alerte sortante** | **☐** | **= constat #5. L'écart le plus cher du dépôt.** |
| C2.4–2.5 sauvegardes / restauration | ☐ | jamais vérifiées |
| C3.2 tentatives vendeur A → B | ☐ | non testées en CI |
| C4.4.2/.4 rétention KYC | 🔒 | Cabinet Volmar |
| C5 litiges & remboursements | ☐ | chantier neuf, `docs/28` D-10→D-14 |
| C6.1 synonymes · C6.3 onboarding · C6.5 Lighthouse 3G | ☐ | — |

Tenus : C1.1–1.3, C2.6, C3.1, C3.4, C4.3, C4.4.1–.3, C6.1-recherche.

---

## Plan d'action ordonné

| # | Quoi | Réf. | Effort |
|---|---|---|---|
| 1 | **Porteur** : `MONCASH_MODE=production` + identifiants marchands + `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `EMAIL_FROM` dans Vercel, **redéployer**, lire `/api/admin/coherence` | #1, #6 | S |
| 2 | Fail-closed checkout : refuser si `source !== "explicite"` en production | #1 | S |
| 3 | Canal d'alerte sortant sur les verdicts du chemin d'argent et du registre | #5 / C2.3 | M |
| 4 | `0092` : inscrire `0091` au registre + `revoke` sur `zabelie_messages_touch_conversation` + index `product_reviews(buyer_id)` | #2, #9, #10 | S |
| 5 | `CLAUDE.md:82` — retirer le numéro figé | #3 | S |
| 6 | Réparer `lint` et l'ajouter en CI | #7 | S |
| 7 | Arbitrage langue par défaut / langue dans l'URL | #4, `docs/47` §3 | M (technique) — décision porteur |
| 8 | C1.5 connu-négatif, C3.2 A→B en CI | docs/31 | M |
| 9 | Harmoniser `zones` 401→403 | #11 | S |

**Rien de 3 à 9 n'a de valeur tant que 1 n'est pas fait.** Le site est en ligne
depuis des semaines avec un rail qui ne peut pas encaisser ; ce n'est pas un
déploiement à préparer, c'est une panne à lever.

---

## Note de méthode

Deux instruments ont menti pendant cet audit, et les deux ont été rattrapés
par une seconde mesure :

- `npx tsc … | grep -v … ; echo $?` a rendu **exit 1** — c'était le code de
  `grep` (aucune ligne à afficher = succès de `tsc`), pas celui de `tsc`.
  Relancé sans tuyau : exit 0.
- La requête FK a d'abord rendu **61** colonnes sans contrainte — elle
  comptait les **vues**, qui ne peuvent pas en porter. Restreinte aux tables de
  base : **2**, toutes deux voulues.

Un chiffre alarmant issu d'un instrument non éprouvé n'est pas un constat.
