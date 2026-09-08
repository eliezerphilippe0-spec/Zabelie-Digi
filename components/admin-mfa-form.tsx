"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { enrollAdminMfa, verifyAdminMfa } from "@/app/securite/actions";

export type MfaLabels = {
  setup: string; scan: string; secret: string; code: string; verify: string;
  busy: string; error: string; factor: string; recovery: string; back: string;
};

type Setup = { factorId: string; qr: string; secret: string };

export function AdminMfaForm({ factors, labels }: {
  factors: { id: string; name: string }[];
  labels: MfaLabels;
}) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [factorId, setFactorId] = useState(factors[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);

  async function enroll() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await enrollAdminMfa();
      if (result.error) { setError(true); return; }
      setSetup(result);
      setFactorId(result.factorId);
    } catch { setError(true); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await verifyAdminMfa(factorId, code);
      setCode("");
      if (result.error) { setError(true); return; }
      setSetup(null);
      // Navigation complète : ne pas réutiliser un rendu admin AAL1 en cache.
      window.location.replace("/admin");
    } catch { setError(true); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <div className="space-y-6">
    {factors.length === 0 && !setup && <button type="button" onClick={enroll} disabled={busy} className="w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand hover:opacity-90 disabled:opacity-60">
      {busy ? labels.busy : labels.setup}
    </button>}
    {setup && <div className="space-y-4">
      <p>{labels.scan}</p>
      {/* SVG retourné par Auth, rendu en image isolée : jamais du HTML injecté. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr.startsWith("data:image/svg+xml;") ? setup.qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qr)}`} alt={labels.scan} width={240} height={240} className="mx-auto bg-white p-3" />
      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer">{labels.secret}</summary>
        <code className="mt-3 block break-all select-all">{setup.secret}</code>
      </details>
    </div>}
    {factorId && <form onSubmit={verify} className="space-y-4">
      {factors.length > 1 && <div>
        <label htmlFor="mfa-factor" className="mb-2 block font-medium">{labels.factor}</label>
        <select id="mfa-factor" value={factorId} onChange={(e) => setFactorId(e.target.value)} disabled={busy} className="w-full rounded-xl border border-line bg-ink p-3">
          {factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.name}</option>)}
        </select>
      </div>}
      <div>
        <label htmlFor="mfa-code" className="mb-2 block font-medium">{labels.code}</label>
        <input id="mfa-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} aria-describedby={error ? "mfa-error" : undefined} className="w-full rounded-xl border border-line bg-ink p-3 text-lg tracking-widest" />
      </div>
      <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand hover:opacity-90 disabled:opacity-60">{busy ? labels.busy : labels.verify}</button>
    </form>}
    {error && <p id="mfa-error" role="alert" className="text-sm text-danger-text">{labels.error}</p>}
    <p className="text-sm text-mist">{labels.recovery}</p>
    <Link href="/" className="inline-block text-sm underline">{labels.back}</Link>
  </div>;
}
