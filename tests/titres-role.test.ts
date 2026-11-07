import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * UN STYLE DE `h1`, UN STYLE DE `h2` — chantier design, Phase 1 (V-25).
 *
 * Mesuré à l'audit (`docs/design/AUDIT-0.md`) : sept styles de `h1`, de 24 / 600
 * à 36 / 800, et des `h2` de 14 à 24 px. Aucun n'était faux isolément : chaque
 * composant avait choisi sa taille, et un cumul ne se voit dans aucun fichier.
 *
 * Désormais la taille et la graisse vivent dans `app/globals.css`. Une classe
 * posée à côté de la balise l'emporterait sans que personne le voie : ce test la
 * refuse. Un `h2` d'encadré compact porte `titre-bloc`, seule variante nommée.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE PROUVE PAS : il lit des `className` littéraux, pas du
 * rendu. Une feuille de style qui viserait `h1` lui échapperait : c'est pourquoi
 * T3 lit aussi les feuilles.
 */

/**
 * Fichiers qui gardent leurs classes, chacun avec sa raison. Une exception se
 * périme dans les DEUX sens : T2 échoue aussi quand plus rien ne la justifie.
 */
const EXCEPTIONS: Record<string, string> = {
  "app/paiement/echec/page.tsx": "chemin de l'argent, hors chantier (brief §1.8)",
  "app/paiement/en-attente/page.tsx": "chemin de l'argent, hors chantier (brief §1.8)",
  "app/paiement/succes/page.tsx": "chemin de l'argent, hors chantier (brief §1.8)",
  "app/paiement/zelle/[orderId]/page.tsx": "chemin de l'argent, hors chantier (brief §1.8)",
  "app/rechaj/page.tsx": "chemin de l'argent, hors chantier (brief §1.8)",
  "app/rechaj/[orderId]/page.tsx": "chemin de l'argent, hors chantier (brief §1.8)",
  "app/facture/[token]/page.tsx": "chemin de l'argent, hors chantier (brief §1.8)",
  "components/business/invoice-editor.tsx": "chemin de l'argent, hors chantier (brief §1.8)",
  "components/payout-queue.tsx": "versements, hors chantier (brief §1.8)",
  "components/cart-pay-all.tsx": "paiement du panier, hors chantier (brief §1.8)",
  "app/tableau-de-bord/boutique/affiche/page.tsx": "affiche IMPRIMÉE : elle suit sa propre échelle (V-25 A9)",
};

const STYLE_LOCAL =
  /(?<![\w-])(?:(?:sm|md|lg|xl):)?(?:text-(?:xs|sm|base|lg|xl|[2-9]xl)|font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)|tracking-[a-z]+|leading-[a-z]+)(?![\w-])/;

function tsx(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) tsx(p, acc);
    else if (e.endsWith(".tsx")) acc.push(p.replaceAll("\\", "/"));
  }
  return acc;
}

function fautesDe(src: string): string[] {
  const fautes: string[] = [];
  for (const m of src.matchAll(/<h([12])\b([^>]*)>/g)) {
    const classes = /className="([^"]*)"/.exec(m[2])?.[1] ?? "";
    const trouve = STYLE_LOCAL.exec(classes);
    if (trouve) fautes.push(`h${m[1]} « ${trouve[0]} »`);
  }
  return fautes;
}

const SOURCES = [...tsx("app"), ...tsx("components")];

test("T0 — le détecteur discrimine", () => {
  assert.deepEqual(fautesDe('<h1 className="mt-6 text-2xl">x</h1>'), ["h1 « text-2xl »"]);
  assert.deepEqual(fautesDe('<h2 id="y" className="sm:text-3xl mt-2">x</h2>'), ["h2 « sm:text-3xl »"]);
  assert.deepEqual(fautesDe('<h1 className="font-extrabold">x</h1>'), ["h1 « font-extrabold »"]);
  assert.deepEqual(fautesDe('<h2 className="text-cloud titre-bloc">x</h2>'), [], "une couleur n'est pas un style de titre");
  assert.deepEqual(fautesDe('<h2 className="text-balance">x</h2>'), []);
  assert.deepEqual(fautesDe('<h3 className="text-lg">x</h3>'), [], "`h3` n'est pas concerné");
});

