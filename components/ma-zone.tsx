"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ZoneOption } from "@/components/profile-form";

/**
 * « Ma zone » — l'acheteur mémorise sa zone APPROXIMATIVE (docs/77 §11).
 *
 * Le clic « Mémoriser ma zone » pose le cookie `zabelie_zone` sur CET appareil
 * (`/api/zone`) ; « Oublier ma zone » l'efface. Rien n'est posé avant le clic, et
 * le cookie ne contient qu'un identifiant de zone — jamais une position précise.
 *
 * Tous les libellés arrivent en props, résolus côté serveur : un composant client
 * ne lit pas le cookie de langue (tests/i18n-client-discipline.test.ts).
 */
export type MaZoneLabels = {
  titre: string;
  aide: string;
  /** Contient `{zone}`. */
  actuelle: string;
  memoriser: string;
  enCours: string;
  oublier: string;
  filtrer: string;
  erreur: string;
  depatman: string;
  komin: string;
  katye: string;
  toutDepatman: string;
  toutKomin: string;
};

const SELECT = "min-h-11 w-full rounded-xl border border-line bg-ink/40 px-3 text-base outline-none focus:border-accent sm:w-auto";

export function MaZone({ zones, courante, hrefCatalogue, labels }: {
  zones: ZoneOption[];
  /** La zone déjà mémorisée, libellé déjà localisé. */
  courante: { id: string; label: string } | null;
  /** Lien vers le catalogue filtré sur cette zone ; absent s'il n'a pas de sens ici. */
  hrefCatalogue?: string;
  labels: MaZoneLabels;
}) {
  const router = useRouter();
  const [zd, setZd] = useState("");
  const [zk, setZk] = useState("");
  const [zq, setZq] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(false);
  const komins = zones.filter((z) => z.level === "komin" && z.parent_id === zd);
  const katyes = zones.filter((z) => z.level === "katye" && z.parent_id === zk);
  // La zone mémorisée est la plus profonde choisie.
  const cible = zq || zk || zd;

  async function appeler(methode: "POST" | "DELETE") {
    if (busy) return;
    setBusy(true);
    setErreur(false);
    try {
      const res = await fetch("/api/zone", {
        method: methode,
        headers: { "Content-Type": "application/json" },
        body: methode === "POST" ? JSON.stringify({ zoneId: cible }) : undefined,
      });
      if (!res.ok) { setErreur(true); return; }
      setZd(""); setZk(""); setZq("");
      router.refresh();
    } catch {
      setErreur(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={labels.titre} className="rounded-2xl border border-line bg-surface/60 p-4">
      <h2 className="text-sm font-semibold">{labels.titre}</h2>
      {courante ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-accent">{labels.actuelle.replace("{zone}", courante.label)}</p>
          {hrefCatalogue ? (
            <Link href={hrefCatalogue} className="inline-flex min-h-11 items-center text-sm underline">{labels.filtrer}</Link>
          ) : null}
          <button type="button" onClick={() => void appeler("DELETE")} disabled={busy}
            className="min-h-11 rounded-xl border border-line px-4 text-sm disabled:opacity-60">{labels.oublier}</button>
        </div>
      ) : (
        <>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-mist">{labels.aide}</p>
          <fieldset className="mt-3 flex flex-wrap items-center gap-2" disabled={busy}>
            <select className={SELECT} value={zd} aria-label={labels.depatman}
              onChange={(e) => { setZd(e.target.value); setZk(""); setZq(""); }}>
              <option value="">{labels.depatman}</option>
              {zones.filter((z) => z.level === "depatman").map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
            </select>
            {zd && komins.length > 0 ? (
              <select className={SELECT} value={zk} aria-label={labels.komin}
                onChange={(e) => { setZk(e.target.value); setZq(""); }}>
                <option value="">{labels.toutDepatman}</option>
                {komins.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
              </select>
            ) : null}
            {zk && katyes.length > 0 ? (
              <select className={SELECT} value={zq} aria-label={labels.katye} onChange={(e) => setZq(e.target.value)}>
                <option value="">{labels.toutKomin}</option>
                {katyes.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
              </select>
            ) : null}
            <button type="button" onClick={() => void appeler("POST")} disabled={!cible || busy}
              className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-accent disabled:opacity-50">
              {busy ? labels.enCours : labels.memoriser}
            </button>
          </fieldset>
        </>
      )}
      {erreur ? <p role="alert" className="mt-2 text-sm text-danger-text">{labels.erreur}</p> : null}
    </section>
  );
}
