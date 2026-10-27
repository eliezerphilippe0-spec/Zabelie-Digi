import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { database, loadRoute, type Query } from "./helpers/route-harness";
import { LANGS, t, type I18nKey, type Lang } from "../lib/i18n";

/**
 * M1 (audit du 2026-10-27) — LES ERREURS DU SIGNALEMENT ZELLE.
 *
 * Qui lit ces messages : un acheteur de la diaspora qui a DÉJÀ envoyé ses
 * dollars. La route lui rendait `error.message` — le texte brut de Postgres —
 * et ses autres refus étaient en français en dur ; le formulaire ajoutait deux
 * replis français et confondait panne serveur et panne réseau.
 *
 * Ce qui est gardé ici, par l'exécution de la VRAIE route (seules l'Auth et
 * les lectures/écritures PostgREST sont doublées) :
 *   Z1  chaque refus rend un code stable ET la phrase de la langue du visiteur ;
 *   Z2  un échec d'écriture ne rend JAMAIS le message de Postgres au client,
 *       et le journal ne garde que le code (ni référence bancaire, ni message) ;
 *   Z3  une lecture ratée n'est pas « paiement introuvable » ;
 *   Z4  le formulaire passe par la porte des appels authentifiés, attache le
 *       message réseau à l'issue `reseau` seule, et annonce l'erreur.
 *
 * Mutations éprouvées (chacune rouge, puis restaurée) : voir le message du
 * commit — `erreurAvecLangue(… "zelle.err.enregistrement" …)` remplacé par
 * `NextResponse.json({ error: error.message }, …)` → Z2 rouge.
 */

const BUYER = "11300000-0000-4000-8000-0000000000a1";
const OTHER = "11300000-0000-4000-8000-0000000000a2";
const ORDER = "11300000-0000-4000-8000-0000000000a3";
const PAYMENT = "11300000-0000-4000-8000-0000000000a4";
const REFERENCE_BANCAIRE = "ZL-CONF-998877";
const MESSAGE_PG = 'new row for relation "payments" violates check constraint "payments_raw_check"';

type Options = {
  lang?: Lang;
  user?: string | null;
  payment?: Record<string, unknown> | null;
  readError?: { code: string; message: string } | null;
  writeError?: { code: string; message: string } | null;
};

function fixture(options: Options = {}) {
  const lang = options.lang ?? "fr";
  const journal: unknown[][] = [];
  const writes: Query[] = [];
  const db = database((query) => {
    if (query.steps.some(([m]) => m === "update")) {
      writes.push(query);
      return { data: null, error: options.writeError ?? null };
    }
    if (options.readError) return { data: null, error: options.readError };
    const payment = options.payment === undefined
      ? { id: PAYMENT, rail: "zelle", status: "pending", raw: {}, orders: { buyer_id: BUYER } }
      : options.payment;
    return payment ? { data: payment, error: null } : { data: null, error: { code: "PGRST116", message: "0 rows" } };
  });
  const route = loadRoute("app/api/zelle/reference/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({
      data: { user: options.user === null ? null : { id: options.user ?? BUYER } },
    }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/i18n-server": { getLang: async () => lang },
    // Le double reproduit `lib/api-erreur.ts` : la phrase vient de `t`, réel.
    "@/lib/api-erreur": { erreurAvecLangue: (l: Lang, cle: I18nKey, status: number, extra?: Record<string, unknown>) =>
      Response.json({ error: t(l, cle), ...extra }, { status }) },
  }, {}, { console: { ...console, error: (...args: unknown[]) => { journal.push(args); } } });
  const post = (body: unknown) => route.POST(new Request("https://example.test/api/zelle/reference", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
  return { post, journal, writes };
}

for (const lang of LANGS) {
  test(`Z1 — chaque refus rend un code stable et la phrase de la langue du visiteur (${lang})`, async () => {
    const cas: [Options, unknown, number, string, I18nKey][] = [
      [{}, "{", 400, "json_invalide", "api.json.invalid"],
      [{}, { reference: "x" }, 400, "commande_requise", "api.params.invalid"],
      [{ user: null }, { orderId: ORDER }, 401, "session_requise", "api.auth.required"],
      [{ payment: null }, { orderId: ORDER }, 404, "paiement_introuvable", "zelle.err.introuvable"],
      [{ user: OTHER }, { orderId: ORDER }, 404, "paiement_introuvable", "zelle.err.introuvable"],
      [{ payment: { id: PAYMENT, rail: "moncash", status: "pending", raw: {}, orders: { buyer_id: BUYER } } },
        { orderId: ORDER }, 404, "paiement_introuvable", "zelle.err.introuvable"],
      [{ payment: { id: PAYMENT, rail: "zelle", status: "confirmed", raw: {}, orders: [{ buyer_id: BUYER }] } },
        { orderId: ORDER }, 409, "deja_traite", "zelle.err.dejaTraite"],
    ];
    for (const [options, body, status, code, cle] of cas) {
      const f = fixture({ ...options, lang });
      const res = await f.post(body);
      assert.equal(res.status, status, `${code} (${lang})`);
      assert.deepEqual(await res.json(), { error: t(lang, cle), code }, `${code} (${lang})`);
      assert.equal(f.writes.length, 0, `${code} : aucune écriture sur un refus`);
    }
  });

  test(`Z2 — un échec d'écriture ne rend JAMAIS le message de Postgres (${lang})`, async () => {
    const f = fixture({ lang, writeError: { code: "23514", message: MESSAGE_PG } });
    const res = await f.post({ orderId: ORDER, reference: REFERENCE_BANCAIRE });
    assert.equal(res.status, 500);
    const corps = await res.json();
    assert.deepEqual(corps, { error: t(lang, "zelle.err.enregistrement"), code: "enregistrement_impossible" });
    assert.ok(!JSON.stringify(corps).includes("violates"), "le texte de Postgres a atteint l'acheteur");
    // Le journal garde de quoi diagnostiquer, et rien de personnel.
    assert.equal(f.journal.length, 1);
    const ligne = JSON.stringify(f.journal[0]);
    assert.ok(ligne.includes("23514"), `le code Postgres doit rester au journal : ${ligne}`);
    assert.ok(!ligne.includes(REFERENCE_BANCAIRE), "la référence bancaire de l'acheteur est au journal");
    assert.ok(!ligne.includes(BUYER) && !ligne.includes(ORDER), "un identifiant d'acheteur ou de commande est au journal");
    assert.ok(!ligne.includes("violates"), "le message brut est au journal");
  });

  test(`Z3 — une lecture ratée n'est pas « paiement introuvable » (${lang})`, async () => {
    const f = fixture({ lang, readError: { code: "08006", message: "connection failure" } });
    const res = await f.post({ orderId: ORDER });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: t(lang, "api.unavailable"), code: "indisponible" });
    assert.equal(f.writes.length, 0);
  });
}

