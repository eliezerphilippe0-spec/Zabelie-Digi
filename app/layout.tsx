import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { getLang } from "@/lib/i18n-server";
import { cookies } from "next/headers";
import { siteUrl } from "@/lib/site-url";
import { SITE_TITLE, SITE_DESCRIPTION, BRAND_INK } from "@/lib/brand";
import { RecoveryCatcher } from "@/components/recovery-catcher";

// Polices AUTO-HÉBERGÉES par Next (sous-ensemble latin, servies depuis notre
// domaine) — supprime la requête tierce bloquante vers Google Fonts, gain net
// sur 3G. `swap` : le texte s'affiche immédiatement en repli puis bascule.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});
/* Titres — Playfair Display, serif de forte modulation (demande porteur
   2026-08-11, d'après la carte de restaurant photographiée).
   
   FONTE VARIABLE, et c'est mesuré : la première version chargeait deux
   graisses statiques (600/700). Le `h1` de l'accueil porte un utilitaire
   `font-extrabold`, donc 800 — que le navigateur SYNTHÉTISAIT faute de
   l'avoir. Un faux gras sur une grotesque passe inaperçu ; sur un serif à
   forte modulation il épaissit les déliés autant que les pleins et détruit
   le dessin de la lettre. La variable couvre 400→900 dans UN SEUL fichier :
   plus léger que deux statiques, et aucune graisse inventée.
   Sous-ensemble `latin` : couvre è, ò, é, ô, à, ç — français ET kreyòl. */
const playfair = Playfair_Display({
  subsets: ["latin"],
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
  // #17123a était le violet de la palette ABANDONNÉE le 2026-07-25 : sur
  // Chrome Android — le terrain principal — la barre d'adresse s'affichait
  // violette au-dessus d'un site noir et orange. Aligné sur --color-bg-1.
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
  // thème, sans flash. Toute valeur autre que "light" rend le sombre : le
  // sombre est l'identité par défaut, le clair un choix explicite.
  const theme =
    (await cookies()).get("zab_theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang={lang} data-theme={theme} className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-screen antialiased">
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
