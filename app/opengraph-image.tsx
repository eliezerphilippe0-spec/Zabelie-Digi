import { ImageResponse } from "next/og";
import { siteUrl } from "@/lib/site-url";

/**
 * Aperçu de partage de l'ACCUEIL — le canal d'acquisition est WhatsApp : ce
 * cadre est la première chose que verra la majorité des visiteurs, avant même
 * la page. Même charte que l'aperçu produit (`app/produit/[slug]/
 * opengraph-image.tsx`) : les cartes de partage gardent leur dégradé
 * historique, distinct du thème noir du site — c'est l'identité des liens,
 * pas celle de l'écran.
 *
 * Texte kreyòl d'abord (la langue du canal), français en second. En dur et
 * hors `t()` : le crawler WhatsApp n'a pas de cookie de langue, il n'y a
 * qu'UNE image par URL — elle porte donc les deux langues du terrain.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const alt = "Zabelie — makètplas ayisyen an";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "linear-gradient(135deg, #2b3050 0%, #4a2731 55%, #17123a 100%)";
const ACCENT = "#f5934f";
const BRAND_A = "#feb56c";
const BRAND_B = "#f26a21";
const TEXT = "#f4eee8";
const MUTED = "#b3a39b";
const INK = "#17123a";

export default function OgAccueil() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: BG,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 84,
              height: 84,
              borderRadius: 22,
              background: `linear-gradient(135deg, ${BRAND_A}, ${ACCENT} 45%, ${BRAND_B})`,
              color: INK,
              fontSize: 52,
              fontWeight: 800,
            }}
          >
            Z
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 800, color: TEXT }}>
            Zabelie
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              fontSize: 62,
              fontWeight: 800,
              color: TEXT,
              lineHeight: 1.1,
            }}
          >
            Machandiz, sèvis ak pwodui dijital
          </div>
          <div style={{ display: "flex", fontSize: 34, color: MUTED }}>
            La marketplace haïtienne — payez avec MonCash
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              padding: "12px 28px",
              borderRadius: 14,
              background: BRAND_B,
              color: INK,
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            MonCash
          </div>
          {/* Le domaine vient de l'environnement (lib/site-url) — jamais en
              dur : personne ici ne connaît le domaine final avec certitude. */}
          <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
            {new URL(siteUrl()).host}
          </div>
        </div>
      </div>
    ),
    size
  );
}
