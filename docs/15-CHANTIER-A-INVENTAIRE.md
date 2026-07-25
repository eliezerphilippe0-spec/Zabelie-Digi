# Chantier A — Inventaire avant rebrand « Zabelie Digi » → « Zabelie »

> **Statut : PLAN. Aucune modification effectuée.** Conformément à §11 de la
> spec de build V1 : inventaire → stop → attente du `go`.
> Date : 2026-07-24.

---

## 0. ⚠️ Piège n°1 — « Digi » ≠ « Digicel »

**Un `grep -r "Digi"` remonte 79 occurrences, mais une grande partie sont
« Digicel » — l'opérateur télécom réel, partenaire de MonCash et du service de
recharge.** Un remplacement global détruirait la production.

Occurrences à **NE JAMAIS TOUCHER** (nom d'une entreprise tierce) :

| Fichier | Ligne | Contenu |
|---|---|---|
| `supabase/migrations/0010_topup.sql` | 267-271 | `('digicel', 'Rechaj Digicel 25 HTG', …)` — **données du catalogue de recharge**, valeurs d'enum `topup_operator` |
| `app/admin/page.tsx` | 441 | « dénominations et les `operatorId` Digicel/Natcom » |
| `app/rechaj/page.tsx` | 20 | « Recharge téléphonique Digicel/Natcom » |
| `app/confidentialite/page.tsx` | 148 | « **MonCash (Digicel)** » |
| `lib/i18n.ts` | 164 | « téléphone Digicel ou Natcom » |

Ceci confirme la règle déjà inscrite dans `CLAUDE.md` (« Aucun grep-replace
global »). **Le remplacement se fera occurrence par occurrence sur la chaîne
exacte `Zabelie Digi`, jamais sur `Digi` seul.**

---

## 1. Surfaces utilisateur (à renommer) — 36 occurrences

### 1.1 Métadonnées de page (`export const metadata`) — 17 fichiers
Toutes de la forme `"… — Zabelie Digi"` :

`app/admin/page.tsx:21` · `app/admin/geo/page.tsx:14` ·
`app/mot-de-passe-oublie/page.tsx:5` · `app/paiement/succes/page.tsx:6` ·
`app/paiement/echec/page.tsx:6` · `app/paiement/en-attente/page.tsx:8` ·
`app/paiement/zelle/[orderId]/page.tsx:14` · `app/pro/page.tsx:11` ·
`app/tableau-de-bord/page.tsx:16` · `app/rechaj/page.tsx:17` ·
`app/rechaj/[orderId]/page.tsx:16` · `app/confidentialite/page.tsx:5` ·
`app/reinitialiser-mot-de-passe/page.tsx:5` · `app/catalogue/page.tsx:13` ·
`app/facture/[token]/page.tsx:10` · `app/vendre/page.tsx:12` ·
`app/mes-achats/page.tsx:12`

### 1.2 Racine SEO — `app/layout.tsx`
- `:22` `const title = "Zabelie Digi — Produits digitaux & talents haïtiens"`
  → **la baseline elle-même doit changer** (le positionnement devient
  « produits physiques »)
- `:40` `siteName: "Zabelie Digi"`
- `:32-33` `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? …)`

### 1.3 Images Open Graph (rendu dynamique du nom)
- `app/produit/[slug]/opengraph-image.tsx:11,44,59`
- `app/createur/[id]/opengraph-image.tsx:9,29,68,106`

Le mot « Digi » y est un `<span>` séparé, stylé en gris (`MUTED`) — le retirer
change la **composition visuelle** de la carte partagée (WhatsApp). À revoir
graphiquement, pas seulement textuellement.

### 1.4 Composants de marque
- `components/brand-logo.tsx:4,47` — logo `Zabelie <span>Digi</span>`
- `components/site-footer.tsx:66` — copyright
- `components/connexion-form.tsx:90` — logotype de la page de connexion
- `app/facture/[token]/page.tsx:68,151` — en-tête et pied de facture publique

### 1.5 Corps de texte (copy)
- `app/confidentialite/page.tsx:42` — « Zabelie Digi (« nous ») exploite cette
  marketplace de **produits digitaux** » → texte juridique, à réécrire pour le
  physique (⚠️ dépend de la décision §10.4 sur les retours)
- `app/tableau-de-bord/page.tsx:91` — « règlement de Zabelie Digi »

### 1.6 i18n — `lib/i18n.ts` (8 clés)
`:2` (en-tête) · `:72` · `:116` (`product.share` — **texte partagé sur
WhatsApp**) · `:188` · `:209` · `:223` · `:242` (`founder.role`) · `:261`

⚠️ Chaque clé existe en **FR et KR** : parité à maintenir (test `tests/i18n.test.ts`).

### 1.7 E-mails transactionnels — `lib/zabelie-email.ts`
- `:18` expéditeur par défaut `"Zabelie Digi <onboarding@resend.dev>"`
- `:39` signature HTML
- `:42` « Zabelie Digi — makètplas pwodwi dijital ayisyen an. » → **baseline
  Kreyòl à réécrire** (« dijital » devient faux)
- Variable d'env `EMAIL_FROM` : valeur à changer **sur Vercel**, pas dans le code

### 1.8 Divers
- `lib/zelle.ts:26` — nom du bénéficiaire affiché par défaut
- `package.json:5` — description
- `README.md:1` — titre

---

## 2. Documentation interne — 17 occurrences (`docs/`, `CLAUDE.md`, `OPS_TODO.md`)

Non visibles des utilisateurs. **Proposition : les traiter en dernier, dans un
commit séparé**, une fois le nom entériné — pour ne pas polluer le diff des
surfaces utilisateur.

⚠️ `CLAUDE.md` contient la règle qui **interdit** ce chantier (voir §5.1).

---

## 3. Domaine et SEO — excellente nouvelle

**Aucun domaine n'est codé en dur dans le repo.** Recherche de `zabely.net`,
`zabelie.com`, `zabely.com`, `*.vercel.app` : **zéro occurrence** en code.

Tout passe par `NEXT_PUBLIC_SITE_URL` (`app/layout.tsx:32-33`), consommé par
`app/sitemap.ts`, `app/robots.ts` et les balises canonical/OG.

**Conséquence** : la migration de domaine est une opération de **configuration
Vercel + variable d'environnement**, avec **zéro ligne de code à modifier**.

Reste à faire côté plateforme (pas côté repo) :
1. Ajouter `zabelie.com` comme domaine canonique sur Vercel
2. Passer `NEXT_PUBLIC_SITE_URL=https://zabelie.com` (Production)
3. Configurer la redirection 301 **chemin à chemin** de l'ancien domaine
4. `EMAIL_FROM` sur le nouveau domaine (+ vérification DNS chez Resend)

⚠️ **Question ouverte** : la spec mentionne `zabely.net` comme domaine actuel à
rediriger, mais ce domaine **n'apparaît nulle part**. Quel est le domaine
réellement en service aujourd'hui ? Sans la liste des URL vivantes, le critère
d'acceptation « 100 % des URL en 301 » n'est pas vérifiable.

---

## 4. Design system §2.5 — déjà conforme, rien à faire

| Exigence spec | État réel |
|---|---|
| Dégradé `#2b3050` → `#4a2731` → `#17123a` | ✅ `app/zabelie-theme.css:12-14`, à l'identique |
| Rampe orange `#f5934f`/`#f26a21`/`#fdb868` | ✅ `app/zabelie-theme.css:25` et suivantes |
| Manrope 800 + Inter | ✅ `app/globals.css:1-32`, **auto-hébergées** via `next/font` (aucune requête tierce bloquante) |
| Source de vérité `app/zabelie-theme.css` | ✅ |
| Ancienne palette `#080808`/`#FF6B00`/DM Sans | ✅ **zéro trace** dans le repo |

**Aucun travail de design system dans le chantier A.**

> 📎 La capture d'écran fournie (fond noir `#080808`, accent orange vif, marque
> « BLOOP MARKETPLACE ») correspond à l'**ancienne palette déclarée obsolète** —
> ce n'est pas ce repo. Ses **catégories** ont en revanche été reprises comme
> source d'inspiration dans `docs/16-TAXONOMIE-CATALOGUE.md`.

