"use client";

import { useState } from "react";

export type DeliveryLabels = {
  title: string;
  fullName: string;
  phone: string;
  adres: string;
  /** La promesse de visibilité, dite au titulaire. */
  hint: string;
  save: string;
  saving: string;
  saved: string;
  error: string;
};

/**
 * Coordonnées de livraison (V-5, docs/35) — formulaire séparé du profil
 * public : ces champs ne sont PAS publics (table dédiée 0076, RLS), et le
 * `hint` dit au titulaire exactement qui les verra, et quand.
 */
export function DeliveryInfoForm({
  initial,
  labels,
}: {
  initial: { full_name: string; phone: string; adres_liv: string };
  labels: DeliveryLabels;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<"ok" | "err" | null>(null);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/delivery-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.full_name,
          phone: form.phone,
          adresLiv: form.adres_liv,
        }),
      });
      setMsg(res.ok ? "ok" : "err");
    } catch {
      setMsg("err");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-violet";

  return (
    <form
      onSubmit={enregistrer}
      className="mt-8 space-y-3 rounded-2xl border border-line bg-surface/40 p-5"
    >
      <h2 className="text-sm font-semibold text-cloud">{labels.title}</h2>
      <p className="text-xs text-mist">{labels.hint}</p>
      <label className="block text-xs text-mist">
        {labels.fullName}
        <input
          className={input}
          maxLength={120}
          value={form.full_name}
          onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
        />
      </label>
      <label className="block text-xs text-mist">
        {labels.phone}
        <input
          className={input}
          type="tel"
          maxLength={30}
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
      </label>
      <label className="block text-xs text-mist">
        {labels.adres}
        <textarea
          className={input}
          rows={2}
          maxLength={240}
          value={form.adres_liv}
          onChange={(e) => setForm((f) => ({ ...f, adres_liv: e.target.value }))}
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-cloud hover:border-violet disabled:opacity-50"
      >
        {busy ? labels.saving : labels.save}
      </button>
      {msg === "ok" && <p className="text-xs text-mist">{labels.saved}</p>}
      {msg === "err" && <p className="text-xs text-danger-text">{labels.error}</p>}
    </form>
  );
}
