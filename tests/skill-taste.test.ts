import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

/**
 * LES SKILLS DE GOÛT SONT DES TIERS ; LEUR PRÉAMBULE ZABELIE EST LE NÔTRE.
 *
 * Chaque fichier sous `.claude/skills/<nom>/SKILL.md` = frontmatter amont +
 * BLOC ZABELIE + corps amont verbatim. Deux façons de perdre la précédence
 * sans qu'aucun test d'interface ne le voie :
 *   • `npx skills add …` « remplace en place » — MESURÉ le 2026-09-02 : la
 *     commande a supprimé le fichier et posé un lien symbolique vers
 *     `.agents/skills/…`, amont brut. Le bloc avait disparu ; ce test l'a dit.
 *   • une retouche du corps amont qui ne dit plus ce que l'empreinte dit.
 * Ce fichier attrape les deux, pour CHAQUE skill installé : présence du bloc
 * ancrée sur l'empreinte qu'il cite, et empreinte RECALCULÉE du fichier
 * reconstitué sans le bloc. Et T0 refuse un lien symbolique : un lien est
 * exactement la forme que prend le remplacement.
 */

const RACINE = join(import.meta.dirname, "..");
const SKILLS = join(RACINE, ".claude/skills");

/** Les skills installés, avec l'empreinte SHA-256 de leur amont. */
const INSTALLES: Record<string, string> = {
  "design-taste-frontend": "aa194351b246b8b4799099d4ed7b033d29eab6e6e3d58d8d2172978be7b3ec89",
  "redesign-existing-projects": "98ad3e5b051bfb71b2795f7e8a6aa0d32b51ee095606c098a4b2822ac07926c9",
};

const DEBUT = "<!-- ═══";
const FIN = "═══ -->\n";

test("T0 — aucun skill n'est un lien symbolique, et aucun n'est là sans être listé", () => {
  const presents = readdirSync(SKILLS);
  for (const nom of presents) {
    const st = lstatSync(join(SKILLS, nom));
    assert.ok(!st.isSymbolicLink(), `${nom} est un lien symbolique : c'est la trace d'un npx skills add non relu`);
    assert.ok(nom in INSTALLES, `${nom} est installé mais absent de la liste — pas de préambule, pas d'empreinte, pas de lecture`);
  }
  for (const nom of Object.keys(INSTALLES)) {
    assert.ok(presents.includes(nom), `${nom} est listé mais absent du disque`);
  }
});

for (const [nom, empreinte] of Object.entries(INSTALLES)) {
  const SKILL = readFileSync(join(SKILLS, nom, "SKILL.md"), "utf8");

  test(`T1 [${nom}] — frontmatter amont intact, nom d'installation présent`, () => {
    assert.match(SKILL, new RegExp(`^---\\nname: ${nom}\\n`), "le nom d'installation commande le chargement");
  });

  test(`T2 [${nom}] — le bloc Zabelie est là, cite l'empreinte et la règle`, () => {
    const i = SKILL.indexOf(DEBUT);
    const j = SKILL.indexOf(FIN);
    assert.ok(i > 0 && j > i, "bloc de précédence Zabelie absent ou mal borné");
    const bloc = SKILL.slice(i, j);
    assert.match(bloc, /ZABELIE — PRÉCÉDENCE/);
    assert.ok(bloc.includes(empreinte), "le bloc ne cite pas l'empreinte que T3 recalcule");
    assert.match(bloc, /LE DÉPÔT GAGNE/, "la règle de précédence doit être écrite");
  });

  test(`T3 [${nom}] — reconstitué sans le bloc, le fichier EST l'amont, octet pour octet`, () => {
    const i = SKILL.indexOf(DEBUT);
    const j = SKILL.indexOf(FIN) + FIN.length;
    assert.ok(i > 0 && j > i);
    const reconstitue = SKILL.slice(0, i) + SKILL.slice(j);
    assert.equal(
      createHash("sha256").update(reconstitue).digest("hex"),
      empreinte,
      "corps amont modifié, ou bloc mal placé — mettre à jour l'empreinte ET le bloc, jamais l'un sans l'autre"
    );
  });
}

test("T4 — les points de précédence nomment ce qu'ils protègent", () => {
  const principal = readFileSync(join(SKILLS, "design-taste-frontend/SKILL.md"), "utf8");
  const bloc = principal.slice(principal.indexOf(DEBUT), principal.indexOf(FIN));
  for (const ancre of ["app/zabelie-theme.css", "check:contrast", "lib/i18n.ts", "prefers-reduced-motion", "Higgsfield", "docs/25", "trust-first"]) {
    assert.ok(bloc.includes(ancre), `le bloc principal ne cite plus « ${ancre} »`);
  }
  const redesign = readFileSync(join(SKILLS, "redesign-existing-projects/SKILL.md"), "utf8");
  const blocR = redesign.slice(redesign.indexOf(DEBUT), redesign.indexOf(FIN));
  // Le second skill s'appuie sur le premier et ajoute ses refus propres.
  assert.match(blocR, /design-taste-frontend\/SKILL\.md/, "le bloc redesign doit renvoyer aux huit points du bloc principal");
  for (const ancre of ["Font swap", "picsum", "inertia", "RÈGLE DES RAYONS"]) {
    assert.ok(blocR.includes(ancre), `le bloc redesign ne refuse plus « ${ancre} »`);
  }
});
