import { MARQUEUR_SIMULATION } from "./provider-mock";
import { caracteresNonPrisEnCharge, normaliserPourPdf } from "./pdf/winansi";
import type { Contenu } from "./schema";

/**
 * Fiche-test de préparation d'un guide (tâche 4.2 ; idée 5 validée le
 * 2026-10-16, inspirée de la revue qualité d'Udemy).
 *
 * Deux niveaux, et seulement deux :
 *   - BLOQUANT : l'export et l'approbation sont refusés tant qu'il reste un
 *     problème de ce niveau (texte manquant, marqueur oublié, caractère que le
 *     PDF ne sait pas dessiner) ;
 *   - CONSEIL : signalé au créateur, qui reste libre de passer outre.
 *
 * Module PUR, sans réseau ni base : l'éditeur l'exécute en direct, la route
 * d'approbation le réexécute sur le contenu lu en base. Il rend des codes et
 * des paramètres ; les phrases sont dans `copy.ts`, dans les quatre langues.
 */

export type NiveauControle = "bloquant" | "conseil";

export type CodeControle =
  | "aucune_section"
  | "plan_non_approuve"
  | "titre_section_vide"
  | "section_vide"
  | "marqueur_inacheve"
  | "marqueur_simulation"
  | "caracteres_pdf"
  | "resultat_manquant"
  | "section_courte"
  | "guide_court"
  | "paragraphe_repete"
  | "objectif_vide"
  | "titre_long"
  | "sans_exercice"
  | "chiffres_a_verifier"
  | "liens_a_verifier";

export type Controle = {
  code: CodeControle;
  niveau: NiveauControle;
  /** Numéro de section (à partir de 1), ou `null` pour le guide entier. */
  section: number | null;
  /** Ce qu'il faut montrer au créateur : caractères refusés, extraits, nombres. */
  details: string[];
};

export type Preparation = "pret" | "presque" | "pas_pret";
export type FicheTest = { controles: Controle[]; preparation: Preparation; bloquants: number; conseils: number };

const NIVEAU: Record<CodeControle, NiveauControle> = {
  aucune_section: "bloquant",
  plan_non_approuve: "bloquant",
  titre_section_vide: "bloquant",
  section_vide: "bloquant",
  marqueur_inacheve: "bloquant",
  marqueur_simulation: "bloquant",
  caracteres_pdf: "bloquant",
  resultat_manquant: "conseil",
  section_courte: "conseil",
  guide_court: "conseil",
  paragraphe_repete: "conseil",
  objectif_vide: "conseil",
  titre_long: "conseil",
  sans_exercice: "conseil",
  chiffres_a_verifier: "conseil",
  liens_a_verifier: "conseil",
};

/** Seuils de la fiche-test : des conseils, pas des règles de vente. */
export const SEUILS = {
  sectionCourte: 400, // caractères : à peine un paragraphe
  guideCourt: 1500, // mots : environ cinq pages A5
  paragrapheRepete: 80, // caractères minimum pour qu'une répétition compte
  titreLong: 70, // caractères : au-delà, une couverture devient illisible sur téléphone
  extraits: 3, // exemples montrés pour les chiffres et les liens
  contexte: 25, // caractères gardés de part et d'autre d'un chiffre
} as const;

const INACHEVES = ["TODO", "TBD", "XXX", "???", "[...]", "[" + String.fromCodePoint(0x2026) + "]"];
const SIMULATION = Object.values(MARQUEUR_SIMULATION);
const MOTS_EXERCICE = ["egzèsis", "egzesis", "exercice", "pratik", "pratique", "plan aksyon", "plan d'action", "plan d’action", "aktivite pratik"];

const NL = String.fromCharCode(10);

function mots(texte: string): number {
  return texte.split(" ").flatMap((l) => l.split(NL)).filter((m) => m.trim().length > 0).length;
}

/** Les paragraphes d'un texte : séparés par une ligne vide, blancs réduits. */
function paragraphes(corps: string): string[] {
  return corps
    .split(NL + NL)
    .map((p) => p.split(NL).map((l) => l.trim()).join(" ").replace(/ +/g, " ").trim())
    .filter(Boolean);
}

const blanc = (ch: string | undefined) => ch === " " || ch === NL;

/**
 * Des extraits autour de chaque correspondance : coupés aux limites des mots
 * (jamais « …urdes »), et deux correspondances voisines donnent UN extrait,
 * pas deux qui se chevauchent.
 */
function extraitsAutour(texte: string, motif: RegExp): string[] {
  const fenetres: [number, number][] = [];
  for (const m of texte.matchAll(motif)) {
    const i = m.index ?? 0;
    let debut = Math.max(0, i - SEUILS.contexte);
    let fin = Math.min(texte.length, i + m[0].length + SEUILS.contexte);
    for (let k = 0; debut > 0 && !blanc(texte[debut - 1]) && k < SEUILS.contexte; k++) debut--;
    for (let k = 0; fin < texte.length && !blanc(texte[fin]) && k < SEUILS.contexte; k++) fin++;
    const derniere = fenetres[fenetres.length - 1];
    if (derniere && debut <= derniere[1]) derniere[1] = Math.max(derniere[1], fin);
    else if (fenetres.length < SEUILS.extraits) fenetres.push([debut, fin]);
    else break;
  }
  return fenetres.map(
    ([d, f]) => (d > 0 ? "…" : "") + texte.slice(d, f).split(NL).join(" ").trim() + (f < texte.length ? "…" : "")
  );
}

