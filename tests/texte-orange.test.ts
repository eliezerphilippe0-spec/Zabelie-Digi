import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * L'ORANGE DE TEXTE EST `--accent`, JAMAIS `--brand` — cliquet (audit du
 * 2026-10-27, constat M7).
 *
 * MESURÉ au rendu (Chromium, 360/768/1280 px) au commit acc72c9 : le badge
 * « −NN % » de la fiche produit, le compte à rebours flash et le statut KYC
 * « approuvé » étaient en `text-brand` (#e0580f), en 12 px. Contraste : 3,56:1
 * sur crème, 3,71 sur carte — sous le seuil de 4,5:1 du texte normal. Le
 * thème le disait déjà (`app/zabelie-theme.css`, règle QA-A4 : « NE JAMAIS
 * les utiliser comme COULEUR DE TEXTE ») ; rien ne le vérifiait, et la porte de
 * contraste ne mesurait `--brand` qu'en GRAPHIQUE (3:1), où il passe.
 *
 * Deux gardes, et elles ne se recouvrent pas :
 *   • la porte de contraste mesure désormais `--accent` au seuil du TEXTE
 *     (la valeur qu'on DOIT employer est lisible) ;
 *   • ce cliquet interdit la classe `text-brand` (et `color: var(--color-brand)`
 *     en CSS) dans `app/` et `components/` (la valeur qu'on ne doit PAS
 *     employer n'apparaît pas). Une palette parfaite ne protège de rien si le
 *     composant pointe sur le mauvais token.
 *
 * ─── LE CLIQUET ─────────────────────────────────────────────────────────────
 * Trois usages restent, inventoriés un par un après lecture du code — jamais
 * « de tête » :
 *   • trois traits d'icône (`IconeStudio`, svg `aria-hidden`, `stroke-current`)
 *     → graphique, seuil 3:1, la paire « --brand (graphique) » les mesure ;
 *   • le survol des liens du pied de page, sur le fond `chrome` → la paire
 *     « --brand (texte au survol) sur chrome » le mesure (4,71:1 / 5,79:1) ;
 *   • (le prix flash de `flash-manager.tsx`, 12 px gras à 3,71:1, inventorié
 *     comme défaut au premier passage, est passé en `text-accent` : retiré.)
 * Un usage NOUVEAU fait rougir ; un usage listé qui DISPARAÎT aussi — on
 * retire sa ligne dans le même commit (péremption dans les deux sens).
 *
 * Mutations éprouvées (2026-10-27), chacune restaurée puis revue au vert :
 *   `flash-countdown.tsx` : `text-accent` → `text-brand`            → O1, O5 rouges
 *   `kyc-form.tsx` : `approved` → `text-brand`                      → O1, O5 rouges
 *   `paires()` : la ligne `--accent (texte)` retirée                → O3 rouge
 *   `tableau-de-bord` : `text-brand` déplacé de l'icône vers le `<p>`
 *     voisin (même compte de jetons, mais devenu TEXTE)             → O2 rouge
 */

const RACINES = ["app", "components"];

/** Commentaires retirés : le motif y apparaît légitimement en prose. */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/*
 * Le jeton : `text-brand`, avec ses variantes (`hover:`, `md:`,
 * `aria-[…]:`) et une opacité éventuelle, BORNÉ des deux côtés — ni
 * `text-on-brand`, ni `bg-brand`, ni `border-brand` ne sont un texte orange.
 * En CSS : `color: var(--color-brand)`, sans attraper `background-color` ni
 * `border-color`. Drapeau `g` : ces deux motifs ne servent QU'à `matchAll`,
 * jamais de prédicat (`CLAUDE.md`, le regex `/g` qui ment un appel sur deux).
 */
const JETON_TSX = /[^\s"'`{}()]*(?<![\w-])text-brand(?:\/\d{1,3})?(?![\w/-])/g;
const JETON_CSS = /(?<![\w-])color:\s*var\(--color-brand\)/g;

export function jetonsTexteBrand(src: string, css = false): string[] {
  const propre = sansCommentaires(src);
  return [...propre.matchAll(css ? JETON_CSS : JETON_TSX)].map((m) => m[0].replace(/\s+/g, " "));
}

function fichiers(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e).replace(/\\/g, "/");
    if (statSync(f).isDirectory()) {
      if (e !== "node_modules") fichiers(f, out);
    } else if (/\.(tsx?|css)$/.test(e)) out.push(f);
  }
  return out;
}

function mesurer(): Record<string, string[]> {
  const reel: Record<string, string[]> = {};
  for (const r of RACINES) {
    for (const f of fichiers(r)) {
      const j = jetonsTexteBrand(readFileSync(f, "utf8"), f.endsWith(".css"));
      if (j.length) reel[f] = j.sort();
    }
  }
  return reel;
}

type Entree = {
  jetons: string[];
  nature: "graphique" | "chrome" | "defaut";
  pourquoi: string;
  /** Pour un usage ADMIS : le contexte qui le justifie, qui doit couvrir CHAQUE jeton. */
  contexte?: RegExp;
};

const ICONE = /<IconeStudio\b[^>]*\bclassName="[^"]*(?<![\w-])text-brand(?![\w/-])[^"]*"/g;

/** L'INVENTAIRE — mesuré le 2026-10-27, après correction de M7. Ne peut que décroître. */
const INVENTAIRE: Record<string, Entree> = {
  "app/tableau-de-bord/page.tsx": {
    jetons: ["text-brand", "text-brand"],
    nature: "graphique",
    pourquoi: "trait des icônes `IconeStudio` des actions vendeur (svg aria-hidden) — graphique, 3,71:1 sur carte ≥ 3:1",
    contexte: ICONE,
  },
  "app/tableau-de-bord/creation/page.tsx": {
    jetons: ["text-brand"],
    nature: "graphique",
    pourquoi: "trait des icônes `IconeStudio` des actions de création (svg aria-hidden) — graphique",
    contexte: ICONE,
  },
  "components/site-footer.tsx": {
    jetons: ["hover:text-brand"],
    nature: "chrome",
    pourquoi: "survol des liens du pied, posés sur `bg-chrome` uni — 4,71:1 (clair) et 5,79:1 (sombre), mesurés par la porte",
    contexte: /const LIEN =\s*"[^"]*(?<![\w-])hover:text-brand(?![\w/-])[^"]*";/g,
  },
};

type Instrument = {
  lirePalettes: (css: string) => { sombre: Record<string, string>; clair: Record<string, string> };
  ratio: (a: string, b: string) => number;
  paires: (T: Record<string, string>) => [string, string, string, number][];
};
const charge = (): Promise<Instrument> =>
  import("../scripts/zabelie-contrast.mjs") as unknown as Promise<Instrument>;

// ── L'instrument, éprouvé avant qu'on lui fasse confiance ───────────────────

test("O-scanner — connu-POSITIF : le texte orange est vu, variantes et opacité comprises", () => {
  assert.deepEqual(jetonsTexteBrand('<span className="text-xs font-bold text-brand">x</span>'), ["text-brand"]);
  assert.deepEqual(jetonsTexteBrand('const L = "text-sm hover:text-brand md:min-h-7";'), ["hover:text-brand"]);
  assert.deepEqual(jetonsTexteBrand("<p className={`a ${ok ? \"text-brand/80\" : \"\"}`}>"), ["text-brand/80"]);
  assert.deepEqual(jetonsTexteBrand(".x { color: var(--color-brand); }", true), ["color: var(--color-brand)"]);
});

test("O-scanner — connu-NÉGATIF : fonds, bordures, texte SUR l'orange et commentaires ignorés", () => {
  const src = `
    <a className="bg-brand text-on-brand border-brand bg-brand/10 text-accent hover:border-brand/60">
    {/* text-brand cité en prose */}
    // text-brand dans un commentaire de ligne
    <span className="context-brand text-branded">`;
  assert.deepEqual(jetonsTexteBrand(src), []);
  assert.deepEqual(
    jetonsTexteBrand(".x { background-color: var(--color-brand); border-color: var(--color-brand); }", true),
    []
  );
});

// ── Le cliquet ──────────────────────────────────────────────────────────────

test("O1 — aucun `text-brand` nouveau, aucun progrès non enregistré", () => {
  const reel = mesurer();
  const temoin = Object.values(reel).flat().length;
  assert.ok(temoin > 0, "témoin : zéro jeton lu — l'inventaire ne peut plus rien vérifier (le scanner lit-il encore ?)");
  const problemes: string[] = [];
  for (const f of new Set([...Object.keys(reel), ...Object.keys(INVENTAIRE)])) {
    const mesure = reel[f] ?? [];
    const attendu = [...(INVENTAIRE[f]?.jetons ?? [])].sort();
    // Différence de MULTIENSEMBLES, dans les deux sens.
    const reste = [...attendu];
    const nouveaux = mesure.filter((j) => {
      const i = reste.indexOf(j);
      if (i === -1) return true;
      reste.splice(i, 1);
      return false;
    });
    for (const j of nouveaux) {
      problemes.push(`NOUVEAU texte orange en --brand — ${f} : « ${j} ». Employer \`text-accent\` (4,73:1 sur crème), pas l'inventorier.`);
    }
    for (const j of reste) {
      problemes.push(`PROGRÈS non enregistré — ${f} : « ${j} » a disparu. Retirer sa ligne de l'INVENTAIRE dans ce même commit.`);
    }
  }
  assert.deepEqual(problemes, [], `\n${problemes.join("\n")}`);
});

test("O2 — chaque usage ADMIS est expliqué par son contexte, jeton par jeton", () => {
  for (const [f, e] of Object.entries(INVENTAIRE)) {
    if (e.nature === "defaut") continue;
    assert.ok(e.contexte, `${f} : un usage admis sans contexte qui le justifie`);
    const src = sansCommentaires(readFileSync(f, "utf8"));
    assert.equal(
      src.match(e.contexte)?.length ?? 0,
      e.jetons.length,
      `${f} : ${e.jetons.length} jeton(s) inventorié(s) comme « ${e.nature} », mais le contexte n'en couvre pas autant — un texte s'est glissé parmi eux`
    );
  }
  // Ce qui fait d'IconeStudio un GRAPHIQUE : décoratif, et coloré par son trait.
  const icone = readFileSync("components/studio-icones.tsx", "utf8");
  assert.match(icone, /aria-hidden="true"/);
  assert.match(icone, /className=\{`shrink-0 fill-none stroke-current \$\{className\}`\}/);
  // Ce qui fait du survol du pied un texte sur CHROME : le fond du pied.
  assert.match(sansCommentaires(readFileSync("components/site-footer.tsx", "utf8")), /<footer className="[^"]*\bbg-chrome\b[^"]*">/);
});

// ── La porte de contraste mesure l'orange de TEXTE ──────────────────────────

test("O3 — la porte mesure `--accent` au seuil du TEXTE, sur crème et sur carte, dans les deux palettes", async () => {
  const { lirePalettes, paires, ratio } = await charge();
  const { clair, sombre } = lirePalettes(readFileSync("app/zabelie-theme.css", "utf8"));
  for (const [nom, T] of [["clair", clair], ["sombre", sombre]] as const) {
    const p = paires(T).filter(([n]) => n.startsWith("--accent (texte) sur "));
    const fonds = p.map(([n]) => n.slice("--accent (texte) sur ".length)).sort();
    assert.deepEqual(fonds, ["bg-1", "bg-3", "surface-brown", "surface-maroon", "surface-neutral"], `${nom} : fonds de l'orange de texte`);
    for (const [n, fg, bg, seuil] of p) {
      assert.equal(seuil, 4.5, `${nom} : ${n} doit être au seuil du texte`);
      assert.equal(fg, T.accent, `${nom} : ${n} doit mesurer le token --accent`);
      assert.ok(ratio(fg, bg) >= seuil, `${nom} : ${n} échoue avec les tokens réels`);
    }
    // Connu-POSITIF : la valeur fautive de M7 (--brand employé comme texte)
    // à la place de --accent fait tomber ces paires en clair.
    if (nom === "clair") {
      const fautif = paires({ ...T, accent: T.brand }).filter(([n, f, b, s]) => n.startsWith("--accent (texte)") && ratio(f, b) < s);
      assert.equal(fautif.length, 5, "l'orange --brand en texte (3,56:1) doit faire échouer les cinq paires — sinon la porte ne voit pas M7");
    }
  }
});

test("O4 — l'exception du pied de page est MESURÉE : --brand en texte sur chrome, seuil 4,5", async () => {
  const { lirePalettes, paires, ratio } = await charge();
  const { clair, sombre } = lirePalettes(readFileSync("app/zabelie-theme.css", "utf8"));
  for (const T of [clair, sombre]) {
    const p = paires(T).find(([n]) => n === "--brand (texte au survol) sur chrome");
    assert.ok(p, "la paire qui justifie `hover:text-brand` du pied a disparu de la porte");
    const [, fg, bg, seuil] = p;
    assert.equal(seuil, 4.5);
    assert.deepEqual([fg, bg], [T.brand, T.chrome]);
    assert.ok(ratio(fg, bg) >= seuil);
    // Connu-POSITIF : sur le deuxième arrêt du dégradé (plus clair), il échoue.
    const truque = paires({ ...T, chrome: T["chrome-2"] }).find(([n]) => n === "--brand (texte au survol) sur chrome")!;
    assert.ok(ratio(truque[1], truque[2]) < 4.5, "la paire ne discrimine pas un fond plus clair");
  }
});

// ── Les trois corrections, sur ce qui les COMMANDE ──────────────────────────

test("O5 — badges −% de la fiche, compte à rebours et statut KYC approuvé portent le bon token", () => {
  const fiche = sansCommentaires(readFileSync("app/produit/[slug]/page.tsx", "utf8"));
  for (const calcul of [
    "pourcentageRabais\\(product\\.priceHTG, flash\\.prixFlashHtg\\)",
    "pourcentageRabais\\(compareHtg, product\\.priceHTG\\)",
  ]) {
    const m = fiche.match(new RegExp(`<span className="([^"]*)">\\s*−\\{${calcul}\\}%`));
    assert.ok(m, `badge −% introuvable pour ${calcul}`);
    const c = m[1].split(/\s+/);
    assert.ok(c.includes("text-accent") && !c.some((x) => x.includes("text-brand")), `badge −% : « ${m[1]} »`);
  }
  const compte = sansCommentaires(readFileSync("components/flash-countdown.tsx", "utf8"));
  const span = compte.match(/return \(\s*<span className="([^"]*)">\s*\{prefix\}/);
  assert.ok(span, "le rendu du compte à rebours est introuvable");
  assert.ok(span[1].split(/\s+/).includes("text-accent"), `compte à rebours : « ${span[1]} »`);
  // La CONDITION avec sa cible : c'est `approved` qui doit rendre le vert.
  const kyc = sansCommentaires(readFileSync("components/kyc-form.tsx", "utf8"));
  assert.match(kyc, /statut === "approved"\s*\?\s*"[^"]*\btext-success-text\b[^"]*"/, "le statut approuvé n'est plus en vert de texte");
});
