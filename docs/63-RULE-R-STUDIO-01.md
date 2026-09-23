# 63 — R-STUDIO-01 : identité visuelle haïtienne (EXTRAIT)

⚠️ **Ce fichier n'est PAS le texte intégral de R-STUDIO-01.** Le texte intégral
n'est pas dans le dépôt (`docs/62` §1.2, PR #270). Ce qui suit est l'extrait
donné au §2 de `PROMPT-ZABELIE-STUDIO-CREATIF.md` v1.0, recopié sans
reformulation. **À remplacer par le texte intégral dès qu'il est fourni** ; le
code (`lib/creative/rule.ts`) cite ce fichier et devra être recroisé avec lui.

## Extrait (§2 du prompt, tel quel)

* Défauts : `audience = haiti_diaspora`, `profil_personnages = auto`,
  `langue_pub = ht + fr`, `direction_artistique = auto`.
* Enums : audience (`haiti`, `diaspora`, `haiti_diaspora`, `international`),
  profil (`auto`, `femme`, `homme`, `couple`, `famille`, `entrepreneur`,
  `professionnel`, `jeune_adulte`, `aucun`), langue (`ht`, `fr`, `en`, `es`),
  marché diaspora (`usa`, `canada`, `france`, `caraibes`).
* Ordre de priorité du Prompt Builder : fidélité produit → interdits →
  audience/marché → objectif → personnages → contexte → direction artistique →
  format → zone réservée au texte.
* Prompt négatif systématique : caricature, marqueurs de pauvreté non
  demandés, colorisme, texte dans l'image, déformation du produit, personnes
  réelles identifiables, logos ou marques tierces.
* Aucun texte publicitaire (accroche, CTA, prix) n'est envoyé au moteur
  d'image : il est composé en surcouche par Zabelie.
* Prix affiché = prix réel du catalogue uniquement (HTG, USD ou les deux selon
  l'audience). Aucune promotion ni allégation inventée.

## Ce que le code ajoute HORS de l'extrait — propositions à valider

Chacune est isolée dans le code pour être retirée ou remplacée sans toucher au
reste.

| Proposition | Où | Pourquoi |
|---|---|---|
| **Photo produit obligatoire** : sans photo, aucun brief | `prompt-builder.ts`, `buildBriefs` | conséquence directe de « fidélité produit » en priorité n°1 : un moteur ne peut pas être fidèle à un produit qu'il n'a pas vu |
| **Aucun texte libre dans le prompt image** (ni titre, ni catégorie saisie, ni phrase de référence) | `prompt-builder.ts` | un moteur recopie le texte (interdit « texte dans l'image ») ; un titre peut porter une marque ; une page de référence peut porter une injection |
| Axes de variation des briefs : 3 formats (`1:1`, `4:5`, `9:16`) × 3 cadrages (gros plan, en situation, en usage) = **9 briefs** | `rule.ts`, `PROPOSITION` | l'extrait fixe 8 à 10 briefs sans dire sur quoi ils varient |
| Zone texte : **haut en `9:16`**, bas sinon | `prompt-builder.ts`, `zoneTexte` | en format vertical, le bas est couvert par l'interface des statuts et stories |
| Valeurs d'analyse **énumérées** (composition : centrée, règle des tiers, symétrique, diagonale ; palette : chaude, froide, neutre, vive, pastel) | `prompt-builder.ts` | seul moyen de garantir qu'aucun mot d'une pub de référence n'atteigne le moteur |
| Devises : `haiti` → HTG · `diaspora`, `international` → USD · `haiti_diaspora` → les deux | `overlay.ts`, `devisesPour` | lecture de « HTG, USD ou les deux selon l'audience » |
| USD = **calcul du checkout** (`usdCentsFromHtg`, même taux) ; taux absent → pas d'USD, HTG réel affiché, manque signalé | `overlay.ts` | le prix affiché doit être celui que l'acheteur paiera |
| `direction_artistique` n'accepte que `auto` | `rule.ts`, `DIRECTIONS` | l'extrait ne donne aucune autre valeur |
| Segment `objectif` omis | `prompt-builder.ts` | l'extrait le place dans l'ordre sans définir d'entrée |
| Descripteurs de personnages (« a Haitian woman », …) et de marché, en anglais | `prompt-builder.ts` | formulation ; la langue est celle des moteurs d'image |
