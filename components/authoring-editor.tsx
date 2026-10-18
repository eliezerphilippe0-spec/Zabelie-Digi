"use client";
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CopieCreation } from "@/lib/digital-authoring/copy";
import { projetPourEditeur, type ProjetEditeur } from "@/lib/digital-authoring/api";
import { rapprocherApresPerte } from "@/lib/digital-authoring/revision";
import { ficheTest, regrouperParCode, type CodeControle, type Controle } from "@/lib/digital-authoring/quality";
import { exportAJour, lireExportClient, tailleLisible, type ExportClient } from "@/lib/digital-authoring/export";
import type { Lang } from "@/lib/i18n";
import { ConfirmationEnvoi, EtatSuggestion, useSuggestions, type PlanPropose, type Quota } from "@/components/authoring-suggestion";
import { AuthoringSoumission } from "@/components/authoring-soumission";
import type { FicheRattachee } from "@/lib/digital-authoring/soumission";
import type { OptionCategorie, OptionSousRayon } from "@/lib/product-categories";
import {
  brouillonDiffere,
  effacerBrouillon,
  ecrireBrouillon,
  lireBrouillon,
  purgerBrouillons,
  stockageLocal,
  type BrouillonLocal,
  type EtatLocal,
  type Stockage,
} from "@/lib/digital-authoring/local-draft";
import {
  CHAMPS_BRIEF_FACULTATIFS,
  CHAMPS_BRIEF_REQUIS,
  type Brief,
  type Contenu,
  type LimitesEditeur,
  type Section,
} from "@/lib/digital-authoring/schema";

/**
 * Éditeur du Studio de création éditoriale (docs/70, tâches 2.4 et 2.5).
 *
 * Quatre étapes : le brief, le plan, la rédaction, la relecture. La rédaction
 * s'ouvre quand le plan a été approuvé (STU 03). Tout texte est saisi et
 * AFFICHÉ comme du texte : aucun HTML interprété, jamais (STU 04, T12).
 *
 * Relecture (tâche 4.2) : la fiche-test tourne en direct sur le texte de
 * l'écran ; l'approbation enregistre d'abord, puis le serveur la refait sur
 * le texte en base. Une approbation ne vaut que pour SA révision.
 *
 * PDF (tâche 4.3) : créé par le serveur depuis la révision approuvée, ouvert
 * par un lien signé de cinq minutes, puis approuvé TEL QUEL : l'écran renvoie
 * l'empreinte du fichier montré, et le bouton n'ouvre qu'après l'aperçu.
 *
 * Fiche produit (tâche 5.2) : « Soumettre à la revue » n'ouvre qu'avec le PDF
 * approuvé de la révision courante ; la fiche naît en brouillon.
 *
 * Sauvegarde (STU 05) :
 *   - automatique une seconde après la dernière frappe, et par le bouton ;
 *   - « enregistré » n'apparaît qu'après la réponse du serveur, et seulement
 *     si rien n'a changé pendant l'envoi ;
 *   - la saisie n'est JAMAIS bloquée pendant un envoi ;
 *   - une copie locale par compte et par projet survit à une coupure ou à
 *     un onglet fermé ; elle est proposée au retour, jamais imposée ;
 *   - réponse perdue : on relit le serveur avant de conclure (PRD §10.1) ;
 *   - conflit : rien n'est écrasé, le vendeur choisit sa version.
 */

type Statut = "propre" | "modifie" | "envoi" | "enregistre" | "hors_ligne" | "erreur" | "conflit";
type EnvoiSuivi = { revisionAttendue: number; jeton: string; version: number };

const NON_ENREGISTRE: ReadonlySet<Statut> = new Set(["modifie", "envoi", "hors_ligne", "erreur", "conflit"]);

/** Contrôles dont les détails sont une liste à montrer (extraits, caractères, marqueurs). */
const AVEC_LISTE: ReadonlySet<CodeControle> = new Set([
  "marqueur_inacheve", "caracteres_pdf", "paragraphe_repete", "chiffres_a_verifier", "liens_a_verifier",
]);

/** Un caractère refusé, montré avec son point de code : un espace invisible se voit ainsi. */
function montrerCaractere(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  return `${ch} (U+${cp.toString(16).toUpperCase().padStart(4, "0")})`;
}

