# Zabelie Business — Architecture d'intégration (DESIGN)

> **📋 DOCUMENT DE DESIGN — AUCUN CODE.** À lire et amender avant toute
> implémentation. Même traitement que `docs/10-MISSIONS-PAIEMENT.md`.
>
> **Contexte** : module professionnel greffé sur Zabelie.
> **Stack cible** : Next.js (routes API) + Supabase/Postgres + crons Vercel.
> **Principe directeur** : *capacity-first* — Business n'est pas une app, c'est
> une capacité de plus sur l'infrastructure existante.
> **Non-négociables hérités de Digi** : pricing serveur-only, ledger
> append-only (trigger anti-UPDATE/DELETE), RLS, aucun merge sans « go » de
> Philippe après revue de diff.

---

## 0. Corrections de cadrage (état réel vérifié — 2026-07-13)

Le brief initial reposait sur trois prémisses inexactes, corrigées ici pour ne
pas bâtir sur du faux :

| Prémisse du brief | Réalité vérifiée |
|---|---|
| « PR #14 + PR #15 = deux briques en cours de livraison » | **PR #14 (pages service) est FUSIONNÉE** en production. **PR #15 (escrow par jalons) est un document de design pur — aucun code** (`docs/10-MISSIONS-PAIEMENT.md`), non validé. Il n'existe donc PAS de « moteur de paiement jalonné » réutilisable aujourd'hui. |
| « MonCash / NatCash » comme rails disponibles | **Seul MonCash est en production** (+ Zelle diaspora). **NatCash est ⛔ bloqué** (`CLAUDE.md §2`). Tout ce document lit « MonCash (Zelle diaspora) », jamais NatCash. |
| Références au « problème Sol » | **Aucun concept « Sol » n'existe** dans ce projet (vérifié : absent de `CLAUDE.md` et `docs/`). Mentions retirées. |

**Conséquence sur le ratio « 70 % réutilisé »** : il reste globalement vrai
pour la Vague 1 (auth, ledger, RLS, adaptateur MonCash, notifications sont bien
en place), MAIS la partie « escrow jalonné » comptée comme réutilisable est en
réalité du **design non implémenté** — donc à recompter comme « neuf » si un
jour on l'active. Le MVP sans rétention (§5) évite justement d'en dépendre.

---

## 1. Diagnostic stratégique

**Business n'est pas un greenfield**, mais il s'appuie sur moins d'acquis que
le brief ne le disait. Ce qui est réellement en place et réutilisable :

| Brique existante | Statut réel | Apport à Business |
|---|---|---|
| Pages service (façon Fiverr) — PR #14 | ✅ **fusionnée** | Vitrine du pro : services, prix, description, délai |
| Ledger append-only + escrow J+7 + commission | ✅ **en prod** (money-path Digi) | Le moteur financier ; Business y écrit |
| Adaptateur MonCash derrière interface | ✅ **en prod** | Le rail de paiement |
| Machine à états + webhook idempotent | ✅ **patron `zabelie_topup_*`** | À réutiliser pour l'état des factures |
| Escrow **par jalons** (façon Upwork) — PR #15 | 📄 **design seulement** | Réutilisable *seulement si* implémenté + validé BRH |

Ce qui **manque réellement** pour « Zabelie Business » :

1. **Un répertoire clients propre au professionnel** (son carnet, pas les
   acheteurs anonymes de la marketplace).
2. **La facturation hors-marketplace** — envoyer une facture / un lien de
   paiement à un client qui ne navigue pas sur la marketplace. C'est le cas
   d'usage n°1 des indépendants haïtiens : « je connais mon client, je veux
   juste être payé proprement ».
3. **Plus tard : la prise de rendez-vous** (calendrier + acompte) pour les
   métiers qui en vivent (coachs, salons, consultants).

