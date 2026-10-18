"use client";
import Link from "next/link";
import { useId, useState } from "react";
import type { CopieCreation } from "@/lib/digital-authoring/copy";
import type { FicheRattachee } from "@/lib/digital-authoring/soumission";
import type { OptionCategorie, OptionSousRayon } from "@/lib/product-categories";
import { POLICY_PATH } from "@/lib/policy";

/**
 * « Soumettre à la revue » (Studio, tâche 5.2) : la dernière étape de
 * l'éditeur. Le guide devient une fiche produit en BROUILLON, avec son PDF
 * approuvé ; la modération existante décide de la mise en vente.
 *
 * Prix, rayon et attestation ne se demandent qu'à la création : une fois la
 * fiche née, elle se complète dans les produits du vendeur, et l'écran ne
 * propose plus que d'y mettre le PDF approuvé le plus récent. Le serveur
 * revalide tout (mêmes règles que `/vendre`) : ces champs expliquent, ils ne
 * gardent pas.
 */

function lireFiche(v: unknown): FicheRattachee | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Record<string, unknown>;
  return typeof f.slug === "string" && typeof f.statut === "string" ? { slug: f.slug, statut: f.statut } : null;
}

export function AuthoringSoumission({
  projetId,
  exportPret,
  labels,
  rayons,
  sousRayons,
  ficheInitiale,
}: {
  projetId: string;
  /** L'export approuvé de la révision courante, ou `null` : rien ne se soumet sans lui. */
  exportPret: string | null;
  labels: CopieCreation["soumission"];
  rayons: OptionCategorie[];
  sousRayons: OptionSousRayon[];
  ficheInitiale: FicheRattachee | null;
}) {
  const s = labels;
  const ids = useId();
  const [fiche, setFiche] = useState<FicheRattachee | null>(ficheInitiale);
  const [depose, setDepose] = useState<string | null>(null);
  const [prix, setPrix] = useState("");
  const [rayon, setRayon] = useState("");
  const [sousRayon, setSousRayon] = useState("");
  const [attestation, setAttestation] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const champ = "mt-1 w-full rounded-xl border border-line bg-surface p-3 text-sm";
  const bouton = "bouton mt-3 min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-40";
  const options = sousRayons.filter((o) => o.departement === rayon);
  const pretACreer = prix.trim() !== "" && Number(prix) >= 0 && rayon !== "" && attestation;

  async function soumettre() {
    if (!exportPret || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const corps = fiche
        ? { export: exportPret }
        : { export: exportPret, prix: Number(prix), rayon, sousRayon: sousRayon || null, attestation };
      const r = await fetch(`/api/digital-authoring/projects/${projetId}/soumission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const data = (await r.json().catch(() => null)) as { fiche?: unknown; depose?: unknown; error?: unknown } | null;
      // La fiche peut exister même après un échec (PDF non joint) : l'écran le montre.
      const f = lireFiche(data?.fiche);
      if (f) setFiche(f);
      if (r.ok && data?.depose === true) setDepose(exportPret);
      if (!r.ok) setErreur(typeof data?.error === "string" ? data.error : s.erreur);
    } catch {
      setErreur(s.erreur);
    } finally {
      setEnvoi(false);
    }
  }

  const etatFiche = fiche ? (fiche.statut === "published" ? s.publiee : fiche.statut === "draft" ? s.brouillon : s.retiree) : null;

  return (
    <section aria-labelledby={`${ids}-fiche`} className="rounded-2xl border border-line bg-surface p-5">
      <h2 id={`${ids}-fiche`} className="text-lg font-semibold">{s.titre}</h2>
      {fiche ? (
        <div className="mt-2 space-y-2">
          <p role="status" className="text-sm font-semibold">{etatFiche}</p>
          {fiche.statut === "draft" && exportPret && (
            depose === exportPret ? (
              <p className="text-sm font-semibold text-success-text">✓ {s.depose}</p>
            ) : (
              <div>
                <p className="text-sm text-mist">{s.renvoyerAide}</p>
                <button type="button" onClick={() => void soumettre()} disabled={envoi} className={bouton}>
                  {envoi ? s.envoi : s.renvoyer}
                </button>
              </div>
            )
          )}
          <Link href="/vendre" className="inline-flex min-h-11 items-center text-sm underline">{s.voir}</Link>
        </div>
      ) : !exportPret ? (
        <p className="mt-1 text-sm text-mist">{s.verrou}</p>
      ) : (
        <form
          className="mt-2 space-y-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (pretACreer) void soumettre();
          }}
        >
          <p className="text-sm text-mist">{s.intro}</p>
          {/* Étiquettes par `htmlFor` : une étiquette qui ENVELOPPE un champ ajoute sa
              valeur au nom accessible, et « Rayon » se confondrait avec « Sous-rayon ». */}
          <div>
            <label htmlFor={`${ids}-prix`} className="block text-sm font-semibold">{s.prix}</label>
            <input id={`${ids}-prix`} type="number" inputMode="numeric" min={0} step={1} required value={prix}
              onChange={(ev) => setPrix(ev.target.value)} aria-describedby={`${ids}-prix-aide`} className={champ} />
            <p id={`${ids}-prix-aide`} className="mt-1 text-xs text-mist">{s.prixAide}</p>
          </div>
          <div>
            <label htmlFor={`${ids}-rayon`} className="block text-sm font-semibold">{s.rayon}</label>
            <select id={`${ids}-rayon`} required value={rayon} className={champ}
              // Changer de rayon invalide le sous-rayon : il appartient au précédent.
              onChange={(ev) => { setRayon(ev.target.value); setSousRayon(""); }}>
              <option value="">{s.rayonVide}</option>
              {rayons.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {options.length > 0 && (
            <div>
              <label htmlFor={`${ids}-sous-rayon`} className="block text-sm font-semibold">{s.sousRayon}</label>
              <select id={`${ids}-sous-rayon`} value={sousRayon} onChange={(ev) => setSousRayon(ev.target.value)} className={champ}>
                <option value="">{s.sousRayonVide}</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.chemin}</option>
                ))}
              </select>
            </div>
          )}
          {/* Jamais pré-cochée : le serveur refuse de toute façon sans elle. */}
          <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
            <input type="checkbox" required checked={attestation} onChange={(ev) => setAttestation(ev.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {s.attestation}{" "}
              <Link href={POLICY_PATH} className="underline">{s.regles}</Link>
            </span>
          </label>
          <button type="submit" disabled={!pretACreer || envoi} className={bouton}>
            {envoi ? s.envoi : s.soumettre}
          </button>
        </form>
      )}
      {erreur && <p role="alert" className="mt-3 text-sm text-danger-text">{erreur}</p>}
    </section>
  );
}
