"use client";
import { normalizeRecipient, type RecipientInput, type RecipientLabels } from "@/lib/order-recipient";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appelSession } from "@/lib/appel-session";
import {
  normaliserNumeroHaiti,
  operateurDouteux,
  type Operateur,
} from "@/lib/rechaj";

export type BuyOption = {
  /**
   * `gratis` (0087) n'est pas un moyen de paiement : c'est l'absence de
   * paiement. Le serveur l'IGNORE de toute façon — il déduit le rail du prix
   * relu en base — donc l'envoyer ne donne aucun pouvoir au client. Il figure
   * ici pour que le bouton porte le bon libellé et le bon état de chargement.
   */
  rail: "moncash" | "stripe" | "zelle" | "gratis";
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

/**
 * Champ « numéro à recharger » (0099) — absent pour tout produit qui n'est pas
 * une recharge. Deux saisies, comme chez tous les revendeurs : un chiffre faux
 * est irrécupérable, et l'erreur ne se voit qu'après que le crédit est parti.
 */
export type RechajLabels = {
  title: string;
  placeholder: string;
  confirm: string;
  mismatch: string;
  invalid: string;
  warning: string; // contient {operateur}
  hint: string;
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
  rechaj,
  recipient,
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
  /** Recharge (0099) : absent = produit ordinaire, parcours inchangé. */
  rechaj?: { labels: RechajLabels; operateur: Operateur | null };
  /** Libellés i18n des erreurs (BL-113 : l'échec aussi doit parler KR). */
  errors?: ErrorLabels;
  recipient?: RecipientLabels;
}) {
  const router = useRouter();
  const [forSomeone, setForSomeone] = useState(false);
  const [recipientInput, setRecipientInput] = useState<RecipientInput>({ name: "", phone: "", locality: "", note: "", consent: false });
  const recipientValue = forSomeone ? normalizeRecipient(recipientInput) : null;
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
  /* Recharge (0099). Deux champs distincts, jamais un copier-coller de l'un
     dans l'autre : c'est la double saisie qui attrape le chiffre faux, et
     l'industrie entière la pratique parce que le crédit parti ne revient pas. */
  const [numero, setNumero] = useState("");
  const [numeroBis, setNumeroBis] = useState("");
  const numeroOk = normaliserNumeroHaiti(numero);
  const bisOk = normaliserNumeroHaiti(numeroBis);
  const numeroConcorde = Boolean(numeroOk && bisOk && numeroOk === bisOk);
  // Avertissement, jamais refus : les blocs d'opérateur viennent de résumés qui
  // se contredisent, et la portabilité du numéro suffirait à rendre tout
  // blocage faux (lib/rechaj.ts).
  const douteux = Boolean(
    numeroOk && rechaj && operateurDouteux(numeroOk, rechaj.operateur)
  );
  const rechajBloque = Boolean(rechaj) && !numeroConcorde;

  const selected = variants?.find((v) => v.id === variantId) ?? null;
  const soldOut = Boolean(variants && variants.every((v) => v.available <= 0));
  const selectedOut = Boolean(selected && selected.available <= 0);

  /* Même porte que l'achat. Ce chemin portait le même `res.json()` nu : un 500
     y disait « code invalide », c'est-à-dire accusait la saisie de l'acheteur
     d'une panne de serveur. Faute de libellé distinct pour le refus et le
     réseau (le champ n'en a qu'un), les deux rendent « code invalide » — mais
     un 401 mène désormais à la connexion au lieu de mentir. */
  async function applyCoupon() {
    if (!code.trim()) return;
    setChecking(true);
    setCouponError(false);
    const issue = await appelSession<{ valid?: boolean; percent?: number; priceHtg?: number }>(
      "/api/coupons/validate",
      { productId, code },
    );
    setChecking(false);

    if (issue.etat === "connexion") {
      router.push(issue.vers);
      return;
    }
    if (issue.etat !== "ok" || !issue.data.valid) {
      setApplied(null);
      setCouponError(true);
      return;
    }
    setApplied({ percent: issue.data.percent ?? 0, priceHtg: issue.data.priceHtg ?? 0 });
  }

  /* Le chemin de l'argent passe par `appelSession` (lib/appel-session.ts), et
     c'est CE bouton qui a motivé la porte : sa version précédente lisait
     `await res.json()` sans garde, si bien qu'un 500 au corps non-JSON levait
     et tombait dans le `catch` du réseau — l'acheteur lisait « Connexion
     impossible » devant une panne SERVEUR, changeait de réseau, et
     recommençait. Mesuré le 2026-09-05 (parcours acheteur). Les quatre issues
     sont désormais distinctes, et `reseau` ne couvre plus que le cas où la
     requête n'est jamais partie. */
  async function handleBuy(rail: string) {
    if (recipient && forSomeone && !recipientValue) { setError(recipient.invalid); return; }
    setLoadingRail(rail);
    setError(null);

    const issue = await appelSession<{ redirectUrl?: string }>("/api/checkout", {
      productId,
      rail,
      // Produit physique : la variante décide du stock réservé. Le serveur
      // revérifie tout — c'est lui qui refuse si l'unité est partie.
      variantId: variantId ?? undefined,
      quantity: variantId ? 1 : undefined,
      // Le code n'est transmis que s'il a été validé (le serveur revalide
      // et consomme atomiquement — la vérité du prix reste en base).
      couponCode: applied ? code : undefined,
      // Recharge : la forme NORMALISÉE, jamais la saisie brute. Le serveur
      // renormalise de toute façon — il ne fait confiance à rien d'ici.
      rechajNumero: numeroOk ?? undefined,
      recipient: recipient && forSomeone ? recipientInput : undefined,
    });

    if (issue.etat === "connexion") {
      // Préserve le contexte : retour automatique sur la page produit
      // après connexion (le point de friction n°1 vs Gumroad).
      router.push(issue.vers);
      return;
    }

    if (issue.etat === "refus") {
      if (issue.code === "coupon_invalid" && coupon) {
        // Bilingue (i18n) + retour à l'état sans remise : l'acheteur
        // re-choisit en connaissance de cause, jamais de prix plein en douce.
        setApplied(null);
        setCouponError(true);
        setError(coupon.invalid);
      } else {
        setError(
          issue.code === "provider_unavailable" && errors
            ? errors.provider
            : (issue.error ?? errors?.generic ?? "Une erreur est survenue.")
        );
      }
      setLoadingRail(null);
      return;
    }

    if (issue.etat === "reseau") {
      setError(errors?.network ?? "Connexion impossible. Réessayez.");
      setLoadingRail(null);
      return;
    }

    // Redirection vers le rail (URL absolue opérateur ou page interne). Une
    // réponse OK sans destination n'est pas une réussite : sans ce garde,
    // `window.location.href` recevait la chaîne « undefined ».
    const destination = String(issue.data.redirectUrl ?? "");
    if (!destination) {
      setError(errors?.generic ?? "Une erreur est survenue.");
      setLoadingRail(null);
      return;
    }
    if (destination.startsWith("/")) {
      router.push(destination);
    } else {
      window.location.href = destination;
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
      {recipient && <fieldset className="mb-5 rounded-xl border border-line p-4">
        <legend className="sr-only">{recipient.toggle}</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={forSomeone} onChange={e => setForSomeone(e.target.checked)} disabled={busy}/>{recipient.toggle}</label>
        {forSomeone && <div className="mt-3 space-y-3">
          <p className="text-xs text-mist">{recipient.hint}</p>
          {(["name", "phone", "locality", "note"] as const).map(field => <label key={field} className="block text-sm">
            <span>{recipient[field]}</span>
            <input className="mt-1 min-h-11 w-full rounded-xl border border-line bg-ink/40 px-3" type={field === "phone" ? "tel" : "text"} autoComplete="off"
              maxLength={field === "name" ? 100 : field === "phone" ? 30 : field === "locality" ? 160 : 500}
              value={recipientInput[field]} disabled={busy} onChange={e => setRecipientInput(prev => ({ ...prev, [field]: e.target.value }))}/>
          </label>)}
          <label className="flex min-h-11 items-start gap-3 py-2 text-xs"><input type="checkbox" className="mt-1" checked={recipientInput.consent} disabled={busy} onChange={e => setRecipientInput(prev => ({ ...prev, consent: e.target.checked }))}/>{recipient.consent}</label>
          {recipientValue && <p className="rounded-lg border border-line p-3 text-sm"><strong>{recipient.summary}</strong><br/>{recipientValue.full_name} · +509 {recipientValue.phone}<br/>{recipientValue.locality}</p>}
        </div>}
      </fieldset>}
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

      {/* ── Numéro à recharger (0099) ───────────────────────────────────────
          Placé AVANT le prix et le bouton, dans l'ordre que suivent tous les
          revendeurs : opérateur (c'est le rayon), numéro, montant (c'est la
          fiche). Deux saisies : la seconde n'est pas une politesse, c'est le
          seul filet contre le chiffre faux — une fois le crédit envoyé,
          personne ne le reprend, ni le vendeur ni l'opérateur. */}
      {rechaj && (
        <div className="mb-4 rounded-2xl border border-line bg-surface/60 p-4">
          <p className="text-sm font-semibold text-cloud">{rechaj.labels.title}</p>
          <div className="mt-3 grid gap-2">
            <input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder={rechaj.labels.placeholder}
              aria-label={rechaj.labels.placeholder}
              inputMode="tel"
              autoComplete="tel-national"
              maxLength={20}
              className="numeric min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-base text-cloud placeholder:text-mist focus:border-brand/60 focus:outline-none"
            />
            <input
              value={numeroBis}
              onChange={(e) => setNumeroBis(e.target.value)}
              placeholder={rechaj.labels.confirm}
              aria-label={rechaj.labels.confirm}
              inputMode="tel"
              // Pas d'autocomplétion sur la confirmation : le navigateur
              // remplirait les deux champs d'un coup et la double saisie ne
              // vérifierait plus rien.
              autoComplete="off"
              maxLength={20}
              className="numeric min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-base text-cloud placeholder:text-mist focus:border-brand/60 focus:outline-none"
            />
          </div>

          {/* Un seul message à la fois, du plus bloquant au plus consultatif. */}
          {numero.trim() !== "" && !numeroOk && (
            <p className="mt-2 text-xs text-danger-text">{rechaj.labels.invalid}</p>
          )}
          {numeroOk && numeroBis.trim() !== "" && !numeroConcorde && (
            <p className="mt-2 text-xs text-danger-text">{rechaj.labels.mismatch}</p>
          )}
          {numeroConcorde && douteux && rechaj.operateur && (
            <p className="mt-2 text-xs text-warning-text">
              {rechaj.labels.warning.replace("{operateur}", rechaj.operateur)}
            </p>
          )}
          <p className="mt-2 text-xs text-mist">{rechaj.labels.hint}</p>
        </div>
      )}

      {/* Code promo (V-13) */}
      {coupon && !applied && !showCoupon && (
        <button
          type="button"
          onClick={() => setShowCoupon(true)}
          className="inline-flex min-h-11 items-center mb-3 text-xs text-mist underline-offset-2 hover:text-cloud hover:underline"
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
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface/60 px-3 py-2 text-sm uppercase text-cloud placeholder:normal-case placeholder:text-mist focus:border-brand/60 focus:outline-none"
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
        disabled={busy || soldOut || selectedOut || rechajBloque}
        className="w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
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
                disabled={busy || soldOut || selectedOut || rechajBloque}
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
