import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IMPORT_DESCRIPTION_MAX, IMPORT_TITRE_MAX, decoderEntites, extraireFiche, texteSeul } from "../lib/import-fiche";
import { IMPORT_REDIRECTIONS_MAX, importerFicheParLien, type Lecteur, type ReponseBrute } from "../lib/import-fiche-serveur";
import { DICT } from "../lib/i18n";
import { loadRoute } from "./helpers/route-harness";

/**
 * IMPORTER UNE FICHE PAR LIEN (lot 2, 2026-11-11).
 *
 * Trois choses sont tenues ici :
 *   1. l'extraction ne rend que du TEXTE, borné, sans jamais inventer une fiche ;
 *   2. le serveur ne se laisse pas envoyer vers une adresse interne, ni
 *      directement ni par redirection ;
 *   3. la route n'écrit rien et n'est ouverte qu'à un vendeur connecté.
 *
 * Les chaînes d'essai portent des accents en FIN de mot (`vandè`, `café`),
 * là où un instrument écrit pour l'anglais se trompe (CLAUDE.md).
 */

const page = (tete: string, corps = "") => `<!doctype html><html><head>${tete}</head><body>${corps}</body></html>`;

// ── 1. Extraction ─────────────────────────────────────────────────────────

test("données structurées d'abord, puis Open Graph, puis les balises ; l'origine est dite", () => {
  const jsonLd = `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: "Boutik" }, { "@type": "Product", name: "Sak kwi pou vandè", description: "Sak fèt alamen, bon pou mache.", brand: { "@type": "Brand", name: "Atelye Lakay" } }] })}</script>`;
  const og = `<meta property="og:title" content="Titre Open Graph"><meta property="og:description" content="Description Open Graph">`;
  const balises = `<title>Titre de page</title><meta name="description" content="Description de page">`;

  assert.deepEqual(extraireFiche(page(jsonLd + og + balises)), { titre: "Sak kwi pou vandè", description: "Sak fèt alamen, bon pou mache.", marque: "Atelye Lakay", origine: "donnees_structurees" });
  assert.deepEqual(extraireFiche(page(og + balises)), { titre: "Titre Open Graph", description: "Description Open Graph", marque: null, origine: "open_graph" });
  assert.deepEqual(extraireFiche(page(balises)), { titre: "Titre de page", description: "Description de page", marque: null, origine: "balises" });
  // Une source sans description emprunte celle d'une autre : le titre le plus précis reste.
  const sansDescription = `<script type="application/ld+json">{"@type":"Product","name":"Café moulu"}</script>` + og;
  assert.deepEqual(extraireFiche(page(sansDescription)), { titre: "Café moulu", description: "Description Open Graph", marque: null, origine: "donnees_structurees" });
});

test("aucune fiche n'est inventée : sans titre publié, rien", () => {
  for (const html of ["", page(""), page(`<meta property="og:description" content="Seulement une description">`), page(`<title>   </title>`), page(`<script type="application/ld+json">{pas du json</script>`)]) {
    assert.equal(extraireFiche(html), null, html.slice(0, 60));
  }
  assert.equal(extraireFiche(42 as unknown as string), null);
});

test("le résultat est du texte : ni balise, ni script, ni caractère de contrôle, accents intacts", () => {
  const html = page(
    `<meta property="og:title" content="Vand&egrave; &amp; caf&#233; &#x2014; l&rsquo;atelye">` +
    `<meta property="og:description" content="&lt;script&gt;alert(1)&lt;/script&gt;&lt;b&gt;Bèl&lt;/b&gt; pwodwi&lt;br&gt;fèt alamen.\u{202e}\u{7}">`
  );
  const f = extraireFiche(html)!;
  assert.equal(f.titre, "Vandè & café — l’atelye");
  assert.equal(f.description, "Bèl pwodwi\nfèt alamen.");
  assert.doesNotMatch(f.titre + f.description, /[<>]|\p{Cf}|[\x00-\x08]/u);
  assert.equal(decoderEntites("&#0; &#xD800; &inconnue; &Eacute;"), "    &inconnue; É");
  assert.equal(texteSeul("<p>Un</p><p>Deux</p>", 100), "Un\nDeux");
});

