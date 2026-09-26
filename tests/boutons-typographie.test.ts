import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * CE QUI RESSEMBLE À UN BOUTON A LA TYPOGRAPHIE D'UN BOUTON — audit du
 * 2026-09-26, UI-01 (`docs/REVUE-2026-09-26-typographie.md`).
 *
 * `app/globals.css` donnait Manrope 700 à l'ÉLÉMENT `button`. Tout lien habillé
 * en bouton y échappait et restait en Inter. Mesuré au moteur de rendu : sur le
 * tableau de bord, « Pataje sou WhatsApp » (un `<a>`) en Inter 600 à côté de
 * « Dekonekte » (un `<button>`) en Manrope 700. Au décompte : 43 liens-boutons,
 * tous en Inter. (L'audit disait 36 : il comptait tout lien à fond, puces de
 * filtre et entrées de menu comprises. La règle des rayons ci-dessous les trie.)
 *
 * La règle vise désormais le RÔLE : `.bouton` partage la déclaration de
 * `button`. Ce fichier garde les deux bouts — la règle, et son application.
 *
 * ── QU'EST-CE QU'UN LIEN « EN FORME DE BOUTON » ──────────────────────────────
 * Pas un jugement au cas par cas : la RÈGLE DES RAYONS déjà écrite dans
 * `app/zabelie-theme.css` — `rounded-xl` = « boutons et champs de formulaire »,
 * `rounded-full` = puces, `rounded-lg` = entrées de menu. Un `<Link>`/`<a>` au
 * rayon des boutons, avec un rembourrage horizontal et un fond plein ou un
 * contour, EST un bouton. Les puces de filtre, les onglets et les menus n'en
 * sont pas, et le motif les écarte sans liste.
 *
 * ── LES CLASSES QUE L'ON NE VOIT PAS EN LISANT LA BALISE ─────────────────────
 * Trois des 43 liens-boutons se cachaient derrière une EXPRESSION : une
 * condition (`app/paiement/echec` — la page d'échec de paiement) et une
 * constante (`app/admin`). Un contrôle qui ne lirait que `className="…"`
 * aurait été vert sur eux. Ce fichier résout donc : les constantes (celle du
 * fichier d'abord ; une constante importée seulement si son nom est unique —
 * un homonyme ne répond jamais à sa place), les chaînes d'une condition, et les
 * fonctions fléchées qui rendent un gabarit. Ce qu'il ne sait pas résoudre doit
 * être NOMMÉ, avec sa raison — et l'exemption se périme dans les deux sens.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE PROUVE PAS : il lit du texte, pas du rendu. Une
 * classe composée à l'exécution d'une façon qu'il ne résout pas lui échappe —
 * c'est précisément pourquoi l'irrésolu échoue au lieu de passer.
 */

const FORME = (c: string) =>
  /(?<![\w:/-])rounded-xl\b/.test(c) &&
  /(?<![\w:/-])px-\d/.test(c) &&
  (/(?<![\w:/-])bg-(brand|accent|chrome|ink|cloud|danger)\b(?!\/)/.test(c) || /(?<![\w:/-])border\b/.test(c));
const PORTE = (c: string) => /(?<![\w-])bouton(?![\w-])/.test(c);

function sources(dir: string, ext = /\.tsx$/): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? sources(p, ext) : ext.test(e) ? [p] : [];
  });
}
const FICHIERS = [...sources("app"), ...sources("components")];

/** `const NOM = "…"` partout (y compris `lib/`) : nom → TOUTES ses définitions. */
const CONSTANTES = new Map<string, string[]>();
for (const f of [...FICHIERS, ...sources("lib", /\.tsx?$/)]) {
  for (const m of readFileSync(f, "utf8").matchAll(/(?:export\s+)?const\s+([A-Za-z_]\w*)\s*=\s*"([^"]*)"/g)) {
    CONSTANTES.set(m[1], [...(CONSTANTES.get(m[1]) ?? []), m[2]]);
  }
}

/**
 * La valeur de `NOM` vue depuis `src` : la définition du fichier même d'abord ; à
 * défaut, celle d'ailleurs (un import), SEULEMENT si le nom n'y est défini qu'une
 * fois. Sinon `null` — irrésolu, donc B3 échoue.
 *
 * Mesuré avant ce garde-fou : une table « le dernier défini gagne » laissait un
 * homonyme répondre à la place de la vraie constante. `const lien` de l'admin
 * privée de `bouton`, plus un `export const lien = "text-sm"` ajouté dans
 * `lib/` : le lien d'admin cessait d'être vu comme un bouton, et B2 restait VERT.
 */
