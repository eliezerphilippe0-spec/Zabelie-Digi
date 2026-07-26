/**
 * URL publique du site, pour tout ce qui doit être ABSOLU : `og:image`, liens
 * de partage, canoniques.
 *
 * Pourquoi ça compte ici plus qu'ailleurs : le canal de diffusion est WhatsApp.
 * Une `og:image` relative à `http://localhost:3000` n'est pas une image un peu
 * moins belle — c'est un lien nu dans le groupe, sans vignette ni titre, donc
 * pas de clic. Le repli `localhost` était la valeur par défaut sur tout
 * déploiement où `NEXT_PUBLIC_SITE_URL` n'est pas renseignée : Preview
 * notamment, où l'on vérifie justement les aperçus de partage.
 *
 * Ordre : la variable explicite (elle seule connaît le domaine final), puis
 * l'URL fournie par la plateforme de déploiement, puis le développement local.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  // Injectée par Vercel sur chaque déploiement (sans protocole).
  const vercel = (
    process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL
  )?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}
