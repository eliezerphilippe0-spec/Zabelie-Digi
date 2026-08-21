# Dossier juridique — Rétention de fonds vendeurs et qualification BRH

> **Destinataire** : conseil juridique (droit bancaire / financier haïtien).
> **Objet** : qualification, au regard de la **Circulaire BRH n°121**, du
> mécanisme de rétention de fonds actuellement **en production** sur la
> plateforme.
> **Rédigé le** : 2026-07-24 · **Statut** : brief factuel, ne contient
> **aucune interprétation juridique** — c'est précisément ce qui est demandé.
>
> ⚠️ **Gel décidé** : aucune construction nouvelle sur ce mécanisme tant que
> l'avis écrit n'est pas rendu.

---

## 1. Résumé de l'exposition en cinq phrases

1. Un acheteur paie **100 %** du prix à la plateforme, via le compte marchand
   MonCash **de la plateforme**.
2. La plateforme conserve sa commission (10 % standard / 6 % Elite) et inscrit
   le solde net du vendeur comme **écriture comptable** dans une table
   `wallets`, colonne `pending_htg`.
3. Après **7 jours**, un traitement automatique fait passer cette écriture de
   « en attente » à « disponible ».
4. **Aucun mécanisme de retrait n'est implémenté.** Le vendeur ne dispose
   aujourd'hui d'**aucun moyen** d'obtenir les fonds portés à son crédit.
5. Ces sommes se trouvent sur le **compte marchand unique** de la plateforme,
   **mêlées** à ses propres revenus : aucun compte de cantonnement n'existe.
6. Autrement dit : **la plateforme détient, sur son compte propre, des fonds
   appartenant économiquement à des tiers, pour une durée indéterminée, sans
   voie de sortie.**

Ce sont les points 5 et 6 qui motivent la présente consultation.

> **Mesure conservatoire engagée sans attendre l'avis** : l'exploitant procède
> à l'apurement **manuel** des sommes dues (virement MonCash direct contre
> reçu). L'absence de route de décaissement dans le logiciel n'est pas une
> impossibilité de payer — c'est une impossibilité de payer *automatiquement*.
> L'effet de ces règlements sur la qualification fait l'objet de la question Q7.

---

## 2. Description technique du mécanisme (vérifiable dans le code)

### 2.1 Encaissement
L'acheteur est redirigé vers MonCash et paie **sur le compte marchand de la
plateforme** (identifiants `MONCASH_CLIENT_ID` / `MONCASH_CLIENT_SECRET`,
propriété de la plateforme). La plateforme reçoit donc **l'intégralité** du
montant, y compris la part due au vendeur.

### 2.2 Inscription au crédit du vendeur
Après vérification serveur-à-serveur du paiement, la fonction
`confirm_payment` calcule la commission et inscrit le **net vendeur** :

- `supabase/migrations/0006_escrow_maturation.sql:108-114` — création d'une
  ligne `escrow_entries` avec `matures_at = now() + interval '7 days'`, statut
  `'maturing'`, et incrément de `wallets.pending_htg`.

**Aucun mouvement de fonds réel n'a lieu.** Il s'agit exclusivement d'une
écriture dans un registre comptable interne.

### 2.3 Maturation à J+7
- `supabase/migrations/0006_escrow_maturation.sql:143-173` — fonction
  `mature_wallets()`, déclenchée quotidiennement par une tâche planifiée
  (`/api/maturation`, cron 13h UTC) : les entrées échues passent de
  `pending_htg` à `available_htg`.

Justification d'origine du délai : **fenêtre anti-fraude** (permettre
l'annulation d'une vente contestée avant que les fonds ne soient réputés
acquis), et non une volonté de conserver les fonds.

### 2.4 Réversibilité
- `supabase/migrations/0006_escrow_maturation.sql:176-199` — un remboursement
  **avant** maturité annule l'écriture (réduction de `pending_htg`, statut
  `'reversed'`) ; après maturité, les fonds sont réputés disponibles.

### 2.5 ⚠️ Absence de voie de sortie — le point central

| Élément | État |
|---|---|
| Table `payouts` (demandes de retrait) | **Existe** — `0001_schema.sql:119-126` |
| Politique RLS sur `payouts` | **Existe** — `0002_rls.sql:81-85` |
| Fonction ou route de décaissement | ❌ **N'existe pas** |
| Interface vendeur pour demander un retrait | ❌ **N'existe pas** |

