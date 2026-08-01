# Système vendeur — spécification technique

> **Décision D-8, porteur, 2026-08-01.** Zabelie se dote d'un vrai
> système vendeur. Références : **Amazon** pour le cycle de vie du compte,
> **Mercado Libre** pour la réputation, **Etsy** pour la simplicité de création
> de boutique. **Pas** une copie d'Amazon : l'onboarding est fortement allégé
> pour le marché haïtien.
>
> **Statut : SPÉCIFICATION. Aucune migration écrite, aucun code produit.**
>
> ⚠️ **Écart de nommage assumé.** Le brief demandait `docs/21-SELLER-SYSTEM.md`.
> `docs/21-EXPEDITION-ET-REMISE.md` existe déjà : deux fichiers `21-` rendraient
> les renvois ambigus dans un dépôt qui en compte des dizaines. Numéro libre
> suivant retenu. Renommer si le porteur préfère.

---

## 0. Ce qui est vérifié, et ce qui ne l'est pas

Chaque affirmation sur le code actuel porte sa citation. Ce que je n'ai pas pu
vérifier est marqué **⚠️ non vérifié**.

| Affirmation | Source |
|---|---|
| `profiles` ne sépare pas acheteur et vendeur : un seul `role` | `0001_schema.sql:25-33` |
| `user_role` = `('buyer', 'creator', 'admin')` — **pas de `seller`** | `0001_schema.sql:14` |
| `profiles` n'a **aucune colonne téléphone** | `0001_schema.sql:25-33` — les seules colonnes `phone` du schéma sont `zabelie_biz_clients.phone` (`0022:67`, répertoire client d'un pro) et `p_beneficiary_phone` (`0030:22`, recharge) |
| `role` et `tier` sont **gelés côté client** par trigger | `0015_profiles_hardening.sql:18-44` |
| Grand livre append-only : `wallet_transactions`, `idempotency_key` unique | `0001_schema.sql:104-118` |
| Escrow J+7 : `escrow_entries`, `matures_at`, `pending_htg` | `0006_escrow_maturation.sql:14`, `:16-26` |
| Identité comptable Σ(txn) = `balance_htg` + `pending_htg` | `0033_wallet_coherence.sql:8`, vue `:27` |
| Règlement manuel enregistrable | `0032_manual_payouts.sql:41` `zabelie_record_manual_payout` |
| **Retrait self-service EXISTANT** — le vendeur *demande* | `0034_payout_requests.sql:50` `zabelie_request_payout` |
| Attestation de politique par version | `0046_policy_acceptance.sql` |

**⚠️ Non vérifié :** le nombre de vendeurs et de commandes réels en production
(le connecteur base était détaché à la rédaction). Toute affirmation de volume
dans cette spec est donc une hypothèse, pas un constat.

---

## 1. La tension à traiter d'abord — `0034` contredit D-8

`0034_payout_requests.sql` est **appliquée en production** et s'intitule
« RETRAIT SELF-SERVICE ». Son RPC `zabelie_request_payout` (`:50`) est
exactement le modèle que D-8 interdit : un solde que le vendeur retire à la
demande.

Ce n'est pas une contradiction accidentelle. `docs/19` §3 bis le dit déjà :

> « **Correctif cible : versement AUTOMATIQUE à maturité** […] **Palliatif : le
> bouton de retrait** (lot 0.b) — utile immédiatement, insuffisant seul. »

D-8 promeut donc le correctif cible et **déclasse le palliatif**. La spec ne
propose pas de supprimer `0034` : elle propose de **cesser de l'exposer** au
vendeur, en gardant la voie ouverte côté admin tant que le versement
automatique n'est pas rodé. Même raisonnement que V-17 sur la recharge —
fermer une porte n'est pas détruire l'escalier de secours.

> **⚠️ OUVERT** — le moment exact où `zabelie_request_payout` cesse d'être
> appelable par un vendeur. Avant le premier versement automatique réussi,
> retirer le palliatif laisserait les vendeurs sans aucune sortie : ce serait
> reconstituer le risque de `docs/17`, pas le réduire.

---

## 2. Séparation acheteur / vendeur

### Le choix : table `zabelie_sellers` séparée, pas un rôle sur `profiles`

