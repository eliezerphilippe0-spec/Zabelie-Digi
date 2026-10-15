import { projetPourEditeur, type ProjetEditeur } from "./api";
import { PREFIXE_BROUILLON, purgerBrouillons } from "./local-draft-purge";
import { CHAMPS_BRIEF_FACULTATIFS, CHAMPS_BRIEF_REQUIS } from "./schema";

/**
 * Brouillon local du Studio de création (décision D6, docs/70, tâche 2.5).
 *
 * Une copie de travail par COMPTE et par PROJET, dans `localStorage`, pour
 * survivre à une coupure ou à un onglet fermé (STU 05). Ce n'est pas une
 * sauvegarde : la vérité reste au serveur, et le brouillon s'efface dès que
 * le serveur a confirmé ce qu'il contient.
 *
 * Tout accès est protégé : un stockage refusé (navigation privée, quota
 * plein, réglage du téléphone) rend `null` ou `false`, jamais une exception.
 * L'édition en ligne continue, et l'écran dit qu'aucun brouillon n'est gardé.
 */

export type EtatLocal = Pick<ProjetEditeur, "titre" | "langue" | "public" | "marcheDiaspora" | "brief" | "contenu">;

export type BrouillonLocal = {
  v: 1;
  userId: string;
  projetId: string;
  /** La révision du serveur sur laquelle les modifications ont été faites. */
  revisionBase: number;
  enregistreA: number;
  etat: EtatLocal;
};

export type Stockage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function cleBrouillon(userId: string, projetId: string): string {
  return `${PREFIXE_BROUILLON}${userId}:${projetId}`;
}

/** Le stockage du navigateur, s'il accepte vraiment d'écrire ; sinon `null`. */
export function stockageLocal(): Stockage | null {
  try {
    const s = window.localStorage;
    const sonde = `${PREFIXE_BROUILLON}sonde`;
    s.setItem(sonde, "1");
    s.removeItem(sonde);
    return s;
  } catch {
    return null;
  }
}

export function ecrireBrouillon(s: Stockage, b: BrouillonLocal): boolean {
  try {
    s.setItem(cleBrouillon(b.userId, b.projetId), JSON.stringify(b));
    return true;
  } catch {
    return false; // quota plein : l'édition en ligne continue.
  }
}

/**
 * Le brouillon de CE compte pour CE projet, remis en forme comme une ligne
 * de base (même méfiance : il a pu être modifié à la main). `null` s'il est
 * absent, illisible, d'une autre version ou d'un autre compte.
 */
export function lireBrouillon(s: Stockage, userId: string, projetId: string): BrouillonLocal | null {
  let brut: unknown;
  try {
    const texte = s.getItem(cleBrouillon(userId, projetId));
    if (!texte) return null;
    brut = JSON.parse(texte);
  } catch {
    return null;
  }
  if (!brut || typeof brut !== "object") return null;
  const b = brut as Record<string, unknown>;
  if (b.v !== 1 || b.userId !== userId || b.projetId !== projetId) return null;
  if (typeof b.revisionBase !== "number" || !Number.isSafeInteger(b.revisionBase) || b.revisionBase < 1) return null;
  if (typeof b.enregistreA !== "number" || !Number.isFinite(b.enregistreA)) return null;
  const e = (b.etat ?? {}) as Record<string, unknown>;
  const p = projetPourEditeur({
    id: projetId, revision: b.revisionBase, titre: e.titre, langue: e.langue, public_vise: e.public,
    marche_diaspora: e.marcheDiaspora, brief: e.brief, contenu: e.contenu,
  });
  if (!p) return null;
  const { titre, langue, public: publicVise, marcheDiaspora, brief, contenu } = p;
  return { v: 1, userId, projetId, revisionBase: b.revisionBase, enregistreA: b.enregistreA,
    etat: { titre, langue, public: publicVise, marcheDiaspora, brief, contenu } };
}

export function effacerBrouillon(s: Stockage, userId: string, projetId: string): void {
  try {
    s.removeItem(cleBrouillon(userId, projetId));
  } catch {
    /* rien à faire : un stockage qui refuse d'effacer refusera aussi d'écrire */
  }
}

/**
 * Le brouillon apporte-t-il quelque chose que le serveur n'a pas ? Comparé
 * champ par champ dans un ordre FIXE : Postgres réordonne les clés d'un
 * `jsonb`, un `JSON.stringify` du brief verrait des écarts qui n'existent pas.
 */
export function brouillonDiffere(local: EtatLocal, serveur: EtatLocal): boolean {
  const champs = [...CHAMPS_BRIEF_REQUIS, ...CHAMPS_BRIEF_FACULTATIFS];
  const forme = (e: EtatLocal) =>
    JSON.stringify([e.titre, e.langue, e.public, e.marcheDiaspora, champs.map((c) => e.brief[c]), e.contenu.objectif,
      e.contenu.sections.map((s) => [s.id, s.titre, s.resultat, s.corps])]);
  return forme(local) !== forme(serveur);
}

export { purgerBrouillons };
