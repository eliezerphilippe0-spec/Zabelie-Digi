import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ETAPES, JOUR_MS, chargerEntonnoir, fenetres, variation, type ClientComptage } from "../lib/entonnoir";

/** Faux client : enregistre chaque filtre, rend le compte fourni par `reponse`. */
function faux(reponse: (table: string, filtres: string[]) => { count: number | null; error: unknown } | "jette") {
  const journal: { table: string; filtres: string[] }[] = [];
  const client: ClientComptage = {
    from(table) {
      return {
        select(_c, opts) {
          assert.deepEqual(opts, { count: "exact", head: true }, "aucune ligne ne doit être transférée");
          const filtres: string[] = [];
          const q = {
            eq(c: string, v: unknown) { filtres.push(`${c}=${v}`); return q; },
            gte(c: string, v: string) { filtres.push(`${c}>=${v}`); return q; },
            lt(c: string, v: string) { filtres.push(`${c}<${v}`); return q; },
            then(ok: (r: { count: number | null; error: unknown }) => unknown, ko?: (e: unknown) => unknown) {
              journal.push({ table, filtres });
              const r = reponse(table, filtres);
              return (r === "jette" ? Promise.reject(new Error("réseau")) : Promise.resolve(r)).then(ok, ko);
            },
          };
          return q as never;
        },
      };
    },
  };
  return { client, journal };
}

const T = new Date("2026-09-26T12:00:00.000Z");

test("E1 — deux fenêtres de 7 jours, contiguës, fin exclue", () => {
  const { courante, precedente } = fenetres(T);
  assert.equal(courante.fin, T.toISOString());
  assert.equal(Date.parse(courante.fin) - Date.parse(courante.debut), 7 * JOUR_MS);
  assert.equal(precedente.fin, courante.debut, "trou ou chevauchement entre les deux semaines");
  assert.equal(Date.parse(precedente.fin) - Date.parse(precedente.debut), 7 * JOUR_MS);
});

test("E2 — l'écart ne ment pas sur zéro ni sur l'indisponible", () => {
  assert.equal(variation(10, 5), "+100 %");
  assert.equal(variation(3, 4), "-25 %");
  assert.equal(variation(4, 4), "=");
  assert.equal(variation(3, 0), "+3", "pas de division par zéro");
  assert.equal(variation(null, 4), "—");
  assert.equal(variation(4, null), "—");
});

test("E3 — chaque étape est comptée sur SA colonne de date, avec SES filtres, dans les deux fenêtres", async () => {
  const { client, journal } = faux(() => ({ count: 2, error: null }));
  const lignes = await chargerEntonnoir(client, T);
  const { courante, precedente } = fenetres(T);
  assert.equal(journal.length, ETAPES.length * 2);
  for (const e of ETAPES) {
    for (const f of [courante, precedente]) {
      const attendu = [...Object.entries(e.egal ?? {}).map(([c, v]) => `${c}=${v}`), `${e.colonneDate}>=${f.debut}`, `${e.colonneDate}<${f.fin}`];
      assert.ok(journal.some((j) => j.table === e.table && JSON.stringify(j.filtres) === JSON.stringify(attendu)), `${e.cle} : filtres absents pour ${f.debut}`);
    }
  }
  assert.ok(lignes.every((l) => l.courant === 2 && l.precedent === 2));
});

test("E4 — un compte en erreur rend `null`, jamais 0 (cas connu-négatif)", async () => {
  const { client } = faux((table, filtres) =>
    table === "payments" && filtres.includes("status=failed") ? { count: null, error: { message: "panne" } }
    : table === "orders" ? "jette"
    : { count: 0, error: null });
  const lignes = await chargerEntonnoir(client, T);
  const par = Object.fromEntries(lignes.map((l) => [l.cle, l]));
  assert.equal(par.paiements_ko.courant, null);
  assert.equal(par.commandes.courant, null, "une exception réseau ne doit pas faire échouer la page");
  assert.equal(par.paiements_ok.courant, 0, "un vrai zéro reste zéro");
});

test("E5 — paiements confirmés datés par la CONFIRMATION, comptes d'essai exclus", () => {
  const ok = ETAPES.find((e) => e.cle === "paiements_ok")!;
  assert.equal(ok.colonneDate, "confirmed_at");
  assert.deepEqual(ok.egal, { status: "confirmed" });
  assert.deepEqual(ETAPES.find((e) => e.cle === "comptes")!.egal, { is_test: false });
});

test("E7 — chaque étape a son libellé, en clé littérale", () => {
  const src = readFileSync("components/admin/entonnoir-semaine.tsx", "utf8");
  for (const e of ETAPES) assert.match(src, new RegExp(`\\b${e.cle}: "funnel\\.step\\.${e.cle}"`), `libellé manquant : ${e.cle}`);
});

test("E6 — la page admin charge l'entonnoir et le REND", () => {
  const src = readFileSync("app/admin/page.tsx", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.match(src, /const entonnoir = await chargerEntonnoir\(admin as unknown as ClientComptage, new Date\(\)\);/);
  assert.match(src, /<EntonnoirSemaine lignes=\{entonnoir\} lang=\{await getLang\(\)\}\/>/);
});
