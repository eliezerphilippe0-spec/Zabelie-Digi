"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type BuyOption = {
  rail: "moncash" | "stripe" | "zelle";
  label: string;
};

export type ErrorLabels = {
  generic: string;
  network: string;
  provider: string; // code provider_unavailable renvoyé par l'API (BL-114)
};

/** Variante d'un produit physique (chantier B). */
export type VariantChoice = {
  id: string;
  label: string | null;
  priceHTG: number;
  available: number;
};

export type StockLabels = {
  chooseVariant: string;
  outOfStock: string;
  lastUnits: string;   // contient {n}
  inStock: string;     // contient {n}
  variantOut: string;
};

export type CouponLabels = {
  have: string;
  placeholder: string;
  apply: string;
  applied: string; // contient {percent} et {price}
  invalid: string;
};

const fmtHtg = (n: number) => `${new Intl.NumberFormat("fr-HT").format(n)} HTG`;

/**
 * Lance le checkout sur le rail choisi : POST /api/checkout { productId, rail }
 * puis redirection (passerelle MonCash/Stripe, ou page d'instructions Zelle).
 * La confirmation se fait toujours serveur-à-serveur — jamais ici.
 * Les options sont construites CÔTÉ SERVEUR (rails activés + libellés i18n) ;
 * une seule option = bouton simple (parcours MVP inchangé).
 */
