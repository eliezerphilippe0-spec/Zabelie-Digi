# Cahier des charges — Marketplace Zabelie (v3.2)

> **Nature.** Cahier des charges exécutable. Zabelie existe déjà : toute
> construction **étend l'existant**, jamais ne le réécrit.
>
> **⚠️ CE FICHIER EST L'EXEMPLAIRE GOUVERNANT.** Les versions v2/v3/v3.1 qui
> ont circulé en conversation sont des brouillons historiques. Toute
> révision passe désormais par un **diff de PR**, jamais par un nouveau
> collage — sinon la charte devient elle-même la prochaine source d'écart
> déclaré/déployé. En cas de conflit entre ce document et le dépôt, **le
> dépôt fait foi** et le document est amendé.
>
> **Règle éditoriale du §0** : il ne contient que des invariants **tranchés**.
> Tout point sous arbitrage vit dans sa section et dans le tableau final,
> jamais au présent de l'indicatif dans le §0.
>
> **v3.2 (2026-08-08)** — versionnée au dépôt ; arbitrages **A** et **B**
> tranchés par le porteur et intégrés.

---

## 0. Invariants non négociables

**Stack imposée.** Next.js (App Router) + Supabase/Postgres + Vercel (crons
inclus). Pas de Fastify, pas de Redis, pas de n8n, pas de nouveau framework.
RLS multi-tenant dès la première migration.

**Nommage.** Le projet s'appelle **Zabelie** (jamais « Zabely » dans l'UI ni
le nouveau code). Les tables existantes utilisent le préfixe `zabelie_` ;
toute nouvelle table le poursuit. Aucun renommage global, jamais.

**Conformité BRH — Circulaire 121 (contrainte dure).**
- Ledger financier append-only, protégé par trigger.
- Aucun transfert P2P, aucun cash-in/cash-out.
- **Maturation J+7 obligatoire** avant toute disponibilité de fonds vendeur
  — vivante en production depuis `0006` (`mature_wallets`).
- **Payout : déclenchement automatique à maturité, règlement manuel**
  (arbitrage A tranché — §10). Le déclenchement n'est pas discrétionnaire ;
  c'est ce qui distingue un règlement d'une rétention.
- Tout mécanisme de rétention **au-delà de J+7** : dormant tant que non
  validé par Cabinet Volmar.
- `ZABELIE_TOPUP_FIRSTPARTY_ENABLED = false` : intermédiation pure.

**Discipline de build.**
- Chaque instrument est vérifié sur cas positif connu **et** cas négatif
  connu. Un test qui n'a jamais échoué n'a rien démontré.
- Aucun identifiant personnel dans git ni dans les journaux.
- Le checkpoint humain est la **PR**, jamais le commit.
- Toute logique de quota, de prix et de facturation est **serveur**.
- **Aucune affirmation d'implémentation n'a valeur probante avant d'avoir
  été écrite contre le fichier qui s'exécute** — et les affirmations
  d'**absence** (« X n'existe pas ») ne se vérifient jamais de l'extérieur.

**Ne pas reconstruire ce qui existe déjà :**
- Référence de commande **`ZB-YYMMDD-XXXXX`** (Crockford base32, `0042`,
  contrainte SQL `^ZB-…`). Toute génération en `ZD-` violerait la base.
- Machine à états fulfillment à **cinq états** (`awaiting_shipment →
  shipped → received`, branches `action_required`, `disputed_by_buyer`),
  `0043`. `CANCELLED`/`REFUNDED`/`DISPUTED` sont des statuts de `orders`.
- **Facturation Business** (`0022`, appliquée) : `zabelie_biz_invoices` et
  ses tables sœurs, machine à six états, portail public par token,
  paiement MonCash d'une facture. Sans lien avec `orders` — métier distinct
  de la facturation marketplace (`docs/29`).
- Trigger d'auto-création `profiles` (`0045`), registre de migrations
  SHA-256 (`0041`), taxonomie B1 16/74/33 (`0035`/`0036`, dont 38 modèles
  de véhicules), capteur de demande à trois couches + cron de purge.

**Unité monétaire : la GOURDE ENTIÈRE.** `price_htg`, `amount_htg`,
`total_htg` — jamais de centimes, jamais de flottant. Deux unités dans une
même base est la faute la plus coûteuse du domaine.

---

## 1. Authentification et comptes

Supabase Auth (pas de système maison). Email/mot de passe, vérification,
réinitialisation, rate limiting serveur. Rôles Acheteur/Vendeur/Admin,
extensibles. **RBAC vérifié côté serveur**, matérialisé en RLS + gardes de
server actions ; l'UI n'est jamais une couche de sécurité. Le trigger
`profiles` (`0045`) reste la source de création — l'étendre, pas le dupliquer.

