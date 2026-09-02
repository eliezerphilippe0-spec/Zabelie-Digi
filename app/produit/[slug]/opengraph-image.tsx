import { ImageResponse } from "next/og";
import { getProductView } from "@/lib/products";
import { formatHTG } from "@/lib/sample-data";
import { pickByKind } from "@/lib/product-kind";
import { coverUrlAt, COVER_WIDTHS } from "@/lib/product-image";

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


/**
 * Délai sur la RECHERCHE PRODUIT — même règle que la photo, un cran plus haut.
 * Le crawler de WhatsApp a son propre délai : s'il abandonne avant que la
 * carte arrive, il met en cache un lien NU, durablement. « La carte rend
 * quand même » n'est vrai que si quelqu'un attend encore. Base muette en 2 s
 * → carte générique immédiate : une carte générique vaut mieux qu'un lien nu,
 * et infiniment mieux qu'un lien nu figé.
 */
const PRODUCT_TIMEOUT_MS = 2000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Délai au-delà duquel on renonce à la photo plutôt que retarder la carte. */
const COVER_TIMEOUT_MS = 2000;
/** Au-delà, l'encodage en data URI coûte plus qu'il ne rapporte. */
const COVER_MAX_BYTES = 2 * 1024 * 1024;

async function fetchCover(url: string | null): Promise<string | null> {
  const sized = coverUrlAt(url, COVER_WIDTHS.share);
  if (!sized || !/^https?:\/\//.test(sized)) return null;
  try {
    const res = await fetch(sized, { signal: AbortSignal.timeout(COVER_TIMEOUT_MS) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > COVER_MAX_BYTES) return null;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    // Délai dépassé, hôte injoignable, réponse illisible : on rend sans photo.
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await withTimeout(
    getProductView(slug).catch(() => undefined),
    PRODUCT_TIMEOUT_MS,
    undefined
  );

  // Repli : produit introuvable OU base muette → carte de marque générique
  // (jamais d'image cassée, jamais de crawler qui abandonne).
  const title = product?.title ?? "Zabelie";
  const creator = product?.creator ?? "Marketplace digitale haïtienne";
  const price = product ? formatHTG(product.priceHTG) : null;
  // Le badge annonçait « Produit digital » pour tout ce qui n'était pas un
  // service — donc pour une pièce détachée, sur la carte que reçoit l'acheteur.
  const kind = product
    ? pickByKind(product.kind, {
        file: "Produit digital",
        service: "Service",
        physical: "Produit physique",
      })
    : null;
  // Zabelie ne livre pas : aucune promesse de délai sur un produit physique.
  const reassurance = product
    ? pickByKind(product.kind, {
        file: "Paiement MonCash · Livraison instantanée",
        service: "Paiement MonCash · Mise en relation",
        physical: "Paiement MonCash",
      })
    : "Paiement MonCash";
  const safeTitle = title.length > 90 ? title.slice(0, 88) + "…" : title;
  // Photo produit — récupérée ICI, avec un délai borné, et intégrée en data
  // URI plutôt que confiée au rendu.
  //
  // Pourquoi ne pas passer l'URL à satori : il la téléchargerait lui-même,
  // sans délai maîtrisé. Un stockage lent ou injoignable ferait alors traîner
  // ou échouer la génération de la carte — la surface où un échec coûte le
  // plus cher, puisque WhatsApp fige l'aperçu obtenu. Ici, si l'image n'est
  // pas là en 2 s, on rend la carte SANS elle : dégradée, jamais cassée.
  const cover = await fetchCover(product?.coverUrl ?? null);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: BG,
          fontFamily: "sans-serif",
        }}
      >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 70,
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
              // Colonne rétrécie quand la photo occupe la droite.
              fontSize: cover
                ? safeTitle.length > 45 ? 48 : 58
                : safeTitle.length > 45 ? 64 : 78,
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
          {reassurance && (
            <div style={{ display: "flex", fontSize: 24, color: MUTED }}>
              {reassurance}
            </div>
          )}
        </div>
      </div>
      {cover && (
        <img
          src={cover}
          alt=""
          width={430}
          height={630}
          style={{ width: 430, height: 630, objectFit: "cover" }}
        />
      )}
      </div>
    ),
    { ...size }
  );
}
