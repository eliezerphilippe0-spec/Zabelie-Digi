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
 *   3. une POLICE D'OPACITÉ : chaque `text-mist/NN`, `text-cloud/NN` et
 *      `text-on-chrome/NN` de app/ et components/ (commentaires exclus) est
 *      composé sur ses fonds, dans les deux palettes ; sous 4,5:1 au pire,
 *      c'est un échec. C'est la forme exacte du défaut UI-01 — 2,82:1 sur les
 *      seize rangées de la colonne des rayons — que l'ancienne version, qui ne
 *      testait que des paires nommées, ne pouvait pas voir. Le seuil fixe
 *      « sous /80 » qui l'a précédée datait d'avant le thème clair : voir
 *      `FONDS_DU_TEXTE` plus bas.
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
    // Contour d'un champ ou d'un bouton secondaire (chantier design, Phase 2) :
    // c'est lui qui fait voir le composant, donc 3:1 (WCAG 1.4.11).
    out.push([`--contour (composant) sur ${nom}`, T.contour, fond, LARGE]);
  }
  // CTA : texte sombre sur orange vif — la paire de ::selection et des
  // boutons. Depuis le mode clair, ce texte est `on-brand` (FIXE dans les
  // deux thèmes), plus `ink` (qui bascule avec le chrome) : la paire suit le
  // token réellement employé par les composants.
  out.push(["--on-brand sur CTA --brand", T["on-brand"], T.brand, NORMAL]);
  // En-tête (accueil premium, Phase 2) : texte et icônes `on-chrome` sur les
  // TROIS arrêts du dégradé de marque — le dégradé référence ces tokens, donc
  // ce qui est mesuré ici est ce qui est peint.
  for (const arret of ["chrome", "chrome-2", "chrome-3"]) {
    out.push([`--on-chrome sur ${arret}`, T["on-chrome"], T[arret], NORMAL]);
    // Mot d'accent du hero (chantier design, Phase 3) : grand texte, mais tenu au
    // seuil du texte courant, par marge.
    out.push([`--accent-sur-chrome sur ${arret}`, T["accent-sur-chrome"], T[arret], NORMAL]);
  }
  return out;
}

/**
 * Le fichier de thème porte DEUX palettes. Depuis la Phase 1 de l'accueil
 * premium (2026-09-04), les tokens @theme sont le CLAIR (défaut) et un bloc
 * [data-theme="dark"] redéfinit une partie pour le sombre — l'inverse de
 * 2026-08-15. `lireTokens` sur le fichier ENTIER écraserait le clair par le
 * sombre — mesuré en 2026-08 dans l'autre sens : --ink sur --brand rendait
 * 4,25:1, un faux échec fabriqué par la collision. On découpe au bloc, et le
 * sombre HÉRITE du clair pour tout ce qu'il ne redéfinit pas — exactement la
 * cascade CSS. Les clés `sombre`/`clair` gardent leur SENS (la palette
 * nommée), pas leur position dans le fichier.
 */
export function lirePalettes(css) {
  const coupe = css.indexOf('[data-theme="dark"]');
  if (coupe === -1) return { clair: lireTokens(css), sombre: null };
  const clair = lireTokens(css.slice(0, coupe));
  const sombre = { ...clair, ...lireTokens(css.slice(coupe)) };
  return { sombre, clair };
}

// ─── Police d'opacité — la classe du défaut UI-01 ────────────────────────────

const RACINES = ["app", "components"];
const MOTIF_OPACITE = /text-(mist|cloud|on-chrome)\/([0-9]{1,2})\b/g;

/**
 * Les fonds sur lesquels chaque couleur de texte translucide se pose. Le PIRE
 * ratio, sur toutes ces surfaces et dans les DEUX palettes, décide.
 *
 * ⚠️ Remplace le seuil écrit à la main (« sous /80 interdit », 2026-08) : /80
 * avait été mesuré à 5,41:1 sur le fond le plus SOMBRE, avant que le clair ne
 * devienne le thème par défaut (2026-09-04). Pour un texte foncé, le pire cas
 * est le fond le plus CLAIR : `text-mist/80` sur la surface crème rend 4,14:1,
 * mesuré par axe le 2026-11-07 (chantier design, Phase 5). Le seuil se calcule
 * désormais à partir des palettes : il suit le thème au lieu de dater.
 */
