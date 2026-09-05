import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { construireSousRayons, normalizeSousRayon } from "../lib/product-categories";

/**
 * UN SOUS-RAYON POUR TOUT PRODUIT (0098) — la section « Recharge » devient réelle.
 *
 * Mesuré avant d'écrire : activer les rayons de recharge de 0097 ne les aurait
 * fait apparaître NULLE PART pour un service. `products.category` ne porte que
 * le département, le formulaire n'offrait que le niveau 1, et les facettes ne
 * lisaient que `zabelie_physical_products`. Douze feuilles de services (0057)
 * souffraient déjà du même défaut : affichées par le catalogue, ignorées par
 * la publication.
 *
 * Ce fichier tient les trois bouts : le constructeur pur des options, la liste
 * blanche serveur, et les fichiers qui COMMANDENT (route, formulaire, lecture).
 *
 * Mutations éprouvées :
 *   SR1  `if (!parent) continue` retiré (feuille orpheline remonte)     → rouge
 *   SR3  normalizeSousRayon accepte un id d'un AUTRE département        → rouge
 *   SR5  la route n'écrit plus `category_id`                            → rouge
 *   SR6  les facettes relisent `zabelie_physical_products`              → rouge
 *   SR7  le formulaire n'efface plus `categoryId` au changement de département → rouge
 */

type L = Parameters<typeof construireSousRayons>[0][number];
const l = (o: Partial<L> & { id: string; level: number; label_fr: string }): L => ({
  parent_id: null, position: 0, label_kr: null, label_en: null, label_es: null, ...o,
});

// Un arbre : département D, rayon R2 (niveau 2), feuille F3 sous R2, et une
// feuille ORPHELINE O3 dont le parent n'est pas dans la liste (inactif).
const ARBRE: L[] = [
  l({ id: "D", level: 1, label_fr: "Digital & services", label_kr: "Dijital & Sèvis" }),
  l({ id: "R2", level: 2, parent_id: "D", label_fr: "Recharge téléphone", label_kr: "Rechaj telefòn", position: 30 }),
  l({ id: "F3", level: 3, parent_id: "R2", label_fr: "Recharge Digicel", label_kr: "Rechaj Digicel", position: 10 }),
  l({ id: "S2", level: 2, parent_id: "D", label_fr: "Services professionnels", label_kr: "Sèvis pwofesyonèl", position: 20 }),
  l({ id: "O3", level: 3, parent_id: "INACTIF", label_fr: "Feuille orpheline" }),
];

test("SR1 — connu-POSITIF et connu-NÉGATIF : niveau 2 et 3 rattachés au département ; l'orpheline est exclue", () => {
  const r = construireSousRayons(ARBRE, "fr");
  const ids = r.map((x) => x.id).sort();
  assert.deepEqual(ids, ["F3", "R2", "S2"]);
  assert.ok(!ids.includes("O3"), "une feuille dont le parent est inactif ne doit pas remonter seule");
  assert.ok(!ids.includes("D"), "un département n'est pas un sous-rayon");
  for (const x of r) assert.equal(x.departement, "Digital & services");
});

test("SR2 — le chemin d'une feuille porte son parent, dans la langue du vendeur", () => {
  const fr = construireSousRayons(ARBRE, "fr").find((x) => x.id === "F3")!;
  assert.equal(fr.chemin, "Recharge téléphone › Recharge Digicel");
  assert.equal(fr.level, 3);
  const ht = construireSousRayons(ARBRE, "ht").find((x) => x.id === "F3")!;
  assert.equal(ht.chemin, "Rechaj telefòn › Rechaj Digicel");
  // Repli sur le français quand la langue manque.
  const es = construireSousRayons(ARBRE, "es").find((x) => x.id === "R2")!;
  assert.equal(es.chemin, "Recharge téléphone");
});

/** Un client Supabase minimal : `from().select().eq()` thenable. */
function fauxClient(lignes: L[]) {
  const q = { eq: () => q, then: (ok: (v: unknown) => void) => ok({ data: lignes, error: null }) };
  return { from: () => ({ select: () => q }) } as never;
}

test("SR3 — liste blanche serveur : absent → null sans erreur ; du bon département → l'id ; d'un AUTRE département → refus", async () => {
  const lignes: L[] = [
    ...ARBRE,
    l({ id: "E", level: 1, label_fr: "Électronique" }),
    l({ id: "T2", level: 2, parent_id: "E", label_fr: "Téléphones & tablettes" }),
  ];
  const c = fauxClient(lignes);
  assert.deepEqual(await normalizeSousRayon(c, undefined, "Digital & services"), { ok: true, id: null });
  assert.deepEqual(await normalizeSousRayon(c, "", "Digital & services"), { ok: true, id: null });
  assert.deepEqual(await normalizeSousRayon(c, "F3", "Digital & services"), { ok: true, id: "F3" });
  // Connu-NÉGATIF : un sous-rayon réel, mais d'un autre département → refus,
  // sinon `category` et `category_id` raconteraient deux rayons.
  assert.deepEqual(await normalizeSousRayon(c, "T2", "Digital & services"), { ok: false });
  assert.deepEqual(await normalizeSousRayon(c, "INEXISTANT", "Digital & services"), { ok: false });
  assert.deepEqual(await normalizeSousRayon(c, 42, "Digital & services"), { ok: false });
});

