// Serveur Auth de test en mémoire, lié uniquement à localhost. Aucun e-mail envoyé.
import { createServer } from "node:http";
import { createHash, createHmac } from "node:crypto";
const actors = {
  a: { id: "00000000-0000-0000-0000-00000000a001", email: "buyer@example.test", name: "Acheteur test" },
  b: { id: "00000000-0000-0000-0000-00000000b002", email: "other@example.test", name: "Autre compte test" },
};
const userFor = (actor) => ({ id: actor.id, aud: "authenticated", role: "authenticated", email: actor.email, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { display_name: actor.name }, identities: [{ id: actor.id, user_id: actor.id, provider: "email" }], created_at: "2026-01-01T00:00:00Z" });
const b64 = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const signature = (payload) => createHmac("sha256", "test-only-not-a-production-secret").update(payload).digest("base64url");
function session(actor = actors.a) {
  const payload = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: actor.id, role: "authenticated", aud: "authenticated", aal: "aal1", exp: Math.floor(Date.now()/1000)+3600 })}`;
  const token = `${payload}.${signature(payload)}`;
  return { access_token: token, refresh_token: `test-refresh-${actor === actors.b ? "b" : "a"}`, token_type: "bearer", expires_in: 3600, user: userFor(actor) };
}
function actorForBearer(header) {
  try {
    const [head, body, signed] = String(header ?? "").replace(/^Bearer /, "").split(".");
    if (!head || !body || signed !== signature(`${head}.${body}`)) return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString());
    if (claims.exp <= Math.floor(Date.now()/1000)) return null;
    return Object.values(actors).find(actor => actor.id === claims.sub) ?? null;
  } catch { return null; }
}
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:15423");
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3003");
  res.setHeader("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info,x-supabase-api-version");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  const reply = (body, status=200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if(req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if(url.pathname === "/__health") return reply({ ok: true });
  // Fixtures locales pures : aucun état de session partagé entre tests.
  if(url.pathname === "/__session") return actors[url.searchParams.get("account")] ? reply(session(actors[url.searchParams.get("account")])) : reply({ code:"unknown_fixture" },400);
  let data={};
  if(req.method === "POST" || req.method === "PUT") {
    let raw=""; for await (const chunk of req) raw+=chunk;
    try { data=JSON.parse(raw || "{}"); } catch { return reply({ code: "bad_json" },400); }
  }
  if(url.pathname === "/auth/v1/token") {
    if(url.searchParams.get("grant_type") === "pkce") {
      const match = /^(recovery|expired)-([ab])\.([A-Za-z0-9_-]{43})$/.exec(String(data.auth_code ?? ""));
      if (!match || match[1] === "expired") return reply({ code: "otp_expired", msg: "Recovery code expired" },400);
      const challenge = createHash("sha256").update(String(data.code_verifier ?? "")).digest("base64url");
      if (!data.code_verifier || challenge !== match[3]) return reply({ code: "bad_code_verifier", msg: "PKCE verifier mismatch" },400);
      return reply(session(actors[match[2]]));
    }
    if(url.searchParams.get("grant_type") === "refresh_token") {
      const account = /^test-refresh-([ab])$/.exec(String(data.refresh_token ?? ""))?.[1];
      return account ? reply(session(actors[account])) : reply({ code: "refresh_token_not_found" },400);
    }
    const actor = Object.values(actors).find(actor => actor.email === data.email);
    if(!actor || data.password !== "Valid-test-123!") return reply({ code: "invalid_credentials", msg: "Invalid login credentials" },400);
    return reply(session(actor));
  }
  if(url.pathname === "/auth/v1/signup") {
    if(data.email === "existing@example.test") return reply({ code: "user_already_exists", msg: "User already registered" },422);
    return reply({ ...userFor(actors.a), email: data.email, user_metadata: data.data });
  }
  if(url.pathname === "/auth/v1/user") {
    const actor = actorForBearer(req.headers.authorization);
    return actor ? reply(userFor(actor)) : reply({ code: "bad_jwt" },401);
  }
  if(url.pathname === "/auth/v1/logout" || url.pathname === "/auth/v1/recover") return reply({});
  if(url.pathname === "/rest/v1/profiles") {
    const actor = Object.values(actors).find(actor => url.searchParams.get("id") === `eq.${actor.id}`) ?? actorForBearer(req.headers.authorization) ?? actors.a;
    return reply({ id: actor.id, role:"buyer", display_name:actor.name, tier:"standard", is_test:false });
  }
  if(url.pathname.startsWith("/rest/v1/")) { res.setHeader("Content-Range","*/0"); return reply([]); }
  return reply({ code:"not_found" },404);
}).listen(15423,"127.0.0.1",()=>console.log("Auth stub local :15423"));
