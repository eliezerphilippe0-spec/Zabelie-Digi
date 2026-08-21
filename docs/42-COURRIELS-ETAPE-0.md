# 42 — Courriels d'étape 0 — prêts à copier-coller

> **Statut : LIVRABLE. Deux courriels rédigés, zéro code, zéro migration.**
> Rédigés le 2026-08-21.
>
> Ces deux envois sont les actions **les moins chères et les plus bloquantes**
> du projet : chacune coûte un courriel et débloque un dossier entier. Aucune
> ne peut être faite par un agent — elles portent la signature du porteur.

---

## 0. Pourquoi DEUX courriels et non un

Les deux dossiers qu'ils ouvrent sont **découplés**, et les mélanger dans un
seul envoi ferait perdre les deux :

| Courriel | Destinataire | Ce qu'il débloque | Ce qu'il ne débloque PAS |
|---|---|---|---|
| §1 | Digicel — services Business | La **durée** de rétention du flux marketplace (versement automatique J+7) | Rien de la billetterie payante |
| §2 | HDIT / Cabinet Volmar | La **qualification** — donc, seule, la billetterie payante | Rien de technique |

→ Le raisonnement complet est en `docs/17` §9.4. En une phrase : un billet
vendu 60 jours avant l'événement reste 60 jours retenu, quel que soit l'outil
de versement. **Une réponse de Digicel n'ouvre pas `zabelie_ticket_config.
paiement_ouvert`.**

⚠️ **Aucun des deux ne lève le gel.** Tant que les réponses ne sont pas là :
rien ne se code sur `Transfert` (règle dure n° 2 — `docs/03` §9 étape 0 non
franchie), et `0086` garde son verrou.

---

## 1. Courriel Digicel — activation de `/v1/Transfert`

**À** : `MFS_B.Services@digicelgroup.com`
**Copie** : service client 202 si aucune réponse sous 7 jours ouvrables.

> ⚠️ **Avant d'envoyer** : remplacer les trois champs entre crochets. **Ne
> jamais joindre le `MONCASH_CLIENT_SECRET`** — le `client_id` suffit à
> identifier le compte, et un secret ne se transmet pas par courriel, même à
> son émetteur.

### Objet

```
Activation de l'endpoint /v1/Transfert sur notre compte marchand MonCash Business
```

### Corps

```
Bonjour,

Nous exploitons une place de marché en ligne haïtienne et disposons d'un
compte marchand MonCash Business en production.

  • Raison sociale / nom du marchand : [À REMPLIR]
  • Identifiant du compte marchand (client_id) : [À REMPLIR]
  • Contact technique : [À REMPLIR]

Nous utilisons aujourd'hui l'API REST MonCash pour l'ENCAISSEMENT
(création de paiement et vérification serveur-à-serveur). Nous souhaitons
également régler nos vendeurs de façon automatique après chaque vente, et la
documentation REST MonCash décrit un endpoint « POST /v1/Transfert » prévu
pour un versement du compte marchand vers un numéro MonCash.

Nos questions portent toutes sur ce seul endpoint :

  1. Cet endpoint est-il ACTIVÉ sur notre compte marchand ? Si non, quelle
     est la démarche pour l'activer, et sous quel délai ?

  2. Quels PLAFONDS s'appliquent — par transaction, par jour, par mois, et
     par bénéficiaire ?

  3. Quels FRAIS s'appliquent à chaque versement, et qui les supporte
     (émetteur ou bénéficiaire) ?

  4. Y a-t-il des CONDITIONS D'USAGE particulières — notamment : le
     versement à un tiers vendeur en règlement d'une vente réalisée sur
     notre plateforme entre-t-il dans le cadre prévu par ce service ?

  5. L'endpoint accepte-t-il une RÉFÉRENCE EXTERNE fournie par nous à
     l'appel (identifiant d'idempotence, à l'image du « customIdentifier »
     d'autres API de versement) ? Autrement dit : si notre appel se termine
     par un délai d'attente dépassé et que nous le rejouons avec la même
     référence, MonCash traite-t-il le second appel comme un doublon plutôt
     que comme un second versement ?

     Et existe-t-il un endpoint permettant de CONSULTER le statut d'un
     versement à partir de cette référence, ou à défaut un relevé des
     versements émis sur une période ?

