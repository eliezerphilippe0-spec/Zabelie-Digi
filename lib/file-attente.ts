/**
 * LES FILES D'ACTION ADMIN — paginées, et surveillées pour autre chose.
 *
 * ─── CE QUE CE MODULE SURVEILLAIT HIER, ET POURQUOI ÇA CHANGE ──────────────
 * Les files Zelle et topup étaient bornées à 50 lignes AFFICHÉES, sans suite :
 * au-delà, les plus anciennes demandes disparaissaient de l'écran. Ce module
 * comparait donc le compte réel au plafond et criait « tronquée » — un
 * paiement en attente pouvait n'apparaître JAMAIS à l'admin.
 *
 * Elles sont désormais PAGINÉES. Plus rien n'est invisible, et c'est
 * exactement pour ça que le garde devait changer : un contrôle dont la panne
 * est devenue impossible rend « rien à signaler » à chaque passage, pour
 * toujours. C'est le filet posé sur un chemin impraticable, à l'envers — il
 * ne mesure plus rien et son silence se lit comme une bonne nouvelle.
 *
 * ─── CE QU'IL SURVEILLE MAINTENANT ─────────────────────────────────────────
 * L'ARRIÉRÉ, qui est le vrai risque restant. Une file paginée de 200 Zelle en
 * attente n'a rien d'invisible — et personne ne les traitera pour autant. Le
 * seuil ne dit plus « tu ne vois pas tout », il dit « il y en a plus que ce
 * qu'une personne traite dans une session ».
 *
 * Le seuil garde sa valeur (35) parce que la question qu'il pose n'a pas
 * changé d'échelle, seulement de nature.
 */

import { bornes, pageValide, nbPages, pageDansBornes } from "@/lib/pagination";

/** Lignes par page dans une file d'action. 25 se parcourt d'un écran. */
export const PAGE_FILE = 25;

/**
 * Au-delà, l'écran le dit. 35 = une file qu'on ne vide pas d'une traite ;
 * en dessous, un avertissement permanent cesserait d'être lu.
 */
export const SEUIL_ALERTE = 35;

export type EtatFile = {
  /** Compte réel en base, tous filtres de la file appliqués. */
  total: number;
  /** Page courante, 1-indexée. */
  page: number;
  /** Nombre total de pages — au moins 1, même à zéro ligne. */
  pages: number;
  /** L'arriéré dépasse le seuil : à dire à l'écran, pas seulement au journal. */
  alerte: boolean;
};

/**
 * Bornes `range()` (inclusives des deux côtés) pour une page de file.
 *
 * Délègue à `lib/pagination.ts` : la même arithmétique servait déjà au
 * catalogue et sert maintenant aux ventes du vendeur. Trois copies, c'est se
 * garantir qu'une correction de décalage n'atterrira que sur deux.
 *
 * ⚠️ La leçon reste écrite là-bas : `Math.max(1, NaN)` vaut NaN, pas 1 — la
 * première version de cette fonction laissait passer un `range(NaN, NaN)`,
 * attrapé par le test et pas par la relecture.
 */
export function bornesFile(page: number): [number, number] {
  return bornes(page, PAGE_FILE);
}

/** Lit un `?zelle=2` d'URL sans jamais faire confiance à sa forme. */
export function pageDepuisParam(brut: string | undefined): number {
  return pageValide(brut);
}

/**
 * Établit l'état d'une file et journalise l'arriéré.
 *
 * ⚠️ `total` doit venir d'un COUNT en base, jamais de `lignes.length` : la
 * longueur d'une page est plafonnée par construction, elle ne peut pas
 * dépasser le seuil et l'alerte ne partirait donc jamais. C'est le piège de
 * la sonde qui regarde à côté — l'appelant est vérifié par test.
 */
export function surveillerFile(nom: string, total: number, page: number): EtatFile {
  const pages = nbPages(total, PAGE_FILE);
  const alerte = total >= SEUIL_ALERTE;

  if (alerte) {
    console.log(
      "[file]",
      JSON.stringify({
        at: new Date().toISOString(),
        code: "ZB086",
        file: nom,
        issue: "arriere_au_dessus_du_seuil",
        total,
        seuil: SEUIL_ALERTE,
        pages,
      })
    );
  }

  /* ⚠️ `Math.min(Math.max(1, NaN), pages)` vaut NaN : le garde qui a été
   * corrigé dans `bornesFile` survivait ICI, à trois lignes de son jumeau.
   * Trouvé par le test qui croisait les deux modules, pas à la relecture —
   * un même défaut recopié deux fois se corrige rarement deux fois. */
  return { total, page: pageDansBornes(page, total, PAGE_FILE), pages, alerte };
}
