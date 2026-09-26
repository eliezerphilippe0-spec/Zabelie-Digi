import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { lirePolice } from "./woff2-lecteur";

/**
 * LA POLICE DU CORPS CONTIENT CE QUE LE SITE AFFICHE — vérifié dans le FICHIER.
 *
 * Audit typographique du 2026-09-26 (`docs/REVUE-2026-09-26-typographie.md`) :
 * l'Inter servie par `next/font/google` était amputée. Mesuré au moteur de
 * rendu de Chromium, `✓` ×51, `→` ×12, `★` ×7 (les étoiles de notation),
 * `⚠`… étaient dessinés par la police du TÉLÉPHONE, et ni le zéro barré ni le
 * `l` distinct n'existaient pour les codes promo. Option 1, choisie par le
 * porteur : Inter 4.1 complète, découpée pour Zabelie
 * (`scripts/decouper-police-inter.sh`), chargée par `next/font/local`.
 *
 * Ce fichier garde les QUATRE façons dont ce gain se perdrait en silence :
 *
 *   1. une régénération qui oublie un glyphe — `ò` du kreyòl, `→` ;
 *   2. une régénération qui oublie une fonctionnalité — `zero`, `cv05` ;
 *   3. un retour à l'Inter de Google, « plus simple » ;
 *   4. un symbole ajouté DEMAIN dans un composant, absent de la police.
 *
 * ⚠️ Le point 4 est le seul qui vise l'avenir, et c'est un CROISEMENT : le code
 * d'interface d'un côté, le fichier de police de l'autre. Aucun des deux ne
 * peut signaler seul le trou entre eux — c'est le motif « code sans appelant »
 * de `CLAUDE.md`, appliqué aux glyphes.
 */

const FICHIER = "app/fonts/InterZabelie-4.1.1.woff2";
const police = lirePolice(readFileSync(FICHIER));

/** Budget 3G : la découpe pèse 52 088 octets. Une régénération qui oublie de
 *  figer la taille optique en pèse ~79 000 ; une qui garde toutes les
 *  fonctionnalités, davantage. La marge couvre quelques symboles de plus. */
const BUDGET_OCTETS = 56_000;

test("P1 — le lecteur lit vraiment : ce qui n'est PAS dans la découpe en est absent", () => {
  /* Le connu-NÉGATIF du lecteur. Sans lui, un lecteur qui renverrait tout
     « présent » rendrait P2 et P6 verts sans rien vérifier (et P2 est le
     connu-positif : un lecteur qui ne renverrait rien y échoue).

     ⚠️ Une première version comparait à l'Inter de Google, dans `.next/`. Ce
     fichier n'existe plus depuis ce changement — Inter ne vient plus de
     Google — et le contrôle serait devenu du code mort, vert, sans le dire.
     Les témoins sont donc pris dans le fichier du dépôt lui-même.

     Le lecteur a été croisé avec fontTools à l'écriture, sur trois fichiers
     (cette découpe, l'Inter et la Manrope de Google) : mêmes 307, 230 et 218
     caractères, même SOMME de points de code, mêmes fonctionnalités, mêmes
     axes. */
  assert.ok(!police.caracteres.has(0x0416), "`Ж` (cyrillique) ne peut pas être dans une découpe latine");
  // `latin-ext` est EXCLU délibérément (aucune page n'en affiche) : s'il
  // apparaissait, soit le lecteur ment, soit la découpe a grossi en silence.
  for (const cp of [0x0103, 0x015f, 0x0142]) {
    assert.ok(!police.caracteres.has(cp), `U+${cp.toString(16).toUpperCase()} (latin-ext) présent : lecteur faux, ou découpe élargie`);
  }
  assert.ok(police.caracteres.size > 250 && police.caracteres.size < 400, `${police.caracteres.size} caractères : hors de toute découpe latine plausible`);
});

test("P2 — kreyòl, français, espagnol : chaque lettre est dans le fichier", () => {
  const lettres =
    "èòàÈÒÀ" + // kreyòl — les accents en FIN de mot (vandè, bò, lè) sont le piège
    "éêëîïôœùûüÿçæÉÊÇ«»’…—–" + // français
    "ñÑáíóúü¿¡" + // espagnol
    "€";
  const manquantes = [...lettres].filter((c) => !police.caracteres.has(c.codePointAt(0)!));
  assert.deepEqual(manquantes, [], `Lettre(s) absente(s) de ${FICHIER} : ${manquantes.join(" ")}`);
  // Le kreyòl saisi en forme DÉCOMPOSÉE (`o` + U+0300) : l'accent combinant
  // doit exister, sinon il est dessiné par une autre police, décalé.
  assert.ok(police.caracteres.has(0x0300) && police.caracteres.has(0x0301), "accents combinants U+0300/U+0301 absents");
});

