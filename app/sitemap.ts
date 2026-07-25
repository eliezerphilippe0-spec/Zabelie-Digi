import type { MetadataRoute } from "next";
import { getProductsForSitemap } from "@/lib/products";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/catalogue",
    "/vendre",
    "/connexion",
  ].map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.7,
  }));

  // Correctif audit : un incident Supabase transitoire ne doit pas faire
  // échouer le sitemap entier (500 sur chaque crawl) — les routes statiques
  // restent utiles même sans les routes produit/créateur ce coup-ci.
  const products = await getProductsForSitemap().catch(() => []);

  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${base}/produit/${p.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const creatorIds = Array.from(
    new Set(products.map((p) => p.creatorId).filter((id): id is string => !!id))
  );
  const creatorRoutes: MetadataRoute.Sitemap = creatorIds.map((id) => ({
    url: `${base}/createur/${id}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...productRoutes, ...creatorRoutes];
}
