/**
 * Supabase simulé (PostgREST + Auth) pour le parcours PRODUIT PHYSIQUE.
 *
 * Pourquoi un stub et pas le mode démo : le mode démo n'a pas de base, donc
 * aucun produit `physical` — c'est précisément le trou que ces tests
 * comblent. Aucun `kind = 'physical'` n'avait jamais traversé le flux.
 *
 * Le produit est PUBLIÉ de force : depuis la décision « la saisie crée un
 * brouillon », un physique ne peut plus atteindre le checkout par le chemin
 * normal. Le fixture reproduit donc l'état qui existera après publication
 * explicite par le porteur — c'est celui qu'il faut tester.
 *
 * Le serveur enregistre toutes les ÉCRITURES sur `orders` : c'est ce qui
 * permet d'affirmer qu'une commande physique n'est jamais passée à
 * `delivered`. Les relire via GET /__ecritures.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.STUB_PORT ?? 54321);

export const BUYER_ID = "11111111-1111-1111-1111-111111111111";
export const SELLER_ID = "22222222-2222-2222-2222-222222222222";
export const ORDER_ID = "33333333-3333-3333-3333-333333333333";
export const PRODUCT_ID = "44444444-4444-4444-4444-444444444444";
export const SLUG = "filtre-huile-corolla";

const PRODUCT = {
  id: PRODUCT_ID,
  slug: SLUG,
  title: "Filtre à huile Corolla",
  description: "Filtre à huile pour Toyota Corolla.",
  kind: "physical",
  category: "Pièces détachées auto",
  price_htg: 1500,
  sales_count: 0,
  rating_count: 0,
  rating_sum: 0,
  seller_id: SELLER_ID,
  delivery_days: null,
  service_includes: null,
  cover_url: "http://127.0.0.1:54321/cover.png",
  status: "published",
  in_stock: true,
  seller: { display_name: "Garaj Petyonvil" },
};

const ORDER = {
  id: ORDER_ID,
  order_ref: "ZB-260720-TESTX",
  buyer_id: BUYER_ID,
  product_id: PRODUCT_ID,
  status: "paid",
  amount_htg: 1500,
  created_at: "2026-07-20T10:00:00Z",
  product: { title: PRODUCT.title, slug: SLUG, kind: "physical" },
};

/** Écritures observées sur `orders` — la preuve que rien n'a été « livré ». */
const ecritures = [];
const collectionsBySession = new Map();
const giftWrites = [];
const GIFT_PRODUCT = "99999999-9999-9999-9999-999999999990";
const GIFT_ORDER = "99999999-9999-9999-9999-999999999991";

