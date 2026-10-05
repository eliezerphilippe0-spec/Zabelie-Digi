import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRoute, database, type Query } from "./helpers/route-harness";
import { contexteGroupe, inscrireContexteGroupe, type ContexteGroupe } from "../lib/panier-groupe-contexte";
import { couponApplies, normalizeCouponCode } from "../lib/zabelie-coupons";
import { autresCommandesDuGroupe } from "../lib/panier-groupe";
import { reconcileStripe } from "../lib/stripe-reconcile";
import type Stripe from "stripe";
import { persistPaymentSession } from "../lib/payment-utils";

/**
 * PAIEMENT GROUPÉ DU PANIER (0128) — la route `/api/panier/payer`, exécutée
 * pour de vrai avec des doublures d'E/S. L'argent est éprouvé en SQL
 * (`supabase/tests/paiement_groupe.test.sql`, G1–G10) ; ici, l'orchestration :
 * le drapeau, l'ordre, le total qui vient de la BASE, l'abandon à chaque échec.
 */

type Fixture = {
  drapeau?: boolean;
  articles?: { product_id: string; product: { seller_id: string; title: string } }[];
  coupons?: Record<string, unknown>[];
  echecArticle?: string;
  scelle?: Record<string, unknown>;
  operateurEnPanne?: boolean;
  rail?: string;
  couponCode?: string;
  persistance?: "erreur" | "absente" | "exception";
};

const ARTICLES = [
  { product_id: "p1", product: { seller_id: "s1", title: "Livre A" } },
  { product_id: "p2", product: { seller_id: "s2", title: "Pagne B" } },
];

function monter(f: Fixture = {}) {
  const rpc: { nom: string; args: Record<string, unknown> }[] = [];
  const appels: { ctx: ContexteGroupe | null; corps: Record<string, unknown> }[] = [];
  const operateur: unknown[][] = [];
  const paiements = new Map<string, Record<string, unknown>>();
  const db = database((q: Query) => {
    if (q.table === "zabelie_panier_config") return { data: { max_articles: 10 }, error: null };
    if (q.table === "zabelie_coupons") return { data: f.coupons ?? [], error: null };
    if (q.table === "payments") {
      if (f.persistance === "exception") throw new Error("base indisponible");
      if (f.persistance === "erreur") return { data: null, error: { message: "base indisponible" } };
      if (f.persistance === "absente") return { data: null, error: null };
      const orderId = q.steps.find(([m, args]) => m === "eq" && args[0] === "order_id")?.[1][1];
      const raw = (q.steps.find(([m]) => m === "update")?.[1][0] as { raw: Record<string, unknown> }).raw;
      paiements.set(String(orderId), raw);
      return { data: { order_id: orderId }, error: null };
    }
    return { data: null, error: null };
  });
  const admin = {
    ...db,
    rpc: async (nom: string, args: Record<string, unknown>) => {
      if (nom === "zabelie_panier_groupe_ouvert") return { data: f.drapeau ?? true, error: null };
      rpc.push({ nom, args });
      if (nom === "zabelie_group_create") return { data: "G1", error: null };
      if (nom === "zabelie_group_seal") return { data: f.scelle ?? { leader_order_id: "o-p1", total_htg: 4000, expected_usd_cents: null }, error: null };
      return { data: "abandonne", error: null };
    },
  };
  const session = database(() => ({ data: f.articles ?? ARTICLES, error: null }));
  const route = loadRoute("app/api/panier/payer/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ ...session, auth: { getUser: async () => ({ data: { user: { id: "acheteur" } } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/auth": { requireActiveAccount: async () => null },
    "@/lib/zabelie-rate-limit": { rateLimit: async () => true },
    "@/lib/moncash": {
      createPayment: async (...a: unknown[]) => {
        operateur.push(["moncash", ...a]);
        if (f.operateurEnPanne) throw new Error("panne");
        return { redirectUrl: "https://moncash.test/pay", paymentToken: "tok", mode: "sandbox", gatewayHost: "h" };
      },
      resolveMonCashMode: () => ({ mode: "sandbox" }),
    },
    "@/lib/stripe": {
      isStripeEnabled: () => true,
      createStripeCheckout: async (a: unknown) => { operateur.push(["stripe", a]); return { redirectUrl: "https://stripe.test", sessionId: "cs_1" }; },
    },
    "@/lib/kobara": {
      isKobaraEnabled: () => true,
      isKobaraProvider: (v: unknown) => v === "natcash" || v === "moncash",
      kobaraCap: () => 20000,
      createKobaraPayment: async (a: unknown) => { operateur.push(["kobara", a]); return { id: "k1", redirectUrl: "https://kobara.test", mode: "sandbox", modeSource: "env" }; },
    },
    "@/lib/payment-utils": { persistPaymentSession, railCap: (r: string) => (r === "moncash" ? 75000 : null) },
    "@/lib/zabelie-coupons": { couponApplies, normalizeCouponCode },
    "@/lib/panier-groupe-contexte": { inscrireContexteGroupe },
    "@/app/api/checkout/route": {
      POST: async (req: Request) => {
        const corps = (await req.json()) as Record<string, unknown>;
        appels.push({ ctx: contexteGroupe(req), corps });
        if (corps.productId === f.echecArticle) return Response.json({ error: "Stock insuffisant", code: "stock_insuffisant" }, { status: 409 });
        return Response.json({ orderId: `o-${corps.productId}`, amountHtg: 1 });
      },
    },
  });
  const payer = () =>
    route.POST(new Request("https://zabelie.test/api/panier/payer", {
      method: "POST",
      body: JSON.stringify({ rail: f.rail ?? "moncash", ...(f.couponCode ? { couponCode: f.couponCode } : {}) }),
    }));
  return { payer, rpc, appels, operateur, paiements };
}

