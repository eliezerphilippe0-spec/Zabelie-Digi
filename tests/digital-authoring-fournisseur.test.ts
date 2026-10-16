import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { choisirMoteur, creationActive, iaActive, lireEnvCreation, type EnvCreation } from "../lib/digital-authoring/flags";
import { contexteAutorise, fournisseurEditorial, validerSortie, type DemandeEditoriale } from "../lib/digital-authoring/provider";
import { MARQUEUR_SIMULATION, fournisseurSimule } from "../lib/digital-authoring/provider-mock";
import { LIMITES_DEFAUT, type Brief, type Contenu, type Projet } from "../lib/digital-authoring/schema";
import { classerIssue, TYPES_OPERATION } from "../lib/digital-authoring/operations";

/**
 * Studio de création éditoriale — drapeaux et fournisseur (docs/70, tâche 1.2).
 * Ce qui est prouvé ici : rien ne peut partir quand l'IA est coupée, la
 * simulation ne sort jamais en production, et le fournisseur ne reçoit que
 * le contexte autorisé.
 */

const allume: EnvCreation = {
  ZABELIE_AUTHORING_ENABLED: "true",
  ZABELIE_AUTHORING_AI_ENABLED: "true",
  ZABELIE_AUTHORING_AI_PROVIDER: "mock",
};

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const projet: Projet = { titre: "Vann manje lakay", langue: "ht", public: "both", marcheDiaspora: "" };
const brief: Brief = {
  sujet: "manje lakay", publicDetail: "Machann", probleme: "Pa gen kliyan", resultat: "Plis vant",
  methode: "Mache Okap", exemples: "", prerequis: "", ton: "", limitesMethode: "",
  notes: "NOT PRIVE : nimewo telefòn kliyan yo", references: "",
};
const contenu: Contenu = {
  objectif: "",
  sections: [
    { id: uuid(1), titre: "Kòmanse", resultat: "Konnen kliyan", corps: "TEKS SEKSYON 1" },
    { id: uuid(2), titre: "Vann", resultat: "Premye vant", corps: "TEKS SEKSYON 2" },
  ],
};

/** Espionne `fetch` le temps d'un bloc : tout appel réseau est compté. */
async function sansReseau<T>(bloc: () => Promise<T>): Promise<{ resultat: T; appels: number }> {
  const original = globalThis.fetch;
  let appels = 0;
  globalThis.fetch = (async () => {
    appels++;
    throw new Error("réseau interdit dans ce test");
  }) as typeof fetch;
  try {
    return { resultat: await bloc(), appels };
  } finally {
    globalThis.fetch = original;
  }
}

test("drapeaux : seule la valeur exacte `true` ouvre, et l'IA exige le parcours", () => {
  for (const v of [undefined, "", "1", "TRUE", "true ", "yes"]) {
    assert.equal(creationActive({ ZABELIE_AUTHORING_ENABLED: v }), false, String(v));
  }
  assert.equal(creationActive({ ZABELIE_AUTHORING_ENABLED: "true" }), true);
  assert.equal(iaActive({ ZABELIE_AUTHORING_AI_ENABLED: "true" }), false, "l'IA seule n'ouvre rien");
  assert.equal(iaActive({ ZABELIE_AUTHORING_ENABLED: "true", ZABELIE_AUTHORING_AI_ENABLED: "true" }), true);
});

test("drapeaux : indépendants du Studio images, dans les deux sens", () => {
  const studio = { ZABELIE_STUDIO_ENABLED: "true" } as EnvCreation;
  assert.equal(creationActive(studio), false);
  assert.equal(iaActive(studio), false);
  // Et le module ne lit pas la variable du Studio images.
  const src = readFileSync("lib/digital-authoring/flags.ts", "utf8");
  assert.ok(!/process\.env\.ZABELIE_STUDIO/.test(src));
});

test("drapeaux : lus explicitement dans l'environnement du processus", () => {
  const avant = process.env.ZABELIE_AUTHORING_ENABLED;
  try {
    process.env.ZABELIE_AUTHORING_ENABLED = "true";
    assert.equal(lireEnvCreation().ZABELIE_AUTHORING_ENABLED, "true");
    delete process.env.ZABELIE_AUTHORING_ENABLED;
    assert.equal(creationActive(lireEnvCreation()), false);
  } finally {
    if (avant === undefined) delete process.env.ZABELIE_AUTHORING_ENABLED;
    else process.env.ZABELIE_AUTHORING_ENABLED = avant;
  }
});

test("moteur : coupé ou mal configuré, aucun fournisseur n'est construit et rien ne part", async () => {
  const cas: Array<[EnvCreation, string]> = [
    [{}, "ia_coupee"],
    [{ ...allume, ZABELIE_AUTHORING_AI_ENABLED: "" }, "ia_coupee"],
    [{ ...allume, ZABELIE_AUTHORING_ENABLED: "" }, "ia_coupee"],
    [{ ...allume, ZABELIE_AUTHORING_AI_PROVIDER: undefined }, "configuration_absente"],
    [{ ...allume, ZABELIE_AUTHORING_AI_PROVIDER: "openai" }, "configuration_absente"],
    [{ ...allume, VERCEL_ENV: "production" }, "configuration_absente"],
  ];
  for (const [env, code] of cas) {
    const { resultat, appels } = await sansReseau(async () => fournisseurEditorial(env));
    assert.deepEqual(resultat, { ok: false, code }, JSON.stringify(env));
    assert.equal(appels, 0);
  }
  assert.deepEqual(choisirMoteur({ ...allume, VERCEL_ENV: "preview" }), { ok: true, moteur: "mock" });
});

