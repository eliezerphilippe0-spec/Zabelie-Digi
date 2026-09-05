import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { getLang } from "@/lib/i18n-server";
import { cookies } from "next/headers";
import { siteUrl } from "@/lib/site-url";
import { SITE_TITLE, SITE_DESCRIPTION, BRAND_INK } from "@/lib/brand";
import { RecoveryCatcher } from "@/components/recovery-catcher";

// Polices AUTO-HÉBERGÉES par Next (servies depuis notre domaine) — supprime la
// requête tierce bloquante vers Google Fonts, gain net sur 3G. `swap` : le
// texte s'affiche immédiatement en repli puis bascule.
//
// ACCUEIL PREMIUM, PHASE 1 (2026-09-04, docs/02 V-20) : Manrope 700/800 pour
// les titres, prix et boutons, Inter pour le corps. Playfair Display (demande
// porteur du 2026-08-11) est retirée par délégation du même porteur, brief §3.2.
//
// FONTES VARIABLES, et c'est mesuré : le dépôt pose `font-semibold`, `bold`
// et `extrabold` sur des centaines d'éléments Inter. Deux graisses statiques
// (400/500) laisseraient le navigateur SYNTHÉTISER le reste — un faux gras
// qui empâte. Une variable couvre toutes les graisses dans UN fichier.
// Sous-ensembles `latin` + `latin-ext` : è, ò, à, ç du kreyòl et du français,
// exigés par le brief. Le poids total est mesuré dans la PR de Phase 1.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});
const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-display",
  display: "swap",
});

// Source UNIQUE — partagée avec `app/manifest.ts`. Deux copies d'une chaîne de
// marque divergent : le monogramme l'a fait, en silence, pendant des semaines.
const title = SITE_TITLE;
const description = SITE_DESCRIPTION;

export const metadata: Metadata = {
  title: {
    default: title,
    template: "%s",
  },
  description,
  // Rend `og:image` absolue. Sans repli sur l'URL du déploiement, un Preview
  // sans NEXT_PUBLIC_SITE_URL pointait ses aperçus vers localhost → lien nu
  // sur WhatsApp. Voir lib/site-url.ts.
  metadataBase: new URL(siteUrl()),
  openGraph: {
    title,
    description,
    type: "website",
    locale: "fr_FR",
    siteName: "Zabelie",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export const viewport: Viewport = {
  // = --color-ink. L'indigo #17123a avait été abandonné le 2026-07-25 parce
  // que la barre d'adresse Android s'affichait violette au-dessus d'un site
  // NOIR et orange. Depuis la Phase 1 de l'accueil premium (2026-09-04), le
  // chrome (en-tête, pied) est cet indigo sur une toile crème : la barre
  // d'adresse prolonge l'en-tête. Croisé par tests/pwa-manifeste.
  themeColor: BRAND_INK,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // BL-112 : lang suit la langue de session (lecteurs d'écran + SEO) — figé
  // sur "fr" auparavant, le Kreyòl était prononcé avec les règles du français.
  const lang = await getLang();
  // Thème : le cookie décide AU RENDU SERVEUR — la page arrive dans le bon
  // thème, sans flash. Toute valeur autre que "dark" rend le CLAIR : depuis
  // la Phase 1 de l'accueil premium (2026-09-04, docs/02 V-20), la toile
  // crème est l'identité par défaut, le sombre un choix explicite.
  const theme =
    (await cookies()).get("zab_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang={lang} data-theme={theme} className={`${inter.variable} ${manrope.variable}`}>
      <body className="min-h-dvh antialiased">
        {/* Monté sur TOUTES les pages, parce qu'on ne sait pas d'avance où
            Supabase déposera l'utilisateur quand l'allowlist Auth ignore le
            `redirectTo` : il retombe sur le Site URL, quel qu'il soit. Ne rend
            rien et ne se déclenche que sur `type=recovery`. */}
        <RecoveryCatcher />
        {children}
      </body>
    </html>
  );
}
