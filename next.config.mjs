/** @type {import('next').NextConfig} */

/**
 * En-têtes de sécurité — SEC-02 de `docs/REVUE-2026-08-01.md`.
 *
 * Le constat : ce fichier ne contenait que `reactStrictMode` et
 * `images.remotePatterns`. Aucun en-tête. Le site était donc **intégrable dans
 * une iframe tierce**, et c'est le seul risque de la revue exploitable sans
 * rien d'autre qu'un nom de domaine : encadrer `/connexion`, superposer son
 * propre formulaire, récolter des identifiants sous l'apparence de Zabelie.
 * Sur un marché où la confiance se construit encore, ça coûte plus que des
 * comptes volés.
 *
 * CE QUI N'EST PAS ICI, ET POURQUOI
 * ---------------------------------
 * **Pas de CSP complète.** Une politique `script-src` sur Next.js demande soit
 * un nonce propagé à chaque rendu, soit `unsafe-inline` — le premier est un
 * chantier, le second est une CSP décorative. Poser une CSP qui casse la page,
 * ou qui ne protège rien, serait pire que son absence : elle donnerait le
 * sentiment que le sujet est traité. Ce qui EST posé ici, `frame-ancestors`,
 * est une directive indépendante : elle ne touche ni script, ni style, ni
 * image, et ne peut donc pas casser un rendu.
 *
 * **Pas de `preload` sur HSTS.** C'est une **porte à sens unique** : une fois
 * le domaine inscrit dans la liste des navigateurs, le retrait prend des mois.
 * Zabelie n'a pas encore son domaine définitif — `preload` s'ajoutera quand il
 * sera fixé, pas avant.
 */
const securityHeaders = [
  // Anti-encadrement, version moderne. Une CSP réduite à cette seule directive
  // n'affecte aucune ressource : ni script, ni style, ni image.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },

  // Le même interdit pour les navigateurs qui ignorent `frame-ancestors`. Les
  // navigateurs modernes ignorent CELUI-CI quand la CSP est présente : les
  // deux ne se contredisent pas, ils se relaient.
  { key: "X-Frame-Options", value: "DENY" },

  // Empêche le navigateur de deviner un type MIME. Sans lui, un fichier
  // téléversé par un vendeur et servi avec un type inattendu peut être
  // ré-interprété comme du script.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Un an, sous-domaines inclus, SANS `preload` (voir plus haut). Vercel sert
  // déjà en HTTPS ; cet en-tête couvre la première requête en clair après une
  // saisie manuelle du domaine.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },

  // Le chemin complet d'une fiche ne part pas vers un site tiers. Le domaine
  // suffit à l'analytique ; l'URL, elle, peut porter une recherche.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Zabelie n'utilise NI géolocalisation, NI caméra, NI micro — vérifié le
  // 2026-08-02 : aucune occurrence de `navigator.geolocation` ni de
  // `getUserMedia` dans `app/`, `components/`, `lib/`. Les refuser
  // explicitement empêche un script tiers introduit un jour de les demander
  // au nom du site.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig = {
  reactStrictMode: true,
  images: {
    // Pas de générique "**" : next/image proxie le fetch côté serveur, un
    // hostname illimité en ferait un SSRF-as-a-service. Scindé au strict
    // besoin (Supabase Storage) — élargir explicitement si un autre hôte
    // d'images de confiance est ajouté.
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async headers() {
    // `/(.*)` couvre tout, routes d'API comprises. Un motif plus étroit
    // laisserait `/connexion` couvert et `/connexion/` non — le genre d'écart
    // qui ne se voit qu'en production.
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
