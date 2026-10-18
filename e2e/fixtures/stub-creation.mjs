// Studio de création éditoriale — faux Supabase isolé (docs/70, tâches 2.3 à 3.3, tableau T.2 à T.4).
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
let operations = new Map();
let revisions = new Map();
// Opportunités (0143) : un jeu de TEST, au format exact de la fonction ; `/__opportunites?mode=vide` le vide.
const OPPORTUNITES = {
  jours: 30,
  seuils: { personnes: 5, ventes: 3, vendeurs: 2 },
  recherches: [
    { terme: "aprann angle", personnes: 23 },
    { terme: "fe yon cv", personnes: 14 },
    { terme: "komanse yon biznis", personnes: 9 },
  ],
  ventes: [
    { rayon_ht: "Pwodwi dijital", rayon_fr: "Produits digitaux", rayon_en: "Digital products", rayon_es: "Productos digitales", ventes: 12 },
    { rayon_ht: "E-book", rayon_fr: "E-books", rayon_en: "E-books", rayon_es: "E-books", ventes: 7 },
  ],
};
let opportunitesVides = false;
// Ventes digitales (phase T2, accueil façon Chariow) : un jeu de TEST au format de la lecture de
// `lib/digital-authoring/ventes.ts` (commande, produit joint, crédits du grand livre). Dates relatives
// à maintenant, pour que « 7 derniers jours » tienne quel que soit le jour du test.
// `/__ventes?mode=pleines|aucune|erreur` ; « aucune » par défaut, comme un vendeur qui débute.
let ventesMode = "aucune";
const JOUR = 24 * 60 * 60 * 1000;
const PRODUITS_VENDUS = [
  { id: "11400000-0000-4000-8000-0000000000a1", title: "Lanse yon biznis sou entènèt", price_htg: 1500, cover_url: null, slug: "lanse-yon-biznis", net: 1425, ventes: [[1, "b1"], [2, "b2"], [4, "b3"], [12, "b4"], [30, "b1"]] },
  { id: "11400000-0000-4000-8000-0000000000a2", title: "Resèt lakay Okap", price_htg: 750, cover_url: null, slug: "reset-lakay-okap", net: 712, ventes: [[3, "b5"], [9, "b2"], [20, "b6"]] },
  { id: "11400000-0000-4000-8000-0000000000a3", title: "Aprann angle an 30 jou", price_htg: 1000, cover_url: null, slug: "aprann-angle", net: 950, ventes: [[6, "b7"], [40, "b8"]] },
];
function lignesVentes() {
  const maintenant = Date.now();
  return PRODUITS_VENDUS.flatMap(({ net, ventes, ...product }) =>
    ventes.map(([jours, acheteur], i) => {
      const quand = new Date(maintenant - jours * JOUR).toISOString();
      return { id: `${product.id.slice(0, -2)}${i}${jours}`, buyer_id: acheteur, product,
        wallet_transactions: [{ amount_htg: net, type: "credit", created_at: quand }] };
    }));
}

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
  if (u.pathname === "/__reset") { projets = new Map(); operations = new Map(); revisions = new Map(); opportunitesVides = false; ventesMode = "aucune"; return send({ ok: true }); }
  if (u.pathname === "/__ventes") { ventesMode = ["pleines", "aucune", "erreur"].includes(u.searchParams.get("mode")) ? u.searchParams.get("mode") : "aucune"; return send({ ok: true }); }
  if (u.pathname === "/__opportunites") { opportunitesVides = u.searchParams.get("mode") === "vide"; return send({ ok: true }); }
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

  // ── Opérations d'IA (0142) : rejeu par clé, instantané figé, bail à jeton ──
  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_demander") {
    const b = await body();
    const p = projets.get(b.p_projet);
    if (!moi || !p || p.seller_id !== moi) return send({ code: "42501", message: "authoring_projet_introuvable" }, 403);
    if (b.p_type !== "plan" && !p.plan_approuve_revision) return send({ code: "P0001", message: "authoring_plan_non_approuve" }, 400);
    const cleRev = `${p.id}:${p.revision}`;
    if (!revisions.has(cleRev)) revisions.set(cleRev, { id: randomUUID(), numero: p.revision, titre: p.titre, langue: p.langue, public_vise: p.public_vise, marche_diaspora: p.marche_diaspora, brief: structuredClone(p.brief), contenu: structuredClone(p.contenu) });
    const rev = revisions.get(cleRev);
    const existante = [...operations.values()].find((o) => o.seller_id === moi && o.idempotency_key === b.p_cle);
    if (existante) return single([existante]);
    const o = { id: randomUUID(), seller_id: moi, project_id: p.id, revision_id: rev.id, type: b.p_type, section_id: b.p_section, idempotency_key: b.p_cle,
      etat: "queued", fournisseur: null, bail_jeton: null, soumis_le: null, resultat: null, code_erreur: null, created_at: new Date().toISOString() };
    operations.set(o.id, o);
    return single([o]);
  }
  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_prendre_bail") {
    const b = await body();
    const o = operations.get(b.p_operation);
    if (!o || o.etat !== "queued") return send([]);
    Object.assign(o, { etat: "running", bail_jeton: b.p_jeton });
    return send([o]);
  }
  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_marquer_soumis") {
    const b = await body();
    const o = operations.get(b.p_operation);
    if (!o || o.bail_jeton !== b.p_jeton || o.etat !== "running" || o.soumis_le) return send(false);
    Object.assign(o, { soumis_le: new Date().toISOString(), fournisseur: b.p_fournisseur });
    return send(true);
  }
  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_conclure") {
    const b = await body();
    const o = operations.get(b.p_operation);
    if (!o || o.bail_jeton !== b.p_jeton || o.etat !== "running") return send(false);
    Object.assign(o, { etat: b.p_etat, resultat: b.p_resultat, code_erreur: b.p_code, bail_jeton: null });
    return send(true);
  }
  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_annuler") {
    const b = await body();
    const o = operations.get(b.p_operation);
    if (!o || o.seller_id !== moi || o.etat !== "queued") return send({ code: "P0001", message: "authoring_operation_non_annulable" }, 400);
    Object.assign(o, { etat: "cancelled", code_erreur: "annule_par_vendeur" });
    return send("cancelled");
  }
  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_quota") {
    const utilisees = [...operations.values()].filter((o) => o.seller_id === moi && !(["cancelled", "failed"].includes(o.etat) && !o.soumis_le)).length;
    return single([{ utilisees, maximum: 10 }]);
  }
  if (u.pathname === "/rest/v1/zabelie_authoring_operations") {
    const numero = (o) => [...revisions.values()].find((r) => r.id === o.revision_id)?.numero ?? null;
    const lignes = [...operations.values()]
      .filter((o) => o.seller_id === moi && (!eq("id") || o.id === eq("id")) && (!eq("project_id") || o.project_id === eq("project_id")))
      // Le vendeur ne lit jamais le jeton de bail (0142).
      .map((o) => { const copie = { ...o, revision: { numero: numero(o) } }; delete copie.bail_jeton; return copie; });
    return single(lignes);
  }
  if (u.pathname === "/rest/v1/zabelie_authoring_revisions") {
    return single([...revisions.values()].filter((r) => r.id === eq("id")));
  }

  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_opportunites") {
    if (!moi) return send({ code: "42501", message: "permission denied" }, 401);
    return send(opportunitesVides ? { ...OPPORTUNITES, recherches: [], ventes: [] } : OPPORTUNITES);
  }

  // Ventes digitales : RLS simulée (le vendeur seulement), lecture ratée possible.
  if (u.pathname === "/rest/v1/orders") {
    if (ventesMode === "erreur") return send({ code: "XX000", message: "lecture impossible (jeu de test)" }, 500);
    return send(ventesMode === "pleines" && moi === ids.seller ? lignesVentes() : []);
  }
  if (u.pathname === "/rest/v1/products" && req.method === "HEAD") {
    const n = ventesMode === "pleines" && moi === ids.seller ? PRODUITS_VENDUS.length : 0;
    res.writeHead(200, { "content-type": "application/json", "content-range": `*/${n}` });
    return res.end();
  }

  if (u.pathname.startsWith("/rest/v1/rpc/")) return send([]);
  if (u.pathname.startsWith("/rest/v1/")) return single([]);
  return send({ message: "inconnu" }, 404);
});

server.listen(port, "127.0.0.1");
