"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Ligne « compte d'essai » du back-office (`0101`).
 *
 * Marquer un compte rend ses fiches invisibles du PUBLIC — il continue de
 * publier, d'acheter et de remettre normalement. Rien n'est modifié sur les
 * fiches elles-mêmes : la policy RLS cesse simplement de les laisser passer,
 * et elles reviennent telles quelles si la marque tombe.
 *
 * La confirmation nomme le compte ET dit le nombre de fiches publiées qui vont
 * disparaître. C'est le seul chiffre qui rende la conséquence lisible avant le
 * clic : « marquer Bebeto » ne veut rien dire, « 3 fiches quitteront le
 * catalogue » se comprend.
 */
export function AdminTestAccountRow({
  id,
  name,
  role,
  isTest,
  publiees,
  cestVous,
}: {
  id: string;
  name: string;
  role: string;
  isTest: boolean;
  /** Fiches PUBLIÉES du compte — ce qui disparaîtra, ou réapparaîtra. */
  publiees: number;
  /** Le compte de l'admin connecté. Marquer le sien est permis, pas caché. */
  cestVous: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function basculer() {
    const versEssai = !isTest;
    const effet = versEssai
      ? publiees > 0
        ? `${publiees} fiche(s) publiée(s) quitteront le catalogue public.`
        : "Ce compte n'a aucune fiche publiée : rien ne changera à l'écran."
      : publiees > 0
        ? `${publiees} fiche(s) publiée(s) réapparaîtront dans le catalogue public.`
        : "Ce compte n'a aucune fiche publiée : rien ne changera à l'écran.";

    const question = versEssai
      ? `Marquer « ${name} » comme compte d'essai ?\n\n${effet}\n\nLe compte garde tout le reste : il publie, achète et remet normalement.${
          cestVous ? "\n\n⚠️ C'est VOTRE compte." : ""
        }`
      : `Retirer la marque d'essai de « ${name} » ?\n\n${effet}`;

    if (!window.confirm(question)) return;

    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/account-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Booléen strict : la route refuse « "true" » ou 1.
        body: JSON.stringify({ userId: id, isTest: versEssai }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Échec.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Échec.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {name}
          {cestVous && <span className="ml-2 text-xs text-mist">(vous)</span>}
        </p>
        <p className="text-xs text-mist">
          {role}
          {" · "}
          {isTest ? (
            <span className="text-warning-text">
              compte d&apos;essai — invisible du public
            </span>
          ) : (
            <span className="text-success-text">compte ordinaire</span>
          )}
          {publiees > 0 && ` · ${publiees} fiche(s) publiée(s)`}
          {err && <span className="text-danger-text"> · {err}</span>}
        </p>
      </div>
      <button
        onClick={basculer}
        disabled={busy}
        className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
          isTest
            ? "border-line text-cloud hover:border-accent"
            : "border-warning-text/40 text-warning-text hover:bg-warning-text/10"
        }`}
      >
        {busy ? "…" : isTest ? "Retirer la marque" : "Marquer comme essai"}
      </button>
    </li>
  );
}
