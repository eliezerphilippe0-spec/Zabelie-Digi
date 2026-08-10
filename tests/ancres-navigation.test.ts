import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Toute ancre de navigation vise une cible qui EXISTE TOUJOURS.
 *
 * LA CLASSE DE DÉFAUT
 * -------------------
 * `id="talents"` était posé sur la première `HomeRow` (`app/page.tsx:336`).
 * `HomeRow` s'efface quand elle n'a rien à montrer — c'est V-13, et c'est
 * voulu. Mais l'ancre partait avec le composant : à catalogue vide, les trois
 * liens « Talents » de la barre de navigation et du pied de page pointaient
 * vers un `id` absent du DOM. Cliquer ne faisait rien.
 *
 * Le cas est instructif parce qu'il n'y a AUCUN conflit entre les deux règles.
 * V-13 fonctionne, la navigation fonctionne ; c'est la dépendance entre les
 * deux qui n'était déclarée nulle part. Une ancre accrochée à un élément
 * conditionnel hérite de sa condition sans que personne ne l'ait décidé.
 *
 * LA RÈGLE VÉRIFIÉE ICI
 * ---------------------
 * Une ancre vit sur un élément DOM écrit en clair — `<section id="x">`,
 * `<div id="x">` — jamais passée en PROP à un composant. Un composant peut
 * décider de ne pas se rendre ; une balise écrite dans le flux de la page,
 * non. La règle ne dit pas « ne pas conditionner les sections » : elle dit
 * « ne pas suspendre un point d'arrivée à une condition d'affichage ».
 *
 * Ce test ferme la CLASSE, pas le cas : tout futur `href="/#x"` posé sur une
 * `HomeRow` ou sur n'importe quel composant tombera dessus.
 *
 * VÉRIFIÉ SUR CAS CONNU-NÉGATIF : écrit AVANT le correctif, il échouait sur
 * `talents` en désignant la bonne cause. Le correctif l'a fait passer.
 */

const ROOTS = ["app", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const FICHIERS = ROOTS.flatMap((r) => walk(r));
const TOUT = FICHIERS.map((f) => readFileSync(f, "utf8")).join("\n");

/** Ancres réellement visées par un lien, dédupliquées. */
function ancresVisees(): string[] {
  return [...new Set([...TOUT.matchAll(/href="\/#([a-zA-Z0-9_-]+)"/g)].map((m) => m[1]))];
}

test("chaque ancre visée existe sur un élément DOM non conditionnel", () => {
  const ancres = ancresVisees();
  assert.ok(ancres.length > 0, "Aucune ancre trouvée — le balayage est cassé.");

  for (const ancre of ancres) {
    // Sur une balise DOM écrite en clair : la balise et l'id sur le même
    // fragment. Un `id="x"` seul sur sa ligne est une PROP de composant —
    // exactement le cas qu'on interdit.
    const surBalise = new RegExp(
      `<(?:section|div|main|nav|article|aside|header|footer)\\s+id="${ancre}"`
    );
    assert.match(
      TOUT,
      surBalise,
      `L'ancre "#${ancre}" est visée par un lien mais n'est posée sur aucune ` +
        `balise DOM écrite en clair. Si elle est passée en prop à un ` +
        `composant (ex. <HomeRow id="${ancre}">), elle disparaît avec lui : ` +
        `le composant peut choisir de ne rien rendre, et le lien ne mène ` +
        `alors nulle part. Poser l'ancre sur une <section> ou un <div> du ` +
        `flux de la page.`
    );
  }
});

test("aucune ancre visée n'est passée en prop à un composant", () => {
  for (const ancre of ancresVisees()) {
    // `id="x"` seul sur sa ligne, indenté : la forme d'une prop JSX.
    const commeProp = new RegExp(`^\\s+id="${ancre}"\\s*$`, "m");
    assert.doesNotMatch(
      TOUT,
      commeProp,
      `L'ancre "#${ancre}" est passée en PROP à un composant. Même si une ` +
        `balise porte aussi cet id ailleurs, deux éléments partageant un id ` +
        `rendent la cible du lien indéterminée. Une seule ancre, sur une ` +
        `balise du flux.`
    );
  }
});

/**
 * L'ANCRE « TALENTS » PRÉCÈDE LA SECTION QU'ELLE DÉSIGNE — la position, pas
 * seulement l'existence.
 *
 * Revue 2026-08-10 (UX-04) : l'ancre existait, le test ci-dessus était VERT,
 * et les trois liens « Talents » déposaient le visiteur sur « Fichiers
 * digitaux » — l'ancre était posée un cran trop haut. Un test qui vérifie
 * l'existence valide aussi bien la bonne position que la mauvaise.
 *
 * La règle : `id="talents"` vit APRÈS le titre de la rangée des fichiers
 * (`sec.digital`) et AVANT celui des services (`sec.services`). Si l'une des
 * deux rangées bouge, ce test dit où l'ancre doit suivre.
 */
test("l'ancre #talents est posée entre les fichiers digitaux et les services", () => {
  const src = readFileSync("app/page.tsx", "utf8");
  const iAncre = src.indexOf('id="talents"');
  const iDigital = src.indexOf('"sec.digital"');
  const iServices = src.indexOf('"sec.services"');
  assert.ok(iAncre > -1 && iDigital > -1 && iServices > -1, "repère absent — l'extraction a bougé");
  assert.ok(
    iDigital < iAncre && iAncre < iServices,
    `l'ancre #talents n'est pas entre les fichiers (${iDigital}) et les services (${iServices}) : ${iAncre}`
  );
});
