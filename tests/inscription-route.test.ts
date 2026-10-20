import test from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../lib/safe-next";
import { loadRoute } from "./helpers/route-harness";

const route = () => loadRoute("app/inscription/route.ts", {
  "next/server": { NextResponse: { redirect: (url: URL) => Response.redirect(url, 307) } },
  "@/lib/safe-next": { safeNext },
});

test("/inscription renvoie au formulaire existant en mode inscription", async () => {
  const response = await route().GET(new Request("https://zabelie.test/inscription"));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://zabelie.test/connexion?mode=signup");
});

test("l'alias conserve le retour interne, y compris sa requête et son fragment", async () => {
  const next = "/produit/guide?a=1#acheter";
  const response = await route().GET(new Request(`https://zabelie.test/inscription?next=${encodeURIComponent(next)}`));
  const target = new URL(response.headers.get("location")!);
  assert.equal(target.pathname, "/connexion");
  assert.equal(target.searchParams.get("mode"), "signup");
  assert.equal(target.searchParams.get("next"), next);
});

test("l'alias réutilise safeNext contre les retours hors origine", async () => {
  for (const next of ["https://piege.test", "//piege.test", "/\\piege.test", "/\t/piege.test"]) {
    const response = await route().GET(new Request(`https://zabelie.test/inscription?next=${encodeURIComponent(next)}`));
    const target = new URL(response.headers.get("location")!);
    assert.equal(target.origin, "https://zabelie.test");
    assert.equal(target.searchParams.get("next"), "/", next);
  }
});

test("l'alias impose signup et ne relaie pas les autres paramètres", async () => {
  const response = await route().GET(new Request("https://zabelie.test/inscription?mode=signin&erreur=lien_expire&code=fixture"));
  assert.equal(response.headers.get("location"), "https://zabelie.test/connexion?mode=signup");
});
