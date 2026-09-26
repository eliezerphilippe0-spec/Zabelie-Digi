import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * AUCUN TEXTE SOUS 12 PX — audit typographique du 2026-09-26, UI-06
 * (`docs/REVUE-2026-09-26-typographie.md`).
 *
 * `text-xs` (12 px) est le plus petit cran de l'échelle Tailwind, et le plancher
 * de ce dépôt : la cible est un Android d'entrée de gamme, souvent en plein
 * soleil. Mesuré avant ce contrôle : 24 textes rendus sous 12 px sur l'accueil
 * seul (jeu d'essai), dont un titre en 8 px et un libellé en 9 px — et des
 * valeurs arbitraires (`text-[10px]`, `text-[11px]`) semées dans dix fichiers.
 *
 * Deux sources de taille sont lues : les valeurs arbitraires Tailwind des
 * `.tsx` (`text-[11px]`, `sm:text-[0.7rem]`…) et les `font-size` des feuilles
 * de style de `app/`. Une exception se NOMME, avec sa raison, et se périme dans
 * les deux sens : relevée à 12 px ou disparue, elle doit sortir de la liste.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE VOIT PAS : le texte SVG (`fontSize=` d'une carte), en
 * unités du `viewBox` et non en px CSS ; et une taille relative (`em`, `%`)
 * dont le résultat dépend du parent. Il n'en existe aucune au 2026-09-26 — le
 * test T4 échoue si une taille relative apparaît, pour qu'on la regarde.
 */

const PLANCHER = 12;

type Taille = { ou: string; px: number; brut: string; contexte: string };

/** Les valeurs arbitraires Tailwind d'une source `.tsx` : `text-[11px]`, `md:text-[0.625rem]`. */
function taillesTailwind(src: string, fichier: string): Taille[] {
  const out: Taille[] = [];
  for (const m of src.matchAll(/(?<![\w-])(?:[\w-]+:)*text-\[(\d*\.?\d+)(px|rem)\]/g)) {
    const px = m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
    const ligne = src.slice(0, m.index ?? 0).split("\n").length;
    const debut = src.lastIndexOf("\n", m.index ?? 0) + 1;
    out.push({ ou: `${fichier}:${ligne}`, px, brut: m[0], contexte: src.slice(debut, src.indexOf("\n", m.index ?? 0)) });
  }
  return out;
}

/** Les `font-size` d'une feuille de style, par sélecteur (commentaires retirés, un niveau de `@media`). */
function taillesCss(css: string, fichier: string): Taille[] {
  const propre = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const out: Taille[] = [];
  for (const r of propre.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selecteur = r[1].trim().replace(/\s+/g, " ");
    for (const d of r[2].matchAll(/font-size:\s*(\d*\.?\d+)(px|rem)\b/g)) {
      const px = d[2] === "rem" ? Number(d[1]) * 16 : Number(d[1]);
      const ligne = propre.slice(0, (r.index ?? 0) + r[1].length + 1 + (d.index ?? 0)).split("\n").length;
      out.push({ ou: `${fichier}:${ligne}`, px, brut: d[0], contexte: selecteur });
    }
  }
  return out;
}

function sources(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? sources(p, ext) : ext.test(e) ? [p] : [];
  });
}

const TSX = [...sources("app", /\.tsx$/), ...sources("components", /\.tsx$/)];
const CSS = sources("app", /\.css$/);

function toutes(): Taille[] {
  return [
    ...TSX.flatMap((f) => taillesTailwind(readFileSync(f, "utf8"), f)),
    ...CSS.flatMap((f) => taillesCss(readFileSync(f, "utf8"), f)),
  ];
}

/**
 * Les exceptions NOMMÉES : fichier, ce qui désigne l'élément (un fragment de sa
 * classe, ou son sélecteur exact), la taille tolérée, et pourquoi.
 */
