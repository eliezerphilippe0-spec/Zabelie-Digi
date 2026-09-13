import test from "node:test";
import assert from "node:assert/strict";
import { verifyPublicSecurity } from "../scripts/verifier-securite-publique.mjs";
function fixture(mode = "good") {
  let count = 0;
  return async (input: unknown) => {
    const url = input instanceof URL ? input : new URL(String(input));
    if (url.pathname !== "/") return new Response("{}", { status: mode === "public-admin" ? 200 : 401 });
    const nonce = "n".repeat(30) + (mode === "reused" ? "0" : ++count);
    return new Response('<script nonce="' + nonce + '"></script>', { headers: {
      "content-security-policy": mode === "weak" ? "frame-ancestors 'none'" : "script-src 'nonce-" + nonce + "' 'strict-dynamic'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    } });
  };
}
test("Post-deploy probe accepts strict public responses", async () => {
  assert.equal((await verifyPublicSecurity("https://zabelie.example", fixture())).ok, true);
});
for (const mode of ["weak", "reused", "public-admin"]) test("Post-deploy probe detects " + mode, async () => {
  await assert.rejects(verifyPublicSecurity("https://zabelie.example", fixture(mode)));
});
