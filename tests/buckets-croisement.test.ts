import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * CROISEMENT BUCKETS — le code qui adresse, les migrations qui créent.
 *
 * Un nom de bucket est adressé par CHAÎNE : `tsc` ne verra jamais une
 * divergence, et l'échec est muet du côté vendeur, qui n'est pas instrumenté
 * (`CLAUDE.md`, mesure du 2026-08-11). Seul un croisement entre deux endroits
 * du dépôt le rend visible — c'est la règle « tout artefact dont l'appelant vit
 * ailleurs se croise mécaniquement ».
 *
 * Mesuré le 2026-09-21, avant ce test : trois buckets, SEPT sites de
 * déclaration. `DIGITAL_BUCKET` exporté sans aucun importeur, quatre fichiers
 * recodant `"product-files"`, et un littéral brut dans
 * `app/api/admin/digital-preview`. Aucun décalage à cette date — mais rien
 * n'empêchait le prochain.
 *
 * Les trois assertions portent sur ce qui COMMANDE, et les deux premières
 * valent dans LES DEUX SENS : une liste qui ne sait que grandir devient une
 * conformité par usure.
 */

const RACINES = ["app", "lib", "components"];
const SOURCE_UNIQUE = "lib/storage-buckets.ts";

function fichiersSource(racine: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) fichiersSource(chemin, acc);
    else if (/\.tsx?$/.test(chemin)) acc.push(chemin);
  }
  return acc;
}

/** Noms déclarés dans la source unique. */
function nomsDeclares(): string[] {
  const src = readFileSync(SOURCE_UNIQUE, "utf8");
  // `matchAll`, jamais `.test()` répété : un regex `g` porte un `lastIndex`.
  return [...src.matchAll(/export const \w+ = "([^"]+)"/g)].map((m) => m[1]).sort();
}

/** Buckets réellement créés par une migration. */
function nomsCrees(): string[] {
  const dossier = "supabase/migrations";
  const trouves = new Set<string>();
  for (const fichier of readdirSync(dossier)) {
    const sql = readFileSync(join(dossier, fichier), "utf8");
    for (const m of sql.matchAll(/insert\s+into\s+storage\.buckets[\s\S]{0,200}?values\s*\(\s*'([^']+)'/gi)) {
      trouves.add(m[1]);
    }
  }
  return [...trouves].sort();
}

/** Tout site `storage.from(<argument>)` du code applicatif. */
function sitesAdressage(): { fichier: string; argument: string }[] {
  const sites: { fichier: string; argument: string }[] = [];
  for (const racine of RACINES) {
    for (const fichier of fichiersSource(racine)) {
      if (fichier.replace(/\\/g, "/") === SOURCE_UNIQUE) continue;
      const src = readFileSync(fichier, "utf8");
      for (const m of src.matchAll(/storage\s*\.\s*from\(\s*([^)]*?)\s*\)/g)) {
        sites.push({ fichier, argument: m[1] });
      }
    }
  }
  return sites;
}

test("buckets : la source unique est éprouvée par l’instrument lui-même", () => {
  // Cas connu-positif de l'extracteur : s'il rendait [], tout le reste passerait
  // vert en ne vérifiant rien — c'est le « filet sur un chemin impraticable ».
  const declares = nomsDeclares();
  assert.ok(declares.length >= 3, `la source unique doit déclarer des buckets, vu : ${JSON.stringify(declares)}`);
  const sites = sitesAdressage();
  assert.ok(sites.length >= 5, `l’extracteur doit voir les sites d’adressage, vu : ${sites.length}`);
  assert.ok(nomsCrees().length >= 3, "l’extracteur de migrations doit voir les buckets créés");
});

test("buckets : chaque nom déclaré est créé par une migration, et réciproquement", () => {
  // Dans les deux sens. Un bucket adressé sans migration = téléversement qui
  // échoue en silence. Un bucket créé sans être adressé = stockage mort dont
  // personne ne saura qu'il porte des objets.
  assert.deepEqual(nomsDeclares(), nomsCrees());
});

test("buckets : aucun site n’adresse un bucket par littéral", () => {
  // C'est l'assertion qui COMMANDE : seul le passage par une constante rend un
  // renommage sûr. Un littéral survit à tout renommage, compilation propre.
  const litteraux = sitesAdressage().filter((s) => /^["'`]/.test(s.argument));
  assert.deepEqual(
    litteraux,
    [],
    `bucket adressé par littéral — importer depuis ${SOURCE_UNIQUE} :\n` +
      litteraux.map((s) => `  ${s.fichier} → ${s.argument}`).join("\n")
  );
});

test("buckets : aucune redéclaration hors de la source unique", () => {
  // Sept sites de déclaration pour trois noms, c'est l'état mesuré avant ce
  // test. Une seconde déclaration ne casse rien le jour où elle est écrite :
  // elle casse le renommage, des mois plus tard.
  const noms = nomsDeclares();
  const fautes: string[] = [];
  for (const racine of RACINES) {
    for (const fichier of fichiersSource(racine)) {
      if (fichier.replace(/\\/g, "/") === SOURCE_UNIQUE) continue;
      const src = readFileSync(fichier, "utf8");
      for (const nom of noms) {
        if (src.includes(`"${nom}"`) || src.includes(`'${nom}'`)) fautes.push(`${fichier} → ${nom}`);
      }
    }
  }
  assert.deepEqual(fautes, [], `nom de bucket en dur hors de la source unique :\n  ${fautes.join("\n  ")}`);
});
