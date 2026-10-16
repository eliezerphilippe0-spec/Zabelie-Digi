import { test } from "node:test";
import assert from "node:assert/strict";

import { executerEtape, type ClientSysteme, type DepsExecuteur } from "../lib/digital-authoring/executor";
import { fournisseurSimule, type ScenarioSimule } from "../lib/digital-authoring/provider-mock";
import type { DemandeEditoriale, FournisseurEditorial } from "../lib/digital-authoring/provider";
import { LIMITES_DEFAUT } from "../lib/digital-authoring/schema";

/**
 * Studio de création éditoriale — exécuteur (docs/70 §6, tâche 3.2).
 * Base et fournisseur sont des doublures qui ENREGISTRENT l'ordre des gestes :
 * c'est l'ordre qui protège (inscription avant envoi, un seul envoi).
 */

const OP = "00000000-0000-4000-8000-0000000000e1";
const SECTION = "00000000-0000-4000-8000-0000000000d1";
const BRIEF = { sujet: "Manje", publicDetail: "Machann", probleme: "Kliyan", resultat: "Vant", methode: "Okap", exemples: "", prerequis: "", ton: "", limitesMethode: "", notes: "Nòt prive", references: "" };
const INSTANTANE = {
  titre: "Gid instantane", langue: "ht", public_vise: "haiti", marche_diaspora: "", brief: BRIEF,
  contenu: { objectif: "", sections: [{ id: SECTION, titre: "Kòmanse", resultat: "Konnen kliyan", corps: "Tèks" }] },
};

type Opts = { bail?: boolean; marque?: boolean; conclut?: boolean; instantane?: Record<string, unknown> | null; type?: string; ia?: boolean };

function banc(o: Opts = {}, fournisseur: FournisseurEditorial = fournisseurSimule()) {
  const gestes: string[] = [];
  const conclusions: Record<string, unknown>[] = [];
  const demandes: DemandeEditoriale[] = [];
  const type = o.type ?? "draft";
  const admin: ClientSysteme = {
    rpc(fn, args) {
      gestes.push(fn.replace("zabelie_authoring_", ""));
      if (fn === "zabelie_authoring_prendre_bail") {
        return Promise.resolve({ data: o.bail === false ? [] : [{ id: OP, type, section_id: type === "plan" ? null : SECTION, revision_id: "rev" }], error: null });
      }
      if (fn === "zabelie_authoring_marquer_soumis") return Promise.resolve({ data: o.marque !== false, error: null });
      conclusions.push(args);
      return Promise.resolve({ data: o.conclut !== false, error: null });
    },
    from(table) {
      gestes.push(`lire:${table}`);
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: o.instantane === undefined ? INSTANTANE : o.instantane, error: null }) }) }) };
    },
  };
  const espion: FournisseurEditorial = {
    nom: fournisseur.nom,
    simulation: fournisseur.simulation,
    async envoyer(d, signal) {
      gestes.push("envoyer");
      demandes.push(d);
      return fournisseur.envoyer(d, signal);
    },
  };
  const deps: DepsExecuteur = {
    admin,
    fournisseur: () => (o.ia === false ? { ok: false, code: "ia_coupee" } : { ok: true, fournisseur: espion }),
    limites: LIMITES_DEFAUT,
    delaiMs: 200,
  };
  return { deps, gestes, conclusions, demandes, lancer: () => executerEtape(deps, OP) };
}

test("ordre : bail, instantané, envoi INSCRIT, un seul envoi, puis conclusion sous le jeton", async () => {
  const b = banc();
  assert.equal(await b.lancer(), "succeeded");
  assert.deepEqual(b.gestes, ["prendre_bail", "lire:zabelie_authoring_revisions", "marquer_soumis", "envoyer", "conclure"]);
  const c = b.conclusions[0];
  assert.equal(c.p_etat, "succeeded");
  assert.match(String((c.p_resultat as { texte: string }).texte), /\[SIMULASYON\]/);
  assert.ok(typeof c.p_jeton === "string" && c.p_jeton.length === 36, "la conclusion porte le jeton du bail");
  assert.equal(typeof c.p_usage_entree, "number");
});