export function AuthoringEditor({
  initial,
  labels,
  limites,
  userId,
  ia = false,
  quotaInitial = null,
  lang = "fr",
  exportInitial = null,
  rayons = [],
  sousRayons = [],
  ficheInitiale = null,
}: {
  initial: ProjetEditeur;
  labels: CopieCreation;
  limites: LimitesEditeur;
  userId: string;
  /** Suggestions ouvertes (drapeau, moteur, configuration) : sinon aucune trace d'IA à l'écran. */
  ia?: boolean;
  quotaInitial?: Quota | null;
  lang?: Lang;
  /** Le dernier PDF du projet, lu sous le JWT (0147) ; `null` s'il n'y en a pas. */
  exportInitial?: ExportClient | null;
  /** Rayons et sous-rayons ouverts à la publication, lus en base par la page. */
  rayons?: OptionCategorie[];
  sousRayons?: OptionSousRayon[];
  /** La fiche déjà rattachée au projet (0148), lue sous le JWT ; `null` s'il n'y en a pas. */
  ficheInitiale?: FicheRattachee | null;
}) {
  const e = labels.editeur;
  const ids = useId();
  const router = useRouter();
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
  const [revisionApprouvee, setRevisionApprouvee] = useState<number | null>(initial.revisionApprouvee);
  const [responsable, setResponsable] = useState(false);
  const [approbation, setApprobation] = useState(false);
  const [pdf, setPdf] = useState<ExportClient | null>(exportInitial);
  const [rendu, setRendu] = useState(false);
  const [apercuOuvert, setApercuOuvert] = useState(false);
  const [approbationPdf, setApprobationPdf] = useState(false);
  const [suppression, setSuppression] = useState(false);
  const [statut, setStatut] = useState<Statut>("propre");
  const [message, setMessage] = useState<string | null>(null);
  const [proposition, setProposition] = useState<BrouillonLocal | null>(null);
  const [sansStockage, setSansStockage] = useState(false);

  // Les envois lisent l'état COURANT, pas celui de la frappe qui les a lancés.
  const etat = useRef<EtatLocal>({ ...projet, brief, contenu });
  const revRef = useRef(revision);
  const statutRef = useRef(statut);
  const version = useRef(0);
  const enCours = useRef<EnvoiSuivi | null>(null);
  const incertain = useRef<EnvoiSuivi | null>(null);
  const stock = useRef<Stockage | null>(null);

  const champ = "mt-1 w-full rounded-xl border border-line bg-surface p-3 text-sm";

  // ── Montage : stockage disponible ? un brouillon local à proposer ? ───────
  // `localStorage` n'existe qu'au client : le lire pendant le rendu ferait
  // diverger le HTML du serveur et celui du navigateur (hydratation). D'où
  // l'effet, et ses deux `setState` assumés.
  useEffect(() => {
    const s = stockageLocal();
    stock.current = s;
    if (!s) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- état client seulement, voir ci-dessus
      setSansStockage(true);
      return;
    }
    purgerBrouillons(s, userId); // jamais le brouillon d'un autre compte
    const b = lireBrouillon(s, userId, initial.id);
    const serveur: EtatLocal = {
      titre: initial.titre, langue: initial.langue, public: initial.public,
      marcheDiaspora: initial.marcheDiaspora, brief: initial.brief, contenu: initial.contenu,
    };
    if (b && brouillonDiffere(b.etat, serveur)) setProposition(b);
    else if (b) effacerBrouillon(s, userId, initial.id);
    // Une seule fois, au montage : le projet initial ne change pas ensuite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Toute frappe passe ici : la version locale avance, l'état devient « modifié ». */
  const toucher = useCallback(() => {
    version.current += 1;
    setStatut((s) => (s === "conflit" || s === "hors_ligne" ? s : "modifie"));
  }, []);

  function confirmer(nouvelle: number, versionEnvoyee: number) {
    revRef.current = nouvelle;
    setRevision(nouvelle);
    if (version.current === versionEnvoyee) {
      setStatut("enregistre");
      if (stock.current) effacerBrouillon(stock.current, userId, initial.id);
    } else {
      setStatut("modifie"); // on a tapé pendant l'envoi : la sauvegarde suivante partira.
    }
  }

  const sauver = useCallback(async (revisionAttendue = revRef.current): Promise<number | null> => {
    if (enCours.current) return null;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setStatut("hors_ligne");
      return null;
    }
    const suivi: EnvoiSuivi = { revisionAttendue, jeton: crypto.randomUUID(), version: version.current };
    enCours.current = suivi;
    setStatut("envoi");
    setMessage(null);
    let reponse: Response;
    try {
      reponse = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revisionAttendue,
          jeton: suivi.jeton,
          projet: { titre: etat.current.titre, langue: etat.current.langue, public: etat.current.public, marcheDiaspora: etat.current.marcheDiaspora },
          brief: etat.current.brief,
          contenu: etat.current.contenu,
        }),
      });
    } catch {
      // Réponse perdue : l'écriture a PU avoir lieu. On ne suppose rien.
      enCours.current = null;
      incertain.current = suivi;
      setStatut("hors_ligne");
      return null;
    }
    enCours.current = null;
    const d = await reponse.json().catch(() => null);
    if (reponse.ok && typeof d?.revision === "number") {
      confirmer(d.revision, suivi.version);
      return d.revision;
    }
    setMessage(typeof d?.error === "string" ? d.error : e.erreurSauvegarde);
    if (d?.code === "archive") setArchive(true);
    setStatut(reponse.status === 409 && d?.code === "conflit" ? "conflit" : "erreur");
    return null;
    // `confirmer` et les libellés sont stables pour la vie de l'éditeur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // L'assistant lit la version ENREGISTRÉE : on enregistre d'abord ce qui est en cours.
  const avantEnvoi = useCallback(async () => {
    const st = statutRef.current;
    if (st === "propre" || st === "enregistre") return true;
    return (await sauver()) !== null;
  }, [sauver]);
  const sugg = useSuggestions({ projetId: initial.id, labels: labels.ia, quotaInitial, avantEnvoi });
  const [copiee, setCopiee] = useState<string | null>(null);

  async function lireServeur(): Promise<ProjetEditeur | null> {
    try {
      const r = await fetch(url, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      return r.ok ? projetPourEditeur(d?.projet) : null;
    } catch {
      return null;
    }
  }

  /** Retour de la connexion : trancher l'envoi incertain, puis reprendre. */
  const rattraper = useCallback(async () => {
    const perdu = incertain.current;
    if (!perdu) {
      setStatut("modifie");
      return;
    }
    const serveur = await lireServeur();
    if (!serveur) return; // toujours hors ligne : on garde l'état
    incertain.current = null;
    const issue = rapprocherApresPerte(
      { revisionAttendue: perdu.revisionAttendue, empreinte: perdu.jeton },
      { revision: serveur.revision, empreinte: serveur.jeton ?? "" }
    );
    if (issue === "deja_enregistre") confirmer(serveur.revision, perdu.version);
    else if (issue === "non_enregistre") setStatut("modifie");
    else {
      setMessage(e.conflitCoupure);
      setStatut("conflit");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Références synchronisées APRÈS le rendu, et AVANT l'effet de sauvegarde
  // ci-dessous (les effets d'un composant s'exécutent dans leur ordre).
  useEffect(() => {
    etat.current = { ...projet, brief, contenu };
  }, [projet, brief, contenu]);
  useEffect(() => {
    statutRef.current = statut;
  }, [statut]);

  // ── Sauvegarde automatique et copie locale, à chaque modification ────────
  useEffect(() => {
    if (version.current === 0 || archive) return;
    // Copie locale seulement s'il reste quelque chose à enregistrer.
    if (stock.current && NON_ENREGISTRE.has(statut)) {
      ecrireBrouillon(stock.current, {
        v: 1, userId, projetId: initial.id, revisionBase: revRef.current, enregistreA: Date.now(), etat: etat.current,
      });
    }
    if (statut !== "modifie") return;
    const minuterie = setTimeout(() => void sauver(), 1000);
    return () => clearTimeout(minuterie);
  }, [projet, brief, contenu, statut, archive, sauver, userId, initial.id]);

  // ── Connexion rétablie ───────────────────────────────────────────────────
  useEffect(() => {
    const enLigne = () => {
      if (statutRef.current === "hors_ligne") void rattraper();
    };
    window.addEventListener("online", enLigne);
    return () => window.removeEventListener("online", enLigne);
  }, [rattraper]);

  // ── Quitter avec des modifications non enregistrées : le navigateur avertit ─
  useEffect(() => {
    if (!NON_ENREGISTRE.has(statut)) return;
    const avertir = (ev: BeforeUnloadEvent) => {
      ev.preventDefault();
      ev.returnValue = "";
    };
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [statut]);

  function appliquer(p: ProjetEditeur) {
    setProjet({ titre: p.titre, langue: p.langue, public: p.public, marcheDiaspora: p.marcheDiaspora });
    setBrief(p.brief);
    setContenu(p.contenu);
    revRef.current = p.revision;
    setRevision(p.revision);
    setPlanApprouve(p.planApprouveRevision);
    setRevisionApprouvee(p.revisionApprouvee);
    setArchive(p.archive);
  }

  /** Brouillon local : le reprendre sur SA révision d'origine — si le serveur a bougé, la sauvegarde le dira (conflit). */
  function reprendreBrouillon(b: BrouillonLocal) {
    setProjet({ titre: b.etat.titre, langue: b.etat.langue, public: b.etat.public, marcheDiaspora: b.etat.marcheDiaspora });
    setBrief(b.etat.brief);
    setContenu(b.etat.contenu);
    revRef.current = b.revisionBase;
    setRevision(b.revisionBase);
    setProposition(null);
    toucher();
  }
  function ignorerBrouillon() {
    if (stock.current) effacerBrouillon(stock.current, userId, initial.id);
    setProposition(null);
  }

  /** Conflit : reprendre la version du serveur (le texte local est abandonné). */
  async function reprendreServeur() {
    const p = await lireServeur();
    if (!p) return setMessage(e.erreurSauvegarde);
    appliquer(p);
    version.current += 1;
    if (stock.current) effacerBrouillon(stock.current, userId, initial.id);
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
      setStatut("hors_ligne");
      return false;
    }
  }

  async function approuverPlan() {
    // L'approbation porte sur une révision EXACTE : on enregistre d'abord.
    let rev: number | null = revRef.current;
    if (statut !== "propre" && statut !== "enregistre") rev = await sauver();
    if (rev === null) return;
    if (await action({ action: "approuver_plan", revision: rev })) {
      setPlanApprouve(rev);
      setStatut("enregistre");
    }
  }

  /** Approuver le guide : enregistrer, puis demander au serveur de refaire la fiche-test sur cette révision. */
  async function approuverGuide() {
    if (!responsable) return;
    let rev: number | null = revRef.current;
    if (statut !== "propre" && statut !== "enregistre") rev = await sauver();
    if (rev === null) return;
    setApprobation(true);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approuver_guide", revision: rev, responsabilite: true }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && typeof d?.resultat === "number") {
        setRevisionApprouvee(d.resultat);
        setResponsable(false); // une nouvelle approbation demandera une nouvelle confirmation
        setMessage(null);
      } else {
        setMessage(typeof d?.error === "string" ? d.error : e.erreurSauvegarde);
        if (d?.code === "conflit") setStatut("conflit");
        if (d?.code === "archive") setArchive(true);
      }
    } catch {
      setMessage(e.erreurSauvegarde);
    } finally {
      setApprobation(false);
    }
  }

  /** Créer le PDF : le serveur le rend depuis la révision approuvée, le dépose, l'enregistre. */
  async function creerPdf() {
    setRendu(true);
    setMessage(null);
    try {
      const r = await fetch(`${url}/exports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: revRef.current }),
      });
      const d = await r.json().catch(() => null);
      const cree = r.ok ? lireExportClient(d?.export) : null;
      if (cree) {
        setPdf(cree);
        setApercuOuvert(false); // un nouveau fichier se regarde avant d'être approuvé
      } else {
        setMessage(typeof d?.error === "string" ? d.error : labels.pdf.erreur);
        if (d?.code === "conflit") setStatut("conflit");
      }
    } catch {
      setMessage(labels.pdf.erreur);
    } finally {
      setRendu(false);
    }
  }

  /** Approuver CE fichier : l'empreinte montrée part avec la demande (T28). */
  async function approuverPdf() {
    if (!pdf || !apercuOuvert) return;
    setApprobationPdf(true);
    try {
      const r = await fetch(`/api/digital-authoring/exports/${pdf.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empreinte: pdf.empreinte }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && typeof d?.approuveLe === "string") {
        setPdf({ ...pdf, approuveLe: d.approuveLe });
        setMessage(null);
      } else {
        setMessage(typeof d?.error === "string" ? d.error : e.erreurSauvegarde);
      }
    } catch {
      setMessage(e.erreurSauvegarde);
    } finally {
      setApprobationPdf(false);
    }
  }

  async function archiver() {
    if (!window.confirm(e.confirmerArchive)) return;
    if (await action({ action: "archiver" })) setArchive(true);
  }

  /** Suppression définitive (5.3) : seulement un projet archivé, et jamais sans confirmation. */
  async function supprimerProjet() {
    if (!window.confirm(e.confirmerSupprimerProjet)) return;
    setSuppression(true);
    setMessage(null);
    try {
      const r = await fetch(url, { method: "DELETE" });
      if (r.ok) {
        if (stock.current) effacerBrouillon(stock.current, userId, initial.id);
        router.push("/tableau-de-bord/creation");
        return;
      }
      const d = await r.json().catch(() => null);
      setMessage(typeof d?.error === "string" ? d.error : e.erreurSauvegarde);
    } catch {
      setMessage(e.erreurSauvegarde);
    }
    setSuppression(false);
  }

  const majSection = (id: string, maj: Partial<Section>) => {
    setContenu((c) => ({ ...c, sections: c.sections.map((s) => (s.id === id ? { ...s, ...maj } : s)) }));
    toucher();
  };
  function ajouterSection() {
    setContenu((c) => ({ ...c, sections: [...c.sections, { id: crypto.randomUUID(), titre: "", resultat: "", corps: "" }] }));
    toucher();
  }
  function supprimerSection(s: Section) {
    if (s.corps.trim() && !window.confirm(e.confirmerSuppression)) return;
    setContenu((c) => ({ ...c, sections: c.sections.filter((x) => x.id !== s.id) }));
    toucher();
  }
  function deplacer(index: number, sens: -1 | 1) {
    setContenu((c) => {
      const cible = index + sens;
      if (cible < 0 || cible >= c.sections.length) return c;
      const sections = [...c.sections];
      [sections[index], sections[cible]] = [sections[cible], sections[index]];
      return { ...c, sections };
    });
    toucher();
  }

  function remplacerParSuggestion(s: Section, texte: string) {
    if (s.corps.trim() && !window.confirm(labels.ia.confirmerRemplacer)) return;
    majSection(s.id, { corps: texte });
    sugg.oublier(s.id);
  }
  function ajouterSuggestion(s: Section, texte: string) {
    majSection(s.id, { corps: s.corps.trim() ? `${s.corps}\n\n${texte}` : texte });
    sugg.oublier(s.id);
  }
  async function copierSuggestion(id: string, texte: string) {
    try {
      await navigator.clipboard.writeText(texte);
      setCopiee(id);
    } catch {
      /* presse-papiers refusé : le texte reste affiché, sélectionnable */
    }
  }
  function utiliserPlan(plan: PlanPropose) {
    if (contenu.sections.some((x) => x.corps.trim()) && !window.confirm(labels.ia.confirmerPlan)) return;
    setContenu((c) => ({
      objectif: c.objectif.trim() ? c.objectif : plan.objectif,
      sections: plan.sections.slice(0, limites.sections).map((x) => ({ id: crypto.randomUUID(), titre: x.titre, resultat: x.resultat, corps: "" })),
    }));
    toucher();
    sugg.oublier(null);
  }
  const restantes = sugg.quota
    ? labels.ia.restantes.replace("{n}", String(Math.max(0, sugg.quota.maximum - sugg.quota.utilisees))).replace("{max}", String(sugg.quota.maximum))
    : null;

  const compteur = (n: number, max: number) => e.compteur.replace("{n}", String(n)).replace("{max}", String(max));
  const texteStatut: Record<Statut, string> = {
    propre: "",
    modifie: `● ${e.etatModifie}`,
    envoi: `… ${e.enregistrement}`,
    enregistre: `✓ ${e.enregistre}`,
    hors_ligne: `⚠ ${sansStockage ? e.etatHorsLignePage : e.etatHorsLigne}`,
    erreur: "",
    conflit: `⚠ ${e.etatConflit}`,
  };
  const facultatifsRemplis = CHAMPS_BRIEF_FACULTATIFS.some((c) => brief[c].trim());

  // La fiche suit la frappe sans la ralentir : sur un téléphone d'entrée de
  // gamme, React la recalcule quand il a le temps (valeurs différées).
  const r = labels.relecture;
  const titreRelu = useDeferredValue(projet.titre);
  const contenuRelu = useDeferredValue(contenu);
  const fiche = useMemo(
    () => ficheTest({ titre: titreRelu, contenu: contenuRelu, planApprouve: planApprouve !== null }),
    [titreRelu, contenuRelu, planApprouve]
  );
  const cartesBloquantes = regrouperParCode(fiche.controles.filter((c) => c.niveau === "bloquant"));
  const cartesConseils = regrouperParCode(fiche.controles.filter((c) => c.niveau === "conseil"));
  const approuve = revisionApprouvee !== null && revisionApprouvee === revision && !NON_ENREGISTRE.has(statut);
  const perime = revisionApprouvee !== null && !approuve;
  const p = labels.pdf;
  const pdfAJour = pdf !== null && approuve && exportAJour(pdf, { revision, revisionApprouvee });
  // Port-au-Prince fixé : le serveur et le navigateur écrivent la même date (hydratation).
  const dateLisible = (iso: string) =>
    new Intl.DateTimeFormat(lang === "ht" ? "fr" : lang, { dateStyle: "long", timeStyle: "short", timeZone: "America/Port-au-Prince" }).format(new Date(iso));
  const lienPdf = (id: string, doc: "guide" | "extrait", telecharger = false) =>
    `/api/digital-authoring/exports/${id}?document=${doc}${telecharger ? "&telecharger=1" : ""}`;
  const lienBouton = "bouton inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-semibold";
  const lieu = (c: Controle) => {
    const titreSection = c.section === null ? "" : contenu.sections[c.section - 1]?.titre.trim();
    return c.section === null ? r.guide : r.section.replace("{n}", String(c.section)) + (titreSection ? ` · ${titreSection}` : "");
  };
  const detailsDe = (c: Controle) =>
    AVEC_LISTE.has(c.code) && c.details.length > 0 ? (
      <ul className="mt-1 space-y-1 text-xs text-mist">
        {c.details.map((d, k) => (
          <li key={k} className="break-words">{c.code === "caracteres_pdf" ? montrerCaractere(d) : <q>{d}</q>}</li>
        ))}
      </ul>
    ) : null;
  const pluriels: Partial<Record<CodeControle, string>> = r.pluriels;
  /** Une carte par problème : seul, il dit sa section ; répété, il liste ses sections. */
  const carte = (groupe: Controle[]) => {
    const [c] = groupe;
    return (
      <li key={c.code} className="rounded-xl border border-line p-3 text-sm" data-controle={c.code}>
        {groupe.length === 1 ? (
          <>
            <span className="block text-xs text-mist">{lieu(c)}</span>
            <p>{r.controles[c.code].replace("{n}", c.details[0] ?? "")}</p>
            {detailsDe(c)}
          </>
        ) : (
          <>
            <p>{pluriels[c.code] ?? r.controles[c.code]}</p>
            <ul className="mt-2 space-y-2">
              {groupe.map((x, i) => (
                <li key={i}>
                  <span className="block text-xs text-mist">
                    {lieu(x)}{x.code === "section_courte" ? ` · ${r.nCaracteres.replace("{n}", x.details[0] ?? "")}` : ""}
                  </span>
                  {detailsDe(x)}
                </li>
              ))}
            </ul>
          </>
        )}
      </li>
    );
  };
  const champBrief = (cle: keyof Brief) => (
    <label key={cle} className="block text-sm">
      {e[cle]}
      <textarea className={champ} rows={cle === "methode" || cle === "exemples" ? 5 : 3} value={brief[cle]} maxLength={limites.brief}
        onChange={(v) => { setBrief({ ...brief, [cle]: v.target.value }); toucher(); }} />
    </label>
  );

  return (
    <div className="space-y-8">
      {archive && <p role="status" className="rounded-xl border border-line p-3 text-sm text-warning-text">{e.archive}</p>}
      {sansStockage && !archive && <p className="rounded-xl border border-line p-3 text-xs text-mist">{e.stockageIndisponible}</p>}
      {proposition && !archive && (
        <div role="region" aria-label={e.restaurer} className="rounded-xl border border-line p-3 text-sm">
          <p>{e.restaurerTexte.replace("{date}", new Date(proposition.enregistreA).toLocaleString())}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => reprendreBrouillon(proposition)} className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold">{e.restaurer}</button>
            <button type="button" onClick={ignorerBrouillon} className="min-h-11 rounded-xl border border-line px-3 text-sm">{e.ignorer}</button>
          </div>
        </div>
      )}

      {/* La saisie n'est jamais bloquée par un envoi : seulement par l'archivage. */}
      <fieldset disabled={archive} className="space-y-8">
        <section aria-labelledby={`${ids}-infos`} className="rounded-2xl border border-line bg-surface p-5">
          <h2 id={`${ids}-infos`} className="text-lg font-semibold">{e.infos}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              {labels.champTitre}
              <input className={champ} value={projet.titre} maxLength={limites.titre}
                onChange={(v) => { setProjet({ ...projet, titre: v.target.value }); toucher(); }} />
            </label>
            <label className="block text-sm">
              {labels.champLangue}
              <select className={champ} value={projet.langue}
                onChange={(v) => { setProjet({ ...projet, langue: v.target.value as "ht" | "fr" }); toucher(); }}>
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
                  toucher();
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
                  onChange={(v) => { setProjet({ ...projet, marcheDiaspora: v.target.value }); toucher(); }} />
              </label>
            )}
          </div>
        </section>

        <section aria-labelledby={`${ids}-brief`} className="rounded-2xl border border-line bg-surface p-5">
          <h2 id={`${ids}-brief`} className="text-lg font-semibold">{e.etapeBrief}</h2>
          <p className="mt-1 text-sm text-mist">{e.briefIntro}</p>
          <div className="mt-4 space-y-4">{CHAMPS_BRIEF_REQUIS.map(champBrief)}</div>
          {/* Six champs facultatifs repliés : sur un téléphone, onze zones de texte d'affilée découragent. */}
          <details open={facultatifsRemplis} className="mt-4">
            <summary className="min-h-11 cursor-pointer text-sm font-semibold leading-[2.75rem]">{e.plusDeDetails}</summary>
            <div className="mt-2 space-y-4">{CHAMPS_BRIEF_FACULTATIFS.map(champBrief)}</div>
          </details>
        </section>

        <section aria-labelledby={`${ids}-plan`} className="rounded-2xl border border-line bg-surface p-5">
          <h2 id={`${ids}-plan`} className="text-lg font-semibold">{e.etapePlan}</h2>
          <p className="mt-1 text-sm text-mist">{e.planIntro}</p>
          <label className="mt-4 block text-sm">
            {e.objectif}
            <textarea className={champ} rows={2} value={contenu.objectif} maxLength={limites.brief}
              onChange={(v) => { setContenu({ ...contenu, objectif: v.target.value }); toucher(); }} />
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
            <button type="button" onClick={approuverPlan} disabled={contenu.sections.length === 0 || statut === "envoi"}
              className="bouton min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-40">{e.approuverPlan}</button>
            {planApprouve !== null && <span className="text-sm text-success-text">✓ {e.planApprouve}</span>}
          </div>
          {contenu.sections.length === 0 && <p className="mt-2 text-xs text-mist">{e.planVideAide}</p>}
          {ia && (
            <div className="mt-4 border-t border-line pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => sugg.demander("plan", null)} disabled={sugg.enCours(null)}
                  className="min-h-11 rounded-xl border border-line px-4 text-sm disabled:opacity-40">{labels.ia.proposerPlan}</button>
                {/* Un seul compteur à l'écran : ici avant l'approbation, sous « Rédaction » après. */}
                {restantes && planApprouve === null && <span className="text-xs text-mist">{restantes}</span>}
              </div>
              <ConfirmationEnvoi s={sugg} labels={labels.ia} sectionId={null} />
              <EtatSuggestion s={sugg} labels={labels.ia} sectionId={null} revisionCourante={revision} actions={
                sugg.proposition(null)?.plan ? (
                  <button type="button" onClick={() => utiliserPlan(sugg.proposition(null)!.plan!)}
                    className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold">{labels.ia.utiliserPlan}</button>
                ) : null
              } />
            </div>
          )}
        </section>

        <section aria-labelledby={`${ids}-redaction`} className="rounded-2xl border border-line bg-surface p-5">
          <h2 id={`${ids}-redaction`} className="text-lg font-semibold">{e.etapeRedaction}</h2>
          {planApprouve === null ? (
            <p className="mt-1 text-sm text-mist">{e.redactionVerrou}</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-mist">{e.redactionIntro}</p>
              {ia && restantes && <p className="mt-1 text-xs text-mist">{restantes}</p>}
              <div className="mt-4 space-y-5">
                {contenu.sections.map((s, i) => {
                  const p = sugg.proposition(s.id);
                  return (
                    <div key={s.id}>
                      <label className="block text-sm">
                        <span className="font-semibold">{i + 1}. {s.titre}</span>
                        <textarea className={champ} rows={8} value={s.corps} maxLength={limites.section} aria-label={`${e.corps} : ${s.titre}`}
                          onChange={(v) => majSection(s.id, { corps: v.target.value })} />
                      </label>
                      <span className="mt-1 block text-xs text-mist">{compteur(s.corps.length, limites.section)}</span>
                      {ia && (
                        <>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {([["draft", labels.ia.suggererBrouillon], ["rewrite", labels.ia.reformuler], ["exercise", labels.ia.proposerExercice]] as const).map(([type, libelle]) => (
                              <button key={type} type="button" onClick={() => sugg.demander(type, s.id)} disabled={sugg.enCours(s.id)}
                                aria-label={`${libelle} : ${s.titre}`} className="min-h-11 rounded-xl border border-line px-3 text-sm disabled:opacity-40">{libelle}</button>
                            ))}
                          </div>
                          <ConfirmationEnvoi s={sugg} labels={labels.ia} sectionId={s.id} />
                          <EtatSuggestion s={sugg} labels={labels.ia} sectionId={s.id} revisionCourante={revision} actions={
                            p?.texte ? (
                              <>
                                <button type="button" onClick={() => remplacerParSuggestion(s, p.texte!)} className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold">{labels.ia.remplacer}</button>
                                <button type="button" onClick={() => ajouterSuggestion(s, p.texte!)} className="min-h-11 rounded-xl border border-line px-3 text-sm">{labels.ia.ajouter}</button>
                                <button type="button" onClick={() => void copierSuggestion(p.operationId, p.texte!)} className="min-h-11 rounded-xl border border-line px-3 text-sm">{copiee === p.operationId ? labels.ia.copie : labels.ia.copier}</button>
                              </>
                            ) : null
                          } />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <section aria-labelledby={`${ids}-relecture`} className="rounded-2xl border border-line bg-surface p-5">
          <h2 id={`${ids}-relecture`} className="text-lg font-semibold">{r.titre}</h2>
          {planApprouve === null ? (
            <p className="mt-1 text-sm text-mist">{r.verrou}</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-mist">{r.intro}</p>
              <p data-preparation={fiche.preparation} className={`mt-3 text-sm font-semibold ${
                fiche.preparation === "pas_pret" ? "text-danger-text" : fiche.preparation === "presque" ? "text-warning-text" : "text-success-text"
              }`}>{fiche.preparation === "pas_pret" ? r.pasPret : fiche.preparation === "presque" ? r.presque : r.pret}</p>
              {fiche.bloquants > 0 && (
                <>
                  <h3 className="mt-4 text-sm font-semibold">{r.bloquants}</h3>
                  <ul className="mt-2 space-y-2">{cartesBloquantes.map(carte)}</ul>
                </>
              )}
              {fiche.conseils > 0 && (
                <details open={fiche.bloquants === 0} className="mt-4">
                  <summary className="min-h-11 cursor-pointer text-sm font-semibold leading-[2.75rem]">{r.conseils} ({cartesConseils.length})</summary>
                  <ul className="mt-2 space-y-2">{cartesConseils.map(carte)}</ul>
                </details>
              )}
              {fiche.controles.length === 0 && <p className="mt-2 text-sm text-mist">{r.aucunPoint}</p>}

              {approuve ? (
                <p role="status" className="mt-4 text-sm font-semibold text-success-text">✓ {r.approuve.replace("{n}", String(revisionApprouvee))}</p>
              ) : (
                <div className="mt-4 border-t border-line pt-4">
                  {perime && <p className="mb-3 text-sm text-warning-text">⚠ {r.perime.replace("{n}", String(revisionApprouvee))}</p>}
                  {/* Jamais cochée d'avance : la confirmation est un geste du créateur. */}
                  <label className="flex min-h-11 items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={responsable}
                      onChange={(v) => setResponsable(v.target.checked)} />
                    <span>{r.responsabilite}</span>
                  </label>
                  <button type="button" onClick={() => void approuverGuide()}
                    disabled={!responsable || fiche.bloquants > 0 || approbation || statut === "envoi"}
                    className="bouton mt-3 min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-40">
                    {approbation ? r.approbation : r.approuver}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section aria-labelledby={`${ids}-pdf`} className="rounded-2xl border border-line bg-surface p-5">
          <h2 id={`${ids}-pdf`} className="text-lg font-semibold">{p.titre}</h2>
          {!approuve ? (
            <p className="mt-1 text-sm text-mist">{p.verrou}</p>
          ) : !pdfAJour || !pdf ? (
            <>
              {pdf && <p className="mt-1 text-sm text-warning-text">⚠ {p.ancien}</p>}
              <button type="button" onClick={() => void creerPdf()} disabled={rendu}
                className="bouton mt-3 min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-40">
                {rendu ? p.creation : p.creer}
              </button>
            </>
          ) : (
            <div className="mt-3 space-y-4">
              <div>
                <p className="text-sm font-semibold">{p.guide.replace("{pages}", String(pdf.pages)).replace("{taille}", tailleLisible(pdf.taille, lang))}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={lienPdf(pdf.id, "guide")} target="_blank" rel="noopener noreferrer" onClick={() => setApercuOuvert(true)}
                    aria-label={`${p.apercu} ${p.nouvelOnglet}`} className={lienBouton}>{p.apercu}</a>
                  <a href={lienPdf(pdf.id, "guide", true)} onClick={() => setApercuOuvert(true)} className={lienBouton}>{p.telecharger}</a>
                </div>
                <p className="mt-2 break-all text-xs text-mist">{p.empreinte.replace("{e}", `${pdf.empreinte.slice(0, 12)}…${pdf.empreinte.slice(-6)}`)}</p>
              </div>
              <div>
                <p className="text-sm font-semibold">{p.extrait.replace("{pages}", String(pdf.extraitPages)).replace("{taille}", tailleLisible(pdf.extraitTaille, lang))}</p>
                <p className="mt-1 text-xs text-mist">{p.extraitAide}</p>
                <a href={lienPdf(pdf.id, "extrait")} target="_blank" rel="noopener noreferrer"
                  aria-label={`${p.apercuExtrait} ${p.nouvelOnglet}`} className={`${lienBouton} mt-2`}>{p.apercuExtrait}</a>
              </div>
              {pdf.approuveLe ? (
                <p role="status" className="text-sm font-semibold text-success-text">✓ {p.approuve.replace("{date}", dateLisible(pdf.approuveLe))}</p>
              ) : (
                <div className="border-t border-line pt-4">
                  <p className="text-sm text-mist">{p.consigne}</p>
                  <button type="button" onClick={() => void approuverPdf()} disabled={!apercuOuvert || approbationPdf}
                    className="bouton mt-3 min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-40">
                    {approbationPdf ? p.approbation : p.approuver}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <AuthoringSoumission projetId={initial.id} labels={labels.soumission} rayons={rayons} sousRayons={sousRayons}
          ficheInitiale={ficheInitiale} exportPret={pdfAJour && pdf?.approuveLe ? pdf.id : null} />
      </fieldset>

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

      {!archive ? (
        <button type="button" onClick={archiver} disabled={statut === "envoi"} className="min-h-11 rounded-xl border border-line px-4 text-sm">{e.archiver}</button>
      ) : (
        <button type="button" onClick={() => void supprimerProjet()} disabled={suppression}
          className="min-h-11 rounded-xl border border-line px-4 text-sm text-danger-text disabled:opacity-40">{e.supprimerProjet}</button>
      )}

      {/* Barre collante : sur un téléphone, l'état et le bouton restent sous le pouce. */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void sauver()} disabled={archive || statut === "envoi"}
            className="bouton min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-40">{statut === "envoi" ? e.enregistrement : e.enregistrer}</button>
          {statut === "hors_ligne" && (
            <button type="button" onClick={() => void rattraper()} className="min-h-11 rounded-xl border border-line px-3 text-sm">{e.reessayer}</button>
          )}
          <p role="status" aria-live="polite" className="min-w-0 flex-1 text-sm text-mist">{texteStatut[statut]}</p>
        </div>
      </div>
    </div>
  );
}