Le code lui-même documente ce blocage :
- `app/tableau-de-bord/page.tsx:241` — message affiché au vendeur : « Les
  retraits du solde disponible arriveront avec la [suite] »
- `supabase/migrations/0017_seller_suspension.sql:7` — « les retraits — **déjà
  bloqués en Vague 1** »

**Conséquence** : le solde « disponible » ne l'est qu'au sens comptable. En
pratique, les fonds restent chez la plateforme **sans limite de durée**.

### 2.6 ⚠️ Ségrégation des fonds — il n'y en a aucune

**Point à examiner en priorité, souvent avant la durée de détention.**

La plateforme dispose d'**un seul compte marchand MonCash**, identifié par un
unique jeu d'identifiants (`lib/moncash.ts:28-30` — `MONCASH_CLIENT_ID` /
`MONCASH_CLIENT_SECRET`). Il n'existe :

- ❌ **aucun compte de cantonnement** (trust / escrow account) distinct ;
- ❌ **aucune séparation** entre les sommes dues aux vendeurs et les revenus
  propres de la plateforme ;
- ❌ **aucun mouvement de fonds** reflétant la répartition.

Concrètement, sur ce compte unique se trouvent **mêlés** :
1. la **commission** de la plateforme — enregistrée dans `platform_earnings`
   (`0005_commission.sql:138`), simple écriture comptable ;
2. le **net dû aux vendeurs** — enregistré dans `wallets`, simple écriture
   comptable ;
3. les éventuels fonds propres de l'exploitant.

La répartition n'existe donc **que dans la base de données**. Aucun compte
bancaire ne la matérialise.

**Conséquence pratique** : rien n'empêche techniquement l'utilisation des
sommes dues aux vendeurs pour les dépenses de la plateforme — la limite est
uniquement une discipline de gestion, non un dispositif.

⚠️ **Écart de réconciliation non mesuré** : aucun endpoint de solde ou de
relevé n'est implémenté (`lib/moncash.ts` n'expose que création et vérification
de paiement). **Le solde réel du compte marchand n'a jamais été rapproché du
total du registre interne.** Un écart entre les deux, s'il existe, est
aujourd'hui invisible. → Traité en priorité par le chantier 0
(`docs/19-CHANTIER-0-RETRAIT-VENDEUR.md`).

### 2.7 Ce que le mécanisme ne fait pas
Éléments pertinents pour écarter certaines qualifications :
- ❌ Aucun **cash-in** : impossible d'alimenter un solde par un dépôt.
- ❌ Aucun **cash-out** : aucun retrait implémenté (§2.5).
- ❌ Aucun **transfert P2P** : aucun mouvement entre comptes utilisateurs.
- ❌ Aucun **paiement de tiers** : le solde ne peut servir à régler quoi que
  ce soit sur ou hors plateforme.
- ✅ Le solde ne naît **que** d'une vente réalisée sur la plateforme.

---

## 3. Volet connexe — programme de points de fidélité

Vérification demandée : les points constituent-ils une valeur monétaire
susceptible de relever de la même question ?

### 3.1 Conclusion de l'audit technique : **non** — vérifié le 2026-07-24

| Test | Résultat | Preuve |
|---|---|---|
| Existe-t-il un pont points → portefeuille ou espèces ? | **Non** | Recherche croisée `points` × (`wallet`\|`payout`\|`refund`\|`cash`) sur les 31 migrations : **zéro correspondance fonctionnelle** |
| Les points sont-ils achetables ? | **Non** | Aucune fonction de crédit contre paiement ; `award_points` est révoquée du client et n'est appelée nulle part |
| En quoi se convertissent-ils ? | **Uniquement** en remise **en pourcentage** | `0021:47` — `create type coupon_type as enum ('percentage')` : l'énumération n'a **qu'une seule valeur**, un montant fixe en gourdes est structurellement impossible |
| Sont-ils remboursables ? | **Non** | Aucune fonction de remboursement de points |
| Sont-ils transférables ? | **Non** | Toutes les tables sont liées à un `user_id` unique ; aucune fonction de transfert |
| Expirent-ils ? | **Oui**, 90 jours (plafond dur 180) | `0021:217`, `0031` |
| Le solde est-il plafonné ? | **Oui**, 2 000 points | `0031` |

