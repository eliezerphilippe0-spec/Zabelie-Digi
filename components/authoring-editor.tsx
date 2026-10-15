"use client";
import { useId, useState } from "react";
import type { CopieCreation } from "@/lib/digital-authoring/copy";
import { projetPourEditeur, type ProjetEditeur } from "@/lib/digital-authoring/api";
import {
  CHAMPS_BRIEF_FACULTATIFS,
  CHAMPS_BRIEF_REQUIS,
  type Brief,
  type Contenu,
  type LimitesEditeur,
  type Section,
} from "@/lib/digital-authoring/schema";

/**
 * Éditeur du Studio de création éditoriale (docs/70, tâche 2.4).
 *
 * Trois étapes : le brief, le plan, la rédaction. La rédaction s'ouvre quand
 * le plan a été approuvé (STU 03). Tout texte est saisi et AFFICHÉ comme du
 * texte : aucun HTML interprété, jamais (STU 04, T12).
 *
 * La sauvegarde compare la révision (route PATCH) : sur un conflit, rien
 * n'est écrasé ni perdu — le texte reste sur la page et le vendeur choisit
 * entre sa version et celle du serveur. Les états fins (sauvegarde
 * automatique, brouillon local, coupure réseau) arrivent avec la tâche 2.5.
 */

type Statut = "propre" | "modifie" | "envoi" | "enregistre" | "erreur" | "conflit";

