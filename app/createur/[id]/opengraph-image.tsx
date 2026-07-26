import { ImageResponse } from "next/og";
import { getCreator } from "@/lib/creators";

// Aperçu de partage d'une boutique créateur (la page a un CTA « Partage ta
// boutique sur WhatsApp » — ce lien doit s'afficher comme une vitrine).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const alt = "Boutique créateur — Zabelie";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "linear-gradient(135deg, #2b3050 0%, #4a2731 55%, #17123a 100%)";
const ACCENT = "#f5934f";
const BRAND_A = "#feb56c";
const BRAND_B = "#f26a21";
const TEXT = "#f4eee8";
const MUTED = "#b3a39b";
const INK = "#17123a";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const creator = await getCreator(id).catch(() => null);

  const name = creator?.displayName ?? "Zabelie";
  const count = creator?.products.length ?? 0;
  const bio = creator?.bio?.trim() || null;
  const safeName = name.length > 40 ? name.slice(0, 38) + "…" : name;
  const initials = name.slice(0, 2).toUpperCase();

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
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 60,
              height: 60,
              borderRadius: 16,
              background: `linear-gradient(135deg, ${BRAND_A}, ${ACCENT} 45%, ${BRAND_B})`,
              color: INK,
              fontSize: 36,
              fontWeight: 800,
            }}
          >
            Z
          </div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: TEXT }}>
            Zabelie
          </div>
        </div>

        {/* Avatar (initiales) + nom + boutique */}
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 132,
              height: 132,
              borderRadius: 28,
              background: `linear-gradient(135deg, ${BRAND_A}, ${BRAND_B})`,
              color: INK,
              fontSize: 56,
              fontWeight: 800,
            }}
          >
            {initials}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                display: "flex",
                fontSize: 68,
                fontWeight: 800,
                color: TEXT,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
              }}
            >
              {safeName}
            </div>
            <div style={{ display: "flex", fontSize: 30, color: ACCENT }}>
              {count > 0
                ? `${count} produit${count > 1 ? "s" : ""} en ligne`
                : "Boutique sur Zabelie"}
            </div>
          </div>
        </div>

        {/* Bio courte ou réassurance */}
        <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
          {bio && bio.length > 0
            ? bio.length > 110
              ? bio.slice(0, 108) + "…"
              : bio
            : "Paiement MonCash · Livraison instantanée"}
        </div>
      </div>
    ),
    { ...size }
  );
}