function constante(nom: string, src: string): string | null {
  const locales = [...src.matchAll(new RegExp(`(?:export\\s+)?const\\s+${nom}\\s*=\\s*"([^"]*)"`, "g"))];
  if (locales.length) return locales.length === 1 ? locales[0][1] : null;
  const ailleurs = CONSTANTES.get(nom) ?? [];
  return ailleurs.length === 1 ? ailleurs[0] : null;
}

/** Fonctions fléchées rendant un gabarit, dans CE fichier : `const f = (…) => \`…\``. */
function fonctions(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of src.matchAll(/const\s+([A-Za-z_]\w*)\s*=\s*\([^)]*\)\s*=>\s*`([^`]*)`/g)) out.set(m[1], m[2]);
  return out;
}

/** Les chaînes de classes qu'une expression `className={…}` peut produire, ou `null` si irrésoluble. */
function classesDe(expr: string, src: string): string[] | null {
  const e = expr.trim();
  if (/^[A-Za-z_]\w*$/.test(e)) {
    const v = constante(e, src);
    return v === null ? null : [v];
  }
  const appel = /^([A-Za-z_]\w*)\(/.exec(e);
  if (appel) {
    const gabarit = fonctions(src).get(appel[1]);
    return gabarit === undefined ? null : [gabarit, ...[...gabarit.matchAll(/"([^"]*)"/g)].map((m) => m[1])];
  }
  const litteraux = [...e.matchAll(/"([^"]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2]);
  return litteraux.length ? litteraux : null;
}

/** Les expressions qu'on ne résout pas, NOMMÉES. Se périment dans les deux sens. */
const IRRESOLUS: Record<string, string> = {
  "components/metric-a.tsx":
    "`className={className}` transmis par ses appelants — vérifiés un par un dans B4, pas crus sur parole",
};

type Lien = { ou: string; classes: string[] | null; expr: boolean };

function liens(): Lien[] {
  const out: Lien[] = [];
  for (const f of FICHIERS) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/<(Link|a)\b((?:[^>]|=>)*?)>/gs)) {
      const attrs = m[2];
      const ou = `${f}:${src.slice(0, m.index ?? 0).split("\n").length}`;
      const lit = /className=(?:"([^"]*)"|\{`([^`]*)`\})/s.exec(attrs);
      if (lit) {
        out.push({ ou, classes: [lit[1] ?? lit[2]], expr: false });
        continue;
      }
      const e = /className=\{/.exec(attrs);
      if (!e) continue;
      // L'expression court jusqu'à l'accolade fermante ÉQUILIBRÉE.
      const debut = e.index + e[0].length;
      let prof = 1, j = debut;
      while (j < attrs.length && prof > 0) {
        if (attrs[j] === "{") prof++;
        else if (attrs[j] === "}") prof--;
        j++;
      }
      out.push({ ou, classes: classesDe(attrs.slice(debut, j - 1), src), expr: true });
    }
  }
  return out;
}

test("B1 — `.bouton` partage LA déclaration de `button` (famille de titre)", () => {
  const css = readFileSync("app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const regle = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, sel]) => {
    const s = sel.split(",").map((x) => x.trim());
    return s.includes("button") && s.includes(".bouton");
  });
  assert.ok(regle, "`button` et `.bouton` doivent figurer dans le MÊME sélecteur : deux règles séparées finiraient par diverger");
  assert.match(regle![2], /font-family:\s*var\(--font-heading\)/, "la règle commune ne donne plus la famille des titres (Manrope)");
});

