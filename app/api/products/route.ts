import { NextResponse } from "next/server";
import { normalizeCategory } from "@/lib/product-categories";
import { isService, pickByKind, type DigitalKind } from "@/lib/product-kind";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/payment-utils";
import {
  backfillCountry,
  countryFromRequest,
} from "@/lib/geo/country-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/products  { title, description, kind, category, priceHTG }
 * Crée (et publie) un produit pour le créateur connecté.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  // Compte suspendu (modération) : action bloquée même si la session est
  // encore active (le ban auth ne coupe la session qu'au refresh du token).
  if (await getSuspension(user.id)) {
    return NextResponse.json(
      { error: "Compte suspendu — action non autorisée." },
      { status: 403 }
    );
  }

  let body: {
    title?: string;
    description?: string;
    kind?: DigitalKind;
    category?: string;
    priceHTG?: number;
    deliveryDays?: number | null;
    serviceIncludes?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { kind, category } = body;
  const price = Number(body.priceHTG);
  // BL-117 (C-11) : mêmes gardes que les routes d'argent — bornes de taille
  // (anti-spam du catalogue public) et prix ≥ 1 (un CreatePayment MonCash à
  // 0 HTG finit en 502 confus côté acheteur).
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 140) : "";
  const description =
    typeof body.description === "string" ? body.description.slice(0, 5000) : null;
  if (!title || !kind || !Number.isFinite(price) || price < 1) {
    return NextResponse.json(
      { error: "Champs requis : titre, type, prix valide (≥ 1 HTG)." },
      { status: 400 }
    );
  }

  // Champs page service (Fiverr) — affichage seulement, pas de prix. Ignorés
  // silencieusement pour un produit 'fichier' (n'a pas de sens hors service).
  let deliveryDays: number | null = null;
  let serviceIncludes: string[] = [];
  if (isService(kind)) {
    if (body.deliveryDays !== undefined && body.deliveryDays !== null) {
      const d = Number(body.deliveryDays);
      if (!Number.isInteger(d) || d < 1 || d > 365) {
        return NextResponse.json(
          { error: "Délai de livraison : entre 1 et 365 jours." },
          { status: 400 }
        );
      }
      deliveryDays = d;
    }
    if (Array.isArray(body.serviceIncludes)) {
      serviceIncludes = body.serviceIncludes
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim().slice(0, 140))
        .filter(Boolean)
        .slice(0, 10); // borné : une checklist, pas un roman
    }
  }

  const admin = createAdminClient();

  // BL-117 : cadence bornée comme checkout/topup (10 créations/min).
  if (!(await rateLimit(admin, `products:${user.id}`, 10))) {
    return NextResponse.json(
      { error: "Trop de publications — réessayez dans une minute." },
      { status: 429 }
    );
  }

  // S'assure que le profil existe et passe en rôle créateur.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) {
    await admin.from("profiles").update({ role: "creator" }).eq("id", user.id);
  } else {
    await admin.from("profiles").insert({
      id: user.id,
      display_name: user.email?.split("@")[0] ?? "Créateur",
      role: "creator",
    });
  }

  // Backfill best-effort du pays VENDEUR (dashboard /admin/geo) via géo-IP, si
  // vide. Non bloquant, ne remplace jamais un pays déjà renseigné au profil.
  await backfillCountry(admin, user.id, countryFromRequest(req));

  const slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 7)}`;

  const { data: product, error } = await admin
    .from("products")
    .insert({
      seller_id: user.id,
      slug,
      title,
      description,
      kind,
      // BL-105 : whitelist serveur — jamais de texte libre en base.
      category: normalizeCategory(category),
      price_htg: Math.round(price),
      delivery_days: deliveryDays,
      service_includes: serviceIncludes.length > 0 ? serviceIncludes : null,
      // BL-103 (Gumroad — le fichier est exigé avant la mise en vente) : un
      // produit « fichier » naît en BROUILLON, invisible au public, et sera
      // TOUTE fiche naît en BROUILLON, quel que soit son type, et attend une
      // publication humaine (`/api/admin/product-status`).
      //
      // Le service se publiait immédiatement et le fichier se publiait tout
      // seul au premier upload : ces deux chemins mettaient en ligne sans que
      // personne ne regarde — et ce sont précisément ceux où atterrissent un
      // « sèvis transfè lajan » ou un logiciel piraté. La règle de plateforme
      // (`/produits-interdits`) promet une revue ; elle ne peut la promettre
      // que si elle a lieu pour les trois types.
      status:
        pickByKind(kind, {
          file: "draft",
          service: "draft",
          physical: "draft",
        }) ?? "draft",
    })
    .select("slug, status")
    .single();

  if (error || !product) {
    return NextResponse.json(
      { error: error?.message ?? "Création échouée" },
      { status: 500 }
    );
  }

  return NextResponse.json({ slug: product.slug, status: product.status });
}