test("les longueurs sont bornées sur des points de code entiers", () => {
  const long = "é".repeat(IMPORT_TITRE_MAX + 50);
  const f = extraireFiche(page(`<meta property="og:title" content="${long}"><meta property="og:description" content="${"a".repeat(IMPORT_DESCRIPTION_MAX + 500)}">`))!;
  assert.equal(Array.from(f.titre).length, IMPORT_TITRE_MAX);
  assert.equal(f.description.length, IMPORT_DESCRIPTION_MAX);
  // Une émoticône à cheval sur la borne n'est pas coupée en deux.
  const emoji = texteSeul("a".repeat(IMPORT_TITRE_MAX - 1) + "😀😀", IMPORT_TITRE_MAX);
  assert.ok(!/[\ud800-\udbff]$/.test(emoji), "paire de substitution coupée");
  // Un JSON-LD démesuré ou imbriqué ne fait ni planter ni boucler.
  const profond = JSON.stringify({ "@graph": Array.from({ length: 5000 }, () => ({ "@type": "Thing", "@graph": [[[]]] })) });
  assert.equal(extraireFiche(page(`<script type="application/ld+json">${profond}</script>`)), null);
});

// ── 2. Lecture de la page : aucune sortie vers l'intérieur ────────────────

const html200 = (corps: string, type = "text/html; charset=utf-8"): ReponseBrute => ({ status: 200, type, emplacement: null, corps: Buffer.from(corps) });
const vers = (emplacement: string | null, status = 302): ReponseBrute => ({ status, type: "", emplacement, corps: Buffer.alloc(0) });
function lecteur(reponses: Record<string, ReponseBrute | Error>) {
  const lus: string[] = [];
  const lire: Lecteur = async (url) => { lus.push(url); const r = reponses[url]; if (!r) throw new Error("inattendu " + url); if (r instanceof Error) throw r; return r; };
  return { lus, lire };
}
const FICHE = page(`<meta property="og:title" content="Sak kwi"><meta property="og:description" content="Fèt alamen">`);

test("un lien qui n'est pas une adresse https publique n'est jamais lu", async () => {
  for (const url of ["http://exemple.ht/fiche", "https://127.0.0.1/", "https://[::1]/", "https://localhost/x", "https://serveur.internal/x", "https://u:p@exemple.ht/", "https://exemple.ht:8443/", "ftp://exemple.ht/", "exemple.ht/fiche", "", null, 12, "https://" + "a".repeat(600) + ".ht/"]) {
    const { lus, lire } = lecteur({});
    assert.deepEqual(await importerFicheParLien(url, lire), { ok: false, raison: "lien_invalide" }, String(url));
    assert.equal(lus.length, 0, `lu malgré le refus : ${url}`);
  }
});

test("une redirection vers l'intérieur est refusée sans être suivie", async () => {
  for (const cible of ["http://169.254.169.254/latest/meta-data/", "https://169.254.169.254/", "https://localhost/admin", "https://10.0.0.5/", "https://base.internal/", "/\\evil"]) {
    const { lus, lire } = lecteur({ "https://boutique.ht/fiche": vers(cible) });
    const r = await importerFicheParLien("https://boutique.ht/fiche", lire);
    assert.equal(r.ok, false, cible);
    assert.ok(lus.every((u) => u.startsWith("https://boutique.ht/")), `cible interne lue : ${lus.join(", ")}`);
  }
  // Sans en-tête Location, ou en boucle au-delà de la borne : abandon.
  assert.deepEqual(await importerFicheParLien("https://boutique.ht/a", lecteur({ "https://boutique.ht/a": vers(null) }).lire), { ok: false, raison: "illisible" });
  const boucle = lecteur(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`https://boutique.ht/${i}`, vers(`/${i + 1}`)])));
  assert.deepEqual(await importerFicheParLien("https://boutique.ht/0", boucle.lire), { ok: false, raison: "illisible" });
  assert.equal(boucle.lus.length, IMPORT_REDIRECTIONS_MAX + 1, "une lecture d'origine, puis trois redirections au plus");
});

test("une redirection publique est suivie, et la page lue rend sa fiche", async () => {
  const { lus, lire } = lecteur({ "https://boutique.ht/p/1": vers("/fr/p/1", 301), "https://boutique.ht/fr/p/1": vers("https://www.boutique.ht/fr/p/1"), "https://www.boutique.ht/fr/p/1": html200(FICHE) });
  assert.deepEqual(await importerFicheParLien("  https://boutique.ht/p/1#avis ", lire), { ok: true, hote: "www.boutique.ht", fiche: { titre: "Sak kwi", description: "Fèt alamen", marque: null, origine: "open_graph" } });
  assert.deepEqual(lus, ["https://boutique.ht/p/1", "https://boutique.ht/fr/p/1", "https://www.boutique.ht/fr/p/1"]);
});

