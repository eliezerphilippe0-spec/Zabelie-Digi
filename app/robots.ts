import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/tableau-de-bord",
        "/mes-achats",
        // Même raison que /mes-achats : page privée, propre à un compte.
        "/mes-ventes",
        "/paiement/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
