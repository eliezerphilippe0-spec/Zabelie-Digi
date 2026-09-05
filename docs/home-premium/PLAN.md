# Accueil premium — Phase 0 : mesure et plan

Branche `home-premium/0-baseline`, sans code applicatif. Tout ce qui suit est
**mesuré** (commande ou `fichier:ligne`) ou marqué comme hypothèse. La phase
s'arrête ici : rien ne se construit avant le « go » du porteur.

## 0. Ce que la mesure a pu être, et ce qu'elle n'a pas pu être

⚠️ **zabelie.com n'est pas joignable depuis l'environnement d'exécution**
(`curl https://zabelie.com/` → `CONNECT tunnel failed, response 403`, proxy
d'egress). Les captures et le Lighthouse ci-dessous sont donc pris sur un
**build de production local** (`npm run build`, `npm start`), même code que
`main` au commit `ad6a82f`.

⚠️ **Et ce build local n'a pas de produits** : `ddditxykopuxxqzgkqwy.supabase.co`
n'est pas non plus dans la liste blanche d'egress (`server.log` :
`catalogue indisponible: Host not in allowlist`). L'accueil a rendu son état
« catalogue vide » (`app/page.tsx:150`, `.catch(() => [])`). Conséquences :

- **valides** ici : en-tête, hero, carrousel, polices, couleurs, `theme-color`,
  hauteurs, ordre des sections, accessibilité structurelle — rien de cela ne
  dépend des données ;
- **à refaire en Phase 5 sur le vrai domaine** : tout ce qui touche aux
  produits (rangées, données de test, LCP réel avec cartes). Le diagnostic
  produit du brief est croisé ci-dessous avec la **base**, pas avec le rendu.

## 1. Outils et compétences (brief §8)

| # | Élément | État mesuré |
|---|---|---|
| 1 | Skill `frontend-design` (anthropics/skills) | **Absente** de `.claude/skills/` (`ls` : `design-taste-frontend`, `redesign-existing-projects`). Ce plan est fait **sans elle**. À installer selon la règle du dépôt : copier, écrire le préambule Zabelie, l'ajouter à `tests/skill-taste.test.ts` — jamais par `npx skills add` seul (CLAUDE.md). |
| 2 | Skill `revi-app` | **Présente** (liste des compétences de la session). Disponible pour la Phase 5. |
| 3 | Playwright | `@playwright/test ^1.49.1` (`package.json`), Chromium 1194 sous `/opt/pw-browsers/`. ⚠️ La version installée attend `chromium_headless_shell-1228`, absente : les captures ont été prises en passant `executablePath` explicitement. En CI, `npx playwright install chromium` (déjà dans `ci.yml:107`). |
| 4 | Lighthouse CLI | Non installé localement ; `npx --yes lighthouse` fonctionne (**13.4.1**). Utilisé avec `--throttling-method=simulate`, RTT 150 ms, 1,6 Mb/s, CPU ×4 (profil « Slow 4G » de Lighthouse). |
| 5 | Mobbin MCP | Connecté, mais **plan payant requis** (`Mobbin MCP requires a paid plan`). **Phase 0 faite sans références Mobbin.** |
| 6 | `zabelie-kit` | **N'existe pas sous ce nom** dans le dépôt (une seule mention, `docs/29:71`). Ce qui existe et est actif : `CLAUDE.md`, le hook `Stop` (commit + push), deux skills sous préambule, et les tests de garde (`tests/*.test.ts`, 920 verts). |
| 7 | Versions | Node **v22.22.2** · Next **^16.2.10** · `next/font` disponible (déjà utilisé, `app/layout.tsx:2`). |
| 8 | Images du hero | `public/brand/` : `eliezer-casual.jpg`, `eliezer-portrait.jpg`, `eliezer-welcome-25x.png` — trois portraits du fondateur, **aucune photo produit ou vendeur**. Bucket : 1 objet, sur un brouillon (`ouin-ez6f`). **Aucune image ne sera générée.** À fournir : voir §7. |

## 2. Diagnostic du brief, vérifié

| Constat du brief | Vérification | Source |
|---|---|---|
| Premier écran mobile sans produit, en-tête ≈ 45 % | **En-tête = 250 px sur 812 (31 %)**, `h1` à y = 274 ; le premier `<a href="/produit/…">` est absent de l'écran (aucun dans le DOM local, et en prod il vient après hero + confiance + rayons) | `before/mesures.json`, `before/home-mobile-viewport.png` ; `components/site-nav.tsx:66-83` (commentaire qui mesure déjà 250 px) |
| En-tête rendu deux fois | **Un seul `<header>` dans le DOM** (`headersDansDom: 1`). Ce sont des variantes desktop (`hidden md:block`, `site-nav.tsx:134`) et mobile (`md:hidden`, `:210`, `:227`) masquées en CSS. Pas de double rendu ; mais le HTML est bien envoyé deux fois (recherche ×2, liens ×2). | `site-nav.tsx:134-142, 210-218, 227-262, 270-330` |
| Données de test dans « Produit de la semaine » / « Tendances » | Confirmé par la **base** : 3 produits publiés, dont `fxccxfdf` (0 HTG), 0 image, 0 vente payée ; `featured = bySales[0]` prend le plus vendu au compteur `sales_count` | `docs/home-premium/test-data-to-review.md` ; `app/page.tsx:174-183` |
| « Meilleurs vendeurs » : 1 vendeur | Confirmé : 2 profils ont des produits, 1 seul publié. La section s'affiche dès `sellers.length > 0` | `app/page.tsx:697` |
| « Fichiers digitaux » vide mais affichée | Confirmé et **voulu** (décision porteur 2026-08-10, « visible même vide ») | `app/page.tsx:653-668, 75-82` |
| URL brute comme libellé | **Non reproduit** localement (`urlLabels: []`), non trouvé dans le code (`grep` : aucun `href` rendu en texte). Hypothèse : suggestion de recherche ou fiche sans titre côté prod. **À mesurer sur le domaine réel en Phase 5.** | `components/search-box.tsx`, `category-sidebar.tsx:77` |
| 18/19 catégories « bientôt » | Base : **16 rayons de niveau 1, 16 actifs, 1 seul avec un produit publié** (`Digital & services`, 3). Donc 15 « bientôt ». Le mot est rendu par `menu.empty` | `lib/i18n.ts:26`, `app/page.tsx:477-481` |
| Hero et bannière disent la même chose | **Trois fois** : `home.h1b` « …payez avec MonCash » (`i18n:177`), `hero.s1.t` « Achetez en sécurité avec MonCash » (`:178`), `trust.1.t` « Paiement sécurisé avec MonCash » (`:692`) | `lib/i18n.ts` |
| Treize sections | Local (sans produits) : 10 `<section>`, 6 `h2`. Avec produits : jusqu'à 16 blocs (`page.tsx:266-919`). Carrousel **auto-play 6 s** (`hero-carousel.tsx:49-52`) | `app/page.tsx`, `components/hero-carousel.tsx` |
| `theme-color` `#100c09` | Confirmé : `themeColor: BRAND_INK` = `#100c09`. ⚠️ Le commentaire dit que **`#17123a` est la palette ABANDONNÉE le 2026-07-25** | `app/layout.tsx:65-70`, `lib/brand.ts:32` |
| Serif display + fond brun-noir vs charte Manrope + Inter | **Les deux sont dans le dépôt, à des dates différentes.** Charte écrite : Manrope 800 + Inter (`docs/18:113`, `docs/15:133`, décision 2026-07-25). Code : Inter + **Playfair Display**, « demande porteur 2026-08-11, d'après la carte de restaurant photographiée » (`app/layout.tsx:19-20`). Fond brun chaud : resserrement du 2026-08-17 (`app/zabelie-theme.css:10-34`). **La vérité du dépôt est le code : Playfair + bruns chauds, décidés après la charte écrite, par le porteur.** Le brief demande Manrope : c'est une **décision de marque à confirmer** (§7). |
| Langue par défaut FR | Confirmé, et **décidé** : V-18 du 2026-09-02, « Oui fr » (`docs/02-DECISIONS.md:28`) | |

## 3. Inventaire

### 3.1 Composants de l'accueil (`app/page.tsx:1-27`)
`SiteNav` (334 l.), `SiteFooter`, `ProductCard`, `CategorySidebar`,
`DepartmentIcon`, `HeroCarousel` (client, `useEffect` + `setInterval`),
`MetricA`, `FaqList`, `TrustBar`. Données : `getPublishedProducts`,
`getCatalogueCategories`, `getMenuRayons`, `promoSellerIds` (client admin).

### 3.2 Polices (mesuré sur le rendu local)
| Fichier | Famille | Octets |
|---|---|---|
| `e4af272ccee01ff0-s.p.woff2` | Inter (préchargée) | 48 432 |
| `eaead17c7dbfcd5d-s.p.woff2` | Playfair Display variable (préchargée) | 38 460 |
| **Total chargé sur l'accueil** | | **86 892 o = 84,9 Ko** |

Neuf autres fichiers Inter (graisses/sous-ensembles) sont émis au build
(`.next/static/media/`, 9–25 Ko chacun) mais **non chargés** sur l'accueil.
`h1` rendu en `"Playfair Display"`, corps en `Inter` (`mesures.json`).
Cible du brief ≤ 90 Ko : **déjà tenue** ; Manrope + Inter devra l'être aussi.

### 3.3 Dépendances utilisées par l'accueil
`next` (Link, Image, font), `react`, `@supabase/ssr`, Tailwind v4. Aucune
bibliothèque d'animation, d'icônes ni de carrousel (`hero-carousel.tsx` est
maison). JS transféré sur l'accueil : **148 Ko** (Lighthouse, 26 requêtes).

### 3.4 Tokens existants (`app/zabelie-theme.css`)
Fond `--color-bg-1/2/3` (#100c09 / #0b0806 / #070505) · surfaces `maroon /
neutral / brown` · accent `#f5934f` · brand `#f26a21` · `on-brand #0a0a0a` ·
texte `cloud #f7f2ec`, `mist #a99f95` · `line rgba(245,232,216,.13)` ·
statuts vert/jaune/rouge · `--font-sans`, `--font-heading` (serif) ·
`--radius-xl 1.25rem` + règle des rayons (l.130-148) · **mode clair complet**
(`[data-theme="light"]`, l.175-213). **Aucun token de mouvement** ; les seules
animations : `zbReveal 460 ms`, `zbMark 520 ms` (`app/globals.css:113-119`),
sous `prefers-reduced-motion: no-preference`.

### 3.5 Lighthouse mobile (local, sans produits — `lighthouse-before.json`)
| Métrique | Valeur | Cible brief |
|---|---|---|
| Performance | **97** | ≥ 90 |
| Accessibilité | **97** | ≥ 95 |
| LCP | **2,7 s** | ≤ 2,5 s ✗ |
| CLS | 0 | ≤ 0,1 |
| TBT | 30 ms | — |
| FCP / Speed Index | 0,9 s / 0,9 s | — |
| Poids total | 298 Ko | — |
| Échecs a11y | `skip-link`, `landmark-one-main` | |

Lecture : le LCP dépasse déjà la cible **sans une seule image produit**. Et
les deux échecs d'accessibilité disent la même chose : **l'accueil n'a pas de
`<main>`** — le lien d'évitement `href="#main"` (`site-nav.tsx:88`) vise une
ancre qui n'existe pas sur la page d'accueil (`app/page.tsx:261`, un `<div>`).
Les 26 autres pages l'ont (audit du 2026-09-02) ; celle-ci a été oubliée.

## 4. Direction (décisions du brief, appliquées ; contradictions signalées)

### 4.1 Palette
Celle du brief §3.1, telle quelle, dans `zabelie-theme.css`. Trois
contradictions avec le dépôt, **à trancher par le porteur** avant la Phase 1 :

1. **Fond clair par défaut.** Le dépôt est sombre par défaut, clair sur cookie
   (`layout.tsx:80-84`, `zabelie-theme.css:175`). Le brief impose une toile
   crème `#faf8f5`. Deux voies : (a) le clair devient le défaut et le sombre
   reste un choix — la bascule existe, c'est un changement de valeur par
   défaut ; (b) supprimer le sombre. **Recommandation : (a)**, réversible,
   et les 82 paires du contrôle de contraste existent déjà pour les deux.
2. **`#17123a` (indigo)** : abandonné le 2026-07-25 « parce que la barre
   d'adresse s'affichait violette au-dessus d'un site noir et orange »
   (`layout.tsx:66-68`). Sur une toile crème avec en-tête indigo, l'argument
   tombe. À confirmer en connaissance de cause.
3. **Orange uniquement CTA et prix** (A12) : aujourd'hui `accent` sert aussi
   aux icônes de confiance, aux liens « tout voir », aux bordures de survol
   (`page.tsx:48, 458, 470, 791`). Ils passeront en `--ink` / `--ink-2`.

### 4.2 Typographie
Manrope 700/800 + Inter 400/500, `next/font`, `subsets: ['latin','latin-ext']`,
échelle 28/20/16/14. **Le serif Playfair tombe SI le porteur confirme** : il a
été demandé par lui le 2026-08-11 (`layout.tsx:19-20`), après la charte
Manrope. Le brief dit « retirer si la mesure confirme qu'il n'est pas dans la
charte » : la mesure dit qu'il est dans la charte **la plus récente**, celle
du code. Décision de marque → §7.

### 4.3 Mouvement
Tokens `--motion-fast/base/slow` + `--ease` ajoutés au thème ; `zbReveal`
(460 ms) et `zbMark` (520 ms) ramenés sous 300 ms ou retirés ; carrousel
auto-play supprimé ; `transform`/`opacity` seulement.

## 5. Wireframe mobile du premier écran (375 × 812, ≈ 800 px utiles)

```
┌──────────────────────────────────────────┐ 0
│ ▓▓ [Z]  [🔍 Chèche yon pwodui…      ]  🛒 👤 │ 56  en-tête, --brand-gradient, 1 ligne
│ ▓▓ (Sèvis dijital)(Bote & swen)(Mòd) …  → │ 100 chips défilantes — catégories NON vides
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │  [photo produit/vendeur réelle]      │ │
│ │  Achte an sekirite, peye ak MonCash  │ │  h1 = texte de la bannière, ≤ 8 mots
│ │  [ Gade katalòg la ]  ← --accent     │ │
│ └──────────────────────────────────────┘ │ 296  bannière 180 px + marges
│ 🛡 MonCash · 🔒 Lajan pwoteje · ₲ Goud · 💬 WhatsApp │ 340 barre de confiance, 1 ligne
├──────────────────────────────────────────┤
│ Pwodui yo                    Wè tout →   │ 380
│ ┌────────────┐  ┌────────────┐          │
│ │  image 1:1 │  │  image 1:1 │          │
│ │            │  │            │          │
│ ├────────────┤  ├────────────┤          │
│ │ Nom 2 lignes│  │ Nom        │          │
│ │ 300 HTG ←acc│  │ 1 200 HTG  │          │
│ │ pa Bebeto   │  │ pa Marie   │          │
│ └────────────┘  └────────────┘          │ 700  première rangée ENTIÈRE visible
│ ┌────────────┐  ┌────────────┐          │
│ │  …         │  │  …         │          │ 812  ligne de flottaison
└──────────────────────────────────────────┘
                     [💬] FAB WhatsApp 48 px, bas droite
```

Aucune icône émoji dans le rendu : ce sont des repères de wireframe ; le code
utilise les SVG inline déjà en place (`trust-bar.tsx`, `department-icons.tsx`).

**Avec le catalogue d'aujourd'hui (3 produits, 0 image, seuil ≥ 4)**, la
rangée « Pwodui yo » ne s'affiche pas : sous la barre de confiance vient
directement l'appel aux vendeurs (bloc « Ouvrez votre boutique », descendu
mais seul contenu). Le brief le sait (§4.3) ; il faut le voir avant le « go ».

## 6. Sections — conservées, supprimées, déplacées

| Section aujourd'hui (`page.tsx`) | Décision |
|---|---|
| Topbar (thème, langue, WhatsApp) `site-nav:97-125` | **Fusionnée** dans l'en-tête compact (langue et thème dans le menu compte) |
| Logo + recherche + « Rechercher » `site-nav:127-218` | **Conservée**, une ligne, bouton texte → icône loupe |
| Ligne « Rayons · Catalogue · Talents · Aide » `site-nav:227-262` | **Supprimée** → chips catégories non vides ; Aide/Talents → menu compte + footer |
| Bandeau catégories `page:280-312` | **Remplacé** par les chips de l'en-tête (même source : `getCatalogueCategories`) |
| `h1` + carrousel 3 slides `page:335-355` | **Fusionnés** en une bannière image, `h1` dedans, sans auto-play |
| Rail WhatsApp + carte boutique `page:373-419` | WhatsApp → FAB ; carte boutique → fin de page |
| Barre de confiance `page:429-437` (5 items) | **Conservée**, compacte, 4 items, sous la bannière |
| Grille des rayons + capteur de demande `page:446-535` | **Supprimée de l'accueil** (les chips + `/catalogue` la portent) ; « bientôt » disparaît, une ligne « Lòt rayon ap vini » sous les chips |
| Bandeau paiement `page:538-562` | **Supprimée** (triplon MonCash) |
| Produit de la semaine `page:565-606` | **Supprimée** au profit de la grille (seuil) |
| Catégories du catalogue `page:612-629` | **Supprimée** (doublon des chips) |
| Tendances / Nouveautés / Fichiers / Services / Gratuits / Promo `page:632-744` | **Une grille + rangées sous seuil ≥ 4** (helper partagé, à chercher : `HomeRow` + `inedit` existent, `page:60-123, 197-203`) |
| Meilleurs vendeurs `page:697-722` | **Seuil** ≥ 3 vendeurs avec ≥ 1 vente **payée** (aujourd'hui : `sales_count`, pas un paiement — à corriger dans le helper, lecture seule) |
| Pourquoi choisir Zabelie `page:769-803` | **Supprimée** (doublon de la confiance) |
| FAQ `page:806-813` | **Déplacée** vers `/aide#faq` — à vérifier que `/aide` porte déjà la liste (`FaqList`) |
| Comment ça marche `page:816-852` | **Un lien** vers `/aide` et `/vendre` |
| Fondateur `page:855-892` | **Conservée**, compacte, fin de page |
| CTA final `page:895-917` | **Conservée**, fusionnée avec la carte boutique |

## 7. Décisions laissées ouvertes au porteur (avant le « go »)

1. **Langue par défaut.** Le brief demande `kr` ; **V-18 (2026-09-02) dit
   FR**, et le code kreyòl s'appelle `ht`, pas `kr` (`lib/i18n.ts:18`). Le
   SEO : la langue vit dans un cookie, donc changer le défaut change la
   langue de **toute la surface indexée** en une fois (`docs/47` §3) — c'est
   la migration `/ht/` `/fr/` qui règle le fond, pas ce basculement.
   **Je ne change pas V-18 sans une décision écrite.**
2. **Serif Playfair : retirer ou garder** (§4.2). Votre demande d'août contre
   votre brief de septembre.
3. **Indigo `#17123a` et toile crème par défaut** (§4.1, points 1-2).
4. **Images du hero à fournir** : une photo réelle (produit ou vendeur), format
   JPEG ou WebP, **1600 × 900 px** (16:9, recadrée en 2:1 sur mobile),
   **≤ 120 Ko**, sujet centré dans le tiers médian, sans texte incrusté (le
   texte vient de l'i18n). Sans elle, la Phase 3 pose un aplat `--ink` neutre.

## 8. Autocritique — ce qui ressemblerait à un rendu générique

- **Une bannière dégradée + un CTA orange + une grille 2 colonnes**, c'est le
  gabarit de toute marketplace générée. Ce qui le rend Zabelie : la phrase en
  kreyòl comme `h1`, les prix en gourdes en gras, la barre de confiance qui ne
  promet **que** ce qui existe (pas de « livraison rapide », `trust-bar.tsx`),
  et l'état vide honnête au lieu de faux produits.
- **Le risque inverse** : un accueil vide à quatre produits. Le seuil ≥ 4 est
  juste ; il rend visible que le problème de Zabelie est le catalogue, pas la
  page. Cette phase ne le cache pas.
- **La palette imposée est plus « standard » que celle du dépôt** (bruns
  chauds resserrés le 2026-08-17 précisément pour ne pas ressembler à un
  thème par défaut). Le brief le décide ; je le note.
- **Manrope + Inter** : deux grotesques proches. Le contraste typographique
  viendra de la graisse (800 vs 400) et de la taille, pas de la forme. Le
  serif faisait ce travail ; c'est le prix du retrait.

## 9. Ce qui est livré dans cette PR
`before/` : 12 captures (mobile 375×812, desktop 1440) de `/`, `/catalogue`,
`/produit/appel-ak873`, `/vendre`, `/aide` · `before/mesures.json` ·
`lighthouse-before.json` · `test-data-to-review.md` · ce plan · une maquette
du premier écran « avant / après » sur le canevas de design :
https://claude.ai/code/artifact/1bcb1cc5-559c-4692-b824-b127571700df
(privée, propriétaire du compte ; exportable en PNG/PDF).
