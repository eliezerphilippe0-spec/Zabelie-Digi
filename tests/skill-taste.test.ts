import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

/**
 * LES SKILLS SONT DES TIERS ; LEUR PRÉAMBULE ZABELIE EST LE NÔTRE.
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
 *
 * Un skill peut livrer des guides à côté de SKILL.md (REA, 2026-10-26 : sept
 * `references/*.md`). Ils n'ont pas de bloc, et c'est précisément pourquoi
 * T3b les tient par empreinte : un guide retouché, ou un fichier ajouté sans
 * avoir été lu, ne laisserait sinon aucune trace.
 */

const RACINE = join(import.meta.dirname, "..");
const SKILLS = join(RACINE, ".claude/skills");

/** Les skills installés, avec l'empreinte SHA-256 de leur amont. */
const INSTALLES: Record<string, string> = {
  "design-taste-frontend": "aa194351b246b8b4799099d4ed7b033d29eab6e6e3d58d8d2172978be7b3ec89",
  "redesign-existing-projects": "98ad3e5b051bfb71b2795f7e8a6aa0d32b51ee095606c098a4b2822ac07926c9",
  "reverse-engineer-anything": "8866a9102de4ca5d6110e280a5d53fa67f0600d26b75cfaff4e9b252af631bcf",
};

/** Les fichiers livrés à côté de SKILL.md, copiés verbatim, avec leur empreinte. */
const ANNEXES: Record<string, Record<string, string>> = {
  "reverse-engineer-anything": {
    "references/android-applications.md": "24ecaa1798eb4f28591884a7deb68df31e90313865515a23e3b466403f1abc39",
    "references/connection-and-recovery.md": "3c2049047f2e9c01a224d71c1b54fbf429a98cdf8e691e9058d67ec4bc1df616",
    "references/environments.md": "83e041f0a5243172af69eaadf62da0699617add3ff1d46b294e4bba7ece9d95f",
    "references/evidence-workflows.md": "f44b68acc6ebaa60c1f5d0670e4f9ff7212d351a0ecc6e6ca77ce38b9177ea57",
    "references/javascript-applications.md": "619cfd15ffdf466452cc32002ae357fefec59d5dcad4c9dfc27630138f0f719d",
    "references/native-and-artifacts.md": "966c118218e6bca0de486008cb2142f70a27051541ac3e05aac8f0902a4c2bdc",
    "references/runtime-observation.md": "e207a912470a1a56dc02316eb7b040ac50b4d763f2273e97a6811863d9051d74",
  },
};

const DEBUT = "<!-- ═══";
const FIN = "═══ -->\n";

/** `.gitattributes` impose LF : comparer le contenu canonique, même si le
 * checkout Windows a conservé CRLF. Aucun autre octet n'est normalisé. */
function lireSkill(nom: string): string {
  return readFileSync(join(SKILLS, nom, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
}

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
  const SKILL = lireSkill(nom);

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

  test(`T3 [${nom}] — reconstitué sans le bloc, le fichier canonique LF EST l'amont, octet pour octet`, () => {
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

  test(`T3b [${nom}] — chaque fichier à côté de SKILL.md est une annexe listée, et elle EST l'amont`, () => {
    const attendues = ANNEXES[nom] ?? {};
    const dossier = join(SKILLS, nom);
    const presents: string[] = [];
    for (const rel of readdirSync(dossier, { recursive: true }) as string[]) {
      const chemin = rel.split("\\").join("/");
      const st = lstatSync(join(dossier, rel));
      assert.ok(!st.isSymbolicLink(), `${nom}/${chemin} est un lien symbolique`);
      if (st.isDirectory() || chemin === "SKILL.md") continue;
      presents.push(chemin);
      assert.ok(chemin in attendues, `${nom}/${chemin} est là sans être listé — pas d'empreinte, pas de lecture`);
      const contenu = readFileSync(join(dossier, rel), "utf8").replace(/\r\n/g, "\n");
      assert.equal(createHash("sha256").update(contenu).digest("hex"), attendues[chemin], `${nom}/${chemin} n'est plus l'amont`);
    }
    for (const chemin of Object.keys(attendues)) {
      assert.ok(presents.includes(chemin), `${nom}/${chemin} est listé mais absent du disque`);
    }
  });
}

test("T4 — les points de précédence nomment ce qu'ils protègent", () => {
  const principal = lireSkill("design-taste-frontend");
  const bloc = principal.slice(principal.indexOf(DEBUT), principal.indexOf(FIN));
  for (const ancre of ["app/zabelie-theme.css", "check:contrast", "lib/i18n.ts", "prefers-reduced-motion", "Higgsfield", "docs/25", "trust-first"]) {
    assert.ok(bloc.includes(ancre), `le bloc principal ne cite plus « ${ancre} »`);
  }
  const redesign = lireSkill("redesign-existing-projects");
  const blocR = redesign.slice(redesign.indexOf(DEBUT), redesign.indexOf(FIN));
  // Le second skill s'appuie sur le premier et ajoute ses refus propres.
  assert.match(blocR, /design-taste-frontend\/SKILL\.md/, "le bloc redesign doit renvoyer aux huit points du bloc principal");
  for (const ancre of ["Font swap", "picsum", "inertia", "RÈGLE DES RAYONS"]) {
    assert.ok(blocR.includes(ancre), `le bloc redesign ne refuse plus « ${ancre} »`);
  }
  // REA : chaque ancre est un refus qu'un usage naïf du skill franchirait.
  const rea = lireSkill("reverse-engineer-anything");
  const blocE = rea.slice(rea.indexOf(DEBUT), rea.indexOf(FIN));
  for (const ancre of [
    "rea-agents@latest", // dépendance tierce : proposer, ne pas lancer
    "N'EST PAS UNE API PUBLIQUE", // une API privée ne passe pas l'étape 0
    "docs/03 §9",
    "NatCash ⛔",
    "RÈGLE DURE N°5", // AgentEnv écrit sur l'instance visée
    "docs/11-SECRETS.md",
    "COMMITENT", // captures et bundles : données personnelles
    "vandè", // la recherche de chaînes se vérifie en kreyòl
  ]) {
    assert.ok(blocE.includes(ancre), `le bloc REA ne cite plus « ${ancre} »`);
  }
});
