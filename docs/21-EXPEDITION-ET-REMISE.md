# État d'expédition et maturation liée à la remise

> Migration `0043_fulfillment.sql` — **rédigée, non appliquée.**
> Quatre valeurs commerciales attendent l'arbitrage du porteur (§2) —
> et surtout leur **ancre**, sans laquelle un délai ne veut rien dire.

## 1. Le trou, tel qu'il est en production aujourd'hui

Deux faits vérifiés en base le 2026-07-26, pas déduits :

- `orders.status` n'atteint `delivered` **que** par la route de téléchargement
  (`app/api/download/route.ts:96`). Une commande physique reste `paid` à vie.
- `mature_wallets()` (`0006`) ne regarde que `matures_at <= now()` — **aucune
  référence à la livraison**. Le vendeur d'une pièce détachée est payé au
  chronomètre, que l'objet ait changé de mains ou non.

Ensemble, ils institutionnalisent **« m te peye, m pa janm resevwa »** :
l'acheteur a payé, le vendeur est crédité à J+7, et rien dans le système ne
sait si la remise a eu lieu. Ce n'est pas un défaut d'affichage — c'est une
machine à états sans sortie pour cette catégorie de commande.

## 2. Ce que Zabelie peut et ne peut pas savoir

**Zabelie ne livre pas** : ni flotte, ni entrepôt, ni contrat transporteur, ni
numéro de suivi à interroger. La plateforme n'**observe** donc jamais la
remise — elle ne peut qu'enregistrer ce que les deux parties **déclarent**.

Toute la conception découle de cette contrainte : deux déclarations, un délai
qui tranche en cas de silence, et une sortie dans les deux sens.

### Les valeurs à arbitrer — et surtout LEUR ANCRE

**Un délai sans point de départ ne veut rien dire.** Si les 5 jours vendeur et
les 7 jours d'auto-réception partaient tous deux du paiement, un acheteur dont
le vendeur déclare au 5ᵉ jour n'aurait que **2 jours** pour réagir — et le
« 7 » serait un mensonge. Les délais se **chaînent** :

| Paramètre | Ancre — à partir de quoi il compte | Proposition |
|---|---|---|
| `shipment_deadline_days` | **confirmation du paiement** | **5** — délai pour *déclarer* la remise, pas pour que le colis arrive. Port-au-Prince → Jérémie dépasse 5 jours ; le vendeur déclare qu'il a remis, pas que c'est arrivé. |
| `auto_receive_days` | **déclaration de remise par le vendeur** — jamais le paiement | **7** |
| `post_receipt_maturation_days` | **confirmation de réception** | **0** |
| `dispute_weekly_ceiling` | — (seuil, pas un délai) | **5** litiges/semaine |

**Pourquoi 0 après réception, et l'argument est plus fort que la commodité :**
MonCash n'a **pas de rétrofacturation**. Le J+7 digital protège d'une
contestation bancaire qui n'existe pas sur ce rail. Retenir l'argent après une
confirmation *explicite* de l'acheteur ne protège de rien — ça reconstitue la
rétention de `docs/17`.

Toutes en table de config (`zabelie_fulfillment_limits`) : se changent par
`UPDATE`, jamais par migration — et ce sont exactement les valeurs qu'on
voudra ajuster après les premières commandes.

### Le seuil de litiges, posé pendant que la question est théorique

Tout litige atterrit chez le porteur, **à la main**, sans rétrofacturation pour
aider. À zéro commande, c'est gratuit. Au-delà de **5 litiges par semaine** de
façon durable, le traitement manuel cesse d'être tenable : il faut alors
suspendre l'ouverture physique ou financer un vrai processus — pas serrer les
dents. Écrit maintenant pour ne pas être renégocié sous pression.

## 3. La machine à états

