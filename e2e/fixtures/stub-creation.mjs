// Studio de création éditoriale — faux Supabase isolé (docs/70, tâches 2.3 à 4.3, tableau T.2 à T.4).
// Aucune clé réelle, écoute en boucle locale seulement. Il reproduit ce que la
// base garantit et que l'écran doit montrer : un vendeur ne voit que ses
// projets (RLS), la sauvegarde compare la révision, un projet archivé ne se
// modifie plus, l'approbation porte sur une révision exacte.
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { jointureAmbigue, REFUS_PGRST201, tableDe } from "./jointures-postgrest.mjs";

const port = Number(process.env.STUB_PORT || 15431);
const appPort = Number(process.env.APP_PORT || 3011);
const ids = {
  seller: "11400000-0000-4000-8000-000000000001",
  other: "11400000-0000-4000-8000-000000000002",
  // Modération (« mise en ligne ») : un administrateur avec double authentification
  // vérifiée, et un sans, comme le compte du porteur en production le 2026-10-18.
  admin: "11400000-0000-4000-8000-000000000003",
  adminSansMfa: "11400000-0000-4000-8000-000000000004",
};
const ADMINS = new Set([ids.admin, ids.adminSansMfa]);
const CONFIG = { id: true, titre_max: 160, brief_max: 6000, sections_max: 12, section_max: 12000, total_max: 120000, projets_actifs_max: 10 };
const EDITORIAUX = ["titre", "langue", "public_vise", "marche_diaspora", "brief", "contenu", "derniere_sauvegarde"];
let projets = new Map();
let operations = new Map();
let revisions = new Map();
// Export PDF (0147) : les lignes, et les objets du bucket privé (octets réels déposés par la route).
let exportsPdf = new Map();
let objets = new Map();
const BUCKET_EXPORTS = "authoring-exports";
// « Soumettre à la revue » (0148) : fiches, lignes de livrables et objets du bucket des fichiers vendus.
let produits = new Map();
let livrables = new Map();
let fichiers = new Map();
// Atelier numérique pré-rempli (5.3) : une ligne par fiche et par table, jamais écrasée.
let ateliers = new Map();
const BUCKET_FICHIERS = "product-files";
// Taxonomie (zabelie_categories) : un département et un sous-rayon, au format des colonnes lues.
const CATEGORIES = [
  { id: "11400000-0000-4000-8000-0000000000c1", slug: "edikasyon", parent_id: null, level: 1, position: 1, active: true,
    label_fr: "Éducation", label_kr: "Edikasyon", label_en: "Education", label_es: "Educación" },
  { id: "11400000-0000-4000-8000-0000000000c2", slug: "gid-pratik", parent_id: "11400000-0000-4000-8000-0000000000c1", level: 2, position: 1, active: true,
    label_fr: "Guides pratiques", label_kr: "Gid pratik", label_en: "Practical guides", label_es: "Guías prácticas" },
];
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
  const aal = role === "admin" ? { aal: "aal2", amr: [{ method: "totp", timestamp: 1700000000 }] } : { aal: "aal1" };
  return `${b({ alg: "HS256", typ: "JWT" })}.${b({ sub: ids[role], ...aal, exp: 4102444800, iat: 1700000000, role: "authenticated" })}.fixture`;
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

  // Une jointure commandes → produits sans clé nommée : refusée comme en production (0111).
  if (jointureAmbigue(tableDe(u.pathname), u.searchParams.get("select"))) return send(REFUS_PGRST201, 300);
  if (u.pathname === "/__health") return send({ ok: true });
  if (u.pathname === "/__reset") {
    projets = new Map(); operations = new Map(); revisions = new Map(); exportsPdf = new Map(); objets = new Map();
    produits = new Map(); livrables = new Map(); fichiers = new Map(); ateliers = new Map(); opportunitesVides = false; ventesMode = "aucune";
    return send({ ok: true });
  }
  if (u.pathname === "/__objets") return send([...objets.keys()]);
  if (u.pathname === "/__fiches") {
    return send({ produits: [...produits.values()], livrables: [...livrables.values()], ateliers: Object.fromEntries(ateliers),
      fichiers: [...fichiers.entries()].map(([chemin, octets]) => ({ chemin, empreinte: createHash("sha256").update(octets).digest("hex") })) });
  }
  // La modération, simulée : met en vente toutes les fiches du jeu de test.
  if (u.pathname === "/__publier") { for (const p of produits.values()) p.status = "published"; return send({ ok: true }); }
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
    // Seul `admin` a un facteur vérifié : `adminSansMfa` reproduit le compte sans double authentification.
    const factors = role === "admin" ? [{ id: "facteur-admin", status: "verified", factor_type: "totp", friendly_name: "test", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }] : [];
    return send({ id: moi, aud: "authenticated", role: "authenticated", email: `${role}@example.ht`, app_metadata: {}, user_metadata: {}, factors, created_at: "2026-01-01T00:00:00Z" });
  }
  if (u.pathname.startsWith("/auth/v1/")) return send({});

  if (u.pathname === "/rest/v1/profiles") {
    const id = eq("id") || moi;
    return single([{ id, display_name: ADMINS.has(id) ? "Admin Tès" : "Vandè Tès", role: ADMINS.has(id) ? "admin" : "creator", tier: "standard", suspended_at: null, suspended_reason: null }]);
  }
  if (u.pathname === "/rest/v1/zabelie_policy_acceptances") {
    return send([{ policy_version: "cgu-v1" }, { policy_version: "confidentialite-v6" }]);
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
      revision_approuvee: null, revision_approuvee_le: null, created_at: maintenant, updated_at: maintenant, archived_at: null };
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
  // Approbation du guide (0146) : mêmes refus que la fonction SQL, dans le même ordre.
  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_approuver_revision") {
    const b = await body();
    if (b.p_responsabilite !== true) return send({ code: "22023", message: "authoring_responsabilite_requise" }, 400);
    const p = projets.get(b.p_projet);
    if (!p || p.seller_id !== moi) return send({ code: "42501", message: "authoring_projet_introuvable" }, 403);
    if (p.archived_at) return send({ code: "P0001", message: "authoring_projet_archive" }, 400);
    if (p.revision !== b.p_revision) return send({ code: "40001", message: "authoring_revision_perimee" }, 409);
    if (!p.plan_approuve_revision) return send({ code: "P0001", message: "authoring_guide_sans_plan" }, 400);
    const s = p.contenu.sections;
    if (!s.length || s.some((x) => !String(x.titre ?? "").trim() || !String(x.corps ?? "").trim())) {
      return send({ code: "P0001", message: "authoring_guide_incomplet" }, 400);
    }
    const texte = JSON.stringify(p.contenu);
    if (texte.includes("[SIMULASYON]") || texte.includes("[SIMULATION]")) return send({ code: "P0001", message: "authoring_marqueur_simulation" }, 400);
    p.revision_approuvee = b.p_revision;
    p.revision_approuvee_le = new Date().toISOString();
    return send(b.p_revision);
  }
  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_archiver") {
    const b = await body();
    const p = projets.get(b.p_projet);
    if (!p || p.seller_id !== moi || p.archived_at) return send({ code: "42501", message: "authoring_projet_introuvable" }, 403);
    p.archived_at = new Date().toISOString();
    return send(p.archived_at);
  }
  // Suppression d'un projet archivé (0149) : vérifier rend les chemins, exécuter supprime en cascade.
  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_supprimer_projet") {
    const b = await body();
    const p = projets.get(b.p_projet);
    if (!moi || !p || p.seller_id !== moi) return send({ code: "42501", message: "authoring_projet_introuvable" }, 403);
    if (!p.archived_at) return send({ code: "P0001", message: "authoring_archive_requis" }, 400);
    const jour = Date.now() - 24 * 60 * 60 * 1000;
    const servi = [...operations.values()].some((o) => o.project_id === p.id && (["queued", "running"].includes(o.etat)
      || (Date.parse(o.created_at) >= jour && !(["cancelled", "failed"].includes(o.etat) && !o.soumis_le))));
    if (servi) return send({ code: "P0001", message: "authoring_suppression_demain" }, 400);
    const lignes = [...exportsPdf.values()].filter((e) => e.project_id === p.id).flatMap((e) => [{ chemin: e.chemin }, { chemin: e.extrait_chemin }]);
    if (b.p_executer) {
      projets.delete(p.id);
      for (const [k, e] of exportsPdf) if (e.project_id === p.id) exportsPdf.delete(k);
      for (const [k, o] of operations) if (o.project_id === p.id) operations.delete(k);
      for (const x of produits.values()) if (x.zabelie_authoring_project_id === p.id) x.zabelie_authoring_project_id = null;
    }
    return send(lignes);
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

  // ── Export PDF (0147) : bucket privé, enregistrement par le service role seul ──
  const prefixeObjet = `/storage/v1/object/${BUCKET_EXPORTS}/`;
  const prefixeSigne = `/storage/v1/object/sign/${BUCKET_EXPORTS}/`;
  if (u.pathname.startsWith(prefixeObjet) && req.method === "POST") {
    if (role !== "service") return send({ message: "bucket prive : service role seulement" }, 403);
    const morceaux = [];
    for await (const c of req) morceaux.push(c);
    const octets = Buffer.concat(morceaux);
    if (req.headers["content-type"] !== "application/pdf") return send({ message: "type refuse" }, 415);
    const chemin = decodeURIComponent(u.pathname.slice(prefixeObjet.length));
    objets.set(chemin, octets);
    return send({ Key: `${BUCKET_EXPORTS}/${chemin}`, Id: randomUUID() });
  }
  // Retrait d'objets (suppression d'un projet) : le service role seul.
  if (u.pathname === `/storage/v1/object/${BUCKET_EXPORTS}` && req.method === "DELETE") {
    if (role !== "service") return send({ message: "bucket prive : service role seulement" }, 403);
    const b = await body();
    return send((b.prefixes ?? []).filter((c) => objets.delete(c)).map((name) => ({ name })));
  }
  // Lecture des octets par le service role seul : la soumission recopie le PDF approuvé.
  if (u.pathname.startsWith(prefixeObjet) && req.method === "GET") {
    if (role !== "service") return send({ message: "bucket prive : service role seulement" }, 403);
    const octets = objets.get(decodeURIComponent(u.pathname.slice(prefixeObjet.length)));
    if (!octets) return send({ message: "objet absent" }, 404);
    res.writeHead(200, { "content-type": "application/pdf", "content-length": octets.length });
    return res.end(octets);
  }
  if (u.pathname.startsWith(prefixeSigne) && req.method === "POST") {
    if (role !== "service") return send({ message: "signature : service role seulement" }, 403);
    const chemin = decodeURIComponent(u.pathname.slice(prefixeSigne.length));
    if (!objets.has(chemin)) return send({ message: "objet absent" }, 404);
    return send({ signedURL: `/object/sign/${BUCKET_EXPORTS}/${encodeURI(chemin)}?token=jeton-${randomUUID()}` });
  }
  if (u.pathname.startsWith(prefixeSigne) && req.method === "GET") {
    const chemin = decodeURIComponent(u.pathname.slice(prefixeSigne.length));
    const octets = objets.get(chemin);
    if (!u.searchParams.get("token")?.startsWith("jeton-") || !octets) return send({ message: "lien invalide" }, 400);
    const entetes = { "content-type": "application/pdf", "content-length": octets.length };
    if (u.searchParams.has("download")) entetes["content-disposition"] = `attachment; filename="${u.searchParams.get("download") || "fichier.pdf"}"`;
    res.writeHead(200, entetes);
    return res.end(octets);
  }
  if (u.pathname === "/rest/v1/zabelie_authoring_exports") {
    const lignes = [...exportsPdf.values()]
      .filter((e) => e.seller_id === moi && (!eq("id") || e.id === eq("id")) && (!eq("project_id") || e.project_id === eq("project_id")))
      .toSorted((a, b) => b.created_at.localeCompare(a.created_at));
    return single(lignes);
  }
  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_enregistrer_export") {
    if (role !== "service") return send({ code: "42501", message: "permission denied for function" }, 403);
    const b = await body();
    const p = projets.get(b.p_projet);
    if (!p || p.seller_id !== b.p_seller) return send({ code: "42501", message: "authoring_projet_introuvable" }, 403);
    if (p.archived_at) return send({ code: "P0001", message: "authoring_projet_archive" }, 400);
    if (p.revision !== b.p_revision) return send({ code: "40001", message: "authoring_revision_perimee" }, 409);
    if (p.revision_approuvee !== b.p_revision) return send({ code: "P0001", message: "authoring_guide_non_approuve" }, 400);
    const base = `${b.p_seller}/${b.p_projet}/`;
    const existant = [...exportsPdf.values()].find((e) => e.project_id === b.p_projet && e.revision === b.p_revision && e.empreinte === b.p_empreinte);
    if (existant) return single([existant]);
    const e = {
      id: randomUUID(), project_id: b.p_projet, seller_id: b.p_seller, revision: b.p_revision, moteur: b.p_moteur,
      chemin: `${base}${b.p_empreinte}.pdf`, empreinte: b.p_empreinte, taille: b.p_taille, pages: b.p_pages,
      extrait_chemin: `${base}${b.p_extrait_empreinte}-extrait.pdf`, extrait_empreinte: b.p_extrait_empreinte,
      extrait_taille: b.p_extrait_taille, extrait_pages: b.p_extrait_pages,
      created_at: new Date().toISOString(), approuve_le: null, approuve_empreinte: null,
    };
    exportsPdf.set(e.id, e);
    return single([e]);
  }
  if (u.pathname === "/rest/v1/rpc/zabelie_authoring_approuver_export") {
    const b = await body();
    const e = exportsPdf.get(b.p_export);
    if (!e || e.seller_id !== moi) return send({ code: "42501", message: "authoring_export_introuvable" }, 403);
    const p = projets.get(e.project_id);
    if (p.archived_at) return send({ code: "P0001", message: "authoring_projet_archive" }, 400);
    if (p.revision !== e.revision || p.revision_approuvee !== e.revision) return send({ code: "40001", message: "authoring_export_perime" }, 409);
    if (b.p_empreinte !== e.empreinte) return send({ code: "22023", message: "authoring_empreinte_differente" }, 400);
    if (!e.approuve_le) { e.approuve_le = new Date().toISOString(); e.approuve_empreinte = b.p_empreinte; }
    return send(e.approuve_le);
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

  // ── « Soumettre à la revue » (0148) ─────────────────────────────────────────
  // Comme la base : écriture des fiches par le service role seul (0024), le
  // vendeur ne lit que les siennes (RLS), un projet mène à UNE fiche (index
  // unique partiel), et jamais au projet d'un autre vendeur (garde).
  if (u.pathname === "/rest/v1/zabelie_categories") {
    const filtres = ["id", "slug", "level", "label_fr", "active"].filter((c) => u.searchParams.has(c));
    return send(CATEGORIES.filter((c) => filtres.every((k) => String(c[k]) === eq(k))));
  }
  if (u.pathname === "/rest/v1/products" && req.method === "POST") {
    if (role !== "service") return send({ code: "42501", message: "permission denied for table products" }, 403);
    const b = await body();
    const lien = b.zabelie_authoring_project_id ?? null;
    if (lien) {
      const p = projets.get(lien);
      if (!p || p.seller_id !== b.seller_id) return send({ code: "42501", message: "authoring_lien_autre_vendeur" }, 403);
      if ([...produits.values()].some((x) => x.zabelie_authoring_project_id === lien)) {
        return send({ code: "23505", message: 'duplicate key value violates unique constraint "products_zabelie_authoring_project_unique"' }, 409);
      }
    }
    // Les valeurs par défaut de la table (0001, 0040) : une fiche neuve est en stock, sans vente ni avis.
    const ligne = { in_stock: true, sales_count: 0, rating_count: 0, rating_sum: 0, cover_url: null, category_id: null,
      delivery_days: null, service_includes: null, ...b, id: randomUUID(), zabelie_authoring_project_id: lien, created_at: new Date().toISOString() };
    produits.set(ligne.id, ligne);
    return single([ligne]);
  }
  // Modération : seul le service role écrit (la route admin), comme 0024.
  if (u.pathname === "/rest/v1/products" && req.method === "PATCH") {
    if (role !== "service") return send({ code: "42501", message: "permission denied for table products" }, 403);
    const maj = await body();
    const cibles = [...produits.values()].filter((x) => x.id === eq("id"));
    for (const x of cibles) Object.assign(x, maj);
    return single(cibles);
  }
  if (u.pathname === "/rest/v1/products" && req.method === "GET") {
    const lien = eq("zabelie_authoring_project_id");
    // RLS : le public lit les fiches publiées, le vendeur les siennes, le service role tout.
    const lignes = [...produits.values()].filter((x) =>
      (role === "service" || x.seller_id === moi || x.status === "published")
      && (!lien || x.zabelie_authoring_project_id === lien)
      && ["id", "slug", "status", "kind", "category"].every((k) => !u.searchParams.has(k) || String(x[k]) === eq(k))
      && (!u.searchParams.has("in_stock") || String(x.in_stock) === eq("in_stock")))
      .map((x) => ({ ...x, seller: { display_name: ADMINS.has(x.seller_id) ? "Admin Tès" : "Vandè Tès" }, sous_rayon: null }));
    if (!objet()) {
      res.writeHead(200, { "content-type": "application/json", "content-range": lignes.length ? `0-${lignes.length - 1}/${lignes.length}` : "*/0" });
      return res.end(JSON.stringify(lignes));
    }
    return single(lignes);
  }
  if (u.pathname === "/rest/v1/product_assets") {
    if (role !== "service") return send({ code: "42501", message: "permission denied for table product_assets" }, 403);
    if (req.method === "POST") {
      const b = await body();
      if ([...livrables.values()].some((l) => l.storage_path === b.storage_path)) return send({ code: "23505", message: "duplicate key value" }, 409);
      const l = { ...b, id: randomUUID() };
      livrables.set(l.id, l);
      return send([l], 201);
    }
    if (req.method === "DELETE") {
      const retires = (u.searchParams.get("id") || "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean);
      for (const [k, l] of livrables) if (l.product_id === eq("product_id") && retires.includes(k)) livrables.delete(k);
      return send([]);
    }
    const lignesLivrables = [...livrables.values()].filter((l) =>
      (!eq("product_id") || l.product_id === eq("product_id")) && (!eq("storage_path") || l.storage_path === eq("storage_path")));
    // `count: "exact", head: true` (la garde « pas de fichier sans livrable ») : le compte dans l'en-tête.
    if (req.method === "HEAD") {
      res.writeHead(200, { "content-type": "application/json", "content-range": `*/${lignesLivrables.length}` });
      return res.end();
    }
    return single(lignesLivrables);
  }
  if ((u.pathname === "/rest/v1/zabelie_digital_details" || u.pathname === "/rest/v1/zabelie_digital_studio") && req.method === "POST") {
    if (role !== "service") return send({ code: "42501", message: "permission denied" }, 403);
    const b = await body();
    const cle = `${u.pathname.split("/").pop()}:${b.product_id}`;
    const produit = produits.get(b.product_id);
    if (!produit || produit.status !== "draft") return send({ code: "23514", message: "digital_details_draft_required" }, 400);
    // `ignoreDuplicates` : une ligne existante n'est jamais remplacée.
    if (!ateliers.has(cle) || !(req.headers.prefer || "").includes("ignore-duplicates")) ateliers.set(cle, b);
    return send([], 201);
  }
  const prefixeFichier = `/storage/v1/object/${BUCKET_FICHIERS}/`;
  if (u.pathname.startsWith(prefixeFichier) && req.method === "POST") {
    if (role !== "service") return send({ message: "bucket prive : service role seulement" }, 403);
    const morceaux = [];
    for await (const c of req) morceaux.push(c);
    const chemin = decodeURIComponent(u.pathname.slice(prefixeFichier.length));
    if (fichiers.has(chemin) && req.headers["x-upsert"] !== "true") return send({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }, 400);
    fichiers.set(chemin, Buffer.concat(morceaux));
    return send({ Key: `${BUCKET_FICHIERS}/${chemin}`, Id: randomUUID() });
  }
  if (u.pathname === `/storage/v1/object/list/${BUCKET_FICHIERS}` && req.method === "POST") {
    if (role !== "service") return send({ message: "bucket prive : service role seulement" }, 403);
    const b = await body();
    const dossier = `${String(b.prefix ?? "").replace(/\/$/, "")}/`;
    return send([...fichiers.entries()]
      .filter(([k]) => k.startsWith(dossier) && !k.slice(dossier.length).includes("/") && k.slice(dossier.length).includes(b.search ?? ""))
      .map(([k, octets]) => ({ name: k.slice(dossier.length), id: randomUUID(), metadata: { size: octets.length, mimetype: "application/pdf" } })));
  }

  if (u.pathname.startsWith("/rest/v1/rpc/")) return send([]);
  if (u.pathname.startsWith("/rest/v1/")) return single([]);
  return send({ message: "inconnu" }, 404);
});

server.listen(port, "127.0.0.1");