function sansCommentaires(s: string): string {
  return s.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");
}

test("SR4 — la route digitale VALIDE le sous-rayon contre le département canonique, et refuse sinon", () => {
  const src = sansCommentaires(readFileSync("app/api/products/route.ts", "utf8"));
  assert.match(src, /import \{ normalizeCategory, normalizeSousRayon \} from "@\/lib\/product-categories";/);
  // La LIAISON : validé contre `categorieCanonique`, pas contre la valeur brute du client.
  assert.match(src, /const sousRayon = await normalizeSousRayon\(supabase, body\.categoryId, categorieCanonique\);/);
  assert.match(src, /if \(!sousRayon\.ok\) \{\s*return NextResponse\.json\(\s*\{ error: t\(lang, "api\.category\.unknown"\), code: "subcategory_invalid" \},\s*\{ status: 400 \}/);
});

test("SR5 — la route ÉCRIT le sous-rayon validé, et le physique l'écrit aussi sur `products`", () => {
  const digital = sansCommentaires(readFileSync("app/api/products/route.ts", "utf8"));
  assert.match(digital, /category: categorieCanonique,\s*category_id: sousRayon\.id,/);
  const physique = sansCommentaires(readFileSync("app/api/products/physical/route.ts", "utf8"));
  assert.match(physique, /category: departmentLabel,\s*category_id: category\.id,/);
});

test("SR6 — facettes, filtre et comptes lisent `products.category_id`, plus le physique seul", () => {
  const src = sansCommentaires(readFileSync("lib/taxonomy.ts", "utf8"));
  // Facettes : produits publiés du département, sous-rayon non nul.
  assert.match(src, /\.from\("products"\)\s*\.select\("category_id"\)\s*\.eq\("status", "published"\)\s*\.eq\("category", departmentLabel\)\s*\.not\("category_id", "is", null\)/);
  // Filtre `sous` : ids de produits par sous-rayon, sur products.
  assert.match(src, /\.from\("products"\)\s*\.select\("id"\)\s*\.in\("category_id", ids\)/);
  // Comptes du menu : sur products aussi.
  assert.match(src, /\.from\("products"\)\s*\.select\("category_id"\)\s*\.eq\("status", "published"\)\s*\.not\("category_id", "is", null\)\s*\.limit\(5000\)/);
  // Et plus AUCUNE lecture des facettes/comptes par le physique seul.
  assert.doesNotMatch(src, /from\("zabelie_physical_products"\)/, "les facettes ne doivent plus dépendre de l'extension physique");
  // Le repli par libellé reste, borné aux produits SANS sous-rayon.
  assert.match(src, /\.neq\("kind", KIND_PHYSICAL\)\s*\.is\("category_id", null\)/);
});

test("SR7 — le formulaire : second menu SEULEMENT si le département en a, effacé quand le département change, envoyé facultatif", () => {
  const src = sansCommentaires(readFileSync("components/publish-form.tsx", "utf8"));
  assert.match(src, /const options = sousRayons\.filter\(\(s\) => s\.departement === form\.category\);\s*if \(options\.length === 0\) return null;/);
  assert.match(src, /setForm\(\(f\) => \(\{ \.\.\.f, category: e\.target\.value, categoryId: "" \}\)\)/);
  assert.match(src, /categoryId: form\.categoryId \|\| undefined,/);
  assert.match(src, /aria-label=\{labels\.subcategoryAria\}/);
  // Et la page fournit la liste depuis la base, même source que les rayons.
  const page = sansCommentaires(readFileSync("app/vendre/page.tsx", "utf8"));
  assert.match(page, /const sousRayonsPublication = await lireSousRayonsPublication\(supabase, lang\);/);
  assert.match(page, /sousRayons=\{sousRayonsPublication\}/);
});

test("SR8 — 0098 : la colonne, la FK restrictive, le backfill, et les trois rayons — dans le fichier", () => {
  const sql = readFileSync("supabase/migrations/0098_sous_rayon_tout_produit_rechaj_ouvert.sql", "utf8").replace(/--[^\n]*/g, " ");
  assert.match(sql, /add column if not exists category_id uuid references zabelie_categories \(id\) on delete restrict;/);
  assert.match(sql, /update products p\s+set category_id = pp\.category_id\s+from zabelie_physical_products pp\s+where pp\.product_id = p\.id\s+and p\.category_id is null;/);
  assert.match(sql, /where slug in \('rechaj-telefon', 'rechaj-digicel', 'rechaj-natcom'\)\s+and not active;/);
  assert.match(sql, /if v_ouverts <> 3 then/);
  // Le premier-party reste fermé : aucune trace du drapeau ni de /rechaj ici.
  assert.doesNotMatch(sql, /ZABELIE_TOPUP_FIRSTPARTY_ENABLED\s*=|topup_firstparty/i);
});
