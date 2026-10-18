import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * LES EN-TÊTES ANTI-CACHE DE LA SESSION (@supabase/ssr ≥ 0.10).
 *
 * Depuis 0.10, la bibliothèque passe à `setAll` un second argument : les
 * en-têtes à poser sur la réponse qui écrit les cookies de session
 * (`Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`,
 * `Expires: 0`, `Pragma: no-cache`). Une réponse mise en cache par un CDN avec
 * un cookie de session dedans servirait la session d'un utilisateur à un autre.
 * Le proxy rafraîchit la session à chaque requête : c'est lui qui doit les poser.
 */

const MIDDLEWARE = readFileSync("lib/supabase/middleware.ts", "utf8");

test("S1 — le proxy pose sur sa réponse les en-têtes que @supabase/ssr lui passe", () => {
  assert.match(MIDDLEWARE, /setAll\([\s\S]{0,400}?entetes: Record<string, string> = \{\}\s*\)/, "setAll doit recevoir les en-têtes");
  assert.match(
    MIDDLEWARE,
    /response = suite\(\);[\s\S]{0,300}Object\.entries\(entetes\)\.forEach\(\(\[nom, valeur\]\) => response\.headers\.set\(nom, valeur\)\);/,
    "les en-têtes doivent aller sur la réponse RECRÉÉE, celle qui porte les cookies",
  );
});

test("S2 — la règle s'applique bien à la version installée", () => {
  const version = JSON.parse(readFileSync("node_modules/@supabase/ssr/package.json", "utf8")).version as string;
  const [majeure, mineure] = version.split(".").map(Number);
  assert.ok(majeure > 0 || mineure >= 10, `@supabase/ssr ${version} : ce test vise 0.10 et plus`);
  const types = readFileSync("node_modules/@supabase/ssr/dist/main/types.d.ts", "utf8");
  assert.match(types, /headers: Record<string, string>/, "le type SetAllCookies ne porte plus d'en-têtes : revoir ce garde");
});
