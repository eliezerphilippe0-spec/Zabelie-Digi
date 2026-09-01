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
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/catalogue",
    "/vendre",
    "/connexion",
    "/aide",
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
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  // Les rayons ACTIFS — chacun est une page d'atterrissage réelle, y compris
  // vide (écran « rayon ouvre bientôt » + recrutement). La langue des libellés
  // n'importe pas ici : le href filtre par label_fr, indépendant de la langue.
  const rayons = await getMenuRayons("fr").catch(() => []);
  const rayonRoutes: MetadataRoute.Sitemap = rayons.map((r) => ({
    url: `${base}${r.href}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...rayonRoutes, ...productRoutes, ...creatorRoutes];
}