---

## 5. Contradictions spec ↔ réalité du code

> §11 impose de signaler et d'attendre, sans trancher. Les voici, par gravité.

### 5.1 🔴 BLOQUANT — `CLAUDE.md` interdit explicitement ce chantier

`CLAUDE.md`, règle dure n°4 :

> « **Projet totalement indépendant** : Zabelie Digi ne fusionne avec **aucun**
> autre projet (ni Zabelie 1, ni autre) […] Ne jamais réintroduire de couplage. »

et, en tête de fichier :

> « ⚠️ **À ne pas confondre avec Zabelie (projet 1)**, la marketplace de produits
> **physiques**. Ce projet-ci est le **deuxième**, dédié au **digital**. »

La spec V1 demande exactement ce que cette règle interdit : renommer ce projet
en « Zabelie » et le convertir aux **produits physiques** — c'est-à-dire lui
faire absorber la mission du projet 1.

La spec prévoit qu'elle prime sur les documents antérieurs, mais `CLAUDE.md`
est la mémoire permanente du projet : elle sera relue à chaque session future.

**Décision demandée** — trois lectures possibles, je ne choisis pas :
1. **Fusion assumée** : ce repo devient LE Zabelie (physique + digital). →
   `CLAUDE.md` doit être réécrit **en premier**, avant tout renommage.
