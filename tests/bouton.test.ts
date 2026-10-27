import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadRoute } from "./helpers/route-harness";

/**
 * LE BOUTON PARTAGÉ (`components/bouton.tsx`) — audit du système de design du
 * 2026-10-27, constat m5.
 *
 * On EXÉCUTE le composant (transpilé, `react/jsx-runtime` remplacé par une
 * fabrique d'objets) au lieu de chercher des sous-chaînes dans sa source : une
 * classe présente dans le fichier mais jamais rendue — la variante qu'on croit
 * appliquée et qui ne l'est plus — passerait un `includes`, pas ceci.
 *
 * Ce qui est gardé est ce qui COMMANDE le rendu : l'élément choisi (lien ou
 * bouton), les attributs d'état (`disabled`, `aria-busy`, `type`), et les
 * classes effectivement posées sur l'élément racine pour chaque variante.
 */

type Noeud = { type: unknown; props: Record<string, unknown> };
const LIEN = Symbol("next/link");
const jsx = (type: unknown, props: Record<string, unknown>): Noeud => ({ type, props });

const mod = loadRoute("components/bouton.tsx", {
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
  "next/link": { default: LIEN },
}) as unknown as { Bouton(p: Record<string, unknown>): Noeud };

const rendu = (p: Record<string, unknown>) => mod.Bouton({ children: "Peye", ...p });
const classes = (n: Noeud) => String(n.props.className).split(/\s+/).filter(Boolean);
/** Une classe EXACTE (pas une sous-chaîne : `text-danger` ⊂ `text-danger-text`). */
const porte = (n: Noeud, c: string) => classes(n).includes(c);
/** Tous les nœuds de l'arbre, profondeur d'abord. */
function noeuds(n: unknown): Noeud[] {
  if (Array.isArray(n)) return n.flatMap(noeuds);
  if (!n || typeof n !== "object") return [];
  const x = n as Noeud;
  // Un sous-composant (`<Cercle />`) se déplie : c'est SON rendu qui compte.
  if (typeof x.type === "function") return [x, ...noeuds((x.type as (p: unknown) => unknown)(x.props))];
  return [x, ...noeuds(x.props?.children)];
}

test("BT1 — `href` rend un lien next/link ; sans `href`, un <button type=\"button\">", () => {
  const lien = rendu({ href: "/mes-achats" });
  assert.equal(lien.type, LIEN, "avec href, le composant doit rendre next/link");
  assert.equal(lien.props.href, "/mes-achats");
  assert.equal(lien.props.type, undefined, "un lien ne porte pas de type de bouton");

  const bouton = rendu({});
  assert.equal(bouton.type, "button");
  assert.equal(bouton.props.type, "button", "le type par défaut empêche un envoi de formulaire accidentel");
  assert.equal(rendu({ type: "submit" }).props.type, "submit", "le type demandé passe");
});

test("BT2 — socle commun : `.bouton`, rayon des boutons, 44 px au moins, focus hérité", () => {
  for (const variante of ["primaire", "secondaire", "discret", "danger"]) {
    for (const taille of ["md", "lg"]) {
      for (const n of [rendu({ variante, taille }), rendu({ variante, taille, href: "/x" })]) {
        const ou = `${variante}/${taille}/${n.type === "button" ? "button" : "lien"}`;
        assert.ok(porte(n, "bouton"), `${ou} : sans .bouton, le libellé retombe en Inter (boutons-typographie)`);
        assert.ok(porte(n, "rounded-xl"), `${ou} : le rayon des boutons est rounded-xl (règle des rayons)`);
        assert.ok(!classes(n).some((c) => /^rounded-(?!xl$)/.test(c)), `${ou} : un second rayon contredirait la règle`);
        assert.ok(porte(n, taille === "lg" ? "min-h-12" : "min-h-11"), `${ou} : cible tactile sous 44 px`);
        assert.ok(!classes(n).some((c) => /(^|:)(outline-none|focus:outline-none|focus-visible:outline-none)$/.test(c)),
          `${ou} : le focus clavier doit rester celui de la couche base (:focus-visible)`);
      }
    }
  }
});