test("T1 — aucun `h1` ni `h2` ne reprend une taille ou une graisse locale", () => {
  assert.ok(SOURCES.length > 200, `${SOURCES.length} fichiers lus : la mesure suppose le vrai dépôt`);
  const titres = SOURCES.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/<h[12]\b/g)]).length;
  assert.ok(titres > 150, `seulement ${titres} titres lus : le motif ne voit plus les balises`);
  const fautes = SOURCES.filter((f) => !(f in EXCEPTIONS)).flatMap((f) =>
    fautesDe(readFileSync(f, "utf8")).map((x) => `${f} : ${x}`)
  );
  assert.deepEqual(fautes, [], "Titre avec un style local. La taille vit dans app/globals.css :\n  " + fautes.join("\n  "));
});

test("T2 — les exceptions se périment : chacune existe et porte encore un style local", () => {
  const perimees = Object.keys(EXCEPTIONS).filter((f) => {
    if (!SOURCES.includes(f)) return true;
    return fautesDe(readFileSync(f, "utf8")).length === 0;
  });
  assert.deepEqual(perimees, [], "Exception devenue inutile : à retirer de la liste");
});

test("T3 — la taille du `h1` et du `h2` vient du thème, et aucune feuille ne la reprend", () => {
  const G = readFileSync("app/globals.css", "utf8");
  assert.match(G, /\bh1 \{\s*font-size: var\(--text-3xl\);\s*font-weight: 800;\s*letter-spacing: var\(--tracking-titre\);/);
  assert.match(G, /\bh2 \{\s*font-size: var\(--text-2xl\);/);
  for (const f of ["app/editorial-marketplace.css", "app/home-discovery.css", "app/home-vivant.css"]) {
    const css = readFileSync(f, "utf8");
    for (const m of css.matchAll(/([^{}]*\bh[12]\b[^{}]*)\{([^}]*)\}/g)) {
      assert.doesNotMatch(m[2], /font-size|letter-spacing/, `${f} : « ${m[1].trim()} » reprend le style d'un titre`);
    }
  }
});

test("T4 — le titre et le sous-titre du hero n'ont qu'UNE déclaration de taille", () => {
  const feuilles = ["app/editorial-marketplace.css", "app/home-discovery.css", "app/home-vivant.css"];
  const compte = (selecteur: RegExp) =>
    feuilles.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/([^{}]+)\{([^}]*)\}/g)]
        .filter((m) => selecteur.test(m[1]) && /font-size/.test(m[2]))
        .map((m) => `${f} : ${m[2].trim().slice(0, 50)}`)
    );
  const titre = compte(/\.home-headline/);
  assert.equal(titre.length, 1, `titre du hero déclaré ${titre.length} fois : ${titre.join(" | ")}`);
  assert.match(titre[0], /font-size: var\(--text-display\)/);
  const sous = compte(/\.home-hero-copy > p:not\(\.home-kicker\)/);
  assert.equal(sous.length, 1, `sous-titre du hero déclaré ${sous.length} fois : ${sous.join(" | ")}`);
  assert.match(sous[0], /font-size: var\(--text-base\)/, "le sous-titre du hero est du corps : 16 px (A6)");
});

test("T5 — `.titre-bloc` existe et tient la graisse", () => {
  const bloc = /\.titre-bloc\s*\{([^}]*)\}/.exec(readFileSync("app/globals.css", "utf8"))?.[1] ?? "";
  assert.match(bloc, /font-size: var\(--text-base\)/);
  assert.match(bloc, /font-weight: 700/);
});