**Argument principal — la friction est asymétrique.** La cible est ~1 min pour
un acheteur, 5-10 min pour un vendeur. Un acheteur ne doit jamais rencontrer un
champ « nom légal » ou « catégories de la boutique ». Mettre ces colonnes sur
`profiles` les rend `NULL` pour l'écrasante majorité des lignes et force chaque
lecture à savoir lesquelles ignorer.

**Argument secondaire — le cycle de vie diffère.** Un compte acheteur n'a qu'un
état (actif / suspendu). Un compte vendeur en a sept (§3). Loger deux machines à
états dans une table dont `role` est déjà gelé par trigger (`0015:18`) revient à
faire porter à une colonne trois significations.

**Argument de réversibilité.** `user_role` est une énumération PostgreSQL.
Ajouter `'seller'` est une **porte à sens unique** — la leçon de `0036` déjà
inscrite dans `docs/21-EXPEDITION-ET-REMISE.md` §3. Une table séparée est
additive et se retire.

**Ce que la table ne fait pas :** elle ne remplace pas `role`. Un vendeur reste
un `profiles` avec son `display_name` ; `zabelie_sellers` porte ce qui est
propre à l'activité de vente. `products.seller_id` (`0001:38`) continue de
référencer `profiles(id)` — **aucune migration de données existantes.**

### Forme proposée

```
zabelie_sellers
  profile_id        uuid PK → profiles(id) on delete cascade
  kind              enum ('particulier', 'entreprise')
  legal_name        text not null          -- nom légal, ≠ display_name
  shop_name         text not null          -- nom de boutique, public
  shop_slug         text unique            -- URL de boutique
  account_status    enum (§3)
  payout_status     enum (§3)
  contact_phone     text not null          -- §2bis — AUCUNE unicité
  payout_phone      text                   -- MonCash de versement — unique (§2bis)
  payout_phone_set_at timestamptz          -- §2bis, délai de refroidissement
  address_*         …
  categories        text[]                 -- rayons déclarés (docs/16)
  created_at, status_changed_at, status_reason
```

> **TRANCHÉ (2026-08-01)** — `payout_phone` est **distinct** de `contact_phone`.
> Ce n'est pas seulement « un numéro de moins à saisir » contre « un peu plus de
> sécurité » : les deux champs ne portent pas le même risque et ne peuvent donc
> pas porter la même règle. Voir §2bis.

---

## 2 bis. Le téléphone — obligatoire ; l'unicité, sur le seul numéro de versement

**Exigence du porteur (2026-08-01) : demander toujours le numéro de téléphone,
et éviter les doublons.**

**Constat :** `profiles` n'a aucune colonne téléphone (`0001:25-33`), et
`payout_phone` **n'existe dans aucune migration à ce jour** — vérifié par
recherche sur `supabase/`, `lib/`, `app/`, `components/` : zéro occurrence. Les
deux champs sont à créer. C'est une chance : la règle d'unicité peut être posée
dès la première migration, au lieu d'être ajoutée sur des données déjà sales.

**Pourquoi c'est structurant ici et pas ailleurs.** En Haïti, le numéro est
l'identifiant réel : c'est le compte MonCash, c'est WhatsApp, c'est ce qu'on
dicte. L'e-mail est souvent créé pour l'occasion et jamais relu.

### La question « le téléphone doit-il être unique » est mal posée

Elle suppose qu'il y a **un** téléphone. Il y en a deux, et ils ne portent pas
le même risque :

| | `contact_phone` | `payout_phone` |
|---|---|---|
| Sert à | identifier, OTP, notifications | **recevoir l'argent** |
| Partagé dans un foyer | courant | ne devrait pas l'être |
| Ce qu'une unicité empêcherait | des gens réels de s'inscrire | qu'un versement parte au mauvais endroit |
| Ce qu'elle coûterait à un fraudeur | 100 gourdes de puce | un compte MonCash enregistré à une autre identité |

**Décision : aucune contrainte d'unicité sur `contact_phone`. Unicité stricte
sur `payout_phone`.** Une unicité sur le contact exclut le foyer qui partage un
appareil sans rien coûter à l'abuseur — elle paie le prix de l'exclusion sans
acheter la protection.

### Ce que l'unicité sur `payout_phone` achète vraiment

