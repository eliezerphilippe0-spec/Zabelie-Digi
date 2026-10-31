import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAccount } from "@/lib/auth";
import { erreurTraduite } from "@/lib/api-erreur";
import { SALE_STATUSES } from "@/lib/api/v1/seller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/seller/ventes-compte → { ventes } : le NOMBRE de ventes confirmées
 * du vendeur connecté, rien d'autre (ni montant, ni acheteur, ni produit).
 *
 * Sert au son de vente de « Mes ventes » (`components/son-ventes.tsx`). Le
 * nombre ne fait que croître — une commande payée reste comptée si elle est
 * ensuite livrée, remboursée ou en litige (`SALE_STATUSES`, même définition
 * que l'API vendeur v1) —, donc une hausse signifie une nouvelle vente.
 *
 * Client de SESSION : `orders_seller_read` décide ; le filtre explicite sur le
 * vendeur écarte les achats que `orders_buyer_read` laisserait aussi passer.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erreurTraduite("api.auth.required", 401);
  const refus = await requireActiveAccount(user.id);
  if (refus) return refus;

  const { count, error } = await supabase
    .from("orders")
    .select("id, products!orders_product_id_fkey!inner(seller_id)", { count: "exact", head: true })
    .eq("products.seller_id", user.id)
    .in("status", [...SALE_STATUSES]);
  if (error) return erreurTraduite("api.unavailable", 503);
  return NextResponse.json({ ventes: count ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}
