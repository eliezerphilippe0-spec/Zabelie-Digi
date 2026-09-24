import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBriefs, segments } from "../lib/creative/prompt-builder";
import { PROPOSITION, parametresParDefaut } from "../lib/creative/rule";
import { corpsDemande, demandeSchema, indexBrief, lireReponse, NOMBRE_BRIEFS } from "../lib/creative/studio";

/**
 * Studio Créatif, Phase 4 — l'écran vendeur (docs/62). Le comportement vit
 * dans des fonctions pures, testées ici ; le composant ne fait que les câbler.
 */

const PRODUIT = "11800000-0000-4000-8000-000000000010";
const CLE = "11800000-0000-4000-8000-0000000000a1";

test("indexBrief désigne exactement le brief (cadrage, format) choisi à l'écran", () => {
  const r = buildBriefs({ id: "p", price_htg: 1000, imageUrl: "https://cdn.test/p.jpg" }, {});
  assert.ok(r.ok);
  const vus = new Set<number>();
  for (const c of PROPOSITION.cadrages) for (const f of PROPOSITION.formats) {
    const i = indexBrief(c, f);
    vus.add(i);
    assert.equal(r.briefs[i].format, f, `${c}/${f}`);
    // Le cadrage se reconnaît à son segment `contexte`, pris à la source.
    assert.ok(r.briefs[i].prompt.includes(segments(parametresParDefaut(), c, f).contexte!), `${c}/${f}`);
  }
  assert.equal(vus.size, NOMBRE_BRIEFS);
  assert.throws(() => indexBrief("gros_plan", "4:5" as never), /brief_inconnu/);
});

test("corps de demande : accepté par la route, aucun texte libre, prix seulement s'il est consenti", () => {
  const sans = corpsDemande(PRODUIT, CLE, "en_usage", "9:16");
  assert.deepEqual(Object.keys(sans).sort(), ["briefIndex", "idempotencyKey", "productId"]);
  assert.ok(demandeSchema.safeParse(sans).success);
  const avec = corpsDemande(PRODUIT, CLE, "en_usage", "9:16", 10);
  assert.equal(avec.prixConsentiHtg, 10);
  assert.ok(demandeSchema.safeParse(avec).success);
});

test("lecture des réponses : 402 → prix à afficher ; image https seulement ; le reste est une erreur", () => {
  assert.deepEqual(lireReponse(402, { error: "x", code: "paiement_requis", prixHtg: 10 }), { k: "payant", prix: 10 });
  assert.deepEqual(lireReponse(402, { error: "x" }), { k: "erreur", message: "x" }, "402 sans prix : rien à consentir");
  assert.deepEqual(lireReponse(402, { prixHtg: "10" }), { k: "erreur", message: null });
  assert.deepEqual(lireReponse(402, { prixHtg: 2.5 }), { k: "erreur", message: null });
  assert.deepEqual(lireReponse(202, { id: "g1", state: "generating", prixHtg: 0 }), { k: "suivre", id: "g1" });
  assert.deepEqual(lireReponse(200, { id: "g1", state: "requested" }), { k: "suivre", id: "g1" });
  assert.deepEqual(lireReponse(200, { id: "g1", state: "completed", imageUrl: "https://cdn.test/1.png" }), { k: "pret", url: "https://cdn.test/1.png" });
  assert.deepEqual(lireReponse(200, { id: "g1", state: "completed", imageUrl: "javascript:alert(1)" }), { k: "suivre", id: "g1" });
  assert.deepEqual(lireReponse(502, { id: "g1", state: "failed", detail: "http_422", error: "…" }), { k: "echec" });
  assert.deepEqual(lireReponse(429, { error: "Limite", code: "quota_vendeur" }), { k: "erreur", message: "Limite" });
  assert.deepEqual(lireReponse(500, null), { k: "erreur", message: null });
});

// ── Câblage : ce qui COMMANDE, pas ce qui est affiché ────────────────────────

const COMPOSANT = readFileSync("components/studio-generator.tsx", "utf8");
const PAGE = readFileSync("app/tableau-de-bord/studio/page.tsx", "utf8");
const TABLEAU = readFileSync("app/tableau-de-bord/page.tsx", "utf8");

test("le consentement ne part QUE du bouton qui affiche le prix", () => {
  // Un seul appel porte un prix, et il le prend dans l'état `payant`.
  const appels = [...COMPOSANT.matchAll(/lancer\(([^)]*)\)/g)].map((m) => m[1]).filter((a) => !a.includes(":"));
  assert.deepEqual(appels.sort(), ["", "etat.prix"]);
  assert.match(COMPOSANT, /etat\.k === "payant" && \([\s\S]{0,300}labels\.payant\.replace\("\{prix\}", String\(etat\.prix\)\)[\s\S]{0,200}onClick=\{\(\) => lancer\(etat\.prix\)\}/);
});

test("une clé neuve par demande, la même pour le consentement qui la suit", () => {
  assert.match(COMPOSANT, /if \(prixConsentiHtg === undefined \|\| !cle\.current\) cle\.current = crypto\.randomUUID\(\);/);
  assert.match(COMPOSANT, /JSON\.stringify\(corpsDemande\(produit\.id, cle\.current, cadrage, format, prixConsentiHtg\)\)/);
});

test("Studio éteint : ni page ni lien ; le tarif vient de la base", () => {
  assert.match(PAGE, /export default async function StudioPage\(\) \{\s*if \(!studioProvider\(\)\) notFound\(\);/);
  assert.match(TABLEAU, /\{studioProvider\(\) && \(\s*<Link href="\/tableau-de-bord\/studio"/);
  assert.match(PAGE, /const tarif = typeof cfg\?\.gratuit_jour === "number" && typeof cfg\?\.prix_image_htg === "number"/);
  // Seuls les produits DU vendeur, avec une photo https.
  assert.match(PAGE, /\.eq\("seller_id", user\.id\)\.like\("cover_url", "https:\/\/%"\)/);
});
