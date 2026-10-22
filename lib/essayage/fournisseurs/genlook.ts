import { randomUUID } from "node:crypto";

import { appeler, imageEnBase64, lireJson } from "./http";
import { DELAI_APPEL_MS, ErreurFournisseur, type EtatTravail, type FournisseurEssayage, type RaisonEchec, type Travail } from "./types";

/**
 * Essayage virtuel — adaptateur Genlook (docs/74 §3 ; API documentée sur
 * genlook.app/docs/tryon-api, relevée le 2026-10-19).
 *
 * 1. La photo part en FICHIER (`POST /images/upload`), gardée un jour au plus
 *    (`keepForDays: 1`), sous un identifiant NEUTRE propre à l'essai
 *    (`zab_<uuid>`) : rien n'y désigne l'acheteur, et il sert à tout effacer.
 * 2. L'essai (`POST /try-on`) part de la photo principale publique de la fiche.
 * 3. `GET /generations/:id` jusqu'à `COMPLETED` ; le serveur va alors chercher
 *    l'image, SANS la clé, et la rend en base64.
 * 4. `DELETE /customers/:externalUserId` efface photo et résultat dès qu'ils
 *    sont lus. La conservation d'un jour reste le filet si l'effacement rate.
 */

export type OptionsGenlook = {
  cle: string;
  fetch?: typeof fetch;
  base?: string;
  delaiAppelMs?: number;
  /** L'identifiant neutre de l'essai chez Genlook (tests). */
  idUtilisateur?: () => string;
};

const BASE = "https://api.genlook.app/tryon/v1";

// Refus à la création : ce que l'acheteur peut corriger (sa photo) ou non.
const PHOTO_REFUSEE = new Set(["INVALID_IMAGE", "UNSUPPORTED_IMAGE_TYPE", "FILE_TOO_LARGE", "CUSTOMER_IMAGE_REQUIRED", "FILE_REQUIRED"]);
const MODERATION = "CONTENT_POLICY_VIOLATION";

// Le travail porte la génération ET l'identifiant neutre, pour pouvoir effacer.
const FORME_TRAVAIL = /^([A-Za-z0-9_-]+):(zab_[A-Za-z0-9_-]+)$/;

function raisonDeCreation(code: unknown): RaisonEchec {
  if (code === MODERATION) return "moderation";
  if (typeof code === "string" && PHOTO_REFUSEE.has(code)) return "photo_refusee";
  return "fournisseur";
}

function raisonDeGeneration(code: unknown): RaisonEchec {
  if (code === MODERATION) return "moderation";
  if (code === "GENERATION_TIMEOUT") return "delai";
  return "fournisseur";
}

export function genlook(options: OptionsGenlook): FournisseurEssayage {
  const f = options.fetch ?? fetch;
  const base = options.base ?? BASE;
  const delai = options.delaiAppelMs ?? DELAI_APPEL_MS;
  const idUtilisateur = options.idUtilisateur ?? (() => `zab_${randomUUID()}`);
  const entetes = { "x-api-key": options.cle };

  return {
    nom: "genlook",

    async creer(photo, vetement, signal): Promise<Travail> {
      const externalUserId = idUtilisateur();

      const formulaire = new FormData();
      formulaire.append("file", new Blob([photo.octets], { type: photo.type }), "photo");
      formulaire.append("keepForDays", "1");
      formulaire.append("externalUserId", externalUserId);
      const envoi = await appeler(f, `${base}/images/upload`, { method: "POST", headers: entetes, body: formulaire }, delai, signal);
      const image = await lireJson(envoi);
      if (!envoi.ok) throw new ErreurFournisseur(raisonDeCreation(image?.code), `envoi de la photo refusé (${envoi.status})`);
      if (typeof image?.imageId !== "string") throw new ErreurFournisseur("fournisseur", "réponse d'envoi inattendue");

      const essai = await appeler(
        f,
        `${base}/try-on`,
        {
          method: "POST",
          headers: { ...entetes, "content-type": "application/json" },
          body: JSON.stringify({
            products: [{ title: vetement.titre, images: [{ source: { url: vetement.imageUrl } }] }],
            person: { image: { source: { id: image.imageId } } },
            externalUserId,
            // Pas de filigrane Genlook ; la mention « généré par IA » sur l'image, en plus de la nôtre à l'écran.
            output: { watermark: false, aiLabel: true },
          }),
        },
        delai,
        signal,
      );
      const generation = await lireJson(essai);
      if (!essai.ok) throw new ErreurFournisseur(raisonDeCreation(generation?.code), `essai refusé (${essai.status})`);
      if (typeof generation?.generationId !== "string" || !/^[A-Za-z0-9_-]+$/.test(generation.generationId)) {
        throw new ErreurFournisseur("fournisseur", "réponse d'essai inattendue");
      }
      return { fournisseur: "genlook", id: `${generation.generationId}:${externalUserId}` };
    },

    async statut(travail, signal): Promise<EtatTravail> {
      const forme = travail.fournisseur === "genlook" ? FORME_TRAVAIL.exec(travail.id) : null;
      if (!forme) return { etat: "echec", raison: "fournisseur" };
      try {
        const res = await appeler(f, `${base}/generations/${forme[1]}`, { method: "GET", headers: entetes }, delai, signal);
        // Trop de requêtes ou panne passagère : on réessaiera au prochain tour.
        if (res.status === 429 || res.status >= 500) return { etat: "en_cours" };
        const corps = await lireJson(res);
        if (!res.ok || !corps) return { etat: "echec", raison: "fournisseur" };
        if (corps.status === "PENDING" || corps.status === "PROCESSING") return { etat: "en_cours" };
        if (corps.status === "FAILED") return { etat: "echec", raison: raisonDeGeneration(corps.errorCode) };
        if (corps.status === "COMPLETED" && typeof corps.resultImageUrl === "string") {
          return { etat: "reussi", image: await imageEnBase64(f, corps.resultImageUrl, delai, signal) };
        }
        return { etat: "echec", raison: "fournisseur" };
      } catch (e) {
        // Réseau ou délai : passager tant que l'essai n'a pas dépassé sa durée maximale (décidé par l'appelant).
        if (e instanceof ErreurFournisseur && e.passagere) return { etat: "en_cours" };
        return { etat: "echec", raison: "fournisseur" };
      }
    },

    async effacer(travail): Promise<void> {
      const forme = travail.fournisseur === "genlook" ? FORME_TRAVAIL.exec(travail.id) : null;
      if (!forme) return;
      try {
        await appeler(f, `${base}/customers/${forme[2]}`, { method: "DELETE", headers: entetes }, delai);
      } catch {
        // La conservation d'un jour (keepForDays) reste le filet.
      }
    },
  };
}
