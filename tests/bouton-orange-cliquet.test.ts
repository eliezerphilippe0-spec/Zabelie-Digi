import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * LES BOUTONS ORANGE ÉCRITS À LA MAIN — un cliquet, pas un gel (audit du
 * système de design du 2026-10-27, constat m5).
 *
 * `components/bouton.tsx` existe : un CTA orange s'écrit `<Bouton>`. Les 95
 * copies mesurées au commit `acc72c9` ne disparaissent pas d'un coup — chacune
 * vit dans un fichier qu'un autre chantier tient (panier, fiche produit,
 * formulaires vendeur). Les migrer toutes serait un chantier ; les geler toutes
 * serait mentir. Même forme que `tests/i18n-chaines-en-dur.test.ts` :
 *
 *   • un fichier gagne un bouton orange écrit à la main → ROUGE. La dette ne
 *     grandit plus : écrire `<Bouton>` à la place ;
 *   • un fichier en perd un → ROUGE AUSSI, tant que l'inventaire n'est pas
 *     décrémenté dans le même commit. Une liste qui ne sait que grandir devient
 *     une conformité par usure ; une liste qui se vide sans témoin ne prouve
 *     pas le progrès.
 *
 * ─── CE QUI EST COMPTÉ, exactement ──────────────────────────────────────────
 * Une chaîne de classes — littéral `"…"` ou gabarit `` `…` `` — d'un `.tsx`
 * de `app/` ou `components/`, commentaires retirés, qui porte À LA FOIS
 * `bg-brand` et `text-on-brand` comme classes ENTIÈRES (ni `bg-brand/10`, ni
 * `hover:bg-brand`) et PAS `rounded-full` : la règle des rayons du thème fait
 * d'un `rounded-full` une pastille ou un badge, pas un bouton. Le composant
 * lui-même est hors compte : c'est la source. Mesuré ainsi à `acc72c9` : 95.
 *
 * ─── POUR L'INTÉGRATEUR : RECALER APRÈS FUSION ──────────────────────────────
 * Six branches modifient des boutons orange en parallèle ; l'inventaire
 * ci-dessous est figé sur l'état de la branche du lot 6. Après fusion :
 *
 *     npx tsx --test tests/bouton-orange-cliquet.test.ts
 *
 * Le message d'échec imprime l'inventaire MESURÉ, trié, prêt à recopier à la
 * place de `INVENTAIRE`. Ne recopier qu'après avoir lu les lignes « NOUVEAU » :
 * un nouveau bouton écrit à la main ne s'inventorie pas, il s'écrit `<Bouton>`.
 */

const RACINES = ["app", "components"];
const SOURCE = "components/bouton.tsx";

function fichiersTsx(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e).replace(/\\/g, "/");
    if (statSync(f).isDirectory()) {
      if (e !== "node_modules") fichiersTsx(f, out);
    } else if (/\.tsx$/.test(e)) out.push(f);
  }
  return out;
}

/** Une classe ENTIÈRE : ni préfixe de variante (`hover:`), ni suffixe (`/10`, `-text`). */
const classe = (nom: string) => new RegExp(`(?<![\\w:/-])${nom}(?![\\w/-])`);
const BG_BRAND = classe("bg-brand");
const ON_BRAND = classe("text-on-brand");
const PASTILLE = classe("rounded-full");

/** Le nombre de boutons orange écrits à la main dans une source `.tsx`. */
export function boutonsOrange(src: string): number {
  // Commentaires retirés : une explication qui CITE les classes n'est pas un bouton.
  // `://` (une URL dans une chaîne) n'ouvre pas de commentaire.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  let n = 0;
  for (const m of code.matchAll(/"([^"\n]*)"|`([^`]*)`/g)) {
    const s = m[1] ?? m[2];
    if (BG_BRAND.test(s) && ON_BRAND.test(s) && !PASTILLE.test(s)) n++;
  }
  return n;
}

/** L'inventaire RÉEL du dépôt : fichier → nombre, fichiers à zéro omis, trié. */
export function mesurer(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const racine of RACINES) {
    for (const f of fichiersTsx(racine).sort()) {
      if (f === SOURCE) continue;
      const n = boutonsOrange(readFileSync(f, "utf8"));
      if (n > 0) out[f] = n;
    }
  }
  return out;
}

/**
 * L'INVENTAIRE — mesuré par `mesurer()`, jamais édité « de tête ».
 * Pour DÉCRÉMENTER : baisser (ou retirer) la ligne dans le même commit que la
 * migration vers `<Bouton>`. Pour AUGMENTER : ne pas.
 */
