// Serveur Auth de test en mémoire, lié uniquement à localhost. Aucun e-mail envoyé.
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
const id = "00000000-0000-0000-0000-00000000a001";
const user = { id, aud: "authenticated", role: "authenticated", email: "buyer@example.test", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { display_name: "Acheteur test" }, identities: [{ id, user_id: id, provider: "email" }], created_at: "2026-01-01T00:00:00Z" };
const b64 = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
function session() {
  const payload = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: id, role: "authenticated", aud: "authenticated", aal: "aal1", exp: Math.floor(Date.now()/1000)+3600 })}`;
  const token = `${payload}.${createHmac("sha256", "test-only-not-a-production-secret").update(payload).digest("base64url")}`;
  return { access_token: token, refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, user };
}
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:54323");
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3003");
  res.setHeader("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info,x-supabase-api-version");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  const reply = (body, status=200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if(req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if(url.pathname === "/__health") return reply({ ok: true });
  let data={};
  if(req.method === "POST" || req.method === "PUT") {
    let raw=""; for await (const chunk of req) raw+=chunk;
    try { data=JSON.parse(raw || "{}"); } catch { return reply({ code: "bad_json" },400); }
  }
  if(url.pathname === "/auth/v1/token") {
    if(data.email !== "buyer@example.test" || data.password !== "Valid-test-123!") return reply({ code: "invalid_credentials", msg: "Invalid login credentials" },400);
    return reply(session());
  }
  if(url.pathname === "/auth/v1/signup") {
    if(data.email === "existing@example.test") return reply({ code: "user_already_exists", msg: "User already registered" },422);
    return reply({ ...user, email: data.email, user_metadata: data.data });
  }
  if(url.pathname === "/auth/v1/user") return req.headers.authorization?.startsWith("Bearer eyJ") ? reply(user) : reply({ code: "bad_jwt" },401);
  if(url.pathname === "/auth/v1/logout" || url.pathname === "/auth/v1/recover") return reply({});
  if(url.pathname === "/rest/v1/profiles") return reply({ id, role:"buyer", display_name:"Acheteur test", tier:"standard", is_test:false });
  if(url.pathname.startsWith("/rest/v1/")) { res.setHeader("Content-Range","*/0"); return reply([]); }
  return reply({ code:"not_found" },404);
}).listen(54323,"127.0.0.1",()=>console.log("Auth stub local :54323"));
