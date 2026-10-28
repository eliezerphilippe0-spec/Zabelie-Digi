import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lienProduit, lignesCommissionnees, PRODUITS_COMMISSIONNES_MAX } from "../lib/affiliation-catalogue";

/**
 * « Produits qui rapportent » (audit UX-01). Deux familles de contrôles :
 *
 *  1. le module pur, éprouvé sur un cas connu-POSITIF et sur chaque cas
 *     connu-NÉGATIF — un filtre qui n'a jamais rien écarté n'a pas encore
 *     démontré qu'il le pouvait (CLAUDE.md, « un instrument non éprouvé ») ;
 *  2. la page et le composant, sur ce qui COMMANDE : d'où la liste est lue, à
 *     quelle condition, et ce que l'écran fait d'une lecture impossible.
 */

const LECTEUR = "11111111-1111-4111-8111-111111111111";
const AUTRE = "22222222-2222-4222-8222-222222222222";

const produit = (surcharge: Record<string, unknown> = {}) => ({
  id: "p1",
  slug: "formation-en-ia-4fcvl",
  title: "Formation en IA",
  price_htg: 1500,
  seller_id: AUTRE,
  status: "published",
  ...surcharge,
});
const ligne = (rate_bps: unknown, p: unknown) => ({ rate_bps, product: p });

test("connu-POSITIF : une ligne valide est montrée, avec ses champs", () => {
  assert.deepEqual(lignesCommissionnees([ligne(1000, produit())], LECTEUR), [
    { id: "p1", slug: "formation-en-ia-4fcvl", title: "Formation en IA", priceHtg: 1500, rateBps: 1000 },
  ]);
});

test("connu-POSITIF : `product` en tableau (forme PostgREST alternative) est accepté", () => {
  assert.equal(lignesCommissionnees([ligne(1000, [produit()])], LECTEUR).length, 1);
});

test("connu-NÉGATIF : le produit du lecteur est écarté (auto-attribution refusée)", () => {
  assert.deepEqual(lignesCommissionnees([ligne(1000, produit({ seller_id: LECTEUR }))], LECTEUR), []);
});

test("connu-NÉGATIF : produit masqué par la RLS (absent), non publié ou gratuit", () => {
  const lues = [
    ligne(1000, null),
    ligne(1000, produit({ status: "draft" })),
    ligne(1000, produit({ status: "archived" })),
    ligne(1000, produit({ price_htg: 0 })),
  ];
  assert.deepEqual(lignesCommissionnees(lues, LECTEUR), []);
});

test("connu-NÉGATIF : taux nul, négatif ou non entier — jamais « 0 % » comme promesse", () => {
  for (const taux of [0, -5, 12.5, "1000", null, undefined]) {
    assert.deepEqual(lignesCommissionnees([ligne(taux, produit())], LECTEUR), [], `taux ${String(taux)}`);
  }
});

test("connu-NÉGATIF : prix non entier ou non numérique (règle dure n°3, entiers)", () => {
  for (const prix of [10.5, "1500", null]) {
    assert.deepEqual(lignesCommissionnees([ligne(1000, produit({ price_htg: prix }))], LECTEUR), []);
  }
});

test("entrée qui n'est pas un tableau : liste vide, jamais d'exception", () => {
  for (const x of [null, undefined, {}, "x", 3]) assert.deepEqual(lignesCommissionnees(x, LECTEUR), []);
});

test("tri : le taux le plus haut d'abord, puis l'ordre alphabétique", () => {
  const lues = [
    ligne(500, produit({ id: "a", title: "B" })),
    ligne(2000, produit({ id: "b", title: "Z" })),
    ligne(500, produit({ id: "c", title: "A" })),
  ];
  assert.deepEqual(
    lignesCommissionnees(lues, LECTEUR).map((l) => l.id),
    ["b", "c", "a"]
  );
});

test("lienProduit : la fiche du produit, portant ?ref=<code>", () => {
  assert.equal(
    lienProduit("https://zabelie.com", "formation-en-ia-4fcvl", "abcd2345"),
    "https://zabelie.com/produit/formation-en-ia-4fcvl?ref=abcd2345"
  );
  // Une barre finale sur l'origine ne doit pas produire « // ».
  assert.equal(lienProduit("https://zabelie.com/", "x", "abcd2345"), "https://zabelie.com/produit/x?ref=abcd2345");
});

