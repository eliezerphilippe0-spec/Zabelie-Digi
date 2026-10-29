"use client";

import { useState } from "react";
import type { ZoneOption } from "@/components/profile-form";

/**
 * « Ki kote ou livre ? » — les zones où le vendeur DÉCLARE livrer (0158), avec pour
 * chacune les frais et le délai qu'il ANNONCE et une pause (0164).
 *
 * Tous les libellés arrivent en props, résolus côté serveur : un composant client
 * ne lit pas le cookie de langue (tests/i18n-client-discipline.test.ts).
 *
 * La zone ajoutée est la plus profonde choisie : un département seul veut dire
 * « tout le département » ; une commune sans quartier, « toute la commune ». Le
 * vendeur peut en cumuler plusieurs. Rien n'est écrit tant qu'il n'a pas
 * enregistré, et l'écran dit ce que la base a refusé (plafond, zone fermée, pause).
 *
 * ⚠️ Les frais annoncés ne sont PAS ajoutés au paiement : le texte d'aide le dit. Les
 * champs sont facultatifs — vide = « à convenir ». La date d'une pause n'est jamais
 * calculée ici : le navigateur envoie « suspendre N jours », le serveur pose la date.
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
  fee: string;
  delay: string;
  /** Rappel : information affichée, hors du paiement Zabelie. */
  conditionsNote: string;
  pauseLabel: string;
  pauseNone: string;
  /** Contient `{n}`. */
  pauseDays: string;
  /** Contient `{date}`. */
  pausedUntil: string;
  resume: string;
  errPause: string;
  errValue: string;
  save: string;
  saving: string;
  saved: string;
  errGeneric: string;
  errMax: string;
  errZone: string;
};

const INPUT = "w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-accent";
const PETIT = "min-h-11 w-full rounded-lg border border-line bg-ink/40 px-3 text-sm outline-none focus:border-accent";

/** Une zone déclarée telle que le serveur la rend : `pausedUntil` n'est renseignée que si la pause est EN COURS. */
export type ZoneDeclaree = { zoneId: string; feeHtg: number | null; delayHours: number | null; pausedUntil: string | null };

/** Durées de pause proposées (jours) : le plafond commercial est en base (ZB164), jamais ici. */
const DUREES_PAUSE = [3, 7, 14, 30] as const;
type Pause = { action: "keep" } | { action: "clear" } | { action: "set"; days: number };
type Entree = { zoneId: string; fee: string; delay: string; pausedUntil: string | null; pause: Pause };

const entree = (z: ZoneDeclaree): Entree => ({
  zoneId: z.zoneId, fee: z.feeHtg === null ? "" : String(z.feeHtg), delay: z.delayHours === null ? "" : String(z.delayHours),
  pausedUntil: z.pausedUntil, pause: { action: "keep" },
});
const chiffres = (v: string) => v.replace(/\D/g, "").slice(0, 6);

export function ServiceZonesEditor({ zones, initial, max, labels, locale }: {
  zones: ZoneOption[];
  initial: ZoneDeclaree[];
  /** Plafond lu en base ; `null` s'il est illisible (alors aucun compteur). */
  max: number | null;
  labels: ServiceZonesLabels;
  /** Pour la date d'une pause en cours (`fr-HT`, `en`, `es`…), résolue côté serveur. */
  locale: string;
}) {
  const parId = new Map(zones.map((z) => [z.id, z]));
  const [choisies, setChoisies] = useState<Entree[]>(initial.filter((z) => parId.has(z.zoneId)).map(entree));
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
  const maj = (id: string, patch: Partial<Entree>) => {
    setChoisies((liste) => liste.map((c) => (c.zoneId === id ? { ...c, ...patch } : c)));
    setMessage(null);
  };

  /** « Cap-Haïtien › Carénage » : le chemin complet, pour que deux quartiers homonymes se distinguent. */
  function chemin(id: string): string {
    const noms: string[] = [];
    for (let z = parId.get(id), garde = 0; z && garde < 4; z = z.parent_id ? parId.get(z.parent_id) : undefined, garde++) {
      noms.unshift(z.label);
    }
    return noms.join(" › ");
  }

  function ajouter() {
    if (!cible || pleine || choisies.some((c) => c.zoneId === cible)) return;
    setChoisies([...choisies, { zoneId: cible, fee: "", delay: "", pausedUntil: null, pause: { action: "clear" } }]);
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
        body: JSON.stringify({
          zones: choisies.map((c) => ({
            zoneId: c.zoneId,
            feeHtg: c.fee === "" ? null : Number(c.fee),
            delayHours: c.delay === "" ? null : Number(c.delay),
            pause: c.pause,
          })),
        }),
      });
      if (res.ok) {
        setMessage({ texte: labels.saved, ok: true });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { code?: string };
      setMessage({
        texte: data.code === "service_zones_max" ? labels.errMax
          : data.code === "service_zones_zone" ? labels.errZone
          : data.code === "service_zones_pause" ? labels.errPause
          : data.code === "service_zones_valeur" ? labels.errValue
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
        <>
        <ul className="space-y-3" aria-label={labels.title}>
          {choisies.map((c) => (
            <li key={c.zoneId} className="space-y-2 rounded-xl border border-line bg-surface-2 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{chemin(c.zoneId)}</span>
                <button
                  type="button"
                  onClick={() => { setChoisies(choisies.filter((x) => x.zoneId !== c.zoneId)); setMessage(null); }}
                  aria-label={labels.remove.replace("{zone}", chemin(c.zoneId))}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-mist hover:text-cloud"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-mist">
                  <span>{labels.fee}</span>
                  <input className={PETIT} inputMode="numeric" autoComplete="off" value={c.fee} disabled={busy}
                    onChange={(e) => maj(c.zoneId, { fee: chiffres(e.target.value) })} />
                </label>
                <label className="block text-xs text-mist">
                  <span>{labels.delay}</span>
                  <input className={PETIT} inputMode="numeric" autoComplete="off" value={c.delay} disabled={busy}
                    onChange={(e) => maj(c.zoneId, { delay: chiffres(e.target.value) })} />
                </label>
              </div>
              {c.pausedUntil && c.pause.action === "keep" ? (
                <p className="flex flex-wrap items-center gap-2 text-xs text-mist">
                  <span>{labels.pausedUntil.replace("{date}", new Date(c.pausedUntil).toLocaleDateString(locale))}</span>
                  <button type="button" onClick={() => maj(c.zoneId, { pause: { action: "clear" } })}
                    className="inline-flex min-h-11 items-center font-semibold text-accent underline">{labels.resume}</button>
                </p>
              ) : (
                <label className="block text-xs text-mist">
                  <span>{labels.pauseLabel}</span>
                  <select className={PETIT} disabled={busy}
                    value={c.pause.action === "set" ? String(c.pause.days) : "0"}
                    onChange={(e) => maj(c.zoneId, { pause: e.target.value === "0" ? { action: "clear" } : { action: "set", days: Number(e.target.value) } })}>
                    <option value="0">{labels.pauseNone}</option>
                    {DUREES_PAUSE.map((n) => <option key={n} value={n}>{labels.pauseDays.replace("{n}", String(n))}</option>)}
                  </select>
                </label>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-mist">{labels.conditionsNote}</p>
        </>
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
        <button type="button" onClick={ajouter} disabled={!cible || pleine || choisies.some((c) => c.zoneId === cible)}
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
