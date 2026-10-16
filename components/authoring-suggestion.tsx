"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CopieCreation } from "@/lib/digital-authoring/copy";
import type { TypeOperation } from "@/lib/digital-authoring/operations";
import type { OperationClient } from "@/lib/digital-authoring/api";

/**
 * Suggestions du Studio de création éditoriale (docs/70, tâche 3.3 ; PRD
 * STU 04, T12, T13).
 *
 * Trois règles, et l'écran n'en a pas d'autre :
 *   1. INFORMER avant d'envoyer : ce qui part vers l'assistant est écrit, et
 *      rien ne part sans un clic après cette information (STU 02).
 *   2. Une proposition est SÉPARÉE du texte : elle s'affiche à côté ; seul un
 *      clic du créateur la reprend (remplacer, ajouter) — jamais une réponse
 *      qui arrive (T13).
 *   3. Tout s'affiche comme du TEXTE : aucun HTML interprété (T12).
 *
 * Le suivi d'une opération s'espace (1,5 s puis jusqu'à 8 s) et se suspend
 * quand l'onglet est caché ou hors ligne (PRD §7).
 */

export type Quota = { utilisees: number; maximum: number };
export type PlanPropose = { objectif: string; sections: { titre: string; resultat: string }[] };
export type Proposition = {
  operationId: string;
  type: TypeOperation;
  sectionId: string | null;
  texte: string | null;
  plan: PlanPropose | null;
  revisionSource: number | null;
  simulation: boolean;
};
type Cible = string; // identifiant de section, ou "plan"

const FINAUX = new Set(["succeeded", "failed", "uncertain", "cancelled"]);
const cibleDe = (sectionId: string | null): Cible => sectionId ?? "plan";

function pause(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function attendreVisibleEtEnLigne() {
  while (typeof document !== "undefined" && (document.hidden || navigator.onLine === false)) await pause(1000);
}

function lirePlan(v: unknown): PlanPropose | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (!Array.isArray(p.sections)) return null;
  const sections = p.sections
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({ titre: typeof s.titre === "string" ? s.titre : "", resultat: typeof s.resultat === "string" ? s.resultat : "" }))
    .filter((s) => s.titre);
  return sections.length ? { objectif: typeof p.objectif === "string" ? p.objectif : "", sections } : null;
}

export function useSuggestions({
  projetId,
  labels,
  quotaInitial,
  avantEnvoi,
}: {
  projetId: string;
  labels: CopieCreation["ia"];
  quotaInitial: Quota | null;
  /** Enregistre le travail en cours : l'assistant lit la version ENREGISTRÉE. */
  avantEnvoi: () => Promise<boolean>;
}) {
  const [quota, setQuota] = useState<Quota | null>(quotaInitial);
  const [confirmation, setConfirmation] = useState<{ type: TypeOperation; sectionId: string | null } | null>(null);
  const [enCours, setEnCours] = useState<Record<Cible, boolean>>({});
  const [propositions, setPropositions] = useState<Record<Cible, Proposition>>({});
  const [messages, setMessages] = useState<Record<Cible, string>>({});
  const monte = useRef(true);
  useEffect(() => () => {
    monte.current = false;
  }, []);

  const conclure = useCallback((cible: Cible, op: OperationClient) => {
    setEnCours((e) => ({ ...e, [cible]: false }));
    if (op.etat === "succeeded") {
      const texte = op.type !== "plan" && op.resultat && typeof (op.resultat as { texte?: unknown }).texte === "string"
        ? (op.resultat as { texte: string }).texte
        : null;
      const plan = op.type === "plan" ? lirePlan(op.resultat) : null;
      if (texte || plan) {
        setPropositions((p) => ({
          ...p,
          [cible]: { operationId: op.id, type: op.type as TypeOperation, sectionId: op.sectionId, texte, plan, revisionSource: op.revisionSource, simulation: op.simulation },
        }));
        return;
      }
      setMessages((m) => ({ ...m, [cible]: labels.echec }));
      return;
    }
    setMessages((m) => ({ ...m, [cible]: op.etat === "uncertain" ? labels.incertaine : op.etat === "failed" ? labels.echec : labels.annulee }));
  }, [labels]);

  const suivre = useCallback(async (cible: Cible, id: string) => {
    let attente = 1500;
    for (let i = 0; i < 25 && monte.current; i++) {
      await pause(attente);
      await attendreVisibleEtEnLigne();
      try {
        const r = await fetch(`/api/digital-authoring/operations/${id}`, { cache: "no-store" });
        const d = await r.json().catch(() => null);
        if (d?.quota) setQuota(d.quota);
        if (r.ok && d?.operation && FINAUX.has(d.operation.etat)) return conclure(cible, d.operation);
      } catch {
        /* coupure : on réessaie au tour suivant, sans rien relancer chez le fournisseur */
      }
      attente = Math.min(Math.round(attente * 1.6), 8000);
    }
    setEnCours((e) => ({ ...e, [cible]: false }));
  }, [conclure]);

  /** N'est appelée QU'APRÈS l'information affichée et le clic « Envoyer ». */
  const envoyer = useCallback(async () => {
    const demande = confirmation;
    if (!demande) return;
    setConfirmation(null);
    const cible = cibleDe(demande.sectionId);
    setMessages((m) => ({ ...m, [cible]: "" }));
    setPropositions((p) => {
      const suite = { ...p };
      delete suite[cible];
      return suite;
    });
    if (!(await avantEnvoi())) return;
    setEnCours((e) => ({ ...e, [cible]: true }));
    try {
      const r = await fetch("/api/digital-authoring/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projetId, type: demande.type, sectionId: demande.sectionId, cle: crypto.randomUUID() }),
      });
      const d = await r.json().catch(() => null);
      if (d?.quota) setQuota(d.quota);
      if (!r.ok || !d?.operation) {
        setEnCours((e) => ({ ...e, [cible]: false }));
        setMessages((m) => ({ ...m, [cible]: typeof d?.error === "string" ? d.error : labels.echec }));
        return;
      }
      if (FINAUX.has(d.operation.etat)) conclure(cible, d.operation);
      else void suivre(cible, d.operation.id);
    } catch {
      setEnCours((e) => ({ ...e, [cible]: false }));
      setMessages((m) => ({ ...m, [cible]: labels.incertaine }));
    }
  }, [confirmation, avantEnvoi, projetId, labels, conclure, suivre]);

  const oublier = useCallback((cible: Cible) => {
    setPropositions((p) => {
      const suite = { ...p };
      delete suite[cible];
      return suite;
    });
  }, []);

  return {
    quota,
    confirmation,
    demander: (type: TypeOperation, sectionId: string | null) => setConfirmation({ type, sectionId }),
    renoncer: () => setConfirmation(null),
    envoyer,
    enCours: (sectionId: string | null) => Boolean(enCours[cibleDe(sectionId)]),
    proposition: (sectionId: string | null) => propositions[cibleDe(sectionId)] ?? null,
    message: (sectionId: string | null) => messages[cibleDe(sectionId)] || null,
    oublier: (sectionId: string | null) => oublier(cibleDe(sectionId)),
  };
}