const EXCEPTIONS: { fichier: string; element: string; px: number; raison: string }[] = [
  {
    fichier: "components/site-nav.tsx",
    element: "grid h-5 min-w-5 place-items-center rounded-full bg-brand",
    px: 11,
    raison: "compteur du panier : un chiffre dans une pastille de 20 px, pas du texte à lire (UI-06 l'avait nommé ainsi)",
  },
  ...[
    [".home-kicker, .home-eyebrow", 11],
    [".home-featured .home-eyebrow", 10],
    [".home-photo-empty", 11],
    [".home-featured-seller", 11],
    [".home-featured .home-eyebrow", 8],
    [".home-featured .home-photo-empty > span", 9],
  ].map(([element, px]) => ({
    fichier: "app/home-discovery.css",
    element: element as string,
    px: px as number,
    raison: "accueil : tailles posées par le porteur le 2026-09-05 — relevées à 12 px dans un commit d'ARBITRAGE séparé",
  })),
];

/** Une exception désigne une taille : même fichier, même valeur, et en CSS le MÊME sélecteur
    (exact — `.home-photo-empty` ne doit pas couvrir `.home-photo-empty-bis`) ; en TSX, un
    fragment de la ligne qui porte la classe. */
const designe = (e: (typeof EXCEPTIONS)[number], t: Taille) =>
  t.ou.startsWith(`${e.fichier}:`) && t.px === e.px &&
  (e.fichier.endsWith(".css") ? t.contexte === e.element : t.contexte.includes(e.element));
const couverte = (t: Taille) => EXCEPTIONS.some((e) => designe(e, t));

test("T1 — l'instrument voit ce qu'il doit voir (cas connus, positifs et négatifs)", () => {
  // Positifs : chaque forme doit être LUE, avec la bonne valeur.
  const tw = taillesTailwind('<p className="a text-[11px] sm:text-[0.625rem] md:hover:text-[9.5px] b">', "x.tsx");
  assert.deepEqual(tw.map((t) => t.px), [11, 10, 9.5], "valeurs arbitraires Tailwind mal lues");
  const css = taillesCss("/* font-size: 3px */\n.a { color: red; font-size: 11px; }\n@media (max-width: 767px) {\n  .b .c { font-size: .5rem; }\n}", "x.css");
  assert.deepEqual(css.map((t) => [t.contexte, t.px]), [[".a", 11], [".b .c", 8]], "font-size CSS mal lus (commentaire compris, ou @media manqué)");
  assert.equal(css[1].ou, "x.css:4", "numéro de ligne CSS faux");
  // Négatifs : ce qui n'est PAS une taille de texte ne doit pas être lu.
  assert.deepEqual(taillesTailwind('<p className="text-xs text-sm max-w-[11px] text-[#111] text-[var(--x)]">', "x.tsx"), []);
});

test("T2 — aucun texte sous 12 px hors exception nommée", () => {
  const vues = toutes();
  // Témoin : un scanner devenu aveugle ne trouverait plus rien, et passerait.
  assert.ok(vues.length >= 40, `seulement ${vues.length} tailles lues (46 au 2026-09-26) — l'instrument est devenu aveugle`);
  const fautes = vues.filter((t) => t.px < PLANCHER && !couverte(t)).map((t) => `${t.ou}  ${t.brut}  (${t.contexte.trim().slice(0, 70)})`);
  assert.deepEqual(
    fautes,
    [],
    `Texte sous ${PLANCHER} px :\n  ${fautes.join("\n  ")}\n\n` +
      "`text-xs` (12 px) est le plancher du dépôt. Une vraie exception se NOMME dans EXCEPTIONS, avec sa raison."
  );
});

test("T3 — chaque exception désigne encore une taille réelle sous 12 px (sinon elle est périmée)", () => {
  const vues = toutes();
  const perimees = EXCEPTIONS.filter((e) => e.px >= PLANCHER || !vues.some((t) => designe(e, t)))
    .map((e) => `${e.fichier} — ${e.element} (${e.px} px)`);
  assert.deepEqual(perimees, [], `Exception(s) périmée(s) — retirez-les de EXCEPTIONS :\n  ${perimees.join("\n  ")}`);
});

test("T4 — aucune taille de texte relative (em, %) que ce contrôle ne saurait juger", () => {
  const relatives = [
    ...TSX.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/(?<![\w-])(?:[\w-]+:)*text-\[\d*\.?\d+(em|%)\]/g)].map(() => f)),
    ...CSS.flatMap((f) => [...readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/font-size:\s*\d*\.?\d+(em|%)/g)].map(() => f)),
  ];
  assert.deepEqual(relatives, [], "taille relative : son rendu dépend du parent — convertissez-la, ou étendez ce contrôle");
});
