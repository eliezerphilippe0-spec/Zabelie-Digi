import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * LE MOUVEMENT DES FEUILLES DE L'ACCUEIL SUIT LA RÈGLE DU THÈME — audit du
 * système de design du 2026-10-27, constat m8.
 *
 * `app/zabelie-theme.css` : « Animer UNIQUEMENT transform et opacity. Aucune
 * durée au-delà de --motion-slow. » Mesuré à `acc72c9`, trois feuilles y
 * dérogeaient : `home-vivant.css` animait border-color, box-shadow et
 * background-color ; `editorial-marketplace.css` color, border-color et filter
 * sur 180 ms écrits en dur ; `ventes-flash.css` 1,6 s, 0,9 s, 0,45 s et une
 * courbe à rebond `cubic-bezier(.2, .9, .3, 1.4)`.
 *
 * On LIT chaque déclaration avec son contexte (les at-rules qui l'enveloppent),
 * plutôt que de chercher des motifs dans le texte : une transition hors du bloc
 * `no-preference`, ou une propriété animée par une image clé, se distinguent
 * par leur PLACE, pas par leur écriture.
 */

const FEUILLES = ["app/home-vivant.css", "app/editorial-marketplace.css", "app/ventes-flash.css"];
const ANIMABLES = new Set(["transform", "opacity", "translate", "scale", "rotate"]);
const DUREE = /^var\(--motion-(fast|base|slow)\)$/;

type Decl = { prop: string; valeur: string; contextes: string[] };

/** Les déclarations d'une feuille, chacune avec la pile des préludes qui l'enveloppent. */
export function declarations(css: string): Decl[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  const pile: string[] = [];
  const out: Decl[] = [];
  let tampon = "";
  let guillemet: string | null = null;
  const vider = () => {
    const d = tampon.trim();
    tampon = "";
    const i = d.indexOf(":");
    if (i > 0 && pile.length > 0 && !d.startsWith("@")) {
      out.push({ prop: d.slice(0, i).trim().toLowerCase(), valeur: d.slice(i + 1).trim(), contextes: [...pile] });
    }
  };
  for (const c of src) {
    if (guillemet) {
      tampon += c;
      if (c === guillemet) guillemet = null;
    } else if (c === '"' || c === "'") {
      guillemet = c;
      tampon += c;
    } else if (c === "{") {
      pile.push(tampon.trim().replace(/\s+/g, " "));
      tampon = "";
    } else if (c === "}") {
      vider();
      pile.pop();
    } else if (c === ";") {
      vider();
    } else tampon += c;
  }
  return out;
}

/** Les fautes de mouvement d'une feuille, lisibles. */
export function fautesMouvement(css: string): string[] {
  const fautes: string[] = [];
  if (/cubic-bezier\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, ""))) fautes.push("courbe cubic-bezier hors token (--ease)");
  for (const d of declarations(css)) {
    const sousNoPref = d.contextes.some((c) => /^@media\b.*prefers-reduced-motion:\s*no-preference/.test(c));
    const keyframes = d.contextes.find((c) => c.startsWith("@keyframes"));
    if (keyframes && !ANIMABLES.has(d.prop)) fautes.push(`${keyframes} anime ${d.prop}`);
    if (d.prop === "transition" || d.prop === "animation") {
      if (!sousNoPref) fautes.push(`${d.prop} hors de prefers-reduced-motion: no-preference : ${d.valeur}`);
    }
    if (d.prop === "transition") {
      for (const partie of d.valeur.split(",").map((p) => p.trim())) {
        const [prop, duree, courbe, ...reste] = partie.split(/\s+/);
        if (!ANIMABLES.has(prop)) fautes.push(`transition de ${prop} (« ${partie} »)`);
        if (!DUREE.test(duree ?? "")) fautes.push(`durée de transition hors token (« ${partie} »)`);
        if (courbe !== undefined && courbe !== "var(--ease)") fautes.push(`courbe de transition hors token (« ${partie} »)`);
        if (reste.length) fautes.push(`transition illisible (« ${partie} »)`);
      }
    }
    if (d.prop === "animation") {
      const [, duree, courbe] = d.valeur.split(/\s+/);
      // Une animation au DÉFILEMENT (`linear both` + animation-timeline) n'a pas de durée.
      const defilement = /^[\w-]+ linear both$/.test(d.valeur);
      if (!defilement && !DUREE.test(duree ?? "")) fautes.push(`durée d'animation hors token : ${d.valeur}`);
      if (!defilement && courbe !== "var(--ease)") fautes.push(`courbe d'animation hors token : ${d.valeur}`);
    }
    if (/^(transition|animation)-(duration|timing-function|property)$/.test(d.prop)) {
      fautes.push(`${d.prop} posé à part (« ${d.valeur} ») : passer par la déclaration courte, gardée ici`);
    }
  }
  return fautes;
}