```
                    paiement confirmé (produit physique)
                                 │
                                 ▼
                       awaiting_shipment
                        │              │
   vendeur déclare ─────┘              └───── silence > shipment_deadline_days
                        │                              │
                        ▼                              ▼
                     shipped                     action_required
      ┌──────────────┼────────────┐             (commande → disputed,
      │              │            │              file admin, un humain
 acheteur       « pa resevwa »  silence >        tranche — l'état ne
 confirme        (avant échéance) auto_receive_   présume PAS l'issue)
      │              │            days
      │              ▼            │  ⚠ seulement si les AVIS sont partis
      │      disputed_by_buyer    │
      │      (escrow VERROUILLÉ,  │
      │       file admin)         │
      ▼                           │
   received ◄────────────────────┘
   (commande → delivered, escrow déverrouillé, avis final si automatique)
```

**`order_status` n'est pas étendue.** Ajouter une valeur à une énumération est
une porte à sens unique (leçon de `0036`), et `delivered` y signifie déjà
« remis ». Le suivi vit dans sa propre table : additif, réversible, et le flux
digital n'est pas touché d'une ligne.

### La symétrie des silences — le point qui compte le plus

Un état d'expédition qui ne gère que le silence de l'acheteur **déplace** le
problème au lieu de le résoudre :

- **L'acheteur se tait** → auto-réception. Sans ça, un acheteur distrait
  bloquerait le vendeur indéfiniment.
- **Le vendeur se tait** → `action_required`. Sans ça, une commande jamais
  honorée garderait l'argent de l'acheteur sur le compte marchand **sans
  limite de durée** — exactement la rétention que décrit `docs/17`.

  L'état est **volontairement neutre**, pas « à rembourser » : sur ce marché,
  le vendeur qui a remis de la main à la main sans rien cliquer est le cas le
  plus fréquent. Nommer l'état par son issue reviendrait à institutionnaliser
  le remboursement d'une commande honorée. Un humain tranche entre relancer,
  confirmer la remise, et rembourser.

C'est la moitié qu'on oublie systématiquement, et c'est celle qui a une
conséquence réglementaire.

## 3 bis. La notification acheteur est une DÉPENDANCE, pas une suite

L'auto-réception est un **transfert de propriété déclenché par le silence**.
Un silence ne vaut consentement que si la personne a su que l'horloge
tournait. Sans avis au moment de la déclaration, puis rappel avant l'échéance,
on ne facture pas un silence : **on exproprie quelqu'un qui n'a jamais su.**

Concrètement, dans la migration :

- la déclaration de remise crée **deux avis dans sa propre transaction** —
  immédiat (`shipped_buyer`) et rappel programmé à mi-délai
  (`reminder_buyer`) ;
- l'auto-réception ne se prononce **que si ces avis sont partis**. Tant qu'un
  avis est en attente ou en échec, la commande reste `shipped` et l'escrow
  verrouillé : le vendeur attend, mais personne n'est exproprié ;
- l'auto-réception émet un avis final (`auto_received`) : l'acheteur apprend
  que le délai a tranché pour lui ;
- **et l'échec d'envoi a une borne.** Sans elle, le garde de légitimité aurait
  une échelle longue perverse : un avis qui ne part jamais verrouillerait
  l'escrow indéfiniment — l'argent d'une commande honorée resterait sur le
  compte marchand sans limite de durée, soit la rétention de `docs/17` sous sa
  **troisième forme** (après le portefeuille sans retrait et le vendeur muet).
  **Deux déclencheurs, le premier atteint l'emporte :**

  | Déclencheur | Rôle | Délai réel |
  |---|---|---|
  | `notice_max_attempts` (5) | escalade **anticipée** — une adresse qui rebondit dès le 2ᵉ jour n'attend pas la fenêtre entière | dépend du recul : avec un cron quotidien et un recul exponentiel, **5 tentatives ≈ 8 à 15 jours** — au-delà de la fenêtre |
  | **échéance d'auto-réception atteinte** avec avis en attente | la borne **dure** | **`auto_receive_days` (7 j)**, jamais plus |

  Le nombre qui compte n'est pas « 5 essais » mais **7 jours** : c'est le
  maximum qu'un vendeur d'une commande honorée attend avant qu'un humain voie
  le dossier — exactement le même délai que le silence normal. Compter sur les
  tentatives seules aurait laissé attendre deux semaines.

  Et la borne dure ne coûte **aucune constante nouvelle** : elle réutilise la
  date à laquelle l'auto-réception aurait tranché. Au moment précis où le
  garde de légitimité l'empêche encore, l'escalade prend le relais.

  Dans les deux cas : `action_required`, escrow toujours verrouillé mais
  **visible**, un humain tranche — il a le numéro de commande et le tableau de
  bord vendeur pour joindre les parties autrement.

