# REVUE 2026-07-15 — Team Agents (Dev Front · Dev Back · QA)

> Audit « produit senior, traduit pour la réalité haïtienne » des 5 flux
> prioritaires. **Aucun commit de code, merge ou migration** n'accompagne ce
> rapport : chaque action attend un « go » explicite du porteur, tâche par
> tâche. Règle de langue (verrouillée porteur, 2026-07-15) : **français par
> défaut, créole haïtien en 2e langue via le bouton FR/KR** — cible : parité
> 100 %. Sources : 3 audits parallèles (Front 19 constats · Back 13 · QA 25),
> consolidés et dédupliqués par le Team Lead.

## 1. Résumé exécutif

L'état global est **sain là où ça compte le plus** : les trois pipelines
d'argent (marketplace, recharge, factures Business) tiennent leurs invariants
— prix serveur, confirmation serveur-à-serveur, idempotence en base — vérifiés
preuve par preuve (QA + Back, verdict « zéro régression : OUI » sur le chemin
de paiement lui-même). Le flux `/rechaj` est le meilleur du produit (niveau
topup Wave/M-Pesa).

**3 constats majeurs** :
1. **Réconciliation saturable (C-1, Critique)** — aucun état terminal pour les
   paiements abandonnés + fenêtre de scan `ASC limit 50` : à ~50 checkouts
   abandonnés cumulés, un paiement réellement encaissé peut ne plus jamais être
   réconcilié (violation à terme de l'invariant n°3).
2. **La promesse créole n'est pas tenue sur 3 des 5 flux** — connexion, vente
   et page créateur sont 100 % français en dur (~40 chaînes) ; le bouton KR n'y
   change rien ; `vendre:100` affiche même `published` en anglais brut.
3. **Preuve sociale falsifiable (C-5, Majeur)** — la policy RLS produits laisse
   un vendeur écrire lui-même `sales_count`/`rating_*` via PostgREST ; et la
   **navigation mobile est masquée** sous 768 px (FRONT-16) sur un marché 100 %
   mobile.

**3 quick wins** (effort S, impact immédiat) : `?next=` manquant sur 3
redirections de connexion (perte de commande après re-login) · CTA « Réessayer »
sur l'échec de paiement · column-grants sur `products` (verrouille la preuve
sociale, pattern déjà utilisé en 0015).

## 2. Tableau de bord des cibles

| Axe | Cible | État actuel (baseline) | Projeté après corrections |
|---|---|---|---|
| Poids page (produit, checkout) | ≤ 300 KB premier chargement (hors images) | ~~À confirmer~~ → **MESURÉ 2026-07-18** (build prod local = bundles identiques, transfert gzip) : accueil 286 Ko · catalogue 267 Ko · connexion 260 Ko · rechaj 262 Ko · vendre 262 Ko — **✅ toutes sous la cible** | ✅ Atteint (post BL-116/134) |
| LCP Slow 4G | ≤ 2,5 s | ~~Non mesurable~~ → **MESURÉ 2026-07-18** (Lighthouse mobile, build prod local — CPU sandbox lent, throttling 4×, valeurs majorantes) : catalogue 2,59 s · connexion 2,68 s · rechaj 2,68 s · accueil 2,95 s — **≈ à la cible** (le plancher ~2,6 s uniforme suggère l'overhead sandbox ; re-mesurer sur pagespeed.web.dev quand l'URL prod est joignable) | Confirmé côté vraie prod à l'occasion |
| Lighthouse mobile | Perf ≥ 80 · A11y ≥ 90 | ~~idem~~ → **MESURÉ 2026-07-18** : **A11y 96-100 ✅ partout** (catalogue 96, connexion 98, rechaj 100, accueil 98 — les correctifs BL-112/118/124 ont porté). Perf : catalogue/connexion/rechaj **97 ✅** ; **accueil 70 ⚠️** (TBT 1,25 s : hydratation des 12 sections — 1,4 s de scripts inline + 1,1 s style/layout, amplifié par le CPU sandbox). Piste future : alléger l'hydratation de l'accueil (sections serveur pures) | A11y ✅ atteint ; Perf ✅ sauf accueil (chantier candidat) |
| Friction checkout | Taps documentés | Parcours : page produit → 1 tap « Acheter (MonCash) » (+2 coupon optionnel) → passerelle MonCash (~2-3 étapes externes) → retour auto → page statut. **Mais** : mur de compte e-mail+mdp AVANT achat = 7+ taps réels pour un nouvel acheteur (FRONT-13) ; échec = retour case départ (FRONT-3) | Re-tenter en 1 tap (BL-111) ; achat invité = décision produit (BL-136) |
| Parité FR/HT | 100 % des textes des 5 flux via bouton KR, zéro anglais | **ÉCART MAJEUR** : ~40 chaînes FR en dur (connexion ~11, publish-form ~14, vendre ~8, créateur ~4, + upload-asset, share-buttons, erreurs réseau, cartes produit) + anglais brut à l'écran (`vendre:100` → `published` ; erreurs Supabase brutes) | 100 % (BL-130 + BL-113) |
| Sécurité | Zéro régression (prix serveur, ledger, RLS, S2S) | **✅ CONFORME sur le chemin de paiement** (preuves QA : checkout:101-115, topup:96-104, facture pay:51 ; moncash/return:29 + confirm_payment 0009:44-56 ; api-auth-coverage PASS ; 30+ revoke). 3 écarts périphériques : C-1 réconciliation saturable, C-5 agrégats falsifiables, C-8 payload topup non expurgé (RGPD) | Zéro écart après BL-101/102/115 |
| Design system | Zéro couleur/typo hors `zabelie-theme.css` | 5 flux : conformes. Dette hors flux : geo-map/haiti-map (hex legacy). 7 paires de tokens de base sous seuil de contraste mais **latentes** (les composants utilisent les variantes `*-text`, conformes) | 0 écart (BL-125) |

