import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, parse } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { Linter, type ESLint } from "eslint";

const require_ = createRequire(import.meta.url);
const pluginManifest = require_.resolve("@next/eslint-plugin-next/package.json");
const fromPlugin = createRequire(pluginManifest);
type RootContext = { cwd: string; settings: { next?: { rootDir?: unknown } } };
const { getRootDirs } = fromPlugin("./dist/utils/get-root-dirs.js") as {
  getRootDirs(context: RootContext): string[];
};
const nextPlugin = fromPlugin(".") as ESLint.Plugin;

const PREFIX = "zabelie-eslint-glob-";
const slash = (value: string) => value.replace(/\\/g, "/");

// Les tests d'un fichier node:test sont séquentiels. Chaque changement de cwd
// est restauré avant de supprimer uniquement le dossier temporaire créé ici.
function workspace(t: TestContext) {
  const previous = process.cwd();
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(join(parent, PREFIX));
  const cwd = join(root, "workspace");
  mkdirSync(cwd);
  t.after(() => {
    process.chdir(previous);
    assert.ok(isAbsolute(root));
    assert.equal(dirname(root), parent);
    assert.ok(basename(root).startsWith(PREFIX));
    rmSync(root, { recursive: true, force: true });
  });
  process.chdir(cwd);
  return {
    root,
    cwd,
    directory(relative: string) {
      const target = join(cwd, relative);
      mkdirSync(target, { recursive: true });
      return target;
    },
    file(relative: string, content = "fixture") {
      const target = join(cwd, relative);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
      return target;
    },
  };
}

function roots(cwd: string, rootDir?: unknown) {
  return getRootDirs({ cwd, settings: rootDir === undefined ? {} : { next: { rootDir } } });
}

function samePaths(actual: string[], expected: string[]) {
  // L'ordre d'énumération n'est pas un contrat ; les chemins et doublons le sont.
  // Aucune résolution/canonicalisation des résultats ne masque leur forme.
  assert.deepEqual([...actual].sort(), [...expected].sort());
}

function applications(t: TestContext) {
  const fixture = workspace(t);
  fixture.directory("apps/web");
  fixture.directory("apps/admin");
  return fixture;
}

test("glob Next : sans rootDir, le cwd du contexte est conservé tel quel", (t) => {
  const f = workspace(t);
  assert.deepEqual(roots(f.cwd), [f.cwd]);
});

test("glob Next : un rootDir textuel vide est refusé plutôt qu'ignoré", (t) => {
  const f = workspace(t);
  assert.throws(() => roots(f.cwd, ""));
});

test("glob Next : un dossier littéral reste une seule racine malgré ses enfants", (t) => {
  const f = workspace(t);
  f.directory("apps/web/pages");
  f.directory("apps/web/src/app");
  f.file("apps/web/pages/about.tsx");
  assert.deepEqual(roots(f.cwd, "apps/web"), ["apps/web"]);
});

test("glob Next : une racine absolue hors cwd conserve son chemin absolu", (t) => {
  const f = workspace(t);
  const outside = join(f.root, "outside", "web");
  mkdirSync(join(outside, "pages"), { recursive: true });
  const pattern = slash(outside);
  assert.deepEqual(roots(f.cwd, pattern), [pattern]);
});

test("glob Next : ./ et la racine du système conservent leur slash nécessaire", (t) => {
  const f = workspace(t);
  // Les motifs statiques de fast-glob gardent leur forme lexicale. La racine
  // explicite du disque évite l'ambiguïté de '/' sur Windows (lecteur courant).
  const diskRoot = slash(parse(f.cwd).root);
  assert.deepEqual(roots(f.cwd, "./"), ["./"]);
  assert.deepEqual(roots(f.cwd, diskRoot), [diskRoot]);
});

test("glob Next : un wildcard ne découvre que les racines correspondantes", (t) => {
  const f = applications(t);
  f.directory("other/unrelated");
  samePaths(roots(f.cwd, "apps/*"), ["apps/web", "apps/admin"]);
});

test("glob Next : les alternances à accolades conservent web et admin", (t) => {
  const f = applications(t);
  f.directory("apps/other");
  samePaths(roots(f.cwd, "apps/{web,admin}"), ["apps/web", "apps/admin"]);
});