test("B2 — chaque lien en forme de bouton porte `.bouton`", () => {
  const tous = liens();
  const boutons = tous.filter((l) => l.classes?.some(FORME));
  // Témoin : un motif qui ne voit plus rien réussit toujours.
  assert.ok(boutons.length >= 43, `seulement ${boutons.length} liens-boutons vus (43 attendus au 2026-09-26) — le motif est devenu aveugle`);
  assert.ok(boutons.filter((l) => l.expr).length >= 3, "les liens-boutons cachés derrière une expression ne sont plus vus");

  const fautes = boutons.flatMap((l) =>
    l.classes!.filter((c) => FORME(c) && !PORTE(c)).map((c) => `${l.ou}  « ${c.replace(/\s+/g, " ").slice(0, 70)}… »`)
  );
  assert.deepEqual(
    fautes,
    [],
    "Lien(s) habillé(s) en bouton SANS `.bouton` — ils resteront en Inter à côté de boutons en Manrope :\n  " +
      fautes.join("\n  ") +
      "\n\nAjoutez `bouton` à la classe. Si ce n'est PAS un bouton, c'est son rayon qui ment : " +
      "`rounded-full` pour une puce, `rounded-lg` pour une entrée de menu (règle des rayons, zabelie-theme.css)."
  );
});

test("B3 — aucune classe de lien n'est irrésolue sans être nommée", () => {
  const irresolus = liens().filter((l) => l.classes === null);
  const nonNommes = irresolus.filter((l) => !(l.ou.split(":")[0] in IRRESOLUS)).map((l) => l.ou);
  assert.deepEqual(
    nonNommes,
    [],
    "Lien(s) dont la classe est une expression que ce test ne sait pas lire :\n  " +
      nonNommes.join("\n  ") +
      "\nÉcrivez-la en littéral ou en constante, ou nommez l'exception dans IRRESOLUS avec sa raison."
  );
  const perimes = Object.keys(IRRESOLUS).filter((f) => !irresolus.some((l) => l.ou.startsWith(`${f}:`)));
  assert.deepEqual(perimes, [], `Exception(s) périmée(s) dans IRRESOLUS : ${perimes.join(", ")}`);
});

test("B4 — les appelants de `MetricA` (classe transmise) sont vérifiés eux aussi", () => {
  /* `MetricA` rend un `<a>` avec la classe que lui passe son appelant : un
     bouton WhatsApp à fond orange qui passerait par lui échapperait à B2. */
  let vus = 0;
  const fautes: string[] = [];
  for (const f of FICHIERS) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/<MetricA\b((?:[^>]|=>)*?)>/gs)) {
      vus++;
      const lit = /className=(?:"([^"]*)"|\{([A-Za-z_]\w*)\})/.exec(m[1]);
      const c = lit ? (lit[1] ?? constante(lit[2]!, src)) : "";
      if (c === null) fautes.push(`${f} — classe de MetricA irrésoluble`);
      else if (FORME(c) && !PORTE(c)) fautes.push(`${f} — MetricA en forme de bouton sans \`bouton\``);
    }
  }
  assert.ok(vus >= 3, `seulement ${vus} appel(s) de MetricA vu(s)`);
  assert.deepEqual(fautes, [], fautes.join("\n"));
});

test("B5 — les boutons de partage ont le gabarit de leur voisin, le bouton favoris / suivre (UI-05)", () => {
  /* Sur la fiche produit et la page boutique, `ShareButtons` est rendu à côté de
     `CollectionToggle` — sur la MÊME rangée côté boutique. Mesuré avant : 12 px /
     500 / rayon 8 px, contre 14 px / 600 / rayon 20 px. Le gabarit se compare sur
     ce qui COMMANDE le rendu : taille, graisse, rayon, rembourrage horizontal,
     hauteur minimale — pas sur la couleur, qui distingue légitimement les deux. */
  const GABARIT =
    /(?<![\w:/-])(text-(?:xs|sm|base|lg|\[[^\]]+\])|font-(?:thin|light|normal|medium|semibold|bold|extrabold|black)|rounded(?:-\w+)?|px-[\w.]+|min-h-[\w.]+)(?![\w/-])/g;
  const gabarits = (f: string) =>
    [...readFileSync(f, "utf8").matchAll(/<button\b(?:[^>]|=>)*?className="([^"]*)"/g)].map((m) =>
      [...m[1].matchAll(GABARIT)].map((x) => x[1]).sort().join(" ")
    );
  const partage = gabarits("components/share-buttons.tsx");
  const voisin = gabarits("components/collection-toggle.tsx");
  assert.equal(partage.length, 2, "ShareButtons doit rendre ses deux boutons avec une classe littérale");
  assert.equal(voisin.length, 1, "CollectionToggle doit rendre son bouton avec une classe littérale");
  for (const g of partage) {
    assert.equal(g, voisin[0], `bouton de partage « ${g} » ≠ bouton voisin « ${voisin[0]} » — deux gabarits côte à côte`);
  }
});
