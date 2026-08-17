import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { lirePalettes } from "../scripts/zabelie-contrast.mjs";

/**
 * PALETTE RESSERRÉE — cliquet (2026-08-17).
 *
 * Demande porteur : « on ne veut pas plusieurs couleurs sur le site ».
 * Une palette se resserre en une heure et se re-disperse en trois commits,
 * un `text-amber-200` à la fois — j'en ai moi-même posé un la veille dans
 * `app/admin/page.tsx`, et rien ne l'a signalé. Ce fichier est ce qui le
 * signale désormais.
 *
 * ⚠️ CE CLIQUET A DEUX MORS, et le second compte autant que le premier :
 * il interdit d'AJOUTER des teintes décoratives, ET il interdit de SUPPRIMER
 * les couleurs de statut. Un resserrement qui mangerait le vert/jaune/rouge
 * du chemin de l'argent rendrait « payé », « en attente » et « échoué »
 * indiscernables — ce serait obéir à la consigne en cassant le produit.
 */
const CSS = readFileSync("app/zabelie-theme.css", "utf8");
const { sombre, clair } = lirePalettes(CSS) as {
  sombre: Record<string, string>;
  clair: Record<string, string>;
};

/**
 * Tous les tokens qui portent l'accent de marque, alias compris.
 *
 * ⚠️ Les clés de `lirePalettes` n'ont PAS de préfixe `--`. La première version
 * de ce fichier les écrivait `--accent` : chaque lecture rendait `undefined`,
 * `filter(Boolean)` vidait l'ensemble, et « 0 ≤ 2 » passait au vert sans
 * jamais regarder une seule couleur. Un test qui ne peut pas échouer, pour la
 * deuxième fois dans la même journée — d'où le garde de non-vacuité ci-dessous,
 * qui est la vraie leçon : ce n'est pas la faute de frappe qu'il faut éviter,
 * c'est qu'elle puisse ressembler à une réussite.
 */
const FAMILLE_ACCENT = [
  "accent",
  "accent-strong",
  "accent-gold",
  "brand",
  "gold",
  "amber",
  "violet",
];

for (const [nom, P] of [
  ["sombre", sombre],
  ["clair", clair],
] as const) {
  test(`palette ${nom} : l'accent ne compte que DEUX valeurs réelles`, () => {
    /* Avant : quatre oranges distincts (#f5934f, #fdb868, #feb56c, #f26a21)
     * plus leurs alias. « Plusieurs couleurs » commence là — pas dans les
     * statuts, mais dans une rampe décorative que personne ne distingue. */
    // NON-VACUITÉ D'ABORD : un token introuvable doit faire ROUGIR, jamais
    // rétrécir silencieusement l'ensemble examiné.
    for (const t of FAMILLE_ACCENT) {
      assert.match(P[t] ?? "", /^#[0-9a-f]{6}$/i, `token ${t} introuvable en ${nom}`);
    }
    const valeurs = new Set(FAMILLE_ACCENT.map((t) => P[t].toLowerCase()));
    assert.ok(
      valeurs.size <= 2,
      `${valeurs.size} valeurs d'accent en ${nom} : ${[...valeurs].join(", ")}`
    );
  });

  test(`palette ${nom} : les couleurs de STATUT restent distinctes`, () => {
    // Le contre-garde. Trois statuts d'argent, trois teintes séparées.
    const cles = ["success", "warning", "danger"];
    for (const k of cles) {
      assert.match(P[k] ?? "", /^#[0-9a-f]{6}$/i, `token ${k} introuvable en ${nom}`);
    }
    const s = cles.map((k) => P[k].toLowerCase());
    assert.equal(new Set(s).size, 3, `statuts confondus en ${nom} : ${s.join(", ")}`);
    // Et aucun ne doit avoir été aligné sur l'accent.
    for (const v of s) {
      assert.ok(
        !FAMILLE_ACCENT.some((t) => P[t].toLowerCase() === v),
        `un statut a pris la valeur de l'accent en ${nom} : ${v}`
      );
    }
  });

  test(`palette ${nom} : aucun noir pur ni blanc pur`, () => {
    /* La checklist UI le nomme (« pas de blanc pur sur noir pur — fatigant »)
     * et c'est aussi ce qui séparait notre gris neutre du brun chaud de la
     * référence : #000 et #fff n'ont PAS de température. */
    const durs = Object.entries(P).filter(([, v]) =>
      ["#000", "#000000", "#fff", "#ffffff"].includes(v?.toLowerCase())
    );
    assert.deepEqual(durs, [], `valeurs sans température en ${nom}`);
  });
}

// ── La dispersion vient d'ailleurs : les classes Tailwind brutes ────────────

const RACINES = ["app", "components"];
const RE_TAILWIND_BRUT =
  /\b(?:bg|text|border|from|via|to|ring|fill|stroke|divide|outline|shadow|decoration|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b/;

function fichiers(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) {
      if (e !== "node_modules") fichiers(f, out);
    } else if (/\.(tsx|ts|css)$/.test(e)) out.push(f);
  }
  return out;
}

test("aucune couleur Tailwind BRUTE hors du système de tokens", () => {
  /* ⚠️ Le motif ne porte pas `g` : un regex à état rendrait vrai ou faux
   * selon l'ordre des appels dans la boucle. Règle du dépôt, mordue le
   * 2026-08-14 — ici elle serait invisible, la suite passerait au vert en
   * ayant sauté un fichier sur deux. */
  const fautes: string[] = [];
  for (const racine of RACINES) {
    for (const f of fichiers(racine)) {
      const src = readFileSync(f, "utf8");
      for (const [i, ligne] of src.split("\n").entries()) {
        const m = RE_TAILWIND_BRUT.exec(ligne);
        if (m) fautes.push(`${f}:${i + 1} — ${m[0]}`);
      }
    }
  }
  assert.deepEqual(
    fautes,
    [],
    `\nCouleur hors palette. Utiliser un token du thème :\n${fautes.join("\n")}`
  );
});

test("le fond de page ne porte plus DEUX lavis d'accent", () => {
  /* Deux radiaux à 13 % et 11 % se cumulaient en un halo qui couvrait la
   * moitié de l'écran : un fond teinté à ce point devient une couleur de
   * plus, et il vole la vedette au seul élément qui doit être orange. */
  const G = readFileSync("app/globals.css", "utf8");
  const grain = G.slice(G.indexOf(".bg-grain"), G.indexOf(".glass"));
  const radiaux = grain.split("radial-gradient").length - 1;
  assert.equal(radiaux, 1, `${radiaux} lavis dans .bg-grain — un seul est voulu`);
});

test("le dégradé de texte a DEUX arrêts, pas quatre", () => {
  const G = readFileSync("app/globals.css", "utf8");
  const bloc = G.slice(G.indexOf(".text-gradient"), G.indexOf(".text-gradient") + 700);
  const stops = (bloc.match(/var\(--color-[a-z-]+\)/g) ?? []).length;
  assert.equal(stops, 2, "quatre arrêts pointaient sur quatre oranges distincts");
});
