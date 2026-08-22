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

  6. Comment obtient-on des COMPTES DE TEST pour l'environnement bac à
     sable ? Nous savons créer un business de test et générer un
     client_id/client_secret depuis le portail bac à sable. Ce qui nous
     manque est l'autre côté : un compte MonCash capable de PAYER en bac à
     sable, pour dérouler un paiement de bout en bout.

     Nos tentatives de créer un numéro de test par nous-mêmes ont toutes
     échoué, et nous n'avons trouvé aucune procédure documentée.

     La même question vaut pour le service de versement : y a-t-il un
     numéro bénéficiaire de test permettant d'éprouver un /v1/Transfert
     sans mouvement de fonds réel ?

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
| **Q6 : comptes de test fournis** | `docs/05` devient parcourable **au-delà de l'étape 1** — la seule qui l'ait jamais été. **Premier geste, avant tout code de versement.** |
| **Q6 : aucun compte de test payeur n'existe** | Le bac à sable ne peut pas prouver la moitié aval du rail. La seule voie restante est la première commande RÉELLE (`docs/22`), montant minimal et remboursement immédiat. À écrire dans `docs/05` comme une **impossibilité**, pas comme une étape en attente. |

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

### ✅ La question 6 est PARTIE — complément envoyé le 2026-08-21

**Les six questions sont désormais chez Digicel.** Le courriel principal
(questions 1 → 5) est parti le **2026-08-21** ; la question 6, rédigée le même
jour **après l'envoi**, a suivi le **2026-08-21** sous forme de **complément**
(forme A ci-dessous), en réponse dans le même fil.

