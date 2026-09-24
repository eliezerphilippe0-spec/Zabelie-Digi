# 66 — Chantier Vidéo produit (Studio), Phase 0

Demande porteur du 2026-09-24 : « go vidéo produit ». Ce document est la
**Phase 0** : ce qu'on construit, ce que ça coûte, ce qui manque pour écrire
une ligne de code, et ce qui revient au porteur. **Aucun code n'est écrit** :
aucune page de documentation vidéo de Higgsfield n'a été lue (le proxy bloque
`docs.higgsfield.ai`), et la règle du dépôt interdit d'écrire un provider sur
une API non lue (`docs/62` §3, `docs/65`).

## 1. Ce qu'on construit, et ce qu'on ne construit PAS

**Oui : des vidéos PRODUIT.** Quelques secondes, à partir de la **vraie photo**
du produit : le produit qui tourne, posé dans un décor, montré en usage. Mêmes
formats que les images (carré, portrait, vertical pour statuts WhatsApp et
stories), sans texte dans la vidéo, prix et appel à l'action ajoutés par
Zabelie à part, comme pour les images.

**Non : pas de faux UGC.** Une personne générée qui dit « j'ai acheté ce
produit, je l'adore » est un **faux témoignage** : trompeur pour l'acheteur, et
contraire à R-STUDIO-01, qui interdit les personnes réelles identifiables. Le
Studio ne produira ni avis, ni parole, ni visage présenté comme un client.

## 2. Ce que ça coûte (prix de la console du porteur, relevés le 2026-09-24)

| Modèle | Durées | Prix/s | 5 s | 10 s |
|---|---|---|---|---|
| Kling 2.5 | 5 ou 10 s, ≤ 1080p | 0,0357 $ | **0,18 $** | 0,36 $ |
| Kling 2.6 | 1, 5 ou 10 s | 0,0595 $ | 0,30 $ | 0,60 $ |
| Kling 3.0 / O1 / O3 | 1–15 s, ≤ 1080p | 0,0714 $ | 0,36 $ | 0,71 $ |
| Seedance 2.0 | 4–15 s, ≤ 4K | 0,1196 $ | 0,60 $ | 1,20 $ |
| Seedance 2.5 | 4–30 s, ≤ 720p | 0,1748 $ | 0,87 $ | 1,75 $ |

Pour comparaison : une image coûte **0,0107 $**. Une vidéo de 5 s sur le modèle
le moins cher coûte **17 fois** une image.

Candidat par défaut : **Kling 2.5, 5 s** — le moins cher, résolution suffisante
pour un statut WhatsApp. À confirmer par sa doc (§4).

## 3. Proposition de prix — À TRANCHER PAR LE PORTEUR

Même rail que les images (`0119`) : prix affiché, consentement à chaque fois,
payé **seulement si la vidéo est livrée**, prélevé au prochain retrait. Aucun
crédit prépayé (docs/17 §2.7).

| Paramètre | Proposition | Pourquoi |
|---|---|---|
| Vidéos gratuites par jour | **0** | 17 fois le coût d'une image ; la gratuité reste sur les images |
| Prix d'une vidéo de 5 s | **75 HTG** | ≈ 3 fois le coût Kling 2.5 (≈ 23 HTG au taux de ~131 HTG/$, à confirmer par `USD_HTG_RATE`) |
| Plafond par vendeur et par jour | **5** | borne d'abus |
| Plafond plateforme par jour | **50** | coût borné à ≈ 9 $/jour au pire |

Le prix, la gratuité et les plafonds sont une **décision commerciale** : ces
chiffres sont une proposition, ils vivront en table de config (règle dure 3).

## 4. Ce qui manque avant d'écrire le code

Pages de la doc Higgsfield à copier (le proxy bloque leur lecture) :

