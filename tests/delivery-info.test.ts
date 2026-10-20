import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGS, t, type Lang } from "../lib/i18n";
import { POLITIQUE } from "../lib/policy-privacy";
import { isMissingTable } from "../lib/product-media";
import { database, loadRoute } from "./helpers/route-harness";

/**
 * Coordonnées de livraison (V-5, docs/35) — le cœur est la RLS de 0076,
 * testée en SQL (L1-L3, CI). Ici : les invariants d'architecture que la
 * revue de code doit pouvoir tenir sans relire toute la pile.
 */

test("0076 : l'adresse ne vit PAS sur profiles (lecture publique) — table dédiée, 4 policies", () => {
  const sql = readFileSync("supabase/migrations/0076_delivery_info.sql", "utf8");
  assert.match(sql, /create table zabelie_delivery_info/);
  assert.ok(
    !/alter table profiles add column/.test(sql),
    "une adresse sur profiles serait publique"
  );
  // La règle porteur encodée en policy : commande PAYÉE, et rien d'autre.
  assert.match(sql, /o\.status = 'paid'/);
  assert.match(sql, /p\.seller_id = auth\.uid\(\)/);
});

test("route delivery-info : client de SESSION — jamais service-role (la RLS est le garde)", () => {
  const src = readFileSync("app/api/delivery-info/route.ts", "utf8");
  assert.ok(!/createAdminClient/.test(src), "le service-role contournerait la RLS 0076");
  assert.match(src, /\.upsert\(\{[\s\S]{0,80}user_id: user\.id/);
  assert.match(src, /isMissingTable\(error\)[\s\S]{0,300}status: 503/);
});

test("mes-ventes : lecture des coordonnées via le client de SESSION, jamais l'admin", () => {
  const src = readFileSync("app/mes-ventes/page.tsx", "utf8");
  assert.match(src, /from\("zabelie_delivery_info"\)/);
  assert.ok(
    !/createAdminClient/.test(src),
    "mes-ventes doit laisser la policy seller_read décider"
  );
  // Le bloc n'apparaît qu'au moment d'expédier.
  assert.match(src, /v\.status === "awaiting_shipment" &&[\s\S]{0,200}livParAcheteur/);
});

test("tableau de bord : le formulaire est masqué tant que 0076 n'est pas appliquée", () => {
  // Le bloc vit sur la page Compte depuis la refonte façon Chariow (docs/73).
  const src = readFileSync("app/tableau-de-bord/compte/page.tsx", "utf8");
  assert.match(src, /\{livInfo !== undefined && \(/);
  assert.match(src, /isMissingTable\(livErr\)/);
});

test("la politique de confidentialité décrit la collecte, dans les quatre langues", () => {
  const collecte: Record<Lang, { titre: string; gardes: RegExp[] }> = {
    fr: { titre: "Coordonnées de remise", gardes: [/nom complet/u, /téléphone/u, /adresse/u, /vendeur \*uniquement\*/u, /commande payée/u, /jamais publics/u, /Zabelie ne livre pas les produits/u] },
    ht: { titre: "Kòdone pou remiz la", gardes: [/non konplè/u, /telefòn/u, /adrès/u, /vandè a wè yo \*sèlman\*/u, /kòmand ou peye a/u, /pa janm piblik/u, /Zabelie pa livre pwodwi yo/u] },
    en: { titre: "Handover details", gardes: [/full name/u, /phone/u, /address/u, /seller \*only\*/u, /paid order/u, /never public/u, /Zabelie does not deliver products/u] },
    es: { titre: "Datos para la entrega", gardes: [/nombre completo/u, /teléfono/u, /dirección/u, /vendedor \*solo\*/u, /pedido pagado/u, /nunca públicos/u, /Zabelie no entrega los productos/u] },
  };
  for (const lang of LANGS) {
    const section = POLITIQUE[lang].sections.find(s => s.titre.startsWith("2."));
    assert.ok(section, `${lang} : section collecte absente`);
    const ligne = section.blocs.flatMap(b => "ul" in b ? b.ul : [])
      .find(texte => texte.includes(`**${collecte[lang].titre}**`));
    assert.ok(ligne, `${lang} : coordonnées de remise absentes de la collecte`);
    for (const garde of collecte[lang].gardes) assert.match(ligne, garde, `${lang} : collecte ou restriction absente`);
  }
});

const TITULAIRE = "synthetic-session-owner";
const COORDONNEES = { fullName: "Jan Test", phone: "+509 37 00 00 00", adresLiv: "12 Ri Test" };
const ENREGISTREES = {
  user_id: TITULAIRE, full_name: COORDONNEES.fullName, phone: COORDONNEES.phone, adres_liv: COORDONNEES.adresLiv,
};

/** La vraie route avec les vrais messages et prédicat de schéma ; seules
 * les E/S Auth/PostgREST sont doubles. La ligne existante rend une perte
 * visible, au lieu de vérifier seulement qu'un appel upsert a eu lieu. */
function livraison(options: { lang?: Lang; connecte?: boolean; dbError?: { code: string; message: string } } = {}) {
  const lang = options.lang ?? "fr";
  let stockees: Record<string, unknown> = { ...ENREGISTREES };
  const ecritures: Record<string, unknown>[] = [];
  const db = database(query => {
    assert.equal(query.table, "zabelie_delivery_info");
    const upsert = query.steps.find(([method]) => method === "upsert");
    assert.ok(upsert, "les coordonnées restent écrites par le client de session soumis à la RLS");
    const ligne = { ...(upsert[1][0] as Record<string, unknown>) };
    ecritures.push(ligne);
    if (!options.dbError) stockees = { ...stockees, ...ligne };
    return { data: null, error: options.dbError ?? null };
  });
  const route = loadRoute("app/api/delivery-info/route.ts", {
    "@/lib/i18n-server": { getLang: async () => lang },
    "@/lib/i18n": { t },
    "@/lib/product-media": { isMissingTable },
    "@/lib/supabase/server": { createClient: async () => ({
      ...db,
      auth: { getUser: async () => ({ data: { user: options.connecte === false ? null : { id: TITULAIRE } }, error: null }) },
    }) },
  });
  return {
    ecritures, queries: db.queries,
    stockees: () => stockees,
    envoyer: (raw: string) => route.POST(new Request("https://zabelie.test/api/delivery-info", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: raw,
    })),
  };
}

test("delivery-info : les formes invalides ne peuvent pas effacer les coordonnées enregistrées", async () => {
  for (const lang of LANGS) {
    for (const body of [[], 42, true, false, "texte", "", [COORDONNEES], null]) {
      const f = livraison({ lang });
      const response = await f.envoyer(JSON.stringify(body));
      assert.equal(response.status, 422, `${lang} : ${JSON.stringify(body)}`);
      assert.deepEqual(await response.json(), { error: t(lang, "api.params.invalid") });
      assert.equal(f.queries.length, 0);
      assert.equal(f.ecritures.length, 0);
      assert.deepEqual(f.stockees(), ENREGISTREES);
    }
  }
});

test("delivery-info : un champ connu non textuel est refusé avant toute écriture", async () => {
  for (const lang of LANGS) {
    for (const field of ["fullName", "phone", "adresLiv"] as const) {
      for (const value of [50937000000, null, true, false, [], [COORDONNEES[field]], {}]) {
        const f = livraison({ lang });
        const response = await f.envoyer(JSON.stringify({ ...COORDONNEES, [field]: value }));
        assert.equal(response.status, 422, `${lang} ${field} : ${JSON.stringify(value)}`);
        assert.deepEqual(await response.json(), { error: t(lang, "api.params.invalid") });
        assert.equal(f.queries.length, 0);
        assert.equal(f.ecritures.length, 0);
        assert.deepEqual(f.stockees(), ENREGISTREES);
      }
    }
  }
});

test("delivery-info : JSON absent ou tronqué refusé sans remplacer les coordonnées", async () => {
  for (const lang of LANGS) {
    for (const raw of ["", "{", '{"phone":"+509 37']) {
      const f = livraison({ lang });
      const response = await f.envoyer(raw);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: t(lang, "api.json.invalid") });
      assert.equal(f.queries.length, 0);
      assert.deepEqual(f.stockees(), ENREGISTREES);
    }
  }
});

test("delivery-info : l'authentification précède la lecture du corps et toute écriture", async () => {
  for (const lang of LANGS) {
    const f = livraison({ lang, connecte: false });
    const response = await f.envoyer("{");
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: t(lang, "api.auth.required") });
    assert.equal(f.queries.length, 0);
    assert.deepEqual(f.stockees(), ENREGISTREES);
  }
});

