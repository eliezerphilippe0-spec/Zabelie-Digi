# 42 — Courriels d'étape 0 — prêts à copier-coller

> **Statut : LIVRABLE. Deux courriels rédigés, zéro code, zéro migration.**
> Rédigés le 2026-08-21.
>
> Ces deux envois sont les actions **les moins chères et les plus bloquantes**
> du projet : chacune coûte un courriel et débloque un dossier entier. Aucune
> ne peut être faite par un agent — elles portent la signature du porteur.

---

## 0. Pourquoi PLUSIEURS courriels et non un

> ⚠️ Ce paragraphe s'appelait « pourquoi DEUX courriels ». Il y en a quatre au
> 2026-08-24 : trois chez Digicel (§1, §1 bis, §1 ter), un chez le conseil
> (§2), un chez NATCOM (§2 bis). Le principe n'a pas bougé, le compte si.

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

## 1 ter. Courriel Digicel — question 7 : montant minimal de `CreatePayment`

**À** : `MFS_B.Services@digicelgroup.com`.

⚠️ **NOUVEAU FIL, et c'est délibéré — l'inverse de la consigne de la forme A.**
Les questions 1 → 6 forment un seul dossier : l'activation de `/v1/Transfert`
et le bac à sable qui va avec. Celle-ci porte sur un **autre endpoint**,
`CreatePayment`, **déjà actif en production sur notre compte**. Ce n'est pas
une demande d'activation, c'est une question de comportement d'API — elle a
toutes les chances d'être traitée par quelqu'un d'autre, et l'accrocher au
dossier Transfert diluerait les deux.

C'est aussi ce qui la distingue d'une troisième relance en vingt-quatre
heures : un fil neuf sur un sujet neuf se lit comme une question, pas comme de
l'insistance.

### Pourquoi elle est posée — une affirmation du dépôt qui n'était pas mesurée

⚠️ **Correction d'une phrase que nous avions écrite au présent de l'indicatif.**
Le commentaire d'en-tête de la migration `0087` affirmait : « un produit à 0
envoyait `{ amount: 0 }` à MonCash, qui refuse ». Relecture faite le
**2026-08-22** : `lib/moncash.ts` transmet le montant tel quel, **il n'y a
aucun plancher, aucun garde, et aucune trace d'un appel à 0 qui aurait
échoué**. C'était une supposition, pas une observation — et elle a servi de
justification à un rail entier.

Le rail « gratis » de `0087` reste bon et il fonctionne : une acquisition à
0 HTG a été menée de bout en bout le 2026-08-22. Ce qui n'est pas établi,
c'est qu'il était **nécessaire**. La réponse de Digicel le dira.

⚠️ **Et la vraie valeur de la question n'est pas le zéro.** Même si 0 est
refusé, connaître le **plancher exact** tranche un arbitrage commercial en
attente : un produit « gratuit » affiché à 1 HTG passerait par MonCash comme
n'importe quel achat, sans rail spécial — mais seulement si le plancher est
bien à 1, et non à 5, 10 ou 25 HTG. Sans ce chiffre, l'option ne peut pas être
évaluée, seulement devinée.

### Objet

```
Montant minimal accepté par /v1/CreatePayment — compte marchand MonCash Business
```

### Corps

```
Bonjour,

Nous exploitons un compte marchand MonCash Business et utilisons
/v1/CreatePayment en production.

  7. Quel est le MONTANT MINIMAL accepté par /v1/CreatePayment ?

     Plus précisément, deux points :

     a) Une transaction de 0 HTG est-elle acceptée ? Notre cas d'usage est
        un article affiché gratuitement sur notre place de marché, pour
        lequel nous souhaiterions que l'acheteur suive le MÊME parcours de
        confirmation que pour un achat payant.

     b) Si 0 est refusé, quel est le plus petit montant admis, et le refus
        se manifeste-t-il par un code d'erreur particulier que nous
        puissions traiter proprement ?

Cette question est indépendante de notre demande d'activation de
/v1/Transfert envoyée le 21 août ; nous ouvrons un fil distinct pour ne pas
mêler les deux dossiers.

Cordialement,
[NOM]
[FONCTION] — [SOCIÉTÉ]
[TÉLÉPHONE] · [COURRIEL]
```

