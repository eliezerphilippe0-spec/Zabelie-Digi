import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSuspension } from "@/lib/auth";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { getLang } from "@/lib/i18n-server";
import {
  SURPLUS_DEFAUTS,
  enregistrerSurplus,
  lireConfigSurplus,
} from "@/lib/ai-billing";
import {
  AI_KEYWORDS_MAX,
  AI_TITLE_MAX,
  aiProviderDisponible,
  genererDescription,
} from "@/lib/ai-description";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/description  { title, category?, keywords? }
 * Suggestion de description produit pour le vendeur connecté.
 *
 * Kill-switch : aucune clé fournisseur posée → 503, et les pages vendeur
 * n'affichent même pas le bouton (même prédicat `aiProviderDisponible`).
 * La langue de génération est celle de la session (cookie) — le client ne
 * choisit pas la langue d'un autre.
 */
export async function POST(req: Request) {
  const fournisseur = aiProviderDisponible();
  if (!fournisseur) {
    return NextResponse.json(
      { error: "Assistant de rédaction non activé." },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }
  if (await getSuspension(user.id)) {
    return NextResponse.json(
      { error: "Compte suspendu — action non autorisée." },
      { status: 403 }
    );
  }

  let body: {
    title?: string;
    category?: string;
    keywords?: string;
    surplusOk?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 2 || title.length > AI_TITLE_MAX) {
    return NextResponse.json({ error: "Titre requis" }, { status: 400 });
  }
  const category =
    typeof body.category === "string" && body.category.trim()
      ? body.category.trim()
      : undefined;
  // Les faits vendeur : bornés, jamais refusés — la voie du détail réel.
  const keywords =
    typeof body.keywords === "string" && body.keywords.trim()
      ? body.keywords.trim().slice(0, AI_KEYWORDS_MAX)
      : undefined;

  // Débit borné : la rafale (5/min), puis le quota gratuit du jour (50/j,
  // décision porteur 2026-08-15) — et, depuis docs/34, un AU-DELÀ PAYANT
  // consenti : 402 avec le prix, puis facturation AVANT génération sur
  // `surplusOk: true`. Par utilisateur, pas par IP : la route est
  // authentifiée.
  const admin = createAdminClient();
  const okMinute = await rateLimit(admin, `ai_desc:${user.id}`, 5, 60);
  if (!okMinute) {
    return NextResponse.json(
      { error: "Trop de demandes — réessayez plus tard." },
      { status: 429 }
    );
  }

  // Tant que 0071 n'est pas appliquée : config null → comportement
  // historique, blocage gratuit au quota compilé. On ne facture jamais sur
  // un repli, et on ne débloque jamais sur un repli.
  const config = await lireConfigSurplus(admin);
  const quota = config?.quotaGratuitJour ?? SURPLUS_DEFAUTS.quotaGratuitJour;
  const okJour = await rateLimit(admin, `ai_desc_jour:${user.id}`, quota, 86_400);
  if (!okJour) {
    if (!config) {
      return NextResponse.json(
        { error: "Trop de demandes — réessayez plus tard." },
        { status: 429 }
      );
    }
    // Le consentement est EXPLICITE, à chaque franchissement : sans
    // `surplusOk`, on répond le prix, on ne facture rien.
    if (body.surplusOk !== true) {
      return NextResponse.json(
        {
          error: "Quota gratuit du jour atteint.",
          prixHtg: config.prixSurplusHtg,
        },
        { status: 402 }
      );
    }
    // Plafond dur, payant compris — borne d'abus et de dépense consentie.
    const okCap = await rateLimit(
      admin,
      `ai_desc_cap:${user.id}`,
      Math.max(0, config.plafondJour - config.quotaGratuitJour),
      86_400
    );
    if (!okCap) {
      return NextResponse.json(
        { error: "Trop de demandes — réessayez plus tard." },
        { status: 429 }
      );
    }
    // Facturation AVANT génération — jamais de génération non facturée.
    const inscrit = await enregistrerSurplus(
      admin,
      user.id,
      config.prixSurplusHtg
    );
    if (!inscrit) {
      return NextResponse.json(
        { error: "Suggestion indisponible — réessayez." },
        { status: 502 }
      );
    }
  }

  try {
    const description = await genererDescription({
      title,
      category,
      keywords,
      lang: await getLang(),
    });
    return NextResponse.json({ description });
  } catch (e) {
    // Le détail (statut fournisseur) va au journal serveur, jamais au client.
    console.error("[ai-description]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Suggestion indisponible — réessayez." },
      { status: 502 }
    );
  }
}