Avec le versement automatique de §8, l'argent part **sans intervention**. Deux
conséquences :

1. **Un vendeur suspendu pour fraude ne peut pas se réinscrire et continuer à
   encaisser sur le même MonCash.** Il lui faut un autre compte MonCash, donc
   une autre puce enregistrée à une identité. Ce n'est pas infranchissable, et
   c'est le but : une friction qui coûte à l'abuseur et rien au vendeur honnête.
2. **Elle rattrape la faute de frappe.** Deux vendeurs saisissent le même numéro,
   l'un reçoit les versements de l'autre. Sans demande de retrait, **personne ne
   s'en aperçoit** : celui qui reçoit trop ne se plaint pas, et celui qui ne
   reçoit rien met des semaines à comprendre que l'écran affiche « versé » alors
   que l'argent est ailleurs.

### Règles

1. **Obligatoire à l'inscription** (`contact_phone`), acheteur comme vendeur.
   `payout_phone` est exigé pour `PAYOUT_ELIGIBLE`, pas pour s'inscrire (§4).
2. **Normalisé avant stockage** — `lib/zabelie-topup/phone.ts` contient déjà
   `normalizeHaitiPhone` (8 chiffres, mobile 3X/4X). Le réutiliser plutôt que
   d'en écrire un second : deux normalisations divergentes produisent deux
   numéros « différents » pour la même personne, et le contrôle d'unicité
   devient une passoire.
3. **Unicité en base sur la forme normalisée**, jamais un contrôle applicatif —
   celui-ci perd la course entre deux inscriptions simultanées.
4. **Double saisie de `payout_phone`**, comparée sur la forme **normalisée**.
   Le motif existe déjà et fonctionne : `components/zabelie-topup-form.tsx:144`
   (« Numéro — double saisie »), comparaison normalisée à `:70-71`, libellés par
   i18n (`topup.phone2.label`, `app/rechaj/page.tsx:85`). La logique est
   identique, l'enjeu est d'un autre ordre : sur une recharge un chiffre faux
   coûte 100 gourdes, sur un versement il coûte le chiffre d'affaires d'un
   vendeur.
5. **Tout changement de `payout_phone` suspend les versements N jours**
   (`payout_phone_set_at`, N en table de config). C'est le vecteur classique de
   prise de contrôle : entrer dans le compte, changer le numéro, attendre
   l'échéance. Sans ce délai, le versement automatique livre l'argent au
   voleur **plus vite** qu'un retrait sur demande ne l'aurait fait — le confort
   du vendeur devient l'outil de l'attaquant.
6. **Vérifié par OTP** avant l'activation vendeur (§4) — sous réserve du canal,
   voir plus bas.

> **Le coût caché de la conformité, à écrire plutôt qu'à découvrir.** Supprimer
> l'étape « le vendeur demande son argent » est ce qu'exige la conformité BRH
> (§8) — mais c'était aussi le seul moment où le vendeur regardait où va
> l'argent. En la supprimant, on supprime le contrôle humain qui venait avec.
> **La conformité et la sécurité du compte tirent ici en sens inverse**, et le
> délai de refroidissement est ce qui rachète le contrôle perdu. Ce n'est pas
> une précaution parmi d'autres : c'est la contrepartie directe de §8.

### L'unicité doit être un index PARTIEL, pas un `unique` nu

Un `unique` simple fait l'inverse de ce qu'on veut, dans les deux sens :

- **Un compte fermé volontairement doit libérer le numéro.** Sinon un vendeur
  qui arrête bloque son propre MonCash pour toujours, y compris pour un futur
  compte à lui.
- **Un compte suspendu ne doit pas le libérer.** C'est exactement le cas que
  l'unicité existe pour couvrir.

Le dépôt a déjà le motif : `payouts_reference_uniq` (`0032:31-32`) est un index
unique partiel — `where reference is not null`. Ici le prédicat porte sur le
statut de compte, pas sur la nullité.

> **⚠️ Cette règle révèle un manque dans §3.** « Fermé volontairement » et
> « suspendu » doivent être **deux états distincts**, or la chaîne compte de §3
> n'en avait qu'un côté sortie (`RESTRICTED` → `SUSPENDED`). Un état terminal
> `CLOSED` est ajouté en §3, atteignable **uniquement** depuis `RESTRICTED` et
> **uniquement** une fois `payout_status = PAID` — on ne ferme pas un compte à
> qui l'on doit de l'argent.