test("MJ0 — l'instrument : chaque faute du constat est vue, une feuille conforme passe", () => {
  // Connu-NÉGATIF : les quatre formes mesurées à acc72c9.
  const avant = [
    "@media (prefers-reduced-motion: no-preference) { .a { transition: translate var(--motion-base) var(--ease), border-color var(--motion-base); } }",
    "@media (prefers-reduced-motion: no-preference) { .b { transition: color 180ms, filter 180ms; } }",
    "@media (prefers-reduced-motion: no-preference) { .c { animation: x 1.6s ease-out 0.3s 2 both; } }",
    "@media (prefers-reduced-motion: no-preference) { .d { animation: y var(--motion-slow) cubic-bezier(.2, .9, .3, 1.4) both; } }",
    ".e { transition: opacity var(--motion-base) var(--ease); }",
    "@keyframes z { from { box-shadow: none; } }",
  ];
  for (const css of avant) assert.ok(fautesMouvement(css).length > 0, `faute non vue : ${css}`);
  // Connu-POSITIF : les formes admises, y compris une media combinée et une animation au défilement.
  const conforme = `
    @media (hover: hover) and (prefers-reduced-motion: no-preference) { .a { transition: transform var(--motion-base) var(--ease); } }
    @media (prefers-reduced-motion: no-preference) {
      .b { animation: zbReveal var(--motion-slow) var(--ease) 100ms both; }
      @supports (animation-timeline: view()) { .c { animation: hvMonte linear both; } }
    }
    @keyframes k { from { transform: scale(0.6); opacity: 0; } 70% { translate: 0 2px; } }
    .d { --taptap: url("data:image/svg+xml,%3Csvg a='1'%3E"); color: red; }`;
  assert.deepEqual(fautesMouvement(conforme), []);
  // Témoin d'extraction : les déclarations sont vraiment lues, avec leur contexte.
  const d = declarations(conforme);
  assert.ok(d.length >= 8, `${d.length} déclarations lues`);
  assert.ok(d.some((x) => x.prop === "animation" && x.contextes.length === 3), "l'imbrication @media > @supports n'est pas suivie");
});

test("MJ1 — les trois feuilles n'animent que transform et opacity, en tokens, sous no-preference", () => {
  for (const f of FEUILLES) {
    const css = readFileSync(f, "utf8");
    const animees = declarations(css).filter((d) => d.prop === "transition" || d.prop === "animation");
    // Témoin : chacune des trois porte du mouvement (1 au moins) — zéro voudrait dire « extraction aveugle ».
    assert.ok(animees.length >= 1, `${f} : aucune déclaration de mouvement lue — l'extraction a bougé`);
    assert.deepEqual(fautesMouvement(css), [], `${f} enfreint la règle du mouvement du thème`);
  }
});

test("MJ2 — le survol des univers passe par un calque en OPACITÉ, pas par la bordure", () => {
  /* Le liseré d'accent et l'ombre sont posés sur `::after`, invisible au repos ;
     le survol ne change que son opacité. La liaison : la règle de survol vise
     le calque, et le calque porte ce que la carte animait avant. */
  const d = declarations(readFileSync("app/home-vivant.css", "utf8"));
  const calque = d.filter((x) => x.contextes.at(-1) === ".home-discovery .universe-grid > a::after");
  const prop = (p: string) => calque.find((x) => x.prop === p && x.contextes.length === 1)?.valeur;
  assert.equal(prop("opacity"), "0", "le calque doit être invisible au repos");
  assert.match(prop("border") ?? "", /var\(--color-accent\)/, "le liseré d'accent a quitté le calque");
  assert.match(prop("box-shadow") ?? "", /var\(--color-chrome\)/, "l'ombre a quitté le calque");
  const survol = d.find((x) => x.contextes.at(-1) === ".home-discovery .universe-grid > a:hover::after" && x.prop === "opacity");
  assert.equal(survol?.valeur, "1", "le survol ne révèle plus le calque");
  // Et la carte elle-même ne change plus ni bordure ni ombre au survol.
  const carte = d.filter((x) => x.contextes.at(-1) === ".home-discovery .universe-grid > a:hover");
  assert.deepEqual(carte.map((x) => x.prop), ["translate"], "la carte survolée ne doit bouger qu'en translate");
});
