import type { PieceVetement } from "../regles";
import { POIDS_MAX_RESULTAT, appeler, imageEnBase64, lireJson } from "./http";
import { DELAI_APPEL_MS, ErreurFournisseur, type EtatTravail, type FournisseurEssayage, type ImageResultat, type RaisonEchec, type Travail } from "./types";

/**
 * Essayage virtuel — adaptateur FASHN (docs/74 §3 ; API documentée sur
 * docs.fashn.ai, relevée le 2026-10-19).
 *
 * 1. `POST /v1/run` (`tryon-v1.6`). La photo de l'acheteur part en BASE64,
 *    jamais en URL : FASHN garde sans limite les URL envoyées dans son
 *    historique et n'offre pas d'effacement, alors que la copie d'une entrée
 *    base64 est supprimée à la fin du traitement. Modération `conservative`
 *    (bloque sous-vêtements et maillots), résultat en base64 (gardé une heure
 *    chez eux), JPEG plus léger que PNG pour la 3G.
 * 2. `GET /v1/status/:id` jusqu'à `completed`.
 * 3. Rien à effacer : pas de point d'effacement, et rien n'est resté.
 */

export type OptionsFashn = {
  cle: string;
  fetch?: typeof fetch;
  base?: string;
  delaiAppelMs?: number;
};

const BASE = "https://api.fashn.ai/v1";
const MODELE = "tryon-v1.6";

const CATEGORIE: Record<PieceVetement, string> = { haut: "tops", bas: "bottoms", entier: "one-pieces", ensemble: "auto" };
const EN_COURS = new Set(["starting", "in_queue", "processing"]);
const FORME_ID = /^[A-Za-z0-9-]+$/;
const DATA_URI = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

function raisonDeTraitement(nom: unknown): RaisonEchec {
  if (nom === "ContentModerationError") return "moderation";
  // Pas de pose détectée : l'acheteur peut reprendre une photo de face, en pied.
  if (nom === "PoseError") return "photo_refusee";
  return "fournisseur";
}

function imageDeDataUri(uri: string): ImageResultat | null {
  const m = DATA_URI.exec(uri);
  if (!m || (m[2].length * 3) / 4 > POIDS_MAX_RESULTAT) return null;
  return { type: m[1] as ImageResultat["type"], base64: m[2] };
}

export function fashn(options: OptionsFashn): FournisseurEssayage {
  const f = options.fetch ?? fetch;
  const base = options.base ?? BASE;
  const delai = options.delaiAppelMs ?? DELAI_APPEL_MS;
  const entetes = { authorization: `Bearer ${options.cle}` };

  return {
    nom: "fashn",

    async creer(photo, vetement, signal): Promise<Travail> {
      const res = await appeler(
        f,
        `${base}/run`,
        {
          method: "POST",
          headers: { ...entetes, "content-type": "application/json" },
          body: JSON.stringify({
            model_name: MODELE,
            inputs: {
              model_image: `data:${photo.type};base64,${Buffer.from(photo.octets).toString("base64")}`,
              garment_image: vetement.imageUrl,
              category: CATEGORIE[vetement.piece],
              moderation_level: "conservative",
              return_base64: true,
              output_format: "jpeg",
            },
          }),
        },
        delai,
        signal,
      );
      const corps = await lireJson(res);
      if (!res.ok || typeof corps?.id !== "string" || !FORME_ID.test(corps.id)) {
        throw new ErreurFournisseur("fournisseur", `essai refusé (${res.status})`);
      }
      return { fournisseur: "fashn", id: corps.id };
    },

    async statut(travail, signal): Promise<EtatTravail> {
      if (travail.fournisseur !== "fashn" || !FORME_ID.test(travail.id)) return { etat: "echec", raison: "fournisseur" };
      try {
        const res = await appeler(f, `${base}/status/${travail.id}`, { method: "GET", headers: entetes }, delai, signal);
        if (res.status === 429 || res.status >= 500) return { etat: "en_cours" };
        const corps = await lireJson(res);
        if (!res.ok || !corps) return { etat: "echec", raison: "fournisseur" };
        if (typeof corps.status === "string" && EN_COURS.has(corps.status)) return { etat: "en_cours" };
        if (corps.status === "failed") {
          const erreur = corps.error as { name?: unknown } | null;
          return { etat: "echec", raison: raisonDeTraitement(erreur?.name) };
        }
        if (corps.status === "completed" && Array.isArray(corps.output) && typeof corps.output[0] === "string") {
          const sortie = corps.output[0];
          if (sortie.startsWith("data:")) {
            const image = imageDeDataUri(sortie);
            return image ? { etat: "reussi", image } : { etat: "echec", raison: "fournisseur" };
          }
          // Si FASHN rendait une URL malgré `return_base64` : récupérée sans la clé.
          if (sortie.startsWith("https://")) return { etat: "reussi", image: await imageEnBase64(f, sortie, delai, signal) };
        }
        // « _expired », sortie vide ou état inconnu.
        return { etat: "echec", raison: "fournisseur" };
      } catch (e) {
        if (e instanceof ErreurFournisseur && e.passagere) return { etat: "en_cours" };
        return { etat: "echec", raison: "fournisseur" };
      }
    },

    async effacer(): Promise<void> {
      // FASHN n'a pas de point d'effacement ; l'entrée base64 est supprimée à la fin
      // du traitement et le résultat base64 expire au bout de 60 minutes.
    },
  };
}