test("glob Next : une accolade littérale ne masque pas le wildcard qui suit", (t) => {
  const f = workspace(t);
  f.directory("apps/{literal}/web");
  assert.deepEqual(roots(f.cwd, "apps/{literal}/*"), ["apps/{literal}/web"]);
});

test("glob Next : les éléments d'un tableau sont traités séparément, même négatifs", (t) => {
  const f = applications(t);
  // Next appelle le moteur une fois par chaîne : le second motif n'exclut
  // pas globalement admin du résultat déjà obtenu par le premier.
  samePaths(roots(f.cwd, ["apps/*", "!apps/admin"]), ["apps/web", "apps/admin"]);
});

test("glob Next : un tableau garde ses doublons et ignore les valeurs non string", (t) => {
  const f = applications(t);
  assert.deepEqual(roots(f.cwd, ["apps/web", null, 7, {}, "apps/admin", "apps/web"]),
    ["apps/web", "apps/admin", "apps/web"]);
});

test("glob Next : getRootDirs normalise les séparateurs Windows avant le moteur", (t) => {
  const f = applications(t);
  samePaths(roots(f.cwd, "apps\\{web,admin}"), ["apps/web", "apps/admin"]);
});

test("glob Next : onlyDirectories exclut les fichiers et un motif absent reste vide", (t) => {
  const f = applications(t);
  f.file("apps/readme.md");
  samePaths(roots(f.cwd, "apps/*"), ["apps/web", "apps/admin"]);
  assert.deepEqual(roots(f.cwd, "apps/readme.md"), []);
  assert.deepEqual(roots(f.cwd, "missing/*"), []);
});