## 2. Onboarding vendeur

Spec : **`docs/23-SYSTEME-VENDEUR.md`**. Chaîne d'états :

```
REGISTERED → KYC_PENDING → KYC_VERIFIED → SELLER_ACTIVE → SUSPENDED → CLOSED
```

Chaîne de payout **indépendante** de la chaîne de compte. `RESTRICTED` et le
Trust Score restent **différés** ; leur réintroduction exige un arbitrage
écrit dans `docs/23`, jamais une reprise silencieuse. Chaque action admin
tracée à l'Audit Log.

## 3. Catalogue multi-vendeurs

Taxonomie B1 existante. Produits physiques (livraison vendeur), numériques,
**et services**.

**✅ Arbitrage B tranché — (i) services CONFIRMÉS, 2026-08-08.** Le kind
`service` reste un chemin de publication de premier rang, et la landing
l'annonce en quatre langues.

⚠️ **Ce que confirmer les services signifie exactement — l'exposition est
acceptée, pas fermée.** `zabelie_open_fulfillment` (`0043`) rend `false`
pour tout ce qui n'est pas `physical` : un service vendu n'a **aucun état de
remise**, son escrow mûrit au chronomètre, le vendeur est payé à J+7 pour une
prestation que rien n'oblige à rendre, et l'acheteur n'a pas d'état où
accrocher un litige.

Ce qui borne ce risque aujourd'hui est **un contrôle humain** : toute fiche
naît en brouillon et n'atteint le catalogue que par une publication manuelle
du porteur. Un contrôle humain a une propriété qu'il faut nommer : **il ne
passe pas à l'échelle et il se dégrade en silence** — le jour où la
publication est déléguée, ou où le volume fait cliquer vite, la protection
disparaît sans qu'aucun test n'échoue.

**✅ CONDITION DE SORTIE POSÉE — 2026-08-13.** Décision déléguée par le
porteur en session (« fait le meilleur choix ») ; valeurs choisies par l'agent
sur le motif `dispute_weekly_ceiling`, amendables par le porteur d'un trait :

* **Déclencheur** — le premier atteint l'emporte : **3 services publiés** au
  catalogue, OU **première délégation de la publication** (le jour où quelqu'un
  d'autre que le porteur publie).
* **Conséquence** — **gel de toute nouvelle publication de service** tant que
  le chantier « qu'est-ce que *rendu* pour une prestation » (SRV-01b,
  `docs/REVUE-KINDS-2026-08-13.md`) n'est pas livré. Les services déjà publiés
  restent en vente : le gel borne l'exposition, il ne casse pas l'existant.
* **Inscription** — ici même et dans `OPS_TODO.md` (registre des décisions),
  le même jour.

Mesure au 2026-08-13 : **1** service publié sur 3 — le seuil laisse de la
marge sans être théorique.

**⏳ Le texte d'origine, conservé parce qu'il explique le seuil :**

**⏳ CE QUI MANQUAIT À CET ARBITRAGE : sa condition de sortie.** (i) n'est
« accepter un risque borné » que si un seuil écrit fait basculer le chantier
« qu'est-ce que *rendu* pour une prestation » de backlog à **bloquant** ;
sans seuil, c'est « reporter indéfiniment », et la différence est invisible
de l'intérieur. Le seuil est une décision **commerciale** — trois valeurs
attendues : le déclencheur (N services publiés, ou première délégation de la
publication — le premier atteint l'emporte), la conséquence (plus aucune
nouvelle publication de service tant que le chantier n'est pas livré), et
l'inscription simultanée ici **et** dans `OPS_TODO`. Motif de référence :
`dispute_weekly_ceiling` (`0043`), un seuil posé pendant que la question est
théorique pour ne pas être renégocié sous pression.

Reste du périmètre : variantes, SKU, prix, stock, images, attributs ; page
« produits interdits » appliquée **à la publication**, pas seulement à
l'affichage ; RLS d'isolation par vendeur ; index et pagination.

## 4. Recherche et découverte

Étendre le capteur de demande (lexical + `pg_trgm` ; couche LLM ultérieure).
Filtres, tris, autocomplétion. L'écran zéro-résultat reste un outil de
recrutement vendeur. Journal de fingerprints **sans `user_id` ni IP** ;
`SEARCH_FINGERPRINT_SALT` n'est posé qu'après qu'une ligne de journal a
confirmé une exécution réelle de la purge.

## 5. Panier multi-vendeurs

Spec : **`docs/27`**. Un panier unique, plusieurs vendeurs. **Calculs
serveur uniquement** — aucun montant du client. Le backend scinde par
vendeur sans complexifier l'expérience acheteur.

## 6. Checkout

`Cart → Address → Delivery → Payment → Confirmation`, mobile-first.

1. **MonCash** — rail principal, triple vérification (montant à la création,
   propriété+montant à la vérification, miroir au webhook).
2. **Zelle** — diaspora, confirmation manuelle admin.
3. **NatCash** — optionnel, derrière la même interface.
4. **Stripe** — l'intégration technique **existe**. Ne pas l'activer
   commercialement ni l'étendre sans entité étrangère *merchant of record*.

Totaux par RPC avec `SELECT FOR UPDATE` ; clés d'idempotence sur toute
opération financière ; webhooks signés ; secrets serveur uniquement ;
**aucun paiement simulé en production**.

## 7. Orders Engine

Commande acheteur + sous-commandes vendeurs. Le cycle de fulfillment est la
**machine à cinq états de `0043`** — l'étendre, jamais créer un second cycle
parallèle. Référence `ZB-YYMMDD-XXXXX`. Toute transition passe par une
fonction serveur validée, jamais un `UPDATE` direct.

## 8. Marketplace Ledger

Le ledger append-only existe : l'étendre. Écritures traçables (paiement,
commission, hold, release, refund, payout, ajustement). **Aucun solde stocké
comme valeur modifiable** — tout solde est reconstructible depuis le ledger.
Chaque écriture référence sa source et sa clé d'idempotence.

