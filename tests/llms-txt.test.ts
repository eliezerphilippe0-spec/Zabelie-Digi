import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { llmsTxt } from "../lib/llms";

/**
 * `/llms.txt` (GEO) : chaque lien mène à une route qui existe, et aucune phrase
 * ne promet un moyen de paiement — leur ouverture est une décision du porteur.
 */

const BASE = "https://exemple.test";
const texte = llmsTxt(BASE);
const liens = [...texte.matchAll(/\]\((https:\/\/exemple\.test[^)]*)\)/g)].map((m) => new URL(m[1]).pathname);

/** Le fichier de route qui sert ce chemin, dans `app/`. */
function route(chemin: string): string | null {
  const seg = chemin.split("/").filter(Boolean);
  const candidats = [
    `app/${seg.join("/")}/page.tsx`,
    seg.length === 2 && /^(fr|ht|en|es)$/.test(seg[0]) ? `app/[lang]/${seg[1]}/page.tsx` : "",
    seg[0] === "guides" && seg.length === 2 ? "app/guides/[lang]/page.tsx" : "",
    seg[0] === "guides" && seg.length === 3 ? "app/guides/[lang]/[slug]/page.tsx" : "",
    seg[0] === "api" && seg[1] === "v1" && seg.length === 3 ? "app/api/v1/[endpoint]/route.ts" : "",
  ].filter(Boolean);
  return candidats.find((c) => existsSync(c)) ?? null;
}

test("L1 — le fichier a la forme llms.txt : titre, résumé, sections", () => {
  assert.match(texte, /^# Zabelie\n\n> .{80,}/);
  assert.ok((texte.match(/^## /gm) ?? []).length >= 3);
  assert.ok(liens.length >= 20, `seulement ${liens.length} liens`);
});

test("L2 — chaque lien mène à une route existante", () => {
  const morts = liens.filter((l) => route(l) === null);
  assert.deepEqual(morts, [], `liens sans route : ${morts.join(", ")}`);
  assert.match(readFileSync("app/api/v1/[endpoint]/route.ts", "utf8"), /endpoint === "openapi\.json"/, "le contrat OpenAPI cité n'est plus servi");
});

test("L3 — aucun moyen de paiement n'est nommé : c'est une décision du porteur", () => {
  assert.doesNotMatch(texte, /MonCash|NatCash|Stripe|Zelle|Visa|Mastercard|PayPal/i);
  assert.doesNotMatch(texte, /\b(soon|coming|guarantee|best|cheapest|fastest)\b/i, "promesse ou superlatif");
});

test("L4 — la route sert le fichier en texte brut", () => {
  const src = readFileSync("app/llms.txt/route.ts", "utf8");
  assert.match(src, /llmsTxt\(siteUrl\(\)\)/);
  assert.match(src, /"Content-Type": "text\/plain; charset=utf-8"/);
});
