# 38 — Runbook — quoi faire quand ça casse

> **C2.6 de `docs/31`.** Écrit le 2026-08-18, sur faits mesurés — chaque
> affirmation porte son ancre. Ce qui n'a pas été vérifié est marqué
> **NON VÉRIFIÉ**, jamais estimé : un runbook qui invente rassure exactement
> au moment où il ne faut pas.
>
> Principe unique, hérité de l'architecture de paiement : **aucune panne ne
> perd d'argent tant qu'on ne confirme rien à la main.** La confirmation est
> serveur-à-serveur et la réconciliation rattrape tout (`docs/03`, invariants
> a-b-c). Dans le doute, ne rien forcer — attendre coûte des ventes, forcer
> coûte des paiements orphelins.

---

## 0. Où lire les signaux — avant tout diagnostic

| Signal | Où | Ce qu'il dit |
|---|---|---|
| Journaux des crons | Vercel → Runtime Logs, préfixes `[stock/expire]`, `[search/purge]`… | **chaque passage est journalisé, y compris à zéro** — « pas de ligne » = le cron n'a PAS tourné, jamais « rien à faire » |
| Cohérence quotidienne | `/api/admin/coherence`, cron 13:30 UTC | invariant `0033` (Σ ledger = soldes), sonde d'arrondi, intégrité de l'index de recherche, `zabelie_objets_requis` |
| Erreurs serveur | Vercel → Runtime Logs, chercher le `digest` affiché par `app/error.tsx` | l'écran utilisateur ne montre jamais le message ; le journal, oui |
| Authentification | Supabase → Logs → Auth | `/signup`, `/token`, `/verify` — l'absence de trafic est elle-même un diagnostic (cas du 2026-08-04) |
| Journal des migrations | `zabelie_schema_migrations` (82+ lignes) | ce qui est déclaré appliqué ; le catalogue (`to_regclass`) atteste |

Les huit crons (heure UTC) : `reconcile` 12:00 · `fulfillment/sweep` 12:30 ·
`maturation` 13:00 · `admin/coherence` 13:30 · `stock/expire` 13:45 ·
`points/expire` 14:00 · `search/purge` 14:15 · `kyc/purge` 14:45
(`vercel.json`). Tous relançables à la main : `POST` avec
`Authorization: Bearer $RECONCILE_SECRET`.

---

## 1. MonCash ne répond plus

**Symptômes.** Les acheteurs restent sur la page « en attente » (elle
interroge le statut en boucle — BL-132) ; aucun paiement ne se confirme ;
`/api/moncash/return` ou le poll de `/api/reconcile` échoue dans les journaux.

**Ce qui est déjà prévu, sans intervention.**
- Aucun paiement ne se confirme sur le seul retour navigateur — invariant (b),
  donc une panne MonCash ne peut pas produire de fausse confirmation.
- `/api/reconcile` (12:00 UTC, `app/api/reconcile/route.ts`) re-vérifie les
  paiements en attente au retour du service, et
  `zabelie_expire_stale_payment` (`route.ts:55`) expire ce qui n'aboutira
  jamais — le stock réservé se libère (`stock/expire`).

**Gestes.**
1. Confirmer que c'est MonCash et pas nous : les journaux montrent nos appels
   sortants en échec, pas des exceptions internes.
2. Ne **rien** confirmer à la main. Un acheteur qui affirme avoir payé :
   attendre le passage de `reconcile`, ou le déclencher manuellement (POST).
3. Au retour du service : déclencher `reconcile`, puis lire
   `/api/admin/coherence` — zéro orphelin attendu.

**Perte possible : des ventes pendant la panne. Jamais de l'argent.**

## 2. Supabase ne répond plus

**Symptômes.** Le site s'affiche (Vercel vit) mais tout ce qui touche la base
tombe : `app/error.tsx` avec `digest` côté pages, « La connexion a été
perdue » côté formulaires. Distinguer de la panne de configuration (§4) : ici
`status.supabase.com` le dit, et **ça a marché sans déploiement entre-temps**.

**Gestes.**
1. `status.supabase.com` d'abord. Si vert → §4 (configuration), pas ici.
2. Pendant la panne : rien à faire côté code. Les paiements MonCash initiés
   resteront non confirmés — c'est le comportement sûr.