test("P3 — les fonctionnalités qui justifient ce fichier sont présentes", () => {
  for (const f of ["zero", "cv05", "tnum", "case"]) {
    assert.ok(police.fonctionnalitesGsub.has(f), `fonctionnalité « ${f} » absente — elle est la raison d'être de cette découpe`);
  }
  for (const f of ["kern", "mark"]) {
    assert.ok(police.fonctionnalitesGpos.has(f), `positionnement « ${f} » absent : crénage ou accents combinants cassés`);
  }
  assert.deepEqual(police.axes.get("wght"), [100, 900], "l'axe de graisse doit couvrir 100→900 (aucun faux gras)");
  assert.ok(!police.axes.has("opsz"), "l'axe de taille optique devait être FIGÉ à 14 : +27 Ko pour rien à taille mobile");
});

test("P4 — le poids tient dans le budget 3G", () => {
  const octets = statSync(FICHIER).size;
  assert.ok(octets <= BUDGET_OCTETS, `${FICHIER} pèse ${octets} octets, budget ${BUDGET_OCTETS}`);
});

test("P5 — la police est BRANCHÉE : chargée, et sa variable posée sur <html>", () => {
  const layout = readFileSync("app/layout.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  /* Ce qui COMMANDE : l'appel `localFont` lié à `inter`, avec CE fichier et
     CETTE variable ; puis la variable appliquée. Une police déclarée dont la
     classe n'atteint pas <html> ne change aucun pixel. */
  assert.match(
    layout,
    /const inter = localFont\(\{[^}]*src: "\.\/fonts\/InterZabelie-4\.1\.1\.woff2"[^}]*variable: "--font-inter"/,
    "`inter` n'est plus chargée depuis le fichier découpé pour Zabelie"
  );
  assert.match(layout, /className=\{`\$\{inter\.variable\} \$\{manrope\.variable\}`\}/, "la variable d'Inter n'est plus posée sur <html>");
  assert.doesNotMatch(
    layout,
    /import \{[^}]*\bInter\b[^}]*\} from "next\/font\/google"/,
    "retour à l'Inter de Google : les symboles et le zéro barré disparaissent"
  );
  assert.ok(existsSync("app/fonts/Inter-LICENSE.txt"), "la licence OFL 1.1 doit voyager avec le fichier");
});

/* ── P6 — LE CROISEMENT : tout caractère non ASCII du code d'interface ─────── */

/**
 * Exemptions NOMMÉES. Elles se périment dans les DEUX sens : une exemption
 * dont le caractère a disparu du code fait aussi échouer le test.
 */
const EXEMPTIONS: Record<string, string> = {
  "ͯ":
    "borne de la plage U+0300–U+036F dans l'expression régulière de `slugify` (lib/payment-utils.ts) — jamais affichée",
  "⋮":
    "`⋮`, menu d'administration (components/admin/identity-block.tsx) : absent d'Inter 4.1 COMPLÈTE, hors pages publiques — à remplacer par une icône s'il en sort",
};

/**
 * Emoji ASSUMÉS : leur police est celle du téléphone, c'est voulu. Un caractère
 * en est un s'il a la présentation emoji PAR DÉFAUT, ou s'il est suivi du
 * sélecteur U+FE0F qui la demande.
 *
 * ⚠️ PREMIÈRE VERSION FAUSSE, trouvée par mutation : la frontière était
 * `\p{Extended_Pictographic}`. Elle laissait passer `✔` (U+2714) — classé
 * pictographique, mais SANS présentation emoji par défaut : le téléphone le
 * dessine avec sa police de symboles, en noir et blanc, exactement le défaut
 * que ce fichier combat. Le message d'erreur ci-dessous citait `✔` en exemple
 * pendant que le test ne pouvait pas le voir. La même règle a débusqué `🏍` et
 * `⏱` écrits sans U+FE0F : une moto en noir et blanc à côté d'une voiture en
 * couleur. Corrigés dans le même lot.
 */
const PRESENTATION_EMOJI = /\p{Emoji_Presentation}/u;
const SELECTEURS = new Set([0x200d, 0xfe0e, 0xfe0f]);

