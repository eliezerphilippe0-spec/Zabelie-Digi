import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/payment-utils";
import { KIND_PHYSICAL } from "@/lib/product-kind";
import { POLICY_VERSION } from "@/lib/policy";
import { isMissingFunction } from "@/lib/pg-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/products/physical
 * Création d'un produit PHYSIQUE (chantier B). Chemin nominal vendeur :
 * « photo, prix, quantité, publier » — les variantes et la compatibilité
 * véhicule sont optionnelles.
 *
 * {
 *   title, priceHTG, quantity, categorySlug,
 *   description?, weightGrams?, fragile?,
 *   variants?:  [{ label, priceHTG, quantity }],      // optionnel
 *   fitment?:   [{ modelId, yearStart, yearEnd? }],   // optionnel
 * }
 *
 * Sans variantes explicites, UNE variante par défaut est créée (le stock vit
 * toujours au niveau variante — un seul modèle de données, pas deux).
 * Tout vient du serveur : la catégorie est validée contre l'arbre ACTIF, les
 * modèles véhicule contre la liste curée. Le client ne nomme jamais un prix
 * qu'on recalcule ailleurs : le prix affiché EST price_htg, entier ≥ 1.
 */

type VariantInput = { label?: unknown; priceHTG?: unknown; quantity?: unknown };
type FitmentInput = { modelId?: unknown; yearStart?: unknown; yearEnd?: unknown };

const MAX_VARIANTS = 20;
const MAX_FITMENT = 40;

