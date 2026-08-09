import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * AUCUN LIEN INTERNE NE MÈNE NULLE PART.
 *
 * Un `href` vers une route inexistante compile, s'affiche, se survole — et
 * rend un 404 au clic. Rien ne le signale : ni le typeur, ni le build, ni la
 * CI. C'est le symétrique exact du « code sans appelant » que ce dépôt traque
 * ailleurs — ici c'est un appelant sans code.
 *
 * ⚠️ CE FICHIER EXISTE PARCE QUE MA PREMIÈRE VERSION A MENTI. Elle capturait
 * `href={` + guillemet + tout sauf `$`, donc elle coupait au premier `${` :
 * ``href={`/produit/${slug}`}`` devenait `/produit`, qui ne correspond à
 * aucune route, et elle a rendu TROIS faux positifs sur trois liens
 * parfaitement valides. Un instrument qui invente des défauts est aussi
 * inutilisable qu'un instrument qui n'en voit aucun — et celui-là aurait
 * envoyé corriger du code sain.
 *
 * La version ci-dessous remplace chaque `${…}` par un segment générique, qui
 * s'apparie ensuite avec les segments dynamiques `[slug]` des routes. Elle
 * est éprouvée sur un corpus connu-positif ET connu-négatif avant la mesure.
 */

const RACINES_LIENS = ["app", "components"];

/** Toutes les routes de page (`app/**\/page.tsx`), forme `/a/[b]/c`. */
function routesExistantes(): string[] {
  const out: string[] = [];
  const parcourir = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (n === "page.tsx") {
        const r = "/" + p.replace(/^app\/?/, "").replace(/\/?page\.tsx$/, "");
        out.push(r === "/" ? "/" : r.replace(/\/$/, ""));
      }
    }
  };
  parcourir("app");
  return out;
}

/**
 * Extrait les liens internes. `${…}` devient `:v` — un segment quelconque,
 * qui s'appariera avec un `[slug]`. Sans ça, tout lien dynamique du dépôt
 * remonterait comme cassé (l'erreur de la première version).
 */
export function liensDuFichier(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/href=\{?["'`](\/[^"'`\s]*)["'`]?/g)) {
    const brut = m[1]
      .replace(/\$\{[^}]*\}/g, ":v") // segment dynamique
      .split(/[?#]/)[0]; // query et ancre ne changent pas la route
    if (brut.includes("${")) continue; // gabarit imbriqué : hors de portée, on ne devine pas
    const l = brut.replace(/\/+$/, "") || "/";
    out.push(l);
  }
  return out;
}

/** Un lien correspond-il à une route ? `[slug]` et `:v` s'apparient à tout. */
export function correspond(lien: string, routes: string[]): boolean {
  const ls = lien.split("/").filter(Boolean);
  return routes.some((r) => {
    const rs = r.split("/").filter(Boolean);
    if (rs.length !== ls.length) return false;
    return rs.every((seg, i) => seg.startsWith("[") || ls[i] === ":v" || seg === ls[i]);
  });
}

// ───────────────── L'instrument avant la mesure ──────────────────────────────

test("l'extracteur ne coupe pas au premier ${ — l'erreur de la v1", () => {
  const src = [
    'href={`/produit/${p.slug}`}',
    'href="/catalogue"',
    'href={`/createur/${id}`}',
    'href="/catalogue?cat=auto"',
    'href="/#kategori"',
    'href="/inexistant"',
  ].join("\n");
  assert.deepEqual(liensDuFichier(src), [
    "/produit/:v",
    "/catalogue",
    "/createur/:v",
    "/catalogue",
    "/",
    "/inexistant",
  ]);
});

test("l'appariement voit le lien mort, et se tait sur le lien dynamique valide", () => {
  const routes = ["/", "/catalogue", "/produit/[slug]", "/pro/facture/[id]"];
  // Connu-négatif : ces quatre-là existent.
  for (const l of ["/", "/catalogue", "/produit/:v", "/pro/facture/:v"]) {
    assert.ok(correspond(l, routes), `${l} devrait correspondre`);
  }
  // Connu-positif : ceux-là n'existent pas, et le contrôle doit le dire.
  for (const l of ["/inexistant", "/produit", "/pro/facture", "/catalogue/:v"]) {
    assert.ok(!correspond(l, routes), `${l} ne devrait PAS correspondre`);
  }
});

// ───────────────────────── Le contrôle ───────────────────────────────────────

const routes = routesExistantes();

const liens = new Map<string, string>(); // lien → premier fichier qui le porte
for (const racine of RACINES_LIENS) {
  const parcourir = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (/\.tsx?$/.test(p)) {
        for (const l of liensDuFichier(readFileSync(p, "utf8"))) {
          if (!liens.has(l)) liens.set(l, p);
        }
      }
    }
  };
  parcourir(racine);
}

test("les extracteurs ont lu le dépôt, et pas le vide", () => {
  assert.ok(routes.length >= 20, `routes lues : ${routes.length}`);
  assert.ok(liens.size >= 10, `liens lus : ${liens.size}`);
  // Ancres nommées : si l'une disparaît, c'est l'extraction qui a bougé.
  assert.ok(routes.includes("/produit/[slug]"), "route dynamique de référence absente");
  assert.ok(liens.has("/catalogue"), "lien de référence absent");
});

test("tout lien interne mène à une route qui existe", () => {
  const morts = [...liens]
    // Les routes d'API ne sont pas des pages : elles n'ont pas de page.tsx.
    .filter(([l]) => !l.startsWith("/api/"))
    .filter(([l]) => !correspond(l, routes))
    .map(([l, f]) => `${l}  (${f})`)
    .sort();

  assert.deepEqual(
    morts,
    [],
    `Lien(s) interne(s) sans route :\n  ${morts.join("\n  ")}\n` +
      "Soit créer la page, soit corriger le lien. Un href vers une route " +
      "absente compile, s'affiche, et rend un 404 au clic — rien d'autre ne " +
      "le signale."
  );
});
