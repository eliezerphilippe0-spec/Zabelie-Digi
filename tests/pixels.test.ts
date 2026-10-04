import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FORMATS_PIXEL, cheminPublicitaire, idValide, idsPixels, lireConsentement, scriptsRegies, DOMAINES_REGIES } from "../lib/pixels";
import { chargerPixels } from "../lib/pixels-client";
import { contentSecurityPolicy } from "../lib/content-security-policy";

const SQL = readFileSync("supabase/migrations/0123_zabelie_seller_pixels.sql", "utf8");

test("X1 — formats stricts : les vrais identifiants passent, aucune injection ; mêmes règles qu'en base", () => {
  assert.equal(idValide("meta", "123456789012345"), "123456789012345");
  assert.equal(idValide("google", " g-ab12cd34ef "), "G-AB12CD34EF");
  assert.equal(idValide("google", "AW-1234567890"), "AW-1234567890");
  assert.equal(idValide("tiktok", "c4abcdef0123456789ab"), "C4ABCDEF0123456789AB");
  for (const [r, v] of [["meta", "123;alert(1)"], ["meta", "1234567"], ["meta", "12345678</script>"], ["google", "G-AB12\"+x+\""], ["google", "UA-123456-1"],
    ["google", "GTM-ABCDEF"], ["tiktok", "C4ABC'); fetch(x)//"], ["tiktok", "SHORT"], ["meta", 12345678]] as const) {
    assert.equal(idValide(r as "meta", v), null, `${r} ${String(v)}`);
  }
  for (const [regie, col] of [["meta", "meta_pixel_id"], ["google", "google_tag_id"], ["tiktok", "tiktok_pixel_id"]] as const) {
    const sql = SQL.match(new RegExp(`${col} ~ '([^']+)'`))![1];
    assert.equal(sql, FORMATS_PIXEL[regie].source, `${regie} : le code et la base divergent`);
  }
  assert.equal(idsPixels({ meta_pixel_id: "bad", google_tag_id: null }), null);
});

test("X2 — consentement : oui, non, ou inconnu — jamais deviné", () => {
  assert.equal(lireConsentement("zab_pub=1"), "oui");
  assert.equal(lireConsentement("a=b; zab_pub=0; c=d"), "non");
  assert.equal(lireConsentement("xzab_pub=1"), "inconnu");
  assert.equal(lireConsentement("zab_pub=2"), "inconnu");
  assert.equal(lireConsentement(""), "inconnu");
});

test("X3 — périmètre : seules les pages d'un vendeur ; la CSP ne s'ouvre qu'avec elles", () => {
  for (const ok of ["/produit/sak-pay", "/boutik/atelye", "/createur/abc", "/paiement/succes"]) assert.equal(cheminPublicitaire(ok), true, ok);
  for (const non of ["/", "/catalogue", "/tableau-de-bord/api", "/produit/a/b", "/connexion", "/paiement/echec", "/api/v1/search_products"]) assert.equal(cheminPublicitaire(non), false, non);
  const nonce = "a".repeat(24);
  const fermee = contentSecurityPolicy(nonce), ouverte = contentSecurityPolicy(nonce, false, undefined, { publicite: true });
  for (const d of DOMAINES_REGIES) assert.ok(!fermee.includes(d), `${d} présent hors pages vendeur`);
  const directive = (p: string, n: string) => p.split("; ").find((x) => x.startsWith(n + " "))!;
  for (const n of ["img-src", "connect-src"]) for (const d of DOMAINES_REGIES) assert.ok(directive(ouverte, n).includes(d), `${n} sans ${d}`);
  assert.equal(directive(ouverte, "script-src"), directive(fermee, "script-src"), "script-src ne doit jamais s'ouvrir aux régies");
  assert.match(readFileSync("proxy.ts", "utf8"), /contentSecurityPolicy\(nonce, [^)]*\{ publicite: cheminPublicitaire\(request\.nextUrl\.pathname\) \}\)/);
});