const FONDS_DU_TEXTE = {
  mist: ["bg-1", "bg-3", "surface", "surface-neutral", "surface-maroon", "surface-brown"],
  cloud: ["bg-1", "bg-3", "surface", "surface-neutral", "surface-maroon", "surface-brown"],
  "on-chrome": ["chrome", "chrome-2", "chrome-3"],
};

/**
 * Exceptions NOMMÉES, chacune avec sa raison. Une exception devenue inutile
 * fait échouer le script : la liste ne peut que se vider.
 */
export const OPACITES_TOLEREES = {
  "app/rechaj/page.tsx":
    "chemin de l'argent (tests/helpers/chemin-argent.ts) : la mention légale en text-mist/80 rend 4,0:1 au pire en clair, mais ce fichier ne se retouche pas sans l'accord du porteur (OPS_TODO, point 5)",
};

/** Le pire ratio d'une couleur de texte posée à `pct` % sur ses fonds, dans les deux palettes. */
export function pireRatio(couleur, pct, palettes) {
  let pire = Infinity;
  for (const T of [palettes.clair, palettes.sombre]) {
    if (!T || !T[couleur]) continue;
    for (const f of FONDS_DU_TEXTE[couleur]) {
      if (T[f]) pire = Math.min(pire, ratio(mix(T[couleur], T[f], pct / 100), T[f]));
    }
  }
  return pire;
}

/** Retire les commentaires JSX/TS — le motif y apparaît légitimement en prose. */
export function sansCommentaires(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Chaque `text-{mist,cloud,on-chrome}/NN` du code, au pire ratio sur ses fonds :
 * sous 4,5:1, c'est une faute. Rend `{ fautes, tolerees }` ; `tolerees` liste les
 * exceptions nommées effectivement rencontrées.
 */
export function opacitesInterdites(racines = RACINES, lecteur = readFileSync, palettes = lirePalettes(readFileSync("app/zabelie-theme.css", "utf8"))) {
  const fautes = [];
  const tolerees = new Set();
  const parcourir = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (/\.tsx?$/.test(p)) {
        const src = sansCommentaires(String(lecteur(p, "utf8")));
        const chemin = p.replace(/\\/g, "/");
        for (const m of src.matchAll(MOTIF_OPACITE)) {
          const r = pireRatio(m[1], Number(m[2]), palettes);
          if (r >= 4.5) continue;
          if (chemin in OPACITES_TOLEREES) tolerees.add(chemin);
          else fautes.push(`${chemin} : ${m[0]} (${r.toFixed(2)}:1 au pire)`);
        }
      }
    }
  };
  for (const r of racines) parcourir(r);
  return Object.assign(fautes, { tolerees: [...tolerees] });
}

// ─── Exécution ───────────────────────────────────────────────────────────────

const enTantQueScript = process.argv[1]?.endsWith("zabelie-contrast.mjs");
if (enTantQueScript) {
  const { sombre, clair } = lirePalettes(
    readFileSync("app/zabelie-theme.css", "utf8")
  );
  let echecs = 0;

  for (const [etiquette, T] of [
    ["sombre", sombre],
    ["clair", clair],
  ]) {
    if (!T) continue;
    console.log(`── palette ${etiquette} ──`);
    for (const [nom, fg, bg, seuil] of paires(T)) {
      const r = ratio(fg, bg);
      const ok = r >= seuil;
      if (!ok) echecs++;
      console.log(
        `${ok ? "✅" : "❌"} ${r.toFixed(2)}:1 (seuil ${seuil}:1) — ${nom}`
      );
    }
  }

  const fautes = opacitesInterdites();
  for (const f of fautes) {
    echecs++;
    console.log(`❌ opacité de texte sous 4,5:1 — ${f}`);
  }
  for (const [fichier, raison] of Object.entries(OPACITES_TOLEREES)) {
    if (fautes.tolerees.includes(fichier)) {
      console.log(`⚠️ exception nommée — ${fichier} : ${raison}`);
    } else {
      echecs++;
      console.log(`❌ exception périmée, à retirer d'OPACITES_TOLEREES — ${fichier}`);
    }
  }

  console.log(
    echecs === 0
      ? "\nToutes les paires passent, aucune opacité interdite."
      : `\n${echecs} échec(s).`
  );
  process.exit(echecs === 0 ? 0 : 1);
}
