import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AI_DESCRIPTION_MAX,
  aiProviderDisponible,
  consigneSysteme,
  genererDescription,
} from "../lib/ai-description";

/**
 * Aide IA à la rédaction — le contrat vérifié dans les deux sens :
 * clé absente → service éteint (aucun bouton, 503), clé posée → appel
 * fournisseur borné. Jamais un appel réseau réel dans cette suite : le
 * fetch est injecté.
 */

function sansCles() {
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.GEMINI_MODEL;
}

// ── Le kill-switch ──────────────────────────────────────────────────────────

test("aucune clé → aucun fournisseur (le service n'existe pas)", () => {
  sansCles();
  assert.equal(aiProviderDisponible(), null);
});

test("OPENAI_API_KEY posée → openai ; GEMINI seule → gemini ; les deux → openai", () => {
  sansCles();
  process.env.GEMINI_API_KEY = "g-test";
  assert.equal(aiProviderDisponible(), "gemini");
  process.env.OPENAI_API_KEY = "sk-test";
  assert.equal(aiProviderDisponible(), "openai");
  sansCles();
});

test("clé faite d'espaces → toujours éteint (une variable vide n'allume rien)", () => {
  sansCles();
  process.env.OPENAI_API_KEY = "   ";
  assert.equal(aiProviderDisponible(), null);
  sansCles();
});

test("genererDescription sans clé : refuse au lieu d'appeler dans le vide", async () => {
  sansCles();
  await assert.rejects(
    () => genererDescription({ title: "Savon lokal", lang: "ht" }),
    /aucun fournisseur/
  );
});

// ── Les garde-fous métier vivent dans la consigne, donc ils se testent ──────

test("la consigne interdit l'invention, la livraison, le prix — et porte la langue", () => {
  const c = consigneSysteme("ht");
  assert.match(c, /n'invente aucune/);
  assert.match(c, /livraison/);
  assert.match(c, /prix/);
  assert.match(c, /kreyòl ayisyen/);
  assert.match(consigneSysteme("es"), /espagnol/);
});

// ── OpenAI : forme de la requête, parsing, erreurs ──────────────────────────

function fauxFetch(reponse: unknown, status = 200) {
  const appels: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: unknown, init?: RequestInit) => {
    appels.push({ url: String(url), init: init! });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => reponse,
    } as Response;
  }) as typeof fetch;
  return { fetcher, appels };
}

