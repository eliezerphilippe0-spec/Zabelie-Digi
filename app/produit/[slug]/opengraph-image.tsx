import { ImageResponse } from "next/og";
import { getProductView } from "@/lib/products";
import { formatHTG } from "@/lib/sample-data";

// Aperçu de partage (WhatsApp / Facebook / X) généré à la volée par produit.
// Objectif marché : un lien produit partagé sur WhatsApp affiche une mini-affiche
// (titre + prix + créateur), pas un aperçu générique — c'est le canal n°1 en Haïti.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const alt = "Zabelie — produit";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Charte : dégradé chaud + rampe orange/ambre (tokens zabelie-theme.css).
const BG = "linear-gradient(135deg, #2b3050 0%, #4a2731 55%, #17123a 100%)";
const ACCENT = "#f5934f";
const BRAND_A = "#feb56c";
const BRAND_B = "#f26a21";
const TEXT = "#f4eee8";
const MUTED = "#b3a39b";
const INK = "#17123a";

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 68,
          height: 68,
          borderRadius: 18,
          background: `linear-gradient(135deg, ${BRAND_A}, ${ACCENT} 45%, ${BRAND_B})`,
          color: INK,
          fontSize: 42,
          fontWeight: 800,
        }}
      >
        Z
      </div>
      <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: TEXT }}>
        Zabelie
      </div>
    </div>
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductView(slug).catch(() => undefined);

  // Repli : produit introuvable → carte de marque générique (jamais d'image cassée).
  const title = product?.title ?? "Zabelie";
  const creator = product?.creator ?? "Marketplace digitale haïtienne";
  const price = product ? formatHTG(product.priceHTG) : null;
  const kind =
    product?.kind === "service" ? "Service" : product ? "Produit digital" : null;
  const safeTitle = title.length > 90 ? title.slice(0, 88) + "…" : title;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: 70,
          fontFamily: "sans-serif",
        }}
      >
        {/* En-tête : logo + badge type */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Logo />
          {kind && (
            <div
              style={{
                display: "flex",
                fontSize: 22,
                color: MUTED,
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 999,
                padding: "8px 20px",
              }}
            >
              {kind}
            </div>
          )}
        </div>

        {/* Titre produit + créateur */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              fontSize: safeTitle.length > 45 ? 64 : 78,
              fontWeight: 800,
              color: TEXT,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            {safeTitle}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: MUTED }}>
            par {creator}
          </div>
        </div>

        {/* Pied : prix + réassurance */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          {price ? (
            <div style={{ display: "flex", fontSize: 58, fontWeight: 800, color: ACCENT }}>
              {price}
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 34, color: TEXT }}>
              Produits digitaux &amp; talents haïtiens
            </div>
          )}
          <div style={{ display: "flex", fontSize: 24, color: MUTED }}>
            Paiement MonCash · Livraison instantanée
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