test("glob Next : un lien de dossier reste une racine lexicale, sans realpath", (t) => {
  const f = workspace(t);
  const target = join(f.root, "outside", "web");
  mkdirSync(join(target, "pages"), { recursive: true });
  f.directory("apps");
  try {
    symlinkSync(target, join(f.cwd, "apps", "linked"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (["EPERM", "EACCES", "ENOSYS", "ENOTSUP"].includes(code ?? "")) {
      t.skip(`Création des liens indisponible : ${code}`);
      return;
    }
    throw error;
  }
  assert.deepEqual(roots(f.cwd, "apps/linked"), ["apps/linked"]);
  assert.deepEqual(roots(f.cwd, "apps/*"), ["apps/linked"]);
  assert.deepEqual(roots(f.cwd, "apps/linked/*"), ["apps/linked/pages"]);
});

test("glob Next : plusieurs liens ne font pas accepter une racine hors motif", (t) => {
  const f = workspace(t);
  f.directory("apps");
  const links = [
    { name: "link-web", target: join(f.root, "outside", "web") },
    { name: "other", target: join(f.root, "outside", "admin") },
  ];
  for (const link of links) mkdirSync(join(link.target, "pages"), { recursive: true });
  try {
    for (const link of links) {
      symlinkSync(link.target, join(f.cwd, "apps", link.name), process.platform === "win32" ? "junction" : "dir");
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (["EPERM", "EACCES", "ENOSYS", "ENOTSUP"].includes(code ?? "")) {
      t.skip(`Création des liens indisponible : ${code}`);
      return;
    }
    throw error;
  }
  assert.deepEqual(roots(f.cwd, "apps/link-*"), ["apps/link-web"]);
  assert.deepEqual(roots(f.cwd, "!apps/link-*"), []);
  const pattern = slash(join(f.cwd, "apps", "link-*"));
  assert.deepEqual(roots(f.cwd, pattern), [slash(join(f.cwd, "apps", "link-web"))]);
});

test("glob Next : les plages à accolades sont refusées explicitement", (t) => {
  const f = applications(t);
  // Même un chemin existant ne doit pas contourner le refus des plages.
  f.directory("apps/{literal}/{1..3}");
  for (const pattern of ["apps/{1..3}", "apps/{a..c}", "apps/{1..100..2}", "apps/{literal}/{1..3}"]) {
    assert.throws(() => roots(f.cwd, pattern), pattern);
  }
  assert.throws(() => roots(f.cwd, ["apps/web", "apps/{1..3}"]));
});

function pageRule(t: TestContext) {
  const f = workspace(t);
  const outside = join(f.root, "applications");
  mkdirSync(join(outside, "web", "pages"), { recursive: true });
  mkdirSync(join(outside, "admin", "pages"), { recursive: true });
  writeFileSync(join(outside, "web", "pages", "about.tsx"), "export default function About() { return null; }");
  writeFileSync(join(outside, "admin", "pages", "dashboard.tsx"), "export default function Dashboard() { return null; }");
  const linter = new Linter({ cwd: f.cwd });
  return (code: string) => linter.verify(code, [{
    files: ["**/*.jsx"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "@next/next": nextPlugin },
    settings: { next: { rootDir: `${slash(outside)}/{web,admin}` } },
    rules: { "@next/next/no-html-link-for-pages": "error" },
  }], { filename: join(f.cwd, "sample.jsx") });
}

test("règle Next réelle : un lien a interne reçoit une erreur no-html-link-for-pages", (t) => {
  const verify = pageRule(t);
  const messages = verify('const page = <a href="/about">À propos</a>;');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].ruleId, "@next/next/no-html-link-for-pages");
  assert.equal(messages[0].severity, 2);
  assert.notEqual(messages[0].fatal, true);
  assert.match(messages[0].message, /\/about\//);
  assert.match(messages[0].message, /next\/link/);
});

test("règle Next réelle : NextLink et les liens externes restent acceptés", (t) => {
  const verify = pageRule(t);
  for (const code of [
    'import Link from "next/link"; const page = <Link href="/about">À propos</Link>;',
    'const page = <a href="https://example.test/about">Externe</a>;',
    'const page = <a href="//example.test/about">Externe</a>;',
  ]) assert.deepEqual(verify(code), []);
});

test("glob Next : un accès refusé ne devient pas une racine silencieusement ignorée", (t) => {
  const f = applications(t);
  const code = `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const path = require('node:path');
    const blocked = path.resolve('apps');
    const original = fs.readdirSync;
    fs.readdirSync = function(directory, ...args) {
      if (path.resolve(String(directory)) === blocked) {
        throw Object.assign(new Error('Accès refusé synthétique'), { code: 'EACCES' });
      }
      return original.call(this, directory, ...args);
    };
    const { createRequire } = require('node:module');
    const fromPlugin = createRequire(${JSON.stringify(pluginManifest)});
    const { getRootDirs } = fromPlugin('./dist/utils/get-root-dirs.js');
    assert.throws(() => getRootDirs({ cwd: process.cwd(), settings: { next: { rootDir: 'apps/*' } } }), { code: 'EACCES' });
  `;
  const child = spawnSync(process.execPath, ["-e", code], { cwd: f.cwd, encoding: "utf8", timeout: 5000 });
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr || child.stdout);
});

test("graphe réel du plugin : motifs imbriqués bornés sans charger braces ou micromatch", (t) => {
  const f = applications(t);
  const code = `
    const { createRequire } = require('node:module');
    const fromPlugin = createRequire(${JSON.stringify(pluginManifest)});
    const engine = fromPlugin('fast-glob');
    if (typeof engine.globSync !== 'function') throw new Error('globSync absent');
    const { getRootDirs } = fromPlugin('./dist/utils/get-root-dirs.js');
    const context = rootDir => ({ cwd: process.cwd(), settings: { next: { rootDir } } });
    const ordinary = getRootDirs(context('apps/*'));
    const depth = 128;
    const pattern = 'apps/' + '{web,'.repeat(depth) + 'admin' + '}'.repeat(depth);
    const nested = getRootDirs(context(pattern));
    const forbidden = Object.keys(require.cache).filter(file => /[\\\\/]node_modules[\\\\/](braces|micromatch)([\\\\/]|$)/.test(file));
    process.stdout.write(JSON.stringify({ ordinary, nested, forbidden }));
  `;
  // Processus frais : ni le cache du Linter ni une autre unité ne peut rendre
  // l'observation de dépendances ambiguë. Le travail reste borné en temps.
  const child = spawnSync(process.execPath, ["-e", code], { cwd: f.cwd, encoding: "utf8", timeout: 5000 });
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const result = JSON.parse(child.stdout) as { ordinary: string[]; nested: string[]; forbidden: string[] };
  samePaths(result.ordinary, ["apps/web", "apps/admin"]);
  samePaths(result.nested, ["apps/web", "apps/admin"]);
  assert.deepEqual(result.forbidden, []);
});