test("PG1 — fermé (ni drapeau, ni première vente réelle) : 409, aucun groupe ouvert, aucun article commandé", async () => {
  const m = monter({ drapeau: false });
  const res = await m.payer();
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "panier_groupe_ferme");
  assert.deepEqual(m.rpc, []);
  assert.equal(m.appels.length, 0);
});

test("an own article refuses the entire group before checkout, creation, stock or operator", async () => {
  for (const at of [0, 1]) {
    const articles = ARTICLES.map((a, i) => ({ ...a, product: { ...a.product, seller_id: i === at ? "acheteur" : a.product.seller_id } }));
    const m = monter({ articles });
    const res = await m.payer();
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.code, "self_purchase"); assert.equal(body.productId, articles[at].product_id);
    assert.deepEqual(m.rpc, []); assert.equal(m.appels.length, 0); assert.equal(m.operateur.length, 0);
  }
});

test("PG2 — un groupe, chaque article par le checkout existant, l'opérateur appelé UNE fois pour le total SCELLÉ", async () => {
  const m = monter({ scelle: { leader_order_id: "o-p1", total_htg: 3999, expected_usd_cents: null } });
  const res = await m.payer();
  assert.equal(res.status, 200);
  assert.equal((await res.json()).redirectUrl, "https://moncash.test/pay");
  assert.deepEqual(m.rpc.map((r) => r.nom), ["zabelie_group_create", "zabelie_group_seal"]);
  // Objet né dans le bac à sable du harnais (autre royaume) : comparé par valeur.
  assert.equal(JSON.stringify(m.rpc[0].args), JSON.stringify({ p_buyer: "acheteur", p_rail: "moncash" }), "l'acheteur vient de la session");
  assert.deepEqual(m.appels.map((a) => [a.ctx?.groupId, a.ctx?.meneuse, a.ctx?.rail]), [["G1", true, "moncash"], ["G1", false, "moncash"]]);
  // 3999 n'est la somme de rien ici : seul le scellement en base a pu le dire.
  assert.deepEqual(m.operateur, [["moncash", "o-p1", 3999]]);
});

test("PG3 — un article refuse : groupe ABANDONNÉ, article nommé, aucun opérateur", async () => {
  const m = monter({ echecArticle: "p2" });
  const res = await m.payer();
  assert.equal(res.status, 409);
  const corps = await res.json();
  assert.equal(corps.productId, "p2");
  assert.equal(corps.code, "stock_insuffisant");
  assert.deepEqual(m.rpc.map((r) => r.nom), ["zabelie_group_create", "zabelie_group_abort"]);
  assert.equal(m.operateur.length, 0);
});

test("PG4 — opérateur en panne : abandon et 502 ; total au-dessus du plafond : abandon et 422", async () => {
  const panne = monter({ operateurEnPanne: true });
  assert.equal((await panne.payer()).status, 502);
  assert.equal(panne.rpc.at(-1)?.nom, "zabelie_group_abort");

  const plafond = monter({ scelle: { leader_order_id: "o-p1", total_htg: 75001, expected_usd_cents: null } });
  const res = await plafond.payer();
  assert.equal(res.status, 422);
  assert.equal((await res.json()).code, "plafond_rail");
  assert.equal(plafond.rpc.at(-1)?.nom, "zabelie_group_abort");
  assert.equal(plafond.operateur.length, 0);
});