### 3.2 État opérationnel
Le programme est **en base mais entièrement débranché** : aucune attribution
n'est déclenchée, aucune interface d'échange n'existe. **Aucun point n'a jamais
été émis.**

### 3.3 Nuance à soumettre au conseil
Un coupon porte un plafond de remise exprimé en gourdes
(`max_discount_htg`, ex. « −10 %, plafonné à 1 000 HTG » pour 500 points).
Ce plafond **borne** l'avantage sans donner au point une valeur autonome : il
n'a d'effet qu'appliqué à un achat. Nous soumettons néanmoins ce point à
appréciation (question Q5 ci-dessous).

---

## 4. Questions posées au conseil

> Formulées pour appeler des réponses actionnables, pas des développements
> théoriques.

**Q1 — Qualification principale.** Le fait, pour une place de marché, de
recevoir sur son compte marchand l'intégralité du prix payé par l'acheteur, et
d'inscrire au crédit du vendeur, dans un registre interne, la part lui revenant
— sans mouvement de fonds réel — constitue-t-il une **rétention de fonds pour
compte de tiers** au sens de la Circulaire n°121 ? La réponse dépend-elle de la
durée de rétention ?

**Q2 — Effet de l'absence de voie de sortie.** L'absence de tout mécanisme de
retrait (§2.5) aggrave-t-elle la qualification, l'atténue-t-elle, ou est-elle
sans effet ? Formulé autrement : vaut-il mieux, au regard de la Circulaire,
**implémenter le retrait rapidement** ou **suspendre l'inscription au crédit**
tant que le retrait n'existe pas ?

**Q3 — Seuil de tolérance.** Existe-t-il une durée, un encours ou un nombre de
bénéficiaires en deçà desquels ce mécanisme reste hors du champ de la
Circulaire ? Si oui, lesquels — nous les inscrirons comme plafonds durs en base
de données.

**Q4 — Modèles alternatifs.** Parmi les trois options ci-dessous, laquelle est
conforme sans agrément ? (détail en §5)
- (a) Règlement immédiat au vendeur, commission facturée séparément
- (b) Maintien du différé J+7, avec retrait effectif
- (c) Passage par un établissement agréé jouant le rôle de tiers de confiance

**Q5 — Points de fidélité.** Au vu de §3, le programme de points relève-t-il de
la Circulaire ? Le plafond de remise exprimé en gourdes (§3.3) modifie-t-il
l'analyse ?

**Q6 — Régularisation.** Si le mécanisme actuel est non conforme, quelle est la
marche à suivre pour la situation **déjà constituée** (fonds encaissés et non
reversés à ce jour) ?

