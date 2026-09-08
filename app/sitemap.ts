import { EDITORIAL_PATHS, editorialAlternates } from "@/lib/editorial-routing";
import { CATALOGUE_UNIVERSES, catalogueUniverse } from "@/lib/catalogue-universes";
import { BUYING_GUIDES, guideHref } from "@/lib/buying-guides";
import { LANGS } from "@/lib/i18n";
import type { MetadataRoute } from "next";
import { getProductsForSitemap } from "@/lib/products";
import { getBoutikSlug } from "@/lib/creators";
import { hrefBoutique } from "@/lib/boutique-href";
import { getMenuRayons } from "@/lib/taxonomy";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /* ⚠️ `siteUrl()` et pas `process.env.NEXT_PUBLIC_SITE_URL` — même
   * correction que `app/robots.ts`, mesurée le 2026-08-28. Ce fichier et
   * `app/layout.tsx` (qui pose `metadataBase`) résolvaient l'origine
   * différemment : un sitemap pouvait annoncer un domaine que les canoniques
   * ne confirmaient pas. Une seule fonction décide désormais. */
  const base = siteUrl();
  const products = await getProductsForSitemap().catch(() => []);

  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/catalogue",
    "/categories",
    "/catalogue?univers=objets",
    "/catalogue?univers=numerique",
    "/catalogue?univers=services",
    "/vendre",
  ].filter((path) => {
    if (!path.startsWith("/catalogue")) return true;
    const universe = catalogueUniverse(new URL(path, base).searchParams.get("univers"));
    return universe ? products.some((p) => p.kind === CATALOGUE_UNIVERSES[universe].kind) : products.length > 0;
  }).map((path) => ({
    url: `${base}${path}`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.7,
  }));

  // Correctif audit : un incident Supabase transitoire ne doit pas faire
  // échouer le sitemap entier (500 sur chaque crawl) — les routes statiques
  // restent utiles même sans les routes produit/créateur ce coup-ci.

  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${base}/produit/${p.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const creatorIds = Array.from(
    new Set(products.map((p) => p.creatorId).filter((id): id is string => !!id))
  );

  /* ── L'ADRESSE DÉCLARÉE DOIT ÊTRE L'ADRESSE CANONIQUE ─────────────────────
   *
   * Défaut mesuré le 2026-08-28 : ce sitemap émettait `/createur/<uuid>`,
   * alors que `app/createur/[id]/page.tsx` pose `canonical: /boutik/<slug>`.
   * Il déclarait donc à Google exactement les URLs NON canoniques du site, et
   * omettait `/boutik/<slug>` — la seule des deux qui porte un
   * `generateMetadata`, et la seule qu'un vendeur colle dans WhatsApp.
   *
   * `hrefBoutique` est la fonction qui tranche déjà entre les deux partout
   * ailleurs dans le dépôt ; on ne réimplémente pas sa décision ici, on
   * l'appelle. Un vendeur sans slug garde `/createur/<id>`, qui reste une
   * adresse valide — le repli n'omet personne.
   *
   * ⚠️ COÛT CONNU : une lecture de fiche par vendeur. Acceptable au volume
   * actuel (2 produits publiés au 2026-08-28), et à remplacer par une
   * fonction SQL qui rend les slugs en lot AVANT que le catalogue n'atteigne
   * quelques centaines de vendeurs. Écrit ici pour que le seuil soit connu,
   * pas découvert. */
  const creators = await Promise.all(
    creatorIds.map(async (id) => ({ id, boutikSlug: await getBoutikSlug(id) }))
  );
  const creatorRoutes: MetadataRoute.Sitemap = creators.map((c) => ({
    url: `${base}${hrefBoutique(c)}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  // Only stocked departments belong in the discovery sitemap. No invented lastModified dates.
  const rayons = await getMenuRayons("fr").catch(() => []);
  const rayonRoutes: MetadataRoute.Sitemap = rayons.filter((r) => !r.vide).map((r) => ({
    url: `${base}${r.href}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const guideRoutes: MetadataRoute.Sitemap = LANGS.flatMap((lang) => [undefined, ...BUYING_GUIDES.map((guide) => guide.slug)].map((slug) => ({
    url: `${base}${guideHref(lang, slug)}`,
    alternates: { languages: Object.fromEntries(LANGS.map((l) => [l, `${base}${guideHref(l, slug)}`])) },
  })));
  const editorialRoutes: MetadataRoute.Sitemap = EDITORIAL_PATHS.flatMap((path) => LANGS.map((lang) => ({
    url: `${base}/${lang}${path}`,
    alternates: { languages: Object.fromEntries(Object.entries(editorialAlternates(path, lang).languages).map(([key, href]) => [key, `${base}${href}`])) },
  })));
  return [...editorialRoutes, ...staticRoutes, ...rayonRoutes, ...productRoutes, ...creatorRoutes, ...guideRoutes];
}