const eq = (url, key) => {
  const v = url.searchParams.get(key);
  return v?.startsWith("eq.") ? decodeURIComponent(v.slice(3)) : null;
};

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const send = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const single = (rows) =>
    (req.headers.accept ?? "").includes("pgrst.object")
      ? rows.length
        ? send(200, rows[0])
        : send(406, { code: "PGRST116", message: "no rows" })
      : send(200, rows);

  // RPC : expiration des réservations. Renvoie 0 — le cas « rien à libérer »,
  // celui où le journal d'exécution est justement indispensable.
  if (url.pathname === "/rest/v1/rpc/zabelie_expire_stock_reservations") {
    return send(200, 0);
  }

  // Photo produit. `STUB_COVER` permet d'éprouver les cas de DÉFAILLANCE de la
  // carte de partage — la surface où un échec coûte le plus cher, puisque
  // WhatsApp fige l'aperçu obtenu :
  //   STUB_COVER=404   → stockage qui répond en erreur
  //   STUB_COVER=lent  → stockage qui traîne (8 s), au-delà du délai interne
  if (url.pathname === "/cover.png") {
    const servir = () => {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(readFileSync(new URL("./cover.png", import.meta.url)));
    };
    if (process.env.STUB_COVER === "404") {
      res.writeHead(404);
      return res.end();
    }
    if (process.env.STUB_COVER === "lent") return setTimeout(servir, 8000);
    return servir();
  }

  if (url.pathname === "/__ecritures") return send(200, ecritures);
  if (url.pathname === "/__sante") return send(200, { ok: true });

  const token = req.headers.authorization ?? "";
  // Isolated scenarios: no mutable global mode between parallel tests.
  const history = token.includes("historique-test");
  const historyError = token.includes("historique-erreur");
  const sellerPreparation = token.includes("vendeur-preparation");

  if (url.pathname === "/__gift-writes") return send(200, giftWrites);
  if (url.pathname === "/rest/v1/rpc/zabelie_boutik_public") return send(200, { id: SELLER_ID, display_name: "Garaj Petyonvil", bio: "Boutique de test", avatar_url: null, zone_id: null, pwen_repe: null, boutik_slug: null });
  if (["/rest/v1/zabelie_favorites", "/rest/v1/zabelie_shop_follows"].includes(url.pathname)) {
    const column = url.pathname.endsWith("zabelie_favorites") ? "product_id" : "seller_id";
    const key = token + column;
    if (!collectionsBySession.has(key)) collectionsBySession.set(key, new Set(token.includes("collections-list") ? [column === "product_id" ? PRODUCT_ID : SELLER_ID] : []));
    const saved = collectionsBySession.get(key);
    if (req.method === "POST") {
      let body = ""; req.on("data", c => body += c);
      return req.on("end", () => {
        if (token.includes("collections-fail")) return send(503, { code: "08006" });
        saved.add(JSON.parse(body)[column]); return send(201, []);
      });
    }
    const id = eq(url, column);
    if (req.method === "DELETE") { saved.delete(id); return send(200, []); }
    let rows = [...saved].filter(value => !id || value === id).map(value => ({ [column]: value, created_at: "2026-09-07T00:00:00Z" }));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    rows = rows.slice(offset, offset + Number(url.searchParams.get("limit") ?? 100));
    return single(rows);
  }
  if (url.pathname === "/rest/v1/zabelie_order_recipients" && req.method === "POST") {
    let body = ""; req.on("data", c => body += c);
    return req.on("end", () => { giftWrites.push({ step: "recipient", body: JSON.parse(body) }); send(503, { code: "08006" }); });
  }
  if (url.pathname === "/rest/v1/payments" && req.method === "POST") {
    let body = ""; req.on("data", c => body += c);
    return req.on("end", () => { if (JSON.parse(body).order_id === GIFT_ORDER) giftWrites.push({ step: "payment" }); send(201, []); });
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  if (url.pathname.startsWith("/auth/v1/user")) {
    return send(200, {
      id: sellerPreparation ? SELLER_ID : BUYER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "achte@example.ht",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    });
  }
  if (url.pathname.startsWith("/auth/v1/")) return send(200, {});

  // ── PostgREST ───────────────────────────────────────────────────────────
  if (url.pathname.startsWith("/rest/v1/orders")) {
    // STUB_DRIFT=0030 : rejoue le schéma de production AVANT 0042 — toute
    // sélection de `order_ref` répond 42703, comme le vrai PostgREST. C'est ce
    // qui permet d'ÉPROUVER la tolérance de dérive des surfaces (règle 3),
    // pas de la raisonner.
    if (
      process.env.STUB_DRIFT === "0030" &&
      (url.searchParams.get("select") ?? "").includes("order_ref")
    ) {
      return send(400, {
        code: "42703",
        details: null,
        hint: null,
        message: "column orders.order_ref does not exist",
      });
    }
    if (req.method !== "GET") {
      let body = "";
      req.on("data", (c) => (body += c));
      return req.on("end", () => {
        if (req.method === "POST" && JSON.parse(body).product_id === GIFT_PRODUCT) {
          giftWrites.push({ step: "order" }); return send(201, { id: GIFT_ORDER, amount_htg: 1500 });
        }
        if (eq(url, "id") === GIFT_ORDER) { giftWrites.push({ step: "cleanup" }); return send(200, []); }
        ecritures.push({ method: req.method, query: url.search, body });
        send(200, []);
      });
    }
    const id = eq(url, "id");
    if (historyError) return send(503, { code: "08006", message: "test unavailable" });
    let rows = id && id !== ORDER_ID ? [] : [ORDER];
    if (history || id?.startsWith("88888888-8888-8888-8888-")) {
      const make = (n, title, kind, status) => ({ ...ORDER,
        id: `88888888-8888-8888-8888-${String(n).padStart(12, "0")}`,
        order_ref: `ZB-TEST-${n}`, status,
        product: title ? { title, kind, slug: SLUG } : null,
      });
      rows = [
        make(1, "Livre en attente", "fichier", "pending"),
        make(2, "Guide remboursé", "fichier", "refunded"),
        make(3, "Objet en litige", "physical", "disputed"),
        make(4, "Prestation confirmée", "service", "paid"),
        make(5, null, null, "cancelled"),
        ...Array.from({ length: 24 }, (_, i) => make(i + 6, `Guide acquis ${i + 1}`, "fichier", "paid")),
      ];
      const buyer = eq(url, "buyer_id");
      if (buyer && buyer !== BUYER_ID) rows = [];
      const kind = eq(url, "product.kind");
      if (kind) rows = rows.filter(row => row.product?.kind === kind);
      if (id) rows = rows.filter(row => row.id === id);
      // Respect filtering and pagination, like PostgREST (before rendering).
      const status = url.searchParams.get("status");
      if (status?.startsWith("in.(")) rows = rows.filter(row => status.slice(4, -1).split(",").includes(row.status));
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? rows.length);
      rows = rows.slice(offset, offset + limit);
    }
    return single(rows);
  }

  // Taxonomie de test : un département ouvert sans offres, trois niveaux,
  // et une feuille inactive que la lecture publique ne doit jamais exposer.
  if (url.pathname === "/rest/v1/zabelie_categories") {
    const make = (id, parent_id, level, slug, label_fr, active = true) => ({
      id, parent_id, level, slug, label_fr, active, position: 10,
      label_kr: label_fr, label_en: label_fr, label_es: label_fr,
    });
    let rows = [
      make("d1", null, 1, "mod-akseswa", "Mode & accessoires"),
      make("c1", "d1", 2, "rad-fanm", "Vêtements femme"),
      make("s1", "c1", 3, "wob", "Robes"),
      make("s2", "c1", 3, "foula", "Écharpes"),
      make("closed", "c1", 3, "ferme", "Rayon fermé", false),
    ].filter(row => row.active);
    for (const key of ["id", "parent_id", "slug", "level", "label_fr"]) {
      const value = eq(url, key);
      if (value !== null) rows = rows.filter(row => String(row[key]) === value);
    }
    const ids = url.searchParams.get("id");
    if (ids?.startsWith("in.(")) rows = rows.filter(row => ids.slice(4, -1).split(",").includes(row.id));
    return single(rows);
  }

  if (url.pathname.startsWith("/rest/v1/products")) {
    const slug = eq(url, "slug");
    const id = eq(url, "id");
    const status = eq(url, "status");
    let rows = sellerPreparation ? [
      { ...PRODUCT, id: "77777777-7777-7777-7777-777777777777", slug: "guide-test", title: "Guide vendeur test", kind: "fichier", status: "draft", product_assets: [], cover_url: null },
      { ...PRODUCT, id: "66666666-6666-6666-6666-666666666666", slug: "service-test", title: "Prestation vendeur test", kind: "service", status: "draft", product_assets: [], delivery_days: 0, service_includes: ["Une consultation"] },
    ] : [PRODUCT];
    if (id === GIFT_PRODUCT) return single([{ ...PRODUCT, id: GIFT_PRODUCT }]);
    if (slug && slug !== SLUG) rows = [];
    if (id && id !== PRODUCT_ID) rows = [];
    if (status && status !== PRODUCT.status) rows = [];
    return single(rows);
  }

  // Un produit physique n'a AUCUN livrable — c'est le cœur du sujet.
  if (url.pathname.startsWith("/rest/v1/product_assets")) return single([]);

  if (url.pathname.startsWith("/rest/v1/zabelie_product_variants")) {
    return send(200, [
      {
        id: "55555555-5555-5555-5555-555555555555",
        options: null,
        price_htg: 1500,
        position: 1,
        zabelie_stock: { quantity_available: 4 },
      },
    ]);
  }
  if (url.pathname.startsWith("/rest/v1/zabelie_product_fitment")) {
    return send(200, [
      {
        year_start: 2008,
        year_end: 2015,
        zabelie_vehicle_models: { kind: "auto", make: "Toyota", model: "Corolla" },
      },
    ]);
  }
  if (url.pathname.startsWith("/rest/v1/profiles")) {
    return single([{ id: SELLER_ID, display_name: "Garaj Petyonvil", role: "creator" }]);
  }

  return single([]);
});

server.listen(PORT, () => console.log(`stub Supabase sur :${PORT}`));
