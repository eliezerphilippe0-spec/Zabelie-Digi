# Relevé des sous-traitants — 2026-10-10

Demandé après `PR #335` (TypeSafe au §6) pour décider d'un `confidentialite-v3`
groupé. Objet : **lesquels des tiers appelés par le code traitent réellement des
données personnelles aujourd'hui ?** Déclarer un sous-traitant inactif est aussi
faux que d'en taire un actif.

## 0. Le premier fait : ils ne sont pas quatre

`OPS_TODO` du 2026-09-24 en nommait quatre — Resend, Stripe, Higgsfield,
OpenAI/Gemini. La liste a été traitée comme une **hypothèse**, pas comme une
source, et l'énumération des hôtes HTTPS absolus de `lib/` et `app/` en rend
**huit** :

```
api.resend.com · api.openai.com · generativelanguage.googleapis.com
api.higgsfield.ai · topups.reloadly.com + auth.reloadly.com
api.kobara.app · api.typesafe.ai · (Stripe — par SDK, sans URL absolue)
```

**Reloadly** (recharge téléphonique) et **Kobara** (rail de paiement)
n'apparaissaient dans aucune liste. Stripe, à l'inverse, serait passé à travers
une recherche d'URL : il n'en écrit aucune, il passe par son SDK.

⚠️ **Et aucun des huit n'est déclaré.** Vérifié, pas supposé : les seules
occurrences de ces noms dans `lib/policy-privacy.ts` sont le commentaire ⚖️
écrit le même jour. Le §6 ne nomme que **Supabase, Vercel et MonCash**.

## 1. Ce que le relevé peut dire, et ce qu'il ne peut pas

**Mesurable depuis le dépôt** : quel code appelle quel hôte, **quelles données
figurent dans le corps de la requête**, quelle variable garde l'appel, et ce que
fait le code quand cette variable est absente.

⛔ **Non mesurable d'ici** : si la variable est posée en production. Les
variables d'environnement Vercel ne sont pas lisibles depuis une session agent,
et le proxy refuse `actions/variables` en **403**. Ce document dit donc
**ce qui sortirait si la porte est ouverte**, jamais qu'elle l'est.

C'est suffisant pour la décision juridique : une politique de confidentialité
déclare un traitement **prévu**, elle ne se met pas à jour au rythme d'un
drapeau.

## 2. Classe A — Zabelie TRANSMET des données personnelles

Sous-traitants au sens plein. À déclarer sans discussion.

| Tiers | Ce qui part, mesuré | Fichier | Garde | Sans la clé |
|---|---|---|---|---|
| **Resend** | **adresse e-mail du destinataire** + objet + corps HTML du message | `lib/zabelie-email.ts:76` | `RESEND_API_KEY` | no-op silencieux, aucun e-mail ne part |
| **Reloadly** | **numéro de téléphone du bénéficiaire** (`recipientPhone`, `countryCode: "HT"`) | `lib/zabelie-topup/reloadly.ts:186` | `RELOADLY_CLIENT_ID` / `_SECRET` + `ZABELIE_TOPUP_FIRSTPARTY_ENABLED` | rend `null` |
| **OpenAI** *ou* **Gemini** | **le message libre de l'acheteur** + l'intention retenue, dont `location` | `lib/shopping-ai-provider.ts:16-34` | `OPENAI_API_KEY` / `GEMINI_API_KEY` | — |
| **TypeSafe** | **le message du client** (`untrusted_customer_message`) | `lib/jev.ts` | `TYPESAFE_API_KEY` + `ZABELIE_JEV_TRIAGE_ENABLED` | ⚖️ **déjà traité — `PR #335`, `confidentialite-v2`** |

Le cas Resend est le plus direct : une adresse e-mail est une donnée
personnelle, et le corps du message peut porter n'importe quoi.

