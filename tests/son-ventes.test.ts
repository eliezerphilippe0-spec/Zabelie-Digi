import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRoute } from "./helpers/route-harness";
import { SALE_STATUSES } from "../lib/api/v1/seller";

/**
 * Son de vente, niveau 1 (2026-10-31). Deux pièces, éprouvées sur leur code réel :
 *   • la route compte les ventes du SEUL vendeur connecté, avec les statuts qui
 *     rendent le nombre monotone (une vente remboursée reste comptée) ;
 *   • le composant ne sonne que sur une HAUSSE, jamais au premier relevé, et
 *     recharge la liste ; hors ligne, il n'appelle rien.
 */

// ── La route ──────────────────────────────────────────────────────────────
// Les objets viennent du bac à sable du harnais (autre realm) : on compare leur JSON.
const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));
type Appel = { table?: string; select?: unknown[]; eq?: unknown[][]; in?: unknown[][] };

function route(options: { user?: { id: string } | null; refus?: Response | null; count?: number; error?: unknown } = {}) {
  const appel: Appel = { eq: [], in: [] };
  const constructeur = {
    select(...args: unknown[]) { appel.select = args; return constructeur; },
    eq(...args: unknown[]) { appel.eq!.push(args); return constructeur; },
    in(...args: unknown[]) { appel.in!.push(args); return constructeur; },
    then(resoudre: (v: unknown) => unknown) {
      return Promise.resolve({ count: options.count ?? 0, error: options.error ?? null }).then(resoudre);
    },
  };
  const mod = loadRoute("app/api/seller/ventes-compte/route.ts", {
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: options.user === undefined ? { id: "vendeur-1" } : options.user } }) },
        from(table: string) { appel.table = table; return constructeur; },
      }),
    },
    "@/lib/auth": { requireActiveAccount: async () => options.refus ?? null },
    "@/lib/api/v1/seller": { SALE_STATUSES },
  }) as { GET(): Promise<Response> };
  return { mod, appel };
}

test("route : sans session, 401 et aucune lecture", async () => {
  const { mod, appel } = route({ user: null });
  assert.equal((await mod.GET()).status, 401);
  assert.equal(appel.table, undefined);
});

test("route : un compte suspendu reçoit le refus, aucune lecture", async () => {
  const { mod, appel } = route({ refus: Response.json({ error: "suspendu" }, { status: 403 }) });
  assert.equal((await mod.GET()).status, 403);
  assert.equal(appel.table, undefined);
});

test("route : le nombre des ventes du vendeur connecté, statuts monotones, rien d'autre", async () => {
  const { mod, appel } = route({ count: 3 });
  const reponse = await mod.GET();
  assert.equal(reponse.status, 200);
  assert.deepEqual(await reponse.json(), { ventes: 3 });
  assert.equal(reponse.headers.get("cache-control"), "no-store");
  assert.equal(appel.table, "orders");
  assert.match(String(appel.select?.[0]), /products!orders_product_id_fkey!inner\(seller_id\)/);
  assert.deepEqual(json(appel.select?.[1]), { count: "exact", head: true }, "un compte, aucune ligne rendue");
  assert.deepEqual(json(appel.eq), [["products.seller_id", "vendeur-1"]], "filtré sur le vendeur, pas sur l'acheteur");
  assert.deepEqual(json(appel.in), [["status", ["paid", "delivered", "refunded", "disputed"]]]);
});

test("route : une erreur de lecture rend 503, jamais un zéro trompeur", async () => {
  const { mod } = route({ error: { message: "x" } });
  assert.equal((await mod.GET()).status, 503);
});

// ── Le composant ──────────────────────────────────────────────────────────
type Element = { type: unknown; props: Record<string, unknown> };
const element = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
function trouver(arbre: unknown, pred: (n: Element) => boolean): Element | undefined {
  if (Array.isArray(arbre)) return arbre.map((c) => trouver(c, pred)).find(Boolean);
  if (!arbre || typeof arbre !== "object") return undefined;
  const n = arbre as Element;
  return pred(n) ? n : trouver(n.props?.children, pred);
}
function texte(arbre: unknown): string {
  if (Array.isArray(arbre)) return arbre.map(texte).join(" ");
  if (typeof arbre === "string") return arbre;
  if (!arbre || typeof arbre !== "object") return "";
  return texte((arbre as Element).props?.children);
}
const LABELS = { activer: "Activer le son", actif: "Son actif", couper: "Couper", nouvelle: "Nouvelle vente !" };

