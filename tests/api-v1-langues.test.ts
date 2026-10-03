import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGUES_API, MESSAGES } from "../lib/api/v1/messages";
import { TEXTES_OPENAPI_PUBLIC, openApiDocument } from "../lib/api/v1/openapi";

/**
 * L'API PUBLIQUE DANS LES QUATRE LANGUES — demande porteur du 2026-10-03 :
 * « Mets l'API publique dans les quatre langues ». Mêmes règles que l'API
 * vendeur (`tests/api-seller.test.ts` B9).
 */

test("L1 — la route publique ne passe jamais une phrase à erreur() : seulement des clés traduites", () => {
  const route = readFileSync("app/api/v1/[endpoint]/route.ts", "utf8");
  const appels = [...route.matchAll(/erreur\(lang, "[a-z_]+", ([^,)]+)/g)].map((m) => m[1].trim());
  assert.ok(appels.length >= 7, `témoin : ${appels.length} appels lus`);
  assert.match(route, /if \(e instanceof ErreurApi\) return erreur\(lang, e\.code, estCleMessage\(e\.message\) \? e\.message : "internal", e\.field\);/);
  for (const a of appels) assert.match(a, /^"[a-z_]+"$|^estCleMessage\(e\.message\) \? e\.message : "internal"$/, `message non traduit : ${a}`);
  assert.doesNotMatch(route, /erreur\("[a-z_]+", "|erreur\("[a-z_]+", `/, "phrase en dur passée à erreur()");
  assert.doesNotMatch(route, /message: "[A-ZÉ]/, "message en dur dans une réponse");
  assert.match(route, /const lang = langueApi\(req\.headers, req\.url\);/);
});

test("L2 — les handlers publics lèvent des CLÉS connues, jamais une phrase", () => {
  const src = readFileSync("lib/api/v1/handlers.ts", "utf8");
  const seconds = [...src.matchAll(/new ErreurApi\(\s*"[a-z_]+",\s*("[^"]*"|`[^`]*`)/g)].map((m) => m[1]);
  assert.ok(seconds.length >= 15, `témoin : ${seconds.length} levées lues`);
  for (const s of seconds) {
    assert.match(s, /^"[a-z_]+"$/, `phrase levée au lieu d'une clé : ${s}`);
    assert.ok(Object.prototype.hasOwnProperty.call(MESSAGES, s.slice(1, -1)), `clé inconnue : ${s}`);
  }
});

test("L3 — le contrat OpenAPI public existe dans les quatre langues, mêmes opérations", () => {
  const fr = openApiDocument("fr");
  for (const l of LANGUES_API) {
    const t = TEXTES_OPENAPI_PUBLIC[l];
    assert.deepEqual(Object.keys(t).sort(), Object.keys(TEXTES_OPENAPI_PUBLIC.fr).sort());
    for (const v of Object.values(t)) assert.ok(v.trim(), `${l} : texte vide`);
    const doc = openApiDocument(l);
    assert.equal(doc.info.description, t.intro);
    assert.deepEqual(Object.keys(doc.paths), Object.keys(fr.paths));
  }
  for (const cle of Object.keys(TEXTES_OPENAPI_PUBLIC.fr) as (keyof typeof TEXTES_OPENAPI_PUBLIC.fr)[]) {
    assert.equal(new Set(LANGUES_API.map((l) => TEXTES_OPENAPI_PUBLIC[l][cle])).size, 4, `${cle} : deux langues partagent un texte`);
  }
  assert.equal(openApiDocument().info.description, TEXTES_OPENAPI_PUBLIC.fr.intro, "le français reste la langue par défaut");
});