**Q7 — Effet des règlements manuels.** La plateforme entreprend d'apurer
**immédiatement et à la main** les sommes dues (virement MonCash direct, un
vendeur après l'autre, contre reçu), sans attendre l'existence d'une route de
décaissement automatisée.

- Le fait de démontrer que **les fonds sont disponibles sur demande** modifie-t-il
  la qualification, par rapport à une rétention subie faute de voie de sortie ?
- Le maintien du mécanisme est-il admissible **à condition** qu'un règlement
  manuel documenté soit garanti dans un délai déterminé — et si oui, lequel ?
- Quelle **trace** faut-il conserver pour que ces règlements soient opposables
  (reçu MonCash, accusé du vendeur, écriture comptable) ?

**Q8 — Ségrégation.** L'absence de compte de cantonnement (§2.6) est-elle, en
elle-même, un manquement ? Un compte distinct est-il exigé, recommandé, ou sans
objet en l'espèce ?

---

## 5. Options de mise en conformité — pour éclairer Q4

Aucune n'est retenue à ce stade ; chacune est techniquement réalisable.

### Option (a) — Règlement immédiat, commission facturée
Le vendeur est réglé dès confirmation du paiement ; la commission fait l'objet
d'une facturation distincte.
- ✅ Supprime la rétention : plus de fonds de tiers détenus.
- ❌ Supprime la fenêtre anti-fraude : un remboursement après règlement devient
  une créance sur le vendeur, difficile à recouvrer.
- ⚙️ Impact technique : **fort** (le décaissement doit être automatisé, ce qui
  suppose une API de versement MonCash — à vérifier auprès de Digicel).

### Option (b) — Différé J+7 maintenu, retrait implémenté
On conserve l'existant en ajoutant le décaissement réel.
- ✅ Impact technique **faible** : le schéma est déjà en place (§2.5).
- ✅ Préserve la protection de l'acheteur.
- ❌ Ne répond pas à Q1 : la rétention subsiste, seulement bornée dans le temps.

### Option (c) — Tiers agréé
Les fonds transitent par un établissement disposant de l'agrément.
- ✅ Écarte la question réglementaire — **si et seulement si le tiers est
  réellement agréé.**
- ❌ Suppose un partenaire, un contrat et une marge supplémentaire.
- ⚙️ Impact technique **moyen** ; impact économique à évaluer.

⚠️ **NON INSTRUITE** — statut arrêté le 2026-08-21. Le relevé de marché (§9) a
fait apparaître des candidats plausibles *en apparence* : des passerelles de
paiement haïtiennes qui encaissent MonCash pour le compte de tiers. **La
question préalable n'a pas été posée, et elle commande tout le reste :
disposent-elles elles-mêmes de l'agrément ?**

Tant qu'elle n'est pas répondue, cette option ne transfère aucune charge
réglementaire — elle **empile un intermédiaire non agréé sur l'exposition
existante**, en payant 2,9 % à l'entrée et 5 % à la sortie pour ce
privilège. Elle ne doit donc pas être présentée au conseil comme une voie de
conformité, mais comme une hypothèse à instruire.

---

## 6. Éléments à réunir avant le rendez-vous

À produire par le porteur — ces chiffres seront la première question du conseil.
Requêtes à exécuter dans l'éditeur SQL Supabase :

```sql
-- 1. Encours actuellement détenu pour le compte des vendeurs
-- (le solde disponible est `balance_htg` ; `pending_htg` = escrow non maturé)
select coalesce(sum(balance_htg), 0) as disponible_non_retire_htg,
       coalesce(sum(pending_htg), 0) as en_attente_htg,
       coalesce(sum(balance_htg + pending_htg), 0) as du_total_htg,
       count(*) filter (where balance_htg + pending_htg > 0) as vendeurs_concernes
  from wallets;

-- 2. Ancienneté de la rétention la plus ancienne
select min(created_at) as plus_ancienne_entree,
       count(*)        as nb_entrees,
       count(*) filter (where status = 'matured') as matures_non_retirees
  from escrow_entries;

-- 3. Volume traité
select count(*) as commandes_payees, coalesce(sum(amount_htg), 0) as volume_htg
  from orders where status in ('paid', 'delivered');
```

Également utile : statut juridique de la société, nature du compte marchand
MonCash (personnel ou société), et conditions générales acceptées par les
vendeurs.

---

## 7. Contact identifié

`docs/BRH-question-fidelite.md` mentionne **HDIT / Cabinet Volmar** comme
contact pressenti pour un mémo juridique. Ce dossier peut lui être transmis
tel quel.

---

## 8. Décisions gelées dans l'attente de l'avis

| Chantier | État |
|---|---|
| Chantier A (rebrand) | ⛔ **gelé** — décision porteur |
| Chantiers B→F | ⛔ **gelés** |
| Câblage de l'attribution de points | ⛔ gelé (l'était déjà) |
| Toute évolution du mécanisme d'escrow | ⛔ gelée |
| Documentation, taxonomie, plans | ✅ autorisés (aucune construction) |

**Ce qui reste possible sans lever le gel** : préparer les documents, corriger
la spécification, définir la taxonomie — c'est-à-dire tout ce qui n'ajoute
aucune fonctionnalité au mécanisme en question.

---

## 9. Contexte de marché — relevé du 2026-08-21