> **⚠️ Conséquence à ne pas découvrir en production.** Le prédicat porte sur une
> colonne **mutable**. Réactiver un compte `CLOSED` dont le numéro a été repris
> entre-temps échouera à l'`UPDATE` de statut, pas à la saisie — une erreur qui
> tombe loin de sa cause, la classe de défaut qui casse ailleurs qu'où elle a
> été causée.
>
> Trois exigences à l'implémentation, pas une :
>
> 1. **Vérifier la disponibilité au moment de la réactivation**, avant l'`UPDATE`,
>    plutôt que de laisser remonter la violation d'index.
> 2. **Le message doit nommer le numéro et dire qu'il est repris.** « Violation
>    de contrainte d'unicité » laisse l'opérateur devant un échec sans action
>    possible ; « le 3X XX XX XX est rattaché à un autre compte vendeur actif »
>    lui dit quoi faire — demander l'autre numéro, ou traiter le doublon.
> 3. **Code d'erreur nommé, pas `23505`.** Le dépôt détecte les erreurs par code
>    et jamais par texte (`lib/pg-errors.ts`, `lib/auth-erreurs.ts`) ; un
>    `errcode` propre, sur le modèle de `ZB046` (`0046:62`), distingue « numéro
>    repris » de n'importe quelle autre violation d'unicité de la même table.
>
> Nuance sur le point 2, pour rester cohérent avec la règle du dépôt sur les
> identifiants de personne : le numéro est affiché **à l'opérateur qui est déjà
> habilité à le voir**, il n'a pas à être recopié dans un journal d'erreurs
> conservé largement. Même discipline que `0046`, qui enregistre l'acceptation
> d'une politique sans IP ni agent utilisateur.

> **⚠️ OUVERT — plafond de comptes vendeur par `contact_phone`.** Pas d'unicité,
> mais pas illimité non plus. Trois comptes vendeur sur un même téléphone, c'est
> plausible pour une famille et plausible pour une fraude. Aucune donnée de ce
> marché ne permet de trancher aujourd'hui — et c'est un **réglage, pas une
> architecture** : plafond en table de config, ajustable quand il y aura du
> volume. Poser la colonne et l'index sans plafond ne ferme aucune porte.

> **⚠️ OUVERT** — pas de fournisseur SMS validé (`CLAUDE.md` : « aucun service
> externe non listé sans validation — notamment **pas de fournisseur SMS** »).
> L'OTP par SMS **n'est donc pas spécifiable aujourd'hui**. Voies possibles :
> OTP par e-mail (déjà disponible via Supabase Auth), ou vérification manuelle
> par WhatsApp au début. Ne pas écrire de code qui suppose un SMS.

---

## 3. Statuts — deux chaînes indépendantes

### Chaîne compte

```
REGISTERED → KYC_PENDING → KYC_VERIFIED → SELLER_ACTIVE
                                              ↓
                                          RESTRICTED → SUSPENDED
                                              ↓
                                           CLOSED        (terminal)
```

| Statut | Peut publier | Vend | Reçoit ses versements | Libère `payout_phone` |
|---|---|---|---|---|
| `REGISTERED` | non | non | — | — |
| `KYC_PENDING` | brouillon | non | — | — |
| `KYC_VERIFIED` | oui | non | — | non |
| `SELLER_ACTIVE` | oui | oui | oui | non |
| `RESTRICTED` | non | non | **oui** | non |
| `SUSPENDED` | non | non | selon `payout_status` | **non** |
| `CLOSED` | non | non | plus rien dû | **oui** |

`CLOSED` est **terminal et volontaire**. Il n'est atteignable que depuis
`RESTRICTED`, et **seulement** quand `payout_status = PAID` : on ne ferme pas un
compte à qui l'on doit encore de l'argent — ce serait transformer une sortie en
rétention. `SUSPENDED` ne libère jamais le numéro de versement (§2bis) : c'est
précisément le cas contre lequel l'unicité existe.

### Chaîne versement

```
PAYOUT_PENDING → PAYOUT_ELIGIBLE → PAID
                        ↓
                   PAYOUT_HELD
```

