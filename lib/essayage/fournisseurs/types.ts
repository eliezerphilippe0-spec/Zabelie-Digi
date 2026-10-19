import type { PieceVetement } from "../regles";

/**
 * Essayage virtuel — ce que tout fournisseur sait faire (docs/74 §3).
 *
 * Les deux API retenues sont asynchrones (Genlook comme FASHN : on crée, puis
 * on interroge). L'interface l'est aussi : `creer` rend un travail, `statut`
 * dit où il en est. Le reste de l'application ne connaît que cette interface :
 * changer de fournisseur, c'est changer `ZABELIE_ESSAYAGE_FOURNISSEUR`.
 */

export type NomFournisseur = "genlook" | "fashn" | "simulation";

export type TypePhoto = "image/jpeg" | "image/png" | "image/webp";

/** La photo de l'acheteur : en mémoire, le temps de l'envoi. Jamais écrite côté Zabelie (docs/74 §10). */
export type PhotoAcheteur = { octets: Uint8Array<ArrayBuffer>; type: TypePhoto };

/** Le vêtement : la photo principale publique de la fiche, et ce qu'il couvre. */
export type VetementEssaye = { imageUrl: string; titre: string; piece: PieceVetement };

export type Travail = { fournisseur: NomFournisseur; id: string };

export type RaisonEchec = "moderation" | "photo_refusee" | "fournisseur" | "delai";

/**
 * L'image rendue. Elle s'affiche en `data:` (la CSP n'admet pas d'image venue
 * d'ailleurs, lib/content-security-policy.ts) et n'est jamais écrite.
 */
export type ImageResultat = { type: "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml"; base64: string };

export type EtatTravail =
  | { etat: "en_cours" }
  | { etat: "reussi"; image: ImageResultat }
  | { etat: "echec"; raison: RaisonEchec };

/**
 * Un refus du fournisseur, avec sa raison. Le message ne cite jamais la clé
 * ni la photo : il peut finir dans un journal. `passagere` : panne réseau ou
 * délai d'un appel, qu'un nouvel essai peut lever.
 */
export class ErreurFournisseur extends Error {
  constructor(
    readonly raison: RaisonEchec,
    message: string,
    readonly passagere = false,
  ) {
    super(message);
    this.name = "ErreurFournisseur";
  }
}

export interface FournisseurEssayage {
  readonly nom: NomFournisseur;
  /** Lève `ErreurFournisseur` quand le fournisseur refuse (photo, modération, crédits, panne, délai). */
  creer(photo: PhotoAcheteur, vetement: VetementEssaye, signal?: AbortSignal): Promise<Travail>;
  /** Ne lève pas pour un travail inconnu ou abîmé : c'est un échec, que l'appelant compte comme tel. */
  statut(travail: Travail, signal?: AbortSignal): Promise<EtatTravail>;
  /** Efface chez le fournisseur ce qui peut l'être (photo, résultat), dès le résultat lu. */
  effacer(travail: Travail): Promise<void>;
}

/** Un appel au fournisseur ne dure jamais plus que ça… */
export const DELAI_APPEL_MS = 15_000;
/** …et un essai entier pas plus de 60 secondes : au-delà, il échoue et ne compte pas (docs/74 §11, critère 7). */
export const DUREE_MAX_ESSAI_MS = 60_000;