/** Faux navigateur minimal. */
function navigateur() {
  const scripts: string[] = [];
  const stockage = new Map<string, string>();
  const doc = {
    querySelector: (sel: string) => (scripts.some((s) => sel.includes(s)) ? {} : null),
    createElement: () => ({ async: false, src: "" }),
    head: { appendChild: (s: { src: string }) => { scripts.push(s.src); } },
  } as unknown as Document;
  const w = { localStorage: { getItem: (k: string) => stockage.get(k) ?? null, setItem: (k: string, v: string) => void stockage.set(k, v) } } as unknown as Window & Record<string, unknown>;
  return { w, doc, scripts };
}

test("X4 — chargement : événements de la page envoyés, scripts des seules régies configurées", () => {
  const { w, doc, scripts } = navigateur();
  chargerPixels({ meta: "123456789012345", google: "G-AB12CD34EF" }, { type: "produit", productId: "p1", valeurHtg: 2500 }, w, doc);
  const fbq = w.fbq as unknown as { queue: unknown[][] };
  assert.deepEqual(fbq.queue.map((a) => a.slice(0, 2)), [["init", "123456789012345"], ["track", "PageView"], ["track", "ViewContent"]]);
  assert.deepEqual((fbq.queue[2][2] as { value: number; currency: string }).value, 2500);
  const dl = (w.dataLayer as IArguments[]).map((a) => Array.from(a));
  assert.deepEqual(dl.map((a) => a[0]), ["js", "config", "event"]);
  assert.equal(dl[2][1], "view_item");
  assert.deepEqual(scripts, scriptsRegies({ meta: "123456789012345", google: "G-AB12CD34EF" }));
  assert.ok(!scripts.some((s) => s.includes("tiktok")), "une régie non configurée ne charge rien");
});

test("X5 — achat : compté une seule fois par commande, dédoublonné par l'identifiant de commande", () => {
  const { w, doc } = navigateur();
  const achat = { type: "achat" as const, orderId: "o-42", productId: "p1", valeurHtg: 1500 };
  chargerPixels({ meta: "123456789012345", tiktok: "C4ABCDEF0123456789AB" }, achat, w, doc);
  chargerPixels({ meta: "123456789012345", tiktok: "C4ABCDEF0123456789AB" }, achat, w, doc);
  const fbq = w.fbq as unknown as { queue: unknown[][] };
  const achats = fbq.queue.filter((a) => a[1] === "Purchase");
  assert.equal(achats.length, 1, "un rechargement de page ne recompte pas l'achat");
  assert.deepEqual(achats[0][3], { eventID: "o-42" });
  const ttq = w.ttq as unknown as unknown[][];
  assert.deepEqual(ttq.filter((a) => a[0] === "track").map((a) => [a[1], (a[3] as { event_id: string }).event_id]), [["CompletePayment", "o-42"]]);
});

test("X6 — rien ne se charge sans « oui » ; l'achat ne vient que d'une commande PAYÉE ; écriture par la session", () => {
  const comp = readFileSync("components/seller-pixels.tsx", "utf8");
  assert.match(comp, /if \(consentement !== "oui" \|\| charge\.current\) return;\s*charge\.current = true;\s*chargerPixels\(ids, evenement\);/);
  assert.equal(comp.match(/chargerPixels\(/g)?.length, 1, "un seul site d'appel, celui qui est gardé");
  const succes = readFileSync("app/paiement/succes/page.tsx", "utf8");
  assert.match(succes, /sellerId: ligne && \["paid", "delivered"\]\.includes\(ligne\.status\) \?/);
  assert.match(succes, /montantHtg: ligne && \["paid", "delivered"\]\.includes\(ligne\.status\) \?/);
  const route = readFileSync("app/api/account/pixels/route.ts", "utf8");
  assert.match(route, /const id = idValide\(regie, brut\);\s*if \(!id\) return NextResponse\.json\([^;]{0,200}status: 422 \}\);/);
  assert.doesNotMatch(route, /createAdminClient/, "l'écriture passe par la session (RLS), pas par le service");
});