Le cas du Shopping AI est le moins visible et mérite d'être nommé : ce n'est pas
un mot-clé de recherche qui part, c'est **la phrase écrite par l'acheteur**,
avec sa localisation. Un acheteur qui tape « mwen bezwen yon bagay pou manman m
nan Delmas » envoie tout cela à OpenAI ou Google.

## 3. Classe B — le tiers collecte DIRECTEMENT, Zabelie ne transmet rien

C'est le résultat le plus nuancé du relevé, et il change la rédaction.

| Tiers | Ce que Zabelie envoie, mesuré | Fichier |
|---|---|---|
| **Stripe** | `client_reference_id` (= order_id), montant en cents, **titre du produit**, URLs de retour. **Aucun `customer_email`, aucun nom, aucune adresse.** | `lib/stripe.ts:47` |
| **Kobara** | montant HTG, devise, `provider`, `description`, `metadata.order_id`, URLs de retour. **Aucune donnée personnelle.** | `lib/kobara.ts:167` |

Les deux rails redirigent le payeur vers **leur propre page**, où il saisit ses
moyens de paiement. Ils traitent donc bien des données personnelles
d'utilisateurs de Zabelie — mais **pas des données que Zabelie leur transmet**.

Mieux : `redactKobaraPayment` (`lib/kobara.ts:274`) retire explicitement le
téléphone du payeur et l'identifiant de compte opérateur **avant écriture en
base**, sur le modèle de `redactPayment` pour MonCash. La minimisation est déjà
pratiquée côté Zabelie.

⚖️ **Conséquence rédactionnelle, à trancher avec le conseil** : les nommer au
§6 au même titre que Supabase serait inexact. La formule juste les distingue —
destinataires chez qui l'utilisateur **saisit lui-même** ses données de
paiement — comme le §6 distingue déjà Meta, Google et TikTok, « qui traitent ces
données pour leur propre compte ».

## 4. Classe C — contenu d'auteur, qualification ouverte

| Tiers | Ce qui part | Fichier |
|---|---|---|
| **OpenAI** *ou* **Gemini** (aide à la rédaction) | **titre du produit** écrit par le vendeur + catégorie + langue | `lib/ai-description.ts:112-166` |
| **Higgsfield** | **prompt écrit par le vendeur** + URL d'une image de référence | `lib/creative/providers/higgsfield.ts:47` · garde `HF_API_KEY_ID` / `HF_API_KEY_SECRET` + `ZABELIE_STUDIO_ENABLED` |

Un titre de produit et un prompt d'image ne sont pas des données personnelles
*par nature*. Mais ce sont des **champs libres** : rien n'empêche un vendeur d'y
écrire son nom, son téléphone ou une adresse, et l'image de référence peut
montrer une personne.

⚖️ Position proposée, à valider : les déclarer. Le coût d'une mention est nul ;
le coût d'un champ libre non couvert ne l'est pas.

## 5. Ce que ça donne pour un `v3`

Le §6 déclarerait alors, **si le conseil suit ce découpage** :

* **sous-traitants** — Supabase, Vercel, Resend, Reloadly, OpenAI *ou* Gemini,
  Higgsfield, TypeSafe ;
* **destinataires de paiement, où l'utilisateur saisit lui-même** — MonCash
  (Digicel), Stripe, Kobara.

⚠️ **MonCash est aujourd'hui rangé parmi les sous-traitants** (« traitement des
paiements »). Si le découpage du §4 est retenu, sa ligne bouge aussi — c'est un
changement de qualification, pas de simple vocabulaire, et il relève du conseil.

⚠️ **Aucune région d'hébergement ne doit être affirmée pour ces sept tiers** :
aucune n'a été mesurée, contrairement à Supabase (`us-east-1`) et Vercel
(`iad1`). `tests/politique-confidentialite.test.ts` garde déjà cette abstention
pour TypeSafe ; l'étendre aux autres au moment de les déclarer.

## 6. Le vrai arbitrage, chiffré

Chaque version force **une ré-acceptation** avant paiement, KYC et création de
produit (`0136`, `docs/25` §7.2).

