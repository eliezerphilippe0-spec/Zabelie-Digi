import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lang } from "@/lib/i18n";

/**
 * Opportunités du Studio (tasks/plan.md, tâche T.4 ; migration 0143).
 *
 * Tout vient de `zabelie_authoring_opportunites()`, lue sous le JWT du
 * vendeur : des chiffres AGRÉGÉS au-delà de seuils de personnes et de
 * vendeurs, calculés en base. Ce module ne calcule rien, il relit : une forme
 * inattendue donne `null` (« indisponible »), jamais un chiffre deviné.
 */

export type Opportunites = {
  jours: number;
  seuils: { personnes: number; ventes: number; vendeurs: number };
  recherches: { terme: string; personnes: number }[];
  ventes: { rayon: string; ventes: number }[];
};

const entier = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
const texte = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const objet = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

const CHAMP_RAYON: Record<Lang, string> = { ht: "rayon_ht", fr: "rayon_fr", en: "rayon_en", es: "rayon_es" };

export function lireOpportunites(brut: unknown, lang: Lang): Opportunites | null {
  const o = objet(brut);
  const s = objet(o?.seuils);
  if (!o || !s) return null;
  const jours = entier(o.jours);
  const personnes = entier(s.personnes);
  const ventes = entier(s.ventes);
  const vendeurs = entier(s.vendeurs);
  if (jours === null || personnes === null || ventes === null || vendeurs === null) return null;
  if (!Array.isArray(o.recherches) || !Array.isArray(o.ventes)) return null;

  const recherches = o.recherches.flatMap((x) => {
    const r = objet(x);
    const terme = texte(r?.terme);
    const n = entier(r?.personnes);
    return terme && n !== null ? [{ terme, personnes: n }] : [];
  });
  const lignes = o.ventes.flatMap((x) => {
    const r = objet(x);
    const rayon = texte(r?.[CHAMP_RAYON[lang]]) ?? texte(r?.rayon_fr);
    const n = entier(r?.ventes);
    return rayon && n !== null ? [{ rayon, ventes: n }] : [];
  });
  return { jours, seuils: { personnes, ventes, vendeurs }, recherches, ventes: lignes };
}

/** Lecture sous la session du vendeur ; toute erreur rend `null`, jamais une exception de page. */
export async function chargerOpportunites(supabase: SupabaseClient, lang: Lang): Promise<Opportunites | null> {
  try {
    const { data, error } = await supabase.rpc("zabelie_authoring_opportunites");
    if (error) {
      console.error("[authoring] opportunites indisponibles", error.code ?? "sans code");
      return null;
    }
    return lireOpportunites(data, lang);
  } catch {
    return null;
  }
}

/** Titre de travail proposé depuis une recherche : un point de départ, que le créateur réécrit. */
export function titreDepuisTerme(terme: string): string {
  const t = terme.trim().slice(0, 160);
  return t ? t.charAt(0).toLocaleUpperCase("fr") + t.slice(1) : "";
}

/** Ce qu'on accepte en paramètre `titre` (lien « Créer un guide sur ce sujet ») : du texte court, rien d'autre. */
export function titreDepuisParametre(v: string | string[] | undefined): string {
  const brut = typeof v === "string" ? v : "";
  // Caractères de contrôle (0 à 31, 127) remplacés par des espaces, par point de code.
  const propre = Array.from(brut, (ch) => {
    const n = ch.codePointAt(0) ?? 0;
    return n < 32 || n === 127 ? " " : ch;
  }).join("");
  return propre.replace(/\s+/g, " ").trim().slice(0, 160);
}
