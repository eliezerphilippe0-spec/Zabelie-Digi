"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatHTG } from "@/lib/sample-data";
import type { FacturationCopy } from "@/lib/facturation-copy";

type Client = { id: string; name: string; phone: string | null; email: string | null };
type Invoice = {
  id: string;
  invoice_number: string | null;
  status: string;
  total_htg: number;
  paid_htg: number;
  created_at: string;
  client_id: string;
};

const STATUS_CLS: Record<string, string> = {
  draft: "text-mist",
  sent: "text-info-text",
  partially_paid: "text-warning-text",
  paid: "text-success-text",
  overdue: "text-danger-text",
  void: "text-mist",
};

const input =
  "w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-accent";

export function ProConsole({
  professional,
  clients,
  invoices,
  labels,
}: {
  professional: { id: string; displayName: string } | null;
  clients: Client[];
  invoices: Invoice[];
  labels: FacturationCopy;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Écran d'ouverture de l'espace pro ──
  const [displayName, setDisplayName] = useState("");
  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/business/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? labels.openError);
        return;
      }
      router.refresh();
    } catch {
      setError(labels.network);
    } finally {
      setBusy(false);
    }
  }

  if (!professional) {
    return (
      <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-bold">{labels.openTitle}</h2>
        <p className="mt-1 text-sm text-mist">{labels.openBody}</p>
        <form onSubmit={register} className="mt-4 space-y-3">
          <input
            className={input}
            placeholder={labels.namePlaceholder}
            aria-label={labels.namePlaceholder}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <button
            disabled={busy}
            className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand disabled:opacity-60"
          >
            {busy ? labels.opening : labels.openCta}
          </button>
          {error && <p className="text-sm text-danger-text">{error}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <NewInvoice clients={clients} labels={labels} />
      <ClientsCard clients={clients} labels={labels} />
      <InvoicesCard invoices={invoices} clients={clients} labels={labels} />
    </div>
  );
}

/** Créer une facture : choisir un client (ou en ajouter un) → brouillon. */
function NewInvoice({ clients, labels }: { clients: Client[]; labels: FacturationCopy }) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError(labels.chooseClientError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/business/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? labels.createError);
        return;
      }
      router.push(`/pro/facture/${data.invoiceId}`);
    } catch {
      setError(labels.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-6">
      <h2 className="text-lg font-bold">{labels.newInvoice}</h2>
      {clients.length === 0 ? (
        <p className="mt-2 text-sm text-mist">{labels.addClientFirst}</p>
      ) : (
        <form onSubmit={create} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <select
            className={input}
            aria-label={labels.chooseClient}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">{labels.chooseClient}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            disabled={busy}
            className="whitespace-nowrap rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand disabled:opacity-60"
          >
            {busy ? "…" : labels.create}
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-danger-text">{error}</p>}
    </div>
  );
}

/** Répertoire clients + ajout rapide. */
function ClientsCard({ clients, labels }: { clients: Client[]; labels: FacturationCopy }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/business/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? labels.addError);
        return;
      }
      setForm({ name: "", phone: "", email: "" });
      setOpen(false);
      router.refresh();
    } catch {
      setError(labels.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{labels.clients}</h2>
        <button
          onClick={() => setOpen((o) => !o)}
          className="min-h-11 text-sm text-accent hover:underline"
        >
          {open ? labels.close : labels.add}
        </button>
      </div>

      {open && (
        <form onSubmit={add} className="mt-4 space-y-3">
          <input
            className={input}
            placeholder={labels.clientName}
            aria-label={labels.clientName}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <div className="flex gap-3">
            <input
              className={input}
              placeholder={labels.phoneOpt}
              aria-label={labels.phoneOpt}
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <input
              className={input}
              placeholder={labels.emailOpt}
              aria-label={labels.emailOpt}
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <button
            disabled={busy}
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand disabled:opacity-60"
          >
            {busy ? labels.adding : labels.save}
          </button>
          {error && <p className="text-sm text-danger-text">{error}</p>}
        </form>
      )}

      {clients.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {clients.map((c) => (
            <li key={c.id} className="flex justify-between py-2 text-sm">
              <span>{c.name}</span>
              <span className="text-mist">{c.phone ?? c.email ?? ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Liste des factures. */
function InvoicesCard({
  invoices,
  clients,
  labels,
}: {
  invoices: Invoice[];
  clients: Client[];
  labels: FacturationCopy;
}) {
  const clientName = (id: string) =>
    clients.find((c) => c.id === id)?.name ?? labels.clientFallback;

  if (invoices.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 text-sm text-mist">{labels.noInvoices}</div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6">
      <h2 className="text-lg font-bold">{labels.invoices}</h2>
      <ul className="mt-4 divide-y divide-line">
        {invoices.map((inv) => {
          const statut = labels.status[inv.status as keyof FacturationCopy["status"]] ?? inv.status;
          return (
            <li key={inv.id}>
              <Link
                href={`/pro/facture/${inv.id}`}
                className="flex items-center justify-between gap-3 py-3 hover:opacity-80"
              >
                <div>
                  <p className="text-sm font-medium">
                    {inv.invoice_number ?? labels.status.draft}
                    <span className="text-mist"> · {clientName(inv.client_id)}</span>
                  </p>
                  <p className={`text-xs ${STATUS_CLS[inv.status] ?? "text-mist"}`}>{statut}</p>
                </div>
                <span className="text-sm font-semibold">
                  {formatHTG(inv.total_htg)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