### Ce qu'on fait de la réponse

| Réponse | Conséquence |
|---|---|
| **0 HTG accepté** | Le parcours gratuit peut passer par MonCash, comme demandé par le porteur le 2026-08-22. Le rail `gratis` de `0087` reste en base — il ne se retire pas, `alter type … drop value` n'existe pas en PostgreSQL — mais il cesse d'être le chemin par défaut. La phrase fautive de `0087` se corrige par un commentaire daté dans une migration suivante, jamais en réécrivant le fichier appliqué. |
| **0 refusé, plancher = 1 HTG** | L'option « prix plancher » devient réelle et c'est un **arbitrage porteur**, pas une décision d'implémentation : un article à 1 HTG n'est plus gratuit, et le rail d'accueil « Produits gratuits » perdrait son objet. |
| **0 refusé, plancher > 1 HTG** | L'option « prix plancher » tombe : personne n'affichera un article « gratuit » à 25 HTG. Le rail `gratis` reste la seule voie, et son écran de confirmation (option 3) devient le chantier. |
| **Réponse évasive ou aucune sous 3 semaines** | Consigner à `OPS_TODO` au **2026-09-12**. Le rail `gratis` continue de fonctionner entre-temps : cette question n'en bloque aucun. ⚠️ **C'est ce qui la distingue des six autres** — elle éclaire un choix, elle n'ouvre pas une porte fermée. Elle ne doit donc jamais faire attendre le reste. |

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

## 2 bis. Courriel NATCOM — accès marchand NatCash (rédigé le 2026-08-24)

> **Pourquoi il existe, et pourquoi il ne ressemble pas à une demande d'API.**
>
> Le 2026-08-24, le registre public des FSP agréés de la BRH
> (`docs/03` §9.0) a montré que **NATCOM S.A. est elle-même agréée pour
> NATCASH**. La règle dure n° 2 — « NatCash ⛔, aucune API publique » — reste
> vraie de ce qu'elle décrit, mais elle décrit un obstacle **commercial**.
>
> C'était mot pour mot la situation de MonCash avant l'ouverture du compte
> Business le 2026-08-10. **Zabelie a déjà mené cette conversation une fois.**
>
> Et l'enjeu dépasse NatCash : la voie directe n'ajoute **aucun dépositaire**,
> **aucun frais d'intermédiaire** et **aucun maillon** au montage examiné par
> le conseil (`docs/17`) — les trois objections qui tiennent la fiche Kobara
> fermée (`docs/03` §9.1).

### ⚠️ L'adresse — ce qui est vérifié et ce qui ne l'est pas

**Vérifié** : `customercare@natcom.com.ht` · téléphone **111** · WhatsApp
**3325-111** · site `natcom.com.ht` · siège à Port-au-Prince.

⛔ **C'est une adresse de SERVICE CLIENT, pas un contact marchand.** Une
demande d'intégration marchande y sera probablement mal aiguillée. Aucune
adresse B2B/MFS n'a pu être vérifiée — l'équivalent de
`MFS_B.Services@digicelgroup.com` côté Digicel n'a pas été trouvé.

**Geste recommandé avant l'envoi** : appeler le **111** ou écrire au WhatsApp
**3325-111** en demandant *« l'adresse du service marchand / entreprise
NatCash pour une demande d'intégration »*. Deux minutes, et le courriel part
au bon endroit. À défaut, envoyer à `customercare@` en demandant explicitement
le transfert — c'est la première ligne du corps ci-dessous.

### Objet

```
Demande d'accès marchand NatCash — encaissement en ligne pour une place de marché haïtienne
```

### Corps

