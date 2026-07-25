# Spécification de build V1 — Zabelie, marketplace de produits physiques

> **Version corrigée du 2026-07-24.** Document autoritaire de ce chantier.
> Corrige la spec initiale sur quatre prémisses inexactes — **l'état du code
> fait foi** (décision porteur) — et intègre les arbitrages rendus.
> En cas de contradiction avec un document antérieur, **ce document prime**,
> sauf sur les invariants du §2 qui priment sur tout.

---

## 0. ⛔ PRÉALABLE BLOQUANT — avis juridique

**Aucun chantier ne démarre, y compris le rebrand, avant réception d'un avis
juridique écrit** sur la qualification de la rétention de fonds actuellement en
production au regard de la Circulaire BRH n°121.

Motif : le §10.1 de la spec initiale traitait la détention des fonds comme une
décision de conception à venir. **C'est en réalité une exposition active** :
l'escrow J+7 (`0006_escrow_maturation.sql`) retient déjà les fonds des vendeurs,
et **aucun mécanisme de retrait n'est implémenté** — les fonds n'ont aucune voie
de sortie.

→ Dossier complet, questions au conseil et options de conformité :
**`docs/17-DOSSIER-BRH-RETENTION.md`**.

Corollaire déjà tranché : le modèle « la plateforme tient le paiement jusqu'à
confirmation de livraison » (TikTok Shop) n'est pas une option à évaluer — il
est **déjà implémenté sans validation**. La question n'est pas de savoir s'il
faut l'adopter, mais s'il faut le corriger.