test("delivery-info : les chaînes valides sont normalisées pour le seul titulaire de la session", async () => {
  for (const lang of LANGS) {
    const f = livraison({ lang });
    const response = await f.envoyer(JSON.stringify({
      fullName: ` ${COORDONNEES.fullName} `, phone: ` ${COORDONNEES.phone} `, adresLiv: `\t${COORDONNEES.adresLiv}\n`,
      user_id: "synthetic-other-owner", seller_id: "synthetic-other-seller",
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(f.ecritures.length, 1);
    const { updated_at, ...ligne } = f.ecritures[0];
    assert.equal(typeof updated_at, "string");
    assert.ok(Number.isFinite(Date.parse(updated_at as string)));
    assert.deepEqual(ligne, ENREGISTREES);
  }
});

test("delivery-info : les limites existantes de 120, 30 et 240 caractères sont conservées", async () => {
  const f = livraison();
  const response = await f.envoyer(JSON.stringify({ fullName: "N".repeat(130), phone: "5".repeat(40), adresLiv: "R".repeat(250) }));
  assert.equal(response.status, 200);
  assert.equal(f.ecritures.length, 1);
  assert.equal(f.ecritures[0].full_name, "N".repeat(120));
  assert.equal(f.ecritures[0].phone, "5".repeat(30));
  assert.equal(f.ecritures[0].adres_liv, "R".repeat(240));
});

test("delivery-info : les chaînes vides effacent volontairement les coordonnées", async () => {
  const f = livraison();
  const response = await f.envoyer(JSON.stringify({ fullName: "", phone: " \t ", adresLiv: " \n " }));
  assert.equal(response.status, 200);
  assert.equal(f.ecritures.length, 1);
  assert.equal(f.ecritures[0].full_name, null);
  assert.equal(f.ecritures[0].phone, null);
  assert.equal(f.ecritures[0].adres_liv, null);
});

test("delivery-info : les champs omis conservent le remplacement existant par null", async () => {
  for (const body of [{}, { fullName: COORDONNEES.fullName }]) {
    const f = livraison();
    const response = await f.envoyer(JSON.stringify(body));
    assert.equal(response.status, 200);
    assert.equal(f.ecritures.length, 1);
    assert.equal(f.ecritures[0].full_name, "fullName" in body ? COORDONNEES.fullName : null);
    assert.equal(f.ecritures[0].phone, null);
    assert.equal(f.ecritures[0].adres_liv, null);
  }
});

test("delivery-info : une table absente ou une contrainte refusée ne produisent aucun faux succès", async () => {
  for (const lang of LANGS) {
    for (const [code, status, key] of [
      ["42P01", 503, "api.unavailable"],
      ["23514", 422, "api.write.failed"],
    ] as const) {
      const f = livraison({ lang, dbError: { code, message: "synthetic private database details" } });
      const response = await f.envoyer(JSON.stringify(COORDONNEES));
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error: t(lang, key) });
      assert.equal(f.ecritures.length, 1);
      assert.deepEqual(f.stockees(), ENREGISTREES);
    }
  }
});
