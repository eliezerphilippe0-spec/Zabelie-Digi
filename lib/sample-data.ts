// Données d'exemple pour le scaffold UI (Vague 1).
// À remplacer par des requêtes Supabase une fois le schéma figé (cf. D-3).

// Doit rester identique à `ProductKind` de `lib/database.types.ts` — deux
// déclarations du même type, aucune des deux ne connaissait `physical`, ce qui
// faisait croire au compilateur que tout `else` était exhaustif.
export type ProductKind = "fichier" | "service" | "physical";

export type Product = {
  slug: string;
  title: string;
  creator: string;
  kind: ProductKind;
  category: string;
  priceHTG: number;
  rating: number;
  sales: number;
  accent: string; // dégradé tailwind pour la vignette
  blurb: string;
};

export const PRODUCTS: Product[] = [
  {
    slug: "pack-presets-lightroom-afro",
    title: "Pack 24 presets Lightroom — Afro Tones",
    creator: "Naïka Studio",
    kind: "fichier",
    category: "Photo",
    priceHTG: 1500,
    rating: 4.9,
    sales: 312,
    accent: "from-amber to-magenta",
    blurb: "Donnez à vos photos une colorimétrie chaude et lumineuse en un clic.",
  },
  {
    slug: "formation-moncash-business",
    title: "Formation : lancer sa boutique digitale en Haïti",
    creator: "Jeff Pierre",
    kind: "fichier",
    category: "Business",
    priceHTG: 4500,
    rating: 4.8,
    sales: 187,
    accent: "from-violet to-teal",
    blurb: "12 modules vidéo pour vendre en ligne et encaisser via mobile money.",
  },
  {
    slug: "beat-kompa-moderne",
    title: "Beat Kompa moderne — licence commerciale",
    creator: "Prod. Lakay",
    kind: "fichier",
    category: "Musique",
    priceHTG: 2500,
    rating: 5.0,
    sales: 96,
    accent: "from-gold to-amber",
    blurb: "Instrumental original prêt à l'emploi, stems inclus.",
  },
  {
    slug: "mentorat-design-1h",
    title: "Mentorat design produit — session 1h",
    creator: "Sophonie A.",
    kind: "service",
    category: "Design",
    priceHTG: 3500,
    rating: 4.9,
    sales: 54,
    accent: "from-magenta to-violet",
    blurb: "Revue de portfolio et plan d'action personnalisé en visio.",
  },
  {
    slug: "template-cv-pro",
    title: "Template CV pro — éditable Canva",
    creator: "Naïka Studio",
    kind: "fichier",
    category: "Carrière",
    priceHTG: 800,
    rating: 4.7,
    sales: 421,
    accent: "from-teal to-violet",
    blurb: "Démarquez-vous avec un CV moderne, prêt en 10 minutes.",
  },
  {
    slug: "audit-instagram",
    title: "Audit Instagram + stratégie 30 jours",
    creator: "Mia Social",
    kind: "service",
    category: "Marketing",
    priceHTG: 5000,
    rating: 4.8,
    sales: 38,
    accent: "from-amber to-violet",
    blurb: "Analyse complète de votre compte et plan de contenu sur mesure.",
  },
];

export function formatHTG(amount: number): string {
  return new Intl.NumberFormat("fr-HT").format(amount) + " HTG";
}

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}
