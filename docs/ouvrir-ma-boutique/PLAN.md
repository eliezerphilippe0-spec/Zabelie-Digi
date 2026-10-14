# Page « Ouvrir ma boutique » (L'étal) : spécification et plan

Chantier du 2026-10-14, branche `feat/ouvrir-ma-boutique`.

## 0. Origine

Le porteur a demandé d'appliquer la méthode ScrollCraft (vidéo de Nate Herk,
youtube.com/watch?v=QUI6Ug4cHnE) à zabelie.com. Un prototype autonome a été
construit et vérifié hors dépôt (`D:\scrollcraft\builds\zabelie-boutique\`,
interview verbatim dans son `BRIEF.md`). Le porteur a ensuite choisi « Nouvelle
page sur le site » : la page s'ajoute, l'accueil ne change pas.

## 1. Objectif vérifiable

Une page publique `/ouvrir-ma-boutique` (et `/ht/…`, `/fr/…`) qui reprend le
prototype : page de titre en trois plans, cinq chapitres, l'étal qui se dessine
au défilement avec le nom saisi par le visiteur peint sur l'enseigne, le calcul
du net, le colophon. Vérifié par :

- `npm test`, `npm run typecheck`, `npm run lint`, `npm run check:contrast` verts ;
- la page ajoutée à `e2e/accessibilite.spec.ts` (axe-core, 4 rendus) et la CI verte ;
- des captures ordinateur et téléphone de la page servie par Next.

## 2. Arrêt ferme

- La PR est ouverte ; **elle n'est pas fusionnée sans le « fusionne » du porteur**.
- Aucun lien depuis l'accueil, l'en-tête ou le pied de page : où annoncer la
  page est une décision du porteur, prise après l'avoir vue en préversion.
- Aucune écriture en base, aucune variable d'environnement, aucune dépendance.

## 3. Décisions prises pour ce chantier

- **V-23** (porteur, 2026-10-14) : l'exception de V-22 (décor illustré et
  mouvement) s'étend à `/ouvrir-ma-boutique`, et à elle seule, sous les mêmes
  garde-fous. Inscrite dans `docs/02-DECISIONS.md`.
- **Moteur** (porteur, 2026-10-14) : le moteur ScrollCraft n'est PAS embarqué.
  Le strict nécessaire est réécrit en TypeScript dans le dépôt
  (`lib/etal-defilement.ts`) : progression d'acte publiée en `--sc-p`,
  apparitions de cues, rideau en `clip-path`, parallaxe, apparition à l'entrée,
  compteur. Pas de dépendance nouvelle.

## 4. Règles du dépôt qui s'appliquent, et comment elles sont tenues

| Règle | Tenue |
|---|---|
| Taux de commission jamais en dur (CLAUDE.md, règle 3) | Taux lu par `lireTauxCommission()`, exemple et calcul par `commissionAuTaux()` (l'arrondi réellement en vigueur). Aucun « 10 % » dans les libellés : `{taux}` et `{palier}`. |
| J+7 | `MATURATION_DAYS` de `lib/escrow.ts`, libellé `{jours}`. |
| Quatre langues, aucune chaîne en dur | Clés `etal.*` en fr, ht, en, es dans `lib/i18n.ts`. Le kreyòl est à faire relire, comme le reste du dictionnaire. |
| Libellés des composants client en props | `components/etal-page.tsx` reçoit tout en props. |
| CSP : `font-src 'self'`, scripts à nonce | Polices déjà servies par `app/layout.tsx` (Manrope `--font-display`, Inter `--font-inter`) ; aucun script externe. |
| État de repos visible, mouvement sous `no-preference` | Sans JavaScript ou en mouvement réduit, tout le texte est lisible et l'étal est dessiné fini. |
| Aucun visuel inventé (V-21) | Décor = l'étal de `components/home-vivant.tsx` : sans produit, sans prix, sans vendeur, `aria-hidden`. Le seul nom peint est celui que le visiteur écrit. |
| Rien ne quitte la page | Pas de `<form>`, pas de requête : le nom reste dans le navigateur (localStorage). |

## 5. Fichiers

- `app/ouvrir-ma-boutique/page.tsx` : page serveur (langue, taux, métadonnées).
- `app/ouvrir-ma-boutique/etal.css` : styles de la page, tous sous `.page-etal`.
- `components/etal-page.tsx` : composant client (défilement, nom, folio, calcul).
- `components/etal-dessin.tsx` : le SVG de l'étal (animé ou fini).
- `lib/etal-defilement.ts` : le moteur réduit.
- `lib/i18n.ts` : clés `etal.*`.
- `lib/langue-url.ts`, `app/sitemap.ts` : la route localisable et indexée.
- `e2e/accessibilite.spec.ts` : la page dans l'audit axe.
- `tests/ouvrir-ma-boutique.test.ts` : gardes, chacune rougie par une mutation.
- `docs/02-DECISIONS.md` : V-23.