test("BT3 — les quatre variantes, et `danger` en texte `-text`", () => {
  const p = rendu({});
  assert.ok(porte(p, "bg-brand") && porte(p, "text-on-brand"), "primaire = le CTA orange, texte on-brand");
  const s = rendu({ variante: "secondaire" });
  assert.ok(porte(s, "border-line") && !porte(s, "bg-brand"), "secondaire = contour, sans fond orange");
  const d = rendu({ variante: "discret" });
  assert.ok(porte(d, "border-transparent") && !porte(d, "bg-brand"), "discret = texte seul");
  const x = rendu({ variante: "danger" });
  assert.ok(porte(x, "text-danger-text"), "danger s'écrit text-danger-text");
  /* QA-A4 : `--color-danger` est un fond à 3:1, jamais une couleur de texte.
     `porte` compare des classes EXACTES — `text-danger` n'est pas vu dans
     `text-danger-text`, et c'est voulu. */
  for (const n of noeuds([p, s, d, x, rendu({ variante: "danger", href: "/x" })])) {
    if (typeof n.props?.className === "string") assert.ok(!porte(n, "text-danger"), "text-danger (fond 3:1) posé en texte");
  }
});

test("BT4 — `chargement` garde la largeur, pose aria-busy, bloque le clic, garde la couleur", () => {
  const n = rendu({ chargement: true });
  assert.equal(n.props["aria-busy"], true, "aria-busy doit être posé");
  assert.equal(n.props.disabled, true, "un double envoi doit être impossible pendant le chargement");
  assert.equal(rendu({ chargement: true, disabled: false }).props.disabled, true, "l'appelant ne peut pas rouvrir le clic en chargement");
  assert.ok(porte(n, "bg-brand"), "en chargement, le bouton travaille : il garde sa couleur");

  // Le libellé reste dans le flux (largeur) ET dans l'arbre d'accessibilité.
  const libelle = noeuds(n.props.children).find((x) => x.props?.children === "Peye");
  assert.ok(libelle, "le libellé doit rester rendu pendant le chargement");
  assert.ok(porte(libelle!, "opacity-0"), "le libellé s'efface en opacité, sans quitter le flux : la largeur tient");
  assert.ok(!porte(libelle!, "invisible") && !porte(libelle!, "hidden"),
    "invisible/hidden retireraient le nom accessible, ou la largeur");
  const cercle = noeuds(n.props.children).find((x) => x.type === "span" && x.props["aria-hidden"] === "true");
  assert.ok(cercle, "l'indicateur de chargement est décoratif (aria-hidden)");

  // Connu-négatif : au repos, ni aria-busy ni libellé effacé.
  const repos = rendu({});
  assert.equal(repos.props["aria-busy"], undefined);
  assert.equal(repos.props.disabled, false);
  assert.ok(!porte(noeuds(repos.props.children).find((x) => x.props?.children === "Peye")!, "opacity-0"));
});

test("BT5 — désactivé : neutre et lisible, jamais un orange délavé", () => {
  const n = rendu({ disabled: true });
  assert.equal(n.props.disabled, true);
  assert.ok(!porte(n, "bg-brand"), "désactivé ne doit plus ressembler au CTA");
  assert.ok(porte(n, "text-mist") && porte(n, "bg-ink-soft"), "désactivé = texte mist sur ink-soft (lisible, ≥ 4,5:1)");
  assert.ok(!classes(n).some((c) => /(^|:)opacity-\d+$/.test(c)), "une opacité réduite ferait passer le texte sous 4,5:1");
});

test("BT6 — mouvement : l'appui anime transform seul, durée par le token", () => {
  const n = rendu({});
  assert.ok(porte(n, "transition-transform"), "seul transform est animé");
  assert.ok(!classes(n).some((c) => /^transition(-colors|-all)?$/.test(c)), "transition (couleurs comprises) interdit par la règle du thème");
  assert.ok(porte(n, "duration-(--motion-fast)"), "la durée de l'appui est --motion-fast (règle du thème)");
  const src = readFileSync("components/bouton.tsx", "utf8");
  assert.doesNotMatch(src, /duration-\d|duration-\[\d/, "une durée chiffrée en dur contournerait les tokens de mouvement");
});

test("BT7 — `--radius-button` est l'ALIAS du cran des boutons, pas une nouvelle valeur", () => {
  const theme = readFileSync("app/zabelie-theme.css", "utf8");
  const defs = [...theme.matchAll(/--radius-button:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.deepEqual(defs, ["var(--radius-xl)"], "--radius-button doit être défini une fois, comme alias de --radius-xl");
  // L'alias pointe sur un cran qui EXISTE dans l'échelle.
  assert.match(theme, /--radius-xl:\s*1\.25rem;/);
  // Et son lecteur ne garde plus de repli chiffré : un repli masquait l'absence du token.
  const edito = readFileSync("app/editorial-marketplace.css", "utf8");
  assert.match(edito, /\.editorial-button \{[^}]*border-radius: var\(--radius-button\);/);
  assert.doesNotMatch(edito, /var\(--radius-button,/, "un repli chiffré masquerait de nouveau un token absent");
});