## 9. Commissions

**Deux paliers verrouillés au lancement** : standard 10 %, Elite 6 %,
maturation J+7. Taux en table de configuration (`0054`, écrite —
chantier 3). Tous les calculs serveur. **D-4 tranchée : arrondi `floor`**,
l'arrondi va au vendeur.

## 10. Payouts vendeurs

**✅ Arbitrage A tranché — (b), 2026-08-08 : déclenchement automatique à
maturité, règlement manuel.**

```
maturité J+7 → SCHEDULED (cron) → PROCESSING (le porteur verse) → PAID
   branches : FAILED → RETRY (recul borné) · HELD (gel motivé, tracé)
```

Le **déclenchement** cesse d'être discrétionnaire — un vendeur n'a plus à
demander ce qui lui est dû. Le **règlement** reste manuel : aucun rail
sortant n'est prouvé (MonCash B2C — étape 0 de `docs/03` §9 non franchie),
et un règlement manuel borné par le volume est un garde-fou, pas une dette.

`zabelie_request_payout` (`0034`) **n'est pas supprimée** : elle devient le
chemin d'exception, plus le chemin nominal. **Aucun fonds disponible avant
J+7** ; le cron rend exigible, il ne verse pas. Vues vendeur (hold,
disponible, revenus, commissions, remboursements, historique) **dérivées du
ledger**.

## 11–13. Tableaux de bord et back-office

Seller Center (produits, commandes, stock, revenus, payouts, avis, KPI) —
chaque vue vérifiée sur jeu de test **et** sur boutique vide : afficher
zéro, jamais une erreur ni une valeur inventée. Dashboard acheteur, kreyòl
par défaut. Back-office admin : **toute action sensible écrite à l'Audit
Log** (qui, quoi, quand, ancienne valeur, nouvelle valeur).

## 14. Avis et réputation

« Achat vérifié » = contrainte **serveur** liant l'avis à une commande livrée
du même utilisateur. Incontournable côté client.

⚠️ Aucune note affichée sous un seuil minimal d'avis : `★ 5 (1)` est un
faux-précis. Le seuil est un paramètre d'affichage, pas une opinion.

## 15. Notifications

Spec : **`docs/28`**. Lancement : in-app + e-mail transactionnel.
Architecture prête (tables + interface) pour SMS/WhatsApp/push. **Alimentées
par l'outbox**, jamais par des appels directs dans les transactions métier.
**Une seule file** — la généralisation absorbe `zabelie_fulfillment_notices`.

## 16. Internationalisation

**Kreyòl ayisyen d'abord**, puis FR/EN/ES. Aucun texte important en dur.
Devises et formats localisés. Le contenu vendeur reste dans sa langue.

## 17. Sécurité

Aucune fonction `SECURITY DEFINER` exposée à PUBLIC ; `search_path` épinglé.
Aucun paramètre financier contrôlé par le client. Validation et sanitization
serveur, rate limiting, XSS/CSRF/injections. RBAC serveur + RLS. Secrets en
variables d'environnement ; webhooks signés ; clés d'idempotence.

⚠️ **Piège documenté** : une RPC à contrôle `auth.uid()` interne **appelée
via service role** ne vérifie rien — `auth.uid()` y est `NULL`. Les deux
étages n'existent qu'avec le client **session**. L'inventaire des routes à
étage unique est un objet d'audit périodique (`OPS_TODO`).

## 18. Fraude et abus