### L'indépendance est le point

C'est la partie de D-8 qui a le plus de valeur, et elle mérite d'être dite
crûment : **on doit pouvoir arrêter les versements sans fermer la boutique, et
fermer la boutique sans arrêter les versements.**

- Fraude soupçonnée → `PAYOUT_HELD` **et** `SELLER_ACTIVE`. Le vendeur continue
  d'honorer ses commandes en cours ; l'argent attend le contrôle. Fermer la
  boutique d'abord créerait des acheteurs lésés pour une suspicion non établie.
- Vendeur qui arrête → `RESTRICTED` **et** `PAYOUT_ELIGIBLE`. Il ne vend plus,
  **et il est payé**. C'est l'inverse exact du risque `docs/17` : un compte fermé
  dont l'argent reste sur le compte marchand est de la rétention. `CLOSED` ne
  vient qu'**après** le dernier versement — l'ordre des deux n'est pas un détail.

> **Règle dure : aucun statut de compte ne doit, à lui seul, empêcher
> définitivement un versement dû.** Un vendeur suspendu pour contrefaçon doit
> quand même récupérer le net des ventes honorées avant la suspension —
> retenir cet argent n'est pas une sanction prévue, c'est de la détention de
> fonds de tiers.

Cette règle se verrouille par test au moment de l'implémentation.

---

## 4. Onboarding

### Compte (~1 min — identique acheteur et vendeur)

```
e-mail + téléphone → vérification → mot de passe
```

Le choix Particulier / Entreprise n'intervient **qu'au moment de devenir
vendeur**, pas à l'inscription. Un acheteur ne le voit jamais.

`0045_profile_on_signup.sql` crée déjà le profil **en base** par déclencheur sur
`auth.users` — vérifié en production le 2026-08-01. La spec s'appuie dessus : le
profil existe avant toute suite.

### Devenir vendeur (~5-10 min)

| Étape | Contenu | Bloquant |
|---|---|---|
| 1 | Type : particulier / entreprise | oui |
| 2 | Nom légal, nom de boutique, adresse, catégories, contact | oui |
| 3 | Acceptation de la politique produits interdits | **oui** — `0046` |
| 4 | KYC (§4bis) | oui pour `SELLER_ACTIVE` |
| 5 | Numéro MonCash de versement | oui pour `PAYOUT_ELIGIBLE` |

**Allègement par rapport à Amazon, délibéré :** pas de vérification d'adresse
par courrier postal, pas de compte bancaire exigé, pas d'appel vidéo
obligatoire, pas de numéro fiscal pour un particulier. Chacune de ces étapes
exclut la majorité du marché visé.

**Emprunt à Etsy :** la boutique se crée **avant** la vérification. Étapes 1-3
donnent `KYC_PENDING` avec droit de préparer des fiches en brouillon — elles
naissent déjà en `draft` pour les trois types de produits
(`app/api/products/route.ts`, corrigé en `259c028`). Le vendeur travaille
pendant que le dossier avance ; il ne regarde pas un écran d'attente.

---

## 4 bis. KYC — et ce que je refuse d'inventer

**Particulier :** pièce d'identité + selfie/liveness + téléphone vérifié.
**Entreprise :** idem pour le représentant légal + documents de société.

> **⚠️ OUVERT — TOUT le volet conservation des données.** Le brief demande de
> traiter le stockage des pièces d'identité et des données biométriques :
> durée de conservation, chiffrement, qui y accède. **Je n'ai aucun élément
> vérifié pour l'écrire**, et l'inventer serait pire que de le laisser vide.
>
> Ce que je peux constater : `0016_gdpr_retention.sql` existe et fixe des durées
> pour d'autres données. Ce que je ne peux pas déterminer : le cadre haïtien
> applicable aux données biométriques, la durée légale de conservation d'une
> pièce d'identité, et si Supabase Storage avec RLS suffit à l'obligation.
>
> **Quatre questions à poser au conseil, au même dossier que `docs/17` :**
> 1. Un selfie de liveness est-il une donnée biométrique au sens du droit
>    applicable, et si oui quel régime ?
> 2. Combien de temps conserver une pièce après la fermeture d'un compte ?
> 3. Le chiffrement au repos de Supabase Storage suffit-il, ou faut-il un
>    chiffrement applicatif dont Zabelie détient la clé ?
> 4. Qui peut consulter une pièce, et cette consultation doit-elle être
>    journalisée de façon opposable ?
>
> **Tant que ces réponses manquent, ne pas collecter.** Un KYC construit puis
> reconstruit sur des règles de conservation découvertes après coup implique de
> demander à tous les vendeurs de recommencer.

