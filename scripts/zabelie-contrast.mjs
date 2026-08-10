/**
 * QC contraste — WCAG AA (4.5:1 texte, 3:1 graphique).
 *
 * RÉÉCRIT le 2026-08-10 (revue accueil, UI-04). L'ancienne version portait sa
 * propre table de couleurs — le violet #17123A, des surfaces marron — figée
 * sur la palette ABANDONNÉE le 2026-07-25. Elle annonçait 7 échecs sur un
 * thème qui n'était plus déployé, sortait en 0, et n'était appelée par
 * aucune CI : un instrument dont le périmètre ne recouvrait plus son nom.
 *
 * Trois corrections de fond :
 *   1. les tokens sont LUS depuis `app/zabelie-theme.css` — la source unique
 *      annoncée par ce fichier même. Plus de table à « garder en phase » :
 *      une table recopiée finit toujours par diverger, c'est mesuré ;
 *   2. la sortie est ≠ 0 dès qu'une paire échoue, et la CI l'appelle —
 *      un contrôle qui ne bloque rien est un vœu ;
 *   3. une POLICE D'OPACITÉ : `text-mist/NN` et `text-cloud/NN` sous /80
 *      sont interdits dans app/ et components/ (commentaires exclus).
 *      C'est la forme exacte du défaut UI-01 — 2,82:1 sur les seize rangées
 *      de la colonne des rayons — que l'ancienne version, qui ne testait que
 *      des paires nommées, ne pouvait pas voir. Seuils : /80 = 5,41:1 sur le
 *      fond le plus sombre, mesuré ; en-dessous, ça descend sous 4,5.
 *
 * Éprouvé (règle du dépôt : connu-positif ET connu-négatif avant confiance) :
 * voir `tests/contraste-instrument.test.ts` — le test injecte un token
 * assombri et un `text-mist/50` dans des copies et attend l'échec.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ─── Lecture des tokens — la source unique, pas une copie ────────────────────

export function lireTokens(css) {
  const tokens = {};
  for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    tokens[m[1]] = m[2].toLowerCase();
  }
  return tokens;
}

// ─── Arithmétique WCAG ───────────────────────────────────────────────────────

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => {
  const [r, g, b] = c.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => {
  const [l1, l2] = [lum(hex(a)), lum(hex(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
/** Compose `fg` à `pct` par-dessus `bg` (le rendu d'un `bg-x/10` ou d'un `/60`). */
export const mix = (fg, bg, pct) => {
  const [f, b] = [hex(fg), hex(bg)];
  return (
    "#" +
    f
      .map((v, i) => Math.round(v * pct + b[i] * (1 - pct)))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
};

// ─── Les paires — celles que le code UTILISE, pas un idéal ───────────────────

export function paires(T) {
  const NORMAL = 4.5;
  const LARGE = 3;
  const fonds = [
    ["bg-1", T["bg-1"]],
    ["bg-3", T["bg-3"]],
    ["surface-neutral", T["surface-neutral"]],
    ["surface-maroon", T["surface-maroon"]],
    ["surface-brown", T["surface-brown"]],
  ];
  const out = [];
  for (const [nom, fond] of fonds) {
    out.push([`--cloud sur ${nom}`, T.cloud, fond, NORMAL]);
    out.push([`--mist sur ${nom}`, T.mist, fond, NORMAL]);
    // Badges : texte `*-text` sur teinte 10 % de la base (l'usage mesuré du
    // dépôt : bg-success/10, bg-danger/10), par-dessus chaque fond.
    for (const etat of ["success", "warning", "danger", "info"]) {
      out.push([
        `--${etat}-text sur teinte 10 % / ${nom}`,
        T[`${etat}-text`],
        mix(T[etat], fond, 0.1),
        NORMAL,
      ]);
    }
    // Graphiques (pastilles, traits) : seuil 3:1.
    out.push([`--accent (graphique) sur ${nom}`, T.accent, fond, LARGE]);
    out.push([`--brand (graphique) sur ${nom}`, T.brand, fond, LARGE]);
  }
  // CTA : texte sombre sur orange vif — la paire de ::selection et des boutons.
  out.push(["--ink sur CTA --brand", T.ink, T.brand, NORMAL]);
  return out;
}

// ─── Police d'opacité — la classe du défaut UI-01 ────────────────────────────

const RACINES = ["app", "components"];
const MOTIF_OPACITE = /text-(?:mist|cloud)\/([0-9]{1,2})\b/g;

/** Retire les commentaires JSX/TS — le motif y apparaît légitimement en prose. */
export function sansCommentaires(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

export function opacitesInterdites(racines = RACINES, lecteur = readFileSync) {
  const fautes = [];
  const parcourir = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (/\.tsx?$/.test(p)) {
        const src = sansCommentaires(String(lecteur(p, "utf8")));
        for (const m of src.matchAll(MOTIF_OPACITE)) {
          if (Number(m[1]) < 80) fautes.push(`${p} : ${m[0]}`);
        }
      }
    }
  };
  for (const r of racines) parcourir(r);
  return fautes;
}

// ─── Exécution ───────────────────────────────────────────────────────────────

const enTantQueScript = process.argv[1]?.endsWith("zabelie-contrast.mjs");
if (enTantQueScript) {
  const T = lireTokens(readFileSync("app/zabelie-theme.css", "utf8"));
  let echecs = 0;

  for (const [nom, fg, bg, seuil] of paires(T)) {
    const r = ratio(fg, bg);
    const ok = r >= seuil;
    if (!ok) echecs++;
    console.log(
      `${ok ? "✅" : "❌"} ${r.toFixed(2)}:1 (seuil ${seuil}:1) — ${nom}`
    );
  }

  const fautes = opacitesInterdites();
  for (const f of fautes) {
    echecs++;
    console.log(`❌ opacité de texte interdite (< /80) — ${f}`);
  }

  console.log(
    echecs === 0
      ? "\nToutes les paires passent, aucune opacité interdite."
      : `\n${echecs} échec(s).`
  );
  process.exit(echecs === 0 ? 0 : 1);
}