```
Bonjour,

Si ce message ne relève pas de votre service, merci de le transmettre à
l'équipe NatCash Entreprise / Marchands — notre demande porte sur un
accès marchand, non sur un compte particulier.

Nous exploitons une place de marché haïtienne en ligne. Les acheteurs y
règlent des vendeurs haïtiens en gourdes ; la plateforme encaisse, prélève
une commission et reverse le vendeur.

  • Raison sociale : [À REMPLIR]
  • Site : [À REMPLIR]
  • Contact technique : [À REMPLIR]
  • Volume actuel : phase de lancement — premières transactions réelles

Nous encaissons aujourd'hui par MonCash via son API REST (compte marchand
Business, vérification serveur-à-serveur). Nous souhaitons proposer NATCASH
à nos acheteurs, en DIRECT avec NATCOM plutôt que par un agrégateur tiers.

Nos questions, dans l'ordre où elles nous bloquent :

  1. ACCÈS. Existe-t-il un programme marchand NatCash permettant à un
     commerce en ligne d'encaisser des paiements NatCash par API ? Quelle
     est la démarche, quelles pièces fournir, et sous quel délai ?

  2. AGRÉMENT. Nous avons relevé NATCOM S.A. dans le registre des
     Fournisseurs de Services de Paiement agréés publié par la BRH.
     Pouvez-vous nous confirmer la référence de cet agrément ? Nous en
     avons besoin pour notre propre dossier de conformité.

  3. DOCUMENTATION ET BAC À SABLE. Une documentation d'API est-elle
     disponible, et un environnement de test ?

     ⚠️ Une précision qui nous a coûté cher sur l'autre rail : nous ne
     demandons pas seulement des identifiants marchands de test. Nous
     demandons un COMPTE DE TEST CAPABLE DE PAYER — le côté acheteur.
     Sans lui, un bac à sable ne permet de dérouler que la moitié du
     parcours, et la première preuve de bout en bout se fait alors avec de
     l'argent réel. Existe-t-il un tel compte ?

  4. CONFIRMATION DU PAIEMENT. Notre règle interne est qu'aucun paiement
     n'est réputé reçu sur la seule redirection du navigateur. Proposez-vous
     (a) un webhook SIGNÉ, et/ou (b) un endpoint de vérification d'état
     serveur-à-serveur interrogeable par référence de commande ?

     Si webhook signé : quel algorithme de signature, sur quel contenu
     exact, et avec quelle fenêtre d'horodatage ?

  5. IDEMPOTENCE. Pouvons-nous transmettre une référence externe à la
     création du paiement, de sorte qu'un appel rejoué après un délai
     d'attente dépassé soit traité comme un doublon et non comme un second
     paiement ?

  6. RÈGLEMENT. C'est la question la plus importante pour nous :

     (a) Les sommes encaissées sont-elles reversées sur un COMPTE BANCAIRE
         à notre nom, ou restent-elles dans un portefeuille NatCash jusqu'à
         un retrait de notre part ?
     (b) À quelle fréquence, et sous quel délai ?
     (c) Existe-t-il un plafond de RETRAIT — par jour, par mois ?

  7. PLAFONDS D'ENCAISSEMENT — par transaction, par jour, par acheteur.

  8. FRAIS — quel pourcentage ou montant fixe, prélevé sur quoi, et à la
     charge de qui ?

  9. CONDITIONS D'USAGE. L'encaissement par une plateforme pour le compte
     de vendeurs tiers, avec reversement après commission, entre-t-il dans
     le cadre prévu par votre service marchand ?

 10. AGRÉGATEURS. À défaut d'accès direct, travaillez-vous avec des
     partenaires agréés pour l'encaissement NatCash ? Si oui, lesquels
     recommandez-vous, et sont-ils eux-mêmes enregistrés comme FSP auprès
     de la BRH ?

Nous ne développerons rien avant votre réponse.

Nous restons disponibles pour tout document complémentaire — statuts,
justificatifs, description détaillée du flux de fonds.

Cordialement,
[NOM]
[FONCTION] — [SOCIÉTÉ]
[TÉLÉPHONE] · [COURRIEL]
```

### Ce qui est délibéré dans ce courriel

