import { createHash } from "node:crypto";
import { mettreEnPage, type GuideNormalise } from "./layout";
import { ecrirePdf } from "./writer";
import { caracteresNonPrisEnCharge, normaliserPourPdf } from "./winansi";

/**
 * Le PDF d'un guide du Studio (tâche 4.1 ; décision D1-A : moteur interne,
 * aucune dépendance). Point d'entrée unique : normalise, vérifie que chaque
 * caractère a un dessin, met en page, écrit, et rend l'empreinte des octets
 * (l'approbation de l'export, tâche 4.3, portera sur elle).
 *
 * Un caractère sans dessin n'est jamais remplacé en silence : le rendu est
 * refusé, en nommant où il se trouve et lequel il est.
 */

export type GuidePourPdf = {
  langue: "ht" | "fr";
  titre: string;
  objectif: string;
  auteur: string;
  sections: { titre: string; resultat: string; corps: string }[];
};

export type ProblemeCaractere = { ou: "titre" | "objectif" | "auteur" | "section"; section: number | null; caracteres: string[] };

export type ResultatPdf =
  | { ok: true; octets: Uint8Array; pages: number; empreinte: string; sommaire: { titre: string; page: number }[] }
  | { ok: false; code: "guide_vide" }
  | { ok: false; code: "caracteres_non_pris_en_charge"; problemes: ProblemeCaractere[] };

export function rendreGuidePdf(guide: GuidePourPdf): ResultatPdf {
  const g: GuideNormalise = {
    langue: guide.langue,
    titre: normaliserPourPdf(guide.titre).trim(),
    objectif: normaliserPourPdf(guide.objectif).trim(),
    auteur: normaliserPourPdf(guide.auteur).trim(),
    sections: guide.sections.map((s) => ({
      titre: normaliserPourPdf(s.titre).trim(),
      resultat: normaliserPourPdf(s.resultat).trim(),
      corps: normaliserPourPdf(s.corps),
    })),
  };
  if (!g.titre || g.sections.length === 0) return { ok: false, code: "guide_vide" };

  const problemes: ProblemeCaractere[] = [];
  for (const ou of ["titre", "objectif", "auteur"] as const) {
    const c = caracteresNonPrisEnCharge(g[ou]);
    if (c.length) problemes.push({ ou, section: null, caracteres: c });
  }
  g.sections.forEach((s, i) => {
    const c = caracteresNonPrisEnCharge(s.titre + s.resultat + s.corps);
    if (c.length) problemes.push({ ou: "section", section: i + 1, caracteres: c });
  });
  if (problemes.length) return { ok: false, code: "caracteres_non_pris_en_charge", problemes };

  const mep = mettreEnPage(g);
  const octets = ecrirePdf(mep, g.titre);
  return {
    ok: true,
    octets,
    pages: mep.pages.length,
    empreinte: createHash("sha256").update(octets).digest("hex"),
    sommaire: mep.sommaire,
  };
}