Nous ne développerons rien sur cet endpoint avant votre confirmation.

Nous restons disponibles pour tout document complémentaire (statuts,
justificatifs, description du flux).

Cordialement,
[NOM]
[FONCTION] — [SOCIÉTÉ]
[TÉLÉPHONE] · [COURRIEL]
```

### Ce qu'on fait de la réponse

| Réponse | Conséquence |
|---|---|
| **Activé**, plafonds et frais donnés | Étape 0 franchie. Le chantier « versement automatique » peut s'ouvrir — les plafonds vont en **table de config**, jamais en dur (règle dure n° 3), et le test `docs/43` doit rougir avant qu'une ligne soit écrite. |
| **Non activé**, démarche donnée | On suit la démarche. Rien ne se code entre-temps. |
| **Refus** ou question 4 répondue négativement | Le rail n'existe pas pour cet usage. On l'écrit dans `docs/03` §2 et on n'y revient plus. |
| **Aucune réponse sous 3 semaines** | Consigner l'absence de réponse dans `OPS_TODO` — c'est une donnée, pas un vide. |

⚠️ **La question 4 est la moins évidente des cinq.** Un endpoint techniquement
disponible peut être contractuellement réservé à d'autres usages (paie de
salariés, remboursements). Poser la question maintenant coûte une ligne ; la
découvrir après implémentation coûte le chantier.

⚠️ **La question 5 est celle dont la réponse change le plus de code**, et elle
a été ajoutée après coup — elle ne figurait pas dans la première rédaction.

- **Réponse « oui, référence externe acceptée »** → l'idempotence est portée
  par le fournisseur, comme le topup le fait déjà (`customIdentifier =
  order.id`, `docs/07`). Le rejeu après un délai d'attente dépassé est sûr.
- **Réponse « non »** → **toute l'architecture d'idempotence change.** Aucun
  rejeu n'est sûr ; le seul recours est une table d'intentions côté Zabelie
  plus une réconciliation externe, et un versement dont l'issue est inconnue
  reste inconnu jusqu'à un relevé. → `docs/43` §3, qui est écrit pour ce cas
  parce que c'est le pire des deux.

La seconde moitié de la question 5 — **existe-t-il un moyen de consulter le
statut d'un versement** — est la condition d'existence de la sonde de
réconciliation externe (`docs/43` §3.3). Sans elle, la panne A (« l'argent est
parti, la base l'ignore ») n'est **détectable par aucun instrument
automatique**, et le contrôle retombe sur une lecture manuelle du relevé.

**Les deux moitiés se posent dans le même envoi.** Découvrir la seconde après
avoir codé sur la première coûterait le chantier une deuxième fois.

---

## 2. Courriel HDIT / Cabinet Volmar — deux questions numérotées

**À** : HDIT / Cabinet Volmar (`hditcabinetvolmar.com`)
**Pièces jointes** : `docs/17-DOSSIER-BRH-RETENTION.md` et
`docs/36-DOSSIER-RETENTION-KYC.md`, exportés en PDF.

> **Principe de rédaction** : on ne demande pas un mandat ni une étude. On
> demande **deux réponses motivées** sur deux qualifications précises. « Sommes-
> nous un fournisseur de services de paiement ? » appelle un développement long
> et cher ; les deux questions ci-dessous appellent un oui/non argumenté.
>
> ⚠️ Ce courriel **ne cite aucune exigence de la Circulaire 121** — ni forme
> sociale, ni seuil. Ces éléments n'ont pour source que des résumés de presse et
> ne sont pas vérifiés (`docs/17` §9.6). On expose les faits, le cabinet
> qualifie. C'est l'inverse qui coûterait cher : un client qui pré-qualifie
> oriente la réponse qu'il paie.

### Objet

```
Demande d'avis — qualification de deux mécanismes de rétention de fonds au regard de la Circulaire BRH n°121
```

### Corps

```
Maître,

