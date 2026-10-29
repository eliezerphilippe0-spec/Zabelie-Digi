"use client";

import { useState } from "react";
import type { ZoneOption } from "@/components/profile-form";

/**
 * « Ki kote ou livre ? » — les zones où le vendeur DÉCLARE livrer (0158).
 *
 * Tous les libellés arrivent en props, résolus côté serveur : un composant client
 * ne lit pas le cookie de langue (tests/i18n-client-discipline.test.ts).
 *
 * La zone ajoutée est la plus profonde choisie : un département seul veut dire
 * « tout le département » ; une commune sans quartier, « toute la commune ». Le
 * vendeur peut en cumuler plusieurs. Rien n'est écrit tant qu'il n'a pas
 * enregistré, et l'écran dit ce que la base a refusé (plafond, zone fermée).
 */
export type ServiceZonesLabels = {
  title: string;
  hint: string;
  depatman: string;
  komin: string;
  katye: string;
  allDepatman: string;
  allKomin: string;
  add: string;
  /** Contient `{zone}`. */
  remove: string;
  empty: string;
  /** Contient `{n}` et `{max}`. */
  count: string;
  save: string;
  saving: string;
  saved: string;
  errGeneric: string;
  errMax: string;
  errZone: string;
};

const INPUT = "w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-accent";

export function ServiceZonesEditor({ zones, initial, max, labels }: {
  zones: ZoneOption[];
  initial: string[];
  /** Plafond lu en base ; `null` s'il est illisible (alors aucun compteur). */
  max: number | null;
  labels: ServiceZonesLabels;
}) {
  const parId = new Map(zones.map((z) => [z.id, z]));
  const [choisies, setChoisies] = useState<string[]>(initial.filter((id) => parId.has(id)));
  const [zd, setZd] = useState("");
  const [zk, setZk] = useState("");
  const [zq, setZq] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);

  const komins = zones.filter((z) => z.level === "komin" && z.parent_id === zd);
  const katyes = zones.filter((z) => z.level === "katye" && z.parent_id === zk);
  // La zone visée : la plus profonde choisie.
  const cible = zq || zk || zd;
  const pleine = max !== null && choisies.length >= max;

  /** « Cap-Haïtien › Carénage » : le chemin complet, pour que deux quartiers homonymes se distinguent. */
  function chemin(id: string): string {
    const noms: string[] = [];
    for (let z = parId.get(id), garde = 0; z && garde < 4; z = z.parent_id ? parId.get(z.parent_id) : undefined, garde++) {
      noms.unshift(z.label);
    }
    return noms.join(" › ");
  }

  function ajouter() {
    if (!cible || pleine || choisies.includes(cible)) return;
    setChoisies([...choisies, cible]);
    setZk("");
    setZq("");
    setMessage(null);
  }

  async function enregistrer() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/seller/service-zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoneIds: choisies }),
      });
      if (res.ok) {
        setMessage({ texte: labels.saved, ok: true });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { code?: string };
      setMessage({
        texte: data.code === "service_zones_max" ? labels.errMax
          : data.code === "service_zones_zone" ? labels.errZone
          : labels.errGeneric,
        ok: false,
      });
    } catch {
      setMessage({ texte: labels.errGeneric, ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-sm leading-relaxed text-mist">{labels.hint}</p>

      {choisies.length === 0 ? (
        <p className="text-sm text-mist">{labels.empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label={labels.title}>
          {choisies.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 pl-3 pr-1 text-sm">
              <span>{chemin(id)}</span>
              <button
                type="button"
                onClick={() => { setChoisies(choisies.filter((c) => c !== id)); setMessage(null); }}
                aria-label={labels.remove.replace("{zone}", chemin(id))}
                className="inline-flex size-8 items-center justify-center rounded-full text-mist hover:text-cloud"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {max !== null ? (
        <p className="text-xs text-mist">{labels.count.replace("{n}", String(choisies.length)).replace("{max}", String(max))}</p>
      ) : null}

      <fieldset className="space-y-3 rounded-xl border border-line p-4" disabled={busy}>
        <select className={INPUT} value={zd} aria-label={labels.depatman}
          onChange={(e) => { setZd(e.target.value); setZk(""); setZq(""); }}>
          <option value="">{labels.depatman}</option>
          {zones.filter((z) => z.level === "depatman").map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
        </select>
        {zd && komins.length > 0 ? (
          <select className={INPUT} value={zk} aria-label={labels.komin}
            onChange={(e) => { setZk(e.target.value); setZq(""); }}>
            <option value="">{labels.allDepatman}</option>
            {komins.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
        ) : null}
        {zk && katyes.length > 0 ? (
          <select className={INPUT} value={zq} aria-label={labels.katye} onChange={(e) => setZq(e.target.value)}>
            <option value="">{labels.allKomin}</option>
            {katyes.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
        ) : null}
        <button type="button" onClick={ajouter} disabled={!cible || pleine || choisies.includes(cible)}
          className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-accent disabled:opacity-50">
          {labels.add}
        </button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={enregistrer} disabled={busy}
          className="min-h-11 rounded-xl bg-cloud px-5 py-2.5 text-sm font-semibold text-ink transition hover:opacity-90 disabled:opacity-60">
          {busy ? labels.saving : labels.save}
        </button>
        {message ? <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-mist" : "text-danger-text"}`}>{message.texte}</p> : null}
      </div>
    </div>
  );
}