test("ce qui n'est pas une page HTML lisible est abandonné, sans détail", async () => {
  const cas: Array<[string, ReponseBrute | Error]> = [
    ["404", { ...html200(FICHE), status: 404 }], ["json", html200(`{"og:title":"x"}`, "application/json")], ["image", html200("…", "image/png")],
    ["sans type", html200(FICHE, "")], ["panne", new Error("ECONNRESET mot-de-passe")],
  ];
  for (const [nom, reponse] of cas) {
    const r = await importerFicheParLien("https://boutique.ht/x", lecteur({ "https://boutique.ht/x": reponse }).lire);
    assert.deepEqual(r, { ok: false, raison: "illisible" }, nom);
  }
  assert.deepEqual(await importerFicheParLien("https://boutique.ht/x", lecteur({ "https://boutique.ht/x": html200(page("<title></title>")) }).lire), { ok: false, raison: "rien_trouve" });
  // Une page en latin-1 annoncée comme telle garde ses accents.
  const latin = { status: 200, type: "text/html; charset=iso-8859-1", emplacement: null, corps: Buffer.from(page(`<title>Café vandè</title>`), "latin1") };
  const lu = await importerFicheParLien("https://boutique.ht/x", lecteur({ "https://boutique.ht/x": latin }).lire);
  assert.equal(lu.ok && lu.fiche.titre, "Café vandè");
});

