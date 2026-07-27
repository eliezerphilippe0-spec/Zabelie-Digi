"use client";

import { useState } from "react";
import {
  isService,
  KIND_FILE,
  KIND_SERVICE,
  type DigitalKind,
} from "@/lib/product-kind";
import { useRouter } from "next/navigation";
import { PRODUCT_CATEGORIES } from "@/lib/product-categories";
import { NetEstimate, type NetEstimateLabels } from "@/components/net-estimate";
import type { CreatorTier } from "@/lib/commission";
import { POLICY_PATH } from "@/lib/policy";
import Link from "next/link";

export type PublishFormLabels = {
  titlePh: string;
  kindAria: string;
  kindFile: string;
  kindService: string;
  categoryAria: string;
  categoryEmpty: string;
  pricePh: string;
  descriptionPh: string;
  serviceHint: string;
  deliveryDaysPh: string;
  includesPh: string;
  includesAria: string;
  submit: string;
  submitting: string;
  errorGeneric: string;
  errorNetwork: string;
  footerHint: string;
  net: NetEstimateLabels;
  policyAccept: string;
  policyRead: string;
  policyRequired: string;
};

export function PublishForm({
  labels,
  tier = "standard",
}: {
  labels: PublishFormLabels;
  /** Palier réel du vendeur, lu en base — jamais deviné côté client. */
  tier?: CreatorTier;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policyOk, setPolicyOk] = useState(false);
  const [form, setForm] = useState({
    title: "",
    // Le formulaire ne publie que des produits digitaux : `physical` a sa
    // propre route (`/vendre/physique`). Le type reste néanmoins celui de
    // l'énumération, pour que `isService` s'applique sans conversion.
    kind: KIND_FILE as DigitalKind,
    category: "",
    priceHTG: "",
    description: "",
    deliveryDays: "",
    serviceIncludes: "",
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          kind: form.kind,
          category: form.category,
          description: form.description,
          priceHTG: Number(form.priceHTG),
          policyAccepted: policyOk,
          deliveryDays: form.deliveryDays ? Number(form.deliveryDays) : null,
          // Un élément par ligne — le serveur reborne (10 max, 140 car.).
          serviceIncludes: form.serviceIncludes
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? labels.errorGeneric);
        return;
      }
      // BL-103 : un produit « fichier » naît en brouillon (invisible au
      // public tant que le livrable n'est pas uploadé) → on renvoie vers la
      // liste « Mes produits » où se trouve le bouton d'upload.
      router.push(data.status === "draft" ? "/vendre" : `/produit/${data.slug}`);
      router.refresh();
    } catch {
      setError(labels.errorNetwork);
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-violet";

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        className={input}
        placeholder={labels.titlePh}
        aria-label={labels.titlePh}
        value={form.title}
        onChange={(e) => set("title", e.target.value)}
        required
      />
      <div className="flex gap-3">
        <select
          className={input}
          aria-label={labels.kindAria}
          value={form.kind}
          onChange={(e) => set("kind", e.target.value)}
        >
          <option value={KIND_FILE}>{labels.kindFile}</option>
          <option value={KIND_SERVICE}>{labels.kindService}</option>
        </select>
        {/* BL-105 : liste fermée partagée avec le catalogue — un produit est
            toujours atteignable via une puce (fini le texte libre invisible). */}
        <select
          className={input}
          aria-label={labels.categoryAria}
          value={form.category}
          onChange={(e) => set("category", e.target.value)}
          required
        >
          <option value="">{labels.categoryEmpty}</option>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <input
          className={input}
          type="number"
          min={0}
          placeholder={labels.pricePh}
          aria-label={labels.pricePh}
          value={form.priceHTG}
          onChange={(e) => set("priceHTG", e.target.value)}
          required
        />
        <NetEstimate priceHTG={form.priceHTG} tier={tier} labels={labels.net} />
      </div>
      <textarea
        className={input}
        rows={4}
        placeholder={labels.descriptionPh}
        aria-label={labels.descriptionPh}
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
      />
      {isService(form.kind) && (
        <div className="space-y-3 rounded-xl border border-line/60 p-4">
          <p className="text-xs text-mist">{labels.serviceHint}</p>
          <input
            className={input}
            type="number"
            min={1}
            max={365}
            placeholder={labels.deliveryDaysPh}
            aria-label={labels.deliveryDaysPh}
            value={form.deliveryDays}
            onChange={(e) => set("deliveryDays", e.target.value)}
          />
          <textarea
            className={input}
            rows={3}
            placeholder={labels.includesPh}
            aria-label={labels.includesAria}
            value={form.serviceIncludes}
            onChange={(e) => set("serviceIncludes", e.target.value)}
          />
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink transition hover:opacity-90 disabled:opacity-60"
      >
        {loading ? labels.submitting : labels.submit}
      </button>
      {error && <p className="text-center text-xs text-danger-text">{error}</p>}
      {/* Attestation : obligatoire, jamais pré-cochée. Le serveur refuse de
          toute façon sans elle — cette case explique, elle ne garde pas. */}
      <label className="flex items-start gap-3 rounded-xl border border-line bg-surface/40 p-4 text-xs text-mist">
        <input
          type="checkbox"
          required
          checked={policyOk}
          onChange={(e) => setPolicyOk(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span>
          {labels.policyAccept}{" "}
          <Link href={POLICY_PATH} className="underline hover:text-cloud">
            {labels.policyRead}
          </Link>
        </span>
      </label>

      <p className="text-center text-xs text-mist">{labels.footerHint}</p>
    </form>
  );
}