2. **Le projet 1 est abandonné** et son nom récupéré ici. → même conséquence.
3. **Malentendu** : la spec visait le repo du projet 1. → on arrête ce chantier.

### 5.2 🟠 Numérotation des migrations — la spec est périmée

Spec §2.2 : « dernière appliquée : `0010` ».
Réel : **31 migrations** (`0001` → `0031`). `0030` est appliquée en prod ;
**`0031` est fusionnée mais PAS encore appliquée** (bloc SQL en attente chez
toi). La prochaine migration de ce chantier portera le numéro **`0032`**.

### 5.3 🟠 Cashback / PR #12 — « gelé » est faux

Spec §3 : « Cashback (PR #12) : reste gelé. Ne pas réveiller. »
Réel : PR #12 **dégelée et fusionnée le 2026-07-13** ; les garde-fous
(plafond, expiration) viennent d'être fusionnés **aujourd'hui** (PR #50/#51).

Le système est en base mais **débranché** (aucune attribution, aucune UI).
J'interprète donc l'instruction comme « ne pas câbler l'attribution ni l'UI » —
ce qui est déjà l'état des choses. **Confirme si tu veux autre chose.**

### 5.4 🟠 NatCash n'existe pas

Spec §1 : « le code existant contient déjà : rails de paiement MonCash/NatCash ».
Réel : rails existants = **MonCash** (opérationnel), **Stripe** (construit,
V-10), **Zelle** (semi-manuel). NatCash est ⛔ **bloqué faute d'API** (règle
dure n°2). Un rail NatCash ne peut pas être « rebasculé » sur l'interface
`PaymentProvider` — il n'y a rien à rebasculer.

### 5.5 🟠 Stripe est déjà construit

Spec §8 demande de construire Stripe. Réel : `lib/stripe.ts` +
`app/api/stripe/webhook/route.ts` existent, **avec signature vérifiée** et
triple contrôle du montant (`payments.expected_usd_cents` figé au checkout puis
revérifié en base).

Ce qui manque réellement, et rejoint la spec :
- l'**interface `PaymentProvider`** commune (déjà identifiée comme constat
  SEC-02 de `docs/REVUE-2026-07-22-rails-paiement.md`) ;
