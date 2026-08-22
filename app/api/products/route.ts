import { NextResponse } from "next/server";
import { normalizeCategory } from "@/lib/product-categories";
import {
  isDigitalKind,
  isService,
  pickByKind,
  type DigitalKind,
} from "@/lib/product-kind";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/payment-utils";
import {
  backfillCountry,
  countryFromRequest,
} from "@/lib/geo/country-backfill";
import { POLICY_VERSION } from "@/lib/policy";
import { isMissingFunction } from "@/lib/pg-errors";

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
    policyAccepted?: boolean;
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
  // `isDigitalKind` et non `!kind` : le type `DigitalKind` est effacé à la
  // compilation, il ne validait donc RIEN sur un corps issu de `req.json()`.
  // `kind: "physical"` (valeur d'énumération valide depuis `0036`) créait une
  // fiche physique par CETTE route, hors des validations de
  // `/api/products/physical`. Le garde narrow aussi `kind` pour la suite.
  /* ⚠️ `price < 0`, ET NON `price < 1` — corrigé le 2026-08-21.
   *
   * Ce plancher à 1 HTG était le SECOND mur du produit gratuit, et le plus
   * silencieux : l'accueil affiche un rail « Produits gratuits »
   * (`app/page.tsx:178`), la base autorise `price_htg >= 0` (`0001`), le champ
   * du formulaire porte `min={0}` (`components/publish-form.tsx:180`) — et
   * cette ligne refusait la publication. Le vendeur voyait « prix valide
   * (≥ 1 HTG) » sans que rien n'explique pourquoi une vitrine annonçait des
   * gratuits que personne ne pouvait créer.
   *
   * Le premier mur (le checkout envoyait `amount: 0` à MonCash) est tombé avec
   * `0087`. Sans celui-ci, il n'aurait rien débloqué : le rail serait resté
   * vide faute de produit à y mettre.
   *
   * ⚠️ Cette route est NUMÉRIQUE seulement — `isDigitalKind` narrow `kind` et
   * refuse `physical`. Le plancher à 1 HTG reste donc entier pour les articles
   * livrables (`/api/products/physical`, deux contrôles), en accord avec
   * `zabelie_product_variants.price_htg > 0` (`0036`) et avec le refus du
   * checkout. Un physique gratuit signifierait « le vendeur expédie à ses
   * frais » : arbitrage du porteur, pas décision d'implémentation.
   *
   * Le négatif reste refusé : `price < 0`. */
  if (!title || !isDigitalKind(kind) || !Number.isFinite(price) || price < 0) {
    return NextResponse.json(
      {
        error:
          "Champs requis : titre, type valide, prix valide (0 HTG accepté pour un produit gratuit, jamais négatif).",
      },
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
      // 0 est VALIDE et signifie « le jour même » (demande porteur
      // 2026-08-11) : un cours par Zoom, une consultation, une retouche
      // photo se livrent dans l'heure — exiger « au moins 1 jour »
      // obligeait le vendeur à annoncer plus lent qu'il ne l'est.
      if (!Number.isInteger(d) || d < 0 || d > 365) {
        return NextResponse.json(
          { error: "Délai de livraison : entre 0 (jour même) et 365 jours." },
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

  /* La liste blanche vit en BASE, plus dans une constante : une liste en dur
   * ne peut pas suivre une taxonomie qui bouge, et c'est exactement ce qui
   * avait fait publier dans un vocabulaire que la navigation ignorait. */
  const categorieCanonique = await normalizeCategory(supabase, category);
  if (!categorieCanonique) {
    return NextResponse.json(
      { error: "Catégorie inconnue — choisissez un rayon dans la liste." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // ── Attestation (R3) ──────────────────────────────────────────────────────
  // La politique produits interdits est plus stricte que la loi : ce qui la
  // rend opposable, c'est que le vendeur l'a acceptée dans une version connue.
  // La VERSION ne vient jamais du client — il choisirait celle qu'il a
  // « acceptée ». Elle vient de `lib/policy.ts`.
  if (body.policyAccepted !== true) {
    return NextResponse.json(
      { error: "Vous devez accepter les règles de vente.", code: "policy_required" },
      { status: 400 }
    );
  }
  // Enregistrée AVANT le produit : une attestation sans fiche est sans
  // conséquence, une fiche sans attestation est exactement le trou visé.
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
        "[products] MIGRATION 0046 NON APPLIQUÉE — zabelie_record_policy_acceptance " +
          "introuvable : AUCUNE fiche ne peut être créée tant qu'elle manque.",
        policyErr.code
      );
    } else {
      console.error("[products] attestation non enregistrée", policyErr);
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
      category: categorieCanonique,
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