---

## 5. Seller Center

Produits · Commandes · Revenus · Remboursements · Litiges · Statistiques ·
Promotions · Paramètres de boutique.

**Données acheteur visibles par le vendeur — limitées au strict nécessaire à la
livraison :** prénom + initiale, téléphone de livraison, adresse, référence de
commande (`ZB-YYMMDD-XXXXX`, `0042`). **Jamais** l'e-mail complet, l'historique
d'achat chez d'autres vendeurs, ni les moyens de paiement.

> **⚠️ OUVERT** — le téléphone de l'acheteur est communiqué au vendeur pour la
> remise. C'est nécessaire (`docs/21` : la plateforme ne livre pas) et c'est une
> divulgation. À arbitrer : numéro en clair, ou relais.

---

## 6. Ledger — on réutilise, on n'invente pas

**Aucun second registre.** L'existant tient déjà :

- `wallet_transactions` (`0001:104-118`) — append-only, `idempotency_key` unique
- `escrow_entries` (`0006:16-26`) — J+7, `matures_at`, `pending_htg`
- identité Σ(txn) = `balance_htg` + `pending_htg` (`0033:8`), vue de contrôle
- règlements manuels (`0032:41`), vue `zabelie_seller_balances` (`0032:132`)

**Toute nouvelle écriture doit préserver l'identité de `0033`.** Une correction
se fait par **écriture compensatoire**, jamais par modification du grand livre.

### Affichage vendeur

```
Vente          1 000 HTG
Commission      −100 HTG   (10 %)
Net              900 HTG
                 versé le 8 août
```

Le libellé porte **la date**, jamais un bouton.

---

## 7. Paiement acheteur ≠ versement vendeur

Deux rails, deux tables, deux réconciliations. Les confondre est ce qui produit
un « solde disponible ».

| | Paiement acheteur | Versement vendeur |
|---|---|---|
| Sens | acheteur → compte marchand | compte marchand → vendeur |
| Rails | MonCash, Zelle (USD) | MonCash **⚠️ API de versement non confirmée** |
| Déclencheur | action de l'acheteur | **échéance**, aucune action |
| Idempotence | `payments.idempotency_key` | référence de règlement (`0032`) |
| Réconciliation | `/api/reconcile` (rail `moncash`) | à construire |

**⚠️ Non vérifié / dépendance ouverte :** `docs/19` §3 bis note que le code
actuel « ne sait qu'encaisser et vérifier » — l'API de **versement** MonCash
reste à confirmer auprès de Digicel. Elle change **le coût et l'échelle, pas la
possibilité** : le versement sans demande est tenable à la main dès la première
semaine.

---

## 8. Versement automatique à maturité — le cœur de D-8

```
escrow mature (J+7)  →  PAYOUT_ELIGIBLE  →  envoi  →  PAID
                              ↑
                    aucune action du vendeur
```

`PAYOUT_ELIGIBLE` **déclenche** l'envoi ; il ne l'autorise pas.

**« Automatique » peut être un humain chaque lundi.** L'essentiel est que ça
arrive **sans demande du vendeur** — `docs/19` §3 bis. Avec le corollaire déjà
écrit là-bas et qui vaut règle : *ne promettre ce comportement aux vendeurs que
s'il est tenable dès la semaine de la promesse.*

**Ce que l'écran ne doit jamais afficher :**

| Interdit | Pourquoi |
|---|---|
| « 900 HTG disponibles » | un solde disponible est une créance à vue |
| bouton « Retirer » | une demande de retrait présuppose une détention |
| « Solde du portefeuille » | même mot, même lecture |

**Autorisé :** « 900 HTG — versés le 8 août », « 900 HTG — en maturation,
versement le 8 août ».