**Volet points de fidélité — vérifié, réponse acquise** : les points sont
**non convertibles en valeur**. Preuves en `docs/17-BRH…` §3 : aucun pont vers
le portefeuille ou les espèces, conversion possible uniquement en remise
**en pourcentage** (`coupon_type` ne contient qu'une valeur), non achetables,
non transférables, non remboursables, expirants et plafonnés. Le sujet est
soumis au conseil pour confirmation (Q5), mais il n'aggrave pas l'exposition.

---

## 1. CORRECTIONS APPORTÉES À LA SPEC INITIALE

| # | Affirmation initiale | Réalité vérifiée | Conséquence |
|---|---|---|---|
| 1 | « dernière migration appliquée : `0010` » | **31 migrations** (`0001`→`0031`). `0030` appliquée en prod ; **`0031` fusionnée, pas encore appliquée** | La prochaine migration porte le n° **`0032`** |
| 2 | « rails MonCash/**NatCash** existants » | NatCash **n'existe pas** — ⛔ bloqué faute d'API publique. Rails réels : **MonCash**, **Stripe**, **Zelle** | Rien à « rebasculer » pour NatCash ; il reste hors périmètre |
| 3 | « Cashback (PR #12) : reste **gelé** » | **Fusionné le 2026-07-13** ; garde-fous ajoutés le 2026-07-24 (PR #50/#51). En base mais **débranché** | L'instruction devient : ne pas câbler l'attribution ni l'UI — état déjà en vigueur |
| 4 | Chantier E : « construire Stripe » | **Déjà construit** (V-10) : `lib/stripe.ts`, webhook **à signature vérifiée**, triple contrôle du montant | Le chantier E se réduit à : interface `PaymentProvider` + feature flag |

Corrections mineures :
- `docs/API_KEYS_REGISTRY.md` n'existe pas → l'équivalent est **`docs/11-SECRETS.md`**.
- Les numéros de documents `08`, `09`, `10` sont **déjà pris** → les documents
  demandés prennent les numéros **`19`, `20`, `21`**.
- Design system §2.5 : **déjà conforme**, aucun travail (voir `docs/15` §4).

---

## 2. INVARIANTS NON NÉGOCIABLES

*(inchangés, sauf mention)*

### 2.1 Stack
Next.js (App Router) + Supabase/Postgres + Vercel. **Aucun service externe non
listé sans validation explicite.**
→ **Application immédiate** : pas de fournisseur SMS (voir §7.2).

### 2.2 Base de données
Préfixe `zabelie_` · RLS dès la création · aucune fonction `SECURITY DEFINER`
exposée sans garde · ledger append-only protégé par trigger · **migrations
numérotées à partir de `0032`**.

### 2.3 Argent
Tout calcul de prix est **serveur**. Tout paramètre commercial en **table de
config**. Commission **10 % / 6 % Elite**, maturation **J+7** *(sous réserve
du §0)*. Triple vérification du montant. Clé d'idempotence obligatoire.

### 2.4 Conformité BRH — Circulaire 121
Registre comptable, pas instrument de paiement · aucun cash-in, cash-out ou
P2P · **aucune rétention pour compte de tiers sans validation juridique
écrite** → **voir §0 : cette règle est actuellement en défaut.**

### 2.5 Design system
Dégradé `#2b3050` → `#4a2731` → `#17123a` · rampe `#f5934f`/`#f26a21`/`#fdb868`
· Manrope 800 + Inter · source `app/zabelie-theme.css` · WCAG AA 4.5:1.
✅ **Déjà conforme — rien à faire.**

---

## 3. PÉRIMÈTRE

**Dans le périmètre** : rebrand + domaine · modèle produits physiques ·
boutiques `/@handle` · livraison vendeur avec code de confirmation · scoring
vendeur · abstraction paiement + flag Stripe · recherche catalogue.

**Hors périmètre** : Djouba · OZE AJI · paiement à la livraison (COD) ·
tontines · escrow par jalons (PR #15) · câblage du cashback · Zabelie Business.

**Exception d'anticipation unique** : le champ `fulfillment_mode` est créé avec
une seule valeur active (`'seller'`).

---

## 4. CHANTIER A — REBRAND ET DOMAINE

### 4.1 Identité — règle de décision retenue
**On garde le repo qui porte l'infrastructure financière.** Ce repo totalise
ledger append-only, RLS, triple vérification des montants, 34 tests et Stripe
intégré — des mois de travail. Une taxonomie et des fiches produits se refont
en semaines.

→ **Sauf si le projet « Zabelie 1 » compte des vendeurs réels et des
transactions**, ce repo devient **Zabelie**.
⚠️ *Point encore ouvert : le porteur doit confirmer l'état du projet 1.*

**Trois noms circulent** : `uniondigitale` (repo), « Zabelie Digi » (code),
« Zabelie » (cible). **Un seul doit survivre : `Zabelie`.** Le renommage du
dépôt GitHub incombe au porteur.

### 4.2 Ordre imposé
1. **Premier commit du chantier : réécriture de `CLAUDE.md`** — sa règle dure
   n°4 interdit aujourd'hui explicitement ce chantier. Rien ne commence avant.
2. Puis le renommage, dans l'ordre du plan de `docs/15-CHANTIER-A-INVENTAIRE.md` §6.

### 4.3 Règle de renommage
Remplacement de la **chaîne exacte `Zabelie Digi`**, jamais de `Digi` seul :
plusieurs occurrences désignent **Digicel**, l'opérateur partenaire (données du
catalogue de recharge, mentions « MonCash (Digicel) »). Un remplacement global
casserait la production.

### 4.4 Domaine
Aucun domaine n'est codé en dur : tout passe par `NEXT_PUBLIC_SITE_URL`.
La migration est une **opération Vercel + variable d'environnement, sans
modification de code**. Le domaine réellement en service est **à constater dans
Vercel** (l'ancienne mention `zabely.net` provenait d'un contexte périmé).

### 4.5 Critères d'acceptation
- Zéro occurrence de « Zabelie Digi » dans les surfaces utilisateur, **et
  occurrences de « Digicel » inchangées** (test automatisé sur les deux)
- 100 % des URL de l'ancien domaine en 301 **chemin à chemin**
- Lighthouse SEO ≥ 95 (home + fiche produit)

---

## 5. CHANTIER B — MODÈLE PRODUITS PHYSIQUES

Tables `zabelie_` : produit physique (`kind = 'physical'`, poids, dimensions,
fragilité) · variantes (SKU, prix, stock propres) · stock (disponible, réservé,
seuil) · catégories (arbre 3 niveaux, KR/FR/EN).

**Règles** : réservation atomique `SELECT … FOR UPDATE` à la commande (pas à la
livraison) · expiration configurable des réservations non payées (cron) ·
**prix en centimes entiers**.

**Critères** : 50 commandes simultanées sur 1 unité → 1 succès, 49 échecs
propres, 0 survente · réservation expirée re-vendable.

### 5.1 Taxonomie et activation — arbitré
Référence : **`docs/16-TAXONOMIE-CATALOGUE.md`** (16 départements, ~80
catégories, ~330 sous-catégories).

**Principe** : les 16 départements sont **définis en base**, l'activation est
partielle et pilotée par un booléen — ouverture progressive **sans migration**.

**Vague 1 — activée au lancement :**

| Département | Portée activée |
|---|---|
| **Auto & Moto** | **4 sous-catégories seulement** : filtration · freinage · huiles & liquides · batteries & delcos |
| **Électronique** | Téléphones & accessoires |
| **Beauté** | Capillaire & soins |
| **Digital & Services** | Tel quel (existant) |

*Justification du resserrement Auto/Moto* : pièces d'usure et consommables —
achat répété, ambiguïté de compatibilité faible, poids maîtrisé. Carrosserie,
vitrage et suspension sont les pires cas en fitment **et** en logistique : ils
viennent plus tard.

**Vague 2 — définis maintenant, activés ensuite** : énergie solaire &
inverters (panier le plus élevé du marché) · artisanat haïtien (meilleur
argument pour le rail en devise forte).

### 5.2 Compatibilité véhicule — voie retenue
Ni recherche textuelle seule (taux d'erreur de référence élevé, et sans COD
l'acheteur a déjà payé : chaque mauvaise pièce devient un litige), ni base
véhicules type TecDoc (inexistante pour le parc haïtien, hors de proportion).

**Retenu** : champ de compatibilité **structuré et obligatoire** sur l'annonce —
tableau de `{marque, modèle, année_début, année_fin}` saisi par le vendeur —
plus un sélecteur « mon véhicule » côté acheteur qui filtre dessus.

- Aucune base externe. **Liste curée de 30 à 40 combinaisons** couvrant le parc
  réel haïtien : Toyota, Nissan, Hyundai, Suzuki (auto) ; Haojue, Bajaj, Sanya,
  TVS (moto).
- La structure permet d'ajouter un fitment complet plus tard **sans migration
  destructive**.

**Corollaire impératif** : la **politique de retour sur pièces** doit être
écrite **avant** l'ouverture du département, pas après.

---

## 6. CHANTIER C — BOUTIQUES `/@handle`

Format `zabelie.com/@handle`, **en chemin** — décision verrouillée, pas de
sous-domaine vendeur.

Handle unique, immuable après 7 jours, liste noire (`admin`, `support`, `api`,
`rechaj`, `login`…) · page boutique (bannière, logo, catalogue paginé, score de
livraison) · **partage WhatsApp en position primaire** · statistiques vendeur ·
Open Graph par boutique et par produit.

**Critères** : LCP < 2,5 s (Android d'entrée de gamme, 3G) · catalogue lisible
**sans JavaScript** (rendu serveur) · < 200 Ko hors images · `next/image` +
lazy loading.

---

## 7. CHANTIER D — LIVRAISON PAR LE VENDEUR

⚠️ **Dépend directement du §0** : le déclenchement du règlement à la livraison
est précisément le mécanisme sous avis juridique.

### 7.1 Mode de fulfillment
`fulfillment_mode` ∈ `'seller'` | `'platform'`. **Seul `'seller'` est actif** ;
`'platform'` n'a aucune implémentation et n'en aura pas dans ce chantier.

### 7.2 Code de confirmation — **sans SMS** (arbitré)
Il n'existe pas de suivi postal national ; la preuve de livraison est un code.

- Code numérique à 6 chiffres, généré à la confirmation de commande
- **Stocké haché**, jamais en clair
- **Affiché dans l'espace commande de l'acheteur**, avec **partage en un tap
  vers WhatsApp**
- ❌ **Aucun envoi SMS** : supprime une dépendance externe, un coût récurrent
  et une exception au §2.1
- Saisi par le vendeur à la remise · tentatives limitées, verrouillage après
  échecs, journalisation de chaque tentative
- La saisie correcte fait passer la commande en `delivered` *(le déclenchement
  du règlement reste suspendu au §0)*

### 7.3 Machine à états
```
created → payment_pending → paid → seller_accepted
→ in_delivery → delivered → settled
```
Branches d'échec : `cancelled`, `seller_rejected`,
`delivery_failed → refund_pending → refunded`.
Unidirectionnelle, chaque transition journalisée en ledger append-only, toute
transition non prévue rejetée.

### 7.4 Discipline vendeur — en table de config
Acceptation 12 h · livraison intra-ville 48 h · ponctualité ≥ 85 % ·
annulation vendeur ≤ 5 % · suspension automatique sur 20 commandes glissantes.
Grille de frais de port **par zone, fixée par la plateforme** · score de
livraison **public** · mention **« Livré par le vendeur »** visible.

### 7.5 Échec de livraison
Règle à écrire en config **avant la première commande** : qui supporte le coût,
délai de remboursement acheteur, seuil de suspension. **Non fournie à ce jour —
à demander, ne pas inventer.**

---

## 8. CHANTIER E — ABSTRACTION PAIEMENT ET STRIPE

**Périmètre corrigé** : Stripe existe déjà. Ce chantier consiste à :

1. **Extraire l'interface `PaymentProvider`** commune — déjà identifiée comme
   constat SEC-02 dans `docs/REVUE-2026-07-22-rails-paiement.md`. MonCash,
   Stripe et Zelle deviennent trois implémentations.
2. **Ajouter le feature flag** `STRIPE_ENABLED` : aujourd'hui le rail s'affiche
   dès que `STRIPE_SECRET_KEY` est renseignée. Flag **off par défaut**, rail
   totalement invisible quand off.
3. Compléter la gestion des **remboursements et litiges** (chargebacks) :
   réception de l'événement, journalisation, alerte admin.

**Déjà en place, à ne pas refaire** : Payment Intents, capture serveur,
signature de webhook vérifiée, triple contrôle du montant, idempotence, aucune
donnée de carte côté serveur.

**Prérequis non technique bloquant** : Stripe n'accepte pas un marchand
enregistré en Haïti. Le rail suppose une **entité étrangère** *merchant of
record*. À documenter comme bloquant, sans contournement.

**Multi-devise** : référence HTG · taux en table de config avec marge · **taux
figé (snapshot) sur la commande** · vendeur réglé en HTG au taux figé · aucun
taux ni montant accepté du client. *(Déjà implémenté via
`payments.expected_usd_cents`.)*

---

## 9. CHANTIER F — RECHERCHE

Recherche plein texte Postgres, variantes KR/FR/EN (`telefòn`/`téléphone`/
`phone`) · tolérance aux fautes · filtres (catégorie, prix, stock, zone, score
vendeur) · **produits hors stock exclus par défaut** · tri pertinence → score
vendeur → disponibilité.

**Critères** : p95 < 400 ms sur 5 000 produits · index explicites, plan de
requête documenté.

---

## 10. POINTS DE DÉCISION HUMAINE

| # | Sujet | État |
|---|---|---|
| 1 | Détention des fonds | ⛔ **En cours** — dossier `docs/17`, avis juridique attendu |
| 2 | Responsabilité en cas d'échec de livraison (§7.5) | ❓ Non fournie |
| 3 | Structure juridique du rail Stripe (§8) | ❓ Non fournie |
| 4 | **Politique de retours et remboursements** | ❓ Non fournie — **prérequis à l'ouverture du département Auto/Moto** (§5.2) |
| 5 | État du projet « Zabelie 1 » (§4.1) | ❓ À confirmer |

**Aucune de ces décisions n'est codée avant réponse écrite.**

---

## 11. MÉTHODE

**Ordre** : `A → B → C → D → E → F`, un chantier à la fois — **après levée du
§0**.

**Par chantier** : plan → **stop, `go`** → implémentation + tests → migration
rédigée non appliquée → **stop, `go`** → revue de diff → **stop, `go`** →
documentation → merge.

**Conduite** : signaler toute contradiction avec le §2 sans trancher ·
demander plutôt qu'inventer, surtout en matière financière · signaler les
failles rencontrées avec `fichier:ligne` sans les corriger hors chantier ·
ne rien refactorer hors périmètre.

**Documentation à produire** : `19-MARKETPLACE-PHYSIQUE.md` ·
`20-FULFILLMENT-VENDEUR.md` · `21-PAIEMENTS-MULTI-RAILS.md` · mise à jour de
`docs/11-SECRETS.md`.

---

## 12. INTERDITS

Pas de COD · pas de réveil de l'escrow par jalons ni du câblage cashback ·
pas de service tiers non listé (**dont SMS**) · pas de sous-domaine vendeur ·
pas de rail de paiement affiché sans être opérationnel · pas de logistique
plateforme · pas de modification de la structure de commission · **pas de
migration appliquée sans `go`** · ne jamais écrire « Zabely » à la place de
« Zabelie ».
