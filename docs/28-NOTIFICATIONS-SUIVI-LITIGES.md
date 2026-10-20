# Notifications, suivi acheteur et litiges — spec (chantier 5)

> **Statut historique : spec du 2026-08-07.** L'addendum du 2026-10-20 en fin
> de document décrit le lot Stripe proposé ; les sections M0–M3 ci-dessous
> ne constituent pas un inventaire actuel du code. Réécriture du brouillon
> « doc 24 » (numéro pris par `24-API-V1.md`), après revue règle 7 : quatre
> dérives récurrentes purgées (`ZB-`, cinq états, arbitrage A ouvert, Trust
> Score différé), deux collisions structurelles résolues (§1.2, §3.4).
> Gouvernance : charte v3.1. Le dépôt fait foi.
>
> **Dépendances réelles** : chantier 1 fusionné et `0043` appliquée (file
> d'avis, balayage, filet) ; `0042` (`ZB-YYMMDD-XXXXX`) ; `docs/23` (PR #66) ;
> `refund_order` (`0006`/`0037`). L'arbitrage A (payout) n'est pas touché.
> Identifiants de décision **D-10 à D-14** — D-6/D-7/D-8 existent déjà dans
> `OPS_TODO` pour d'autres décisions, on ne les écrase pas.

## M0 — Le prérequis découvert : un contact acheteur

**Aucun téléphone acheteur n'existe dans le dépôt** (vérifié — seuls le
topup et Business en portent). Or tout M1 et la vérification de M2 en
dépendent, et `docs/21` §« un contact, pas un compte » l'avait déjà énoncé :
l'acheteur arrive par WhatsApp, il ne relèvera pas un centre de
notifications in-app.

- Collecte **au checkout**, instantané par commande : table
  `zabelie_order_contacts` (`order_id` pk, `phone` E.164), lisible par le
  **service role seul** — jamais de RLS cliente, jamais dans un journal,
  purgée avec le cycle de vie de la commande (90 j après clôture, cron
  éprouvé par une ligne de journal avant activation).
- **D-10 (porteur)** : champ obligatoire ou optionnel ; formulation kreyòl
  de la demande ; validation `+509` seulement ou internationale (diaspora
  qui commande **pour** quelqu'un en Haïti : le contact est celui du
  destinataire, pas du payeur — à trancher explicitement).

## M1 — Notifications transactionnelles

### 1.1 Événements — ancrés sur ce qui existe, pas sur une machine imaginée

| Événement | Ancrage réel | Destinataire |
|---|---|---|
| `order_paid` | `orders.status → 'paid'` (`confirm_payment`) | acheteur |
| `order_new` | même transition | vendeur |
| `order_shipped` | **= l'avis `shipped_buyer` de `0043`** — déjà en file, on ne le double pas | acheteur |
| `reminder` / `auto_received` | **existants** (`0043`) | acheteur |
| `order_delivered` | `orders.status → 'delivered'` (`zabelie_mark_received`) | acheteur |
| `dispute_opened` | M3 `OPEN` | vendeur + admin |
| `refund_completed` | M3 `RESOLVED_REFUND` exécuté | acheteur |

### 1.2 Une seule file — la généralisation (D-13, recommandée ferme)