> **⚠️ OUVERT** — que se passe-t-il si le versement échoue (numéro MonCash faux,
> compte fermé) ? La somme retourne mécaniquement dans un état d'attente, donc
> de détention. Il faut une **borne** : au bout de N échecs, escalade humaine.
> Sans borne, l'échec technique recrée la rétention par la porte de service —
> exactement le motif de `docs/21` §3 bis sur les avis acheteur.
>
> Deux garde-fous de §2bis réduisent la fréquence de ce cas sans le supprimer :
> la double saisie attrape la faute de frappe **avant** le premier versement, et
> le délai de refroidissement après changement de numéro évite d'envoyer vers
> une destination fraîchement modifiée. La borne reste nécessaire.

---

## 9. Trust score — défini, non affiché

**Entrées :** taux d'annulation · livraison à temps · réclamations ·
remboursements · évaluations · ancienneté · taux de litige · vérification
d'identité.

**⚠️ Volume réel non vérifié** (§0) — mais la règle ne dépend pas du chiffre :
un score calculé sur zéro vente, ou sur trois, est une **affirmation fausse**
présentée comme une mesure. Même classe que les faux avis retirés en `0c6650a`,
où trois témoignages signés de personnes inventées s'affichaient sous une
garantie « avis vérifiés uniquement ».

**Règle :** le score se **calcule** dès la première commande et ne s'**affiche**
qu'au-delà d'un seuil de volume. En dessous : rien. Pas « nouveau vendeur », pas
d'étoiles grisées — **rien**. Un espace vide ne ment pas.

> **⚠️ OUVERT** — le seuil de volume, les pondérations, la fenêtre glissante.
> Choix commerciaux. À poser en **table de config**, jamais en dur : c'est la
> règle du dépôt pour tout paramètre commercial.

---

## 10. Niveaux de contrôle

| | Nouveau | Établi |
|---|---|---|
| Plafond par transaction | bas | haut |
| Plafond journalier | bas | haut |
| Maturation | longue | courte |
| Fiches simultanées | limité | illimité |

**Tous les seuils en table de config.** `zabelie_payout_limits` (`0034:24`)
existe déjà et donne le modèle.

> **⚠️ OUVERT** — valeurs, critères de passage, et si le passage est automatique
> ou décidé. Commercial.

---

## 11. Ce que cette spec ne fait pas

Aucune migration, aucun code, aucune valeur commerciale posée.

### Tranché depuis la première rédaction (2026-08-01)

| Question | Réponse | Où |
|---|---|---|
| Unicité du téléphone | **Aucune sur le contact, stricte sur `payout_phone`**, par index **partiel** : `CLOSED` libère le numéro, `SUSPENDED` non | §2bis |
| `payout_phone` distinct de `contact_phone` | **Oui** — deux risques différents ne peuvent pas porter la même règle | §2, §2bis |
| Conséquence non prévue | Un état `CLOSED` terminal devient nécessaire, atteignable seulement après `PAID` | §3 |

Ajoutés au passage, sans arbitrage requis : double saisie de `payout_phone`
(motif déjà éprouvé, `zabelie-topup-form.tsx:144`) et délai de refroidissement
après changement de numéro de versement.

### Questions ouvertes — toutes pour le porteur, sauf indication

| # | Question | Nature |
|---|---|---|
| 1 | Plafond de comptes vendeur par `contact_phone` (pas d'unicité, pas illimité) | réglage, pas architecture |
| 2 | Canal de vérification du numéro (pas de fournisseur SMS validé) | dépendance |
| 3 | Durée du refroidissement après changement de `payout_phone` | réglage |
| 4 | Conservation des pièces d'identité et du liveness (4 sous-questions §4bis) | **conseil juridique** |
| 5 | Téléphone acheteur en clair au vendeur, ou relais ? | vie privée |
| 6 | Quand retirer `zabelie_request_payout` de la surface vendeur ? | séquencement |
| 7 | Borne d'échec du versement automatique | conception |
| 8 | Seuil d'affichage du trust score, pondérations | commercial |
| 9 | Seuils des niveaux, critères de passage | commercial |

**La question 4 bloque l'étape KYC.** Les questions 1 et 3 sont des valeurs de
table de config : elles n'empêchent pas d'écrire la migration, seulement de
choisir le nombre. Les autres n'empêchent pas de commencer.