> ⚠️ **CE QUE CETTE SECTION N'EST PAS, ET LA MISE EN GARDE VIENT AVANT LE
> CONTENU.**
>
> **« Tout le monde fait pareil » est un fait de contexte. Ce n'est pas un
> moyen de défense, et ça n'atténue rien.** La BRH ne juge pas à la norme du
> secteur : elle peut sanctionner l'ensemble d'un marché en même temps, et
> quand elle procède par étapes, c'est l'acteur le plus visible — ou le mieux
> documenté — qui vient en premier. Zabelie tient un dossier écrit décrivant
> précisément son exposition ; c'est la bonne pratique, et c'est aussi ce qui
> la rend facile à instruire.
>
> **L'urgence relative de ce dossier ne baisse pas d'un cran du fait de cette
> section.** Elle est versée ici parce qu'un conseil demandera l'état du
> marché, pas parce qu'elle répond à quoi que ce soit.

### 9.0 Niveau de preuve — à lire avant toute citation

Ce relevé a été fait avec un seul instrument disponible : la **recherche web**.
La lecture directe des pages (`WebFetch`) est **bloquée par la sortie réseau de
l'environnement**. Chaque ligne ci-dessous est donc au niveau *« ce qu'un
extrait de résultat de recherche rapporte d'une page que je n'ai pas
ouverte »*, jamais au niveau *« vérifié »*. Plusieurs de ces extraits
proviennent de **pages commerciales d'acteurs en concurrence avec Digicel** sur
ce créneau : ils sont intéressés.

Rien dans cette section ne doit être transmis à un conseil ou à un régulateur
comme un constat.

### 9.1 Ce que font les autres plateformes haïtiennes

Quatre acteurs relevés, et **aucun ne divise le paiement à la source** :

| Acteur | Ce que l'extrait rapporte | Lecture |
|---|---|---|
| **Bemane** (`seller.bemaneht.com`) | MonCash et NatCash « gérés » ; aucun frais fixe ; **commission sur les ventes**, dégressive jusqu'à 2 % | Une commission dégressive ne se prélève que si la plateforme tient les fonds |
| **HtiPay** (`htipay.com`) | Système de paiement devenu **marketplace multi-vendeurs** ; les vendeurs « postulent pour devenir vendeur » | Ils ne connectent pas un compte marchand : ils postulent au sien |
| **Kobara** (`kobara.app`) | Passerelle MonCash + NatCash, liens de paiement, webhooks, tableau de bord marchand | Encaisse pour le compte de tiers |
| **MonCashConnect** (+ Bazik.io, Peyemapi.com cités en passant) | « 0 % de commission », puis « dépôt 2,9 %, **cashout 5 %** » | Le mot *cashout* dit la structure : la passerelle **détient**, le marchand **retire** |

**Conclusion factuelle** : le modèle « compte marchand unique, commission
prélevée, vendeur réglé après coup » est la pratique généralisée de ce marché.
→ Contexte. Voir l'encadré en tête de section pour ce que ça ne vaut pas.

### 9.2 Un fait de contexte qui, lui, change une décision technique

L'argumentaire commercial de MonCashConnect s'intitule *« MonCash n'accepte
plus de nouveaux marchands ? Voici comment encaisser quand même »*, et rapporte
des demandes d'accès marchand « rejetées ou sans réponse pendant des semaines »,
avec des critères excluant de fait les indépendants et les petites boutiques.

C'est un extrait de page de vente d'un concurrent — **intéressé, non vérifié**.
Mais l'existence de **quatre** passerelles vivant de ce créneau est une preuve
indirecte de la difficulté qu'elles décrivent.