test("contexte autorisé : ni notes privées, ni corps des autres sections ; la cible est un identifiant", () => {
  const ctx = contexteAutorise("draft", projet, brief, contenu, uuid(2));
  assert.ok(ctx);
  const transmis = JSON.stringify(ctx);
  assert.ok(!transmis.includes("NOT PRIVE"), "les notes privées ne partent jamais");
  assert.ok(!transmis.includes("TEKS SEKSYON 1"), "le corps d'une autre section ne part pas");
  assert.ok(transmis.includes("TEKS SEKSYON 2"), "la section visée part");
  assert.deepEqual(ctx.plan.map((s) => s.titre), ["Kòmanse", "Vann"], "le plan, titres seulement");

  assert.equal(contexteAutorise("draft", projet, brief, contenu, uuid(9)), null, "section inconnue");
  assert.equal(contexteAutorise("draft", projet, brief, contenu, null), null, "section exigée");
  assert.equal(contexteAutorise("plan", projet, brief, contenu, uuid(1)), null, "un plan ne vise pas de section");
  const plan = contexteAutorise("plan", projet, brief, contenu, null);
  assert.ok(plan && plan.section === null && !JSON.stringify(plan).includes("TEKS SEKSYON"));
});

test("simulation : déterministe, marquée, sans réseau, et sa sortie passe la validation", async () => {
  for (const type of TYPES_OPERATION) {
    const ctx = contexteAutorise(type, projet, brief, contenu, type === "plan" ? null : uuid(1));
    assert.ok(ctx);
    const demande: DemandeEditoriale = { type, contexte: ctx };
    const { resultat: r1, appels } = await sansReseau(() => fournisseurSimule().envoyer(demande));
    const r2 = await fournisseurSimule().envoyer(demande);
    assert.equal(appels, 0);
    assert.deepEqual(r1, r2, `${type} : même demande, même réponse`);
    assert.ok(r1.type === "reponse" && r1.statut === 200);
    assert.ok(JSON.stringify(r1.corps).includes(MARQUEUR_SIMULATION.ht), `${type} : marqueur absent`);
    assert.ok(validerSortie(type, r1.corps).ok, `${type} : sortie simulée invalide`);
  }
  const fr = contexteAutorise("draft", { ...projet, langue: "fr" }, brief, contenu, uuid(1));
  assert.ok(fr);
  const rfr = await fournisseurSimule().envoyer({ type: "draft", contexte: fr });
  assert.ok(rfr.type === "reponse" && JSON.stringify(rfr.corps).includes(MARQUEUR_SIMULATION.fr));
  assert.equal(fournisseurSimule().simulation, true);
});

test("simulation : chaque scénario d'échec mène à l'état attendu, sans relance", async () => {
  const ctx = contexteAutorise("draft", projet, brief, contenu, uuid(1));
  assert.ok(ctx);
  const demande: DemandeEditoriale = { type: "draft", contexte: ctx };
  const attendu = {
    ok: "succeeded", sortie_invalide: "failed", refus: "failed", erreur_serveur: "uncertain", aucune_reponse: "uncertain",
  } as const;
  for (const [scenario, etat] of Object.entries(attendu)) {
    const r = await fournisseurSimule(scenario as keyof typeof attendu).envoyer(demande);
    const issue = r.type === "aucune_reponse"
      ? classerIssue(r)
      : classerIssue({ type: "reponse", statut: r.statut, sortieValide: validerSortie("draft", r.corps).ok });
    assert.equal(issue.etat, etat, scenario);
  }
  const coupe = new AbortController();
  coupe.abort();
  assert.deepEqual(await fournisseurSimule().envoyer(demande, coupe.signal), { type: "aucune_reponse" });
});

test("sortie : invalide, excessive ou partielle refusée ; conforme acceptée", () => {
  assert.ok(validerSortie("draft", { texte: "Bon tèks" }).ok);
  for (const mauvais of [
    { texte: "" }, { texte: 42 }, { texte: "ok", html: "<b>" }, {}, null, "texte brut",
    { texte: "x".repeat(LIMITES_DEFAUT.section + 1) },
  ]) assert.equal(validerSortie("draft", mauvais).ok, false, JSON.stringify(mauvais).slice(0, 40));

  const section = { titre: "Chapit", resultat: "" };
  assert.ok(validerSortie("plan", { objectif: "", sections: [section] }).ok);
  assert.equal(validerSortie("plan", { objectif: "", sections: [] }).ok, false, "un plan vide n'est pas un plan");
  assert.equal(
    validerSortie("plan", { objectif: "", sections: Array(LIMITES_DEFAUT.sections + 1).fill(section) }).ok,
    false
  );
  assert.equal(validerSortie("plan", { texte: "pas un plan" }).ok, false);
});
