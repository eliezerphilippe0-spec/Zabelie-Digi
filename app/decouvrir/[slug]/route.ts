import { NextRequest, NextResponse } from "next/server";
import { getProductView, isSupabaseConfigured } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";
import { configService } from "@/lib/supabase/config";
import { readSellerPricing } from "@/lib/seller-pricing-server";
import { recordDiscovery, SALE_SOURCE_COOKIE } from "@/lib/sale-attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductView(slug);
  if (!product) return new NextResponse(null, { status: 404 });
  const response = NextResponse.redirect(new URL("/produit/" + encodeURIComponent(slug), req.url), 302);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  // Prefetching must never count as an acquisition.
  if (req.headers.has("next-router-prefetch") || req.headers.get("purpose") === "prefetch") return response;
  if (!isSupabaseConfigured()) return response;
  const pricing = await readSellerPricing(await createClient());
  if (!pricing) return response;
  const value = recordDiscovery(req.cookies.get(SALE_SOURCE_COOKIE)?.value, product.id, pricing.attribution_days, configService().key);
  response.cookies.set(SALE_SOURCE_COOKIE, value, {
    httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax",
    path: "/", maxAge: pricing.attribution_days * 86400,
  });
  return response;
}