test("le lecteur réel filtre le DNS à la connexion et ne suit aucune redirection de lui-même", () => {
  const src = readFileSync("lib/import-fiche-serveur.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(src, /export const lireHttps: Lecteur = \(url\) =>[\s\S]{0,200}httpsRequest\(url, \{\s*method: "GET",[\s\S]{0,300}lookup: lookupPublic\(\) as never,\s*timeout: IMPORT_DELAI_MS,/);
  assert.match(src, /let url = urlWebhookValide\(brut\);\s*if \(!url\) return \{ ok: false, raison: "lien_invalide" \};/);
  assert.match(src, /const valide = urlWebhookValide\(suivante\);\s*if \(!valide\) return \{ ok: false, raison: "illisible" \};\s*url = valide;/);
  assert.doesNotMatch(src, /\bfetch\(|followRedirect|maxRedirects|cookie/i);
});

// ── 3. La route : vendeur connecté, cadence bornée, aucune écriture ────────

function route(opts: { user?: boolean; quota?: boolean; suspendu?: boolean; resultat?: unknown } = {}) {
  const appels: unknown[] = [];
  const cles: string[] = [];
  const r = loadRoute("app/api/products/import/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: opts.user === false ? null : { id: "vendeur-1" } } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({}) },
    "@/lib/auth": { requireActiveAccount: async () => (opts.suspendu ? Response.json({ error: "suspendu" }, { status: 403 }) : null) },
    "@/lib/api-erreur": { erreurTraduite: async (cle: string, status: number) => Response.json({ error: cle }, { status }) },
    "@/lib/zabelie-rate-limit": { rateLimit: async (_a: unknown, cle: string, limite: number, fenetre: number) => { cles.push(`${cle}|${limite}|${fenetre}`); return opts.quota !== false; } },
    "@/lib/import-fiche-serveur": { importerFicheParLien: async (url: unknown) => { appels.push(url); return opts.resultat ?? { ok: true, hote: "boutique.ht", fiche: { titre: "Sak kwi", description: "Fèt alamen", marque: null, origine: "open_graph" } }; } },
  });
  const post = (corps: string) => r.POST(new Request("https://zabelie.test/api/products/import", { method: "POST", body: corps }));
  return { appels, cles, post };
}

test("route : sans session, compte suspendu ou quota atteint, aucune page n'est lue", async () => {
  for (const [opts, status] of [[{ user: false }, 401], [{ suspendu: true }, 403], [{ quota: false }, 429]] as const) {
    const { appels, post } = route(opts);
    assert.equal((await post(JSON.stringify({ url: "https://boutique.ht/x" }))).status, status);
    assert.equal(appels.length, 0, JSON.stringify(opts));
  }
  const borne = route();
  await borne.post(JSON.stringify({ url: "https://boutique.ht/x" }));
  assert.deepEqual(borne.cles, ["import_fiche:vendeur-1|20|3600"], "cadence par COMPTE, vingt par heure");
});

test("route : elle rend le texte et rien d'autre, et traduit chaque refus", async () => {
  const ok = route();
  const res = await ok.post(JSON.stringify({ url: "https://boutique.ht/x" }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { titre: "Sak kwi", description: "Fèt alamen", marque: null, hote: "boutique.ht" });
  assert.deepEqual(ok.appels, ["https://boutique.ht/x"]);

  for (const [raison, status, cle] of [["lien_invalide", 422, "api.import.url"], ["rien_trouve", 422, "api.import.empty"], ["illisible", 502, "api.import.unreachable"]] as const) {
    const r = await route({ resultat: { ok: false, raison } }).post(JSON.stringify({ url: "https://boutique.ht/x" }));
    assert.equal(r.status, status, raison);
    assert.deepEqual(await r.json(), { error: cle });
  }
  for (const corps of ["pas du json", JSON.stringify({ url: "https://boutique.ht/" + "a".repeat(3000) })]) {
    const mauvais = route();
    assert.equal((await mauvais.post(corps)).status, 422);
    assert.equal(mauvais.appels.length, 0);
  }
});

test("route : aucune écriture, et les refus sont posés avant la lecture", () => {
  const src = readFileSync("app/api/products/import/route.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(src, /\.(insert|update|upsert|delete|rpc)\(|\.from\(/);
  const ordre = ["if (!user) return erreurTraduite(\"api.auth.required\", 401);", "const refus = await requireActiveAccount(user.id);", "rateLimit(admin, `import_fiche:${user.id}`", "await importerFicheParLien(url)"].map((m) => src.indexOf(m));
  assert.ok(ordre.every((i) => i > 0) && ordre.every((i, n) => n === 0 || i > ordre[n - 1]), `ordre des gardes : ${ordre.join(", ")}`);
});

// ── 4. Les formulaires : le vendeur garde la main ─────────────────────────

test("formulaires : rien n'est remplacé sans accord, la politique retombe, les bornes tiennent", () => {
  const fichier = readFileSync("components/publish-form.tsx", "utf8");
  assert.match(fichier, /function appliquerImport\(fiche: FicheRecue\): boolean \{\s*if \(\(form\.title \|\| form\.description\) && !window\.confirm\(importLabels!\.replace\)\) return false;\s*setError\(null\);\s*setPolicyOk\(false\);/);
  assert.match(fichier, /title: fiche\.titre\.slice\(0, PUBLISH_DRAFT_LIMITS\.title\),\s*description: fiche\.description\.slice\(0, PUBLISH_DRAFT_LIMITS\.description\),/);
  assert.match(fichier, /\{importLabels && <ImportFiche labels=\{importLabels\} disabled=\{locked\} onImporte=\{appliquerImport\} \/>\}/);
  const physique = readFileSync("components/physical-product-form.tsx", "utf8");
  assert.match(physique, /function appliquerImport\(fiche: FicheRecue\): boolean \{\s*if \(\(title \|\| description\) && !window\.confirm\(importLabels!\.replace\)\) return false;\s*setError\(null\);\s*setPolicyOk\(false\);\s*setTitle\(fiche\.titre\.slice\(0, 140\)\);\s*setDescription\(fiche\.description\.slice\(0, 5000\)\);/);
  // Ni prix, ni quantité, ni photo ne sont touchés par l'import.
  const corps = physique.slice(physique.indexOf("function appliquerImport"), physique.indexOf("function appliquerImport") + 600);
  assert.doesNotMatch(corps, /setPrice|setQuantity|setPhoto|setVariants/);
  const composant = readFileSync("components/import-fiche.tsx", "utf8");
  assert.match(composant, /fetch\("\/api\/products\/import", \{\s*method: "POST"/);
  assert.match(composant, /className="bouton bouton-secondaire shrink-0"/, "l'action principale du formulaire reste l'envoi");
  for (const pageVendeur of ["app/vendre/page.tsx", "app/vendre/physique/page.tsx"]) {
    assert.match(readFileSync(pageVendeur, "utf8"), /importLabels=\{\{\s*title: t\(lang, "import\.title"\), hint: t\(lang, "import\.hint"\), rights: t\(lang, "import\.rights"\),/);
  }
});

test("les textes existent dans les quatre langues, et la mention des droits y est", () => {
  const cles = ["import.title", "import.hint", "import.rights", "import.url", "import.cta", "import.loading", "import.done", "import.replace", "api.import.url", "api.import.unreachable", "api.import.empty", "api.import.limit"];
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    const d = DICT[lang] as Record<string, string>;
    for (const cle of cles) assert.ok(d[cle] && d[cle].length > 3, `${lang} : ${cle}`);
    assert.ok(d["import.done"].includes("{host}"), `${lang} : import.done sans {host}`);
  }
  assert.notEqual((DICT.ht as Record<string, string>)["import.rights"], (DICT.fr as Record<string, string>)["import.rights"]);
});