`0043` porte déjà `zabelie_fulfillment_notices` **dont l'expéditeur n'a
jamais été construit** (`docs/21` §5.4 — dette du chantier 1). Deux files et
deux workers seraient le « second cycle parallèle » que la charte interdit.
**Recommandation : la table générale `zabelie_notifications` absorbe les
notices, et son worker EST l'expéditeur manquant du chantier 1** — rien
n'existe à dédupliquer, la généralisation n'ajoute aucun retard, elle paie
une dette. Repli si la revue en décide autrement : étendre l'enum de `0043`,
généralisation notée en dette. La table reprend le schéma du brouillon
(statuts `pending/sent/failed/skipped`, tentatives, append-only hors
colonnes d'envoi) avec deux corrections : **pas de `recipient_phone`
dupliqué** (jointure sur `zabelie_order_contacts` — un numéro vit à un seul
endroit) et `params` sans aucun identifiant personnel.

### 1.3 Envoi

- Interface `NotifyProvider` (motif `TopupProvider`), un provider derrière
  `ZABELIE_NOTIFY_PROVIDER`. **Templates paramétrés seulement, jamais de
  texte libre.** Kreyòl source, FR/EN/ES par le pipeline i18n.
- ⚠️ Les templates ne promettent **aucun délai en dur** : le brouillon disait
  « Ou gen 48è pou konfime l » alors que `shipment_deadline_days = 5 j` — un
  délai affiché vient de `zabelie_fulfillment_limits` en paramètre
  (`{delay_days}`), jamais du texte. Les tests de promesse s'appliquent.
- Worker : cron Vercel, **avis échus seulement** (`due_at <= now()` — règle
  `docs/21` §5.4), backoff borné par `notice_max_attempts` (config
  existante), journalise **même à zéro**, croisé par
  `tests/crons-appelants.test.ts`. Alerte : > 20 % `failed` sur 1 h, ou
  `pending` non traités depuis 30 min.
- **D-11 (porteur)** : WhatsApp Cloud API (templates à faire approuver par
  Meta — soumission immédiate) ou SMS d'abord. ⚠️ La charte interdit tout
  fournisseur non listé sans validation : le choix du fournisseur SMS/BSP
  **est** cette validation.

## M2 — Suivi : `/swiv/{ref}`

- Accès : `ZB-YYMMDD-XXXXX` + 4 derniers chiffres du contact **M0** (la
  dépendance est explicite). Justification : session perdue, lien partagé
  dans la famille — le « guest checkout » du brouillon n'existe pas
  (checkout authentifié, `route.ts:86`) et n'est pas requis.
- Anti-énumération : mauvais chiffres ⇒ **même réponse** qu'une référence
  inexistante ; borne `zabelie_rate_limit` existante (5/ref/h).
- RPC dédiée `security definer`, `search_path` épinglé, révoquée d'`anon`
  sauf grant explicite — et un **test d'assertion sur la forme de la
  réponse** : timeline (les **cinq** états `0043` + `delivered`), nom de
  boutique, rien d'autre. Aucun montant, aucune commission, aucune adresse.
- Bouton « Mwen gen yon pwoblèm » → M3 si la fenêtre est ouverte.

## M3 — Litiges et remboursements pré-maturité

### 3.1 Ce qui existe déjà — on étend, on ne recrée pas

- « Je n'ai pas reçu » **pendant** le suivi : `zabelie_report_not_received`
  (`0043`) — escrow verrouillé, `disputed_by_buyer`, file admin. M3 lui
  ajoute un **dossier** structuré, pas un second chemin.
- Remboursement pré-maturité : `refund_order` (`0006`/`0037`) annule déjà
  l'escrow sans solde fantôme. M3 l'habille d'un workflow, ne le réécrit pas.
- Le levier est inchangé : avant J+7 le remboursement est un **non-événement
  comptable côté vendeur**.

### 3.2 Le dossier : `zabelie_disputes`

`OPEN → UNDER_REVIEW → RESOLVED_REFUND | RESOLVED_RELEASE`, `CANCELLED`
depuis les deux premiers. Transitions par RPC seulement ; journal
`zabelie_dispute_events` append-only (discipline ledger). Fenêtre : de
`paid` à maturité ; post-maturité hors périmètre v1 (geste commercial sur le
compte plateforme, **jamais** de clawback vendeur).

**Gel de maturation** : colonne de gel sur `escrow_entries`
(`dispute_frozen_at`), `mature_wallets()` l'exclut (même motif que
`gated_on_delivery`) ; `RESOLVED_RELEASE` repousse `matures_at` de la durée
du gel — **suspendu, jamais remis à zéro**. Garde éprouvée par mutation :
retirer l'exclusion → le test du gel rougit.

`RESOLVED_REFUND` : checkpoint humain à double confirmation (montant
re-saisi), motif obligatoire. **Pas d'impact Trust Score** — différé par
`docs/23` ; sa réintroduction passera par un arbitrage écrit là-bas.

### 3.3 Exécution du remboursement — **D-12, porte fermée jusqu'à réponse**