// Chiffres qui engagent le créateur : pourcentages, prix et montants.
const CHIFFRES = /[0-9][0-9 .,]*( ?%| ?(goud|gourdes?|HTG|USD|dola|dollars?|euros?)|[$€])|[$€] ?[0-9]/gi;
const LIENS = /(https?:[^ ]+|www[.][^ ]+)/gi;

export function ficheTest(entree: {
  titre: string;
  contenu: Contenu;
  planApprouve: boolean;
}): FicheTest {
  const controles: Controle[] = [];
  const ajouter = (code: CodeControle, section: number | null, details: string[] = []) =>
    controles.push({ code, niveau: NIVEAU[code], section, details });

  const sections = entree.contenu.sections;
  if (sections.length === 0) ajouter("aucune_section", null);
  if (!entree.planApprouve) ajouter("plan_non_approuve", null);

  const tousParagraphes = new Map<string, number[]>();
  let totalMots = 0;
  let exercice = false;

  sections.forEach((s, i) => {
    const n = i + 1;
    const titre = s.titre.trim();
    const corps = s.corps.trim();
    if (!titre) ajouter("titre_section_vide", n);
    if (!corps) ajouter("section_vide", n);

    const tout = [titre, s.resultat, s.corps].join(NL);
    const inacheves = INACHEVES.filter((m) => tout.includes(m));
    if (inacheves.length) ajouter("marqueur_inacheve", n, inacheves);
    const simules = SIMULATION.filter((m) => tout.includes(m));
    if (simules.length) ajouter("marqueur_simulation", n, simules);
    const refuses = caracteresNonPrisEnCharge(normaliserPourPdf(tout));
    if (refuses.length) ajouter("caracteres_pdf", n, refuses);

    if (!s.resultat.trim()) ajouter("resultat_manquant", n);
    if (corps && corps.length < SEUILS.sectionCourte) ajouter("section_courte", n, [String(corps.length)]);

    totalMots += mots(corps);
    const bas = tout.toLocaleLowerCase("fr");
    if (MOTS_EXERCICE.some((m) => bas.includes(m))) exercice = true;
    for (const p of paragraphes(s.corps)) {
      if (p.length < SEUILS.paragrapheRepete) continue;
      tousParagraphes.set(p, [...(tousParagraphes.get(p) ?? []), n]);
    }

    const chiffres = extraitsAutour(s.corps, CHIFFRES);
    if (chiffres.length) ajouter("chiffres_a_verifier", n, chiffres);
    const liens = [...new Set([...s.corps.matchAll(LIENS)].map((m) => m[0]))].slice(0, SEUILS.extraits);
    if (liens.length) ajouter("liens_a_verifier", n, liens);
  });

  // Titre du guide : il porte aussi des caractères à dessiner.
  const refusesTitre = caracteresNonPrisEnCharge(normaliserPourPdf(entree.titre));
  if (refusesTitre.length) ajouter("caracteres_pdf", null, refusesTitre);
  const refusesObjectif = caracteresNonPrisEnCharge(normaliserPourPdf(entree.contenu.objectif));
  if (refusesObjectif.length) ajouter("caracteres_pdf", null, refusesObjectif);

  if (sections.length > 0 && totalMots < SEUILS.guideCourt) ajouter("guide_court", null, [String(totalMots)]);
  const repetes = [...tousParagraphes.entries()].filter(([, ou]) => ou.length > 1);
  if (repetes.length) {
    ajouter("paragraphe_repete", null, repetes.slice(0, SEUILS.extraits).map(([p, ou]) => `${p.slice(0, 60)}… (${ou.join(", ")})`));
  }
  if (!entree.contenu.objectif.trim()) ajouter("objectif_vide", null);
  if (entree.titre.trim().length > SEUILS.titreLong) ajouter("titre_long", null, [String(entree.titre.trim().length)]);
  if (sections.length > 0 && !exercice) ajouter("sans_exercice", null);

  const bloquants = controles.filter((c) => c.niveau === "bloquant").length;
  const conseils = controles.length - bloquants;
  return { controles, bloquants, conseils, preparation: bloquants ? "pas_pret" : conseils ? "presque" : "pret" };
}

/**
 * Les contrôles regroupés par code, dans l'ordre de leur première apparition.
 * Sur un téléphone, une carte par PROBLÈME, avec ses sections, pas une carte
 * par section : sept sections courtes font une carte, pas sept.
 */
export function regrouperParCode(controles: Controle[]): Controle[][] {
  const groupes = new Map<CodeControle, Controle[]>();
  for (const c of controles) groupes.set(c.code, [...(groupes.get(c.code) ?? []), c]);
  return [...groupes.values()];
}
