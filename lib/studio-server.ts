import "server-only";
import { createHiggsfieldProvider, higgsfieldConfigFromEnv } from "@/lib/creative/providers/higgsfield";
import type { CreativeProvider } from "@/lib/creative/providers/creative";
import { studioEnabled } from "@/lib/creative/studio";

/**
 * Câblage serveur du Studio. Lectures d'environnement EXPLICITES
 * (inventaire `.env.example`, `docs/11`). Les clés Higgsfield ne quittent
 * jamais le serveur et ne portent jamais le préfixe `NEXT_PUBLIC_`.
 */
function env() {
  return {
    ZABELIE_STUDIO_ENABLED: process.env.ZABELIE_STUDIO_ENABLED,
    HF_API_KEY_ID: process.env.HF_API_KEY_ID,
    HF_API_KEY_SECRET: process.env.HF_API_KEY_SECRET,
    HF_TIMEOUT_MS: process.env.HF_TIMEOUT_MS,
  };
}

/** Allumé seulement si le drapeau vaut `true` ET que la configuration est valide. */
export function studioProvider(): CreativeProvider | null {
  const e = env();
  if (!studioEnabled(e)) return null;
  try {
    return createHiggsfieldProvider(higgsfieldConfigFromEnv(e), {
      // Un état non documenté est NOMMÉ, jamais interprété (docs/65 §3).
      etatInconnu: (etat) => console.warn("[studio] etat_higgsfield_inconnu", etat),
    });
  } catch (err) {
    // Le message nomme la variable manquante, jamais sa valeur.
    console.error("[studio] configuration", err instanceof Error ? err.message : "invalide");
    return null;
  }
}