### Le chemin « je n'ai pas reçu », avant l'échéance

Sans lui, la seule protection de l'acheteur serait de **ne rien faire** — or
ne rien faire est précisément le geste qui paie le vendeur.
`zabelie_report_not_received` fait passer la commande en `disputed_by_buyer`,
**laisse l'escrow verrouillé**, et l'auto-réception ne peut plus l'emporter.

### Le canal — la limite honnête du garde, et son échéance

Le garde vérifie « l'avis est **parti** », pas « la personne a **su** ». C'est
la meilleure approximation disponible, et elle ne vaut que si le canal est
celui que l'acheteur regarde.

État vérifié (2026-07-26) : le checkout **exige un compte**
(`app/api/checkout/route.ts:86`) et l'inscription se fait par e-mail — tout
acheteur a donc une adresse, par construction.

⚠️ **Cette garantie est le symptôme d'un problème plus grave qu'elle ne
résout.** Un acheteur qui arrive par un lien WhatsApp, sur un Android d'entrée
de gamme, doit **créer un compte e-mail avant de payer**. C'est probablement le
premier obstacle à ce qu'une commande existe un jour — bien avant le stock,
l'expédition ou les avis. « Zéro commande en base » n'a pas qu'une explication
« pas encore lancé » : **il y a un mur à l'entrée.**

Et une adresse créée pour acheter n'est pas une adresse **lue** : l'acheteur
type vit sur WhatsApp, pas dans sa boîte mail. Le garde vérifie « l'avis est
parti », pas « la personne a su ».

### Une seule décision, pas deux

Checkout invité et canal de notification sont **couplés**, et c'est ce qui
rend l'arbitrage délicat :

- lever le mur (**checkout invité**) fait réapparaître immédiatement la
  branche « pas d'adresse → escrow verrouillé à vie » — que seul le compte
  obligatoire écarte aujourd'hui ;
- garder le mur préserve la garantie technique, au prix du mur lui-même.

Donc : **si le checkout invité s'ouvre, le canal réel (SMS/WhatsApp) doit
s'ouvrir en même temps** — sinon on troque un obstacle contre une rétention.
Les deux se tranchent **ensemble et avant B3**, jamais l'un sans l'autre.
Le fournisseur SMS/WhatsApp reste interdit sans validation (règle du dépôt) :
c'est précisément la décision qui est ici mise à l'échéance.

### Le biais par défaut, assumé

L'acheteur type arrive par un lien WhatsApp, n'a pas l'habitude du site et n'y
reviendra pas ; le vendeur, lui, a un tableau de bord. Le silence est donc
structurellement **plus probable côté acheteur** — autrement dit, le réglage
par défaut est **« le vendeur est payé »**. C'est défendable (une marketplace
qui ne paie jamais le vendeur n'a pas de vendeurs), mais c'est un **choix**,
et la relance est ce qui le rend acceptable.

## 4. Ce qui est vérifié, et comment

`supabase/tests/fulfillment.test.sql` — quinze contrôles, dont deux centraux :

