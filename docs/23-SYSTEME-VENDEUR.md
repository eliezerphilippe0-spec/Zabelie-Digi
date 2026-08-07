# Système vendeur — spec (chantier 2)

> **Statut : spec, rien d'implémenté.** Recréée le 2026-08-07 — l'original a
> disparu du dépôt et son absence a produit deux dérives documentées (Trust
> Score et `RESTRICTED` cités comme disponibles alors qu'ils sont différés).
> Gouvernée par la charte marketplace v3.1 §2. Le dépôt fait foi.
>
> ⚠️ **La section 4 (payout) porte un trou volontaire** : l'arbitrage A
> (charte §10) n'est pas tranché. Cette spec ne choisit pas à la place du
> porteur — elle montre le trou au lieu de le masquer.

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

**⏳ EN ATTENTE D'ARBITRAGE A** (charte §10 — options (a) demande /
(b) déclenchement auto + règlement manuel, recommandée / (c) B2C auto) : le
mode de déclenchement, le devenir de `zabelie_request_payout` (`0034`), et la
forme de la file admin de règlement. **Aucune implémentation du §4 avant le
mot du porteur.** La suspension (`SUSPENDED`) ne bloque pas le règlement des
fonds déjà mûris — retenir l'argent d'un vendeur suspendu serait la rétention
de `docs/17` sous une forme nouvelle ; seul `HELD`, motivé, le peut.

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