Rate limiting, détection, suspension, signalements, risk flags, audit logs.
Seuils **explicites et journalisés**. Table d'événements de risque dès
maintenant, moteur plus tard — le tableau se lit, il ne punit pas.

## 19. Base de données

Préfixe `zabelie_` pour toute nouvelle table. Index, contraintes,
transactions explicites. Migrations versionnées et inscrites au registre
SHA-256 (`0041`). **Aucune migration appliquée en production sans lecture
préalable de l'état réel** — une par une, vérification entre chaque.

## 20–22. Résilience, journaux, performance

Backups vérifiés (une restauration testée vaut mille backups déclarés).
Retries idempotents via l'outbox, dead-letter au-delà du seuil. Une panne
fournisseur ne doit ni corrompre une commande ni créer un double paiement :
cas de test obligatoire. Journaux structurés **sans PII**. Mobile-first 3G :
pages critiques utilisables sur Android d'entrée de gamme.

## 23. SEO

**Conserver les URLs déployées et indexées** — `/produit/…`, `/catalogue/…`,
`/createur/…`. Metadata dynamique, sitemap, canonical, Open Graph (l'aperçu
WhatsApp est le premier écran du produit), Structured Data. Domaine **lu
depuis l'environnement**, jamais présumé.

## 24. Conformité

CGU, confidentialité, politique vendeurs, remboursement, livraison, produits
interdits, cookies. Suppression de compte et export de données. Tout point
ambigu est routé vers Cabinet Volmar **avant** implémentation.

---

## Règle absolue

**Zabelie n'est pas une démo.** Interdits : faux boutons, données critiques
en mémoire seule, checkout fictif, statistiques inventées, commandes
simulées, auth factice, rôles contrôlés par le frontend, paiements simulés
en production, soldes modifiables, TODO cachés derrière une interface finie.

Toute fonctionnalité annoncée fonctionnelle possède la chaîne complète :

```
UI → validation → server action/API → logique métier → base de données →
permissions (RLS) → gestion des erreurs → journaux → tests (positif + négatif)
```

## Critères de réussite

**Acheteur** : compte → découverte → panier → MonCash → commande `ZB-…` →
suivi du fulfillment → notifications → avis « achat vérifié ».
**Vendeur** : boutique → KYC → publication → commande → traitement dans la
machine à états → revenus dérivés du ledger → **payout déclenché
automatiquement à J+7, réglé par le porteur**.
**Admin** : supervision complète depuis un back-office dont chaque action
sensible est auditée.

**Vérification finale** : chaque critère démontré en préproduction avec un
cas positif **et** un cas négatif documentés, et la production inspectée
avant toute déclaration de conformité — zéro écart déclaré/déployé toléré.

---

## Arbitrages

| ID | Décision | État |
|---|---|---|
| **A** | Modèle de payout | ✅ **(b)** — déclenchement auto, règlement manuel (2026-08-08) |
| **B** | Services | ✅ **(i)** confirmés (2026-08-08) — ⏳ **seuil de sortie manquant**, §3 |
| C′ | Avoir : libre ou conditionné à un litige | ⏳ `docs/29` — recommandé : libre + trois garde-fous |
| D | Facturation : table dédiée ou extension `zabelie_biz_*` | ⏳ `docs/29` — recommandé : dédiée + briques partagées |
| E | Facturation : ancrage `profiles` vs `zabelie_sellers` | ⏳ `docs/29` — se dissout en amendant `docs/23` |
| F | Facture à total nul | ⏳ `docs/29` — recommandé : `> 0` (aucun chemin ne produit 0) |
| D-10→D-14 | Notifications : contact, canal, reversal, file, délais | ⏳ `docs/28` |
| — | `SEARCH_FINGERPRINT_SALT` | ⏳ après preuve de purge au journal |
| — | Protection de branche `main` | ⏳ à verrouiller |
| — | Escrow au-delà de J+7 | ⏳ Cabinet Volmar |

**Actions décidées, non appliquées** : `0043`, `0044`, `0054` en production
— une par une, registre vérifié entre chaque (`OPS_TODO`).

## Ordre de chantiers

1. **Chantier 1** — fulfillment (PR #64, puis PR 2/2 et `0043` en base).
2. **Chantier 2** — système vendeur (`docs/23`, débloqué par A).
3. **Chantier 3** — commissions en config (`0054`).
4. **Chantier 4** — panier multi-vendeurs (`docs/27`) — le cœur nouveau.
5. **Chantier 5** — notifications, suivi, litiges (`docs/28`).
6. Facturation vendeur (`docs/29`), avis, Seller Center.

Un chantier à la fois ; le premier livrable de chacun est sa **spec d'une
page**, pas du code.

---

**Zabelie est une infrastructure de commerce, pas simplement un site
e-commerce.**