test("PG5 — Stripe facture le total USD scellé ; Kobara le total HTG scellé, avec l'opérateur choisi", async () => {
  const s = monter({ rail: "stripe", scelle: { leader_order_id: "o-p1", total_htg: 4000, expected_usd_cents: 3071 } });
  assert.equal((await s.payer()).status, 200);
  assert.equal((s.operateur[0][1] as { usdCents: number; orderId: string }).usdCents, 3071);
  assert.equal((s.operateur[0][1] as { orderId: string }).orderId, "o-p1");

  const k = monter({ rail: "kobara" });
  assert.equal((await k.payer()).status, 200);
  assert.deepEqual(
    [(k.operateur[0][1] as { amountHtg: number }).amountHtg, (k.operateur[0][1] as { provider: string }).provider],
    [4000, "natcash"]
  );
  assert.equal(k.appels[0].ctx?.kobaraProvider, "natcash");
});

test("PG6 — le code promo ne part qu'aux articles de SON vendeur ; inapplicable partout = refus", async () => {
  const coupon = { id: "c1", seller_id: "s2", product_id: null, percent: 10, max_uses: null, uses: 0, expires_at: null, active: true };
  const m = monter({ couponCode: "lakay10", coupons: [coupon] });
  assert.equal((await m.payer()).status, 200);
  assert.deepEqual(m.appels.map((a) => a.corps.couponCode ?? null), [null, "LAKAY10"]);

  const aucun = monter({ couponCode: "lakay10", coupons: [] });
  const res = await aucun.payer();
  assert.equal(res.status, 422);
  assert.equal((await res.json()).code, "coupon_invalid");
  assert.deepEqual(aucun.rpc, [], "aucun groupe ouvert pour un code qui ne vaut rien");
});

test("PG7 — un panier d'un seul article ne passe pas par le groupe", async () => {
  const m = monter({ articles: [ARTICLES[0]] });
  assert.equal((await m.payer()).status, 422);
  assert.deepEqual(m.rpc, []);
});

test("PG8 — le contexte de groupe ne se forge pas : seule la requête inscrite le porte", () => {
  const forgee = new Request("https://zabelie.test/api/checkout", {
    method: "POST",
    headers: { "x-zabelie-groupe": "G1" },
    body: JSON.stringify({ groupId: "G1", meneuse: true }),
  });
  assert.equal(contexteGroupe(forgee), null);
  const vraie = inscrireContexteGroupe(new Request("https://zabelie.test/api/checkout"), { groupId: "G1", meneuse: false, rail: "moncash", kobaraProvider: "natcash" });
  assert.equal(contexteGroupe(vraie)?.groupId, "G1");
});

