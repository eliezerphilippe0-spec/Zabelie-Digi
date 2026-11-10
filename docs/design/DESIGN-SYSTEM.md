# Système de design Zabelie

Référence de travail, issue du chantier design et typographie (phases 0 à 5, novembre 2026 ; décisions V-25 à V-28 de `docs/02-DECISIONS.md`). Elle décrit ce qui existe dans le code et les règles que les tests font respecter. En cas d'écart entre ce document et le code, le code et ses tests font foi : corrigez ce document.

## Sources

| Quoi | Où |
|---|---|
| Tokens (couleurs, texte, rayons, ombres, mouvement, plans) | `app/zabelie-theme.css`, seule source |
| Styles de base et composants CSS (`.bouton`, `.champ`…) | `app/globals.css`, `@layer base` et `@layer components` |
| En-tête, barre inférieure | `app/marketplace-header.css` |
| Contrôle des contrastes | `npm run check:contrast` (`scripts/zabelie-contrast.mjs`), appelé par la CI |
| Accessibilité des pages publiques | `e2e/accessibilite.spec.ts` (axe-core, 360 et 1 280 px, clair et sombre) |

Un token manque : il s'ajoute dans `app/zabelie-theme.css`, jamais dans un composant. `tests/design-echelles.test.ts` refuse taille, rayon, espacement ou ombre écrits en dur dans les feuilles suivies, et toute couleur en dur hors du thème et des exceptions nommées.

## Couleurs

Thème clair par défaut ; le sombre redéfinit les mêmes noms sous `[data-theme="dark"]`. Le mode sombre existe, il n'est pas à étendre.

| Rôle | Token | Clair |
|---|---|---|
| Fond de page | `--color-bg-1` | `#faf8f5` (crème) |
| Cartes, champs | `--color-surface` | `#fffdf9` |
| Texte principal | `--color-cloud` | `#17123a` |
| Texte secondaire | `--color-mist` | `#5c5a57` |
| Filets | `--color-line` | `#e8e3dc` |
| Contour d'un champ ou d'un bouton secondaire | `--color-contour` | `#8a857e` (3:1 sur les fonds) |
| Bouton principal (fond) | `--color-brand` | `#e0580f` |
| Texte sur le bouton principal | `--color-on-brand` | `#17123a` |
| Prix, liens texte, mot d'accent sur fond clair | `--color-accent` | `#b8500c` |
| En-tête et pied de page (dégradé) | `--color-chrome`, `-2`, `-3` | `#17123a`, `#2b3050`, `#4a2731` |
| Texte sur le chrome | `--color-on-chrome` | `#fffdf9` |
| Mot d'accent sur le chrome (bannière) | `--color-accent-sur-chrome` | `#f5934f` |
| États | `--color-success`, `-warning`, `-danger`, `-info` et leurs `-text` | |

Règles :

- **L'orange est réservé à l'action principale et aux prix.** Jamais pour un état actif de navigation, un titre ou une décoration de fond.
- **Un seul bouton orange par écran.** Le panier n'en montre un que s'il n'y a qu'un achat possible (`app/panier/page.tsx`).
- L'ancienne palette (`#080808`, `#FF6B00`, DM Sans) est abandonnée : ne jamais la référencer.
- **Texte translucide** : `text-mist/NN`, `text-cloud/NN` ou `text-on-chrome/NN` doit tenir 4,5:1 au pire sur tous ses fonds, dans les deux palettes. Le script le calcule. En clair, `text-mist/80` ne passe pas (4,04:1) ; `/90` passe (5,09:1).

## Typographie

| Famille | Token | Usage |
|---|---|---|
| Inter | `--font-sans` | Corps, champs, interface |
| Manrope | `--font-heading` | Titres, prix, libellés de boutons |
| Instrument Serif Italic, découpée | `--font-accent` | Un mot d'accent, rien d'autre |

