"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatHTG } from "@/lib/sample-data";
import { ROUNDING_IN_FORCE } from "@/lib/commission";

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

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "text-mist" },
  sent: { label: "Envoyée", cls: "text-info-text" },
  partially_paid: { label: "Partielle", cls: "text-warning-text" },
  paid: { label: "Réglée", cls: "text-success-text" },
  overdue: { label: "En retard", cls: "text-danger-text" },
  void: { label: "Annulée", cls: "text-mist" },
};

const input =
  "w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-violet";

export function ProConsole({
  professional,
  clients,
  invoices,
}: {
  professional: { id: string; displayName: string } | null;
  clients: Client[];
  invoices: Invoice[];
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
        setError(data.error ?? "Ouverture impossible.");
        return;
      }
      router.refresh();
    } catch {
      setError("Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!professional) {
    return (
      <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-bold">Ouvre ton espace pro</h2>
        <p className="mt-1 text-sm text-mist">
          Facture tes clients hors marketplace et encaisse en MonCash. Commission
          Zabelie&nbsp;: 10&nbsp;% sur chaque paiement —{" "}
          {ROUNDING_IN_FORCE === "floor"
            ? "l'arrondi est toujours en ta faveur"
            : "arrondie à la gourde la plus proche"}{" "}
          — versé aussitôt sur ton solde.
        </p>
        <form onSubmit={register} className="mt-4 space-y-3">
          <input
            className={input}
            placeholder="Nom affiché sur tes factures (ex. Studio Marie)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <button
            disabled={busy}
            className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand disabled:opacity-60"
          >
            {busy ? "Ouverture…" : "Ouvrir mon espace pro"}
          </button>
          {error && <p className="text-sm text-danger-text">{error}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <NewInvoice clients={clients} />
      <ClientsCard clients={clients} />
      <InvoicesCard invoices={invoices} clients={clients} />
    </div>
  );
}

/** Créer une facture : choisir un client (ou en ajouter un) → brouillon. */
function NewInvoice({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError("Choisis un client.");
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
        setError(data.error ?? "Création impossible.");
        return;
      }
      router.push(`/pro/facture/${data.invoiceId}`);
    } catch {
      setError("Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-6">
      <h2 className="text-lg font-bold">Nouvelle facture</h2>
      {clients.length === 0 ? (
        <p className="mt-2 text-sm text-mist">
          Ajoute d&apos;abord un client ci-dessous.
        </p>
      ) : (
        <form onSubmit={create} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <select
            className={input}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">— Choisir un client —</option>
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
            {busy ? "…" : "Créer"}
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-danger-text">{error}</p>}
    </div>
  );
}

/** Répertoire clients + ajout rapide. */
function ClientsCard({ clients }: { clients: Client[] }) {
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
        setError(data.error ?? "Ajout impossible.");
        return;
      }
      setForm({ name: "", phone: "", email: "" });
      setOpen(false);
      router.refresh();
    } catch {
      setError("Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Mes clients</h2>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-sm text-accent hover:underline"
        >
          {open ? "Fermer" : "+ Ajouter"}
        </button>
      </div>

      {open && (
        <form onSubmit={add} className="mt-4 space-y-3">
          <input
            className={input}
            placeholder="Nom du client"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <div className="flex gap-3">
            <input
              className={input}
              placeholder="Téléphone (optionnel)"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <input
              className={input}
              placeholder="Email (optionnel)"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <button
            disabled={busy}
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand disabled:opacity-60"
          >
            {busy ? "Ajout…" : "Enregistrer"}
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
}: {
  invoices: Invoice[];
  clients: Client[];
}) {
  const clientName = (id: string) =>
    clients.find((c) => c.id === id)?.name ?? "Client";

  if (invoices.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 text-sm text-mist">
        Aucune facture pour l&apos;instant.
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6">
      <h2 className="text-lg font-bold">Mes factures</h2>
      <ul className="mt-4 divide-y divide-line">
        {invoices.map((inv) => {
          const s = STATUS[inv.status] ?? { label: inv.status, cls: "text-mist" };
          return (
            <li key={inv.id}>
              <Link
                href={`/pro/facture/${inv.id}`}
                className="flex items-center justify-between gap-3 py-3 hover:opacity-80"
              >
                <div>
                  <p className="text-sm font-medium">
                    {inv.invoice_number ?? "Brouillon"}
                    <span className="text-mist"> · {clientName(inv.client_id)}</span>
                  </p>
                  <p className={`text-xs ${s.cls}`}>{s.label}</p>
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