const INVENTAIRE: Record<string, number> = {
  "app/a-propos/page.tsx": 1,
  "app/admin/domaines/domaines-admin.tsx": 1,
  "app/admin/essayage/essayage-admin.tsx": 1,
  "app/admin/kyc/kyc-admin.tsx": 1,
  "app/admin/points-retrait/pickup-admin.tsx": 1,
  "app/catalogue/page.tsx": 5,
  "app/categories/page.tsx": 1,
  "app/desabonnement/[jeton]/page.tsx": 1,
  "app/error.tsx": 1,
  "app/guides/[lang]/[slug]/page.tsx": 1,
  "app/indisponible/page.tsx": 1,
  "app/mes-achats/page.tsx": 2,
  "app/mes-ventes/page.tsx": 1,
  "app/messages/page.tsx": 1,
  "app/not-found.tsx": 1,
  "app/page.tsx": 1,
  // app/paiement/{succes,echec} : 2 + 2 → 0, migrés vers <Bouton> (lot 6, m5).
  "app/panier/page.tsx": 3,
  "app/pro/page.tsx": 1,
  "app/produit/[slug]/page.tsx": 1,
  "app/recharges/page.tsx": 2,
  "app/tableau-de-bord/boutique/page.tsx": 1,
  "app/tableau-de-bord/clients/page.tsx": 1,
  "app/tableau-de-bord/codes-promo/page.tsx": 1,
  "app/tableau-de-bord/page.tsx": 2,
  "app/vendre/physique/page.tsx": 1,
  "components/admin-mfa-form.tsx": 2,
  "components/admin/identity-block.tsx": 1,
  "components/ai-description-help.tsx": 1,
  "components/api-keys-manager.tsx": 1,
  "components/authoring-create-form.tsx": 1,
  "components/authoring-editor.tsx": 5,
  "components/authoring-soumission.tsx": 1,
  "components/boutique-vue.tsx": 1,
  "components/bouton-imprimer.tsx": 1,
  "components/bouton-reessayer.tsx": 1,
  "components/business/invoice-editor.tsx": 1,
  "components/business/pay-invoice-button.tsx": 1,
  "components/business/pro-console.tsx": 3,
  "components/buy-button.tsx": 1,
  "components/cart-pay-all.tsx": 1,
  "components/cart-pay-button.tsx": 1,
  "components/collection-page.tsx": 1,
  "components/connexion-form.tsx": 1,
  "components/desinstaller-sw.tsx": 1,
  "components/digital-details-editor.tsx": 1,
  "components/digital-studio-editor.tsx": 1,
  "components/domain-form.tsx": 1,
  "components/essayage-feuille.tsx": 1,
  "components/flash-manager.tsx": 1,
  "components/forgot-password-form.tsx": 1,
  "components/message-form.tsx": 1,
  "components/payout-form.tsx": 1,
  "components/payout-queue.tsx": 1,
  "components/payout-request.tsx": 2,
  "components/physical-product-form.tsx": 2,
  "components/pixels-form.tsx": 1,
  "components/product-offers-editor.tsx": 1,
  "components/publish-form.tsx": 1,
  "components/reponse-avis-form.tsx": 1,
  "components/reset-password-form.tsx": 2,
  "components/review-form.tsx": 1,
  "components/seller-pixels.tsx": 1,
  "components/shopping-assistant.tsx": 3,
  "components/studio-generator.tsx": 2,
  "components/vendeur-premier-pas.tsx": 1,
  "components/webhooks-manager.tsx": 1,
  "components/zabelie-coupon-manager.tsx": 1,
  "components/zabelie-topup-form.tsx": 1,
  "components/zelle-reference-form.tsx": 1,
};

// ── L'instrument, éprouvé AVANT qu'on lui fasse confiance ───────────────────

test("instrument — connu-POSITIF : littéral, gabarit, constante, ordre quelconque", () => {
  assert.equal(boutonsOrange(`<a className="bouton rounded-xl bg-brand px-5 text-on-brand">x</a>`), 1);
  assert.equal(boutonsOrange("const p = `${bouton} bouton bg-brand text-on-brand`;"), 1);
  assert.equal(boutonsOrange(`const C = "text-on-brand font-bold bg-brand rounded-lg";`), 1);
  assert.equal(boutonsOrange(`c ? "bg-brand text-on-brand" : "border border-line"`), 1);
});

test("instrument — connu-NÉGATIF : teintes, variantes d'état, pastilles, commentaires", () => {
  for (const src of [
    `"bg-brand/10 text-on-brand"`, // teinte de survol, pas un fond plein
    `"hover:bg-brand text-on-brand"`, // état, pas le fond
    `"bg-brand text-cloud"`, // texte qui n'est pas on-brand
    `"rounded-full bg-brand px-2 text-on-brand"`, // pastille (règle des rayons)
    `/* "bg-brand text-on-brand" */`, // explication
    `// className="bg-brand text-on-brand"`,
    `"bg-brand-x text-on-brand"`, // autre classe dont bg-brand est un préfixe
  ]) {
    assert.equal(boutonsOrange(src), 0, `faux positif sur ${src}`);
  }
  // Une URL dans une chaîne ne doit pas avaler la suite de la ligne comme un commentaire.
  assert.equal(boutonsOrange(`href="https://x.y" className="bg-brand text-on-brand"`), 1);
});

// ── Le cliquet ──────────────────────────────────────────────────────────────

test("aucun bouton orange écrit à la main en plus, aucun progrès non enregistré", () => {
  const reel = mesurer();
  const problemes: string[] = [];
  for (const f of new Set([...Object.keys(reel), ...Object.keys(INVENTAIRE)])) {
    const mesure = reel[f] ?? 0;
    const attendu = INVENTAIRE[f] ?? 0;
    if (mesure > attendu) {
      problemes.push(`NOUVEAU — ${f} : ${mesure} bouton(s) orange écrit(s) à la main (inventaire : ${attendu}). Écrire <Bouton> (components/bouton.tsx).`);
    } else if (mesure < attendu) {
      problemes.push(`PROGRÈS non enregistré — ${f} : ${mesure} au lieu de ${attendu}. Décrémenter l'INVENTAIRE dans ce même commit.`);
    }
  }
  const total = Object.values(reel).reduce((a, b) => a + b, 0);
  assert.deepEqual(
    problemes,
    [],
    `\n${problemes.join("\n")}\n\nInventaire MESURÉ (${total} au total), à recopier après lecture :\n` +
      JSON.stringify(reel, null, 2)
  );
});