Écriture ledger `refund` (existante) au montant strictement égal — **pas de
partiel en v1** (le partiel rouvre l'arithmétique de commission ; D-4 est
tranchée `floor` mais le partiel reste une complexité sans demande). Le
retour MonCash vers l'acheteur : l'existence d'un **reversal API** est à
prouver (checklist `docs/03` §9 étape 0) ; sinon opération manuelle
opérateur avec `providerRef` saisi et double confirmation. **Qualification
juridique (reversal ≠ P2P) routée vers Cabinet Volmar avant toute ligne.**

### 3.4 Les silences — la config existante, pas de deuxième horloge

Le brouillon recréait deux minuteries que `0043` porte déjà, **sans** la
condition de légitimité (pas d'auto-réception si les avis ne sont pas
partis) — sa version aurait fait mûrir des fonds vers un acheteur jamais
notifié. Forme correcte :

| Besoin du brouillon | Mécanisme existant | Geste |
|---|---|---|
| Vendeur muet → escalade | `shipment_deadline_days` (5 j) → `action_required` | `UPDATE` de la valeur si 48 h est voulu — **D-14** |
| Acheteur muet → réception présumée | `auto_receive_days` (7 j) + avis + rappel + légitimité | rien à construire |
| Litige que personne n'ouvre | `action_required` **est** ce litige (file admin) | M3 y attache son dossier |

**D-14 (porteur)** : les valeurs (5 j ? 2 j ?) — à confronter au réel après
les vingt premières commandes, par `UPDATE`, jamais par migration.

### 3.5 Signaux de risque

`zabelie_risk_events` append-only, lecture admin, **aucune action
automatique** — le tableau se lit, il ne punit pas. Alimenté par triggers :
≥ 3 litiges/vendeur/30 j, ≥ 2 remboursements/acheteur/30 j, `received`
suivi d'un litige (signal de fausse remise).

## Décisions ouvertes (IDs sans collision avec `OPS_TODO`)

| ID | Question | Recommandation |
|---|---|---|
| D-10 | Contact checkout : obligatoire ? destinataire vs payeur ? formulation KR | Obligatoire pour le physique, destinataire |
| D-11 | Canal v1 : WhatsApp (approbation Meta) ou SMS | Soumettre les templates tout de suite ; SMS si > 2 semaines |
| D-12 | Reversal MonCash : API ? qualification Volmar | Étape 0 de `docs/03` §9 avant toute ligne |
| D-13 | File unique : généralisation (absorbe les notices) vs extension enum | **Généralisation** — l'expéditeur des notices n'existe pas encore, elle paie une dette au lieu d'en créer |
| D-14 | Valeurs des délais (`zabelie_fulfillment_limits`) | Statu quo jusqu'à 20 commandes réelles |

## Ordre d'implémentation (après revue, chaque étape testée pos/nég)

