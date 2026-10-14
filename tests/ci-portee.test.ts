import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { baseDeComparaison, porteeDuChangement, sansEffetE2E } from "../scripts/ci-portee.mjs";

/**
 * Le saut de l'e2e sur un changement de documentation seule ne vaut que si
 * l'instrument qui le décide a été vu se TROMPER DANS LE BON SENS : chaque cas
 * douteux doit lancer l'e2e. Un saut injustifié serait un vert sans mesure —
 * exactement le motif que ce dépôt traque.
 */

type Git = (args: string[]) => string;
const gitFactice = (reponses: Record<string, string>, appels: string[][] = []): Git => (args) => {
  appels.push(args);
  const cle = args.join(" ");
  if (!(cle in reponses)) throw new Error(`git ${cle} : inattendu`);
  return reponses[cle];
};

test("témoin : seuls docs/ et les .md sont sans effet sur un parcours navigateur", () => {
  assert.equal(sansEffetE2E(["docs/03-PAIEMENTS.md"]), true);
  assert.equal(sansEffetE2E(["README.md", "CLAUDE.md", "docs/schema.png"]), true);
  assert.equal(sansEffetE2E([".claude/skills/design-taste-frontend/SKILL.md"]), true);
  // Connus-négatifs : tout le reste lance l'e2e.
  assert.equal(sansEffetE2E(["docs/03-PAIEMENTS.md", "app/page.tsx"]), false);
  assert.equal(sansEffetE2E([".github/workflows/ci.yml"]), false);
  assert.equal(sansEffetE2E(["app/docs/page.tsx"]), false, "docs/ ne vaut qu'à la racine");
  assert.equal(sansEffetE2E(["docs.ts"]), false);
  assert.equal(sansEffetE2E(["lib/i18n.ts"]), false);
  assert.equal(sansEffetE2E([]), false, "une liste vide ne prouve rien : on teste");
});

test("base : la branche ENTIÈRE, pas le dernier commit", () => {
  const appels: string[][] = [];
  const git = gitFactice({ "merge-base origin/main HEAD": "base-branche" }, appels);
  assert.equal(baseDeComparaison({ evenement: "push", branche: "feat/x", payload: {}, git }), "base-branche");
  assert.deepEqual(appels, [["merge-base", "origin/main", "HEAD"]]);
});

test("base : sur main, le push lui-même ; inconnue si l'historique a été réécrit", () => {
  const git = gitFactice({});
  assert.equal(baseDeComparaison({ evenement: "push", branche: "main", payload: { before: "abc123" }, git }), "abc123");
  assert.equal(baseDeComparaison({ evenement: "push", branche: "main", payload: { before: "0".repeat(40) }, git }), null);
  assert.equal(baseDeComparaison({ evenement: "push", branche: "main", payload: {}, git }), null);
});

test("base : une PR se mesure depuis son point de départ sur main", () => {
  const git = gitFactice({ "merge-base sha-main sha-tete": "depart" });
  const payload = { pull_request: { base: { sha: "sha-main" }, head: { sha: "sha-tete" } } };
  assert.equal(baseDeComparaison({ evenement: "pull_request", branche: "feat/x", payload, git }), "depart");
  assert.equal(baseDeComparaison({ evenement: "pull_request", branche: "feat/x", payload: {}, git }), null);
});

test("base : tout autre événement est inconnu — l'e2e tourne", () => {
  const git = gitFactice({});
  assert.equal(baseDeComparaison({ evenement: "workflow_dispatch", branche: "main", payload: {}, git }), null);
});

test("du code poussé PUIS un commit de doc : la branche n'est pas « doc seulement »", () => {
  const git = gitFactice({
    "merge-base origin/main HEAD": "depart",
    "diff --name-only depart HEAD": "app/checkout/page.tsx\ndocs/03-PAIEMENTS.md\n",
  });
  const r = porteeDuChangement({ evenement: "push", branche: "feat/x", payload: {}, git });
  assert.equal(r.docsSeulement, false);
});

test("une branche de documentation seule saute l'e2e, et dit pourquoi", () => {
  const git = gitFactice({
    "merge-base origin/main HEAD": "depart",
    "diff --name-only depart HEAD": "docs/11-SECRETS.md\nREADME.md\n",
  });
  const r = porteeDuChangement({ evenement: "push", branche: "docs/x", payload: {}, git });
  assert.equal(r.docsSeulement, true);
  assert.deepEqual(r.fichiers, ["docs/11-SECRETS.md", "README.md"]);
  assert.match(r.raison, /documentation/);
});

test("une erreur Git ne fait jamais sauter l'e2e", () => {
  const git: Git = () => { throw new Error("fatal: bad object"); };
  const r = porteeDuChangement({ evenement: "push", branche: "feat/x", payload: {}, git });
  assert.equal(r.docsSeulement, false);
  assert.match(r.raison, /prudence/);
});

test("un diff vide ne fait jamais sauter l'e2e", () => {
  const git = gitFactice({ "merge-base origin/main HEAD": "depart", "diff --name-only depart HEAD": "" });
  assert.equal(porteeDuChangement({ evenement: "push", branche: "feat/x", payload: {}, git }).docsSeulement, false);
});

// ───────────────── Le câblage dans ci.yml ─────────────────────────────────────

const CI = readFileSync(".github/workflows/ci.yml", "utf8");

/** Corps d'un job : de sa clé jusqu'à la clé de job suivante. */
function job(nom: string): string {
  const debut = CI.search(new RegExp(`^ {2}${nom}:\\s*$`, "m"));
  assert.notEqual(debut, -1, `job ${nom} introuvable dans ci.yml`);
  const reste = CI.slice(debut + 1);
  const fin = reste.search(/^ {2}[a-zA-Z0-9_-]+:\s*$/m);
  return fin === -1 ? reste : reste.slice(0, fin);
}

test("le saut n'existe QUE dans e2e : build et sql-tests tournent toujours", () => {
  for (const nom of ["build", "sql-tests"]) {
    assert.doesNotMatch(job(nom), /docs_seulement|ci-portee/, `${nom} ne doit jamais dépendre de la portée`);
  }
  assert.match(job("e2e"), /id: portee[\s\S]*node scripts\/ci-portee\.mjs/);
});

test("e2e lit l'historique, sans quoi la base de branche est introuvable", () => {
  assert.match(job("e2e"), /actions\/checkout@v\d+\s+with:\s+fetch-depth: 0/);
});

test("chaque condition tombe du côté « on teste » si la mesure manque", () => {
  const conditions = [...CI.matchAll(/if: (.*docs_seulement.*)$/gm)].map((m) => m[1].trim());
  assert.ok(conditions.length >= 10, `seulement ${conditions.length} étapes conditionnées : le relevé ne lit plus ci.yml`);
  for (const c of conditions) {
    // `== 'false'` sauterait l'e2e si l'étape de mesure échouait sans sortie.
    assert.equal(c, "steps.portee.outputs.docs_seulement != 'true'", `condition dangereuse : ${c}`);
  }
});
