import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { secretEgal } from "../lib/secret-egal";
import { pageDesactivee } from "../lib/pages-desactivees";

/**
 * Correctifs de l'audit pré-lancement du 2026-10-29 (docs/78), lot 1 — ce qui
 * COMMANDE chaque garde, pas le libellé qu'elle produit.
 */
const lire = (f: string) => readFileSync(f, "utf8");
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
function routes(dir = "app/api"): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? routes(p) : n === "route.ts" ? [p] : [];
  });
}

// ───────────── L3 — secrets comparés en temps constant ─────────────

test("L3 — secretEgal : égal, différent, longueur différente, attendu absent", () => {
  assert.equal(secretEgal("s3cr3t-cron-valeur", "s3cr3t-cron-valeur"), true);
  assert.equal(secretEgal("s3cr3t-cron-valeuR", "s3cr3t-cron-valeur"), false);
  assert.equal(secretEgal("court", "s3cr3t-cron-valeur"), false);
  assert.equal(secretEgal("", ""), false, "un secret vide n'ouvre jamais");
  assert.equal(secretEgal("x", undefined), false);
  assert.equal(secretEgal(null, "s3cr3t"), false);
  assert.equal(secretEgal(undefined, "s3cr3t"), false);
  // Le temps constant ne se voit pas dans un résultat : c'est la construction qui le porte.
  const src = sansCommentaires(lire("lib/secret-egal.ts"));
  assert.match(src, /if \(!attendu \|\| typeof recu !== "string"\) return false;/);
  assert.match(src, /return timingSafeEqual\(empreinte\(recu\), empreinte\(attendu\)\);/);
  assert.match(src, /createHash\("sha256"\)/);
});

const COMPARAISON_NUE = /(?:===|!==)\s*(?:cron|manual|cronSecret|reconcileSecret)\b|\b(?:cron|manual|cronSecret|reconcileSecret)\s*(?:===|!==)/;

test("L3 — le détecteur voit une comparaison nue (connu-positif) et ignore la forme sûre (connu-négatif)", () => {
  assert.match('if (cron && bearer === cron) return true;', COMPARAISON_NUE);
  assert.match('if (req.headers.get("x") === manual) return true;', COMPARAISON_NUE);
  assert.doesNotMatch('if (cron && secretEgal(bearer, cron)) return true;', COMPARAISON_NUE);
});

test("L3 — aucune route ne compare un secret de cron ou manuel avec === ; toutes passent par secretEgal", () => {
  const fichiers = [...routes(), "lib/admin-gate.ts"];
  const lecteurs = fichiers.filter((f) => /process\.env\.(CRON_SECRET|RECONCILE_SECRET)/.test(lire(f)));
  assert.ok(lecteurs.length >= 12, `lecteurs de secret : ${lecteurs.length}`);
  for (const f of lecteurs) {
    const src = sansCommentaires(lire(f));
    assert.doesNotMatch(src, COMPARAISON_NUE, f);
    assert.match(src, /secretEgal\(bearer, (cron|cronSecret)\)/, f);
  }
});

// ───────────── L4 — pas de message brut de Postgres au visiteur ─────────────