| Choix | Raison |
|---|---|
| **La question 3 insiste sur le compte PAYEUR de test** | C'est la leçon la plus chère de `docs/05` : le bac à sable MonCash n'a jamais pu prouver la moitié aval, faute d'un compte capable de payer. La poser d'emblée coûte une ligne ; la découvrir plus tard coûte un chantier |
| **La question 6 avant les plafonds et les frais** | Un tarif se négocie, un **dépositaire** ne se défait pas. Savoir si l'argent des vendeurs dort dans un portefeuille NatCash ou arrive sur un compte bancaire au nom de la plateforme change la nature du dossier `docs/17`. C'est la question que personne n'avait posée à Kobara non plus |
| **La question 2 demande l'agrément** | Il est public (`docs/03` §9.0) — la demander sert à obtenir la **référence** pour le dossier de conformité, et à ouvrir la question 10 sans qu'elle paraisse méfiante |
| **La question 10 sur les agrégateurs** | Si NATCOM répond « passez par X », c'est la réponse la plus autorisée qu'on puisse obtenir sur Kobara et ses concurrents. Et elle est gratuite |
| **La question 9 en toutes lettres** | Un service techniquement ouvert peut être contractuellement réservé à d'autres usages. Même piège que la question 4 du courriel Digicel |
| **Aucun secret, aucun identifiant** | Règle d'or `docs/11`. Le `client_id` MonCash n'a rien à faire ici non plus : autre opérateur, autre dossier |
| **« Nous ne développerons rien avant votre réponse »** | Étape 0 de `docs/03` §9, dite au fournisseur. Ce n'est pas une politesse : c'est la règle dure n° 2 |

### Ce qu'on fait de la réponse

| Réponse | Conséquence |
|---|---|
| **Accès direct accordé** | Fiche d'étape 0 ouverte pour NatCash **en direct**. Aucun dépositaire ajouté, aucun frais d'intermédiaire. La fiche Kobara devient probablement sans objet |
| **Q6(a) : règlement sur compte bancaire à notre nom** | ⭐ La rétention n'augmente pas d'un maillon. À verser au dossier `docs/17` et à la relance du conseil |
| **Q6(a) : les fonds restent en portefeuille NatCash** | Un dépositaire de plus, comme avec un agrégateur. L'avantage de la voie directe se réduit aux frais et à la fiabilité |
| **Q10 : un agrégateur recommandé, avec son agrément** | Réponse autorisée à la question ouverte de `docs/03` §9.1. Le comparatif Kobara / Tchotchom / autres se tranche là |
| **Refus, ou Q9 négative** | NatCash n'existe pas pour cet usage. On l'écrit dans `docs/03` §1 et on n'y revient plus — comme pour un rail qui ne peut pas exister |
| **Aucune réponse sous 3 semaines** | Consigner l'absence dans `OPS_TODO`. C'est une donnée, pas un vide (§3.1) |

⚠️ **Ce courriel ne lève aucun gel.** Même statut que les deux précédents :
tant que la réponse n'est pas là, rien ne se code sur NatCash, et la fiche
Kobara reste fermée par le blocage BRH de `docs/03` §9.1 — qui, lui, ne dépend
pas de NATCOM.

---

## 2 ter. Courriel SOGEBANK — SogePay, et le prérequis d'entité étrangère

> **Ce courriel vise plus gros que NatCash, et il faut le dire d'emblée.**
>
> `docs/03` §1 bloque **Stripe ET Zelle** sur un même prérequis : une **entité
> étrangère *merchant of record***, parce qu'Haïti n'est pas un pays marchand
> supporté. Deux rails construits, testés, et inutilisables — c'est-à-dire
> **toute la diaspora**, marché explicitement visé par `CLAUDE.md`.
>
> **Une banque haïtienne qui affilie des marchands haïtiens n'a pas ce
> problème.** Si SogePay encaisse la carte bancaire sans entité étrangère,
> elle lève un blocage vieux de V-10. C'est une **hypothèse**, pas un fait :
> c'est exactement ce que ce courriel va vérifier.

### ⚠️ Ce n'est PAS d'abord un courriel — c'est un formulaire

