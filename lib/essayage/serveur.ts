import { groupeDe, pieceDuSousRayon, sousRayonOuvert, type RefusEssayage } from "./regles";
import { DUREE_MAX_ESSAI_MS, ErreurFournisseur, type FournisseurEssayage, type NomFournisseur, type PhotoAcheteur, type RaisonEchec, type TypePhoto } from "./fournisseurs/types";

/**
 * Essayage virtuel — le cœur serveur (docs/74 §3 ; tasks/essayage-todo.md 4.1).
 *
 *   démarrer : groupe, photo, vêtement → réserver (base) → créer (fournisseur) → noter le travail
 *   suivre   : relire l'essai → statut chez le fournisseur → clore (base) → effacer → image en data:
 *
 * La base et le fournisseur sont INJECTÉS : ce module se teste sans réseau
 * ni Supabase (`lib/essayage/base.ts` est la vraie base). Il n'écrit jamais
 * la photo ni le résultat, et ne les journalise pas.
 */

/** La photo arrive compressée par le téléphone (lib/image-compress.ts, 1,5 Mo au plus) ; 3 Mo laissent de la marge sous les 4,5 Mo d'une requête Vercel. */
export const POIDS_MAX_PHOTO = 3 * 1024 * 1024;

export type LigneEssai = {
  id: string;
  fournisseur: NomFournisseur;
  travailId: string | null;
  statut: "en_cours" | "reussi" | "echec";
  raison: RaisonEchec | null;
  /** Création, en millisecondes. */
  creeLe: number;
};

export type VetementFiche = { imageUrl: string; titre: string; sousRayon: string | null };

/** Ce que le cœur attend de la base (migration 0150, au rôle service). */
export interface BaseEssayage {
  lireVetement(produit: string): Promise<VetementFiche | null>;
  reserver(acheteur: string, produit: string, fournisseur: NomFournisseur): Promise<{ essai: string } | { refus: "non_eligible" | "pause" | "plafond" | "quota" }>;
  lancer(essai: string, travail: string): Promise<void>;
  terminer(essai: string, statut: "reussi" | "echec", raison?: RaisonEchec): Promise<void>;
  /** L'essai, seulement s'il appartient à cet acheteur. */
  lireEssai(essai: string, acheteur: string): Promise<LigneEssai | null>;
}

export type Demarrage = { ok: true; essai: string } | { ok: false; refus: RefusEssayage } | { ok: false; echec: RaisonEchec };
export type Suivi = { etat: "en_cours" } | { etat: "reussi"; image: string } | { etat: "echec"; raison: RaisonEchec } | { etat: "expire" } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES: readonly TypePhoto[] = ["image/jpeg", "image/png", "image/webp"];

/** Le type annoncé doit être celui des premiers octets : un fichier renommé ne passe pas. */
function photoValide(photo: PhotoAcheteur): boolean {
  const o = photo.octets;
  if (!TYPES.includes(photo.type) || o.length < 4 || o.length > POIDS_MAX_PHOTO) return false;
  if (photo.type === "image/jpeg") return o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff;
  if (photo.type === "image/png") return o.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => o[i] === b);
  return o.length >= 12 && String.fromCharCode(...o.slice(0, 4)) === "RIFF" && String.fromCharCode(...o.slice(8, 12)) === "WEBP";
}

export async function demarrerEssai(
  deps: { base: BaseEssayage; fournisseur: FournisseurEssayage },
  entree: { acheteurId: string; produitId: string; photo: PhotoAcheteur },
): Promise<Demarrage> {
  // Le groupe témoin ne voit pas le bouton ; il ne passe pas non plus par l'API (mesure intacte).
  if (groupeDe(entree.acheteurId) !== "essai" || !UUID.test(entree.produitId)) return { ok: false, refus: "non_eligible" };
  if (!photoValide(entree.photo)) return { ok: false, refus: "photo" };

  const vetement = await deps.base.lireVetement(entree.produitId);
  if (!vetement || !sousRayonOuvert(vetement.sousRayon) || !vetement.imageUrl.startsWith("https://")) return { ok: false, refus: "non_eligible" };

  const reservation = await deps.base.reserver(entree.acheteurId, entree.produitId, deps.fournisseur.nom);
  if ("refus" in reservation) return { ok: false, refus: reservation.refus };

  let travail;
  try {
    travail = await deps.fournisseur.creer(entree.photo, { imageUrl: vetement.imageUrl, titre: vetement.titre, piece: pieceDuSousRayon(vetement.sousRayon) });
  } catch (e) {
    // Refusé avant tout traitement : l'essai est clos en échec et ne compte pas.
    const raison: RaisonEchec = e instanceof ErreurFournisseur ? e.raison : "fournisseur";
    await deps.base.terminer(reservation.essai, "echec", raison);
    return { ok: false, echec: raison };
  }
  await deps.base.lancer(reservation.essai, travail.id);
  return { ok: true, essai: reservation.essai };
}

export async function suivreEssai(
  deps: { base: BaseEssayage; fournisseur: FournisseurEssayage; maintenant?: () => number },
  acheteurId: string,
  essaiId: string,
): Promise<Suivi> {
  if (!UUID.test(essaiId)) return null;
  const ligne = await deps.base.lireEssai(essaiId, acheteurId);
  if (!ligne) return null;
  if (ligne.statut === "echec") return { etat: "echec", raison: ligne.raison ?? "fournisseur" };
  // Réussi et déjà rendu : l'image n'est conservée nulle part.
  if (ligne.statut === "reussi") return { etat: "expire" };

  const clore = async (raison: RaisonEchec): Promise<Suivi> => {
    await deps.base.terminer(ligne.id, "echec", raison);
    if (ligne.travailId) await deps.fournisseur.effacer({ fournisseur: ligne.fournisseur, id: ligne.travailId });
    return { etat: "echec", raison };
  };
  if (ligne.fournisseur !== deps.fournisseur.nom) return clore("fournisseur");
  const depasse = (deps.maintenant ?? Date.now)() - ligne.creeLe > DUREE_MAX_ESSAI_MS;
  if (!ligne.travailId) return depasse ? clore("delai") : { etat: "en_cours" };

  let etat;
  try {
    etat = await deps.fournisseur.statut({ fournisseur: ligne.fournisseur, id: ligne.travailId });
  } catch (e) {
    // Fournisseur injoignable : le sondage suivant réessaie. Passé le délai, l'essai
    // est clos en échec, sinon il resterait « en cours » et compterait pour l'acheteur.
    if (depasse) return clore("delai");
    throw e;
  }
  if (etat.etat === "en_cours") return depasse ? clore("delai") : { etat: "en_cours" };
  if (etat.etat === "echec") return clore(etat.raison);
  await deps.base.terminer(ligne.id, "reussi");
  await deps.fournisseur.effacer({ fournisseur: ligne.fournisseur, id: ligne.travailId });
  return { etat: "reussi", image: `data:${etat.image.type};base64,${etat.image.base64}` };
}