test("PG9 — le checkout : group_id, rail `groupe` et retour anticipé ne dépendent QUE du contexte serveur", () => {
  const src = readFileSync("app/api/checkout/route.ts", "utf8");
  assert.match(src, /const groupe = contexteGroupe\(req\);/);
  assert.match(src, /\.\.\.\(groupe \? \{ group_id: groupe\.groupId \} : \{\}\)/);
  assert.match(src, /const railPaiement = groupe && !groupe\.meneuse \? "groupe" : railEffectif;/);
  assert.match(src, /rail: railPaiement,\s*idempotency_key: order\.id,/);
  assert.match(src, /if \(!groupe && !\(await rateLimit\(admin, `checkout:\$\{user\.id\}`, 10\)\)\)/);
  assert.match(src, /if \(groupe && estGratuit\) \{\s*return NextResponse\.json\(/);
  // Le retour anticipé vient APRÈS la réservation de stock, AVANT tout opérateur.
  const reserve = src.indexOf('"zabelie_reserve_stock"');
  const retour = src.search(/if \(groupe\) \{\s*return NextResponse\.json\(\{ orderId: order\.id, amountHtg: order\.amount_htg \}\);/);
  const operateur = src.indexOf("await createStripeCheckout(");
  assert.ok(reserve > 0 && retour > reserve && retour < operateur, "ordre réservation → retour groupe → opérateur");
  assert.ok(!/body\.groupId|groupId:\s*(?:body|corps|input)/.test(src), "aucun identifiant de groupe lu depuis le corps");
});

test("PG10 — après confirmation, la meneuse entraîne les autres commandes (suivi, avis) ; rien sinon", async () => {
  const etat = (groupe: Record<string, unknown> | null, erreur = false) =>
    database((q: Query) => {
      if (q.table === "orders" && q.steps.some(([m]) => m === "maybeSingle")) {
        return erreur ? { data: null, error: { message: "column orders.group_id does not exist" } } : { data: { group_id: groupe ? "G1" : null }, error: null };
      }
      if (q.table === "zabelie_order_groups") return { data: groupe, error: null };
      return { data: [{ id: "o-2" }, { id: "o-3" }], error: null };
    }) as unknown as SupabaseClient;
  assert.deepEqual(await autresCommandesDuGroupe(etat({ leader_order_id: "o-1", status: "confirmed" }), "o-1"), ["o-2", "o-3"]);
  assert.deepEqual(await autresCommandesDuGroupe(etat({ leader_order_id: "o-1", status: "pending" }), "o-1"), [], "groupe non confirmé");
  assert.deepEqual(await autresCommandesDuGroupe(etat({ leader_order_id: "o-9", status: "confirmed" }), "o-1"), [], "pas la meneuse");
  assert.deepEqual(await autresCommandesDuGroupe(etat(null), "o-1"), [], "hors groupe");
  assert.deepEqual(await autresCommandesDuGroupe(etat(null, true), "o-1"), [], "0128 absente : jamais d'exception");

  for (const [fichier, une] of [["lib/fulfillment.ts", "ouvrirUnSuivi"], ["lib/zabelie-notify.ts", "notifierUneCommande"]]) {
    const src = readFileSync(fichier, "utf8");
    assert.match(src, new RegExp(`for \\(const autre of await autresCommandesDuGroupe\\(admin, orderId\\)\\) \\{\\s*await ${une}\\(admin, autre`), fichier);
  }
});

test("PG11 — la page panier pose à la base la MÊME question que la route avant d'afficher le bouton", () => {
  const page = readFileSync("app/panier/page.tsx", "utf8");
  assert.match(page, /const \[\{ data: ouvert, error: e1 \}, \{ data, error: e2 \}\] = await Promise\.all\(\[\s*admin\.rpc\("zabelie_panier_groupe_ouvert"\)/);
  assert.match(page, /if \(e1 \|\| e2 \|\| !data \|\| ouvert !== true\) return null;/);
  assert.match(page, /config !== null &&\s*items\.length <= config\.max_articles/);
});

for (const rail of ["stripe", "kobara", "moncash"] as const) {
  for (const persistance of ["erreur", "absente", "exception"] as const) {
    test(`PG12 — session ${rail} non persistée (${persistance}) : pas de redirection, groupe abandonné`, async () => {
      const m = monter({ rail, scelle: { leader_order_id: "o-p1", total_htg: 4000, expected_usd_cents: rail === "stripe" ? 3071 : null }, persistance });
      const res = await m.payer();
      const corps = await res.json();
      assert.equal(res.status, 502);
      assert.equal(corps.code, "provider_unavailable");
      assert.equal(corps.redirectUrl, undefined, "une session non rapprochable n'est jamais donnée à l'acheteur");
      assert.equal(m.operateur.length, 1, "la panne survient après la création opérateur");
      assert.equal(m.rpc.at(-1)?.nom, "zabelie_group_abort");
      assert.equal(m.paiements.size, 0);
    });
  }
}

test("PG13 — la session Stripe persistée sur la meneuse permet le rattrapage sans retour navigateur", async () => {
  const m = monter({ rail: "stripe", scelle: { leader_order_id: "o-p1", total_htg: 4000, expected_usd_cents: 3071 } });
  assert.equal((await m.payer()).status, 200);
  assert.deepEqual([...m.paiements.keys()], ["o-p1"], "seule la meneuse est rapprochée chez l'opérateur");
  const raw = m.paiements.get("o-p1")!;
  assert.equal(raw.groupe, "G1");
  const consultees: string[] = [];
  const confirmees: string[] = [];
  const result = await reconcileStripe({
    listPending: async () => [{ order_id: "o-p1", idempotency_key: "o-p1", raw }],
    retrieve: async (id) => {
      consultees.push(id);
      return { id: "cs_1", metadata: { order_id: "o-p1" }, mode: "payment", currency: "usd", amount_total: 3071, payment_status: "paid", status: "complete" } as unknown as Stripe.Checkout.Session;
    },
    confirm: async (order) => { confirmees.push(order.order_id); return { status: "confirmed" }; },
    expire: async () => { throw new Error("pas d'expiration d'une session payée"); },
  });
  assert.deepEqual(consultees, ["cs_1"], "l'identifiant interrogé vient de l'écriture réelle de la route");
  assert.deepEqual(confirmees, ["o-p1"]);
  assert.equal(result.missingSession, 0);
  assert.equal(result.confirmed, 1);
  assert.deepEqual(result.errors, []);
});
