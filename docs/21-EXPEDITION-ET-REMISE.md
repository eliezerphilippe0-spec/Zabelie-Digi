# État d'expédition et maturation liée à la remise

> Migration `0043_fulfillment.sql` — **rédigée, non appliquée.**
> Trois valeurs commerciales attendent l'arbitrage du porteur (§2).

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

### Trois valeurs à arbitrer — proposées, pas décidées

| Paramètre | Proposition | Ce qui se passe si on le change |
|---|---|---|
| `shipment_deadline_days` | **5** | Délai laissé au vendeur pour déclarer la remise. Plus court : l'argent revient vite à l'acheteur, mais un vendeur en province est pénalisé. Plus long : l'acheteur attend son remboursement d'autant. |
| `auto_receive_days` | **7** | Délai après lequel une commande remise est réputée reçue faute de réponse. Plus court : le vendeur est payé vite, l'acheteur a moins de temps pour réclamer. Plus long : on retient l'argent d'une vente probablement honorée. |
| `post_receipt_maturation_days` | **0** | Fenêtre de réclamation *après* réception. `0` parce que le J+7 d'escrow a déjà couru pendant l'expédition. Mettre `> 0` ajoute une seconde attente au vendeur. |

Elles vivent en table de config (`zabelie_fulfillment_limits`) : se changent
par `UPDATE`, jamais par migration.

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
                     shipped                    refund_required
                    │        │                  (commande → disputed,
   acheteur confirme┘        └ silence >         file admin, remboursement
                    │          auto_receive_days  exécuté à la main)
                    ▼        │
                 received ◄──┘
        (commande → delivered, escrow déverrouillé)
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
- **Le vendeur se tait** → `refund_required`. Sans ça, une commande jamais
  honorée garderait l'argent de l'acheteur sur le compte marchand **sans
  limite de durée** — exactement la rétention que décrit `docs/17`.

C'est la moitié qu'on oublie systématiquement, et c'est celle qui a une
conséquence réglementaire.

## 4. Ce qui est vérifié, et comment

`supabase/tests/fulfillment.test.sql` — dix contrôles, dont le central :

| # | Contrôle |
|---|---|
| F1 | Produit **digital** → aucun suivi, escrow non verrouillé : le flux digital est intact au bit près |
| F2 | Produit physique → suivi ouvert, escrow verrouillé |
| **F3** | **Escrow verrouillé ne mûrit PAS**, échéance dépassée. C'est « payé au chronomètre » qui meurt ici |
| F4 · F5 | Ni un tiers ni l'acheteur ne déclarent la remise ; l'acheteur ne confirme pas une remise non déclarée |
| F6 | Réception → `delivered`, déverrouillage, **puis** maturation effective |
| F7 | Acheteur muet → auto-réception, `auto_received` marqué, aucun auteur attribué |
| F8 | Vendeur absent → `refund_required` + commande `disputed` + file admin |
| F9 | Idempotence des deux déclarations |
| F10 | L'identité comptable de `0033` tient après tout le parcours |

**F3 est éprouvé par mutation** (règle du dépôt) : garde retiré de
`mature_wallets()` → `ERROR: F3: 2 entrée(s) mûrie(s), 1 attendue`. Le test
échoue quand le bug revient.

## 5. Ce qui reste à faire avant application

1. **Arbitrer les trois valeurs** du §2.
2. **Recopier le corps de `confirm_payment` version `0038`** dans `0043` §6 en
   y ajoutant l'appel à `zabelie_open_fulfillment`. Délibérément non fait
   tant que les valeurs ne sont pas arbitrées : dupliquer une fonction du
   money-path pour la laisser diverger d'une revue à l'autre est précisément
   ce qu'on cherche à éviter.
3. **Les surfaces** — aucune n'existe encore :
   - vendeur : bouton « Mwen remèt li / J'ai remis » + note de remise ;
   - acheteur (`/mes-achats`) : « Mwen resevwa l / J'ai reçu », et l'état
     courant à la place de l'impasse actuelle ;
   - admin : la file `zabelie_fulfillment_overdue`.
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
