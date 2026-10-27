"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { appelAvecSession, appelSession, type IssueAppel } from "@/lib/appel-session";

export type CouponItem = {
  id: string;
  code: string;
  percent: number;
  product_id: string | null;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  active: boolean;
};

/** Une ligne affichée : le décompte d'usages arrive accordé par la page (`tn`). */
export type CouponLigne = CouponItem & { usage: string };

export type CouponManagerLabels = {
  code: string;
  percent: string;
  maxUses: string;
  create: string;
  creating: string;
  deactivate: string;
  reactivate: string;
  toggling: string;
  /** La requête n'est jamais partie. */
  network: string;
  /** Refus sans phrase lisible du serveur. */
  failed: string;
};

/** La phrase d'un appel qui n'a pas abouti : réseau et refus ne se confondent pas. */
function phraseEchec(issue: IssueAppel<unknown>, labels: CouponManagerLabels): string {
  if (issue.etat === "reseau") return labels.network;
  if (issue.etat === "refus") return issue.error ?? labels.failed;
  return labels.failed;
}

/**
 * Codes promo du vendeur (V-13) : création + activation/désactivation.
 * Le vendeur partage son code sur WhatsApp ; la validation et la remise
 * réelles se font côté serveur au checkout.
 *
 * Audit du 2026-10-27 (M4) : libellés traduits par props ; la bascule avait
 * `.catch(() => undefined)` puis `router.refresh()` — un échec était avalé et
 * l'écran se rechargeait comme si de rien n'était. Elle a désormais un état
 * d'attente PAR LIGNE (bouton désactivé jusqu'à l'affichage du nouvel état)
 * et une erreur traduite sous la ligne concernée.
 */
export function ZabelieCouponManager({
  coupons,
  actorId,
  labels,
}: {
  coupons: CouponLigne[];
  actorId: string;
  labels: CouponManagerLabels;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState(10);
  const [maxUses, setMaxUses] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bascule : attente et erreur portent sur UNE ligne, jamais sur la liste.
  const [enCours, setEnCours] = useState<ReadonlySet<string>>(() => new Set());
  const [erreurs, setErreurs] = useState<Readonly<Record<string, string>>>({});
  const [rafraichit, demarrerRafraichissement] = useTransition();
  const [ligneRafraichie, setLigneRafraichie] = useState<string | null>(null);

  // Bouton occupé = `aria-disabled`, jamais `disabled` : un bouton désactivé
  // pendant l'appel PERD le focus (il tombe sur `body`), et après un échec le
  // clavier ne sait plus où il est. Le double envoi est donc refusé ICI.
  const occupee = (id: string) => enCours.has(id) || (rafraichit && ligneRafraichie === id);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const issue = await appelSession("/api/coupons", {
      code,
      percent,
      maxUses: maxUses ? Number(maxUses) : null,
      expectedActorId: actorId,
    });
    if (issue.etat === "connexion") {
      router.push(issue.vers);
      return;
    }
    if (issue.etat !== "ok") {
      setError(phraseEchec(issue, labels));
      setLoading(false);
      return;
    }
    setCode("");
    setMaxUses("");
    setLoading(false);
    router.refresh();
  }

  async function toggle(id: string, active: boolean) {
    if (occupee(id)) return;
    setEnCours((s) => new Set(s).add(id));
    setErreurs((e) => {
      const reste = { ...e };
      delete reste[id];
      return reste;
    });
    const issue = await appelAvecSession("/api/coupons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    if (issue.etat === "connexion") {
      router.push(issue.vers);
      return;
    }
    if (issue.etat === "ok") {
      // L'attente dure jusqu'à l'affichage du nouvel état, pas seulement
      // jusqu'à la réponse : sans quoi le bouton se réactive sur l'ANCIEN
      // libellé et invite un second clic qui annulerait le premier.
      setLigneRafraichie(id);
      demarrerRafraichissement(() => router.refresh());
    } else {
      setErreurs((e) => ({ ...e, [id]: phraseEchec(issue, labels) }));
    }
    setEnCours((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  return (
    <div>
      <form onSubmit={create} aria-busy={loading} className="flex flex-wrap items-end gap-2">
        {/* Pleine largeur sur téléphone : à 360 px, partagé avec deux champs, il ne montrait que « PRO ». */}
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <label className="text-xs text-mist" htmlFor="cp-code">{labels.code}</label>
          <input
            id="cp-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="PROMO50"
            maxLength={24}
            required
            className="code-lisible mt-1 min-h-11 w-full rounded-xl border border-line bg-surface/60 px-3 py-2 text-sm uppercase text-cloud placeholder:normal-case placeholder:text-mist focus:border-brand/60 focus:outline-none"
          />
        </div>
        <div className="w-24">
          <label className="text-xs text-mist" htmlFor="cp-pct">{labels.percent}</label>
          <input
            id="cp-pct"
            type="number"
            inputMode="numeric"
            min={1}
            max={90}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            required
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-surface/60 px-3 py-2 text-sm text-cloud focus:border-brand/60 focus:outline-none"
          />
        </div>
        <div className="w-32">
          <label className="text-xs text-mist" htmlFor="cp-max">{labels.maxUses}</label>
          <input
            id="cp-max"
            type="number"
            inputMode="numeric"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="∞"
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-surface/60 px-3 py-2 text-sm text-cloud placeholder:text-mist focus:border-brand/60 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          aria-disabled={loading}
          className="min-h-11 rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-on-brand transition hover:opacity-90 aria-disabled:opacity-60"
        >
          {loading ? labels.creating : labels.create}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-text">
          {error}
        </p>
      )}

      {coupons.length > 0 && (
        <ul className="mt-4 space-y-2">
          {coupons.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-line bg-surface/60 px-4 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {/* `break-all` : un code de 24 caractères sans tiret ne se coupe
                      nulle part ailleurs, et passait sous le bouton à 360 px. */}
                  <span id={`cp-${c.id}`} className={`code-lisible break-all font-extrabold ${c.active ? "text-accent" : "text-mist line-through"}`}>
                    {c.code}
                  </span>
                  <span className="ml-2 text-mist">
                    −{c.percent} % · {c.usage}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(c.id, !c.active)}
                  aria-disabled={occupee(c.id)}
                  aria-busy={occupee(c.id)}
                  aria-describedby={`cp-${c.id}`}
                  className="min-h-11 shrink-0 rounded-lg border border-line px-3 text-sm font-medium text-mist transition hover:border-brand/50 hover:text-cloud aria-disabled:opacity-60"
                >
                  {occupee(c.id) ? labels.toggling : c.active ? labels.deactivate : labels.reactivate}
                </button>
              </div>
              {erreurs[c.id] && (
                <p role="alert" className="mt-1 text-sm text-danger-text">
                  {erreurs[c.id]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