export type Suggestions = ReturnType<typeof useSuggestions>;

/** L'information AVANT l'envoi, et le seul bouton qui envoie. */
export function ConfirmationEnvoi({ s, labels, sectionId }: { s: Suggestions; labels: CopieCreation["ia"]; sectionId: string | null }) {
  if (!s.confirmation || s.confirmation.sectionId !== sectionId) return null;
  return (
    <div className="mt-2 rounded-xl border border-line p-3 text-sm">
      <p>{sectionId === null ? labels.infoEnvoiPlan : labels.infoEnvoi}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => void s.envoyer()} className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold">{labels.envoyer}</button>
        <button type="button" onClick={s.renoncer} className="min-h-11 rounded-xl border border-line px-3 text-sm">{labels.annuler}</button>
      </div>
    </div>
  );
}

/** État, message et proposition d'une cible (une section, ou le plan). */
export function EtatSuggestion({
  s,
  labels,
  sectionId,
  revisionCourante,
  actions,
}: {
  s: Suggestions;
  labels: CopieCreation["ia"];
  sectionId: string | null;
  revisionCourante: number;
  actions: React.ReactNode;
}) {
  const p = s.proposition(sectionId);
  const message = s.message(sectionId);
  return (
    <div aria-live="polite">
      {s.enCours(sectionId) && <p className="mt-2 text-sm text-mist">… {labels.enPreparation}</p>}
      {message && <p className="mt-2 text-sm text-warning-text">{message}</p>}
      {p && (
        <div role="region" aria-label={labels.proposition} className="mt-2 rounded-xl border border-line bg-surface p-3 text-sm">
          <p className="font-semibold">{labels.proposition}</p>
          {p.simulation && <p className="mt-1 text-xs text-mist">{labels.simulation}</p>}
          {p.revisionSource !== null && p.revisionSource !== revisionCourante && <p className="mt-1 text-xs text-warning-text">{labels.texteModifie}</p>}
          {p.texte !== null && <p className="mt-2 whitespace-pre-wrap break-words">{p.texte}</p>}
          {p.plan && (
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {p.plan.sections.map((x, i) => <li key={i} className="break-words">{x.titre}</li>)}
            </ol>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {actions}
            <button type="button" onClick={() => s.oublier(sectionId)} className="min-h-11 rounded-xl border border-line px-3 text-sm">{labels.ignorer}</button>
          </div>
        </div>
      )}
    </div>
  );
}