test("le fournisseur reçoit l'INSTANTANÉ, sans les notes privées (T29, PRD §12.1)", async () => {
  const b = banc();
  await b.lancer();
  const ctx = JSON.stringify(b.demandes[0].contexte);
  assert.ok(ctx.includes("Gid instantane"));
  assert.ok(!ctx.includes("Nòt prive"));
});

test("sans bail, rien : un autre exécuteur travaille", async () => {
  const b = banc({ bail: false });
  assert.equal(await b.lancer(), null);
  assert.deepEqual(b.gestes, ["prendre_bail"]);
});

test("la base refuse l'envoi (suspendu, pilote, projet, bail perdu) : rien ne part (T30)", async () => {
  const b = banc({ marque: false });
  assert.equal(await b.lancer(), null);
  assert.ok(!b.gestes.includes("envoyer") && !b.gestes.includes("conclure"));
});

test("IA coupée entre la demande et l'envoi : annulée, rien ne part (T25)", async () => {
  const b = banc({ ia: false });
  assert.equal(await b.lancer(), "cancelled");
  assert.deepEqual(b.gestes, ["prendre_bail", "lire:zabelie_authoring_revisions", "conclure"]);
  assert.equal(b.conclusions[0].p_code, "ia_coupee");
});

test("instantané inexploitable (brief incomplet, section absente, illisible) : annulée sans envoi", async () => {
  for (const instantane of [
    { ...INSTANTANE, brief: { ...BRIEF, methode: "" } },
    { ...INSTANTANE, contenu: { objectif: "", sections: [] } },
    null,
  ]) {
    const b = banc({ instantane });
    assert.equal(await b.lancer(), "cancelled");
    assert.ok(!b.gestes.includes("marquer_soumis") && !b.gestes.includes("envoyer"));
    assert.equal(b.conclusions[0].p_code, "projet_inadmissible");
  }
});

test("issues du fournisseur : jamais de second envoi (T09, T11)", async () => {
  const attendu: Record<ScenarioSimule, [string, string | null]> = {
    ok: ["succeeded", null],
    sortie_invalide: ["failed", "sortie_invalide"],
    refus: ["failed", "fournisseur_refus"],
    erreur_serveur: ["uncertain", "delai_depasse"],
    aucune_reponse: ["uncertain", "delai_depasse"],
  };
  for (const [scenario, [etat, code]] of Object.entries(attendu)) {
    const b = banc({}, fournisseurSimule(scenario as ScenarioSimule));
    assert.equal(await b.lancer(), etat, scenario);
    assert.equal(b.gestes.filter((g) => g === "envoyer").length, 1, `${scenario} : un seul envoi`);
    assert.equal(b.conclusions[0].p_code, code, scenario);
    if (etat !== "succeeded") assert.equal(b.conclusions[0].p_resultat, null, `${scenario} : aucun résultat partiel`);
  }
});

test("délai dépassé : l'envoi est abandonné et l'opération devient incertaine", async () => {
  const lent: FournisseurEditorial = {
    nom: "mock",
    simulation: true,
    envoyer: (_d, signal) => new Promise((_resoudre, rejeter) => signal?.addEventListener("abort", () => rejeter(new Error("delai")))),
  };
  const b = banc({}, lent);
  const debut = Date.now();
  assert.equal(await b.lancer(), "uncertain");
  assert.ok(Date.now() - debut < 2000, "le délai borne l'attente");
  assert.equal(b.gestes.filter((g) => g === "envoyer").length, 1);
});

test("conclusion refusée (bail repris entre-temps) : l'exécuteur le dit, n'insiste pas", async () => {
  const b = banc({ conclut: false });
  assert.equal(await b.lancer(), null);
  assert.equal(b.gestes.filter((g) => g === "conclure").length, 1);
});
