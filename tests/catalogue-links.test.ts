import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Contrat de lien vers le catalogue.
 *
 * `/catalogue` lit un seul nom de paramètre pour la catégorie. Un lien qui en
 * utilise un autre ne casse RIEN de visible : la page répond 200 et affiche le
 * catalogue entier. C'est le pire des échecs — l'acheteur croit avoir filtré.
 * La barre de catégories de l'accueil pointait sur `?categorie=`, jamais lu.
 *
 * Ce test fige le contrat : tout lien `/catalogue?...` qui prétend filtrer une
 * catégorie doit employer le paramètre que la page lit réellement.
 */

const CATALOGUE_PAGE = "app/catalogue/page.tsx";
const ROOTS = ["app", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** Nom du paramètre catégorie tel que /catalogue le déstructure. */
function readParamName(): string {
  const src = readFileSync(CATALOGUE_PAGE, "utf8");
  const m = src.match(/searchParams:\s*Promise<\{([^}]*)\}>/s);
  assert.ok(m, "signature searchParams introuvable dans " + CATALOGUE_PAGE);
  const keys = [...m[1].matchAll(/(\w+)\??\s*:/g)].map((k) => k[1]);
  const cat = keys.find((k) => k === "cat" || k === "categorie" || k === "category");
  assert.ok(cat, `aucun paramètre de catégorie dans ${CATALOGUE_PAGE} (vu : ${keys.join(", ")})`);
  return cat;
}

test("tout lien /catalogue filtrant emploie le paramètre que la page lit", () => {
  const param = readParamName();
  const offenders: string[] = [];

  for (const f of ROOTS.flatMap((r) => walk(r))) {
    if (f === CATALOGUE_PAGE) continue;
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((line, i) => {
        // Un lien /catalogue?xxx= où xxx n'est ni le bon paramètre ni la
        // recherche/pagination : filtre silencieusement ignoré.
        for (const m of line.matchAll(/\/catalogue\?(\w+)=/g)) {
          const used = m[1];
          if (used !== param && used !== "q" && used !== "page") {
            offenders.push(`${f}:${i + 1} → ?${used}= (attendu ?${param}=)`);
          }
        }
      });
  }

  assert.deepEqual(
    offenders,
    [],
    `liens catalogue au mauvais paramètre — le filtre serait ignoré en silence :\n${offenders.join("\n")}`
  );
});
