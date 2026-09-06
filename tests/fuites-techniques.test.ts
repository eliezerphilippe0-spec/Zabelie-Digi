import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { horsProduction, signalerConfigAbsente, reinitialiserSignaux } from "../lib/diagnostic";

/**
 * AUCUN ARTEFACT INTERNE NE DOIT ATTEINDRE UN ÉCRAN.
 *
 * Trouvé le 2026-09-06 en notant `/vendre` : la page disait « La publication
 * nécessite une base Supabase configurée (voir `supabase/README.md`) ». En
 * cherchant s'il y en avait d'autres — plutôt qu'en corrigeant celle-là seule —
 * la mesure en a rendu trois familles, dans les quatre langues, dont la pire
 * n'était pas la première : **`api.free.closed` renvoyait « migration 0087 non
 * appliquée » à un ACHETEUR, sur le chemin de l'argent, traduit en kreyòl.**
 * Quelqu'un avait donc pris la peine de traduire un numéro de migration pour un
 * acheteur haïtien qui voulait payer.
 *
 * C'est exactement la classe d'artefact que `CLAUDE.md` dit de croiser
 * mécaniquement : une chaîne de libellé n'est vue par AUCUN compilateur, et une
 * relecture attentive n'en trouve que celles qu'elle regarde. Un croisement,
 * lui, les trouve toutes — et les trouvera encore dans six mois.
 *
 * Mutations éprouvées :
 *   FT1  « (migration 0087 non appliquée) » remis dans un libellé  → rouge
 *   FT2  « supabase/README.md » remis dans le JSX de /vendre        → rouge
 *   FT3  l'indice technique rendu sans la garde `horsProduction()`  → rouge
 *   FT4  le signal retiré de la branche dégradée de /vendre         → rouge
 */

const I18N = readFileSync("lib/i18n.ts", "utf8");

/**
 * Le vocabulaire qui n'a rien à faire sous les yeux d'un utilisateur.
 *
 * Volontairement ÉTROIT : chaque motif désigne un artefact que l'utilisateur
 * ne peut ni voir ni corriger. Les noms de partenaires (MonCash, Digicel,
 * Natcom, Zelle, WhatsApp) n'y sont pas — ce sont des mots du métier, pas de la
 * plomberie.
 */
const INTERNE: [RegExp, string][] = [
  [/supabase/i, "le fournisseur de base de données"],
  [/\bRLS\b/, "les politiques de sécurité de la base"],
  [/service[- ]role/i, "la clé de service"],
  [/migration|migrasyon|migración/i, "un numéro de migration"],
  [/README/i, "un fichier du dépôt"],
  [/\b0\d{3}\b/, "un numéro de migration"],
  [/\.(ts|tsx|sql|mjs)\b/, "un fichier source"],
  [/variable d'environnement|environment variable|env var/i, "une variable d'environnement"],
];

/**
 * Exemptions — aucune aujourd'hui, et c'est le but.
 *
 * ⚠️ Si l'une devient nécessaire, elle porte sa RAISON, et le test échoue aussi
 * quand elle cesse d'être nécessaire : une liste qui ne sait que grandir
 * devient une conformité par usure (`CLAUDE.md`).
 */
const EXEMPTIONS: Record<string, string> = {};

/** Toutes les valeurs de libellé du dictionnaire, avec leur clé. */
function libelles(): { cle: string; valeur: string }[] {
  const out: { cle: string; valeur: string }[] = [];
  for (const m of I18N.matchAll(/^\s*"([\w.]+)":\s*\n?\s*"((?:[^"\\]|\\.)*)"/gm)) {
    out.push({ cle: m[1], valeur: m[2] });
  }
  return out;
}

test("FT0 — le connu-positif : l'extraction voit bien tout le dictionnaire", () => {
  // Sans cette borne, une expression cassée rendrait zéro libellé et le test
  // suivant serait vert en n'ayant rien regardé. C'est le vert de la mutation
  // qui n'a pas muté, transposé à un extracteur.
  const tous = libelles();
  assert.ok(tous.length > 1500, `${tous.length} libellés extraits — l'extraction ne trouve plus rien`);
  // Et il voit bien les quatre langues d'une même clé.
  assert.equal(tous.filter((l) => l.cle === "sell.demo.body").length, 4);
});