Les trois polices sont auto-hébergées, en `display: swap`, **sans préchargement** : précharger Inter et Manrope repoussait le premier affichage de 0,86 à 2,1 s (mesure du 2026-10-17, `tests/polices-chargement.test.ts`). Budget : 90 Ko de WOFF2 pour les trois.

Échelle (`--text-*`) : `xs` 12, `sm` 14, `base` 16, `lg` 18, `xl` 20, puis en `clamp()` `2xl` 20 → 24, `3xl` 28 → 30, `4xl` 32 → 38, `display` 36 → 56 (bannière seulement). Interlignes : 1,15 (display), 1,25 (titres), 1,55 (corps) ; −0,02em sur les titres.

- **Un style de `h1`, un style de `h2`**, posés dans `@layer base`. Pas de `text-*` ni de `font-*` sur un `h1` ou un `h2` (`tests/titres-role.test.ts`). `.titre-section` et `.titre-bloc` pour les titres de carte.
- Hiérarchie sans saut : `h1` → `h2` → `h3`. Une grille de cartes produit (titrées en `h3`) a un `h2` au-dessus, visible ou en `sr-only` (`tests/accessibilite-phase5.test.ts`).
- **Prix** : toujours par `Prix` (`components/prix.tsx`), Manrope, chiffres tabulaires, devise allégée (`.prix-devise`).

### Le mot d'accent

`TitreAccent` (`components/titre-accent.tsx`) pose un mot de la chaîne i18n existante en `--font-accent`, classe `.mot-accent`. Le mot est désigné par une seconde clé (`*.accent`), dans les quatre langues ; s'il est introuvable, le titre reste intact et le manque se journalise.

- Un mot, ou deux au plus, par titre. Bannière de l'accueil, titres de section clés, carte de connexion.
- Jamais sur un prix, un bouton, un formulaire, la navigation, ni un texte sous 24 px. La liste des emplois est tenue par `tests/police-accent.test.ts`.
- Chaque lettre d'un mot d'accent doit exister dans la découpe de la police (vérifié dans le fichier WOFF2 par les tests).
- Coût connu : environ 100 ms de LCP sur l'accueil (V-27) et 426 ms sur la connexion (V-28), en simulation 4G lente. Accepté par le porteur.

## Espacement, rayons, ombres, plans

- Espacement : l'échelle Tailwind (`--spacing(n)`, pas de 4 px), en feuille comme en classe. Sections de l'accueil séparées de 40 px, 48 en grand écran.
- Rayons : `--radius-lg` 8, `--radius-card` 12, `--radius-xl` 20, `--radius-full`.
- Ombres : `--shadow-sm`, `-md`, `-lg`, teintées indigo (`--color-ombre`), jamais noir pur.
- Plans : `--z-base`, `--z-sticky`, `--z-drawer`, `--z-header`, `--z-modal`, `--z-toast`.

## Mouvement

`--motion-fast` 120 ms (appui), `--motion-base` 200 ms, `--motion-slow` 300 ms, `--ease`. Sous `prefers-reduced-motion: reduce`, les trois tombent à 0 ms : toute durée doit passer par eux. N'animer que `transform` et `opacity` ; l'appui d'un bouton est `scale(0.97)`.

⚠️ Écart connu, antérieur au chantier : des fondus de survol animent encore la couleur, la bordure ou l'ombre (utilitaire `transition` nu, quelques règles de `app/home-vivant.css`, `app/editorial-marketplace.css`, `app/ventes-flash.css`). Ne pas en ajouter ; voir `docs/design/RAPPORT-FINAL.md`.

## Composants