Nous exploitons Zabelie, une place de marché en ligne haïtienne (produits
physiques, produits numériques et services), encaissant par MonCash.

Nous sollicitons votre avis écrit sur DEUX questions de qualification. Elles
sont indépendantes l'une de l'autre et nous avons besoin des deux, mais la
seconde bloque aujourd'hui un développement en cours.

Le contexte factuel complet est dans les deux documents joints. Il tient en
trois faits :

  • l'acheteur paie 100 % du prix sur NOTRE compte marchand MonCash ;
  • nous conservons notre commission et inscrivons le net dû au vendeur
    comme une écriture dans un registre comptable interne — aucun mouvement
    de fonds réel n'a lieu ;
  • ce compte marchand est UNIQUE et NON CANTONNÉ : les sommes dues aux
    vendeurs y sont mêlées à nos propres revenus.

────────────────────────────────────────────────────────────────────────

QUESTION 1 — Nature d'un versement automatique au vendeur

L'API MonCash expose un service de versement du compte marchand vers un
numéro MonCash. Nous envisageons de l'utiliser pour régler automatiquement
chaque vendeur à l'issue d'un délai de sept jours suivant la livraison.

Chaque versement serait adossé à une vente documentée : une commande
identifiée, une facture, une écriture au grand livre, et la référence de
transaction MonCash conservée comme preuve.

  Un tel versement constitue-t-il un transfert de personne à personne
  (P2P) au sens de la Circulaire n°121 — ou un règlement commercial de
  la dette née d'une vente ?

Et, selon votre réponse : ce mécanisme améliore-t-il notre position au
regard de la Circulaire par rapport à la situation actuelle (rétention de
durée indéterminée, règlements effectués manuellement), ou l'aggrave-t-il ?

────────────────────────────────────────────────────────────────────────

QUESTION 2 — Billetterie événementielle

Nous envisageons d'ajouter la vente de billets d'événement.

La différence avec notre activité actuelle tient à une seule variable, et
elle est structurelle. Pour un produit, nous retenons les fonds environ sept
jours après la livraison. Pour un billet, nous les retiendrions DE LA VENTE
JUSQU'À LA TENUE DE L'ÉVÉNEMENT — soit potentiellement plusieurs mois. Cette
durée n'est pas un cas limite : c'est le cœur du produit.

Nous précisons que la conception techniquement prudente est ici la plus
exposée : payer l'organisateur AVANT l'événement nous exposerait au risque
d'annulation et laisserait les acheteurs sans recours.

  Cette conservation relève-t-elle d'un service de paiement au sens de la
  Circulaire n°121 ? Et si oui, quelles conditions — cantonnement,
  enregistrement, plafond de durée — la rendraient admissible ?

────────────────────────────────────────────────────────────────────────

Nous avons suspendu le développement de la fonctionnalité visée par la
question 2 dans l'attente de votre réponse ; le blocage est inscrit dans
notre base de données et non seulement dans une note.

Merci de nous indiquer vos conditions d'intervention et le délai que vous
estimez nécessaire.

