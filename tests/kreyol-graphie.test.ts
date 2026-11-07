import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * UNE SEULE GRAPHIE KREYÒL POUR « PRODUIT » : « pwodwi ».
 *
 * Tranché par le porteur le 2026-11-07 (« Pwodwi », V-29). Avant, les deux
 * graphies coexistaient, parfois sur le même écran : 71 « pwodui » et 58
 * « pwodwi » dans `lib/i18n.ts`, une centaine de plus dans les textes du
 * studio, de l'API et des offres (relevé de l'audit design, AUDIT-0 §251).
 *
 * Périmètre : `app/`, `components/`, `lib/`, c'est-à-dire tout ce qui peut
 * finir à l'écran ou dans une réponse. Hors périmètre, et voulu : `docs/`
 * (des relevés datés, qu'on ne réécrit pas), les jeux d'essai de `tests/` et
 * de `supabase/tests/` (données fictives, jamais affichées).
 *
 * Le motif est une sous-chaîne, sans `\b` : il n'y a pas de frontière à
 * placer, et `\b` tombe du mauvais côté des lettres accentuées (CLAUDE.md).
 */

const RACINE = process.cwd();
const DOSSIERS = ["app", "components", "lib"];
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|md)$/;

/** Le détecteur, éprouvé par G1. Pas de drapeau `g` : c'est un prédicat. */
const ANCIENNE_GRAPHIE = /pwodui/i;

/**
 * Les textes juridiques gardent leur graphie : l'utilisateur a accepté une
 * version précise, et la changer, même d'une lettre, demande une nouvelle
 * version et une nouvelle acceptation. À reprendre à leur prochaine version.
 * Une exemption qui ne sert plus fait échouer le test (péremption dans les
 * deux sens).
 */
const EXEMPTIONS: Record<string, string> = {
  "lib/policy-terms.ts":
    "conditions d'utilisation versionnées : la graphie suit la prochaine version",
  "lib/policy-privacy.ts":
    "politique de confidentialité versionnée : la graphie suit la prochaine version",
};

function fichiers(dossier: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(dossier)) {
    if (nom === "node_modules" || nom.startsWith(".")) continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiers(chemin));
    else if (EXTENSIONS.test(nom)) sortie.push(chemin);
  }
  return sortie;
}

const relatif = (chemin: string) => relative(RACINE, chemin).split(sep).join("/");

function fautifs(): Map<string, number> {
  const trouves = new Map<string, number>();
  for (const dossier of DOSSIERS) {
    for (const chemin of fichiers(join(RACINE, dossier))) {
      const texte = readFileSync(chemin, "utf8");
      if (!ANCIENNE_GRAPHIE.test(texte)) continue;
      trouves.set(relatif(chemin), (texte.match(/pwodui/gi) ?? []).length);
    }
  }
  return trouves;
}

test("G1 — le détecteur voit l'ancienne graphie, quelle que soit la casse, et laisse passer la nouvelle", () => {
  for (const positif of ["Gade pwodui a", "Pwodui yo", "PWODUI", "fich pwodui an bouyon"]) {
    assert.ok(ANCIENNE_GRAPHIE.test(positif), `devait être vu : ${positif}`);
  }
  for (const negatif of ["Gade pwodwi a", "Pwodwi yo", "pwodiksyon", "produit", "product"]) {
    assert.ok(!ANCIENNE_GRAPHIE.test(negatif), `ne devait pas être vu : ${negatif}`);
  }
});

test("G2 — aucun texte de l'application n'écrit « pwodui » hors des exemptions juridiques", () => {
  const hors = [...fautifs().entries()].filter(([f]) => !(f in EXEMPTIONS));
  assert.deepEqual(
    hors,
    [],
    "écrire « pwodwi » (V-29). Fichiers fautifs, avec le nombre d'occurrences : " +
      hors.map(([f, n]) => `${f} (${n})`).join(", "),
  );
});

test("G3 — chaque exemption sert encore : un texte juridique repris ne garde pas sa place dans la liste", () => {
  const trouves = fautifs();
  for (const [fichier, raison] of Object.entries(EXEMPTIONS)) {
    assert.ok(
      trouves.has(fichier),
      `${fichier} n'écrit plus « pwodui » : retirer son exemption (${raison})`,
    );
  }
});

test("G4 — la graphie retenue est bien celle de l'interface kreyòl", () => {
  const i18n = readFileSync(join(RACINE, "lib/i18n.ts"), "utf8");
  // Connu-positif sur le vrai fichier : des titres que le visiteur voit.
  assert.match(i18n, /"home\.products": "Pwodwi yo"/);
  assert.match(i18n, /"home\.product\.cta": "Gade pwodwi a"/);
  assert.ok((i18n.match(/pwodwi/gi) ?? []).length >= 100, "le kreyòl de l'interface doit écrire pwodwi");
});
