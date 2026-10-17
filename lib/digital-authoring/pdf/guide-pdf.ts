import { createHash } from "node:crypto";
import { mettreEnPage, type GuideNormalise, type OptionsMiseEnPage } from "./layout";
import { ecrirePdf } from "./writer";
import { caracteresNonPrisEnCharge, normaliserPourPdf, octetWinAnsi } from "./winansi";

/**
 * Le PDF d'un guide du Studio (tâches 4.1, 4.4 et 4.5 ; décision D1-A :
 * moteur interne, aucune dépendance). Trois rendus du même contenu :
 *   - le GUIDE, dont l'empreinte des octets sera approuvée (tâche 4.3) ;
 *   - l'EXTRAIT gratuit : titre, sommaire complet, première section, page de fin ;
 *   - l'EXEMPLAIRE nominatif : le guide, plus une ligne en pied de page.
 *
 * Un caractère sans dessin n'est jamais remplacé en silence : le rendu est
 * refusé, en nommant où il se trouve et lequel il est. Seule exception, le nom
 * de l'acheteur d'un exemplaire, qu'on ne peut pas refuser : ses caractères
 * sans dessin sont retirés.
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

type Prepare = { ok: true; g: GuideNormalise } | Exclude<ResultatPdf, { ok: true }>;

function preparer(guide: GuidePourPdf): Prepare {
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
  return { ok: true, g };
}

function rendre(guide: GuidePourPdf, options: OptionsMiseEnPage): ResultatPdf {
  const p = preparer(guide);
  if (!p.ok) return p;
  const mep = mettreEnPage(p.g, options);
  const octets = ecrirePdf(mep, p.g.titre);
  return {
    ok: true,
    octets,
    pages: mep.pages.length,
    empreinte: createHash("sha256").update(octets).digest("hex"),
    sommaire: mep.sommaire,
  };
}

/** Le guide complet : c'est son empreinte que le créateur approuve. */
export function rendreGuidePdf(guide: GuidePourPdf): ResultatPdf {
  return rendre(guide, {});
}

/** L'extrait gratuit (4.4), tiré du même contenu que le guide. */
export function rendreExtraitPdf(guide: GuidePourPdf): ResultatPdf {
  return rendre(guide, { extrait: true });
}

const MENTION = { ht: "Kopi pou {nom} · kòmand {commande}", fr: "Exemplaire de {nom} · commande {commande}" } as const;

/**
 * La mention d'un exemplaire nominatif (4.5) : prénom et initiale du nom,
 * jamais plus ; référence de commande réduite à ses lettres, chiffres et
 * tirets. Aucun téléphone, aucune adresse ne peut y passer.
 */
export function mentionExemplaire(langue: GuidePourPdf["langue"], nom: string, commande: string): string {
  // Ni caractère sans dessin, ni chiffre : un numéro de téléphone tapé dans le nom ne passe pas.
  const dessinable = (t: string) => [...t].filter((ch) => octetWinAnsi(ch.codePointAt(0) ?? 0) !== null && !(ch >= "0" && ch <= "9")).join("");
  const mots = dessinable(normaliserPourPdf(nom)).split(" ").filter(Boolean);
  const court = mots.length > 1 ? `${mots[0]} ${[...mots[mots.length - 1]][0]}.` : (mots[0] ?? "");
  const ref = [...commande].filter((c) => /[A-Za-z0-9-]/.test(c)).join("").slice(0, 24);
  const prenom = [...court].slice(0, 40).join("");
  return MENTION[langue].replace("{nom}", prenom || "?").replace("{commande}", ref || "?");
}

/** L'exemplaire nominatif : le guide approuvé, plus la mention en pied de chaque page. */
export function rendreExemplairePdf(guide: GuidePourPdf, acheteur: { nom: string; commande: string }): ResultatPdf {
  return rendre(guide, { exemplaire: mentionExemplaire(guide.langue, acheteur.nom, acheteur.commande) });
}