Cordialement,
[NOM]
[FONCTION] — [SOCIÉTÉ]
[TÉLÉPHONE] · [COURRIEL]
```

### Ce qu'on fait de la réponse

| Réponse | Conséquence |
|---|---|
| **Q1 = règlement commercial** | Argument versé à `docs/17` ; le versement automatique cesse d'être un risque de qualification. Ne lève toujours pas `paiement_ouvert`. |
| **Q1 = P2P** | Le versement automatique est écarté. Le règlement manuel contre reçu (`0032`) reste la seule voie, et `docs/19` devient prioritaire. |
| **Q2 = hors champ** | `zabelie_ticket_config.paiement_ouvert` s'ouvre par un `UPDATE`, aucune migration (`docs/40` §3). |
| **Q2 = dans le champ, avec conditions** | Les conditions s'inscrivent comme **plafonds durs en base**, jamais comme consigne documentaire. |
| **Q2 = dans le champ, sans voie** | Tikè Lakay reste gratuit. Le V0 gratuit (PR-T1→T4) garde tout son sens. |

⚠️ **La réponse, quelle qu'elle soit, est un livrable à archiver** — au dépôt,
daté, et référencée depuis `docs/17` §7. Un avis juridique dont on se souvient
n'est pas un avis juridique.

---

## 3. Registre — état des deux envois

| Envoi | Destinataire | Date d'envoi | Date de réponse | Statut |
|---|---|---|---|---|
| §1 — activation `/v1/Transfert` | Digicel MFS Business | **2026-08-21** | — | 📤 **ENVOYÉ — en attente de réponse** |
| §2 — qualification Q1 + Q2 | HDIT / Cabinet Volmar | **2026-08-21** | — | 📤 **ENVOYÉ — en attente de réponse** |

> Ce tableau se remplit à la main, au moment de l'envoi. Une case vide veut
> dire « pas envoyé », jamais « on ne sait plus » — c'est la différence entre
> l'absence de signal et le signal d'absence.
>
> **Les deux dates du 2026-08-21 sont déclarées par le porteur en session, pas
> observées.** L'agent n'a accès ni à la boîte d'envoi ni aux accusés de
> réception. C'est une déclaration fiable et c'est la seule disponible — mais
> elle ne se lit pas comme une mesure, et une session future qui aurait besoin
> de la date exacte doit remonter à l'accusé d'envoi, pas à cette ligne.

### 3.1 Échéances — pour que l'attente ait une fin

Une attente sans date de reprise devient un abandon silencieux. Les deux
échéances sont calculées depuis le **vendredi 2026-08-21** :

| Échéance | Date | Geste |
|---|---|---|
| **Relance Digicel** — 7 jours ouvrables (§1) | **2026-09-01** | Service client **202**, en citant l'objet du courriel |
| **Absence de réponse = une donnée** — 3 semaines | **2026-09-11** | Consigner l'absence à `OPS_TODO`, pour les deux envois |

⚠️ **Le 2026-09-11 n'est pas une date d'abandon, c'est une date d'ÉCRITURE.**
« Digicel n'a pas répondu en trois semaines » est un fait qui oriente les
décisions suivantes — il vaut d'être écrit exactement comme une réponse. Sans
cette ligne, « on attend encore » et « personne n'a relancé depuis un mois »
produisent le même silence.

### 3.2 Ce que l'envoi ne change PAS

À inscrire ici parce que c'est l'inférence naturelle du lendemain :

- ⛔ **`zabelie_ticket_config.paiement_ouvert` reste `false`.** Il s'ouvre sur
  l'**avis rendu**, pas sur la question posée. Le verrou est un trigger en base
  (`0086`, appliquée le 2026-08-21) — il ne se lève pas par l'attente.
- ⛔ **Rien ne se code sur `/v1/Transfert`.** `docs/03` §9 **étape 0 non
  franchie** : un endpoint documenté n'est pas un endpoint activé, et une
  question posée n'est pas une réponse reçue. `docs/43` décrit le test qui
  devra rougir avant la première ligne ; il ne l'autorise toujours pas.

Ce qui a changé, et c'est déjà beaucoup : les deux dossiers ont quitté l'état
« geste en attente du porteur » pour l'état « réponse en attente d'un tiers ».
Ce ne sont pas les mêmes ; le second a une échéance.