| Besoin | Employer | Règles |
|---|---|---|
| Bouton ou lien-bouton | `.bouton` + `.bouton-primaire` / `-secondaire` / `-texte`, taille `.bouton-compact` (44 px) ou `.bouton-grand` (56 px) ; 48 px par défaut | États `:active`, `:disabled`, `aria-busy="true"` inclus. Un lien habillé en bouton porte `.bouton` (`tests/boutons-variantes.test.ts`). |
| Champ | `.champ` et `.libelle` | 48 px, texte 16 px, libellé toujours visible, `inputMode` et `autoComplete` justes (`tests/champs.test.ts`). |
| Erreur | `MessageErreur` | Texte et icône, `role="alert"`, jamais la couleur seule. |
| Étiquette | `.etiquette`, `-neutre`, `-image` | Deux au plus par carte. |
| État vide | `EtatVide` | Titre, phrase d'action en i18n, niveau de titre réglable (`titreBalise`). |
| Icône | `Icone` | Une famille, trait 1,75, tailles 16, 20, 24, SVG en ligne. Une icône seule a un nom accessible. |
| Carte produit | `ProductCard` | Image carrée, nom sur deux lignes en `h3`, prix par `Prix`. |
| Navigation mobile | `BarreNavigation` | Sous 768 px : Akèy, Kategori, Panyen, Kont ; entrées de 56 px, zone sûre ; état actif par trait et graisse, sans orange ; libellés courts `nav.bar.*` sur une ligne. |
| Rappel d'achat de la fiche | `RappelAchat` (`components/rappel-achat.tsx`) | Sous 768 px, sur la fiche seulement : le prix et un lien vers `#acheter`, posés au-dessus de la barre inférieure. Il s'efface dès que le bloc d'achat ou un autre bouton principal est à l'écran (jamais deux boutons orange), n'apparaît qu'après le premier rendu (aucun décalage) et n'a aucun état d'achat : le paiement reste dans `BuyButton`. `tests/rappel-achat.test.ts`, `e2e/fiche-rappel-achat.spec.ts`. |
| Menu du compte | `AccountMenu` (`entete` ou `barre`) | Liens écrits une fois dans `SiteNav` (`liensCompte`), servis à deux places complémentaires. |

Cibles tactiles : 44 px au moins, partout (`tests/cibles-tactiles.test.ts`). Le nom accessible d'un lien ou d'un bouton reprend son texte visible (WCAG 2.5.3) : préférez un nom tiré du contenu à un `aria-label` qui le réécrit.

## Textes et langues

- Kreyòl d'abord : tout texte visible passe par `lib/i18n.ts`, dans les quatre langues. Aucune clé sans appelant (`tests/i18n-cles-mortes.test.ts`).
- `<html lang>` suit la langue servie.
- Une expression régulière sur du texte d'interface ne s'écrit pas avec `\b` : voir « `\b` ne connaît pas le kreyòl » dans `CLAUDE.md`.
- Aucun chiffre ou fait non vérifié dans un texte (nombre de vendeurs, délais, garanties) : une donnée réelle sous seuil (`lib/home-sections.ts`), ou rien.

## Ce qui ne se touche pas

Le chemin de l'argent (`tests/helpers/chemin-argent.ts` : paiement, facture, recharge, KYC, versements, boutons d'achat) garde sa présentation tant que le porteur n'a pas donné son accord. `app/api`, `supabase/migrations`, les fonctions `zabelie_*` et le ledger sont hors du périmètre du design.

## À ne pas faire

- Écrire une couleur, une taille ou un rayon à la main dans un composant.
- Mettre de l'orange sur un état actif, un titre ou un fond.
- Ajouter un deuxième bouton principal à un écran.
- Poser le mot d'accent sur un prix, un bouton ou un texte sous 24 px.
- Précharger une police sans nouvelle mesure du premier affichage.
- Remplacer le nom visible d'un contrôle par un `aria-label` différent.
- Ajouter un bouton flottant par-dessus le contenu ou la barre inférieure. **Une seule exception, nommée** : le rappel d'achat de la fiche (`RappelAchat`, accord du porteur du 2026-11-10, audit P0-6), aux conditions du tableau des composants. Elle ne fait pas précédent.
