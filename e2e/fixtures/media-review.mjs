/** Contrats d'E/S de la revue média, isolés par scénario. Ces effets simulés
 * servent la vraie UI et les vraies routes ; la preuve des triggers et des
 * courses SQL appartient aux tests PostgreSQL, jamais à cette doublure. */
import { readFileSync } from "node:fs";

export function createMediaReviewFixture({ baseProduct, sellerId }) {
  const names = ["add", "photo", "video", "cover", "confirm", "archived"];
  const states = new Map();
  const idFor = (name) => `f1520000-0000-4000-8000-${String(names.indexOf(name) + 1).padStart(12, "0")}`;
  const eq = (url, key) => {
    const value = url.searchParams.get(key);
    return value?.startsWith("eq.") ? value.slice(3) : null;
  };
  const reset = (name) => {
    const id = idFor(name);
    const initialKind = name === "video" ? "video" : "image";
    const media = ["photo", "video", "archived"].includes(name) ? [{
      id: `e1520000-0000-4000-8000-${String(names.indexOf(name) + 1).padStart(12, "0")}`,
      product_id: id, kind: initialKind, storage_path: `${id}/galerie/initial.${initialKind === "video" ? "mp4" : "png"}`, position: 0,
    }] : [];
    const state = {
      product: { ...baseProduct, id, seller_id: sellerId, slug: `media-review-${name}`, title: `Revue média ${name}`, status: name === "archived" ? "archived" : "published", product_assets: [] },
      media, uploads: [], signed: [], storageRemovals: 0, writes: 0,
    };
    states.set(name, state);
    return state;
  };
  names.forEach(reset);
  const stateForId = (id) => [...states.values()].find(s => s.product.id === id);
  const jsonBody = (req, done) => {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => done(JSON.parse(body || "{}")));
  };

  return (req, res, url, send, single) => {
    const control = /^\/__media-review\/([a-z]+)(\/reset)?$/.exec(url.pathname);
    if (control && names.includes(control[1])) {
      const state = control[2] && req.method === "POST" ? reset(control[1]) : states.get(control[1]);
      send(200, state); return true;
    }
    const scenario = /vendeur-preparation-media-([a-z]+)/.exec(req.headers.authorization ?? "")?.[1];
    if (url.pathname === "/rest/v1/rpc/zabelie_objets_requis") {
      send(200, ["zabelie_product_cover_review_guard()", "zabelie_product_cover_review", "zabelie_product_media_guard()", "zabelie_product_media_guard_trg"]
        .map(objet => ({ objet, present: true, pourquoi: "Fixture de contrat média ; validation des triggers dans la CI PostgreSQL" })));
      return true;
    }
    if (url.pathname === "/rest/v1/products") {
      const state = stateForId(eq(url, "id")) ?? [...states.values()].find(s => s.product.slug === eq(url, "slug")) ?? states.get(scenario);
      if (!state) return false;
      const p = state.product;
      const matches = (!eq(url, "seller_id") || eq(url, "seller_id") === p.seller_id)
        && (!eq(url, "status") || eq(url, "status") === p.status)
        && (url.searchParams.get("status") !== "neq.archived" || p.status !== "archived");
      if (req.method === "PATCH") {
        jsonBody(req, patch => {
          if (!matches) return single([]);
          Object.assign(p, patch); state.writes++;
          single([p]);
        });
      } else single(matches ? [p] : []);
      return true;
    }
    if (url.pathname === "/rest/v1/zabelie_product_media") {
      const state = stateForId(eq(url, "product_id"));
      if (req.method === "POST") {
        jsonBody(req, row => {
          const target = stateForId(row.product_id);
          if (!target) return send(400, { code: "23503" });
          const created = { ...row, id: crypto.randomUUID() };
          target.media.push(created); target.product.status = "draft"; target.writes++;
          single([created]);
        });
        return true;
      }
      if (!state) return false;
      const rows = state.media.filter(m => (!eq(url, "id") || m.id === eq(url, "id")) && (!eq(url, "kind") || m.kind === eq(url, "kind")));
      if (req.method === "DELETE") {
        state.media = state.media.filter(m => !rows.includes(m));
        if (rows.length) { state.product.status = "draft"; state.writes++; }
        single(rows);
      } else if (req.method === "HEAD") {
        res.writeHead(200, { "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` }); res.end();
      } else single(rows);
      return true;
    }
    const coverUpload = /^\/storage\/v1\/object\/product-covers\/(f1520000-[^/]+)\/(.+)$/.exec(url.pathname);
    if (coverUpload && stateForId(coverUpload[1])) {
      const state = stateForId(coverUpload[1]);
      state.uploads.push({ path: `${coverUpload[1]}/${coverUpload[2]}`, upsert: req.headers["x-upsert"] });
      req.resume(); send(200, { Key: `product-covers/${coverUpload[1]}/${coverUpload[2]}` }); return true;
    }
    const signed = /^\/storage\/v1\/object\/upload\/sign\/product-videos\/(f1520000-[^/]+)\/(.+)$/.exec(url.pathname);
    if (signed && stateForId(signed[1])) {
      const state = stateForId(signed[1]);
      state.signed.push(`${signed[1]}/${signed[2]}`);
      send(200, { url: `/object/upload/sign/product-videos/${signed[1]}/${signed[2]}?token=media-fixture` }); return true;
    }
    if (url.pathname === "/storage/v1/object/list/product-videos") {
      jsonBody(req, input => {
        const state = stateForId(input.prefix?.split("/")[0]);
        const path = `${input.prefix}/${input.search}`;
        send(200, state?.signed.includes(path) ? [{ name: input.search, metadata: { size: 1024, mimetype: "video/mp4" } }] : []);
      });
      return true;
    }
    if (url.pathname === "/storage/v1/object/product-covers" || url.pathname === "/storage/v1/object/product-videos") {
      jsonBody(req, input => {
        for (const path of input.prefixes ?? []) { const state = stateForId(path.split("/")[0]); if (state) state.storageRemovals++; }
        send(200, []);
      });
      return true;
    }
    if (url.pathname.startsWith("/storage/v1/object/public/product-covers/f1520000-")) {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(readFileSync(new URL("./cover.png", import.meta.url))); return true;
    }
    return false;
  };
}