| # | Contrôle |
|---|---|
| F1 | Produit **digital** → aucun suivi, escrow non verrouillé : le flux digital est intact au bit près |
| F2 | Produit physique → suivi ouvert, escrow verrouillé |
| **F3** | **Escrow verrouillé ne mûrit PAS**, échéance dépassée. C'est « payé au chronomètre » qui meurt ici |
| F4 · F5 | Ni un tiers ni l'acheteur ne déclarent la remise ; l'acheteur ne confirme pas une remise non déclarée |
| F6 | Réception → `delivered`, déverrouillage, **puis** maturation effective |
| F7 | Acheteur muet → auto-réception, `auto_received` marqué, aucun auteur attribué |
| F8 | Vendeur absent → `action_required` + commande `disputed` + file admin |
| F9 | Idempotence des deux déclarations |
| F10 | L'identité comptable de `0033` tient après tout le parcours |
| F11 | Déclaration → **deux** avis créés, l'un immédiat, l'autre programmé |
| **F12** | **Aucun avis parti → PAS d'auto-réception** ; avis partis → elle a lieu |
| F13 | « Je n'ai pas reçu » avant l'échéance → litige, escrow toujours verrouillé, auto-réception impuissante |
| F14 | Avis en échec, **tentatives épuisées** → file admin — et pas avant |
| **F15** | **Borne temporelle** : escalade à l'échéance d'auto-réception, tentatives loin du plafond |

**Deux gardes éprouvés par mutation** (règle du dépôt) — retirés, les tests
échouent :

- `mature_wallets()` sans le verrou → `F3: 2 entrée(s) mûrie(s), 1 attendue` ;
- le balayage sans la condition de légitimité → `F12: auto-réception prononcée
  alors qu'AUCUN avis n'est parti — expropriation sur un silence non informé` ;
- le balayage sans le déclencheur temporel → `F15: avis bloqué au-delà de
  l'échéance et AUCUNE escalade — le vendeur attend sans que personne voie le
  dossier`.

## 5. Ce qui reste à faire avant application

1. **Arbitrer les trois valeurs** du §2.
2. **Recopier le corps de `confirm_payment` version `0038`** dans `0043` §6 en
   y ajoutant l'appel à `zabelie_open_fulfillment`. Délibérément non fait
   tant que les valeurs ne sont pas arbitrées : dupliquer une fonction du
   money-path pour la laisser diverger d'une revue à l'autre est précisément
   ce qu'on cherche à éviter.
3. **Les surfaces** — aucune n'existe encore :
   - vendeur : bouton « Mwen remèt li / J'ai remis » + note de remise ;
   - acheteur (`/mes-achats`) : « Mwen resevwa l / J'ai reçu » **et
     « Mwen pa resevwa l / Je n'ai pas reçu »**, plus l'état courant et
     l'échéance à la place de l'impasse actuelle ;
   - admin : la file `zabelie_fulfillment_overdue`.
4. **L'envoi des avis** — la file existe en base, l'expéditeur non. Contrat de
   la route : ne prendre que les avis **échus** (`due_at <= now()` — le rappel
   est programmé à mi-délai, le dépiler à l'aveugle enverrait deux messages
   identiques d'affilée puis plus rien pendant sept jours) ; idempotence par
   avis ; tentatives bornées avec recul exponentiel jusqu'à
   `notice_max_attempts` ; journalisation des compteurs **même à zéro** ; les
   échecs consultables. Sans cette route, l'auto-réception ne se déclenche
   jamais (côté court) et F14 remonte les commandes en file admin (côté
   long).
4. **Le cron** `zabelie_fulfillment_sweep()` — une route qui journalise ses
   compteurs **même à zéro** (règle d'observabilité), et une entrée dans
   `vercel.json`.
5. **B2 avant** : `0037`/`0038`/`0040` doivent être appliquées d'abord —
   `0043` §6 remplace la version `0038` de `confirm_payment`.

## 6. Ce que cette migration ne fait pas

Aucun litige automatisé, aucune preuve de remise, aucun arbitrage. Un
désaccord — le vendeur dit avoir remis, l'acheteur dit n'avoir rien reçu —
part en `disputed` et se règle **à la main**. C'est le checkpoint humain, pas
un défaut de conception : à cette échelle, un arbitrage automatique serait un
mensonge de plus sur ce que la plateforme sait réellement.
