import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { erreurTraduite } from "@/lib/api-erreur";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { importerFicheParLien } from "@/lib/import-fiche-serveur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/products/import  { url }
 *
 * Importer une fiche par lien (lot 2, 2026-11-11) : lit une page PUBLIQUE et
 * rend son titre et sa description pour préremplir le formulaire du vendeur.
 *
 * ⚠️ Cette route N'ÉCRIT RIEN : ni produit, ni brouillon, ni image. Le vendeur
 * relit le texte dans le formulaire et l'envoie par la route de création
 * habituelle, avec sa revue humaine. Elle ne lit ni photo ni prix (voir
 * `lib/import-fiche.ts`).
 *
 * Gardes, dans l'ordre :
 *   1. session vendeur valide, compte actif ;
 *   2. cadence bornée par compte (le serveur sort sur Internet à chaque appel) ;
 *   3. lien et lecture gardés contre le détournement vers une adresse interne
 *      (`lib/import-fiche-serveur.ts`).
 */
const IMPORTS_PAR_HEURE = 20;
const CORPS_MAX = 2048;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return erreurTraduite("api.auth.required", 401);
  const refus = await requireActiveAccount(user.id);
  if (refus) return refus;

  let url: unknown;
  try {
    const brut = await req.text();
    if (brut.length > CORPS_MAX) return erreurTraduite("api.import.url", 422);
    url = (JSON.parse(brut) as { url?: unknown })?.url;
  } catch {
    return erreurTraduite("api.import.url", 422);
  }

  const admin = createAdminClient();
  if (!(await rateLimit(admin, `import_fiche:${user.id}`, IMPORTS_PAR_HEURE, 3600))) {
    return erreurTraduite("api.import.limit", 429);
  }

  const resultat = await importerFicheParLien(url);
  if (!resultat.ok) {
    return resultat.raison === "lien_invalide" ? erreurTraduite("api.import.url", 422)
      : resultat.raison === "rien_trouve" ? erreurTraduite("api.import.empty", 422)
      : erreurTraduite("api.import.unreachable", 502);
  }
  return NextResponse.json(
    { titre: resultat.fiche.titre, description: resultat.fiche.description, marque: resultat.fiche.marque, hote: resultat.hote },
    { headers: { "Cache-Control": "no-store" } }
  );
}