test("lienProduit : un code au format invalide ne fabrique AUCUN lien", () => {
  // Même regex que la contrainte SQL et le proxy : un lien qui n'attribue rien
  // serait pire qu'un bouton absent.
  for (const code of ["", "AB", "ABCDEF12", "ab cd2345", "abcd2345abcd23456", "abc?ref=1"]) {
    assert.equal(lienProduit("https://zabelie.com", "x", code), null, `code « ${code} »`);
  }
});

test("lienProduit : le slug est encodé (jamais d'injection dans l'URL)", () => {
  assert.equal(
    lienProduit("https://zabelie.com", "a/b?c=d", "abcd2345"),
    "https://zabelie.com/produit/a%2Fb%3Fc%3Dd?ref=abcd2345"
  );
});

// ─────────────────────── Page et composant : ce qui commande ────────────────────

const PAGE = readFileSync("app/tableau-de-bord/affiliation/page.tsx", "utf8");
const MANAGER = readFileSync("components/affiliation-manager.tsx", "utf8");

test("page : la liste est lue sous la SESSION de l'affilié, pas en service-role", () => {
  // La visibilité publique des fiches (comptes d'essai exclus, 0101) vit dans la
  // RLS de `products`. La liaison : la requête sur zabelie_affiliate_rates part
  // de `supabase` (createClient), jamais de `admin` — sinon une fiche d'essai
  // serait proposée à un affilié qu'aucun acheteur ne peut ouvrir.
  assert.match(PAGE, /const supabase = await createClient\(\)/);
  assert.match(
    PAGE,
    /await supabase\s*\.from\("zabelie_affiliate_rates"\)[\s\S]{0,300}\.eq\("product\.status", "published"\)/,
    "La lecture des produits commissionnés doit partir de la session de l'affilié."
  );
});

test("page : seulement publiés, jamais les siens, jamais les gratuits", () => {
  assert.match(PAGE, /\.neq\("product\.seller_id", user\.id\)/);
  assert.match(PAGE, /\.gt\("product\.price_htg", 0\)/);
});

test("page : rien n'est lu tant que le programme est fermé", () => {
  assert.match(PAGE, /if \(!dormant\) \{[\s\S]{0,120}const supabase = await createClient\(\)/);
});

test("page : une lecture en erreur devient null, pas une liste vide", () => {
  assert.match(PAGE, /commissionnes = errLues\s*\?\s*null/);
});

test("page : le lien est fabriqué depuis le code lu en base, pas depuis le client", () => {
  assert.match(PAGE, /lien: code \? lienProduit\(siteUrl\(\), l\.slug, code\) : null/);
});

test("page : le plafond de lecture est celui du module", () => {
  assert.match(PAGE, /\.limit\(PRODUITS_COMMISSIONNES_MAX\)/);
  assert.ok(PRODUITS_COMMISSIONNES_MAX > 0 && PRODUITS_COMMISSIONNES_MAX <= 100);
});

test("composant : la liste n'existe que pour un affilié qui a un code", () => {
  const iBranche = MANAGER.indexOf("monCode ? (");
  const iListe = MANAGER.indexOf("labels.pTitre");
  const iDevenir = MANAGER.indexOf("labels.devenir");
  assert.ok(iBranche > 0 && iListe > iBranche, "la liste doit être DANS la branche `monCode`");
  assert.ok(iListe < iDevenir, "et avant la branche « devenir affilié »");
});

test("composant : « lecture impossible » et « aucun produit » sont deux écrans", () => {
  assert.match(
    MANAGER,
    /commissionnes === null \?[\s\S]{0,200}labels\.pIndispo[\s\S]{0,300}commissionnes\.length === 0 \?[\s\S]{0,200}labels\.pVide/
  );
});

test("composant : le code suit la prop serveur (pas un état figé sur la valeur initiale)", () => {
  assert.match(MANAGER, /const monCode = code \?\? codeInscrit/);
  assert.doesNotMatch(MANAGER, /useState<string \| null>\(code\)/);
});

test("composant : le bouton copier n'apparaît qu'avec un lien", () => {
  assert.match(MANAGER, /\{p\.lien && \(\s*<CopyField value=\{p\.lien\}/);
});
