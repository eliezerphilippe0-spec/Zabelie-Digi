import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

/**
 * LE SKILL DE GOÛT EST UN TIERS ; SON PRÉAMBULE ZABELIE EST LE NÔTRE.
 *
 * `.claude/skills/design-taste-frontend/SKILL.md` = frontmatter amont +
 * BLOC ZABELIE + corps amont verbatim (taste-skill v2, Leonxlnx, ccbc156).
 *
 * Deux façons de perdre la précédence sans qu'aucun test d'interface ne le
 * voie :
 *   • `npx skills add … --skill design-taste-frontend` « remplace en place »
 *     (README amont) — le bloc Zabelie disparaît, le skill redevient une
 *     autorité sans contrepoids ;
 *   • une retouche du corps amont, à la main, qui ne dit plus ce que le
 *     commit cité dit.
 * Ce fichier attrape les deux : présence du bloc ANCRÉE sur l'empreinte
 * qu'il cite, et empreinte RECALCULÉE du fichier reconstitué sans le bloc.
 */

const CHEMIN = join(import.meta.dirname, "..", ".claude/skills/design-taste-frontend/SKILL.md");
const SKILL = readFileSync(CHEMIN, "utf8");

/** Empreinte SHA-256 de `skills/taste-skill/SKILL.md` amont (ccbc156). */
const EMPREINTE_AMONT = "aa194351b246b8b4799099d4ed7b033d29eab6e6e3d58d8d2172978be7b3ec89";

/* Le bloc est inséré ENTRE la ligne `---` qui ferme le frontmatter et le
 * corps amont (qui commence par une ligne vide). Il se termine par `-->\n`,
 * sans ligne vide ajoutée : retirer exactement [DEBUT, FIN] rend l'amont.
 *
 * ⚠️ Écrit après un rouge : la première version ajoutait un `\n` entre le
 * frontmatter et le bloc, et T3 échouait sur le fichier RÉEL — donc les
 * mutations « rouges » ne prouvaient rien, un témoin déjà rouge le reste
 * sous toute mutation. Le connu-positif vient avant le connu-négatif. */
const DEBUT = "<!-- ═══";
const FIN = "═══ -->\n";

test("T1 — le frontmatter amont est intact et porte le nom d'installation", () => {
  assert.match(SKILL, /^---\nname: design-taste-frontend\n/, "le nom d'installation commande le chargement du skill");
});

test("T2 — le bloc Zabelie est là, et il cite l'empreinte qu'on vérifie", () => {
  const i = SKILL.indexOf(DEBUT);
  const j = SKILL.indexOf(FIN);
  assert.ok(i > 0 && j > i, "bloc de précédence Zabelie absent ou mal borné");
  const bloc = SKILL.slice(i, j);
  assert.match(bloc, /ZABELIE — PRÉCÉDENCE/);
  // Liaison : le bloc doit citer EXACTEMENT l'empreinte que T3 recalcule.
  // Un bloc conservé mais désynchronisé de l'amont ne vaut pas mieux.
  assert.ok(bloc.includes(EMPREINTE_AMONT), "le bloc ne cite pas l'empreinte amont vérifiée par T3");
  assert.match(bloc, /LE DÉPÔT GAGNE/, "la règle de précédence doit être écrite, pas sous-entendue");
});

test("T3 — reconstitué sans le bloc, le fichier EST l'amont, octet pour octet", () => {
  const i = SKILL.indexOf(DEBUT);
  const j = SKILL.indexOf(FIN) + FIN.length;
  assert.ok(i > 0 && j > i);
  // Le bloc est inséré après le frontmatter suivi d'une ligne vide :
  // `---\n\n` + bloc + corps. Retirer le bloc rend `---\n\n` + corps = amont.
  const reconstitue = SKILL.slice(0, i) + SKILL.slice(j);
  const empreinte = createHash("sha256").update(reconstitue).digest("hex");
  assert.equal(
    empreinte,
    EMPREINTE_AMONT,
    "le corps amont a été modifié, ou le bloc n'est plus inséré au bon endroit — " +
      "mettre à jour l'empreinte ET le commit cité dans le bloc, jamais l'un sans l'autre"
  );
});

test("T4 — les huit points de précédence nomment ce qu'ils protègent", () => {
  const bloc = SKILL.slice(SKILL.indexOf(DEBUT), SKILL.indexOf(FIN));
  for (const ancre of [
    "app/zabelie-theme.css",
    "check:contrast",
    "lib/i18n.ts",
    "prefers-reduced-motion",
    "Higgsfield",
    "docs/25",
    "trust-first",
  ]) {
    assert.ok(bloc.includes(ancre), `le bloc ne cite plus « ${ancre} »`);
  }
});
