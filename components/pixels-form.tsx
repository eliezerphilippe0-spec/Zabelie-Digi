"use client";

import { useState } from "react";

type Valeurs = { meta: string; google: string; tiktok: string };
type Labels = Record<"meta" | "google" | "tiktok" | "metaHint" | "googleHint" | "tiktokHint" | "save" | "saving" | "saved" | "error", string>;

/** Les trois identifiants de pixel du vendeur. Vide = pixel retiré. */
export function PixelsForm({ initial, labels }: { initial: Valeurs; labels: Labels }) {
  const [v, setV] = useState<Valeurs>(initial);
  const [etat, setEtat] = useState<"repos" | "envoi" | "ok" | "erreur">("repos");
  const [message, setMessage] = useState("");

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEtat("envoi");
    try {
      const res = await fetch("/api/account/pixels", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      const corps = await res.json().catch(() => ({}));
      if (!res.ok) { setEtat("erreur"); setMessage(corps.error ?? labels.error); return; }
      setV({ meta: corps.meta ?? "", google: corps.google ?? "", tiktok: corps.tiktok ?? "" });
      setEtat("ok");
    } catch { setEtat("erreur"); setMessage(labels.error); }
  }

  const champ = (cle: keyof Valeurs, aide: string, placeholder: string) => (
    <label className="flex flex-col gap-1 text-sm">
      {labels[cle]}
      <input value={v[cle]} onChange={(e) => { setV({ ...v, [cle]: e.target.value }); setEtat("repos"); }} placeholder={placeholder}
        autoComplete="off" spellCheck={false} maxLength={30} className="min-h-11 rounded-xl border border-line bg-ink px-3 font-mono text-base" />
      <span className="text-xs text-mist">{aide}</span>
    </label>
  );

  return (
    <form onSubmit={enregistrer} className="mt-6 grid gap-4">
      {champ("meta", labels.metaHint, "123456789012345")}
      {champ("google", labels.googleHint, "G-XXXXXXXXXX")}
      {champ("tiktok", labels.tiktokHint, "C4ABCDEF0123456789AB")}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={etat === "envoi"} className="bouton inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-60">
          {etat === "envoi" ? labels.saving : labels.save}
        </button>
        {etat === "ok" && <span role="status" className="text-sm text-success-text">{labels.saved}</span>}
        {etat === "erreur" && <span role="alert" className="text-sm text-danger-text">{message}</span>}
      </div>
    </form>
  );
}