* **`v2` seul maintenant, `v3` plus tard** → **deux** ré-acceptations.
* **`v3` groupé** → **une**, mais la `PR #335` attend que le conseil ait tranché
  les qualifications du §3 et du §5.

Le second chemin coûte moins cher à l'utilisateur et demande un aller-retour
juridique. Le premier débloque l'activation du triage TypeSafe tout de suite.
**Ce n'est pas un arbitrage d'ingénierie** — il se tranche sur le calendrier du
conseil, pas sur le code.

## 7. Ce que ce relevé n'a PAS vérifié

* Qu'une clé soit posée en production, pour aucun des huit (§1).
* Les sous-traitants **de Supabase et de Vercel** eux-mêmes — un hébergeur en a.
* Les régies publicitaires `Meta`, `Google`, `TikTok` : déjà couvertes au §6 et
  au §8, sous consentement, et explicitement **pas** nos sous-traitants.
* **Zelle** : aucun appel sortant dans le code — rail semi-manuel. Rien à
  déclarer tant qu'aucune API n'est appelée.
* La question de savoir si l'un de ces contrats comporte des clauses types de
  transfert. Aucune n'a été constatée ; ne rien affirmer à ce sujet.

---

## 8. Décision du porteur — `v3` groupé, préparé le 2026-10-10

Arbitrage tranché : **`v3` groupé**, une seule ré-acceptation au lieu de deux.
`0136` a été **réécrite plutôt que doublée** — elle n'était ni appliquée ni
fusionnée, donc son fichier pouvait encore bouger (une migration appliquée, elle,
ne bouge plus jamais). Renommée `0136_zabelie_confidentialite_v3.sql`.

`confidentialite-v2` ne sera jamais vivante : **aucun compte ne porte ce reçu**
et `0136` ne l'accepte pas. Son empreinte reste archivée dans
`tests/account-legal-acceptance.test.ts` comme trace du document intermédiaire.

### Le §6 est désormais coupé en deux

* **Sous-traitants** — Supabase, Vercel, Resend, Reloadly, OpenAI *ou* Gemini,
  Higgsfield, TypeSafe. Chaque ligne dit **ce qui part** : l'adresse e-mail, le
  numéro du bénéficiaire, le texte écrit par l'utilisateur.
* **Services de paiement, destinataires distincts** — MonCash (Digicel),
  Stripe, Kobara, précédés d'une phrase qui dit pourquoi : *« vous saisissez vos
  moyens de paiement chez eux, sur leur propre page. Nous ne leur transmettons
  que le montant, la référence de commande et le libellé de l'achat. »*

⚖️ **MonCash a changé de rubrique.** C'est le point qui demande le conseil :
changement de qualification, pas de formulation.

### Le croisement qui remplace la liste tenue à la main

`tests/politique-confidentialite.test.ts` croise désormais **les neuf tiers**
avec les puces du §6, dans les deux sens et dans les quatre langues. C'est ce
qui fait qu'un prochain Reloadly ne pourra plus passer inaperçu.

⚠️ **La recherche est bornée aux PUCES, jamais à la section entière**, et ce
n'est pas un détail de style — c'est mesuré :

```
recherche naïve de « Google » sur toute la section : true   ← serait resté VERT
recherche bornée aux puces, « Gemini »             : false  ← rougit
```

Les paragraphes du §6 nomment déjà Meta, Google et TikTok comme régies « qui
traitent pour leur propre compte ». Chercher « Google » dans le texte complet
aurait été satisfait par cette phrase sans rien prouver sur Gemini. C'est le
piège de sous-chaîne, pris en flagrant délit.

Trois mutations passées : Reloadly retiré du kreyòl seul → rouge ; Gemini retiré
des puces françaises → rouge ; `api.higgsfield.ai` retiré du code alors que la
ligne reste → rouge. Validation : `tsc` propre, lint 0 erreur, **1604/1604**.