function composant(reponses: number[], options: { horsLigne?: boolean } = {}) {
  const slots: unknown[] = [];
  let curseur = 0;
  const effets = new Map<number, { deps: unknown[]; effet: () => unknown; nettoyage?: () => void; aJouer: boolean }>();
  const react = {
    useState(initial: unknown) {
      const i = curseur++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (v: unknown) => { slots[i] = typeof v === "function" ? (v as (x: unknown) => unknown)(slots[i]) : v; }];
    },
    useRef(initial: unknown) {
      const i = curseur++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useEffect(effet: () => unknown, deps: unknown[]) {
      const i = curseur++;
      const avant = effets.get(i);
      const change = !avant || deps.some((d, k) => d !== avant.deps[k]);
      effets.set(i, { deps, effet, nettoyage: avant?.nettoyage, aJouer: change });
    },
  };
  const journal = { appels: 0, sons: 0, rafraichissements: 0, minuteries: [] as Array<() => void>, arretees: 0, ecouteurs: new Map<string, () => void>() };
  const routeur = { refresh() { journal.rafraichissements += 1; } };
  class FauxContexte {
    currentTime = 0;
    destination = {};
    resume() { return Promise.resolve(); }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d: unknown) => d }; }
    createOscillator() {
      return { type: "", frequency: { value: 0 }, connect: (g: unknown) => g, start: () => { journal.sons += 1; }, stop() {} };
    }
  }
  const fenetre = {
    AudioContext: FauxContexte,
    setInterval: (f: () => void) => { journal.minuteries.push(f); return journal.minuteries.length; },
    clearInterval: () => { journal.arretees += 1; },
  };
  const documentFaux = {
    visibilityState: "visible",
    addEventListener: (nom: string, f: () => void) => { journal.ecouteurs.set(nom, f); },
    removeEventListener: (nom: string) => { journal.ecouteurs.delete(nom); },
  };
  let n = 0;
  const source = loadRoute("components/son-ventes.tsx", {
    react, "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "next/navigation": { useRouter: () => routeur },
  }, {}, {
    window: fenetre, document: documentFaux, navigator: { onLine: !options.horsLigne },
    fetch: async () => {
      journal.appels += 1;
      const ventes = reponses[Math.min(n++, reponses.length - 1)];
      return { ok: true, json: async () => ({ ventes }) };
    },
  }) as unknown as { SonVentes(p: { labels: typeof LABELS }): Element };
  const vider = async () => { for (let i = 0; i < 5; i++) await new Promise<void>((r) => setImmediate(r)); };
  const rendre = () => {
    curseur = 0;
    const arbre = source.SonVentes({ labels: LABELS });
    for (const e of effets.values()) {
      if (!e.aJouer) continue;
      e.nettoyage?.();
      const r = e.effet();
      e.nettoyage = typeof r === "function" ? (r as () => void) : undefined;
      e.aJouer = false;
    }
    return arbre;
  };
  return { journal, rendre, vider };
}

test("composant : rien ne part avant le geste « Activer le son »", async () => {
  const c = composant([5]);
  c.rendre();
  await c.vider();
  assert.equal(c.journal.appels, 0);
  assert.equal(c.journal.minuteries.length, 0);
});

test("composant : le geste sonne une fois, le premier relevé ne sonne pas, une HAUSSE sonne et recharge", async () => {
  const c = composant([5, 5, 7, 7]);
  const bouton = trouver(c.rendre(), (n) => n.type === "button" && n.props.children === LABELS.activer);
  assert.ok(bouton, "le bouton d'activation est rendu");
  (bouton.props.onClick as () => void)();
  assert.equal(c.journal.sons, 2, "le geste fait entendre le signal (deux notes)");
  c.rendre(); // l'activation arme le sondage
  await c.vider();
  assert.equal(c.journal.appels, 1);
  assert.equal(c.journal.sons, 2, "premier relevé : la référence, pas de son");
  assert.equal(c.journal.rafraichissements, 0);

  c.journal.minuteries[0](); await c.vider();       // 5 → 5 : rien
  assert.equal(c.journal.sons, 2);
  assert.equal(c.journal.rafraichissements, 0);

  c.journal.minuteries[0](); await c.vider();       // 5 → 7 : nouvelle vente
  assert.equal(c.journal.sons, 4, "une hausse sonne");
  assert.equal(c.journal.rafraichissements, 1, "et la liste se recharge");
  assert.match(texte(c.rendre()), /Nouvelle vente !/, "le signal est aussi écrit");

  c.journal.ecouteurs.get("visibilitychange")!(); await c.vider();  // retour sur l'onglet : 7 → 7
  assert.equal(c.journal.sons, 4);
  assert.equal(c.journal.rafraichissements, 1);
});

test("composant : hors ligne, aucun appel ; « Couper » arrête le sondage et l'écoute", async () => {
  const c = composant([1], { horsLigne: true });
  (trouver(c.rendre(), (n) => n.type === "button" && n.props.children === LABELS.activer)!.props.onClick as () => void)();
  c.rendre();
  await c.vider();
  assert.equal(c.journal.appels, 0, "hors ligne : rien n'est appelé");

  (trouver(c.rendre(), (n) => n.type === "button" && n.props.children === LABELS.couper)!.props.onClick as () => void)();
  c.rendre();
  assert.equal(c.journal.arretees, 1, "la minuterie est arrêtée");
  assert.equal(c.journal.ecouteurs.has("visibilitychange"), false, "l'écoute est retirée");
});
