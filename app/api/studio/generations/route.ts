import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { studioProvider } from "@/lib/studio-server";
import { erreurTraduite } from "@/lib/api-erreur";
import { buildBriefs } from "@/lib/creative/prompt-builder";
import { CONFIG_TABLE, EVENTS_TABLE, GENERATIONS_TABLE, demandeSchema, etatCourant, etatVisible, refusInsertion } from "@/lib/creative/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/studio/generations  { productId, idempotencyKey, briefIndex, params? }
 * Lance UNE image publicitaire pour un produit du vendeur connecté (docs/62).
 *
 * Ordre, et pourquoi :
 *   1. Studio éteint ou mal configuré → 404, la surface n'existe pas.
 *   2. Le vendeur vient de la SESSION, le produit doit être le sien.
 *   3. La ligne est inscrite AVANT l'appel payant : la base tient
 *      l'idempotence et les quotas (0118). Une clé rejouée rend l'état connu
 *      et ne soumet RIEN — Higgsfield n'a pas de clé d'idempotence.
 *   4. Soumission, puis l'événement qui la constate. Le sondage se fait à la
 *      lecture (GET …/[id]), jamais dans cette requête.
 */
export async function POST(req: Request) {
  const provider = studioProvider();
  if (!provider) return erreurTraduite("api.feature.off", 404, { code: "studio_eteint" });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return erreurTraduite("api.auth.required", 401);
  const refus = await requireActiveAccount(user.id);
  if (refus) return refus;

  let raw: unknown;
  try { raw = await req.json(); } catch { return erreurTraduite("api.json.invalid", 400); }
  const demande = demandeSchema.safeParse(raw);
  if (!demande.success) return erreurTraduite("api.params.invalid", 400);
  const { productId, idempotencyKey, briefIndex, params, prixConsentiHtg } = demande.data;

  const admin = createAdminClient();
  if (!(await rateLimit(admin, `studio:${user.id}`, 5, 60))) {
    return erreurTraduite("api.rate.limited", 429);
  }

  const { data: produit, error: produitErreur } = await admin.from("products")
    .select("id,seller_id,price_htg,cover_url").eq("id", productId).maybeSingle();
  if (produitErreur) return erreurTraduite("api.unavailable", 503);
  if (!produit || produit.seller_id !== user.id) return erreurTraduite("api.product.notfound", 404);

  const photo = typeof produit.cover_url === "string" && produit.cover_url.startsWith("https://") ? produit.cover_url : null;
  const briefs = buildBriefs({ id: produit.id, price_htg: produit.price_htg, imageUrl: photo }, params);
  if (!briefs.ok) {
    return briefs.reason === "photo_produit_requise"
      ? erreurTraduite("api.studio.photo", 422, { code: briefs.reason })
      : erreurTraduite("api.params.invalid", 400, { code: briefs.reason });
  }
  const brief = briefs.briefs[briefIndex];

  const { data: ligne, error: insertion } = await admin.from(GENERATIONS_TABLE).insert({
    seller_id: user.id,
    product_id: produit.id,
    idempotency_key: idempotencyKey,
    brief_index: briefIndex,
    format: brief.format,
    prompt: brief.prompt,
    rule_version: brief.rule_version,
    provider: provider.name,
    // Au-delà du gratuit, la base exige le prix du moment ; en deçà, elle le
    // remet à 0 : une gratuite n'est jamais facturée (0119).
    prix_htg: prixConsentiHtg ?? 0,
  }).select("id,prix_htg").single();

  if (insertion || !ligne) {
    const motif = refusInsertion(insertion);
    if (motif === "doublon") {
      const { data: existante } = await admin.from(GENERATIONS_TABLE).select("id")
        .eq("seller_id", user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
      if (!existante) return erreurTraduite("api.unavailable", 503);
      const { data: events } = await admin.from(EVENTS_TABLE).select("etat,provider_ref,image_url,detail,created_at")
        .eq("generation_id", existante.id).order("id");
      return NextResponse.json({ id: existante.id, ...etatVisible(etatCourant(events ?? [])) });
    }
    if (motif === "quota_vendeur") return erreurTraduite("api.studio.quota.vendeur", 429, { code: motif });
    if (motif === "quota_global") return erreurTraduite("api.studio.quota.global", 429, { code: motif });
    if (motif === "paiement_requis") {
      // Le prix est servi pour être AFFICHÉ ; seule une nouvelle requête qui
      // le porte dans `prixConsentiHtg` sera inscrite. Rien n'est facturé ici.
      const { data: cfg } = await admin.from(CONFIG_TABLE).select("prix_image_htg").maybeSingle();
      if (typeof cfg?.prix_image_htg !== "number") return erreurTraduite("api.unavailable", 503);
      return erreurTraduite("api.studio.payant", 402, { code: motif, prixHtg: cfg.prix_image_htg });
    }
    return erreurTraduite("api.unavailable", 503);
  }

  let soumis;
  try {
    soumis = await provider.submit({ idempotencyKey, brief, referenceImageUrl: photo! });
  } catch {
    soumis = { ok: false as const, retryable: true, error: "reseau" };
  }
  const evenement: Record<string, string> = soumis.ok
    ? { generation_id: ligne.id, etat: "generating", provider_ref: soumis.providerRef }
    : { generation_id: ligne.id, etat: "failed", detail: soumis.error };
  const { error: journal } = await admin.from(EVENTS_TABLE).insert(evenement);
  if (journal) {
    // La génération peut tourner sans que la base le sache : la lecture la
    // déclarera « soumission_perdue » au délai, sans jamais la relancer.
    console.error("[studio] evenement_non_inscrit", ligne.id, evenement.etat);
  }
  if (!soumis.ok) return erreurTraduite("api.studio.failed", 502, { id: ligne.id, state: "failed", detail: soumis.error });
  return NextResponse.json({ id: ligne.id, state: "generating", prixHtg: ligne.prix_htg }, { status: 202 });
}