*(Déclaré par le porteur en session. Voir l'avertissement du §3 : l'agent n'a
accès ni à la boîte d'envoi ni aux accusés de réception — c'est une déclaration
fiable et c'est la seule disponible, mais elle ne se lit pas comme une mesure.)*

⚠️ **CE QUE ÇA CHANGE POUR LA SUITE : la forme B ne repose plus la question 6.**
Elle n'a plus qu'un seul office — **réclamer** une réponse à l'ensemble, à
partir du 2026-09-01. Reposer une question déjà posée serait exactement le
défaut que la section suivante existe pour éviter.

**Ne pas renvoyer le corps entier.** Un fournisseur qui reçoit deux fois la
même demande répond une fois de moins.

⚠️ **ET IL Y A DEUX LETTRES, PAS UNE — la distinction est datée, pas
stylistique.** Elle a été tranchée le 2026-08-21, et voici pourquoi elle
comptait : envoyer une *relance* le jour même du premier courriel reviendrait à
réclamer une réponse à un message vieux de quelques heures — le meilleur moyen
de faire passer les deux pour du bruit. Un *complément* est au contraire normal
et bien reçu. **C'est la forme A qui est partie.**

| Forme | Quand | Ce qu'elle fait | État |
|---|---|---|---|
| **A — Complément** | **immédiatement**, en RÉPONSE dans le même fil | ajoute une question omise. **Ne réclame rien.** | ✅ **ENVOYÉE le 2026-08-21** |
| **B — Relance** | à partir du **2026-09-01** (7 j ouvrables) | réclame une réponse à l'ensemble. ⚠️ **Ne repose PAS la question 6**, elle est partie avec A. | ⏳ en réserve |

Les deux corps restent ci-dessous : A pour la trace de ce qui a été envoyé,
B pour l'échéance du 2026-09-01.

#### A — Complément, à envoyer maintenant (répondre dans le fil du 21 août)

**À** : `MFS_B.Services@digicelgroup.com` — **par courriel, et nulle part
ailleurs.** Il n'y a rien à déposer : ni portail, ni formulaire, ni système de
tickets. C'est la seule adresse Digicel du dépôt, et celle du message du
21 août.

> **Répondre au message envoyé**, ne pas ouvrir un nouveau fil : l'objet et
> l'historique voyagent avec, et le destinataire voit d'un coup d'œil que c'est
> le même dossier. Concrètement : dossier *Envoyés*, message du 21 août,
> **Répondre**.
>
> Ce n'est pas une préférence de forme. Chez un service qui traite les demandes
> marchands en file, un message neuf devient un **second dossier sans lien avec
> le premier** — et les six questions cessent d'être groupées. C'est
> exactement ce qu'on cherche à éviter en n'envoyant pas une relance le jour
> même.
>
> ⚠️ **Le 202 n'est pas une voie alternative pour CE message.** Il est réservé
> à la relance en cas de silence sous sept jours ouvrables (§3.1) : un appel ne
> transmet pas une question technique en six points.

**Si le fil est introuvable**, ce n'est plus une réponse : retirer le `Re:`,
remettre l'objet complet suivi de « — complément », et rappeler en une ligne
au-dessus de la question 6 **l'identifiant du compte marchand (`client_id`) et
la date du premier envoi**, pour que Digicel puisse rapprocher les deux.

```
Objet : Re: Activation de l'endpoint /v1/Transfert sur notre compte marchand MonCash Business

Bonjour,

En complément de notre message de ce jour, une question que nous avions
omise :

  6. Comment obtient-on des COMPTES DE TEST pour l'environnement bac à
     sable ? Nous savons créer un business de test et générer un
     client_id/client_secret depuis le portail bac à sable. Ce qui nous
     manque est l'autre côté : un compte MonCash capable de PAYER en bac à
     sable, pour dérouler un paiement de bout en bout.

     Nos tentatives de créer un numéro de test par nous-mêmes ont toutes
     échoué, et nous n'avons trouvé aucune procédure documentée.

     La même question vaut pour le service de versement : y a-t-il un
     numéro bénéficiaire de test permettant d'éprouver un /v1/Transfert
     sans mouvement de fonds réel ?

Merci de la traiter avec les cinq précédentes.

Cordialement,
[NOM]
[FONCTION] — [SOCIÉTÉ]
[TÉLÉPHONE] · [COURRIEL]
```

#### B — Relance, à partir du 2026-09-01 seulement

**À** : `MFS_B.Services@digicelgroup.com`, toujours **en réponse dans le fil**.
**Copie** : service client **202**, qui devient pertinent à ce stade — sept
jours ouvrables de silence justifient un second canal, ce que le jour même ne
justifiait pas.

⚠️ **RÉÉCRITE LE 2026-08-21, APRÈS L'ENVOI DE A.** Elle portait
« Nous y ajoutons une question que nous avions omise : 6. [même texte] ».
**La question 6 est partie avec le complément A** — la reposer donnerait au
destinataire l'impression qu'on ne suit pas son propre dossier, et c'est
précisément ce qu'une relance doit éviter. B ne fait donc plus qu'une chose :
**réclamer une réponse aux six questions déjà posées.**

```
Objet : Re: Activation de l'endpoint /v1/Transfert sur notre compte marchand MonCash Business

Bonjour,

Nous revenons vers vous au sujet de nos messages du 21 août 2026 concernant
l'endpoint /v1/Transfert — six questions au total, restées à ce jour sans
réponse.

Pourriez-vous nous indiquer si le dossier a pu être pris en charge, et sous
quel délai nous pouvons espérer un retour ? À défaut, nous serions
reconnaissants qu'il soit orienté vers le service compétent.

Nous demeurons disponibles pour tout document complémentaire — statuts,
justificatifs, description du flux.

Cordialement,
[NOM]
[FONCTION] — [SOCIÉTÉ]
[TÉLÉPHONE] · [COURRIEL]
```

⚠️ **A est partie, donc B ne peut plus qu'être une relance.** L'ordre A → B à
dix jours d'écart est celui qui a eu lieu et il est cohérent : A ajoutait, B
réclamera. Ce qu'il ne faut plus faire, c'est renvoyer A — les six questions
sont chez Digicel, les redemander serait réclamer deux fois.

⚠️ **Et si un retour arrive avant le 2026-09-01, B ne part pas du tout.**
Une échéance de relance s'annule sur réponse ; elle ne se déclenche pas parce
que la date est arrivée.

### Pourquoi elle compte — un échec mesuré, pas une précaution

Deux faits du 2026-08-21, qui n'en font qu'un :

- le porteur rapporte que **toutes ses tentatives de créer un numéro de
  téléphone de test ont échoué** ;
- la base montre **cinq commandes du 11 au 14 août, cinq paiements `failed`**,
  motif `moncash_unknown_48h` — MonCash répond 404, `provider_ref` null sur les
  cinq. La création marchait ; rien n'aboutissait de l'autre côté.

*Il n'y avait personne pour payer.* Les deux observations sont le même fait vu
de deux côtés.

L'asymétrie qu'elle expose est le fait utile : **le côté MARCHAND est
libre-service** (créer un business de test dans le portail bac à sable, puis
`Create ClientRestAPI` → `client_id`/`client_secret`), **le côté PAYEUR ne
l'est pas** — aucune procédure publique, aucun numéro de test documenté. Or un
paiement a besoin des deux.

Conséquence, écrite en tête de `docs/05` : **les neuf étapes de la checklist
bac à sable n'ont jamais été franchies**, et chacun de leurs « ✅ Attendu » est
une prédiction, pas une observation. Le chemin de l'argent est aujourd'hui
prouvé par des tests SQL et par rien d'autre — ils éprouvent la base, jamais
l'aller-retour avec MonCash.

Cette question ne coûte rien de plus : elle voyage avec les cinq autres.

---

## 2. Courriel HDIT / Cabinet Volmar — deux questions numérotées

**À** : `info@hditcabinetvolmar.com` — HDIT / Cabinet Volmar.

> **Adresse établie le 2026-08-21**, déclarée par le porteur au moment de
> l'envoi. La version précédente de cette ligne portait « aucune adresse
> nominative n'est connue du dépôt, seulement le domaine
> `hditcabinetvolmar.com` » — c'était exact, et c'est ce qui a évité de la
> croire acquise.
>
> ✅ **Le courriel parti porte la formule corrigée** (« Je vous prie d'agréer,
> Maître, l'expression de ma considération distinguée »), et non le
> « Cordialement » de la première rédaction. Vérifiable par les horloges : la
> correction est entrée dans `main` avec la PR #163, fusionnée le 2026-08-21 à
> **23:46 UTC = 19:46 heure d'Haïti** — soit avant l'envoi.
>
> ⚠️ **C'est une adresse GÉNÉRIQUE, pas un destinataire nommé**, et ça a une
> conséquence de suivi : un `info@` arrive dans une boîte partagée, où un
> courriel non attribué peut rester sans propriétaire. Si aucune réponse
> n'arrive à l'échéance, la relance ne consiste pas à réécrire à la même
> adresse — elle consiste à **demander le nom de l'avocat en charge**, par
> téléphone si le site en donne un. Une seconde copie dans une boîte partagée
> ne change rien à qui s'en saisit.
**Pièces jointes** : `docs/17-DOSSIER-BRH-RETENTION.md` et
`docs/36-DOSSIER-RETENTION-KYC.md`, exportés en PDF.

> **Où les trouver, et comment les exporter** — la question s'est posée le
> 2026-08-21, ce qui prouve que « exportés en PDF » ne suffisait pas.
>
> Ce sont **deux fichiers de ce dépôt**, à la racine de `docs/`. Trois façons
> d'y accéder :
>
> | Voie | Comment |
> |---|---|
> | **Sur GitHub** | `github.com/eliezerphilippe0-spec/Zabelie-Digi/blob/main/docs/17-DOSSIER-BRH-RETENTION.md` (idem pour `36-…`) — bouton **Raw** pour le texte brut |
> | **En local** | `docs/17-DOSSIER-BRH-RETENTION.md` et `docs/36-DOSSIER-RETENTION-KYC.md` |
> | **En HTML prêt à imprimer** | demander à l'agent : il convertit le Markdown en HTML autonome, contrôle la fidélité (mots, titres, tableaux) et l'envoie |
>
> **L'export PDF se fait au navigateur** : ouvrir le HTML → `Ctrl+P` / `⌘P` →
> « Enregistrer au format PDF ». ⚠️ **LibreOffice est installé sur la machine
> de l'agent mais refuse d'importer ces HTML** — mesuré le 2026-08-21, deux
> tentatives dont une avec `--infilter="HTML (StarWriter)"` et un profil
> dédié : `Error: source file could not be loaded`. Le navigateur rend un
> meilleur résultat de toute façon (tableaux, sauts de page, polices).
>
> ⚠️ **Envoyer le PDF, pas le `.md`.** Un cabinet qui reçoit un fichier
> Markdown voit du texte truffé de `#`, de `**` et de barres verticales : le
> tableau de la §2.5 — celui qui montre que la table `payouts` existe sans
> route de décaissement — devient illisible, et c'est l'une des deux pièces
> qui portent la démonstration.

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

Je vous prie d'agréer, Maître, l'expression de ma considération distinguée.

[NOM]
[FONCTION] — [SOCIÉTÉ]
[TÉLÉPHONE] · [COURRIEL]
```

⚠️ **La formule de politesse n'est pas décorative, et la première rédaction
était fautive.** Elle portait « Cordialement », qui convient à un service
d'entreprise et **pas à un avocat**. À un membre du barreau, l'usage français
demande une formule complète, reprenant le titre d'adresse employé à
l'ouverture :

> *Je vous prie d'agréer, Maître, l'expression de ma considération distinguée.*

Deux règles à retenir, parce qu'elles se corrigent en dix secondes et se
remarquent immédiatement :

- **L'ouverture est « Maître, »** — seule, sans « Bonjour » ni « Cher ». C'est
  le titre professionnel, il tient lieu de salutation.
- **La clôture reprend ce même titre**, encadré de virgules. Une formule qui ne
  le reprend pas sonne comme un copier-coller d'un autre courrier.

**Ne pas « corriger » les courriels Digicel dans l'autre sens** : « Cordialement »
y est juste. On écrit à un service d'entreprise, pas à un officier ministériel,
et une formule solennelle y serait aussi déplacée que l'inverse ici.

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
| §1 bis — **complément, question 6** (forme A) | Digicel MFS Business | **2026-08-21** | — | 📤 **ENVOYÉ — en attente de réponse** (réponse dans le fil du courriel principal) |
| §2 — qualification Q1 + Q2 | HDIT / Cabinet Volmar — `info@hditcabinetvolmar.com` | **2026-08-21** | — | 📤 **ENVOYÉ — en attente de réponse.** Adresse et formule de politesse corrigée confirmées par le porteur. ⚠️ Boîte **générique** : voir §2 pour ce que ça change à la relance. |

> Ce tableau se remplit à la main, au moment de l'envoi. Une case vide veut
> dire « pas envoyé », jamais « on ne sait plus » — c'est la différence entre
> l'absence de signal et le signal d'absence.
>
> **Les dates de ce tableau sont déclarées par le porteur en session, pas
> observées.** L'agent n'a accès ni à la boîte d'envoi ni aux accusés de
> réception. C'est une déclaration fiable et c'est la seule disponible — mais
> elle ne se lit pas comme une mesure, et une session future qui aurait besoin
> de la date exacte doit remonter à l'accusé d'envoi, pas à cette ligne.
>
> ⚠️ **ET ELLES SONT EN HEURE D'HAÏTI, PAS EN UTC.** Constaté le 2026-08-21 :
> l'agent annonçait le 22 pendant que le porteur écrivait « aujourd'hui le
> 21 » — les deux avaient raison. Haïti est à **UTC−4** ; entre 20 h et minuit
> à Port-au-Prince, l'horloge de l'agent est **déjà au lendemain**.
>
> Les deux familles d'horodatage de ce dépôt ne se comparent donc pas
> directement :
>
> | Source | Fuseau |
> |---|---|
> | Ce tableau, `OPS_TODO`, tout ce qui est déclaré par le porteur | **heure d'Haïti** |
> | `zabelie_schema_migrations.applied_at`, journaux Supabase, CI GitHub, Vercel | **UTC** |
>
> Une session qui rapprocherait « migration appliquée le 22 à 00:30 » d'un
> « courriel envoyé le 21 » conclurait à un écart d'un jour là où il y a une
> demi-heure. **Convertir avant de comparer, ou dire dans quel fuseau on
> parle.**

### 3.1 Échéances — pour que l'attente ait une fin

Une attente sans date de reprise devient un abandon silencieux. Les deux
échéances sont calculées depuis le **vendredi 2026-08-21** :

| Échéance | Date | Geste |
|---|---|---|
| ✅ ~~**Complément Digicel — question 6** (§1, forme A)~~ | ~~immédiat~~ | **FAIT le 2026-08-21.** Les six questions sont chez Digicel. |
| **Relance Digicel** — 7 jours ouvrables (§1, forme B) | **2026-09-01** | Service client **202** en copie, en citant l'objet du courriel. ⚠️ **Ne repose PAS la question 6** — elle est partie avec A : B réclame une réponse aux six, rien de plus. ⚠️ **Ne part pas du tout si un retour arrive avant** : une échéance de relance s'annule sur réponse, elle ne se déclenche pas parce que la date est arrivée. |
| **Absence de réponse = une donnée** — 3 semaines | **2026-09-11** | Consigner l'absence à `OPS_TODO`, pour les deux dossiers (Digicel et Volmar) |

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