**Vérifié** : la page `sogebank.com/entites-du-groupe-sogebank/sogepay/` porte
un menu **« Affiliation Commerçant »**, et un formulaire SogePay (PDF) figure
parmi `sogebank.com/nos-formulaires/`. Téléphones : **(509) 2229-5000** ·
**(509) 2815-5000**. Page de contact : `sogebank.com/contactez-nous/`.

⛔ **Aucune adresse électronique n'a pu être vérifiée.** Ne pas en inventer
une.

**Ordre recommandé** : (1) télécharger le formulaire d'affiliation et le lire —
il répond peut-être déjà à la moitié des questions ci-dessous ; (2) appeler le
**2229-5000** pour obtenir l'interlocuteur SogePay et son adresse ; (3)
envoyer ce texte **en accompagnement** du formulaire, pas à la place.

⚠️ Et une question à poser au téléphone avant tout le reste, parce qu'elle
peut arrêter le dossier en une phrase : **faut-il déjà être client Sogebank
(compte entreprise ouvert) pour être affilié SogePay ?**

### Objet

```
Affiliation SogePay — encaissement par carte pour une place de marché haïtienne (questions préalables)
```

### Corps

```
Bonjour,

Nous exploitons une place de marché en ligne haïtienne : des vendeurs
haïtiens y proposent des produits et des services, les acheteurs règlent en
ligne, et la plateforme reverse chaque vendeur après prélèvement d'une
commission.

  • Raison sociale : [À REMPLIR]
  • Site : [À REMPLIR]
  • Contact technique : [À REMPLIR]
  • Encaissement actuel : MonCash (API REST, compte marchand Business)

Nous souhaitons ouvrir le paiement par CARTE BANCAIRE, principalement pour
la diaspora haïtienne. Nous préparons une demande d'affiliation SogePay et
souhaitons vérifier quelques points avant de la déposer.

A. ÉLIGIBILITÉ — la question qui commande toutes les autres

  1. L'affiliation SogePay est-elle ouverte à une société de droit
     haïtien, sans qu'une entité étrangère soit requise ?

     Nous posons la question parce que les solutions internationales que
     nous avons étudiées exigent une société établie hors d'Haïti pour
     agir comme « merchant of record ». Si SogePay ne l'exige pas, cela
     change entièrement notre feuille de route.

  2. Faut-il être titulaire d'un compte entreprise Sogebank au préalable ?
     Quelles pièces sont demandées (statuts, patente, NIF, autres) ?

B. CARTES ET DEVISES

  3. Quels réseaux de cartes sont acceptés (Visa, Mastercard, autres) ?

  4. Les cartes ÉMISES À L'ÉTRANGER sont-elles acceptées — notamment les
     cartes américaines et canadiennes ? C'est notre cas d'usage
     principal : la diaspora achète pour des proches en Haïti.

  5. Dans quelle devise pouvons-nous facturer (HTG, USD), et dans quelle
     devise sommes-nous réglés ?

C. INTÉGRATION TECHNIQUE

  6. Une documentation d'API est-elle disponible avant l'affiliation, ou
     seulement après ? Existe-t-il un environnement de TEST avec des
     cartes de test ?

  7. Comment un paiement est-il confirmé côté serveur ? Nous n'acceptons
     jamais la seule redirection du navigateur comme preuve. Proposez-vous
     un webhook SIGNÉ, et/ou un endpoint de vérification d'état
     interrogeable par référence de commande ?

  8. Pouvons-nous transmettre une référence d'idempotence, afin qu'un
     appel rejoué après un délai d'attente dépassé ne produise pas un
     second débit ?

  9. Le 3-D Secure est-il appliqué, et sous quelle forme ?

D. RÈGLEMENT ET FRAIS

 10. Sur quel compte les fonds sont-ils versés, et sous quel délai après
     la transaction ? Y a-t-il une retenue de garantie (rolling reserve) ?

 11. Quels sont les frais — pourcentage, montant fixe, différence entre
     carte locale et carte étrangère ?

E. DEUX POINTS PROPRES À NOTRE ACTIVITÉ

 12. USAGE PLACE DE MARCHÉ. Nous encaissons pour le compte de VENDEURS
     TIERS, puis les reversons après commission. Cet usage entre-t-il dans
     le cadre de l'affiliation SogePay, ou relève-t-il d'un contrat
     particulier ? Nous préférons poser la question maintenant plutôt que
     de la découvrir à la première contestation.

 13. IMPAYÉS ET CONTESTATIONS (chargebacks). C'est notre principale
     inquiétude technique, et elle n'existe pas sur le rail mobile :

     (a) Quel est le délai maximal de contestation d'un paiement par
         carte ?
     (b) Qui en supporte la charge, et selon quelle procédure ?
     (c) Le montant est-il repris sur nos versements ultérieurs ?

     Nous demandons parce que notre modèle règle le vendeur quelques jours
     après la vente. Si une contestation peut survenir APRÈS ce règlement,
     nous devons le prévoir dans notre dispositif avant d'ouvrir le rail,
     pas après.

F. UNE QUESTION CONNEXE — MAGO

 14. Nous avons relevé MAGO parmi les fournisseurs de services de paiement
     agréés par la BRH. Existe-t-il une offre d'ENCAISSEMENT MARCHAND sur
     MAGO, comparable à SogePay mais en portefeuille électronique ? Si
     oui, nous serions intéressés par la même série de questions.

Nous ne développerons rien avant vos réponses.

Nous restons disponibles pour un rendez-vous et pour fournir tout document
complémentaire.

Cordialement,
[NOM]
[FONCTION] — [SOCIÉTÉ]
[TÉLÉPHONE] · [COURRIEL]
```