test("openai : Bearer en en-tête, titre et catégorie dans le message, contenu rendu borné", async () => {
  sansCles();
  process.env.OPENAI_API_KEY = "sk-test";
  const { fetcher, appels } = fauxFetch({
    choices: [{ message: { content: "  Bon savon fèt an Ayiti.  " } }],
  });
  const texte = await genererDescription(
    { title: "Savon lokal", category: "Bèlte ak swen", lang: "ht" },
    fetcher
  );
  assert.equal(texte, "Bon savon fèt an Ayiti.");
  assert.equal(appels.length, 1);
  assert.match(appels[0].url, /api\.openai\.com\/v1\/chat\/completions/);
  const headers = appels[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer sk-test");
  const corps = JSON.parse(String(appels[0].init.body));
  assert.equal(corps.messages[0].role, "system");
  assert.match(corps.messages[1].content, /Savon lokal/);
  assert.match(corps.messages[1].content, /Bèlte ak swen/);
  sansCles();
});

test("openai : HTTP non-2xx → rejet (jamais une chaîne vide silencieuse)", async () => {
  sansCles();
  process.env.OPENAI_API_KEY = "sk-test";
  const { fetcher } = fauxFetch({ error: "x" }, 429);
  await assert.rejects(
    () => genererDescription({ title: "Savon", lang: "fr" }, fetcher),
    /openai 429/
  );
  sansCles();
});

test("openai : réponse sans contenu → rejet", async () => {
  sansCles();
  process.env.OPENAI_API_KEY = "sk-test";
  const { fetcher } = fauxFetch({ choices: [] });
  await assert.rejects(
    () => genererDescription({ title: "Savon", lang: "fr" }, fetcher),
    /réponse vide/
  );
  sansCles();
});

test("la sortie est bornée à AI_DESCRIPTION_MAX", async () => {
  sansCles();
  process.env.OPENAI_API_KEY = "sk-test";
  const { fetcher } = fauxFetch({
    choices: [{ message: { content: "x".repeat(AI_DESCRIPTION_MAX * 2) } }],
  });
  const texte = await genererDescription({ title: "Savon", lang: "fr" }, fetcher);
  assert.equal(texte.length, AI_DESCRIPTION_MAX);
  sansCles();
});

// ── Gemini : clé en EN-TÊTE (jamais dans l'URL), parsing multi-parts ────────

test("gemini : x-goog-api-key en en-tête, URL sans clé, parts concaténées", async () => {
  sansCles();
  process.env.GEMINI_API_KEY = "g-test";
  const { fetcher, appels } = fauxFetch({
    candidates: [{ content: { parts: [{ text: "Bon " }, { text: "savon." }] } }],
  });
  const texte = await genererDescription({ title: "Savon", lang: "fr" }, fetcher);
  assert.equal(texte, "Bon savon.");
  assert.match(appels[0].url, /generativelanguage\.googleapis\.com/);
  assert.ok(!appels[0].url.includes("g-test"), "la clé fuit dans l'URL");
  const headers = appels[0].init.headers as Record<string, string>;
  assert.equal(headers["x-goog-api-key"], "g-test");
  const corps = JSON.parse(String(appels[0].init.body));
  assert.match(corps.systemInstruction.parts[0].text, /marketplace haïtien/);
  sansCles();
});

test("gemini : HTTP non-2xx → rejet", async () => {
  sansCles();
  process.env.GEMINI_API_KEY = "g-test";
  const { fetcher } = fauxFetch({}, 500);
  await assert.rejects(
    () => genererDescription({ title: "Savon", lang: "fr" }, fetcher),
    /gemini 500/
  );
  sansCles();
});

// ── La route : structurel — la CONDITION avec sa cible, pas le libellé ──────

const ROUTE = readFileSync("app/api/ai/description/route.ts", "utf8");

test("route : kill-switch — pas de fournisseur → 503, PREMIÈRE garde de la route", () => {
  assert.match(
    ROUTE,
    /if \(!fournisseur\)[\s\S]{0,200}status: 503/,
    "la condition d'extinction a disparu ou ne rend plus 503"
  );
  // Et elle vient AVANT l'auth : une route éteinte ne consomme rien.
  assert.ok(
    ROUTE.indexOf("aiProviderDisponible()") < ROUTE.indexOf("getUser"),
    "le kill-switch doit précéder l'authentification"
  );
});

test("route : auth requise (401), suspension bloquée (403)", () => {
  assert.match(ROUTE, /if \(!user\)[\s\S]{0,200}status: 401/);
  assert.match(ROUTE, /getSuspension\(user\.id\)[\s\S]{0,300}status: 403/);
});

test("route : débit borné par utilisateur, rafale ET journée, sinon 429", () => {
  assert.match(ROUTE, /rateLimit\(admin, `ai_desc:\$\{user\.id\}`/);
  assert.match(ROUTE, /rateLimit\(admin, `ai_desc_jour:\$\{user\.id\}`/);
  assert.match(ROUTE, /if \(!okMinute \|\| !okJour\)[\s\S]{0,200}status: 429/);
});

test("route : la langue vient du serveur (cookie), jamais du corps de requête", () => {
  assert.match(ROUTE, /lang: await getLang\(\)/);
  assert.ok(!/body\.lang/.test(ROUTE), "la langue ne se prend pas du client");
});

// ── Les surfaces : le bouton n'existe que si le serveur l'a allumé ──────────

test("composant : !actif → null (pas de clé, pas de bouton)", () => {
  const src = readFileSync("components/ai-description-help.tsx", "utf8");
  assert.match(src, /if \(!actif\) return null/);
  // La suggestion REMPLIT, elle ne soumet pas : le composant n'a pas de
  // type="submit", et il appelle onSuggestion.
  assert.match(src, /type="button"/);
  assert.match(src, /onSuggestion\(data\.description\)/);
});

test("les deux formulaires vendeur montent le bouton (frontière, pas sous-chaîne)", () => {
  for (const f of [
    "components/publish-form.tsx",
    "components/physical-product-form.tsx",
  ]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /<AiDescriptionHelp[\s>]/, `${f} ne monte pas l'aide`);
  }
});

test("les deux pages vendeur décident aiActif au serveur via aiProviderDisponible", () => {
  for (const f of ["app/vendre/page.tsx", "app/vendre/physique/page.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.match(
      src,
      /aiActif=\{aiProviderDisponible\(\) !== null\}/,
      `${f} ne calcule pas aiActif côté serveur`
    );
  }
});