## 3. Constats par flux

Légende : [FRONT-n]=Dev Front · [C-n]=Dev Back · [QA-x]=QA. Dédupliqué (un
constat trouvé par plusieurs agents n'apparaît qu'une fois, crédité au plus précis).

### 3.1 Checkout / commande MonCash (+ retour, réconciliation)

| Sév. | Où | Constat | Pattern cité → adaptation Haïti | Cible | Effort |
|---|---|---|---|---|---|
| **Critique** | `app/api/reconcile/route.ts:41-47` + `lib/reconcile.ts:44-60` + `moncash/return:35-37` | [C-1] Aucun état terminal pour les paiements abandonnés/échoués → `pending` éternels ; scan `ASC limit 50` sans borne de date → **fenêtre saturée par les cadavres, paiement encaissé au-delà de la 50e position jamais réconcilié** (invariant n°3 violé à terme) + 100 appels MonCash/cron pour rien | Stripe — `checkout.session.expired` (TTL) + état terminal explicite → fonction SQL `expire_stale_payments()` dans le même cron (pending >48 h + MonCash 404 → failed, order → cancelled) | Sécurité (invariant réconciliation) | M |
| **Critique** | `app/api/products/route.ts:120` + `vendre:102-108` + checkout | [FRONT-2] Produit « fichier » publié AVANT l'upload du livrable, checkout ne vérifie pas l'asset → on peut payer un fichier inexistant | Une plateforme de vente directe pour créateurs — fichier exigé avant « Publish » → garder l'upload différé (3G) mais produit en brouillon tant que l'asset manque | 0 commande payée sans livrable | M |
| Majeur | `app/api/checkout/route.ts:139-158` | [C-2] Coupon consommé atomiquement AVANT le contrôle de plafond, l'insert et la session MonCash → tout échec (3G, 502) brûle un usage ; une promo « 20 usages » s'épuise à ~30 % de ventes réelles | Stripe — redemption comptée au paiement réussi → plafond avant consommation ; consommer dans `confirm_payment` | Confiance vendeur | M |
| Majeur | `checkout:254-258` + `topup orders:213-218` + `lib/moncash.ts:56,91` | [C-3] Corps d'erreur MonCash/Reloadly bruts renvoyés à l'acheteur (fuite d'infos d'intégration + message inutilisable FR/KR) | Erreurs typées façon `StripeError.code` (pattern interne `coupon_invalid` existe) → code + message générique localisé, détail loggé serveur | Sécurité (fuite) + friction | S |
| Majeur | `app/paiement/echec/page.tsx:26-33` | [FRONT-3] Après échec : seul CTA « Retour au catalogue », ni « Réessayer » ni lien produit | Stripe Checkout — « Try again » préserve l'intention → CTA « Réessayer » vers la fiche + « vérifiez votre solde MonCash » | Re-tenter en 1 tap (vs 3+) | S |
| Majeur | `app/paiement/en-attente/page.tsx:9-35` | [FRONT-4] Page « en attente » statique sans polling, alors que /rechaj a déjà le statut temps réel | Stripe — la page de retour poll → réutiliser le polling topup, 8-10 s + arrêt ~2 min (data chère) ; S2S reste la seule vérité | 0 acheteur bloqué | M |
| Majeur | `buy-button:107,117` + `zabelie-topup-form:93,99` | [FRONT-5] Erreurs réseau en dur FR — en mode KR, l'écran d'échec (le plus fréquent en 3G) reste français | Une plateforme mondiale de location — erreurs localisées comme le happy path → props labels (pattern coupon) | Parité 100 % chemin d'achat | S |
| Mineur | `checkout:205-217` + `moncash/return:18-33` + `lib/moncash.ts:44-61` | [C-4] (a) order orphelin si insert payment échoue (invisible du réconciliateur) ; (b) `/api/moncash/return` public sans rateLimit → 2 appels MonCash par hit (amplification) ; (c) token OAuth redemandé à chaque appel | Insert order+payment transactionnel ; `rateLimit` (outil existant) ; cache token en mémoire avec marge | Sécurité | S |
| Mineur | `paiement/zelle/[orderId]:69-91` + `rechaj/[orderId]:85-108` | [FRONT-6] Mémo/destinataire Zelle sans bouton « copier » → mémo retapé = écarts de réconciliation | Wise/Coinbase — copier par champ → réutiliser clipboard de share-buttons (repli vieux Android) | 0 mémo mal saisi | S |
| Suggestion | `api/facture/[token]/pay:56` | [QA-S1] Nonce par clic = sessions MonCash multiples ; sur-paiement bloqué en base (0022:301) mais double paiement simultané finit en exception → réconciliation manuelle (surveillance OPS_TODO) | Stripe — idempotency par intention ; ici voulu (versements multiples) | Surveillance | S |