function estEmojiAssume(cp: number, suivant: number | undefined): boolean {
  return SELECTEURS.has(cp) || suivant === 0xfe0f || PRESENTATION_EMOJI.test(String.fromCodePoint(cp));
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? sources(p) : /\.(tsx?|mjs)$/.test(e) ? [p] : [];
  });
}

test("P6 — tout caractère affichable du code est dans la police, ou est un emoji assumé", () => {
  const trouves = new Map<string, Set<string>>();
  const hors = new Map<string, Set<string>>();
  for (const f of [...sources("app"), ...sources("components"), ...sources("lib")]) {
    // Commentaires retirés : on ne compte que ce qui peut atteindre l'écran.
    const src = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    const cps = Array.from(src, (c) => c.codePointAt(0)!);
    cps.forEach((cp, i) => {
      if (cp < 0x80) return;
      const ch = String.fromCodePoint(cp);
      (trouves.get(ch) ?? trouves.set(ch, new Set()).get(ch)!).add(f);
      if (police.caracteres.has(cp) || estEmojiAssume(cp, cps[i + 1]) || ch in EXEMPTIONS) return;
      (hors.get(ch) ?? hors.set(ch, new Set()).get(ch)!).add(f);
    });
  }

  const lignes = [...hors].map(
    ([ch, fs]) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")} « ${ch} »  dans ${[...fs].join(", ")}`
  );
  assert.deepEqual(
    lignes,
    [],
    "Caractère(s) écrit(s) dans le code d'interface mais ABSENT(S) de la police :\n  " +
      lignes.join("\n  ") +
      "\n\nIls seraient dessinés par la police du téléphone, pas par celle de la marque. " +
      "Quatre issues : un caractère voisin qui y est (`×` pour `✕`, `✓` pour `✔`) ; " +
      "U+FE0F après un emoji, pour qu'il s'affiche en couleur partout ; " +
      "l'ajouter à la découpe (scripts/decouper-police-inter.sh) s'il existe dans Inter ; " +
      "ou une exemption NOMMÉE ci-dessus, avec sa raison."
  );

  const perimees = Object.keys(EXEMPTIONS).filter((ch) => !trouves.has(ch));
  assert.deepEqual(perimees, [], `Exemption(s) périmée(s) — le caractère n'est plus dans le code : ${perimees.join(" ")}`);
});

/* ── P7 — les codes promo sont rendus AVEC le zéro barré et le `l` distinct ── */

test("P7 — la classe `.code-lisible` porte Inter, `zero` et `cv05`", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const bloc = /\.code-lisible\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(bloc, /font-family:\s*var\(--font-sans\)/, "`.code-lisible` doit être en Inter : Manrope n'a ni `zero` ni `cv05`");
  assert.match(bloc, /"zero"\s*1/, "`.code-lisible` n'active plus le zéro barré");
  assert.match(bloc, /"cv05"\s*1/, "`.code-lisible` n'active plus le `l` distinct");
});

test("P8 — les quatre endroits où un code promo s'affiche ou se saisit l'emploient", () => {
  /* Ancré sur ce qui LIE la classe au code : l'élément qui porte la valeur du
     code, pas la simple présence de `code-lisible` dans le fichier. Le motif
     « tempéré » `(?:(?!<input|\/>)[\s\S])` interdit de franchir la fin de
     l'élément : la classe d'un AUTRE champ ne peut pas satisfaire l'assertion. */
  const champ = /<input\s+value=\{code\}(?:(?!<input|\/>)[\s\S]){0,600}className="code-lisible[ "]/;
  assert.match(readFileSync("components/buy-button.tsx", "utf8"), champ, "champ de code de l'ACHETEUR sans `code-lisible`");

  const gestion = readFileSync("components/zabelie-coupon-manager.tsx", "utf8");
  assert.match(
    gestion,
    /id="cp-code"(?:(?!<input|\/>)[\s\S]){0,600}className="code-lisible[ "]/,
    "champ de création de code du VENDEUR sans `code-lisible`"
  );
  assert.match(gestion, /className=\{`code-lisible[^`]*`\}>\s*\{c\.code\}/, "liste des codes du vendeur sans `code-lisible`");

  assert.match(
    readFileSync("app/tableau-de-bord/page.tsx", "utf8"),
    /<span className="code-lisible[^"]*">PROMO50<\/span>/,
    "l'exemple « PROMO50 » du tableau de bord — un O et un 0 côte à côte — sans `code-lisible`"
  );
});
