import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAdminSession } from "../lib/admin-session";
import { jamaisCache } from "../lib/pwa-routes";

function fixture(overrides: { role?: string; level?: string | null; factors?: string[]; errorAt?: string; throwsAt?: string; anonymous?: boolean } = {}) {
  const calls: string[] = [];
  const error = (at: string) => {
    calls.push(at);
    if (overrides.throwsAt === at) throw new Error("network failure");
    return overrides.errorAt === at ? { message: "unavailable" } : null;
  };
  const client = {
    auth: {
      getSession: async () => ({ error: error("session"), data: { session: overrides.anonymous ? null : { access_token: "signed-token", user: { role: "admin", factors: [{ status: "verified" }] } } } }),
      getUser: async (token: string) => {
        assert.equal(token, "signed-token");
        return { error: error("identity"), data: { user: { id: "admin-id", email: "admin@example.test", factors: (overrides.factors ?? ["verified"]).map((status) => ({ status })) } } };
      },
      mfa: { getAuthenticatorAssuranceLevel: async (token: string) => {
        assert.equal(token, "signed-token");
        return { error: error("assurance"), data: { currentLevel: overrides.level === undefined ? "aal2" : overrides.level, nextLevel: "aal2" } };
      } },
    },
    from: (table: string) => {
      assert.equal(table, "profiles");
      return { select: () => ({ eq: (column: string, id: string) => {
        assert.equal(column, "id"); assert.equal(id, "admin-id");
        return { maybeSingle: async () => ({ error: error("profile"), data: { role: overrides.role ?? "admin", display_name: "Admin", tier: "standard" } }) };
      } }) };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

test("MFA : admin AAL2 et facteur encore actif autorisé", async () => {
  const { client } = fixture();
  assert.equal((await readAdminSession(client))?.id, "admin-id");
});

for (const [name, options] of Object.entries({
  anonymous: { anonymous: true }, passwordOnly: { level: "aal1" }, missingAssurance: { level: null },
  removedFactor: { factors: [] }, unverifiedFactor: { factors: ["unverified"] },
  buyerWithMfa: { role: "buyer" }, sellerWithMfa: { role: "seller" },
})) {
  test(`MFA : refus ${name}, même avec un cookie qui prétend être admin`, async () => {
    assert.equal(await readAdminSession(fixture(options).client), null);
  });
}
for (const at of ["session", "identity", "assurance", "profile"]) {
  test(`MFA : erreur et exception ${at} ferment l'accès`, async () => {
    assert.equal(await readAdminSession(fixture({ errorAt: at }).client), null);
    assert.equal(await readAdminSession(fixture({ throwsAt: at }).client), null);
  });
}
test("un JWT rejeté n'atteint aucune lecture du rôle en base", async () => {
  const { client, calls } = fixture({ errorAt: "identity" });
  assert.equal(await readAdminSession(client), null);
  assert.deepEqual(calls, ["session", "identity"]);
});

test("toutes les entrées admin utilisent le garde MFA, y compris les accès API directs", () => {
  const files = (root: string): string[] => readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)]);
  const routes = files("app/api/admin").filter((file) => file.endsWith("route.ts"));
  assert.ok(routes.length >= 17);
  for (const file of [...routes, ...files("app/admin").filter((file) => file.endsWith("page.tsx"))]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /getCurrentUser\(/, file);
    assert.match(source, /await getAdminUser\(\)|!\(await autoriserAdmin\(/, file);
  }
  assert.match(readFileSync("lib/admin-gate.ts", "utf8"), /const user = await getAdminUser\(\)/);
  assert.match(readFileSync("app/admin/layout.tsx", "utf8"), /if \(!\(await getAdminUser\(\)\)\) redirect\("\/securite"\)/);
  assert.ok(jamaisCache("/securite"));
});
