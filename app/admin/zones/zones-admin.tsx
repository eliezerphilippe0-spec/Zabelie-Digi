"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Le poste de travail zones de l'admin (PR-Z4). Français assumé — outil
 * interne, `app/admin` est hors du cliquet i18n. Trois gestes, tous vers
 * `/api/admin/zones` qui journalise chaque acte (0055) :
 *   - trancher une demande de katye (accepter / refuser, note facultative) ;
 *   - ouvrir / fermer une zone ;
 *   - créer une zone à la main (katye sous une komin, ou komin sous un
 *     depatman — le garde ZB069 de la base a le dernier mot).
 */

export type ZoneRow = {
  id: string;
  parent_id: string | null;
  level: "depatman" | "komin" | "katye";
  slug: string;
  code: string | null;
  label_kr: string;
  label_fr: string;
  is_active: boolean;
};

export type DemandeRow = {
  id: string;
  komin_id: string;
  nom_propose: string;
  status: string;
  created_at: string;
  requester: string;
};

export function ZonesAdmin({ zones, demandes }: { zones: ZoneRow[]; demandes: DemandeRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [creation, setCreation] = useState({ parentId: "", labelKr: "", labelFr: "" });

  const parId = new Map(zones.map((z) => [z.id, z]));
  const nomKomin = (id: string) => {
    const k = parId.get(id);
    const d = k?.parent_id ? parId.get(k.parent_id) : undefined;
    return k ? `${k.label_fr}${d ? ` (${d.label_fr})` : ""}` : id;
  };

  async function poste(payload: Record<string, unknown>, cle: string) {
    setBusy(cle);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Échec (${res.status})`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Échec.");
    } finally {
      setBusy(null);
    }
  }

  const bouton =
    "rounded-lg border border-line px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50";
  const champ =
    "rounded-lg border border-line bg-ink/40 px-3 py-1.5 text-xs outline-none focus:border-violet";

  return (
    <div className="mt-6 space-y-10">
      {msg && (
        <p className="rounded-xl border border-magenta/40 px-4 py-3 text-xs text-magenta">{msg}</p>
      )}

      {/* ── Demandes en attente — la file de modération (Z-C) ─────────────── */}
      <section>
        <h2 className="text-lg font-semibold">
          Demandes de quartier en attente ({demandes.length})
        </h2>
        {demandes.length === 0 ? (
          <p className="mt-2 text-sm text-mist">
            Aucune demande. Les vendeurs proposent un katye manquant depuis leur profil.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {demandes.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/60 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-cloud">« {d.nom_propose} »</p>
                  <p className="text-xs text-mist">
                    sous {nomKomin(d.komin_id)} · demandé le{" "}
                    {new Date(d.created_at).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <input
                  className={champ}
                  placeholder="Note (facultative)"
                  value={notes[d.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                />
                <button
                  className={`${bouton} text-cloud hover:border-violet`}
                  disabled={busy !== null}
                  onClick={() =>
                    poste(
                      { action: "decide", requestId: d.id, decision: "accept", note: notes[d.id] },
                      d.id,
                    )
                  }
                >
                  {busy === d.id ? "…" : "Accepter — le katye naît"}
                </button>
                <button
                  className={`${bouton} text-magenta hover:bg-magenta/10`}
                  disabled={busy !== null}
                  onClick={() =>
                    poste(
                      { action: "decide", requestId: d.id, decision: "reject", note: notes[d.id] },
                      d.id,
                    )
                  }
                >
                  Refuser
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── La hiérarchie, actives ET fermées ─────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold">Hiérarchie ({zones.length} zones)</h2>
        <ul className="mt-3 space-y-1">
          {zones
            .filter((z) => z.level === "depatman")
            .map((dep) => (
              <li key={dep.id}>
                <LigneZone zone={dep} busy={busy} onToggle={poste} retrait={0} />
                {zones
                  .filter((k) => k.parent_id === dep.id)
                  .map((k) => (
                    <div key={k.id}>
                      <LigneZone zone={k} busy={busy} onToggle={poste} retrait={1} />
                      {zones
                        .filter((q) => q.parent_id === k.id)
                        .map((q) => (
                          <LigneZone key={q.id} zone={q} busy={busy} onToggle={poste} retrait={2} />
                        ))}
                    </div>
                  ))}
              </li>
            ))}
        </ul>
      </section>

      {/* ── Création manuelle ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold">Créer une zone</h2>
        <p className="mt-1 text-xs text-mist">
          Komin sous un depatman, katye sous une komin — le niveau se déduit du parent, le garde
          ZB069 a le dernier mot. Le slug naît du nom français.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            className={champ}
            value={creation.parentId}
            onChange={(e) => setCreation((c) => ({ ...c, parentId: e.target.value }))}
          >
            <option value="">Parent…</option>
            {zones
              .filter((z) => z.level !== "katye")
              .map((z) => (
                <option key={z.id} value={z.id}>
                  {z.level === "depatman" ? "" : "— "}
                  {z.label_fr}
                </option>
              ))}
          </select>
          <input
            className={champ}
            placeholder="Nom kreyòl"
            value={creation.labelKr}
            onChange={(e) => setCreation((c) => ({ ...c, labelKr: e.target.value }))}
          />
          <input
            className={champ}
            placeholder="Nom français"
            value={creation.labelFr}
            onChange={(e) => setCreation((c) => ({ ...c, labelFr: e.target.value }))}
          />
          <button
            className={`${bouton} text-cloud hover:border-violet`}
            disabled={busy !== null || !creation.parentId || !creation.labelKr || !creation.labelFr}
            onClick={() => {
              const parent = parId.get(creation.parentId);
              poste(
                {
                  action: "create_zone",
                  level: parent?.level === "depatman" ? "komin" : "katye",
                  parentId: creation.parentId,
                  slug: creation.labelFr
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, ""),
                  labelKr: creation.labelKr,
                  labelFr: creation.labelFr,
                },
                "creation",
              ).then(() => setCreation({ parentId: "", labelKr: "", labelFr: "" }));
            }}
          >
            {busy === "creation" ? "…" : "Créer"}
          </button>
        </div>
      </section>
    </div>
  );
}

function LigneZone({
  zone,
  busy,
  onToggle,
  retrait,
}: {
  zone: ZoneRow;
  busy: string | null;
  onToggle: (payload: Record<string, unknown>, cle: string) => Promise<void>;
  retrait: number;
}) {
  return (
    <div
      className="flex items-center gap-3 py-1 text-sm"
      style={{ paddingLeft: `${retrait * 1.5}rem` }}
    >
      <span className={zone.is_active ? "text-cloud" : "text-mist line-through"}>
        {zone.label_fr}
        <span className="ml-2 text-xs text-mist">
          {zone.label_kr}
          {zone.code ? ` · ${zone.code}` : ""}
        </span>
      </span>
      <button
        className="rounded-lg border border-line px-2 py-0.5 text-xs text-mist transition hover:border-violet hover:text-cloud disabled:opacity-50"
        disabled={busy !== null}
        onClick={() =>
          onToggle({ action: "set_active", zoneId: zone.id, active: !zone.is_active }, zone.id)
        }
      >
        {busy === zone.id ? "…" : zone.is_active ? "Fermer" : "Rouvrir"}
      </button>
    </div>
  );
}