1. **La page du modèle vidéo choisi** (Kling 2.5 d'abord) : endpoint, champs,
   et surtout **accepte-t-il la photo du produit en entrée** (image-to-video) ?
   C'est éliminatoire, comme pour les images : sans photo, pas de fidélité au
   produit, donc pas de vidéo.
2. **Les droits d'usage commercial** des images et vidéos générées : ils
   conditionnent le « publiez partout » (docs/65 §6).
3. `/docs/concepts/requests` : **conservation** des fichiers chez Higgsfield
   (une vidéo pèse lourd ; si elle expire vite, il faudra la copier chez nous,
   ce qui coûte du stockage).

## 5. Ce qui se construira ensuite (plan, non écrit)

- **Base** : une colonne `media` (`image` | `video`) sur les générations, des
  paramètres vidéo séparés dans `zabelie_studio_config` (gratuit, prix,
  plafonds), un motif `studio_video` au registre de dette. Même machine
  d'états, même facturation à la livraison.
- **Provider** : un second endpoint Higgsfield, sur le modèle de
  `lib/creative/providers/higgsfield.ts`, écrit sur sa doc vérifiée.
- **Écran** : un choix « Imaj / Videyo » dans le Studio, avec le prix affiché
  d'emblée.
- **Sondage** : une vidéo met plus longtemps qu'une image ; les délais
  (`DELAI_GENERATION_MS`) seront revus sur la doc.
- **CGU** : la §9 nomme déjà le Studio ; il faudra y ajouter la vidéo.

## 6. Décision porteur du 2026-09-24 : « UGC », les deux voies

Réponse à la question « UGC IA signalée, vraie UGC, ou les deux ? » : **les
deux.** Le faux témoignage reste exclu (§1) dans les deux voies.

### 6.1 Voie A — UGC générée par l'IA, signalée

Une personne **fictive** présente le produit face caméra, ne dit que les faits
donnés par le vendeur, et la vidéo porte la mention « kontni IA / contenu IA ».
Jamais « mwen te achte l ».

Bloquants, en plus du §4 :

1. **La page du modèle Higgsfield qui fait parler un personnage** (avatar,
   lip-sync). Son existence même n'est pas vérifiée.
2. **Le kreyòl parlé.** Une voix de synthèse qui ne parle que français ou
   anglais rate le public qui compte le plus. C'est à vérifier avant tout
   engagement : **une UGC IA sans kreyòl ne vaut sans doute pas son prix.**
3. Le prix : voix et personnage coûteront plus que les 0,18 $ du §2.

### 6.2 Voie B — vraie UGC, filmée par de vrais gens

Mesuré en production le 2026-09-24 : **0 avis, 0 commande payée** (15
commandes, aucune payée), et **aucun stockage vidéo** (trois espaces de
stockage : photos produit à 1,5 Mo max, fichiers digitaux, KYC).

Conséquence, dans l'ordre :

1. **B1 — la vidéo du vendeur** sur sa fiche produit : il se filme avec son
   téléphone et montre son produit. Libellée « videyo machann nan », jamais
   « avis client ». Faisable tout de suite : aucune API externe.
2. **B2 — l'avis vidéo d'un client**, rattaché à une commande **payée** et
   livrée (`product_reviews.order_id` existe déjà, unique par commande). À
   construire quand il y aura des commandes payées : aujourd'hui, il n'y a
   rien à quoi le rattacher.

Propositions pour B1, **à trancher** (le stockage est une dépense) :

| Paramètre | Proposition | Pourquoi |
|---|---|---|
| Durée max | 30 s | un statut WhatsApp, pas un film |
| Taille max | 20 Mo | ≈ 30 s en 720p ; au-delà, le téléversement échoue sur les réseaux lents d'Haïti |
| Vidéos par produit | 1 | borne le stockage |
| Lecture | jamais automatique, image d'aperçu d'abord | forfaits data des acheteurs sur Android d'entrée de gamme |
| Contrôle | même porte de publication que la fiche | pas de circuit de modération nouveau |

⚠️ **Coût de stockage** : l'offre Supabase gratuite inclut 1 Go de stockage de
fichiers (à vérifier sur le compte). À 20 Mo par vidéo, **une cinquantaine de
vidéos le remplissent.** Au-delà, il faut une offre payante : décision porteur.

## 7. Ce qui est rendu au porteur

1. **Voie B1** (vidéo du vendeur) : accord ou correction sur les limites du
   §6.2, et sur le coût de stockage. C'est la seule voie qui peut démarrer
   tout de suite.
2. **Vidéo produit et voie A** : les pages de doc du §4 et du §6.1, dont la
   question du kreyòl parlé.
3. Le **prix** et les **plafonds** du §3, et le prix de la voie A.
4. Le **modèle** : Kling 2.5 par défaut, ou un autre du §2.

Stop. Chaque voie démarre sur sa réponse.
