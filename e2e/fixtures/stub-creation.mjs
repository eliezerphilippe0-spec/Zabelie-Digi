// Studio de création éditoriale — faux Supabase isolé (docs/70, tâches 2.3 à 2.5).
// Aucune clé réelle, écoute en boucle locale seulement. Il reproduit ce que la
// base garantit et que l'écran doit montrer : un vendeur ne voit que ses
// projets (RLS), la sauvegarde compare la révision, un projet archivé ne se
// modifie plus, l'approbation porte sur une révision exacte.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.STUB_PORT || 15431);
const appPort = Number(process.env.APP_PORT || 3011);
const ids = {
  seller: "11400000-0000-4000-8000-000000000001",
  other: "11400000-0000-4000-8000-000000000002",
};
const CONFIG = { id: true, titre_max: 160, brief_max: 6000, sections_max: 12, section_max: 12000, total_max: 120000, projets_actifs_max: 10 };
const EDITORIAUX = ["titre", "langue", "public_vise", "marche_diaspora", "brief", "contenu", "derniere_sauvegarde"];
let projets = new Map();

function token(role) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "HS256", typ: "JWT" })}.${b({ sub: ids[role], aal: "aal1", exp: 4102444800, iat: 1700000000, role: "authenticated" })}.fixture`;
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  const send = (data, code = 200) => {
    res.writeHead(code, { "content-type": "application/json", "content-range": "0-0/0" });
    res.end(JSON.stringify(data));
  };
  const objet = () => (req.headers.accept || "").includes("pgrst.object");
  const single = (rows) => (objet() ? send(rows[0] ?? null) : send(rows));
  const body = async () => {
    let s = "";
    for await (const c of req) s += c;
    return JSON.parse(s || "{}");
  };
  const eq = (cle) => u.searchParams.get(cle)?.replace(/^eq\./, "");
  const jwt = (req.headers.authorization || "").replace("Bearer ", "");
  const role = Object.keys(ids).find((r) => token(r) === jwt) ?? (jwt === "cle-service-de-test" ? "service" : "anon");
  const moi = ids[role];

  if (u.pathname === "/__health") return send({ ok: true });
  if (u.pathname === "/__reset") { projets = new Map(); return send({ ok: true }); }
  if (u.pathname === "/__login") {
    const qui = Object.keys(ids).includes(u.searchParams.get("role")) ? u.searchParams.get("role") : "seller";
    const session = { access_token: token(qui), refresh_token: "fixture", expires_at: 4102444800, expires_in: 3600, token_type: "bearer",
      user: { id: ids[qui], aud: "authenticated", role: "authenticated" } };
    const valeur = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
    const lang = ["ht", "fr", "en", "es"].includes(u.searchParams.get("lang")) ? u.searchParams.get("lang") : "fr";
    const suite = (u.searchParams.get("next") || "/tableau-de-bord/creation").replace(/^(?!\/)/, "/");
    res.writeHead(302, {
      "set-cookie": [`sb-127-auth-token=${valeur}; Path=/; SameSite=Lax`, `zabelie_lang=${lang}; Path=/; SameSite=Lax`],
      location: `http://127.0.0.1:${appPort}${suite}`,
    });
    return res.end();
  }

  if (u.pathname === "/auth/v1/user") {
    if (!moi) return send({ message: "invalid" }, 401);
    return send({ id: moi, aud: "authenticated", role: "authenticated", email: `${role}@example.ht`, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
  }
  if (u.pathname.startsWith("/auth/v1/")) return send({});

  if (u.pathname === "/rest/v1/profiles") {
    const id = eq("id") || moi;
    return single([{ id, display_name: "Vandè Tès", role: "creator", tier: "standard", suspended_at: null, suspended_reason: null }]);
  }
  if (u.pathname === "/rest/v1/zabelie_policy_acceptances") {
    return send([{ policy_version: "cgu-v1" }, { policy_version: "confidentialite-v3" }]);
  }
  if (u.pathname === "/rest/v1/rpc/zabelie_rate_limit") return send(true);
  if (u.pathname === "/rest/v1/zabelie_authoring_config") return single([CONFIG]);

  if (u.pathname === "/rest/v1/zabelie_authoring_projects") {
    // RLS simulée : le vendeur ne voit que les siens.
    const visibles = [...projets.values()].filter((p) => p.seller_id === moi && (!eq("id") || p.id === eq("id")));
    if (req.method === "PATCH") {
      const maj = await body();
      const attendue = Number(eq("revision"));
      const p = visibles[0];
      if (!p || p.archived_at || (eq("revision") && p.revision !== attendue)) return send([]);
      const avant = JSON.stringify(EDITORIAUX.map((k) => p[k]));
      for (const k of EDITORIAUX) if (k in maj) p[k] = maj[k];
      if (JSON.stringify(EDITORIAUX.map((k) => p[k])) !== avant) { p.revision += 1; p.updated_at = new Date().toISOString(); }
      return send([p]);
    }
    return single(visibles.toSorted((a, b) => b.updated_at.localeCompare(a.updated_at)));
  }
  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_creer_projet") {
    if (!moi) return send({ code: "42501", message: "authoring_connexion_requise" }, 401);
    const b = await body();
    const maintenant = new Date().toISOString();
    const p = { id: randomUUID(), seller_id: moi, titre: b.p_titre, langue: b.p_langue, public_vise: b.p_public, marche_diaspora: b.p_marche,
      brief: {}, contenu: { objectif: "", sections: [] }, revision: 1, derniere_sauvegarde: null, plan_approuve_revision: null,
      created_at: maintenant, updated_at: maintenant, archived_at: null };
    projets.set(p.id, p);
    return single([p]);
  }
  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_approuver_plan") {
    const b = await body();
    const p = projets.get(b.p_projet);
    if (!p || p.seller_id !== moi) return send({ code: "42501", message: "authoring_projet_introuvable" }, 403);
    if (p.revision !== b.p_revision) return send({ code: "40001", message: "authoring_revision_perimee" }, 409);
    if (!p.contenu.sections.length) return send({ code: "P0001", message: "authoring_plan_vide" }, 400);
    p.plan_approuve_revision = b.p_revision;
    return send(b.p_revision);
  }
  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_archiver") {
    const b = await body();
    const p = projets.get(b.p_projet);
    if (!p || p.seller_id !== moi || p.archived_at) return send({ code: "42501", message: "authoring_projet_introuvable" }, 403);
    p.archived_at = new Date().toISOString();
    return send(p.archived_at);
  }

  if (u.pathname.startsWith("/rest/v1/rpc/")) return send([]);
  if (u.pathname.startsWith("/rest/v1/")) return single([]);
  return send({ message: "inconnu" }, 404);
});

server.listen(port, "127.0.0.1");