- le **feature flag** : aujourd'hui le rail s'affiche dès que `STRIPE_SECRET_KEY`
  est renseignée ; la spec veut un `STRIPE_ENABLED=false` explicite.

### 5.6 🟡 Collision de numéros de documents

Spec §11 demande `docs/08-MARKETPLACE-PHYSIQUE.md`, `09-FULFILLMENT-VENDEUR.md`,
`10-PAIEMENTS-MULTI-RAILS.md`. **`08-INSPIRATION-P1.md`, `09-ROADMAP.md` et
`10-*` existent déjà.** Proposition : utiliser `17`, `18`, `19`. À confirmer.

### 5.7 🟡 `docs/API_KEYS_REGISTRY.md` n'existe pas

L'équivalent réel est **`docs/11-SECRETS.md`** (politique + liste de référence).
Je le mettrai à jour, sauf avis contraire.

### 5.8 🟠 SMS (§7.2) — service tiers non listé

Le code de livraison doit être « envoyé par SMS ». **Aucun fournisseur SMS n'existe
dans le projet** (aucune trace de Twilio ou équivalent). §2.1 interdit
l'introduction d'un service externe non listé sans validation explicite.
→ **Décision requise avant le chantier D** : quel fournisseur, quel budget ?
(Repli possible sans SMS : code affiché dans l'espace commande + e-mail.)

### 5.9 🟡 §10.1 — la question n'est pas hypothétique, le code retient déjà

La spec pose la détention des fonds comme une décision à prendre. **Le code
actuel retient déjà** : `0006_escrow_maturation.sql` crédite le vendeur en
« solde en attente » puis mature à **J+7** (cron `/api/maturation`).

La question BRH est donc **déjà ouverte en production sur le digital**, pas
seulement pour le futur physique. Cela ne change pas la réponse, mais change
l'urgence : ce n'est pas un choix à faire, c'est un existant à valider.

---

## 6. Plan d'exécution proposé (après `go`)

| # | Étape | Fichiers | Risque |
|---|---|---|---|
| 1 | **Trancher §5.1** (identité) + réécrire `CLAUDE.md` | `CLAUDE.md` | 🔴 bloquant |
| 2 | Renommage des **métadonnées** (17 fichiers, chaîne exacte) | `app/**/page.tsx` | Faible |
| 3 | Racine SEO + **nouvelle baseline** (positionnement physique) | `app/layout.tsx` | Moyen (copy) |
| 4 | Composants de marque + **recomposition graphique** des OG | `components/brand-logo.tsx`, `app/**/opengraph-image.tsx` | Moyen (visuel) |
| 5 | i18n FR **et** KR (8 clés, parité testée) | `lib/i18n.ts` | Faible |
| 6 | E-mails + `EMAIL_FROM` (Vercel) | `lib/zabelie-email.ts` | Faible |
| 7 | Copy juridique (confidentialité) | `app/confidentialite/page.tsx` | ⚠️ dépend de §10.4 |
| 8 | Docs internes (commit séparé) | `docs/`, `README.md`, `package.json` | Nul |
| 9 | **Test anti-régression** : grep `Zabelie Digi` = 0 **et** grep `Digicel` = inchangé | `tests/` | — |
| 10 | Domaine : Vercel + 301 (hors repo) | — | ⚠️ liste d'URL manquante |

**Effort estimé** : 1 à 2 sessions, hors décision §5.1.

---

## 7. Ce que j'attends de toi pour démarrer

1. **La décision d'identité (§5.1)** — bloquante, rien ne commence sans elle.
2. Le **domaine réellement en service** aujourd'hui (§3).
3. La **nouvelle baseline** FR + KR (§1.2, §1.7) — ou ton `go` pour que je
   propose 3 options.
4. Confirmation des points 5.3 (cashback), 5.6 (numéros de docs), 5.8 (SMS).