### Ce qui est délibéré dans ce courriel

| Choix | Raison |
|---|---|
| **La question 1 est la première, et elle est expliquée** | C'est la seule qui peut rendre tout le reste inutile — ou débloquer deux rails d'un coup. En donner la raison évite qu'on y réponde « oui » machinalement |
| **La question 4 sépare les cartes étrangères** | Une banque haïtienne peut parfaitement accepter les cartes locales et refuser les étrangères. Or **c'est la diaspora qui paie par carte** : une réponse négative en 4 vide la question 1 de son intérêt |
| **⚠️ Le bloc 13 sur les contestations** | ⚠️ **CORRIGÉ dans l'heure : j'avais écrit « ce risque n'est dans aucun document du dépôt ». C'est FAUX**, et la vérité est pire. `0043_fulfillment.sql:72` — **appliquée en production** — justifie le J+7 par : *« MonCash n'a PAS de rétrofacturation. Le J+7 digital protège d'une contestation bancaire qui n'existe pas sur ce rail. »* Le dépôt n'ignorait pas les contestations : **il a fondé sa maturation sur leur ABSENCE.** Ouvrir la carte n'ajoute donc pas un risque à un dispositif existant — **ça invalide la justification écrite du dispositif**. Voir `docs/03` §1 bis |
| **La question 12 en toutes lettres** | Beaucoup d'acquéreurs interdisent l'encaissement pour compte de tiers sans contrat spécifique. Même piège que la question 4 du courriel Digicel et la 9 du courriel NATCOM |
| **MAGO en fin, comme question unique** | `docs/42` §0 dit de ne pas mélanger deux dossiers découplés. Ici l'interlocuteur est le même et la décision est la même : ce n'est pas un second dossier, c'est **une question de plus au même guichet**. La mélanger en tête aurait en revanche brouillé le sujet principal |
| **Aucun secret, aucun identifiant** | Règle d'or `docs/11` |

### Ce qu'on fait de la réponse