### 3.2 Page produit + page vendeur (`/createur/[id]`)

| Sév. | Où | Constat | Pattern cité → adaptation Haïti | Cible | Effort |
|---|---|---|---|---|---|
| **Majeur (sécurité)** | `0002_rls.sql:31-34` + `0001:47` + `0008:18-20` | [C-5] La policy `FOR ALL` produits laisse le vendeur écrire **toutes** les colonnes de sa ligne via PostgREST : `sales_count`, `rating_sum`, `rating_count` falsifiables en un PATCH → la preuve sociale « invérolable » (0008) est contournable | Column-level grants — pattern DÉJÀ utilisé dans 0015 (profiles) → `revoke update` + `grant update (title, description, category, price_htg, status, …)` | Intégrité preuve sociale | S |
| Majeur | `app/createur/[id]/page.tsx:57-79` + `share-buttons:12-40` | [FRONT-7] Page créateur 100 % hors i18n — la page LA plus partagée sur WhatsApp ignore le bouton KR | Une plateforme africaine de produits numériques — la boutique-lien traduite en priorité → getLang()/t() (mécanique) ; message WhatsApp dans la langue de l'émetteur | Parité pages publiques | S |
| Majeur | `components/product-card.tsx:34-54` | [FRONT-8] « Service », « Fichier », « ventes », « par » en dur dans la carte → catalogue reste FR en mode KR | Un géant mondial du commerce en ligne — badges localisés au composant → props labels injectées par les pages serveur | Parité catalogue | S |
| Majeur | `app/produit/[slug]/page.tsx:82-89` | [FRONT-9] 3 vignettes décoratives (copies du dégradé) = fausse galerie ; aucun produit n'a de vraie cover | Une plateforme de vente directe pour créateurs — une cover réelle, pas de galerie factice → supprimer les vignettes (S) ; dégradé 0 KB gardé en fallback data ; cover uploadée plafonnée ~60 KB (plus tard) | Crédibilité ; poids | S / L |
| Suggestion | `produit/[slug]:50-57` | [FRONT-10] aria-label des étoiles figé FR | Une plateforme mondiale de location — note accessible localisée → t() paramétré | A11y ≥ 90 | S |