test("L4 — hors administration, aucune route ne renvoie error.message, sauf les refus de saisie nommés ZB069/ZB070", () => {
  // Ce qui part AU VISITEUR : le corps d'une réponse. Les bilans internes du cron (reconcile) restent derrière son secret.
  const brut = /NextResponse\.json\(\s*\{\s*error:\s*error\.message\s*\}/g;
  for (const f of routes().filter((r) => !r.startsWith(join("app", "api", "admin")))) {
    const src = sansCommentaires(lire(f));
    const n = (src.match(brut) ?? []).length;
    if (f.endsWith(join("profile", "route.ts"))) {
      assert.equal(n, 1, f);
      assert.match(src, /error\.message\.includes\("ZB069"\)\)\s*\{\s*return NextResponse\.json\(\{ error: error\.message \}, \{ status: 400 \}\);/);
    } else if (f.endsWith(join("zones", "request", "route.ts"))) {
      assert.equal(n, 1, f);
      assert.match(src, /error\.message\.includes\("ZB070"\)\)\s*\{\s*return NextResponse\.json\(\{ error: error\.message \}, \{ status: 400 \}\);/);
    } else {
      assert.equal(n, 0, `${f} renvoie encore error.message`);
    }
  }
});

test("L4 — echecBase journalise le détail et ne rend que la phrase traduite", () => {
  const src = sansCommentaires(lire("lib/api-erreur.ts"));
  const corps = src.slice(src.indexOf("export async function echecBase"));
  assert.match(corps, /console\.error\(JSON\.stringify\(\{[\s\S]{0,160}message: error\?\.message \?\? null/);
  assert.match(corps, /return erreurTraduite\(cle, status\);\s*\}/);
  assert.doesNotMatch(corps.slice(corps.indexOf("return erreurTraduite")), /error\.message/);
});

// ───────────── L6 — compte suspendu ─────────────

const GARDE = /if \(!user\)[\s\S]{0,160}?\n\s*(?:\/\/[^\n]*\n\s*)?const accountRefusal = await requireActiveAccount\(user\.id\);\s*if \(accountRefusal\) return accountRefusal;/;

test("L6 — les gestes commerciaux et le contenu public refusent un compte suspendu AVANT d'écrire", () => {
  for (const f of ["app/api/business/clients/route.ts", "app/api/business/register/route.ts", "app/api/business/invoices/route.ts",
    "app/api/business/invoices/[id]/send/route.ts", "app/api/business/invoices/[id]/items/route.ts", "app/api/reviews/route.ts", "app/api/profile/route.ts"]) {
    const src = lire(f);
    assert.match(src, GARDE, f);
    const garde = src.indexOf("await requireActiveAccount(user.id)");
    for (const ecriture of [".insert(", ".update(", ".rpc(", ".upsert("]) {
      const i = src.indexOf(ecriture);
      if (i >= 0) assert.ok(garde < i, `${f} : ${ecriture} avant la garde`);
    }
  }
});

test("L6 — codes promo : créer et RÉactiver exigent un compte actif ; désactiver reste permis", () => {
  const src = lire("app/api/coupons/route.ts");
  const post = src.slice(src.indexOf("export async function POST"), src.indexOf("export async function PATCH"));
  assert.match(post, GARDE);
  assert.ok(post.indexOf("requireActiveAccount") < post.indexOf(".insert("));
  const patch = src.slice(src.indexOf("export async function PATCH"));
  assert.match(patch, /if \(body\.active\) \{\s*const accountRefusal = await requireActiveAccount\(user\.id\);\s*if \(accountRefusal\) return accountRefusal;\s*\}/);
  assert.ok(patch.indexOf("requireActiveAccount") < patch.indexOf(".update("));
});

// ───────────── M2 (volet sûr) — facture d'un pro suspendu ─────────────

test("M2 — la facture n'ouvre de paiement que si le PRO de CETTE facture est actif, statut illisible = refus", () => {
  const src = sansCommentaires(lire("app/api/facture/[token]/pay/route.ts"));
  assert.match(src, /\.select\("id, status, total_htg, paid_htg, professional_id"\)/);
  assert.match(src, /\.from\("zabelie_biz_professionals"\)\s*\.select\("user_id"\)\s*\.eq\("id", inv\.professional_id\)/);
  assert.match(src, /encaissable = Boolean\(pro\?\.user_id\) && \(await readSuspension\(admin, pro!\.user_id\)\) === null;/);
  assert.match(src, /\} catch \{\s*encaissable = false;\s*\}/);
  assert.match(src, /let encaissable = false;/);
  const refus = src.indexOf("if (!encaissable)");
  assert.ok(refus > 0 && refus < src.indexOf("createPayment("), "le refus précède l'ouverture de la session MonCash");
});

test("M2 — la CONFIRMATION d'un paiement déjà fait n'est pas bloquée (aucun paiement orphelin)", () => {
  const retour = lire("app/api/moncash/return/route.ts");
  assert.doesNotMatch(retour, /readSuspension|requireActiveAccount/);
});

// ───────────── Soft 404 — pages derrière un interrupteur ─────────────

test("pageDesactivee : création et studio éteints → 404 ; allumés → page ; ailleurs → jamais", () => {
  const eteint = {};
  const allume = { ZABELIE_AUTHORING_ENABLED: "true", ZABELIE_STUDIO_ENABLED: "true" };
  for (const p of ["/tableau-de-bord/creation", "/tableau-de-bord/creation/", "/tableau-de-bord/creation/analyse", "/tableau-de-bord/creation/abc", "/tableau-de-bord/studio"]) {
    assert.equal(pageDesactivee(p, eteint), true, p);
    assert.equal(pageDesactivee(p, allume), false, p);
  }
  assert.equal(pageDesactivee("/tableau-de-bord/creation", { ZABELIE_AUTHORING_ENABLED: "TRUE" }), true, "seule la valeur exacte true ouvre");
  for (const p of ["/tableau-de-bord", "/tableau-de-bord/creationx", "/tableau-de-bord/studio/x", "/vendre", "/creation"]) {
    assert.equal(pageDesactivee(p, eteint), false, p);
  }
});

test("proxy : un interrupteur éteint réécrit en VRAI 404, lu dans l'environnement du serveur", () => {
  const proxy = sansCommentaires(lire("proxy.ts"));
  assert.match(proxy, /const interrupteurEteint = pageDesactivee\(request\.nextUrl\.pathname, \{\s*ZABELIE_AUTHORING_ENABLED: process\.env\.ZABELIE_AUTHORING_ENABLED,\s*ZABELIE_STUDIO_ENABLED: process\.env\.ZABELIE_STUDIO_ENABLED,\s*\}\);/);
  assert.match(proxy, /if \(interrupteurEteint \|\| \(editorialSegment && [^)]*\)\)\) \{\s*const response = NextResponse\.rewrite\(new URL\("\/404", request\.url\), \{ status: 404/);
  const interrupteurs = lire("lib/pages-desactivees.ts");
  assert.match(interrupteurs, /return !creationActive\(env\);/);
  assert.match(interrupteurs, /return !studioEnabled\(env\);/);
});

// ───────────── Le champ photo parle la langue du vendeur ─────────────

test("fiche produit : aucun champ fichier natif visible ; le bouton porte un libellé traduit", () => {
  const form = lire("components/physical-product-form.tsx");
  const champs = form.match(/<input\s+type="file"[\s\S]*?\/>/g) ?? [];
  assert.equal(champs.length, 2);
  for (const c of champs) assert.match(c, /className="sr-only"/, c);
  assert.match(form, /\{photoPreview \? listingLabels\.photoChoose : listingLabels\.photoPick\}\s*<input\s+type="file"/);
  assert.match(lire("app/vendre/physique/page.tsx"), /photoPick: t\(lang, "sell\.physical\.photo\.pick"\)/);
});

// ───────────── /assistant porte son propre titre ─────────────

test("/assistant : titre d'onglet tiré de sa copie traduite, toujours hors index", () => {
  const src = lire("app/assistant/page.tsx");
  assert.match(src, /export async function generateMetadata\(\) \{\s*const lang = await getLang\(\);\s*return \{ title: SHOPPING_COPY\[lang\]\.title, robots: \{ index: false, follow: true \} \};/);
  assert.doesNotMatch(src, /export const metadata/);
});
