import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailRelance, envoyerRelances, langueRelance, montant, type RelanceDue } from "../lib/relances-paiement";

/**
 * RELANCES DE PAIEMENT ABANDONNÉ (0124) — ce qui doit rester vrai.
 * La sélection (qui est relancé) est éprouvée en SQL :
 * `supabase/tests/relances_paiement.test.sql`. Ici : le texte, l'ordre des
 * gestes, et les branchements.
 */

const BASE = "https://zabelie.com";
const JETON = "0b6b4c1e-8a4e-4d0b-9f43-2a1c3d4e5f60";

test("RP1 — l'e-mail parle la langue de l'achat, renvoie à la fiche et au désabonnement", () => {
  const vus = new Set<string>();
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    const m = emailRelance({ lang, titre: "Gid Kreyòl", slug: "gid kreyol", prixHtg: 12500, jeton: JETON, base: BASE });
    assert.ok(m.subject.includes("Gid Kreyòl"), `${lang} : le sujet nomme le produit`);
    assert.ok(m.html.includes(`href="${BASE}/produit/gid%20kreyol"`), `${lang} : lien vers la fiche`);
    assert.ok(m.html.includes(`href="${BASE}/desabonnement/${JETON}"`), `${lang} : lien de désabonnement visible`);
    assert.ok(m.html.includes("12 500 HTG"), `${lang} : montant lisible`);
    assert.equal(m.headers["List-Unsubscribe"], `<${BASE}/api/desabonnement?jeton=${JETON}>`);
    assert.equal(m.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    vus.add(m.subject);
  }
  assert.equal(vus.size, 4, "chaque langue a son propre texte");
  assert.equal(langueRelance("ht"), "ht");
  assert.equal(langueRelance("es"), "es");
  assert.equal(langueRelance("en"), "en");
  assert.equal(langueRelance("de"), "ht", "langue inconnue → kreyòl");
  assert.equal(montant(999), "999");
  assert.equal(montant(1000000), "1 000 000");
});

test("RP2 — le titre d'un vendeur n'entre jamais en HTML ; le sujet reste sur une ligne", () => {
  const m = emailRelance({ lang: "fr", titre: `<img src=x onerror=alert(1)>"\nBcc: x@y`, slug: "s", prixHtg: 1, jeton: JETON, base: BASE });
  assert.ok(!m.html.includes("<img"), "balise du vendeur échappée");
  assert.ok(m.html.includes("&lt;img src=x onerror=alert(1)&gt;&quot;"));
  assert.ok(!/[\r\n]/.test(m.subject), "aucun saut de ligne dans le sujet");
});

const due: Partial<RelanceDue> = { order_id: "o", buyer_id: "b", product_id: "p", email: "a@b.c", lang: "ht", titre: "T", slug: "t", prix_htg: 500, jeton: JETON };

/** Base factice : enregistre l'ordre des gestes. */
function fausseBase(dues: Partial<RelanceDue>[] | null, opts: { conflit?: boolean; erreurReservation?: boolean; sansJeton?: boolean } = {}) {
  const gestes: string[] = [];
  const admin = {
    rpc: async (nom: string) => {
      gestes.push(`rpc:${nom}`);
      // Une erreur PostgREST peut venir avec des données : l'erreur seule doit suffire à arrêter.
      if (nom === "zabelie_relances_dues") return dues ? { data: dues, error: null } : { data: [due], error: { message: "x" } };
      return opts.sansJeton ? { data: null, error: { message: "x" } } : { data: "11111111-2222-4333-8444-555555555555", error: null };
    },
    from: () => ({
      insert: () => ({ select: () => ({ maybeSingle: async () => {
        gestes.push("reserver");
        if (opts.conflit) return { data: null, error: { code: "23505" } };
        if (opts.erreurReservation) return { data: null, error: { code: "42501" } };
        return { data: { id: "r1" }, error: null };
      } }) }),
      update: (champs: { statut: string }) => ({ eq: async () => { gestes.push(`marquer:${champs.statut}`); return { error: null }; } }),
    }),
  } as unknown as SupabaseClient;
  return { admin, gestes };
}