| Réponse | Conséquence |
|---|---|
| **Q1 : pas d'entité étrangère requise** ET **Q4 : cartes étrangères acceptées** | ⭐ **Le blocage V-10 tombe.** La diaspora devient adressable sans société à l'étranger. À écrire dans `docs/03` §1, qui affirme aujourd'hui le contraire pour Stripe et Zelle |
| **Q1 : oui, mais Q4 : cartes locales seulement** | Le rail sert le marché intérieur, pas la diaspora. Utile, mais ça ne remplace pas Stripe — et l'arbitrage change |
| **Q13 : contestation possible après J+7** | ⛔ **Zone d'arrêt.** Le rail ne s'ouvre pas avant que le dispositif de reprise soit spécifié. Ouvrir la carte sans ça expose la plateforme à un débit qu'aucun mécanisme actuel ne couvre |
| **Q12 : usage place de marché hors cadre** | Le rail n'existe pas pour cet usage. On l'écrit et on n'y revient plus |
| **Q14 : encaissement MAGO existe** | Une piste de rail mobile **agréée FSP**, alternative directe aux agrégateurs de `docs/03` §9.1 |
| **Aucune réponse sous 3 semaines** | Consigner dans `OPS_TODO` (§3.1) |

⚠️ **Ce courriel ne lève aucun gel** — même statut que les autres. Et il ne
touche **pas** au dossier `docs/17` : la question de la rétention du net
vendeur reste entière quel que soit le rail d'encaissement.

---

## 3. Registre — état des envois

| Envoi | Destinataire | Date d'envoi | Date de réponse | Statut |
|---|---|---|---|---|
| §1 — activation `/v1/Transfert` | Digicel MFS Business | **2026-08-21** | — | 📤 **ENVOYÉ — en attente de réponse** |
| §1 bis — **complément, question 6** (forme A) | Digicel MFS Business | **2026-08-21** | — | 📤 **ENVOYÉ — en attente de réponse** (réponse dans le fil du courriel principal) |
| §1 ter — **question 7**, montant minimal de `CreatePayment` | Digicel MFS Business | **2026-08-22** | — | 📤 **ENVOYÉ — en attente de réponse.** Fil DISTINCT de celui du 21 août : autre endpoint, déjà actif en production. ⚠️ Déclaré par le porteur en session ; les deux fuseaux concordaient au moment de l'envoi (15h47 Haïti / 19h47 UTC), donc pas d'ambiguïté de date à lever ici. |
| §2 — qualification Q1 + Q2 | HDIT / Cabinet Volmar — `info@hditcabinetvolmar.com` | **2026-08-21** | — | 📤 **ENVOYÉ — en attente de réponse.** Adresse et formule de politesse corrigée confirmées par le porteur. ⚠️ Boîte **générique** : voir §2 pour ce que ça change à la relance. |
| §2 bis — **accès marchand NatCash** | NATCOM S.A. — ⚠️ adresse marchande **à obtenir** (111 / WhatsApp 3325-111) ; `customercare@natcom.com.ht` est du service client | **rédigé 2026-08-24** | — | ⏳ **NON ENVOYÉ** — en attente de l'adresse B2B, ou d'un envoi assumé à `customercare@` avec demande de transfert |
| §2 ter — **affiliation SogePay** (+ MAGO) | Sogebank — ⚠️ **aucune adresse vérifiée** ; formulaire « Affiliation Commerçant » + tél. (509) 2229-5000 | **rédigé 2026-08-24** | — | ⏳ **NON ENVOYÉ** — passer par le FORMULAIRE d'abord ; ce texte l'accompagne, il ne le remplace pas |

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
| ✅ ~~**Envoi de la question 7** (§1 ter)~~ | ~~dès que possible~~ | **FAIT le 2026-08-22**, en fil distinct. |
| **Absence de réponse = une donnée** — 3 semaines | **2026-09-11** | Consigner l'absence à `OPS_TODO`, pour les deux dossiers (Digicel et Volmar) |
| **Question 7 sans réponse** — 3 semaines | **2026-09-12** | Consigner à `OPS_TODO`. ⚠️ Ne bloque rien : le rail `gratis` fonctionne et une acquisition à 0 HTG est passée de bout en bout le 2026-08-22. Cette question éclaire un CHOIX (parcours MonCash pour les gratuits, ou plancher à 1 HTG), elle n'ouvre pas une porte fermée. |

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
