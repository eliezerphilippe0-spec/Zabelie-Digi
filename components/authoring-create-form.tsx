"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { CopieCreation } from "@/lib/digital-authoring/copy";
import { IDS_MODELES, type IdModele } from "@/lib/digital-authoring/modeles";

/**
 * Création d'un projet du Studio (docs/70, tâche 2.3). Le serveur reste
 * l'autorité (`/api/digital-authoring/projects`) : ce formulaire aide la
 * saisie, n'invente aucune valeur, et garde ce qui a été tapé en cas d'échec.
 *
 * Langue du guide par défaut : kreyòl (`docs/25` §5, « kreyòl d'abord »).
 */
export function AuthoringCreateForm({
  labels,
  modeleInitial,
  plein,
}: {
  labels: CopieCreation;
  modeleInitial: IdModele | null;
  /** Plafond de projets actifs atteint : le bouton reste fermé, la raison est dite. */
  plein: string | null;
}) {
  const router = useRouter();
  const ids = useId();
  const [titre, setTitre] = useState("");
  const [langue, setLangue] = useState<"ht" | "fr">("ht");
  const [publicVise, setPublicVise] = useState<"haiti" | "diaspora" | "both">("haiti");
  const [marche, setMarche] = useState("");
  const [modele, setModele] = useState<IdModele | "">(modeleInitial ?? "");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = "mt-1 w-full rounded-xl border border-line bg-surface p-3 text-sm";

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (envoi || plein) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/digital-authoring/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre,
          langue,
          public: publicVise,
          marcheDiaspora: publicVise === "haiti" ? "" : marche,
          ...(modele ? { modele } : {}),
        }),
      });
      const donnees = await reponse.json().catch(() => null);
      const id = donnees?.projet?.id;
      if (!reponse.ok || typeof id !== "string") {
        setErreur(typeof donnees?.error === "string" ? donnees.error : labels.erreur);
        setEnvoi(false);
        return;
      }
      router.push(`/tableau-de-bord/creation/${id}`);
    } catch {
      setErreur(labels.erreurReseau);
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={creer} className="space-y-4" aria-describedby={plein ? `${ids}-plein` : undefined}>
      <label className="block text-sm">
        {labels.champTitre}
        <input
          className={champ}
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          required
          maxLength={500}
          aria-describedby={`${ids}-titre`}
        />
      </label>
      <p id={`${ids}-titre`} className="-mt-2 text-xs text-mist">{labels.champTitreAide}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          {labels.champLangue}
          <select className={champ} value={langue} onChange={(e) => setLangue(e.target.value as "ht" | "fr")}>
            <option value="ht">{labels.langueHt}</option>
            <option value="fr">{labels.langueFr}</option>
          </select>
        </label>
        <label className="block text-sm">
          {labels.champPublic}
          <select className={champ} value={publicVise} onChange={(e) => setPublicVise(e.target.value as "haiti" | "diaspora" | "both")}>
            <option value="haiti">{labels.publicHaiti}</option>
            <option value="diaspora">{labels.publicDiaspora}</option>
            <option value="both">{labels.publicBoth}</option>
          </select>
        </label>
      </div>

      {publicVise !== "haiti" && (
        <label className="block text-sm">
          {labels.champMarche}
          <input className={champ} value={marche} onChange={(e) => setMarche(e.target.value)} maxLength={160} placeholder={labels.marchePh} />
        </label>
      )}

      <label className="block text-sm">
        {labels.champModele}
        <select className={champ} value={modele} onChange={(e) => setModele(e.target.value as IdModele | "")}>
          <option value="">{labels.modeleAucun}</option>
          {IDS_MODELES.map((id) => (
            <option key={id} value={id}>{labels.modeles[id]}</option>
          ))}
        </select>
      </label>

      {plein && <p id={`${ids}-plein`} className="text-sm text-warning-text">{plein}</p>}
      <button
        type="submit"
        disabled={envoi || Boolean(plein)}
        className="bouton inline-flex min-h-11 items-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand disabled:opacity-50"
      >
        {envoi ? labels.creation : labels.creer}
      </button>
      {erreur && <p role="alert" className="text-sm text-danger-text">{erreur}</p>}
    </form>
  );
}