**Ce que ça condamne** : tout design reposant sur « chaque vendeur (ou chaque
organisateur d'événement) connecte son propre compte marchand MonCash ». Si
l'enrôlement est fermé, ce rail n'existe pas pour eux — et coder un rail dont
on n'a pas prouvé l'existence est l'interdit de la règle dure n° 2.

### 9.3 `POST /v1/Transfert` — un levier réel, étape 0 NON franchie

La documentation REST officielle de Digicel
(`sandbox.moncashbutton.digicelgroup.com/.../RestAPI_MonCash_doc.pdf`) expose
un endpoint **`POST /v1/Transfert`** : versement du compte marchand vers un
numéro MonCash. Plusieurs bibliothèques communautaires l'enveloppent — la
version Laravel s'écrit `$moncash->transfer(500, '509-xxxx-xxxx', 'Salary')`.

Si cet endpoint est **activé sur le compte marchand de Zabelie**, le règlement
vendeur cesse d'être manuel : la maturation J+7 se termine par un versement que
le serveur exécute seul.

**Ce que ça ferait** — attaquer la **durée** de la rétention, que §1 point 6
désigne comme « durée indéterminée ».

**Ce que ça ne ferait PAS**, et il faut être net :
- ❌ ça ne divise rien au moment du paiement — `MONCASH_CLIENT_ID` reste unique
  (`lib/moncash.ts:36-37`), Zabelie reste merchant of record par construction ;
- ❌ ça ne cantonne rien — §2.6 reste vrai mot pour mot ;
- ❌ ça ne dit rien de la qualification — un versement automatique vers un
  numéro de téléphone peut se lire comme un règlement commercial *ou* comme un
  transfert. C'est exactement l'objet de la question posée au conseil (§9.5).

⚠️ **ÉTAPE 0 DE `docs/03` §9 NON FRANCHIE.** Un endpoint documenté n'est pas un
endpoint activé sur *ce* compte. **Rien ne se code sur `Transfert` tant que
Digicel n'a pas confirmé l'activation, les plafonds et les frais.** Le courriel
qui pose la question est rédigé dans `docs/42` §1.

### 9.4 ⚠️ `Transfert` NE DÉBLOQUE PAS la billetterie payante

**Cette sous-section existe pour empêcher un faux déblocage**, et c'est une
inférence qu'une session future fera naturellement si on ne l'écrit pas.

`Transfert` raccourcit la rétention du flux **marketplace** : la vente a déjà
eu lieu, la livraison aussi, et le versement suit à J+7.

La billetterie a un problème **structurel**, pas de durée de traitement : un
billet vendu 60 jours avant l'événement reste **60 jours retenu**, même avec un
versement automatique à J+2 après l'événement. La rétention naît de la distance
entre la vente et l'événement, et cette distance est le cœur du produit
(`docs/40` §3). Aucun outil de versement ne la raccourcit.

**Les deux dossiers restent découplés :**

| Dossier | Ce qui le débloque |
|---|---|
| Rétention marketplace (durée) | Confirmation Digicel de `/v1/Transfert` |
| **Tikè Lakay payant** | **L'avis écrit du conseil — et rien d'autre** |

Le verrou de `0086` (`paiement_ouvert = false`) **ne s'ouvre pas** sur une
réponse de Digicel. Par construction, `docs/40` ne mentionne pas `Transfert` :
le croisement des deux dossiers dans une spécification est précisément ce qu'on
évite ici.

### 9.5 Reformulation de la question au conseil — acquis à conserver

La question à poser n'est **pas** « sommes-nous un FSP ? » : elle appelle un
développement long et cher. Elle est :

> *Un `Transfert` MonCash qui règle une vente documentée — commande, facture,
> écriture au grand livre — constitue-t-il un P2P au sens de la Circulaire 121,
> ou un règlement commercial ?*

Un oui/non motivé. C'est la bonne granularité pour un cabinet, et c'est ce qui
part dans `docs/42` §2 (question 1). La question billetterie de `docs/40`
§3 bis y est jointe comme question 2 — **un seul envoi, deux questions
numérotées.**

### 9.6 À vérifier sur le texte source — non cité tant que non vérifié

Deux affirmations rencontrées dans ce relevé **ne figurent volontairement pas
dans ce dossier**, parce qu'elles n'ont pour source que des extraits de presse
ou de pages commerciales :

1. **La forme sociale exigée pour l'enregistrement d'un fournisseur de services
   de paiement électronique.** Des résumés de presse en donnent une, ce dossier
   ne la reproduit pas. → Le porteur télécharge le texte de la **Circulaire
   n° 121** (BRH, publiée le 6 décembre 2021) et la vérifie sur la source.
   Tant que ce n'est pas fait, la contrainte de forme sociale n'est **citée
   nulle part** dans le dépôt.
2. **Le statut d'agrément de Kobara et de HtiPay.** → §5 option (c), marquée
   **non instruite**.

C'est la règle du dépôt appliquée à sa propre documentation : un extrait de
page de vente d'un concurrent de Digicel n'est pas une mesure, et un document
de conformité qui le traiterait comme telle fabriquerait un biais que toutes
les sessions suivantes reliraient comme un fait.