1. M0 contact checkout (gated **D-10**) → 2. file généralisée + worker
(= l'expéditeur du chantier 1, gated **D-13** et `0043` appliquée) →
3. `/swiv/{ref}` → 4. dossier litiges + gel (sa propre PR : c'est de
l'argent — mutations exigées) → 5. exécution remboursement (gated **D-12**)
→ 6. risk events. Rien de tout cela n'est « implémentable aujourd'hui » :
tout descend de la fusion du chantier 1 — donc de la revue de la #64.

## ⚖️ Trou constaté le 2026-08-11 — l'acheteur d'une commande `disputed` ne reçoit RIEN

**Absent par construction depuis `0061`, et c'est délibéré — mais c'est un
silence, pas une solution.**

Le trigger de dépôt des reçus est gardé par `new.status = 'paid'`. La branche de
rupture de stock (`0038:176`) écrit `disputed` : elle ne dépose donc plus rien,
ce qui corrige un vrai défaut — un reçu de vente partait pour une marchandise
que l'acheteur ne recevrait jamais.

Mais la conséquence n'est pas neutre. Un acheteur dont le paiement est **bien
encaissé** et dont la commande passe en `disputed` n'a maintenant **aucun
message** : ni le faux reçu d'avant, ni le vrai message qui devrait exister —
« votre commande ne peut pas être honorée, votre argent est protégé, un humain
la traite ». Sur ce marché, un débit sans aucun message est indiscernable d'une
arnaque.

⛔ **Rien n'est construit ici** : le périmètre relève des arbitrages
**D-10 → D-14** (litiges). Cette ligne existe pour que l'arbitrage trouve la
question POSÉE au lieu de la redécouvrir — le motif exact que le registre
cherche à éviter.

Ce qu'il faudra trancher le moment venu : qui écrit ce message, à quel moment
de la transition, et ce qu'il promet exactement sur le remboursement.

## Addendum du 2026-10-20 — reçus et garde Stripe (migration 0151 proposée)

Base inventoriée : `main` à `68c191e57b8251e6f46cd27918ef027e20f0f1bd`,
avec lecture de `docs/26` et `docs/67`. Vérification des PR ouvertes par REST :
`#385`–`#387` concernent les dépendances ; `#390` porte l'inscription et les
médias. Ce lot part directement de `main` et ne reprend aucun de ces correctifs.

Inventaire avant ce lot : le webhook existant traite trois événements Checkout
et confirme via `confirm_payment`. `0128` gère déjà les paniers avec une commande
meneuse Stripe et des enfants `rail=groupe` partageant le PaymentIntent. `0081`
porte déjà les escrows vendeur et affilié, `0043` la maturation et le suivi de
remise. `0113` porte les dossiers clients et la file d'opérations. Le dossier
client exige un auteur identifié : un événement Stripe ne doit pas usurper
cet auteur ni créer un deuxième dossier. Les fonctions de remboursement et
les retraits existants restent les seuls chemins comptables.

Ce lot complète ces mécanismes :

- Le webhook vérifie toujours le corps brut signé, puis traite les cinq types
  `charge.dispute.created`, `updated`, `closed`, `funds_withdrawn` et
  `funds_reinstated`. Les identifiants Stripe simples ou développés sont
  normalisés ; les métadonnées de commande et les pièces du litige sont ignorées.
- `zabelie_stripe_dispute_events` est un journal technique immuable, distinct
  d'un dossier client : identifiant d'événement unique, identifiants opérateur,
  type, état, devise, montant en unité mineure opérateur et mode test/réel.
  Aucune conversion USD/HTG. Le journal survit à la purge de `payments.raw`.
- La RPC de service `zabelie_record_stripe_dispute` conserve aussi les reçus
  non rapprochés ou incompatibles. Le webhook répond 503 dans ces cas et en cas
  de réponse DB perdue. Un événement rejoué retrouve le reçu ; un même ID avec
  un contenu différent est refusé. Un PaymentIntent absent reste journalisé.
- Le rapprochement exige une seule meneuse `rail=stripe` et son paiement
  confirmé. Un groupe est vérifié avant de protéger tous ses escrows, vendeurs
  et affiliés compris. Les nouveaux paiements conservent le booléen Stripe
  `livemode` vérifié côté serveur ; le flag historique des commandes ne prouve
  pas ce mode. Une incompatibilité observable est soumise à revue.
- Le marqueur `escrow_entries.dispute_frozen_at` est indépendant du verrou de
  livraison. La maturation l'exclut sur la même ligne verrouillée, et une
  réception manuelle ou automatique ne l'efface pas. Aucun solde, ledger,
  statut de paiement ou de commande n'est modifié par le reçu.
- Un état `won` ou `warning_closed` reçu avant une
  création retardataire empêche un nouveau gel pour ce litige. Aucun événement
  ne libère automatiquement un gel déjà posé ; plusieurs litiges du même
  paiement restent distincts. Aucun ordre strict n'est déduit de `event.created`.
- `prevented` peut correspondre à un remboursement automatique opérateur (RDR).
  Il conserve donc la protection des escrows en attente et la revue humaine,
  sans remboursement supplémentaire par Zabelie.
- Un montant litigieux supérieur au paiement initial reste un signal de revue,
  sans empêcher la protection des escrows liés au seul PaymentIntent rapproché.
- La file et la page `/admin/operations` existantes ajoutent une ligne par
  litige, avec les états reçus et l'état du gel. Sans rapprochement unique,
  commande et montant HTG sont inconnus, jamais remplacés par zéro.

**Activation et limites.** `stripe_dispute_freeze_enabled=false` par défaut dans
la configuration d'opérations existante. Le journal et sa visibilité sont
prévus dès installation ; la rétention reste dormante conformément à `docs/26`
§0, jusqu'à validation juridique et décision humaine distincte. La migration
est proposée en PR, sans application en production dans cette intervention.
L'abonnement de l'endpoint Stripe aux cinq événements doit aussi être vérifié
lors d'une future mise en service ; aucune configuration opérateur n'est
changée ici.

Après maturation ou versement, le lot conserve la preuve pour examen humain :
aucun débit compensatoire, remboursement automatique ou blocage du portefeuille
global du vendeur. La procédure humaine de résolution/dégel reste à valider
avant toute activation du gel. Ce lot n'implémente pas la machine de dossiers
M3 proposée historiquement, ni un nouveau service financier.

Validation prévue : tests de la vraie route sans réseau, rendu réel de la page
admin, permissions/RLS, rejeux et réponses ambiguës, rapprochement groupé,
réception manuelle/automatique, invariance comptable, cas après maturation et
versement ; mutation retirant la garde de maturation et courses à deux sessions.
Ces tests s'exécutent sur des fixtures locales ou la base éphémère de CI.

Sources primaires : [Stripe — webhooks](https://docs.stripe.com/webhooks),
[Dispute object](https://docs.stripe.com/api/disputes/object),
[Disputes API](https://docs.stripe.com/disputes/api),
[Radar — résolution des litiges](https://docs.stripe.com/radar/rules/disputes),
[Sigma — statuts RDR](https://docs.stripe.com/data/query-disputes-and-fraud-data).

## Mise en service contrôlée de Stripe 0151 — procédure préparée le 20 octobre 2026

**État : préparation, aucune activation effectuée.** Le code de #391 est
fusionné dans `main` à `56b76a6`. Le mot « proposée » dans l'addendum précédent
décrit l'étape de PR ; il ne prouve toujours pas l'application de la migration
dans un environnement. Le présent runbook prépare les preuves manquantes,
sans commander de migration, d'appel de production ni de paiement réel.

Le journal technique et la RPC sont nécessaires dès que le webhook reçoit
un événement de litige. Le drapeau `stripe_dispute_freeze_enabled=false`
désactive les nouveaux gels, **pas** l'appel à
`zabelie_record_stripe_dispute`. Si ce RPC est absent, la réponse est 503 et
Stripe doit pouvoir réessayer. `/api/readyz` ne contrôle que la disponibilité
du chemin catégories ; un readyz vert ne vaut pas preuve de 0151.

### Ordre et preuves de mise en service

Chaque étape reste **à réaliser dans l'environnement explicitement autorisé**.
La répétition préparatoire emploie une base isolée et des événements Stripe
en mode test ; elle n'autorise pas le même geste en production.

1. **Fixer la version et l'environnement.** Identifier le commit, le projet
   Supabase de test, l'endpoint de test et le responsable. Relire le fichier
   0151 exact après ses prédécesseurs, sans réécrire 0151 ni rejouer les anciennes
   migrations. Ne pas appliquer 0056, volontairement gelée.
2. **Établir la présence réelle de 0151.** Une application éventuelle exige
   son autorisation séparée. Comparer le SQL reçu au fichier versionné,
   conserver son empreinte et rapprocher le journal de migrations de la
   sonde `zabelie_objets_requis()`. Le registre déclare ; la présence constate.
   Une ancienne sonde ne connaissant pas les objets ci-dessous, une ligne
   manquante ou une erreur de lecture donnent « non vérifié », jamais « sain ».
   Un objet explicitement absent donne « manquant ».
3. **Vérifier les gardes avant l'endpoint.** Contrôler les sept objets
   attendus ci-dessous, les droits service-only/RLS, l'immutabilité des reçus
   et l'exclusion de `dispute_frozen_at` dans `mature_wallets`. Contrôler
   que le drapeau de gel est encore `false`. Le déploiement de code ne
   constitue aucune preuve d'application du schéma.
4. **Vérifier les cinq événements de litige sur l'endpoint choisi.**
   Vérifier compte opérateur, mode test et URL de l'environnement isolé :
   `charge.dispute.created`, `charge.dispute.updated`,
   `charge.dispute.closed`, `charge.dispute.funds_withdrawn` et
   `charge.dispute.funds_reinstated`. Conserver les abonnements Checkout
   nécessaires au paiement existant ; ces cinq types s'y ajoutent et ne les
   remplacent pas. Le secret de signature reste côté
   serveur ; ne jamais le copier dans Git, un rapport ou une commande partagée.
   Toute modification d'endpoint de production demeure une opération distincte.
5. **Recevoir un événement test réellement signé.** Avec l'endpoint de test
   configuré et un PaymentIntent synthétique rapprochable, vérifier la
   réception du corps brut, la validation de signature et l'appel au seul RPC
   de reçu. Une signature absente/invalide doit être refusée avant accès DB.
   Les tests de route avec doubles d'E/S ne prouvent pas à eux seuls que
   l'endpoint opérateur est abonné ni que son secret est correct.
6. **Prouver l'absence de gel et de mouvement comptable pendant cet essai.**
   Avec le drapeau `false`, le reçu rapproché est conservé une seule fois,
   la réponse indique `freeze_disabled`, `frozen_count=0` et les escrows,
   commandes, paiements, soldes et ledger restent inchangés. Vérifier le rejeu
   du même ID et sa visibilité dans la file admin existante. Un même ID au
   contenu différent est refusé ; un rapprochement inconnu/ambigu ou une
   réponse DB perdue doit rester réessayable, sans acquittement forcé.
7. **Faire valider la résolution humaine avant toute activation du gel.**
   Les points de décision ci-dessous, leur responsable et leur preuve doivent
   être validés ; la présence d'un événement `closed` ne les remplace pas.
   La qualification juridique de la rétention au-delà de J+7 reste celle de
   `docs/26` et `docs/17`.
8. **Décider séparément de toute ouverture réelle.** Une fois seulement les
   preuves précédentes acquises, le porteur peut examiner la demande
   d'application/configuration de production et, séparément, celle du gel.
   Ce runbook ne fournit ni commande de changement de flag, ni autorisation
   de paiement, remboursement ou retrait réel.

Les sept identifiants de présence de 0151 sont :

- `zabelie_record_stripe_dispute(text,text,text,text,text,text,bigint,text,boolean)` ;
- `zabelie_stripe_dispute_event_immutable()` ;
- `zabelie_stripe_dispute_events` ;
- `zabelie_stripe_dispute_event_immutable` (trigger) ;
- `zabelie_stripe_dispute_event_no_truncate` (trigger) ;
- `escrow_entries.dispute_frozen_at` ;
- `zabelie_operations_config.stripe_dispute_freeze_enabled`.

La présence des sept lignes n'est pas une vérification exhaustive du corps
des fonctions, des droits ou de leur empreinte : ces contrôles restent dans
l'étape 3 et dans les assertions SQL existantes.

### Résolution et dégel : décisions encore ouvertes, pas une commande manuelle

Le code actuel n'efface jamais un gel posé. Il ne porte aucun acte de
résolution du journal technique ; chaque litige reste présenté comme exigeant
une revue. Les dossiers clients 0113 et les remboursements existants ne doivent
pas être dupliqués ou attribués à un faux acheteur pour combler ce manque.

Avant un éventuel outillage de résolution, une décision écrite doit fixer :

- **L'autorité et la preuve.** Qui peut statuer, avec quelle session admin/MFA,
  quelle référence opérateur vérifiée et quel journal de décision immuable,
  sans enregistrer de pièces sensibles dans les reçus techniques.
- **Le rapprochement et la portée.** Une identité opérateur unique, le
  PaymentIntent confirmé, le mode et la devise compatibles ; tous les
  escrows du groupe et des affiliés concernés ; aucun choix arbitraire
  lorsque plusieurs paiements correspondent.
- **Les états opérateur et les autres litiges.** `won` ou
  `warning_closed` peut empêcher un nouveau gel, mais ne libère aucun gel
  existant. `prevented` peut être un remboursement RDR ; `funds_reinstated`
  n'autorise pas seul un dégel. Un litige clos ne clôt pas les autres litiges
  du même paiement. Aucun remboursement supplémentaire n'est déduit d'un
  état opérateur.
- **L'échéance et la concurrence.** Fixer explicitement la règle de reprise
  de maturation ; la suspension de durée du brouillon M3 ne constitue pas une
  décision Stripe validée. L'acte éventuel doit être atomique face à une
  nouvelle réception de webhook, un autre litige et la maturation, avec
  idempotence et tests de deux sessions.
- **Les cas déjà matures, versés ou renversés.** Revue humaine avec les chemins
  comptables existants ; aucun clawback, débit compensatoire ou remboursement
  automatique construit par cette procédure.
- **La fermeture opérationnelle et le retour arrière.** Définir comment une
  revue terminée sort de la file sans détruire les reçus. Repasser un drapeau
  à `false` ne libère pas les gels déjà posés ; ce n'est pas un rollback
  comptable.

Tant que ces décisions et leur éventuel outillage ne sont pas validés et
testés, conserver le gel dormant. Ne pas effacer le marqueur par un UPDATE
manuel, ne pas lancer `mature_wallets`, `refund_order` ou un paiement réel
pour « vérifier » ce runbook.

### Preuves disponibles et registre de recette à compléter

La CI de l'arbre livré exerce déjà les tests existants suivants ; les recopier
dans un nouveau moteur ne les renforcerait pas :

| Niveau | Preuves existantes | Ce qu'elles ne prouvent pas |
|---|---|---|
| Route webhook | `tests/stripe-disputes-webhook.test.ts` : cinq types, objets développés, PaymentIntent absent, signatures refusées, formes invalides, réponses RPC perdues/ambiguës et rejeux | Abonnement/secret d'un endpoint Stripe réel |
| Admin et rapprochement | `tests/operations.test.ts`, `tests/stripe-reconcile.test.ts` : visibilité sans montant inventé, modes du gel, session admin et mode opérateur conservé | Décision humaine de résolution ou transfert bancaire |
| SQL SD1–SD13 | `supabase/tests/stripe_disputes.test.sql` : droits/RLS, journal durable, flag dormant, groupes/affiliés, ordre des événements, `prevented`, réception, maturité, invariance financière et mutation de la garde | État du schéma ou du drapeau d'une base de production |
| Deux sessions | `supabase/tests/stripe_disputes_concurrent.sh` : gel gagnant puis maturation gagnante, sans débit compensatoire | Une procédure de dégel, qui reste à concevoir/valider |
| Schéma du nouveau lot | `tests/schema-requis.test.ts` : ancienne sonde, objets 0151/0152 non énumérés, absence explicite, erreur partielle, déclaration et sous-ensembles indépendants | Application de 0151/0152 ou activation de quoi que ce soit |

Conserver la fiche de recette dans un dossier privé, avec les seules métadonnées
nécessaires : UTC, environnement, commit, empreinte SQL vérifiée, résultat de
sonde et des droits, cinq événements abonnés, ID de l'événement de test,
résultat/rejeu, flag observé, invariance comptable synthétique, responsable.
Aucun secret, jeton, nom client, carte, téléphone ni pièce KYC.

| Porte | État attesté par cette intervention |
|---|---|
| Code de reçus/garde 0151 fusionné et CI de l'arbre | Fait |
| Application et empreinte de 0151 dans un environnement de production | Non vérifié ; aucune application effectuée ici |
| Endpoint de production abonné aux cinq événements | Non vérifié ; aucune configuration effectuée ici |
| Réception signée sur un endpoint isolé réellement configuré | À réaliser dans le cadre autorisé |
| Absence de gel avec flag false sur les fixtures SQL | Testée en CI |
| Résolution/dégel et règle de reprise approuvés | Non réalisés / décisions ouvertes |
| Activation du gel ou paiement réel | Non effectués, non autorisés par ce runbook |