3. Au retour : `reconcile` manuel, puis `coherence` — l'invariant `0033` doit
   être vrai. S'il ne l'est pas : **ne pas corriger en base**, écriture
   compensatoire uniquement (`CLAUDE.md`, registre vendeur).

**⚠️ NON VÉRIFIÉ — et ça borne tout ce runbook** : la configuration des
sauvegardes Supabase (PITR ou quotidienne selon le plan) n'a jamais été lue,
et **aucune restauration n'a jamais été répétée** (C2.4/C2.5 de `docs/31`).
Tant que ces deux cases sont ouvertes, le RPO réel est **inconnu** — pas
« probablement un jour » : inconnu.

## 3. Vercel ne répond plus

**Symptômes.** Le site entier est injoignable. Les données sont intactes —
Supabase est un service distinct.

**Ce qui est déjà prévu.** Les retours MonCash arrivés pendant la panne sont
perdus en tant que requêtes — et c'est **exactement la raison d'être de la
réconciliation** : `reconcile` interroge MonCash sur nos commandes en attente,
il ne dépend pas d'avoir reçu le retour.

**Gestes.** 1. `vercel-status.com`. 2. Au retour, vérifier que les crons ont
reproduit leurs lignes de journal (le silence d'un cron est un signal). 3.
`reconcile` manuel pour rattraper la fenêtre.

## 4. La configuration casse (variable Vercel, clé)

**Le cas vécu deux fois.** 2026-08-04 : `NEXT_PUBLIC_SUPABASE_URL` altérée →
`Failed to fetch` côté client + `digest` côté serveur, zéro trace Supabase,
trois heures de diagnostic. 2026-08-15 : clé fournisseur collée **en double**
→ « invalid header value ».

**Signature.** Formulaire présent mais « La connexion a été perdue » ;
`status.supabase.com` vert ; **un déploiement ou un changement de variable a
eu lieu juste avant** (Vercel → Deployments, l'horodatage tranche).

**Gestes.**
1. Vercel → Environment Variables → la variable suspecte : **effacer, retaper
   à la main** (jamais coller — le `\n` invisible est la cause n°1), sauver.
2. **Redéployer** — les `NEXT_PUBLIC_*` sont figées au build ; modifier sans
   redéployer ne change rien.
3. Si une clé a été exposée au passage : rotation d'abord (`docs/11` §5) —
   supprimer un message ne révoque rien.

**Prévention en cours de fusion** : la garde de configuration (PR #135) fait
échouer le **build** sur valeur invalide — Vercel garde alors la version
précédente et l'incident devient une ligne de journal au lieu d'une panne.

## 5. La clé storage casse à nouveau

**L'historique.** Du premier jour au 2026-08-14, **aucune écriture de
stockage n'avait jamais réussi** — `storage.objects` sous RLS sans policy,
tout passe par la clé de service, et la clé était morte. Le chemin acheteur
étant instrumenté et le chemin vendeur non, l'échec ne remontait nulle part
(`OPS_TODO.md`, reclassement du 2026-08-11).

**Symptômes.** Un vendeur ne peut plus téléverser (couverture ou livrable) ;
les routes `/api/products/asset` échouent dans les journaux ; les lectures
publiques, servies par URL, peuvent continuer un temps.

**Gestes** (procédure éprouvée le 2026-08-14) :
1. Supabase → Settings → API Keys → régénérer la clé de service.
2. Vercel → `SUPABASE_SERVICE_ROLE_KEY`, **Production ET Preview** (deux
   environnements, l'un ne met pas l'autre à jour), retaper, redéployer.
3. **Prouver** : téléverser une image de test et lire le `201` dans les
   journaux Supabase — c'est la preuve du 14 août, pas « ça a l'air bon ».

## 6. RPO / RTO — délibérément vides

| Cible | Valeur | Condition |
|---|---|---|
| RPO (perte de données max) | **à fixer** | après C2.4 : lire la configuration réelle des sauvegardes |
| RTO (durée de retour max) | **à fixer** | après C2.5 : une restauration **répétée**, chronométrée, sur projet jetable |

Écrire un chiffre avant ces deux gestes serait le « 12k+ avis » du runbook :
un nombre que rien ne mesure, à l'endroit exact où on lui fera confiance.
Les deux cases vivent dans `docs/31` (C2.4, C2.5) — gestes porteur, le second
avec l'agent si souhaité.