> **MVP Business = ne recode pas le paiement.** Il enveloppe la page service
> (#14) dans un espace pro cohérent et ajoute la **facture off-marketplace**.

---

## 2. Ce que font les géants — et ce qu'on garde pour Haïti

### HoneyBook — modèle « clientflow »
Chaîne : *demande → devis → contrat e-signé → facture → paiement → projet*,
portail client, relances automatiques, factures récurrentes.
- **À garder** : portail client (voir sa facture et payer sans compte lourd),
  relances automatiques, modèles de facture réutilisables.
- **À jeter au MVP** : contrats e-signés, automatisations conditionnelles, CRM
  à pipeline — trop lourd pour le premier jet.

### Square Appointments + Invoices — modèle « booking-first »
Chaîne : *réservation → acompte pour bloquer le créneau → rappels → facture →
paiement*, répertoire client auto-créé.
- **À garder** : l'**acompte anti no-show** (crucial en culture cash), la
  **création auto du profil client**, le **lien/QR de réservation partageable**.
- **À adapter** : pas de carte enregistrée sur MonCash → l'acompte est un
  **vrai paiement** au moment de la réservation, pas une empreinte de carte.

### Synthèse Zabelie
Colonne vertébrale = **clientflow HoneyBook** (devis → facture → paiement).
Mécanisme anti no-show = **acompte Square** (quand le module rdv arrivera).

---

## 3. Classification des services (taxonomie — la demande « classe bien les services »)

Aujourd'hui, `products.category` est un **texte libre** (`0001_schema.sql`) —
donc incohérent et non filtrable proprement. Business a besoin d'une taxonomie
**fermée et bilingue** (FR défaut / Kreyòl), pensée pour les métiers réels des
indépendants haïtiens, pas des catégories importées d'un SaaS US.

### Catégories de premier niveau proposées

| Slug (stable) | FR | Kreyòl | Exemples de métiers |
|---|---|---|---|
| `creatif-design` | Création & design | Kreyasyon & desen | Graphiste, logo, montage vidéo, photographe |
| `audio-musique` | Audio & musique | Odyo & mizik | Beatmaker, mixage, prod kompa, voix-off |
| `dev-tech` | Développement & tech | Devlopman & teknoloji | Site web, app, dépannage, réseaux |
| `marketing-digital` | Marketing digital | Maketin dijital | Community management, pubs, SEO |
| `redaction-traduction` | Rédaction & traduction | Redaksyon & tradiksyon | Articles, traduction FR/EN/Kreyòl, CV |
| `formation-coaching` | Formation & coaching | Fòmasyon & kotchin | Cours en ligne, mentorat, coaching |
| `beaute-bienetre` | Beauté & bien-être | Bèlte & byennèt | Coiffure, maquillage, ongles, massage *(métiers à rdv)* |
| `evenementiel` | Événementiel | Evènman | Décoration, DJ, traiteur, photo mariage |
| `artisanat-mode` | Artisanat & mode | Atizana & mòd | Couture, bijoux, produits faits main |
| `services-pro` | Services professionnels | Sèvis pwofesyonèl | Comptabilité, juridique, conseil, admin |
| `maison-reparation` | Maison & réparation | Kay & reparasyon | Plomberie, électricité, froid, menuiserie |
| `autre` | Autre | Lòt | Repli — jamais laissé vide |

### Règles de la taxonomie
- **Liste fermée en base** : nouvelle table `zabelie_biz_categories`
  (`slug` PK, `label_fr`, `label_ht`, `sort_order`, `is_bookable_default`,
  `active`) — pas de texte libre. Les migrations *seedent* les 12 ci-dessus.
- **Bilingue** : les libellés viennent de la base, pas de `lib/i18n.ts`
  (données, pas UI) — mais le sélecteur affiche selon la langue active.
- **`is_bookable_default`** : `beaute-bienetre` et `evenementiel` sont les
  familles « à rendez-vous » — ça pré-active le module rdv (Vague 3) sans
  l'imposer.
- **Migration douce du `category` texte libre existant** : un mapping
  `ancienne valeur → slug` dans la migration ; les non-mappés tombent dans
  `autre` (jamais de perte).
- **Sous-catégories** : volontairement PAS au MVP. On valide d'abord que les 12
  familles suffisent avant d'ajouter un 2ᵉ niveau (risque de sur-ingénierie).
- **Un service = une catégorie** (pas de multi-catégorie au MVP — plus simple à
  filtrer, plus clair pour l'acheteur).

---

## 4. Modèle de données

Convention : préfixe `zabelie_biz_*` (aligné sur `zabelie_topup_*`).

```
zabelie_biz_categories       -- taxonomie fermée (cf. §3), seedée par migration
  slug (PK), label_fr, label_ht, sort_order, is_bookable_default, active

zabelie_biz_professionals    -- l'espace pro (1 par user qui active Business)
  id, user_id (FK auth.users), display_name, slug (unique, URL publique),
  bio, avatar_url, default_currency, commission_tier, created_at

zabelie_biz_services         -- prestations (réutilise/étend la page service #14)
  id, professional_id (FK), category_slug (FK zabelie_biz_categories),
  title, description, price_htg, duration_min (nullable),
  is_bookable (bool), is_active, created_at

zabelie_biz_clients          -- répertoire client PROPRE au professionnel
  id, professional_id (FK), name, phone, email (nullable),
  linked_user_id (nullable FK auth.users), notes, created_at
  -- auto-créé à la 1re facture/rdv (façon Square)

zabelie_biz_invoices
  id, professional_id (FK), client_id (FK), status (enum §5),
  currency, subtotal_htg, total_htg,   -- TOUS calculés serveur-side
  due_date, public_token (unique, portail client sans login), created_at

zabelie_biz_invoice_items
  id, invoice_id (FK), label, qty, unit_price_htg, line_total_htg  -- recalculé serveur

zabelie_biz_payments         -- rattachement au ledger existant
  id, invoice_id (FK), ledger_entry_id (FK vers le ledger append-only Digi),
  provider (moncash | zelle), provider_ref, amount_htg, status, paid_at

-- Module rendez-vous (Vague 3 — tables préparées, NON activées au MVP)
zabelie_biz_availability
  id, professional_id, weekday, start_time, end_time, is_blocked
zabelie_biz_appointments
  id, professional_id, client_id, service_id, starts_at, ends_at,
  status (enum), deposit_invoice_id (nullable FK), created_at
```

**Non négociables (hérités du money-path Digi) :**
- `subtotal_htg`, `total_htg`, `line_total_htg` **jamais** acceptés du client :
  recalculés serveur depuis `services.price_htg` × `qty`. (Rappel de la faille
  checkout : totaux fournis par le client = jamais.)
- Tout mouvement d'argent passe par le **ledger append-only existant** via
  `zabelie_biz_payments.ledger_entry_id`. Un seul livre de comptes.
- **RLS** : un pro ne voit que ses `professional_id` ; un client ne voit une
  facture que via son `public_token` (jamais l'ID interne). Toute fonction
  d'écriture = `SECURITY DEFINER` + `search_path` figé + `revoke` du client
  (patron déjà appliqué partout — cf. l'erreur corrigée dans la fidélité).
- `public_token` = accès portail client **sans compte** : opaque, non
  devinable, révocable.

---

## 5. Clientflow — machine à états de la facture

```
DRAFT ─(pro envoie)─► SENT ─(client paie)──────► PAID
  │                    │
  │                    ├─(échéance dépassée)─► OVERDUE ─(paie)─► PAID
  └─(pro annule)─► VOID ◄─(pro annule)──────────┘

  -- variante multi-jalons (SANS rétention au MVP, cf. §6) :
SENT ─(1er versement)─► PARTIALLY_PAID ─(solde)─► PAID
```
- `SENT → PAID` déclenché **uniquement** par le webhook de paiement confirmé
  (MonCash), jamais par le client.
- Webhook **idempotent + anti-rejeu** : dé-duplication sur `provider_ref`
  (patron `zabelie_topup_*` déjà éprouvé).
- `OVERDUE` calculé par un **cron Vercel quotidien** qui scanne les `SENT`
  échues et déclenche la relance (avant / à / après échéance, façon HoneyBook).
  ⚠️ Rappel infra : plan Hobby = crons quotidiens ; cadence fine → cron externe.

---

## 6. Modèle de paiement — compatibilité BRH (le point sensible)

**Ce qui est sûr (à faire) :**
- Un paiement Business = **un client paie un professionnel**. Passerelle, comme
  un achat Digi : l'argent va du client au pro via MonCash. La plateforme
  prélève sa commission (10 % / 6 % Elite, J+7). **Aucune mise en commun,
  aucun P2P interne.**
- L'**acompte** (module rdv) = un **vrai paiement partiel au pro** au moment de
  la réservation, politique de non-remboursement définie par le pro. Ce n'est
  **pas** de l'argent « gardé » par la plateforme entre deux utilisateurs.

**Le piège — l'escrow (rétention) :**
- L'escrow par jalons (PR #15, design) **retient** des fonds entre paiement et
  livraison → **détention de fonds pour compte de tiers** → potentiellement
  soumis à la Circulaire 121, voire à un régime plus lourd.
- **Recommandation senior : MVP SANS rétention.** Le paiement va directement au
  pro (comme un achat Digi). Le « jalon » devient un simple **découpage de
  facturation**, pas une rétention. L'escrow réel n'est activé qu'après **avis
  juridique BRH spécifique** — même prudence que pour la fidélité.

> Le mécanisme de rétention est le **seul** élément de Business qui touche au
> réglementaire. Tout le reste (facture, paiement passerelle, répertoire
> client, rendez-vous) est neutre. On lance sans rétention.

---

## 7. Découpage MVP — 3 vagues

### Vague 1 — « Fè m peye » (Se faire payer) — *le wedge*
Le cas d'usage n°1 : un pro connaît son client et veut être payé proprement.
- Activation de l'espace pro (`professionals` + slug public).
- Création de facture (items, total serveur-side) → **lien de paiement**
  (partageable WhatsApp/SMS).
- Portail client via `public_token` : voir la facture, payer par MonCash.
- Écriture dans le ledger existant + commission.
- Répertoire client auto-créé à la 1re facture.
- Relances automatiques (cron).

> Réutilise l'essentiel de l'infra Digi, mesurable immédiatement (taux de
> factures payées via plateforme), et c'est la douleur la plus universelle
> chez les indépendants haïtiens.

### Vague 2 — Vitrine & services
- Page publique du pro (`/pro/[slug]`) avec catalogue de services **classés par
  la taxonomie du §3**.
- Le client peut commander un service → génère une facture Vague 1.
- Facturation multi-jalons **sans rétention** (découpage only).

### Vague 3 — Rendez-vous (après entretiens utilisateurs)
- Calendrier de disponibilités + réservation en ligne.
- Acompte anti no-show (façon Square).
- Rappels SMS.
- **À ne construire qu'après validation** que les métiers à rdv
  (`beaute-bienetre`, `evenementiel`) sont une cible réelle dans ta base.

---

## 8. Risques & garde-fous

| Risque | Garde-fou |
|---|---|
| Totaux fournis par le client | Recalcul serveur-side systématique |
| Escrow → requalification BRH | MVP **sans rétention** ; escrow après avis juridique |
| Fuite de facture entre pros | RLS sur `professional_id` ; portail client via token opaque |
| Rejeu de webhook | Dé-duplication sur `provider_ref` (patron topup) |
| Catégories incohérentes | Taxonomie **fermée** en base (§3), pas de texte libre |
| Double livre de comptes | Interdit — Business écrit dans le ledger Digi |
| Fonctions RPC exposées au client | `revoke all` systématique (erreur déjà vue en fidélité) |

---

## 9. Prochaine décision

Deux chemins pour démarrer la Vague 1 :
- **A — Scope produit d'abord** : figer l'écran « créer une facture » + le
  portail client (champs, états, parcours).
- **B — Schéma DB d'abord** : migrations `zabelie_biz_*` + policies RLS +
  taxonomie (§3), branchées sur le ledger existant.

**Recommandation : B** — le schéma force les décisions dures (où vit l'argent,
qui voit quoi, quelles catégories) avant toute UI, cohérent avec l'habitude
« documentation-first, checkpoint humain avant prod ».

> ⚠️ **Priorité réelle** : Business est un **nouveau chantier**. Le vrai
> bloquant du lancement reste **Reloadly** (recharge), et deux gros designs
> attendent déjà ta validation (missions #15, et l'activation fidélité). Ne
> pas lancer Business tant que ces fronts ne sont pas clarifiés — sous peine
> d'être « moyen partout » plutôt que très bon sur l'axe digital d'abord.