export function BuyButton({
  productId,
  options,
  variants,
  stockLabels,
  othersLabel,
  loadingLabel = "Redirection…",
  coupon,
  errors,
}: {
  productId: string;
  options: BuyOption[];
  /** Variantes physiques. Absent = produit digital, parcours inchangé. */
  variants?: VariantChoice[];
  stockLabels?: StockLabels;
  /** Petit titre au-dessus des rails secondaires (ex. « Diaspora ? … »). */
  othersLabel?: string;
  loadingLabel?: string;
  /** Libellés i18n du champ code promo (absent = champ masqué). */
  coupon?: CouponLabels;
  /** Libellés i18n des erreurs (BL-113 : l'échec aussi doit parler KR). */
  errors?: ErrorLabels;
}) {
  const router = useRouter();
  const [loadingRail, setLoadingRail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCoupon, setShowCoupon] = useState(false);
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<{ percent: number; priceHtg: number } | null>(null);
  const [couponError, setCouponError] = useState(false);
  const [checking, setChecking] = useState(false);
  // Première variante EN STOCK par défaut : l'acheteur n'a rien à faire si le
  // produit n'a qu'une déclinaison disponible.
  const [variantId, setVariantId] = useState<string | null>(
    () => variants?.find((v) => v.available > 0)?.id ?? variants?.[0]?.id ?? null
  );
  const selected = variants?.find((v) => v.id === variantId) ?? null;
  const soldOut = Boolean(variants && variants.every((v) => v.available <= 0));
  const selectedOut = Boolean(selected && selected.available <= 0);

  async function applyCoupon() {
    if (!code.trim()) return;
    setChecking(true);
    setCouponError(false);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, code }),
      });
      const data = await res.json();
      if (data.valid) setApplied({ percent: data.percent, priceHtg: data.priceHtg });
      else {
        setApplied(null);
        setCouponError(true);
      }
    } catch {
      setCouponError(true);
    } finally {
      setChecking(false);
    }
  }

  async function handleBuy(rail: string) {
    setLoadingRail(rail);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          rail,
          // Produit physique : la variante décide du stock réservé. Le serveur
          // revérifie tout — c'est lui qui refuse si l'unité est partie.
          variantId: variantId ?? undefined,
          quantity: variantId ? 1 : undefined,
          // Le code n'est transmis que s'il a été validé (le serveur revalide
          // et consomme atomiquement — la vérité du prix reste en base).
          couponCode: applied ? code : undefined,
        }),
      });

      if (res.status === 401) {
        // Préserve le contexte : retour automatique sur la page produit
        // après connexion (le point de friction n°1 vs Gumroad).
        router.push(`/connexion?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "coupon_invalid" && coupon) {
          // Bilingue (i18n) + retour à l'état sans remise : l'acheteur
          // re-choisit en connaissance de cause, jamais de prix plein en douce.
          setApplied(null);
          setCouponError(true);
          setError(coupon.invalid);
          return;
        }
        setError(
          data.code === "provider_unavailable" && errors
            ? errors.provider
            : (data.error ?? errors?.generic ?? "Une erreur est survenue.")
        );
        return;
      }
      // Redirection vers le rail (URL absolue opérateur ou page interne).
      if (String(data.redirectUrl).startsWith("/")) {
        router.push(data.redirectUrl);
      } else {
        window.location.href = data.redirectUrl;
      }
    } catch {
      setError(errors?.network ?? "Connexion impossible. Réessayez.");
    } finally {
      setLoadingRail(null);
    }
  }

  const [primary, ...others] = options;
  const busy = loadingRail !== null;

  const stockBadge = (n: number) => {
    if (!stockLabels) return null;
    if (n <= 0) return { text: stockLabels.outOfStock, tone: "text-danger-text" };
    if (n <= 3)
      return {
        text: stockLabels.lastUnits.replace("{n}", String(n)),
        tone: "text-warning-text",
      };
    return {
      text: stockLabels.inStock.replace("{n}", String(n)),
      tone: "text-success-text",
    };
  };

  return (
    <div>
      {/* ── Variantes (produit physique) ───────────────────────────────── */}
      {variants && variants.length > 0 && (
        <div className="mb-4">
          {/* Sélecteur seulement s'il y a un vrai choix : une variante
              implicite (filtre à huile) n'affiche que l'état du stock. */}
          {(variants.length > 1 || variants[0].label) && stockLabels && (
            <>
              <p className="mb-2 text-sm font-semibold text-cloud">
                {stockLabels.chooseVariant}
              </p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => {
                  const out = v.available <= 0;
                  const active = v.id === variantId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={out}
                      onClick={() => setVariantId(v.id)}
                      className={`rounded-xl border px-3 py-2 text-sm transition ${
                        active
                          ? "border-brand bg-brand/10 text-cloud"
                          : "border-line text-mist hover:border-brand/50"
                      } ${out ? "cursor-not-allowed line-through opacity-50" : ""}`}
                    >
                      {v.label ?? "Standard"}
                      <span className="ml-2 text-xs opacity-80">
                        {fmtHtg(v.priceHTG)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* État du stock — toujours visible : un catalogue fantôme détruit
              la confiance plus vite qu'une rupture annoncée. */}
          {selected &&
            (() => {
              const badge = stockBadge(selected.available);
              return badge ? (
                <p className={`mt-2 text-sm font-semibold ${badge.tone}`}>
                  {badge.text}
                </p>
              ) : null;
            })()}
        </div>
      )}

      {/* Code promo (V-13) */}
      {coupon && !applied && !showCoupon && (
        <button
          type="button"
          onClick={() => setShowCoupon(true)}
          className="mb-3 text-xs text-mist underline-offset-2 hover:text-cloud hover:underline"
        >
          {coupon.have}
        </button>
      )}
      {coupon && !applied && showCoupon && (
        <div className="mb-3 flex gap-2">
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setCouponError(false);
            }}
            placeholder={coupon.placeholder}
            aria-label={coupon.placeholder}
            maxLength={24}
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface/60 px-3 py-2 text-sm uppercase text-cloud placeholder:normal-case placeholder:text-mist/60 focus:border-brand/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={applyCoupon}
            disabled={checking || !code.trim()}
            className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-cloud transition hover:border-brand/60 disabled:opacity-50"
          >
            {checking ? "…" : coupon.apply}
          </button>
        </div>
      )}
      {coupon && couponError && (
        <p className="mb-2 text-xs text-danger-text">{coupon.invalid}</p>
      )}
      {coupon && applied && (
        <p className="mb-3 text-sm font-semibold text-success-text">
          {coupon.applied
            .replace("{percent}", String(applied.percent))
            .replace("{price}", fmtHtg(applied.priceHtg))}
        </p>
      )}

      <button
        onClick={() => handleBuy(primary.rail)}
        disabled={busy || soldOut || selectedOut}
        className="w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink transition hover:opacity-90 disabled:opacity-60"
      >
        {soldOut || selectedOut
          ? (stockLabels?.variantOut ?? "Indisponible")
          : loadingRail === primary.rail
            ? loadingLabel
            : primary.label}
      </button>

      {others.length > 0 && (
        <div className="mt-3">
          {othersLabel && (
            <p className="text-center text-xs text-mist">{othersLabel}</p>
          )}
          <div className="mt-2 grid gap-2">
            {others.map((o) => (
              <button
                key={o.rail}
                onClick={() => handleBuy(o.rail)}
                disabled={busy || soldOut || selectedOut}
                className="w-full rounded-xl border border-line bg-surface/60 px-6 py-2.5 text-sm font-semibold text-cloud transition hover:border-brand/60 disabled:opacity-60"
              >
                {loadingRail === o.rail ? loadingLabel : o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-center text-xs text-danger-text">{error}</p>}
    </div>
  );
}