test("FT1 — aucun libellé ne nomme un artefact interne", () => {
  const fautes: string[] = [];
  for (const { cle, valeur } of libelles()) {
    if (cle in EXEMPTIONS) continue;
    for (const [motif, quoi] of INTERNE) {
      if (motif.test(valeur)) {
        fautes.push(`${cle} — ${quoi} : « ${valeur.slice(0, 90)} »`);
        break;
      }
    }
  }
  assert.deepEqual(
    fautes,
    [],
    "Des libellés nomment des artefacts internes. Un utilisateur ne peut ni les voir ni les corriger : " +
      "il n'apprend que « le site est cassé d'une façon que je ne comprends pas ». " +
      "Dites ce que ça veut dire POUR LUI ; la cause part au journal serveur.\n  " +
      fautes.join("\n  "),
  );
});

test("FT2 — les exemptions se périment DANS LES DEUX SENS", () => {
  for (const [cle, raison] of Object.entries(EXEMPTIONS)) {
    const valeurs = libelles().filter((l) => l.cle === cle);
    assert.ok(valeurs.length > 0, `${cle} est exemptée mais n'existe plus — retirez l'exemption`);
    const encoreFautive = valeurs.some(({ valeur }) => INTERNE.some(([m]) => m.test(valeur)));
    assert.ok(
      encoreFautive,
      `${cle} est exemptée (« ${raison} ») mais ne contient plus rien d'interne — retirez l'exemption`,
    );
  }
});

test("FT3 — l'indice technique est GARDÉ par horsProduction(), et la branche signale", () => {
  const page = readFileSync("app/vendre/page.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

  /* Ce qui COMMANDE : le chemin du dépôt ne doit apparaître QUE derrière la
     garde. Un motif qui vérifierait seulement « README n'est plus dans le
     fichier » interdirait aussi l'indice de développement, qui est légitime —
     et un motif qui vérifierait seulement sa présence resterait vert si la
     garde sautait. On ancre donc sur la garde ET sa charge. */
  assert.match(
    page,
    /\{horsProduction\(\) && \([\s\S]{0,400}supabase\/README\.md/,
    "le chemin du dépôt doit vivre derrière horsProduction()",
  );
  // Et il n'apparaît nulle part ailleurs dans la page.
  assert.equal(
    (page.match(/README/g) ?? []).length,
    1,
    "« README » n'apparaît qu'une fois, derrière la garde",
  );

  // La branche dégradée SIGNALE. Sans ça, une base absente en production
  // rendait un 200 muet : l'écran paraissait normal et rien ne partait.
  assert.match(
    page,
    /if \(!isSupabaseConfigured\(\)\) \{[\s\S]{0,200}signalerConfigAbsente\("supabase", \{ ecran: "\/vendre" \}\)/,
    "la branche sans base doit journaliser",
  );
});

test("FT4 — le signal part une fois, et il dit la GRAVITÉ", () => {
  reinitialiserSignaux();
  const lignes: string[] = [];
  const vrai = console.error;
  console.error = (...a: unknown[]) => void lignes.push(a.join(" "));
  try {
    signalerConfigAbsente("supabase", { ecran: "/vendre" });
    signalerConfigAbsente("supabase", { ecran: "/vendre" });
    signalerConfigAbsente("resend", { ecran: "/mes-ventes" });
  } finally {
    console.error = vrai;
  }

  // Deux causes distinctes, deux lignes — et le doublon est tu : un incident
  // bruyant qu'on apprend à ignorer cesse d'être un incident.
  assert.equal(lignes.length, 2, `${lignes.length} ligne(s), 2 attendues`);
  assert.match(lignes[0], /\[config\]/);
  assert.match(lignes[0], /"manquant":"supabase"/);
  assert.match(lignes[1], /"manquant":"resend"/);

  // La gravité distingue le poste de développement de la production.
  const attendue = horsProduction() ? "attendu_en_dev" : "incident_production";
  assert.match(lignes[0], new RegExp(`"gravite":"${attendue}"`));

  // Et jamais de valeur de secret dans le journal — seulement son nom.
  for (const l of lignes) assert.doesNotMatch(l, /sb_|eyJ|secret|token/i);
});
