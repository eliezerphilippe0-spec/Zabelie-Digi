# Question BRH — Programme de fidélité (points)

> Mémo prêt à envoyer à un juriste bancaire/fintech ou à la Direction des
> systèmes de paiement de la BRH. Rattaché au brouillon **PR #12** (migration
> `0020_points_rewards`), **gelé** tant que cette position n'est pas obtenue.

---

**Objet : Demande de position — programme de fidélité (points) et statut de revendeur télécom**

Bonjour,

Je développe **Zabelie**, une plateforme haïtienne de vente de produits
digitaux et de revente de recharge téléphonique (Digicel / Natcom, via un
agrégateur international). Notre positionnement réglementaire est assumé et
constant : **revendeur télécom et commerçant, jamais émetteur de monnaie
électronique**, conformément au cadre de la **Circulaire BRH n° 121**.

Nous envisageons d'ajouter un **programme de fidélité** : l'acheteur cumule des
« points » sur ses achats, qu'il peut ensuite échanger.

**Ma question, précise :**

> Un solde de points acheteur — convertible **uniquement** en remise en
> **pourcentage**, **plafonnée**, **non transférable** et **non retirable en
> espèces** — est-il compatible avec un statut de **revendeur télécom
> non-émetteur de monnaie électronique**, ou bascule-t-il vers un régime de
> monnaie électronique / instrument de paiement nécessitant un agrément ?

**Garde-fous déjà intégrés dans notre conception (pour information) :**

- Les points n'ont **aucune valeur en gourdes** affichée ni aucun taux de
  change fixe communiqué comme un « solde » ;
- Ils ne se convertissent qu'en **coupon de remise en pourcentage** — **jamais**
  en montant fixe en gourdes ;
- La remise est **plafonnée** (pourcentage maximum et plafond absolu par
  commande) ;
- Le coupon est **nominatif, à usage unique et non transférable** ;
- **Aucun** retrait en espèces, **aucun** remboursement en cash, **aucun**
  transfert entre utilisateurs (P2P) ;
- Les points **expirent** après une période définie.

Autrement dit : il s'agit d'un mécanisme de **fidélité commerciale** (réduction
sur achats futurs), et non d'un instrument permettant de stocker ou de déplacer
de la valeur monétaire.

Pourriez-vous me confirmer si ce dispositif reste dans le périmètre autorisé
pour notre statut, ou m'indiquer les conditions à respecter le cas échéant ?

Je vous remercie par avance pour votre éclairage.

Bien cordialement,
**Éliezer Philippe** — Zabelie

---

## Pour identifier un interlocuteur

- Un **avocat / juriste spécialisé en droit bancaire ou fintech** en Haïti — le
  plus rapide pour un premier avis.
- La **Direction des systèmes de paiement de la BRH** — l'autorité qui applique
  la Circulaire 121, pour une position officielle.

Un avocat d'abord, puis la BRH si besoin d'une confirmation formelle, est en
général la voie la plus efficace.

---

## Analyse de risque (recherche du 2026-07-11) et décision porteur

> **Décision** : le porteur a choisi de **dégeler** le programme de fidélité
> (PR #12) sur la base de l'analyse ci-dessous, SANS attendre l'avis juridique
> préalable. L'envoi du mémo ci-dessus à un juriste (HDIT Cabinet Volmar
> identifié) reste **recommandé en parallèle** — si l'avis reçu contredit
> cette analyse, la fonctionnalité sera désactivée (les fonctions sont
> révocables et la table `rewards_catalog` peut être vidée sans toucher au
> money-path).
>
> ⚠️ Cette analyse est une recherche documentaire, **pas un avis juridique**.

### 1. La définition qui compte (Circulaire 121)

La monnaie électronique y est définie comme une **valeur monétaire stockée sur
support électronique, émise contre remise de fonds, et acceptée comme moyen
de paiement** ([synthèse Altema Jean-Marie](https://altemajeanmarie.com/la-banque-centrale-publie-une-circulaire-sur-la-reglementation-des-services-paiements-electroniques/),
[BRH](https://www.brh.ht/)). Trois conditions cumulatives — le programme de
fidélité Zabelie n'en remplit **aucune** :

| Condition (monnaie électronique) | Points Zabelie |
|---|---|
| Émise **contre remise de fonds** | ❌ Jamais achetés ni achetables — attribués gratuitement en récompense (achat, avis, parrainage) |
| **Valeur monétaire** stockée | ❌ Aucune valeur en gourdes ; convertibles uniquement en remise **en pourcentage**, plafonnée |
| Acceptée comme **moyen de paiement** (réseau de tiers) | ❌ Circuit fermé : utilisables uniquement sur Zabelie, non transférables, non remboursables, expirent |

### 2. Corroboration internationale

Les régimes comparables dont la définition est calquée sur la même logique
(« émise contre remise de fonds ») excluent les programmes de fidélité
non achetés : analyses [Dentons](https://www.dentons.com/en/insights/newsletters/2019/july/11/bank-notes/bank-notes-summer-2019/are-loyalty-points-schemes-a-form-of-electronic-money)
et [Lexology](https://www.lexology.com/library/detail.aspx?g=78071a38-37a1-463f-a6e2-872fd7c3618f)
sur la directive européenne monnaie électronique, [FAQ officielle de la
Commission européenne](https://finance.ec.europa.eu/document/download/3a9f865b-4b16-4fbd-b25c-3c37d24d80ed_en?filename=e-money-faq-22122016_en.pdf).
Le point de bascule identifié partout : des points **achetés** contre de
l'argent se rapprochent de la monnaie électronique ; des points **offerts**
en récompense n'en sont pas. Le design de la PR #12 interdit structurellement
l'achat de points (aucune fonction ne le permet, `award_points` est réservée
au serveur).

### 3. Précédent local

Digicel opère ouvertement des [programmes de fidélité et bonus en
Haïti](https://www.digicelgroup.com/ht/fr/new-prepaid-plans) (points de
fidélité tracés au compte client, bonus de recharge) en tant qu'opérateur
télécom — activité distincte de son émission de monnaie électronique
(MonCash), qui elle est licenciée séparément. La pratique « récompenses de
fidélité par un commerçant/revendeur » est établie sur le marché haïtien.

### 4. Garde-fous conservés quoi qu'il arrive

Tout ce qui rapprocherait les points de la monnaie électronique reste
**interdit par construction** (et doit le rester) : achat de points, valeur
fixe en gourdes, transfert entre comptes, remboursement en espèces,
utilisation hors Zabelie. Toute évolution touchant à l'un de ces points
rouvre la question réglementaire et exige un avis juridique préalable.