test("RP3 — réserver AVANT d'envoyer ; un échec d'envoi est marqué, jamais retenté", async () => {
  const ok = fausseBase([due]);
  const envoyes: string[] = [];
  const b = await envoyerRelances(ok.admin, async (m) => { envoyes.push(m.to); ok.gestes.push("envoyer"); return true; }, BASE);
  assert.deepEqual(ok.gestes, ["rpc:zabelie_relances_dues", "reserver", "envoyer", "marquer:envoyee"]);
  assert.deepEqual(envoyes, ["a@b.c"]);
  assert.equal(b.envoyees, 1);

  const ko = fausseBase([due]);
  const b2 = await envoyerRelances(ko.admin, async () => false, BASE);
  assert.deepEqual(ko.gestes.slice(-1), ["marquer:echec"]);
  assert.equal(b2.echecs, 1);

  // Sans jeton en base : il est créé avant l'envoi, pour que le lien existe.
  const sansJeton = fausseBase([{ ...due, jeton: null }]);
  await envoyerRelances(sansJeton.admin, async () => { sansJeton.gestes.push("envoyer"); return true; }, BASE);
  assert.deepEqual(sansJeton.gestes, ["rpc:zabelie_relances_dues", "reserver", "rpc:zabelie_email_jeton", "envoyer", "marquer:envoyee"]);

  // Jeton impossible à créer : pas d'e-mail sans lien de désabonnement.
  const jetonKo = fausseBase([{ ...due, jeton: null }], { sansJeton: true });
  let partis = 0;
  const b3 = await envoyerRelances(jetonKo.admin, async () => { partis++; return true; }, BASE);
  assert.equal(partis, 0, "un e-mail sans lien de désabonnement est parti");
  assert.equal(b3.echecs, 1);

  // La langue de l'achat atteint l'e-mail.
  const es = fausseBase([{ ...due, lang: "es" }]);
  let sujet = "";
  await envoyerRelances(es.admin, async (m) => { sujet = m.subject; return true; }, BASE);
  assert.match(sujet, /^Su pago/);
});

test("RP4 — réservée ailleurs, réservation en erreur, base indisponible : RIEN ne part", async () => {
  for (const [nom, base, attendu] of [
    ["conflit", fausseBase([due], { conflit: true }), "dejaReservees"],
    ["erreur", fausseBase([due], { erreurReservation: true }), "erreurBase"],
    ["base", fausseBase(null), "erreurBase"],
  ] as const) {
    let envois = 0;
    const b = await envoyerRelances(base.admin, async () => { envois++; return true; }, BASE);
    assert.equal(envois, 0, `${nom} : un e-mail est parti`);
    assert.ok(attendu === "dejaReservees" ? b.dejaReservees === 1 : b.erreurBase, `${nom} : bilan ${JSON.stringify(b)}`);
  }
});

test("RP5 — branchements : cron planifié, e-mail absent → rien réservé, langue enregistrée, désabonnement en POST seul", () => {
  const crons = JSON.parse(readFileSync("vercel.json", "utf8")).crons as { path: string }[];
  assert.ok(crons.some((c) => c.path === "/api/relances"), "le cron des relances n'est pas planifié");

  const route = readFileSync("app/api/relances/route.ts", "utf8");
  const garde = route.search(/if \(!isEmailEnabled\(\)\) \{\s*journal\(\{ ignore: "email_non_configure" \}\);\s*return /);
  assert.ok(garde > 0, "sans fournisseur, le passage doit s'arrêter");
  assert.ok(garde < route.indexOf("envoyerRelances(admin"), "…et AVANT de réserver la moindre relance");

  const checkout = readFileSync("app/api/checkout/route.ts", "utf8");
  assert.match(checkout, /\.from\("orders"\)\s*\.insert\(\{[\s\S]{0,1600}zabelie_lang: lang,\s*\}\)/, "la commande enregistre la langue de l'achat");

  const desabo = readFileSync("app/api/desabonnement/route.ts", "utf8");
  assert.doesNotMatch(desabo, /export (async )?function GET|export const GET/, "un GET désabonnerait via les scanners de liens");
  const page = readFileSync("app/desabonnement/[jeton]/page.tsx", "utf8");
  assert.match(page, /<form method="post" action="\/api\/desabonnement"/, "la page ne coupe rien seule : le bouton poste");
  assert.doesNotMatch(page, /\.rpc\(/, "la page n'appelle pas le désabonnement au chargement");
});