### 3.3 Recharge `/rechaj`

**Points forts actés** : double saisie anti-collage, prix serveur, machine
d'états exemplaire (0010:139-198 — transitions whitelistées, rejeu no-op,
ledger par transition), idempotence fournisseur `customIdentifier` = pattern
Stripe. Meilleur flux du produit.

| Sév. | Où | Constat | Pattern cité → adaptation Haïti | Cible | Effort |
|---|---|---|---|---|---|
| Majeur | `moncash/return:88` + `lib/zabelie-topup/reconcile.ts:53` | [C-8] Payload MonCash stocké NON expurgé sur le pipeline topup (n° du payeur persisté), alors que le marketplace applique `redactPayment` ; la purge RGPD (0016) ne cible que `payments` | Minimisation cohérente → réutiliser `redactPayment` (exporté) sur les 2 appels. `beneficiary_phone` du ledger = traçabilité BRH n°6, à NE PAS toucher | Sécurité (RGPD) | S |
| Majeur | `rechaj/[orderId]:39` + `paiement/zelle/[orderId]:32` | [FRONT-11] Redirection `/connexion` SANS `?next=` → après re-login, commande perdue (buy-button:94 fait déjà bien) | Un géant mondial du commerce en ligne — deep-link post-login non négociable sur un flux d'argent → safeNext existant | 0 tap perdu | S |
| Mineur | `moncash/return:96-97` + `fulfill.ts:80-114` | [C-10] Fulfillment synchrone (jusqu'à ~6 s de sleeps) dans le handler de retour → risque timeout serverless, écran blanc 3G ; le réconciliateur retente déjà avec la même clé | « Respond fast, retry async » → 1 tentative inline, le cron fait les suivantes ; la page polle déjà | Friction | S |
| Mineur — **ALERTE BRH** | `topup orders:107-152,114` | [C-9] Plafond journalier calculé sur le jour UTC (bascule à 19-20 h locales Haïti) + contrôle non atomique (TOCTOU borné par le rateLimit) → dépassement léger possible du plafond 25 000/j. **Plafonds = périmètre Circ. 121 : constat signalé, décision porteur requise** | — (arbitrage porteur : fuseau America/Port-au-Prince et/ou contrôle atomique en base) | Conformité | S (fuseau) |

### 3.4 Onboarding vendeur (`/connexion` → `/vendre`)

| Sév. | Où | Constat | Pattern cité → adaptation Haïti | Cible | Effort |
|---|---|---|---|---|---|
| **Critique** | `app/connexion/page.tsx:46-143` | [FRONT-12] (a) 100 % hors i18n, SANS SiteNav ni LangToggle — l'utilisateur KR est basculé FR sans retour, au moment du mot de passe ; (b) erreur Supabase brute « Invalid login credentials » en ANGLAIS ; (c) AUCUN « mot de passe oublié » (0 `resetPasswordForEmail`) → mdp perdu = compte + achat perdus | Stripe Checkout — l'identification garde langue et contexte ; un éditeur de boutiques en ligne — reset dès le jour 1 → i18n + LangToggle + mapping erreurs FR/KR + reset | Parité 100 % ; 0 anglais ; abandon réduit | M |
| Majeur | `components/buy-button.tsx:91-95` | [FRONT-13] Achat exige compte e-mail+mdp préalable — friction n°1 (l'identité naturelle = n° MonCash) | Une plateforme de vente directe pour créateurs — achat invité (l'e-mail sert à livrer, compte après) → décision produit à instruire (modèle d'identité), pas un patch | ≤ 3 taps (vs 7+) | L |
| Majeur | `vendre` + `publish-form` + `upload-asset` | [FRONT-14] Parcours vendeur 100 % hors i18n (~26 chaînes) ; statut technique brut affiché (`vendre:100` → `published` en anglais) | Une plateforme guinéenne de talents — onboarding dans la langue du créateur ; un éditeur de boutiques en ligne — statuts mappés en libellés+badge → t() partout | Parité 100 % ; 0 chaîne technique | M |
| Majeur | `publish-form:65-124` + `connexion:99-123` + `buy-button:140-149` | [QA-A1/A2] 11 champs SANS label ni aria (placeholder seul, disparaît à la saisie) — compromet Lighthouse A11y ; le modèle correct existe (`zabelie-topup-form:139-166`) | Un éditeur de boutiques en ligne — formulaires étiquetés → réplication mécanique du pattern interne | A11y ≥ 90 | M |
| Mineur | `api/products/route.ts:51-58,120` | [C-11] Publication : ni rate limit, ni longueurs max (titre/description), prix 0 accepté (→ CreatePayment 0 HTG = 502 confus) → spam du catalogue possible (se multiplie avec C-6) | Mêmes gardes que les routes d'argent (rateLimit + bornes, pattern serviceIncludes existant) ; prix ≥ 1 | Sécurité + poids | S |
| Mineur | `api/products/asset/route.ts:107-121` | [C-12] Remplacement de livrable : l'ancien objet Storage jamais supprimé (orphelins ≤ 50 Mo) ; pas de rate limit upload. Reste de la route solide (whitelist, taille, propriété) | Supprimer l'ancien chemin best-effort avant insert | Hygiène/coût | S |
| Mineur | `app/auth/callback/route.ts:22-26` | [C-13] Échec d'échange de code ignoré (lien expiré/déjà utilisé — fréquent : préfetch antivirus de messagerie) → l'utilisateur atterrit déconnecté sans message. Bon point : safeNext en place | `if (error) redirect('/connexion?erreur=lien_expire')` | Friction onboarding | S |
| Mineur | `vendre:49-59` | [FRONT-15] « Se connecter » sans `?next=/vendre` → le vendeur motivé atterrit sur l'accueil | Un éditeur de boutiques en ligne — « Start selling » conserve l'intention → 1 ligne | 1 tap login → formulaire | S |

### 3.5 Recherche / catalogue

| Sév. | Où | Constat | Pattern cité → adaptation Haïti | Cible | Effort |
|---|---|---|---|---|---|
| **Critique** | `publish-form:81-86` + `catalogue:15-23` + `lib/products.ts:151-153` | [FRONT-1 + C-7] Catégorie = texte libre à la publication, filtre catalogue = égalité stricte sur 6 puces en dur → « photo »/« Foto »/« Photographie » invisibles : découverte structurellement cassée (les « 56 catégories » du brief n'existent pas) ; catégorie non indexée, non whitelistée serveur | Un éditeur de boutiques en ligne — taxonomie fermée à la saisie → select court 6-8 catégories FR/KR partagé avec le catalogue (S) ; whitelist serveur + normalisation (M) | 100 % des produits atteignables | S / M |
| Majeur | `lib/products.ts:110-111,145-162` | [C-6] Catalogue sans LIMIT (tout le catalogue à chaque rendu, description INTÉGRALE par carte → poids linéaire avec l'offre) ; en cas d'erreur Supabase en PROD, repli silencieux sur les produits de démo (inachetables, panne masquée) | Un géant mondial du commerce en ligne — pagination serveur systématique → limit(60) + blurb tronqué serveur (160 c.) ; repli sample réservé au mode non-configuré | Poids ≤ 300 KB à 1 000 produits | S |
| Suggestion | `lib/products.ts:154-157` + index 0001:50-51 | [C-7b] `ilike %q%` = seq scan (sanitation anti-injection OK — bon point) ; la recherche prod ne couvre pas le nom du créateur (le mode démo si) | pg_trgm GIN sur title + index (status, created_at) ; tsvector inutile à ce volume | Perf recherche | S |
| Suggestion | `catalogue:96-111` | [FRONT-19] Crédit : recherche GET sans JS = bon choix 3G ; ajouter « Voir plus » en GET (0 JS) avec la pagination | Un géant mondial du commerce en ligne — pagination par lien | Poids stable | M |

**Transversal (impacte les 5 flux)**

| Sév. | Où | Constat | Pattern cité → adaptation Haïti | Cible | Effort |
|---|---|---|---|---|---|
| **Critique** | `components/site-nav.tsx:17,39-56` | [FRONT-16] Nav principale MASQUÉE sous 768 px sans hamburger — sur mobile (marché dominant), Catalogue et Recharge inaccessibles depuis le header | Un géant mondial du commerce en ligne — 3-4 destinations vitales persistantes → liens visibles/`<details>` 0 KB JS (pas de menu JS lourd) | 5 flux à ≤ 2 taps, +0 KB JS | S/M |
| Majeur | `0001:104-113` (wallet_transactions) | [C-14] Ledger topup protégé par trigger anti-UPDATE/DELETE (0010:94-102) mais `wallet_transactions` n'a PAS ce trigger (le service role peut techniquement réécrire l'historique) | Même standard sur le livre unique → dupliquer le guard de 0010 | Ledger append-only partout | S |
| Mineur | `app/layout.tsx:58` | [FRONT-17/QA] `<html lang="fr">` figé même en mode KR (lecteurs d'écran prononcent le créole en français ; SEO) — `getLang()` existe déjà | Une plateforme mondiale de location — lang suit la locale → `lang={lang}` (BCP-47 `ht`) | A11y ≥ 90 | S |
| Mineur | `components/lang-toggle.tsx:21,30` | [QA-A3] Boutons FR/KR ≈ 22×18 px (recommandé 44×44) — LE bouton de bascule de langue, sur Android bas de gamme | HIG Apple/Android — cible 44 px → padding élargi, 0 KB | A11y | S |
| Mineur | `geo-map:108-147` + `haiti-map:89,109` | [FRONT-18] Hex en dur hors tokens (vestiges violet/magenta) — hors 5 flux (admin), dette tracée | Stripe — dataviz sur les mêmes tokens → var(--color-…) | 0 hex hors tokens | S |
| Mineur | `zabelie-theme.css` (tokens de base) | [QA-A4] 7 paires de tokens de base sous seuil de contraste — LATENT (les composants utilisent les variantes `*-text`, conformes) ; verrouiller l'usage | Stripe — tokens sûrs par défaut → documenter l'interdit ou corriger les bases | 0 usage futur non conforme | S |
| Mineur | `catalogue:17-22` + `zabelie-topup-status:54` | [QA-I1] Puces catégorie non traduites KR ; repli `?? status` peut afficher un statut anglais brut | Un géant mondial du commerce en ligne — facettes localisées (rejoint FRONT-1) | Parité 100 % | S |

## 4. Plan d'action priorisé (impact × effort)

### P0 — Critique / invariants (à faire en premier)
| BL | Constat(s) | Contenu | Effort |
|---|---|---|---|
| BL-101 | C-1 | États terminaux paiements abandonnés (`expire_stale_payments`, pending >48 h + 404 → failed) + borne de date sur le scan du réconciliateur | M |
| BL-102 | C-5 | Column-grants sur `products` (le vendeur ne peut plus écrire `sales_count`/`rating_*`) — pattern 0015 | S |
| BL-103 | FRONT-2 | Produit « fichier » reste en brouillon tant que l'asset n'est pas uploadé (+ badge « incomplet ») | M |
| BL-104 | FRONT-16 | Nav mobile : exposer Catalogue + Recharge sous 768 px (liens 0 KB JS) | S |
| BL-105 | FRONT-1 | Select de catégorie partagé publication↔catalogue (constante commune FR/KR) | S |

### P1 — Quick wins S (une passe groupée possible)
| BL | Constat(s) | Contenu |
|---|---|---|
| BL-110 | FRONT-11/15 | `?next=` sur rechaj/[orderId], zelle/[orderId], vendre (3 lignes) |
| BL-111 | FRONT-3 | CTA « Réessayer le paiement » sur /paiement/echec (slug en query) |
| BL-112 | FRONT-17 | `<html lang={lang}>` |
| BL-113 | FRONT-5 | Erreurs réseau i18n-isées (buy-button, topup-form) |
| BL-114 | C-3 | Erreurs opérateurs typées (code + message localisé, détail loggé) |
| BL-115 | C-8 | `redactPayment` sur le pipeline topup (2 appels) |
| BL-116 | C-6 | `limit(60)` + blurb tronqué serveur + fin du repli démo en prod |
| BL-117 | C-11 | Bornes + rateLimit + prix ≥ 1 sur la publication produit |
| BL-118 | QA-A1/A2 | Labels/aria sur les 11 champs (pattern topup-form) |
| BL-119 | FRONT-9 | Suppression des 3 vignettes fantômes |
| BL-120 | FRONT-6 | Boutons « copier » sur les instructions Zelle |
| BL-121 | C-13 | auth/callback : erreur de lien gérée (`?erreur=lien_expire`) |
| BL-122 | C-4 | rateLimit sur /api/moncash/return + cache token OAuth + insert order+payment transactionnel |
| BL-123 | C-14 | Trigger append-only sur `wallet_transactions` (copie du guard 0010) |
| BL-124 | QA-A3 | Zone tactile 44 px du toggle FR/KR |
| BL-125 | FRONT-18/QA-A4 | Tokens : remap geo-map/haiti-map + verrouillage des paires latentes |

### P2 — Chantiers M/L (chacun = sa PR, ton go individuel)
| BL | Constat(s) | Contenu | Effort |
|---|---|---|---|
| BL-130 | FRONT-7/8/12a/14 + QA | **Parité i18n complète** : connexion, vendre, publish-form, upload-asset, créateur, product-card, share-buttons (~40 chaînes + relecture KR par locuteur natif) | M |
| BL-131 | FRONT-12c | Flux « mot de passe oublié » (resetPasswordForEmail + pages) | M |
| BL-132 | FRONT-4 | Polling léger sur /paiement/en-attente (réutilise le pattern topup) | M |
| BL-133 | C-2 | Coupon consommé au paiement confirmé (plus au checkout) | M |
| BL-134 | C-7/FRONT-19 | Pagination catalogue + recherche par créateur + index trgm/(status,created_at) | M |
| BL-135 | C-10 | Fulfillment topup : 1 tentative inline, retries au cron | S/M |
| BL-136 | FRONT-13 | **Achat invité** (identité = téléphone/e-mail de livraison) — décision produit à instruire AVANT tout code | L |
| BL-137 | C-9 | **ALERTE BRH** — fuseau des plafonds journaliers + atomicité : décision porteur | S |
| BL-138 | C-12 | Suppression du livrable Storage remplacé | S |

## 5. Hors scope & alertes BRH

### Alerte BRH (décision porteur requise, rien n'a été touché)
- **C-9 / BL-137** : le plafond journalier topup (25 000 HTG/j — engagement
  Circ. 121) est calculé sur le jour **UTC** (la journée bascule à 19-20 h,
  heure d'Haïti) et le contrôle lecture-puis-insert n'est pas atomique
  (dépassement léger possible, borné par le rate-limit). Correctifs candidats :
  fuseau `America/Port-au-Prince` et/ou contrainte atomique en base. **Aucune
  modification faite — arbitrage porteur.**
- Escrow/rétention J+7, cashback, tontine : aucun constat n'y touche.

### Hors scope
| ID | Sujet | Raison |
|---|---|---|
| HORS-SCOPE-001 | Zabelie Business (`/pro`, factures) | Hors des 5 flux du mandat (1 exception : QA-S1, surveillance documentée) |
| HORS-SCOPE-002 | « Zabelie Sol » | N'existe pas dans ce projet (prémisse du brief corrigée) |
| HORS-SCOPE-003 | Admin (`/admin`) | Hors mandat (dette tokens geo-map notée en transversal) |
| HORS-SCOPE-004 | Go-live Reloadly (clés Live, solde, marges) | Opérationnel porteur, pas produit |
| HORS-SCOPE-005 | Renommage repo `uniondigitale` → `zabelie-*` | Décision porteur, cosmétique |

### Corrections de prémisses du brief (traçabilité)
NatCash ⛔ inexistant (rails réels : MonCash + diaspora USD) · `create_pending_order`
inexistant (flux réel : `/api/checkout` → `confirm_payment`) · route vendeur réelle
`/createur/[id]` · pas de « 56 catégories » produits (texte libre) · **français par
défaut** (pas « Kreyòl-first ») — arbitré par le porteur le 2026-07-15.
