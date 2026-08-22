# Système vendeur — spec (chantier 2)

> **Statut : spec, rien d'implémenté.** Recréée le 2026-08-07 — l'original a
> disparu du dépôt et son absence a produit deux dérives documentées (Trust
> Score et `RESTRICTED` cités comme disponibles alors qu'ils sont différés).
> Gouvernée par la charte marketplace v3.1 §2. Le dépôt fait foi.
>
> ✅ **Le trou de la section 4 est refermé** : l'arbitrage A a été tranché
> le 2026-08-08 — option (b), déclenchement automatique à maturité et
> règlement manuel. La spec est complète.

## 1. Chaîne d'états du compte vendeur

```
REGISTERED → KYC_PENDING → KYC_VERIFIED → SELLER_ACTIVE
                                              │
                                          SUSPENDED  (réversible — 0017)
                                              │
                                           CLOSED    (terminal)
```

| Transition | Déclencheur | Acteur |
|---|---|---|
| `REGISTERED → KYC_PENDING` | Le vendeur soumet son dossier | Vendeur |
| `KYC_PENDING → KYC_VERIFIED` | Validation du dossier (file admin, modèle Zelle) | Admin |
| `KYC_PENDING → REGISTERED` | Refus motivé — le dossier peut être resoumis | Admin |
| `KYC_VERIFIED → SELLER_ACTIVE` | Création de la boutique (§2) | Vendeur |
| `SELLER_ACTIVE ↔ SUSPENDED` | Modération — mécanisme **existant** `0017` (`suspended_at/reason/by`), réutilisé tel quel, jamais dupliqué | Admin |
| `→ CLOSED` | Demande du vendeur ou décision motivée ; irréversible | Vendeur ou Admin |

- Toute transition passe par une fonction serveur (`security definer`,
  `search_path` épinglé, révoquée d'`anon`) qui **valide l'état de départ** —
  jamais un `UPDATE` direct. Transition invalide = exception, testée
  connu-positif ET connu-négatif par arête.
- **`RESTRICTED` et le Trust Score restent différés** (arbitrage antérieur).
  Leur réintroduction exige un arbitrage explicite écrit ici — pas une
  reprise silencieuse.
- Un compte non-`SELLER_ACTIVE` ne publie pas et ses produits publiés sont
  masqués (même mécanique de catalogue que la suspension `0017`).

## 1 bis. L'entité vendeur est une EXTENSION DE `profiles`, clé sur son id

**Tranché 2026-08-08 (arbitrage E de `docs/29`).** `zabelie_sellers` porte
l'état du §1 et rien d'autre :

```sql
create table zabelie_sellers (
  id uuid primary key references profiles (id) on delete cascade,
  ...
);
```

Pas d'identifiant propre. La raison est une propriété, pas une préférence :
**le vendeur EST déjà un profil** — `products.seller_id → profiles.id`,
`wallets.owner_id → profiles.id`, `escrow_entries` via le wallet. Donner au
vendeur un second identifiant créerait deux clés pour une même personne, et
la première jointure qui se trompe de clé produit un catalogue vide ou, pire,
le net d'un autre vendeur.

**Conséquence directe, et c'est ce qui débloque un autre chantier** : tout
mécanisme qui doit s'ancrer sur « le vendeur » peut le faire sur
`profiles.id` **dès aujourd'hui**, sans attendre cette migration —
l'ancrage sera identique après. C'est ce qui rend le socle de facturation
(`docs/29`) implémentable avant le chantier 2.

## 1 ter. UN SEUL COMPTE — le rôle s'AJOUTE, il ne remplace pas

**Écrit le 2026-08-21, sur une question du porteur : « les utilisateurs
auraient-ils deux comptes s'ils souhaitaient vendre et acheter ? »** La réponse
est non, et elle n'était énoncée nulle part — c'était une propriété du code que
personne n'avait mise par écrit.

C'est le corollaire de §1 bis : si le vendeur **est** déjà un profil, alors
l'acheteur et le vendeur sont **la même personne**, avec un seul identifiant,
une seule session, un seul mot de passe.

```
inscription ............ role = 'buyer'     → il achète
première publication ... role = 'creator'   → il vend AUSSI
```

**Il ne perd rien en devenant vendeur.** Le rôle est un marqueur — pour les
statistiques (`/admin/geo`, `0014`) et pour le chemin rapide de la vitrine
boutique — jamais une porte qui se referme derrière lui.

### Ce qui a été mesuré, le 2026-08-21

| Surface | Garde de rôle |
|---|---|
| `app/api/checkout/route.ts` | **aucun** |
| `app/api/panier/`, `app/produit/`, `components/buy-button.tsx` | **aucun** |
| `app/vendre/page.tsx`, `app/vendre/physique/page.tsx` | **aucun** |
| `app/tableau-de-bord/`, `app/mes-ventes/` | **aucun** — deux occurrences, toutes deux des commentaires sur la clé `service_role` |
| `orders.buyer_id → profiles(id)` | **aucune condition de rôle** |

Un `creator` peut donc être acheteur d'une commande, et la base ne s'y oppose
pas. Ce qui rattache un produit à son vendeur est **`seller_id`**, jamais un
rôle — et `0084` le dit déjà à sa façon : *« ses produits, eux, ne mentent
pas »*.

### Pourquoi ce n'est pas qu'une commodité

Zabelie s'adresse à des gens sur **Android d'entrée de gamme, bande passante
faible, coupures fréquentes**. Demander à une marchande de Jacmel de jongler
entre deux comptes — deux mots de passe, deux sessions, deux reconnexions après
chaque coupure — serait une faute d'usage grave. Sur ce terrain, **chaque
compte supplémentaire est un abandon supplémentaire.**

### ⚠️ L'exception, et elle ne concerne QUE l'exploitant

| Qui | Comptes | Pourquoi |
|---|---|---|
| **Un utilisateur ordinaire** | **1** | achète et vend avec le même |
| **L'administrateur de la plateforme** | 2 | `admin` **juge**, et on ne se juge pas soi-même |

Le conflit n'est pas « vendre et acheter » — c'est **« approuver les
vérifications d'identité des vendeurs ET être soi-même vendeur »**.
`app/admin/kyc/page.tsx` est gardé par `role !== "admin"` : le jour où
`zabelie_kyc_config.requis_pour_retrait` sera armé (`0079`, décision en attente
à `OPS_TODO`), un admin-vendeur serait à la fois le vérifié et le vérificateur.
Le contrôle ne pourrait pas lui refuser.

S'y ajoutent l'audit — `zabelie_admin_actions` (`0055`) existe pour tracer les
gestes d'administration, et les mêler à un commerce personnel brouille
exactement la trace qu'il produit — et un fait que `docs/17` gagnera à énoncer
plutôt qu'à laisser deviner : *l'administrateur est-il marchand sur sa propre
place de marché ?*

⚠️ **Un troisième compte, acheteur, est une exigence de TEST et non une règle
produit** : `docs/22` demande d'acheter depuis un second compte pour la
première commande réelle, parce que plusieurs chemins ne sont pas parcourus
quand l'acheteur est le vendeur. Un vendeur ordinaire n'en a pas besoin.

### Le garde

`tests/role-jamais-retrograde.test.ts` (§R3) refuse qu'un contrôle de rôle
apparaisse sur une surface d'achat ou de vente. **Ce n'est pas une interdiction
définitive** — c'est un point d'arrêt : si un tel contrôle devient
nécessaire un jour, il faudra modifier le test et écrire pourquoi. Ce qu'on
empêche, c'est qu'il arrive **par distraction**, et qu'un utilisateur se
retrouve enfermé du mauvais côté d'une porte que personne n'a voulu poser.

Le précédent est frais : le 2026-08-21, publier un produit **écrasait** le rôle
de qui le faisait, et le porteur a perdu son rôle d'administrateur sans le
moindre signal. C'est en cherchant la cause qu'on a découvert que rien
n'écrivait la règle.

## 2. Boutique

Table `zabelie_stores` — **une par vendeur** (`seller_id unique`) :
`name`, `slug` (unique, immuable après création — les liens WhatsApp partagés
ne doivent jamais casser), `logo_url`, `banner_url`, `description`,
`contact_*`, `created_at`. RLS : lecture publique des boutiques dont le
vendeur est `SELLER_ACTIVE` **et** non suspendu (réutilise
`seller_is_active()` de `0017`) ; écriture par le propriétaire seul, champs
d'état exclus des colonnes accordées. La page publique existe déjà
(`/createur/[id]`) : elle s'étend à la boutique, l'URL ne change pas.

## 3. KYC — léger, adapté au terrain

**Collecté** (le minimum qui permette de payer la bonne personne) :
1. nom légal + nom d'affichage ;
2. pièce d'identité avec photo — **bucket Storage privé**, lisible par les
   seuls admins, jamais d'URL publique, jamais dans les journaux ;
3. **numéro MonCash au nom du vendeur** — la coordonnée de versement, requise
   quel que soit l'arbitrage A ;
4. commune/département (géo agrégée existante, jamais exposée
   individuellement).

**Non collecté** : patente, RCS, références bancaires — barrières
irréalistes pour un vendeur individuel haïtien ; à revoir si un statut
« vendeur pro » naît un jour.

**Rétention** : dossier d'un compte `CLOSED` purgé à J+90 (cron journalisant
même à zéro, croisé par `tests/crons-appelants.test.ts`). Aucun champ KYC
dans `profiles` (grants colonne `0015` : le profil est partiellement public).

## 4. Chaîne payout — indépendante de la chaîne de compte

**Fixé, quel que soit l'arbitrage A** : maturation **J+7** avant toute
disponibilité (`0006`, vivante en production) ; identité comptable `0033`
préservée par chaque écriture ; coordonnée de versement collectée au KYC ;
gel administratif `HELD` motivé et tracé ; toutes les vues vendeur dérivées
du ledger, aucun solde éditable.

**✅ ARBITRAGE A TRANCHÉ — (b), 2026-08-08** : *déclenchement automatique à
maturité, règlement manuel.* Le trou de cette section est refermé.

```
maturité J+7 atteinte  →  SCHEDULED (automatique, cron)
                       →  PROCESSING (le porteur exécute le versement)
                       →  PAID (référence opérateur saisie)
   branches : FAILED → RETRY (recul borné) · HELD (gel motivé, tracé)
```

Ce que (b) change, et pourquoi c'est le bon cadre BRH : le **déclenchement**
cesse d'être discrétionnaire. Un vendeur n'a plus à *demander* ce qui lui est
dû — l'échéance le produit. C'est ce qui distingue un règlement d'une
rétention (`docs/17`), et c'est l'argument à porter au conseil. Le
**règlement**, lui, reste manuel : aucun rail de versement sortant n'est
prouvé (MonCash B2C — étape 0 de `docs/03` §9 non franchie), et un règlement
manuel borné par le volume est un garde-fou, pas une dette.

**Conséquences d'implémentation** :

- `zabelie_request_payout` (`0034`) **n'est pas supprimée** : elle devient le
  chemin d'exception (le vendeur signale une coordonnée à corriger, un
  versement non reçu), plus le chemin nominal. Le supprimer casserait le
  chantier 0 sans rien remplacer tant que l'automatisation n'a pas tourné.
