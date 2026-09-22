import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyWithJev, readJevInput } from "../lib/jev";

const valid = { answers: { category: { type: "choice", choice: "paiement", confidence: 0.8 }, urgent: { type: "noul", noul: 0.7 } } };
const request = (body: string) => new Request("https://example.test/api/admin/jev", { method: "POST", body });

test("Jev uses the fixed HTTPS endpoint and only returns validated fields", async () => {
  const result = await classifyWithJev("Mwen peye men pwodwi a pa rive", "test-only-value", async (url, init) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-only-value");
    assert.ok(init?.signal);
    const payload = JSON.parse(init?.body as string);
    assert.equal(payload.model, "jev-latest");
    assert.equal(payload.state.untrusted_customer_message, "Mwen peye men pwodwi a pa rive");
    return Response.json({ ...valid, secret: "test-only-value" });
  });
  assert.deepEqual(result, { category: "paiement", confidence: 0.8, urgentProbability: 0.7, reviewRequired: true });
});

test("missing key and invalid input never call the provider", async () => {
  let calls = 0;
  const fake: typeof fetch = async () => { calls++; return Response.json(valid); };
  await assert.rejects(classifyWithJev("bonjour", "", fake));
  await assert.rejects(classifyWithJev("", "test", fake));
  await assert.rejects(classifyWithJev("x".repeat(4001), "test", fake));
  assert.equal(calls, 0);
});

test("provider failures and malformed answers never reveal provider data", async () => {
  for (const fake of [
    async () => new Response("secret echoed", { status: 401 }),
    async () => { throw new Error("secret echoed"); },
    async () => Response.json({ answers: {} }),
    async () => Response.json({ answers: { ...valid.answers, category: { ...valid.answers.category, choice: "release_funds" } } }),
    async () => Response.json({ answers: { ...valid.answers, urgent: { type: "noul", noul: 2 } } }),
  ]) {
    await assert.rejects(classifyWithJev("Bonjour", "test", fake), { message: "jev_unavailable" });
  }
});

test("input rejects oversized streams, unknown fields, null and invalid JSON", async () => {
  assert.deepEqual(await readJevInput(request('{"message":" Bonjou "}')), { message: "Bonjou" });
  for (const body of ["null", "{", '{"message":""}', '{"message":"hello","url":"https://evil.test"}', JSON.stringify({ message: "x".repeat(4001) }), " ".repeat(24001)]) {
    await assert.rejects(readJevInput(request(body)));
  }
});

test("entry point enforces MFA, origin, rate limits and server-only secret boundary", () => {
  const route = readFileSync("app/api/admin/jev/route.ts", "utf8");
  assert.match(route, /const user = await getAdminUser\(\)/);
  assert.match(route, /if \(!user \|\| user.role !== "admin"\) return/);
  assert.match(route, /get\("origin"\) !== new URL\(req.url\).origin/);
  assert.match(route, /!\(await rateLimit/);
  assert.ok(route.indexOf("getAdminUser()") < route.indexOf("await classifySupportMessage("));
  const server = readFileSync("lib/jev-server.ts", "utf8");
  assert.match(server, /^import "server-only"/);
  assert.doesNotMatch(server, /NEXT_PUBLIC_/);
  assert.match(server, /process.env.TYPESAFE_API_KEY/);
});
