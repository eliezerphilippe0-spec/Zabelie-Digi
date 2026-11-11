import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `scripts/ci-apt-install.sh` — l'installation apt de la CI réessaie, et
 * n'échoue que pour de bon.
 *
 * POURQUOI CE TEST EXISTE
 * -----------------------
 * Le 2026-11-11, `sql-tests` a rougi trois fois à « Install psql » parce que
 * les miroirs Ubuntu ne se résolvaient plus. Le script corrige ça, et un
 * script de réessai a deux façons de mentir, toutes deux silencieuses :
 *
 *   * ne PAS réessayer (une seule tentative, et la panne passagère rougit
 *     encore) — on le verrait seulement à la prochaine panne ;
 *   * réessayer puis rendre 0 quand même — le contrôle suivant tournerait
 *     sans l'outil, ou pire, serait sauté, et le vert ne prouverait rien.
 *
 * Chaque cas ci-dessous est donc joué avec un FAUX apt qui compte ses appels :
 * un cas connu-positif, un cas connu-négatif, et le cas réel de la panne
 * (`update` qui rend 0 alors que rien n'a répondu, `install` qui échoue).
 */

const SCRIPT = "scripts/ci-apt-install.sh";

type Faux = { dossier: string; journal: string; apt: string };

/**
 * Faux apt-get. `update` rend toujours 0, comme le vrai quand les miroirs sont
 * muets. `install` échoue tant que le compteur n'a pas dépassé ECHECS.
 */
function fauxApt(echecs: number): Faux {
  const dossier = mkdtempSync(join(tmpdir(), "ci-apt-"));
  const journal = join(dossier, "appels.log");
  const apt = join(dossier, "faux-apt");
  writeFileSync(
    apt,
    [
      "#!/usr/bin/env bash",
      `echo "$*" >> "${journal}"`,
      'if [ "$1" = "update" ]; then exit 0; fi',
      `n=$(grep -c '^install' "${journal}")`,
      `if [ "$n" -le ${echecs} ]; then echo "Temporary failure resolving 'archive.ubuntu.com'" >&2; exit 100; fi`,
      "exit 0",
      "",
    ].join("\n")
  );
  chmodSync(apt, 0o755);
  return { dossier, journal, apt };
}

function lancer(args: string[], faux: Faux, env: Record<string, string> = {}) {
  return spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, APT_GET: faux.apt, APT_PAUSE: "0", ...env },
  });
}

const appels = (f: Faux) => (existsSync(f.journal) ? readFileSync(f.journal, "utf8").trim().split("\n").filter(Boolean) : []);
const installs = (f: Faux) => appels(f).filter((l) => l.startsWith("install"));
const updates = (f: Faux) => appels(f).filter((l) => l.startsWith("update"));

test("miroirs disponibles : un seul essai, et le paquet demandé est bien celui installé", () => {
  const f = fauxApt(0);
  const r = lancer(["--sans-recommandes", "clamav"], f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(installs(f).length, 1);
  assert.equal(updates(f).length, 1);
  assert.match(installs(f)[0], /^install -y .*--no-install-recommends clamav$/);
});

test("panne passagère : `update` rend 0, `install` échoue deux fois, le troisième essai aboutit", () => {
  const f = fauxApt(2);
  const r = lancer(["postgresql-client"], f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(installs(f).length, 3, "trois installations tentées");
  // La paire entière est rejouée : un `update` muet ne doit pas être gardé d'un essai à l'autre.
  assert.equal(updates(f).length, 3, "`update` est rejoué à chaque essai");
  assert.match(r.stdout, /installé à l'essai 3/);
});

test("panne durable : le script ÉCHOUE après le dernier essai, et dit que c'est l'infrastructure", () => {
  const f = fauxApt(99);
  const r = lancer(["postgresql-client"], f, { APT_ESSAIS: "3" });
  assert.equal(r.status, 1, "un script de réessai ne rend jamais 0 sans installation");
  assert.equal(installs(f).length, 3, "exactement APT_ESSAIS tentatives, pas une de plus");
  assert.match(r.stdout, /::error title=Miroirs apt injoignables::/);
  assert.match(r.stdout, /aucun test n'a tourné/);
});

test("--si-absent : commande déjà là, apt n'est JAMAIS appelé, et le saut est dit", () => {
  const f = fauxApt(99);
  const r = lancer(["--si-absent", "bash", "postgresql-client"], f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(appels(f), [], "aucun appel à apt");
  assert.match(r.stdout, /« bash » est déjà présent \(.+\), rien à installer/);
});

test("--si-absent : commande absente, l'installation a lieu", () => {
  const f = fauxApt(0);
  const r = lancer(["--si-absent", "commande-qui-n-existe-pas-zabelie", "postgresql-client"], f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(installs(f).length, 1);
  assert.match(installs(f)[0], / postgresql-client$/);
});

test("--si-absent : commande absente ET miroirs muets, l'échec n'est pas avalé", () => {
  const f = fauxApt(99);
  const r = lancer(["--si-absent", "commande-qui-n-existe-pas-zabelie", "postgresql-client"], f, { APT_ESSAIS: "2" });
  assert.equal(r.status, 1);
  assert.equal(installs(f).length, 2);
});

test("usage : sans paquet, ou avec un réglage non numérique, refus net (code 2) sans appeler apt", () => {
  const f = fauxApt(0);
  assert.equal(lancer([], f).status, 2);
  assert.equal(lancer(["--si-absent"], f).status, 2);
  assert.equal(lancer(["--inconnu", "clamav"], f).status, 2);
  assert.equal(lancer(["clamav"], f, { APT_ESSAIS: "0" }).status, 2);
  assert.equal(lancer(["clamav"], f, { APT_ESSAIS: "beaucoup" }).status, 2);
  assert.equal(lancer(["clamav"], f, { APT_PAUSE: "-1" }).status, 2);
  assert.deepEqual(appels(f), []);
});

/* ───────────── Croisement : la CI passe bien par le script ─────────────
 * Un script correct que personne n'appelle ne protège rien (CLAUDE.md, « le
 * code sans appelant »). On ancre sur la ligne `run:` de chaque étape, pas
 * sur la présence du nom du script quelque part dans le fichier. */

const DOSSIER_WORKFLOWS = ".github/workflows";
const WORKFLOWS = readdirSync(DOSSIER_WORKFLOWS).filter((f) => /\.ya?ml$/.test(f)).map((f) => join(DOSSIER_WORKFLOWS, f));

test("ci.yml : les deux étapes d'installation passent par le script", () => {
  const ci = readFileSync(join(DOSSIER_WORKFLOWS, "ci.yml"), "utf8");
  assert.match(ci, /- name: Install ClamAV engine\n\s+run: bash scripts\/ci-apt-install\.sh --sans-recommandes clamav\n/);
  assert.match(ci, /- name: Install psql\n(?:\s+#[^\n]*\n)*\s+run: bash scripts\/ci-apt-install\.sh --si-absent psql postgresql-client && psql --version\n/);
});

test("workflows : plus aucun `apt-get` nu — une nouvelle étape d'installation passe par le script", () => {
  assert.ok(WORKFLOWS.length >= 1, "aucun workflow lu : le contrôle ne verrait rien");
  for (const chemin of WORKFLOWS) {
    const lignes = readFileSync(chemin, "utf8").split("\n").filter((l) => !/^\s*#/.test(l));
    const nues = lignes.filter((l) => /(?<![\p{L}\p{N}_-])apt(-get)?\s+(update|install)/u.test(l));
    assert.deepEqual(nues, [], `${chemin} appelle apt directement`);
  }
});
