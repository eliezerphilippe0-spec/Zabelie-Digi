# Plan de construction : essayage virtuel (pilote)

Source : `docs/74-ESSAYAGE-VIRTUEL.md` (spécification validée par le porteur le 2026-10-19).
Tâches détaillées, critères et vérifications : `tasks/essayage-todo.md`.
Le plan du Studio (`tasks/plan.md`, `tasks/todo.md`) est un autre chantier, encore ouvert : il n'est pas touché.
Référence : `origin/main` `d25cd68`, branche `feat/essayage-virtuel`, copie `C:\Users\Philippe\Zabelie-Essayage` (`node_modules` en jonction : jamais de `npm ci`).

## Vue d'ensemble

On construit tout autour du modèle d'IA (bouton, consentement, envoi, quotas, plafond, administration, mesure), et on branche le modèle par un adaptateur : Genlook, FASHN, et plus tard peut-être notre propre modèle. Le plus gros risque n'est pas technique : c'est le rendu sur les clientes haïtiennes. Le plan le traite donc en premier, en livrant tôt l'outil de comparaison, pour que le test à l'aveugle avance pendant que le reste se construit.

## Décisions d'architecture

- **Le résultat repasse par notre route et s'affiche en `data:`.** La CSP (`lib/content-security-policy.ts`) n'autorise les images que depuis le site, `data:`, `blob:` et Supabase. Le résultat n'est jamais stocké : il traverse la route et part au navigateur.
- **Deux appels, pas un long.** `POST /api/essayage` crée l'essai et rend un identifiant ; le navigateur interroge `GET /api/essayage/[id]` toutes les 2 secondes, 60 secondes au plus. En 3G, une connexion qui tombe ne perd pas l'essai.
- **L'éligibilité et les limites vivent en base.** Une fonction `zabelie_essayage_reserver` vérifie la fiche, le vendeur pilote, le quota du jour (heure d'Haïti, comme `lib/product-commitments.ts`), le plafond du mois et la pause, sous verrou, puis inscrit l'essai. L'interface ne fait que refléter ce que la base décide.
- **Un essai échoué ne compte pas.** `zabelie_essayage_terminer` le passe en `echec`, et ni le quota ni le plafond ne le comptent.
- **Fournisseur `simulation`** pour les tests, l'e2e et la CI : aucun appel payant hors de l'outil de comparaison, et seulement avec `--payer`.
- **Groupes de mesure** calculés par un hachage stable de l'identifiant de l'acheteur. L'exposition est enregistrée dans les deux groupes, côté serveur, au rendu de la fiche.
- **Migration `0150` unique**, construite en deux tâches, appliquée en production seulement sur « oui », puis inscrite au registre à la main (méthode 0086).

## Phases

| Phase | Contenu | Tâches |
|---|---|---|
| 0 | Lectures : conditions des fournisseurs, licences des composants | 0.1 |
| 1 | Fondation sans réseau ni base : règles, interrupteurs, adaptateur, simulation | 1.1, 1.2 |
| 2 | Fournisseurs réels et outil de comparaison (le test à l'aveugle peut commencer) | 2.1, 2.2, 2.3, (2.4) |
| 3 | Base : tables, fonctions, gardes SQL | 3.1, 3.2 |
| 4 | Parcours acheteur de bout en bout, avec la simulation | 4.1 à 4.5 |
| 5 | Administration du pilote | 5.1 |
| 6 | Textes, mesure, mise en ligne (chaque étape sur « oui ») | 6.1 à 6.3 |

Chaque phase se termine par un point de contrôle (tests, build, revue). Les phases 2 et 3 sont indépendantes : on peut les mener en parallèle.

## Index des tâches

- [x] 0.1 Conditions de Genlook et FASHN (entraînement, conservation, droits sur les images) et licences de FASHN Human Parser et DWPose (fait le 2026-10-19)
- [ ] 1.1 Règles pures : sous-rayons autorisés, groupes, interrupteurs, jour haïtien
- [ ] 1.2 Adaptateur de fournisseur et fournisseur `simulation`
- [ ] 2.1 Adaptateur Genlook
- [ ] 2.2 Adaptateur FASHN
- [ ] 2.3 Outil de comparaison à blanc et payant, planche à l'aveugle
- [ ] 2.4 (sur « oui ») Point d'accès GPU du modèle maison pour le test (évaluation seulement : analyseur sous licence non commerciale)
- [ ] 3.1 Migration 0150 : tables, sous-rayons autorisés, RLS, sonde
- [ ] 3.2 Migration 0150 : fonctions de réservation, de fin et d'exposition, garde `definer_exposition`
- [ ] 4.1 Cœur serveur de l'essai (orchestration testable)
- [ ] 4.2 Routes `POST /api/essayage` et `GET /api/essayage/[id]`
- [ ] 4.3 Fiche produit : éligibilité, groupe, exposition, bouton
- [ ] 4.4 Feuille d'essayage : consentement, photo, envoi, attente, résultat
- [ ] 4.5 E2E avec la simulation (faux Supabase), 360 px, 4 langues
- [ ] 5.1 Administration : vendeurs pilotes, plafond, quota, pause, compteur
- [ ] 6.1 Textes à valider : consentement, confidentialité, conditions de vente, sous-traitants
- [ ] 6.2 Mesure : requête d'analyse et seuil de décision
- [ ] 6.3 Mise en ligne : PR, fusion, migration, variables, activation (chaque étape sur « oui »)

## Risques

| Risque | Impact | Parade |
|---|---|---|
| Rendu médiocre sur les peaux foncées | Élevé | Comparaison à l'aveugle dès la phase 2, avant d'allumer quoi que ce soit ; règle de choix du §4.2 |
| Fournisseur qui entraîne ses modèles sur nos photos | Levé | Tâche 0.1 : Genlook et FASHN l'excluent par écrit ; à relire si leurs conditions changent |
| Modèle maison mis en production avec un composant non commercial | Élevé | Analyseur de silhouette sous licence NVIDIA SegFormer : test seulement ; remplacement et nouveau test avant toute production |
| Photo d'acheteur gardée sans fin chez FASHN par son URL | Moyen | Envoi en base64, jamais en URL (tâche 2.2) |
| Facture qui dépasse le budget | Moyen | Plafond tenu par la base, sous verrou, test de 20 réservations simultanées |
| Administrateur sans double authentification | Moyen | Pas d'activation depuis l'interface tant qu'elle manque ; sinon, activation par SQL sur « oui » |
| Catalogue vide | Moyen | Le pilote attend les fiches mode ; le code peut être prêt avant |
| Photo trop lourde pour une fonction Vercel (4,5 Mo) | Moyen | Compression sur l'appareil (`lib/image-compress.ts`), refus côté serveur au-delà d'un plafond |
| Attente trop longue en 3G | Moyen | Appel court plus interrogation ; attente visible ; échec propre à 60 s, non compté |
| Abus (nudité, photo d'un tiers, mineurs) | Élevé | Rayons fermés, consentement « ma photo, 18 ans ou plus », modération stricte chez FASHN, rien conservé |
| Changement d'API d'un fournisseur | Faible | Adaptateur et réponses enregistrées dans les tests |
| Conflits avec d'autres PR sur `lib/i18n.ts` ou la fiche produit | Faible | Branche à jour avec `main` avant chaque point de contrôle |

## Questions ouvertes (porteur)

- Q2 à Q5 de la spécification : photo d'un proche exclue (proposé), vendeurs pilotes, plafond et quota, seuil de décision.
- Q1, Q6 et Q7 : réglées par la tâche 0.1 (`docs/74` §13).