export function AuthoringEditor({
  initial,
  labels,
  limites,
}: {
  initial: ProjetEditeur;
  labels: CopieCreation;
  limites: LimitesEditeur;
}) {
  const e = labels.editeur;
  const ids = useId();
  const url = `/api/digital-authoring/projects/${initial.id}`;
  const [projet, setProjet] = useState({
    titre: initial.titre,
    langue: initial.langue,
    public: initial.public,
    marcheDiaspora: initial.marcheDiaspora,
  });
  const [brief, setBrief] = useState<Brief>(initial.brief);
  const [contenu, setContenu] = useState<Contenu>(initial.contenu);
  const [revision, setRevision] = useState(initial.revision);
  const [planApprouve, setPlanApprouve] = useState<number | null>(initial.planApprouveRevision);
  const [archive, setArchive] = useState(initial.archive);
  const [statut, setStatut] = useState<Statut>("propre");
  const [message, setMessage] = useState<string | null>(null);
  const champ = "mt-1 w-full rounded-xl border border-line bg-surface p-3 text-sm";
  const occupe = statut === "envoi";

  const modifie = () => setStatut("modifie");
  const majSection = (id: string, maj: Partial<Section>) => {
    setContenu((c) => ({ ...c, sections: c.sections.map((s) => (s.id === id ? { ...s, ...maj } : s)) }));
    modifie();
  };

  function appliquer(p: ProjetEditeur) {
    setProjet({ titre: p.titre, langue: p.langue, public: p.public, marcheDiaspora: p.marcheDiaspora });
    setBrief(p.brief);
    setContenu(p.contenu);
    setRevision(p.revision);
    setPlanApprouve(p.planApprouveRevision);
    setArchive(p.archive);
  }

  async function lireServeur(): Promise<ProjetEditeur | null> {
    try {
      const r = await fetch(url, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      return r.ok ? projetPourEditeur(d?.projet) : null;
    } catch {
      return null;
    }
  }

  async function sauver(revisionAttendue = revision): Promise<number | null> {
    setStatut("envoi");
    setMessage(null);
    try {
      const r = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionAttendue, jeton: crypto.randomUUID(), projet, brief, contenu }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && typeof d?.revision === "number") {
        setRevision(d.revision);
        setStatut("enregistre");
        return d.revision;
      }
      setMessage(typeof d?.error === "string" ? d.error : e.erreurSauvegarde);
      if (d?.code === "archive") setArchive(true);
      setStatut(r.status === 409 && d?.code === "conflit" ? "conflit" : "erreur");
      return null;
    } catch {
      setMessage(e.erreurSauvegarde);
      setStatut("erreur");
      return null;
    }
  }

  /** Conflit : reprendre la version du serveur (le texte local est abandonné). */
  async function reprendreServeur() {
    const p = await lireServeur();
    if (!p) return setMessage(e.erreurSauvegarde);
    appliquer(p);
    setMessage(null);
    setStatut("propre");
  }

  /** Conflit : garder sa version, enregistrée par-dessus la révision actuelle du serveur. */
  async function garderMaVersion() {
    const p = await lireServeur();
    if (!p) return setMessage(e.erreurSauvegarde);
    await sauver(p.revision);
  }

  async function action(corps: Record<string, unknown>): Promise<boolean> {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setMessage(typeof d?.error === "string" ? d.error : e.erreurSauvegarde);
        setStatut("erreur");
        return false;
      }
      return true;
    } catch {
      setMessage(e.erreurSauvegarde);
      setStatut("erreur");
      return false;
    }
  }

  async function approuverPlan() {
    // L'approbation porte sur une révision EXACTE : on enregistre d'abord.
    let rev: number | null = revision;
    if (statut !== "propre" && statut !== "enregistre") rev = await sauver();
    if (rev === null) return;
    if (await action({ action: "approuver_plan", revision: rev })) {
      setPlanApprouve(rev);
      setStatut("enregistre");
    }
  }

  async function archiver() {
    if (!window.confirm(e.confirmerArchive)) return;
    if (await action({ action: "archiver" })) setArchive(true);
  }

  function ajouterSection() {
    setContenu((c) => ({ ...c, sections: [...c.sections, { id: crypto.randomUUID(), titre: "", resultat: "", corps: "" }] }));
    modifie();
  }
  function supprimerSection(s: Section) {
    if (s.corps.trim() && !window.confirm(e.confirmerSuppression)) return;
    setContenu((c) => ({ ...c, sections: c.sections.filter((x) => x.id !== s.id) }));
    modifie();
  }
  function deplacer(index: number, sens: -1 | 1) {
    setContenu((c) => {
      const cible = index + sens;
      if (cible < 0 || cible >= c.sections.length) return c;
      const sections = [...c.sections];
      [sections[index], sections[cible]] = [sections[cible], sections[index]];
      return { ...c, sections };
    });
    modifie();
  }

  const texteStatut =
    statut === "envoi" ? e.enregistrement : statut === "enregistre" ? e.enregistre : null;
  const compteur = (n: number, max: number) => e.compteur.replace("{n}", String(n)).replace("{max}", String(max));

  return (
    <div className="space-y-8">
      {archive && <p role="status" className="rounded-xl border border-line p-3 text-sm text-warning-text">{e.archive}</p>}

      <fieldset disabled={archive || occupe} className="space-y-8">
        <section aria-labelledby={`${ids}-infos`} className="rounded-2xl border border-line bg-surface p-5">
          <h2 id={`${ids}-infos`} className="text-lg font-semibold">{e.infos}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              {labels.champTitre}
              <input className={champ} value={projet.titre} maxLength={limites.titre}
                onChange={(v) => { setProjet({ ...projet, titre: v.target.value }); modifie(); }} />
            </label>
            <label className="block text-sm">
              {labels.champLangue}
              <select className={champ} value={projet.langue}
                onChange={(v) => { setProjet({ ...projet, langue: v.target.value as "ht" | "fr" }); modifie(); }}>
                <option value="ht">{labels.langueHt}</option>
                <option value="fr">{labels.langueFr}</option>
              </select>
            </label>
            <label className="block text-sm">
              {labels.champPublic}
              <select className={champ} value={projet.public}
                onChange={(v) => {
                  const pub = v.target.value as ProjetEditeur["public"];
                  setProjet({ ...projet, public: pub, marcheDiaspora: pub === "haiti" ? "" : projet.marcheDiaspora });
                  modifie();
                }}>
                <option value="haiti">{labels.publicHaiti}</option>
                <option value="diaspora">{labels.publicDiaspora}</option>
                <option value="both">{labels.publicBoth}</option>
              </select>
            </label>
            {projet.public !== "haiti" && (
              <label className="block text-sm sm:col-span-2">
                {labels.champMarche}
                <input className={champ} value={projet.marcheDiaspora} maxLength={limites.titre} placeholder={labels.marchePh}
                  onChange={(v) => { setProjet({ ...projet, marcheDiaspora: v.target.value }); modifie(); }} />
              </label>
            )}
          </div>
        </section>

        <section aria-labelledby={`${ids}-brief`} className="rounded-2xl border border-line bg-surface p-5">
          <h2 id={`${ids}-brief`} className="text-lg font-semibold">{e.etapeBrief}</h2>
          <p className="mt-1 text-sm text-mist">{e.briefIntro}</p>
          <div className="mt-4 space-y-4">
            {[...CHAMPS_BRIEF_REQUIS, ...CHAMPS_BRIEF_FACULTATIFS].map((cle) => (
              <label key={cle} className="block text-sm">
                {e[cle]}
                <textarea className={champ} rows={cle === "methode" || cle === "exemples" ? 5 : 3} value={brief[cle]} maxLength={limites.brief}
                  onChange={(v) => { setBrief({ ...brief, [cle]: v.target.value }); modifie(); }} />
              </label>
            ))}
          </div>
        </section>

        <section aria-labelledby={`${ids}-plan`} className="rounded-2xl border border-line bg-surface p-5">
          <h2 id={`${ids}-plan`} className="text-lg font-semibold">{e.etapePlan}</h2>
          <p className="mt-1 text-sm text-mist">{e.planIntro}</p>
          <label className="mt-4 block text-sm">
            {e.objectif}
            <textarea className={champ} rows={2} value={contenu.objectif} maxLength={limites.brief}
              onChange={(v) => { setContenu({ ...contenu, objectif: v.target.value }); modifie(); }} />
          </label>
          <ol className="mt-4 space-y-3">
            {contenu.sections.map((s, i) => (
              <li key={s.id} className="rounded-xl border border-line p-3">
                <label className="block text-sm">
                  {i + 1}. {e.sectionTitre}
                  <input className={champ} value={s.titre} maxLength={limites.titre} onChange={(v) => majSection(s.id, { titre: v.target.value })} />
                </label>
                <label className="mt-2 block text-sm">
                  {e.sectionResultat}
                  <input className={champ} value={s.resultat} maxLength={limites.brief} onChange={(v) => majSection(s.id, { resultat: v.target.value })} />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => deplacer(i, -1)} disabled={i === 0}
                    aria-label={`${e.monter} : ${i + 1}`} className="min-h-11 rounded-xl border border-line px-3 text-sm disabled:opacity-40">↑ {e.monter}</button>
                  <button type="button" onClick={() => deplacer(i, 1)} disabled={i === contenu.sections.length - 1}
                    aria-label={`${e.descendre} : ${i + 1}`} className="min-h-11 rounded-xl border border-line px-3 text-sm disabled:opacity-40">↓ {e.descendre}</button>
                  <button type="button" onClick={() => supprimerSection(s)}
                    aria-label={`${e.supprimer} : ${i + 1}`} className="min-h-11 rounded-xl border border-line px-3 text-sm text-danger-text">{e.supprimer}</button>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={ajouterSection} disabled={contenu.sections.length >= limites.sections}
              className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-40">+ {e.ajouterSection}</button>
            <button type="button" onClick={approuverPlan} disabled={contenu.sections.length === 0}
              className="bouton min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-40">{e.approuverPlan}</button>
            {planApprouve !== null && <span className="text-sm text-success-text">✓ {e.planApprouve}</span>}
          </div>
          {contenu.sections.length === 0 && <p className="mt-2 text-xs text-mist">{e.planVideAide}</p>}
        </section>

        <section aria-labelledby={`${ids}-redaction`} className="rounded-2xl border border-line bg-surface p-5">
          <h2 id={`${ids}-redaction`} className="text-lg font-semibold">{e.etapeRedaction}</h2>
          {planApprouve === null ? (
            <p className="mt-1 text-sm text-mist">{e.redactionVerrou}</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-mist">{e.redactionIntro}</p>
              <div className="mt-4 space-y-5">
                {contenu.sections.map((s, i) => (
                  <label key={s.id} className="block text-sm">
                    <span className="font-semibold">{i + 1}. {s.titre}</span>
                    <textarea className={champ} rows={8} value={s.corps} maxLength={limites.section} aria-label={`${e.corps} : ${s.titre}`}
                      onChange={(v) => majSection(s.id, { corps: v.target.value })} />
                    <span className="mt-1 block text-xs text-mist">{compteur(s.corps.length, limites.section)}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </section>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => sauver()} disabled={archive || occupe}
          className="bouton min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-40">{occupe ? e.enregistrement : e.enregistrer}</button>
        {!archive && (
          <button type="button" onClick={archiver} disabled={occupe} className="min-h-11 rounded-xl border border-line px-4 text-sm">{e.archiver}</button>
        )}
        <p role="status" aria-live="polite" className="text-sm text-mist">{texteStatut}</p>
      </div>
      {message && (
        <div role="alert" className="rounded-xl border border-line p-3 text-sm text-danger-text">
          <p>{message}</p>
          {statut === "conflit" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={garderMaVersion} className="min-h-11 rounded-xl border border-line px-3 text-sm text-cloud">{e.garder}</button>
              <button type="button" onClick={reprendreServeur} className="min-h-11 rounded-xl border border-line px-3 text-sm text-cloud">{e.recharger}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
