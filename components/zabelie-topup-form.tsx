"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeHaitiPhone, detectOperator } from "@/lib/zabelie-topup/phone";
import { usdCentsFromHtg, formatUsd } from "@/lib/payment-utils";

export type TopupProductOption = {
  id: string;
  operator: "digicel" | "natcom";
  faceValueHtg: number;
  priceHtg: number;
  priceLabel: string;
};

export type TopupRailOption = { rail: "moncash" | "zelle"; label: string };

type Labels = {
  operator: string;
  phoneLabel: string;
  phonePh: string;
  phone2Label: string;
  phone2Why: string;
  mismatch: string;
  invalid: string;
  detected: string;
  amountLabel: string;
  receives: string; // contient {face}
  loading: string;
  errorGeneric: string;
  errorNetwork: string;
  errorProvider: string;
};

/**
 * Flow acheteur recharge (V-11), mobile-first / 3G :
 * opérateur (pré-rempli par le préfixe), numéro en DOUBLE SAISIE (un mauvais
 * numéro = recharge perdue), montant depuis le catalogue SERVEUR, rail.
 * Les prix affichés viennent du serveur ; le serveur revalide tout.
 */
export function ZabelieTopupForm({
  products,
  rails,
  labels,
  htgPerUsd,
}: {
  products: TopupProductOption[];
  rails: TopupRailOption[];
  labels: Labels;
  /** Taux public HTG/USD — uniquement pour AFFICHER le prix Zelle. */
  htgPerUsd?: number;
}) {
  const router = useRouter();
  const [operator, setOperator] = useState<"digicel" | "natcom">("digicel");
  const [operatorTouched, setOperatorTouched] = useState(false);
  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [loadingRail, setLoadingRail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalized = useMemo(() => normalizeHaitiPhone(phone), [phone]);
  const detected = normalized ? detectOperator(normalized) : null;
  // Détection = pré-remplissage seulement ; l'acheteur garde la main.
  const effectiveOperator = operatorTouched ? operator : (detected ?? operator);

  const choices = products.filter((p) => p.operator === effectiveOperator);
  const selected = choices.find((p) => p.id === productId) ?? null;

  const phonesMatch =
    normalized !== null && normalizeHaitiPhone(phone2) === normalized;
  const ready = Boolean(normalized && phonesMatch && selected);

  async function submit(rail: string) {
    if (!ready || !selected) return;
    setLoadingRail(rail);
    setError(null);
    try {
      const res = await fetch("/api/zabelie/topup/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selected.id,
          phone,
          phoneConfirm: phone2,
          rail,
        }),
      });
      if (res.status === 401) {
        // Retour automatique sur /rechaj après connexion.
        router.push(`/connexion?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.code === "provider_unavailable"
            ? labels.errorProvider
            : (data.error ?? labels.errorGeneric)
        );
        return;
      }
      if (String(data.redirectUrl).startsWith("/")) router.push(data.redirectUrl);
      else window.location.href = data.redirectUrl;
    } catch {
      setError(labels.errorNetwork);
    } finally {
      setLoadingRail(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Opérateur */}
      <div>
        <p className="text-sm font-semibold">{labels.operator}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["digicel", "natcom"] as const).map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => {
                setOperator(op);
                setOperatorTouched(true);
                setProductId(null);
              }}
              className={`rounded-xl border px-4 py-3 text-sm font-semibold capitalize transition ${
                effectiveOperator === op
                  ? "border-brand bg-brand/15 text-cloud"
                  : "border-line bg-surface/60 text-mist hover:border-brand/50"
              }`}
            >
              {op}
            </button>
          ))}
        </div>
        {detected && !operatorTouched && (
          <p className="mt-1 text-xs text-mist">
            {labels.detected} : <span className="capitalize text-cloud">{detected}</span>
          </p>
        )}
      </div>

      {/* Numéro — double saisie */}
      <div>
        <label className="text-sm font-semibold" htmlFor="topup-phone">
          {labels.phoneLabel}
        </label>
        <input
          id="topup-phone"
          inputMode="tel"
          autoComplete="off"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={labels.phonePh}
          className="mt-2 w-full rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm text-cloud placeholder:text-mist focus:border-brand/60 focus:outline-none"
        />
        {phone && !normalized && (
          <p className="mt-1 text-xs text-danger-text">{labels.invalid}</p>
        )}
        <label className="mt-3 block text-sm font-semibold" htmlFor="topup-phone2">
          {labels.phone2Label}
        </label>
        <input
          id="topup-phone2"
          inputMode="tel"
          autoComplete="off"
          onPaste={(e) => e.preventDefault()} // retaper, pas coller
          value={phone2}
          onChange={(e) => setPhone2(e.target.value)}
          placeholder={labels.phonePh}
          className="mt-2 w-full rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm text-cloud placeholder:text-mist focus:border-brand/60 focus:outline-none"
        />
        <p className="mt-1 text-xs text-mist">{labels.phone2Why}</p>
        {phone2 && normalized && !phonesMatch && (
          <p className="mt-1 text-xs text-danger-text">{labels.mismatch}</p>
        )}
      </div>

      {/* Montant (catalogue serveur) */}
      <div>
        <p className="text-sm font-semibold">{labels.amountLabel}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {choices.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProductId(p.id)}
              className={`rounded-xl border px-2 py-3 text-center transition ${
                productId === p.id
                  ? "border-brand bg-brand/15"
                  : "border-line bg-surface/60 hover:border-brand/50"
              }`}
            >
              <span className="numeric block text-sm font-extrabold">
                {p.faceValueHtg} HTG
              </span>
              <span className="block text-xs text-mist">{p.priceLabel}</span>
            </button>
          ))}
        </div>
        {selected && (
          <p className="mt-2 text-xs text-mist">
            {labels.receives.replace("{face}", String(selected.faceValueHtg))}
          </p>
        )}
      </div>

      {/* Paiement */}
      <div className="grid gap-2">
        {rails.map((r, i) => (
          <button
            key={r.rail}
            type="button"
            disabled={!ready || loadingRail !== null}
            onClick={() => submit(r.rail)}
            className={
              i === 0
                ? "w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink transition hover:opacity-90 disabled:opacity-50"
                : "w-full rounded-xl border border-line bg-surface/60 px-6 py-2.5 text-sm font-semibold text-cloud transition hover:border-brand/60 disabled:opacity-50"
            }
          >
            {loadingRail === r.rail
              ? labels.loading
              : r.label.replace(
                  "{price}",
                  !selected
                    ? "…"
                    : r.rail === "zelle" && htgPerUsd
                      ? formatUsd(usdCentsFromHtg(selected.priceHtg, htgPerUsd))
                      : selected.priceLabel
                )}
          </button>
        ))}
      </div>
      {error && <p className="text-center text-xs text-danger-text">{error}</p>}
    </div>
  );
}
