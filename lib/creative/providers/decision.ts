import type { Brief } from "../prompt-builder";

/**
 * DecisionProvider (contrat §3.4) — le juge rapide des briefs.
 *
 * ⚠️ Aucune implémentation Jev ici. La forme d'une question de NOTATION
 * (`score`) n'est vue dans aucun client existant et la documentation n'a pas
 * pu être lue (NON VÉRIFIÉ, docs/62 §3). Rien ne prouve non plus que Jev juge
 * des images : ce juge ne voit que les briefs TEXTE.
 *
 * Jev ne calcule rien : il rend quatre notes par brief, entre 0 et 1. Le
 * score agrégé, le classement et la sélection sont calculés ICI, en code.
 */
export const CRITERES = ["fidelite_produit", "respect_interdits", "adequation_audience", "proximite_reference"] as const;
export type Notes = Record<(typeof CRITERES)[number], number>;

export interface DecisionProvider {
  readonly name: string;
  /** Une entrée par brief, dans l'ordre reçu. */
  scoreBriefs(briefs: readonly Brief[]): Promise<unknown>;
}

export const NB_RETENUS = 3;

export type Selection = {
  retenus: number[];
  mode: "jev" | "repli";
  raison: "drapeau_desactive" | "fournisseur_absent" | "fournisseur_indisponible" | "notes_invalides" | null;
  notes: Notes[] | null;
};

/**
 * ⚠️ PROPOSITION : moyenne des quatre critères, `proximite_reference` inversée
 * (trop proche de la pub copiée = mauvais). Égalité → ordre du Prompt Builder.
 */
export function scoreAgrege(n: Notes): number {
  return (n.fidelite_produit + n.respect_interdits + n.adequation_audience + (1 - n.proximite_reference)) / 4;
}

function notesValides(raw: unknown, n: number): Notes[] | null {
  if (!Array.isArray(raw) || raw.length !== n) return null;
  for (const r of raw) {
    if (typeof r !== "object" || r === null) return null;
    const keys = Object.keys(r).sort();
    if (keys.join() !== [...CRITERES].sort().join()) return null;
    for (const k of CRITERES) {
      const v = (r as Record<string, unknown>)[k];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) return null;
    }
  }
  return raw as Notes[];
}

/**
 * Drapeau `false`, fournisseur absent, en panne ou incohérent → repli
 * déterministe : les trois premiers briefs dans l'ordre du Prompt Builder.
 * Toujours journalisé via `journal` : un repli silencieux se lirait comme un
 * choix de Jev.
 */
export async function selectBriefs(
  briefs: readonly Brief[],
  opts: { enabled: boolean; provider: DecisionProvider | null; journal: (s: Selection) => void },
): Promise<Selection> {
  const repli = (raison: NonNullable<Selection["raison"]>): Selection =>
    ({ retenus: briefs.slice(0, NB_RETENUS).map((_, i) => i), mode: "repli", raison, notes: null });
  let sel: Selection;
  if (!opts.enabled) sel = repli("drapeau_desactive");
  else if (!opts.provider) sel = repli("fournisseur_absent");
  else {
    let raw: unknown;
    try { raw = await opts.provider.scoreBriefs(briefs); } catch { raw = Symbol("panne"); }
    if (typeof raw === "symbol") sel = repli("fournisseur_indisponible");
    else {
      const notes = notesValides(raw, briefs.length);
      if (!notes) sel = repli("notes_invalides");
      else {
        const retenus = notes.map((n, i) => ({ i, s: scoreAgrege(n) }))
          .sort((a, b) => b.s - a.s || a.i - b.i).slice(0, NB_RETENUS).map((x) => x.i);
        sel = { retenus, mode: "jev", raison: null, notes };
      }
    }
  }
  opts.journal(sel);
  return sel;
}
