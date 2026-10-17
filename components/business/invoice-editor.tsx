"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatHTG } from "@/lib/sample-data";
import type { FacturationCopy } from "@/lib/facturation-copy";

type Item = {
  id: string;
  label: string;
  qty: number;
  unit_price_htg: number;
  line_total_htg: number;
  sort_order: number;
};
type Invoice = {
  id: string;
  invoice_number: string | null;
  status: string;
  subtotal_htg: number;
  total_htg: number;
  paid_htg: number;
  public_token: string;
  due_date: string | null;
  client_id: string;
};

const input =
  "w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-accent";

export function InvoiceEditor({
  invoice,
  items,
  clientName,
  shareUrl,
  labels,
}: {
  invoice: Invoice;
  items: Item[];
  clientName: string;
  shareUrl: string;
  labels: FacturationCopy;
}) {
  const router = useRouter();
  const isDraft = invoice.status === "draft";
  const remaining = invoice.total_htg - invoice.paid_htg;

  const [line, setLine] = useState({ label: "", qty: "1", unitPrice: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function addLine(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/business/invoices/${invoice.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: line.label,
          qty: Number(line.qty),
          unitPrice: Number(line.unitPrice),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? labels.lineError);
        return;
      }
      setLine({ label: "", qty: "1", unitPrice: "" });
      router.refresh();
    } catch {
      setError(labels.network);
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(itemId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/business/invoices/${invoice.id}/items?itemId=${itemId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? labels.removeError);
        return;
      }
      router.refresh();
    } catch {
      setError(labels.network);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!confirm(labels.sendConfirm)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/business/invoices/${invoice.id}/send`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? labels.sendError);
        return;
      }
      router.refresh();
    } catch {
      setError(labels.network);
    } finally {
      setBusy(false);
    }
  }

  async function voidInvoice() {
    if (!confirm(labels.voidConfirm)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/business/invoices/${invoice.id}/void`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? labels.voidError);
        return;
      }
      router.refresh();
    } catch {
      setError(labels.network);
    } finally {
      setBusy(false);
    }
  }

  function copyLink() {
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {invoice.invoice_number ?? labels.newInvoice}
          </h1>
          <p className="mt-1 text-sm text-mist">{labels.forClient.replace("{nom}", clientName)}</p>
        </div>
        <StatusBadge status={invoice.status} labels={labels} />
      </div>

      {/* Lignes */}
      <div className="glass mt-6 rounded-2xl p-6">
        {items.length === 0 ? (
          <p className="text-sm text-mist">{labels.noLines}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{it.label}</p>
                  <p className="text-xs text-mist">
                    {it.qty} × {formatHTG(it.unit_price_htg)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">
                    {formatHTG(it.line_total_htg)}
                  </span>
                  {isDraft && (
                    <button
                      onClick={() => removeLine(it.id)}
                      disabled={busy}
                      className="text-xs text-danger-text hover:underline disabled:opacity-50"
                      aria-label={labels.removeLine}
                    >
                      ×
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Ajout de ligne (brouillon uniquement) */}
        {isDraft && (
          <form onSubmit={addLine} className="mt-4 space-y-3 border-t border-line pt-4">
            <input
              className={input}
              placeholder={labels.lineDesc}
              aria-label={labels.lineDesc}
              value={line.label}
              onChange={(e) => setLine((l) => ({ ...l, label: e.target.value }))}
              required
            />
            <div className="flex gap-3">
              <input
                className={`${input} w-24`}
                type="number"
                min={1}
                placeholder={labels.qty}
                aria-label={labels.qty}
                value={line.qty}
                onChange={(e) => setLine((l) => ({ ...l, qty: e.target.value }))}
                required
              />
              <input
                className={input}
                type="number"
                min={0}
                placeholder={labels.unitPrice}
                aria-label={labels.unitPrice}
                value={line.unitPrice}
                onChange={(e) => setLine((l) => ({ ...l, unitPrice: e.target.value }))}
                required
              />
              <button
                disabled={busy}
                className="whitespace-nowrap rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:border-accent disabled:opacity-60"
              >
                {labels.addLine}
              </button>
            </div>
          </form>
        )}

        {/* Totaux */}
        <div className="mt-4 space-y-1 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-mist">{labels.total}</span>
            <span className="font-bold">{formatHTG(invoice.total_htg)}</span>
          </div>
          {invoice.paid_htg > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-mist">{labels.paid}</span>
                <span className="text-success-text">{formatHTG(invoice.paid_htg)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mist">{labels.remaining}</span>
                <span className="font-semibold text-accent">{formatHTG(remaining)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger-text">{error}</p>}

      {/* Actions */}
      <div className="mt-6 space-y-4">
        {isDraft ? (
          <button
            onClick={send}
            disabled={busy || invoice.total_htg <= 0}
            className="w-full rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand disabled:opacity-60"
          >
            {invoice.total_htg <= 0 ? labels.addLineFirst : labels.send}
          </button>
        ) : (
          <div className="glass rounded-2xl p-5">
            <p className="text-sm font-semibold">{labels.payLink}</p>
            <p className="mt-1 text-xs text-mist">{labels.payLinkHint}</p>
            <div className="mt-3 flex gap-2">
              <input readOnly value={shareUrl} aria-label={labels.payLink} className={`${input} font-mono text-xs`} />
              <button
                onClick={copyLink}
                className="whitespace-nowrap rounded-xl border border-line px-4 text-sm font-semibold hover:border-accent"
              >
                {copied ? labels.copied : labels.copy}
              </button>
            </div>
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm text-accent hover:underline"
            >
              {labels.openPortal}
            </a>
          </div>
        )}

        {/* Annulation possible tant que rien n'est encaissé */}
        {invoice.paid_htg === 0 && invoice.status !== "void" && (
          <button
            onClick={voidInvoice}
            disabled={busy}
            className="w-full rounded-xl border border-line px-5 py-2.5 text-sm text-danger-text hover:border-danger disabled:opacity-60"
          >
            {labels.voidInvoice}
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, labels }: { status: string; labels: FacturationCopy }) {
  const map: Record<string, string> = labels.status;
  return (
    <span className="whitespace-nowrap rounded-full border border-line px-3 py-1 text-xs text-mist">
      {map[status] ?? status}
    </span>
  );
}