export async function POST(req: Request) {
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

  const admin = createAdminClient();
  if (!(await rateLimit(admin, `product_physical:${user.id}`, 10))) {
    return NextResponse.json(
      { error: "Trop de créations — réessayez dans une minute." },
      { status: 429 }
    );
  }

  let body: {
    title?: unknown;
    description?: unknown;
    priceHTG?: unknown;
    quantity?: unknown;
    categorySlug?: unknown;
    weightGrams?: unknown;
    fragile?: unknown;
    variants?: VariantInput[];
    fitment?: FitmentInput[];
    policyAccepted?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  // ── Champs de base (mêmes bornes que /api/products, BL-117) ───────────────
  const title =
    typeof body.title === "string" ? body.title.trim().slice(0, 140) : "";
  const description =
    typeof body.description === "string" ? body.description.slice(0, 5000) : null;
  const price = Number(body.priceHTG);
  const quantity = Number(body.quantity);
  if (!title) {
    return NextResponse.json({ error: "Titre requis." }, { status: 400 });
  }
  if (!Number.isInteger(price) || price < 1) {
    return NextResponse.json(
      { error: "Prix entier en gourdes requis (≥ 1 HTG)." },
      { status: 400 }
    );
  }
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000) {
    return NextResponse.json(
      { error: "Quantité en stock requise (0 à 100 000)." },
      { status: 400 }
    );
  }

  // ── Attestation (R3) ──────────────────────────────────────────────────────
  // Même règle que la route digitale : la version vient du serveur, jamais du
  // client, et l'enregistrement précède la création de la fiche.
  if (body.policyAccepted !== true) {
    return NextResponse.json(
      { error: "Vous devez accepter les règles de vente.", code: "policy_required" },
      { status: 400 }
    );
  }
  const { error: policyErr } = await admin.rpc("zabelie_record_policy_acceptance", {
    p_user_id: user.id,
    p_version: POLICY_VERSION,
  });
  if (policyErr) {
    // Deux destinataires, deux messages. Le VENDEUR lit une phrase courte et
    // honnête : rien n'a été enregistré, il peut réessayer. Il n'a pas à lire
    // un identifiant de migration, et une page publique qui nomme l'état
    // interne du schéma est une fuite gratuite.
    // TOI, tu lis l'identifiant — ici et dans /api/admin/coherence — pendant
    // que tu es debout à côté du vendeur en train de publier.
    if (isMissingFunction(policyErr)) {
      console.error(
        "[products/physical] MIGRATION 0046 NON APPLIQUÉE — zabelie_record_policy_acceptance " +
          "introuvable : AUCUNE fiche ne peut être créée tant qu'elle manque.",
        policyErr.code
      );
    } else {
      console.error("[products/physical] attestation non enregistrée", policyErr);
    }
    return NextResponse.json(
      {
        error:
          "La publication n'a pas abouti. Rien n'a été enregistré — " +
          "réessayez dans un instant.",
        code: "policy_unavailable",
      },
      { status: 503 }
    );
  }

  // ── Catégorie : doit exister ET être ACTIVE (départements par vagues) ─────
  const categorySlug =
    typeof body.categorySlug === "string" ? body.categorySlug : "";
  const { data: category } = await admin
    .from("zabelie_categories")
    .select("id, level, active, label_fr, parent_id")
    .eq("slug", categorySlug)
    .maybeSingle();
  if (!category || !category.active || category.level < 2) {
    return NextResponse.json(
      { error: "Catégorie inconnue ou non ouverte à la vente." },
      { status: 422 }
    );
  }

  // Département (niveau 1) → alimente products.category (texte historique du
  // catalogue) pour que les produits physiques restent filtrables.
  let departmentLabel = category.label_fr;
  let parentId: string | null = category.parent_id;
  while (parentId) {
    const { data: parent } = await admin
      .from("zabelie_categories")
      .select("label_fr, parent_id")
      .eq("id", parentId)
      .single();
    if (!parent) break;
    departmentLabel = parent.label_fr;
    parentId = parent.parent_id;
  }

  // ── Poids (grille de port, chantier D) ────────────────────────────────────
  let weightGrams = 500; // défaut raisonnable pièce/flacon — modifiable ensuite
  if (body.weightGrams !== undefined && body.weightGrams !== null) {
    const w = Number(body.weightGrams);
    if (!Number.isInteger(w) || w < 1 || w > 200000) {
      return NextResponse.json(
        { error: "Poids en grammes entre 1 et 200 000." },
        { status: 422 }
      );
    }
    weightGrams = w;
  }

  // ── Variantes : OPTIONNELLES. Sans elles → une variante par défaut. ───────
  const variantsIn = Array.isArray(body.variants) ? body.variants : [];
  if (variantsIn.length > MAX_VARIANTS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_VARIANTS} variantes.` },
      { status: 422 }
    );
  }
  const variants: { label: string; priceHTG: number; quantity: number }[] = [];
  for (const v of variantsIn) {
    const label = typeof v.label === "string" ? v.label.trim().slice(0, 80) : "";
    const vPrice = Number(v.priceHTG);
    const vQty = Number(v.quantity);
    if (!label) {
      return NextResponse.json(
        { error: "Chaque variante doit avoir un libellé." },
        { status: 422 }
      );
    }
    if (!Number.isInteger(vPrice) || vPrice < 1) {
      return NextResponse.json(
        { error: `Variante « ${label} » : prix entier ≥ 1 HTG requis.` },
        { status: 422 }
      );
    }
    if (!Number.isInteger(vQty) || vQty < 0 || vQty > 100000) {
      return NextResponse.json(
        { error: `Variante « ${label} » : quantité invalide.` },
        { status: 422 }
      );
    }
    variants.push({ label, priceHTG: vPrice, quantity: vQty });
  }

  // ── Compatibilité véhicule : contre la liste CURÉE uniquement ─────────────
  const fitmentIn = Array.isArray(body.fitment) ? body.fitment : [];
  if (fitmentIn.length > MAX_FITMENT) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FITMENT} compatibilités.` },
      { status: 422 }
    );
  }
  const fitment: { modelId: string; yearStart: number; yearEnd: number | null }[] = [];
  for (const f of fitmentIn) {
    const modelId = typeof f.modelId === "string" ? f.modelId : "";
    const yearStart = Number(f.yearStart);
    const yearEnd =
      f.yearEnd === undefined || f.yearEnd === null ? null : Number(f.yearEnd);
    if (!modelId || !Number.isInteger(yearStart) || yearStart < 1950 || yearStart > 2100) {
      return NextResponse.json(
        { error: "Compatibilité : modèle et année de début requis." },
        { status: 422 }
      );
    }
    if (yearEnd !== null && (!Number.isInteger(yearEnd) || yearEnd < yearStart)) {
      return NextResponse.json(
        { error: "Compatibilité : année de fin ≥ année de début." },
        { status: 422 }
      );
    }
    fitment.push({ modelId, yearStart, yearEnd });
  }
  if (fitment.length > 0) {
    const { count } = await admin
      .from("zabelie_vehicle_models")
      .select("id", { count: "exact", head: true })
      .in("id", fitment.map((f) => f.modelId))
      .eq("active", true);
    if ((count ?? 0) !== new Set(fitment.map((f) => f.modelId)).size) {
      return NextResponse.json(
        { error: "Un des modèles de véhicule est inconnu." },
        { status: 422 }
      );
    }
  }

  // ── Création (produit → extension → variantes → stock → fitment) ──────────
  const slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: product, error: prodErr } = await admin
    .from("products")
    .insert({
      seller_id: user.id,
      slug,
      title,
      description,
      price_htg: price,
      kind: KIND_PHYSICAL,
      // BROUILLON, jamais publié à la création (décision porteur 2026-07-26).
      // B1 (`0035`/`0036`) sert à SAISIR des fiches, pas à ouvrir la vente :
      // le stock n'est ni décrémenté ni protégé contre la survente avant B2,
      // et le flux de commande traite encore un `physical` comme un fichier
      // (téléchargement proposé, commande jamais marquée livrée). Une fiche
      // publiée à la saisie serait achetable dans cet état.
      // La publication redeviendra un geste explicite du porteur.
      status: "draft",
      category: departmentLabel,
    })
    .select("id, slug")
    .single();
  if (prodErr || !product) {
    console.error("products/physical: insert product", prodErr);
    return NextResponse.json({ error: "Création échouée" }, { status: 500 });
  }

  // Nettoyage best-effort en cas d'échec en cascade : un produit publié sans
  // stock serait invendable ET visible.
  const abort = async (msg: string, detail: unknown) => {
    console.error("products/physical:", msg, detail);
    await admin.from("products").delete().eq("id", product.id);
    return NextResponse.json({ error: "Création échouée" }, { status: 500 });
  };

  const { error: physErr } = await admin.from("zabelie_physical_products").insert({
    product_id: product.id,
    category_id: category.id,
    weight_grams: weightGrams,
    fragile: Boolean(body.fragile),
  });
  if (physErr) return abort("insert physical", physErr);

  // Sans variantes explicites : UNE variante par défaut (le stock vit toujours
  // au niveau variante). skuBase déterministe et unique.
  const skuBase = `Z-${product.id.slice(0, 8).toUpperCase()}`;
  const rows =
    variants.length > 0
      ? variants.map((v, i) => ({
          product_id: product.id,
          sku: `${skuBase}-${i + 1}`,
          options: { variante: v.label },
          price_htg: v.priceHTG,
          position: i,
        }))
      : [
          {
            product_id: product.id,
            sku: skuBase,
            options: {},
            price_htg: price,
            position: 0,
          },
        ];
  const { data: created, error: varErr } = await admin
    .from("zabelie_product_variants")
    .insert(rows)
    .select("id, position");
  if (varErr || !created) return abort("insert variants", varErr);

  const stocks = created
    .sort((a, b) => a.position - b.position)
    .map((v, i) => ({
      variant_id: v.id,
      quantity_available: variants.length > 0 ? variants[i].quantity : quantity,
    }));
  const { error: stockErr } = await admin.from("zabelie_stock").insert(stocks);
  if (stockErr) return abort("insert stock", stockErr);

  if (fitment.length > 0) {
    const { error: fitErr } = await admin.from("zabelie_product_fitment").insert(
      fitment.map((f) => ({
        product_id: product.id,
        vehicle_model_id: f.modelId,
        year_start: f.yearStart,
        year_end: f.yearEnd,
      }))
    );
    if (fitErr) return abort("insert fitment", fitErr);
  }

  return NextResponse.json({
    ok: true,
    productId: product.id,
    slug: product.slug,
  });
}

/**
 * GET /api/products/physical — données du formulaire vendeur : catégories
 * ACTIVES (arbre aplati) + modèles véhicule curés. Public (lecture seule).
 */
export async function GET() {
  const admin = createAdminClient();
  const [{ data: categories }, { data: models }] = await Promise.all([
    admin
      .from("zabelie_categories")
      .select("id, slug, level, label_fr, label_kr, parent_id, position")
      .eq("active", true)
      .order("level")
      .order("position"),
    admin
      .from("zabelie_vehicle_models")
      .select("id, kind, make, model")
      .eq("active", true)
      .order("position"),
  ]);
  return NextResponse.json({ categories: categories ?? [], models: models ?? [] });
}
