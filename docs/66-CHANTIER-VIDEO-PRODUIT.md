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

## 6. Ce qui est rendu au porteur

1. Les **pages de doc** du §4, copiées comme pour Marketing Studio Image.
2. Le **prix** et les **plafonds** du §3 (ou « d'accord avec la proposition »).
3. Le **modèle** : Kling 2.5 par défaut, ou un autre du §2.

Stop. La Phase 1 attend ces trois réponses.
