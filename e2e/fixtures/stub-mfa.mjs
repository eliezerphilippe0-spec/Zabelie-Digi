/** Auth local pour les tests MFA. Aucun compte ni secret de production.
 * Jetons signés et codes TOTP vérifiés par ce stub ; le navigateur ne décide
 * jamais de son rôle ni de ses facteurs actifs. Écoute uniquement en loopback.
 */
import { createServer } from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const users = new Map();
const challenges = new Map();
const signingKey = "fixture-only-never-use-in-production";
const secret = "JBSWY3DPEHPK3PXP";
const secretBytes = Buffer.from("48656c6c6f21deadbeef", "hex");
let writes = 0;
const nowCode = () => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", secretBytes).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
};
function tokenFor(id, aal) {
  const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ sub: id, aal, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url");
  const unsigned = `${head}.${body}`;
  return `${unsigned}.${createHmac("sha256", signingKey).update(unsigned).digest("base64url")}`;
}
function identify(token) {
  try {
    const [head, body, signature] = token.split(".");
    const actual = Buffer.from(signature, "base64url");
    const expected = createHmac("sha256", signingKey).update(`${head}.${body}`).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString());
    if (claims.exp <= Date.now()/1000) return null;
    return users.get(claims.sub) ?? null;
  } catch { return null; }
}
function authUser(record) {
  return { id: record.id, aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, factors: record.factors, created_at: "2026-01-01T00:00:00Z" };
}
function session(record, aal) {
  return { access_token: tokenFor(record.id, aal), token_type: "bearer", refresh_token: "fixture-refresh", expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user: authUser(record) };
}
const jsonBody = async (req) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
};
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const send = (status, value) => { res.writeHead(status, { "content-type": "application/json", "content-range": "*/0" }); res.end(JSON.stringify(value)); };
  if (url.pathname === "/__sante") return send(200, { ok: true });
  if (url.pathname === "/__code") return send(200, { code: nowCode() });
  if (url.pathname === "/__writes") return send(200, { writes });
  if (url.pathname === "/__setup" && req.method === "POST") {
    const config = await jsonBody(req);
    const record = { id: randomUUID(), role: config.role ?? "admin", factors: config.verified ? [{ id: randomUUID(), factor_type: "totp", friendly_name: "Test authenticator", status: "verified" }] : [], authError: config.authError ?? false };
    users.set(record.id, record);
    const value = session(record, config.aal ?? "aal1");
    if (config.forged) value.access_token += "invalid";
    // Le cookie peut prétendre un facteur actif ; Auth reste source de vérité.
    if (config.staleFactor) value.user.factors = [{ id: randomUUID(), status: "verified", factor_type: "totp" }];
    return send(200, { cookie: `base64-${Buffer.from(JSON.stringify(value)).toString("base64url")}` });
  }
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  const user = identify(token);
  if (url.pathname.startsWith("/auth/v1/")) {
    if (!user || user.authError) return send(401, { code: "bad_jwt", message: "Invalid JWT" });
    if (url.pathname === "/auth/v1/user") return send(200, authUser(user));
    if (url.pathname === "/auth/v1/factors" && req.method === "POST") {
      const body = await jsonBody(req);
      const factor = { id: randomUUID(), factor_type: "totp", friendly_name: body.friendly_name, status: "unverified" };
      user.factors.push(factor);
      return send(200, { ...factor, type: "totp", totp: { secret, uri: `otpauth://totp/fixture?secret=${secret}`, qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="white"/><text x="30" y="100" fill="black">TEST MFA</text></svg>' } });
    }
    const match = url.pathname.match(/^\/auth\/v1\/factors\/([^/]+)(?:\/(challenge|verify))?$/);
    const factor = user.factors.find((f) => f.id === match?.[1]);
    if (!factor) return send(404, { message: "Factor not found" });
    if (req.method === "DELETE") { user.factors = user.factors.filter((f) => f.id !== factor.id); return send(200, { id: factor.id }); }
    if (match[2] === "challenge") {
      const id = randomUUID(); challenges.set(id, factor.id);
      return send(200, { id, expires_at: Math.floor(Date.now()/1000)+300 });
    }
    if (match[2] === "verify") {
      const body = await jsonBody(req);
      if (challenges.get(body.challenge_id) !== factor.id || body.code !== nowCode()) return send(422, { code: "mfa_verification_failed", message: "Invalid code" });
      challenges.delete(body.challenge_id); factor.status = "verified";
      return send(200, session(user, "aal2"));
    }
    return send(404, {});
  }
  if (url.pathname === "/rest/v1/profiles" && user) return send(200, { role: user.role, display_name: "MFA fixture", tier: "standard" });
  if (url.pathname.startsWith("/rest/v1/")) {
    if (token === "cle-service-de-test" && req.method !== "GET" && req.method !== "HEAD") writes++;
    if (url.pathname.includes("/rpc/")) return send(200, 0);
    return send(200, []);
  }
  return send(404, {});
}).listen(54322, "127.0.0.1");