test("Z0 — le chemin heureux est intact : la référence est enregistrée, tronquée à 64", async () => {
  const f = fixture();
  const res = await f.post({ orderId: ORDER, reference: "R".repeat(80) });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(f.writes.length, 1);
  const [, [raw]] = f.writes[0].steps.find(([m]) => m === "update") as [string, [{ raw: { buyer_ref: string } }]];
  assert.equal(raw.raw.buyer_ref, "R".repeat(64));
  assert.deepEqual(f.writes[0].steps.find(([m]) => m === "eq"), ["eq", ["id", PAYMENT]]);
});

test("Z2b — la route ne renvoie plus aucun message brut ni français en dur", () => {
  const src = readFileSync("app/api/zelle/reference/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  assert.doesNotMatch(src, /error:\s*error\.message/, "`error.message` renvoyé au client");
  assert.doesNotMatch(src, /error:\s*"[^"]{6,}"/, "message en dur dans la réponse");
});

/** Le formulaire : ce qui COMMANDE l'affichage, pas la présence d'un libellé. */
const FORM = readFileSync("components/zelle-reference-form.tsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");

test("Z4 — le formulaire passe par la porte et distingue réseau, refus et session", () => {
  assert.match(FORM, /import \{ appelSession \} from "@\/lib\/appel-session";/);
  assert.match(FORM, /const issue = await appelSession\("\/api\/zelle\/reference",/);
  assert.doesNotMatch(FORM, /await res\.json\(\)|await fetch\(/, "lecture de réponse hors de la porte");
  // Le message réseau est commandé par l'issue `reseau`, et par elle seule.
  assert.match(FORM, /else if \(issue\.etat === "reseau"\) \{\s*setError\(labels\.network\);/);
  // Un refus affiche la phrase du serveur, déjà traduite, sinon un libellé traduit.
  assert.match(FORM, /\} else \{\s*setError\(issue\.error \?\? labels\.failed\);/);
  assert.match(FORM, /if \(issue\.etat === "connexion"\) \{\s*router\.push\(issue\.vers\);/);
  // Aucun repli français en dur.
  assert.doesNotMatch(FORM, /"Une erreur est survenue|"Connexion impossible/);
});

test("Z5 — l'erreur est annoncée, et la cible tactile fait 44 px", () => {
  assert.match(FORM, /\{error && \(\s*<p role="alert"[^>]*>\s*\{error\}/, "l'erreur doit porter role=\"alert\"");
  assert.match(FORM, /<button\s+type="submit"[^>]*className="[^"]*\bmin-h-11\b/, "bouton sous 44 px");
  // La page passe les trois libellés nouveaux, traduits.
  const page = readFileSync("app/paiement/zelle/[orderId]/page.tsx", "utf8");
  for (const [prop, cle] of [["submitting", "zelle.envoi"], ["network", "zelle.err.reseau"], ["failed", "zelle.err.enregistrement"]]) {
    assert.match(page, new RegExp(`${prop}: t\\(lang, "${cle.replace(/\./g, "\\.")}"\\)`), `${prop} non passé par t()`);
  }
});