- Un cron pose les payouts `SCHEDULED` à maturité — il **journalise même à
  zéro** (`tests/crons-appelants.test.ts` croise son appelant).
- La file admin de règlement suit le motif Zelle existant : liste, exécution,
  saisie de la référence opérateur, double confirmation sur le montant.
- **Aucun fonds ne bouge sans maturité** : le cron ne fait que rendre
  *exigible*, il ne verse pas.

La suspension (`SUSPENDED`) ne bloque pas le règlement des fonds déjà mûris —
retenir l'argent d'un vendeur suspendu serait la rétention de `docs/17` sous
une forme nouvelle ; seul `HELD`, motivé et tracé, le peut.

**Ce que le KYC doit donc collecter** (et c'était la dépendance annoncée) :
le **numéro MonCash au nom du vendeur** suffit — (b) n'exige aucune donnée
d'API B2C. Le §3 est complet en l'état.

## 5. Journal d'audit

Prérequis du §1 : chaque action admin (validation/refus KYC, suspension,
gel, fermeture) écrit `qui, quoi, quand, ancienne valeur, nouvelle valeur`
dans `zabelie_audit_log` — append-only, protégé par trigger comme le ledger,
créé par la **première** migration de ce chantier puisque toutes les
transitions en dépendent. Aucune pièce d'identité ni PII dans les entrées :
des identifiants et des états, jamais des contenus.

## 6. Périmètre d'implémentation (après revue de cette spec)

1. Migration audit log → 2. migration `zabelie_sellers` (état) +
`zabelie_stores` + fonctions de transition → 3. UI onboarding + file admin
KYC (modèle Zelle) → 4. §4 après arbitrage A. Chaque migration **écrite,
jamais appliquée** par l'agent ; tests SQL par transition avant toute UI.

**Hors périmètre** : Trust Score, `RESTRICTED`, KYC « pro », badge public
vérifié (promesse commerciale — arbitrage porteur), notation vendeur
(chantier avis).
