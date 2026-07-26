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
  buyer_id: BUYER_ID,
  product_id: PRODUCT_ID,
  status: "paid",
  amount_htg: 1500,
  created_at: "2026-07-20T10:00:00Z",
  product: { title: PRODUCT.title, slug: SLUG, kind: "physical" },
};

/** Écritures observées sur `orders` — la preuve que rien n'a été « livré ». */
const ecritures = [];

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

  if (url.pathname === "/cover.png") {
    const png = readFileSync(new URL("./cover.png", import.meta.url));
    res.writeHead(200, { "content-type": "image/png" });
    return res.end(png);
  }

  if (url.pathname === "/__ecritures") return send(200, ecritures);
  if (url.pathname === "/__sante") return send(200, { ok: true });

  // ── Auth ────────────────────────────────────────────────────────────────
  if (url.pathname.startsWith("/auth/v1/user")) {
    return send(200, {
      id: BUYER_ID,
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
    if (req.method !== "GET") {
      let body = "";
      req.on("data", (c) => (body += c));
      return req.on("end", () => {
        ecritures.push({ method: req.method, query: url.search, body });
        send(200, []);
      });
    }
    const id = eq(url, "id");
    const rows = id && id !== ORDER_ID ? [] : [ORDER];
    return single(rows);
  }

  if (url.pathname.startsWith("/rest/v1/products")) {
    const slug = eq(url, "slug");
    const id = eq(url, "id");
    const status = eq(url, "status");
    let rows = [PRODUCT];
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
