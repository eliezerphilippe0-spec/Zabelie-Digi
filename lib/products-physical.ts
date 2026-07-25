import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/products";

/**
 * Lecture des données propres au produit PHYSIQUE (chantier B) : variantes,
 * stock, compatibilité véhicule.
 *
 * Règle d'affichage : le stock montré à l'acheteur est `quantity_available`
 * — le stock RÉSERVÉ (paniers en cours) n'est jamais compté comme disponible.
 * Afficher l'inverse promettrait une unité que quelqu'un d'autre est en train
 * de payer.
 */

export type VariantView = {
  id: string;
  label: string | null; // null = variante implicite (produit sans déclinaison)
  priceHTG: number;
  available: number;
};

export type FitmentView = {
  kind: "auto" | "moto";
  make: string;
  model: string;
  yearStart: number;
  yearEnd: number | null;
};

export type PhysicalView = {
  variants: VariantView[];
  fitment: FitmentView[];
  /** true dès qu'au moins une variante a du stock. */
  inStock: boolean;
  /** Le produit a-t-il de vraies déclinaisons à choisir ? */
  hasChoices: boolean;
};

type VariantRow = {
  id: string;
  options: Record<string, string> | null;
  price_htg: number;
  position: number;
  zabelie_stock: { quantity_available: number } | { quantity_available: number }[] | null;
};

type FitmentRow = {
  year_start: number;
  year_end: number | null;
  zabelie_vehicle_models:
    | { kind: "auto" | "moto"; make: string; model: string }
    | { kind: "auto" | "moto"; make: string; model: string }[]
    | null;
};

const one = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : v;

export async function getPhysicalView(
  productId: string
): Promise<PhysicalView | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const [{ data: variants }, { data: fitment }] = await Promise.all([
    supabase
      .from("zabelie_product_variants")
      .select("id, options, price_htg, position, zabelie_stock(quantity_available)")
      .eq("product_id", productId)
      .eq("active", true)
      .order("position"),
    supabase
      .from("zabelie_product_fitment")
      .select("year_start, year_end, zabelie_vehicle_models(kind, make, model)")
      .eq("product_id", productId),
  ]);

  if (!variants || variants.length === 0) return null; // produit non physique

  const rows = variants as unknown as VariantRow[];
  const views: VariantView[] = rows.map((v) => ({
    id: v.id,
    label: (v.options && v.options.variante) || null,
    priceHTG: v.price_htg,
    available: one(v.zabelie_stock)?.quantity_available ?? 0,
  }));

  const fits: FitmentView[] = ((fitment ?? []) as unknown as FitmentRow[])
    .map((f) => {
      const m = one(f.zabelie_vehicle_models);
      if (!m) return null;
      return {
        kind: m.kind,
        make: m.make,
        model: m.model,
        yearStart: f.year_start,
        yearEnd: f.year_end,
      };
    })
    .filter((f): f is FitmentView => f !== null)
    .sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model));

  return {
    variants: views,
    fitment: fits,
    inStock: views.some((v) => v.available > 0),
    // Une variante implicite (sans libellé) n'est pas un choix : on ne montre
    // pas de sélecteur à un vendeur de filtres à huile.
    hasChoices: views.length > 1 || views.some((v) => v.label !== null),
  };
}
