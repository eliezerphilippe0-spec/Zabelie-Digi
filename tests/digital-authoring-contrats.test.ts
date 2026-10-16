import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LIMITES_DEFAUT,
  lire,
  longueurContenu,
  normaliserTexte,
  schemaBrief,
  schemaContenu,
  schemaProjet,
} from "../lib/digital-authoring/schema";
import {
  ETATS_OPERATION,
  classerIssue,
  doitDevenirIncertaine,
  estFinal,
  rejeu,
  repriseAdmise,
  reservationLiberable,
  transitionAdmise,
  type EtatOperation,
} from "../lib/digital-authoring/operations";
import { empreinte, jsonCanonique } from "../lib/digital-authoring/empreinte";
import { etatProposition, issueSauvegarde, rapprocherApresPerte, revisionValide } from "../lib/digital-authoring/revision";

/**
 * Studio de création éditoriale — contrats du contenu (docs/70, tâche 1.1).
 * Chaque garde est exercée sur un cas accepté ET un cas refusé : un schéma qui
 * refuse tout passerait les tests de refus, un schéma qui accepte tout
 * passerait les tests d'acceptation.
 */

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const projet = { titre: "Fè lajan ak ti biznis", langue: "ht", public: "both", marcheDiaspora: "Miami" };
const briefVide = { exemples: "", prerequis: "", ton: "", limitesMethode: "", notes: "", references: "" };
const brief = { sujet: "Vann manje", publicDetail: "Machann", probleme: "Pa gen kliyan", resultat: "Plis vant", methode: "Mache Okap", ...briefVide };
const section = (n: number, corps = "") => ({ id: uuid(n), titre: `Chapit ${n}`, resultat: "", corps });

test("le texte est normalisé avant d'être mesuré : NFC, fins de ligne, bords", () => {
  assert.equal(normaliserTexte(`  vande${String.fromCodePoint(0x300)}  `), "vandè");
  assert.equal(normaliserTexte("a\r\nb\rc"), "a\nb\nc");
  // Accent en FRONTIÈRE de mot (docs/25 §2.3) : il survit intact.
  const r = lire(schemaProjet(), { ...projet, titre: "Ti biznis bò lakay ou" });
  assert.ok(r.ok && r.valeur.titre === "Ti biznis bò lakay ou");
});

test("caractères de contrôle et bidirectionnels refusés ; tabulation et saut de ligne admis", () => {
  for (const mauvais of [0x07, 0x202e, 0x2066, 0x7f].map((c) => `a${String.fromCodePoint(c)}b`)) {
    const r = lire(schemaProjet(), { ...projet, titre: mauvais });
    assert.deepEqual(r, { ok: false, code: "caractere_interdit" }, JSON.stringify(mauvais));
  }
  const r = lire(schemaContenu(), { objectif: "a\tb\nc", sections: [] });
  assert.ok(r.ok, "tabulation et saut de ligne doivent passer");
});

test("projet : titre requis et borné, langue du contenu ht ou fr, précision diaspora cohérente", () => {
  assert.ok(lire(schemaProjet(), projet).ok);
  assert.deepEqual(lire(schemaProjet(), { ...projet, titre: "   " }), { ok: false, code: "champ_requis" });
  assert.deepEqual(lire(schemaProjet(), { ...projet, titre: "x".repeat(LIMITES_DEFAUT.titre + 1) }), { ok: false, code: "texte_trop_long" });
  assert.ok(lire(schemaProjet(), { ...projet, titre: "x".repeat(LIMITES_DEFAUT.titre) }).ok, "la limite elle-même est admise");
  assert.deepEqual(lire(schemaProjet(), { ...projet, langue: "en" }), { ok: false, code: "format_invalide" });
  assert.deepEqual(lire(schemaProjet(), { ...projet, public: "haiti" }), { ok: false, code: "marche_sans_diaspora" });
  assert.ok(lire(schemaProjet(), { ...projet, public: "haiti", marcheDiaspora: "" }).ok);
  assert.deepEqual(lire(schemaProjet(), { ...projet, prix: 100 }), { ok: false, code: "format_invalide" }, "clé inconnue");
});

test("brief : champs requis non vides, total borné, aucun champ inventé", () => {
  assert.ok(lire(schemaBrief(), brief).ok);
  assert.deepEqual(lire(schemaBrief(), { ...brief, methode: " " }), { ok: false, code: "champ_requis" });
  // Chaque champ sous la limite, la SOMME au-dessus.
  const tiers = "x".repeat(LIMITES_DEFAUT.brief / 3);
  assert.deepEqual(
    lire(schemaBrief(), { ...brief, sujet: tiers, probleme: tiers, methode: tiers }),
    { ok: false, code: "brief_trop_long" }
  );
  assert.deepEqual(lire(schemaBrief(), { ...brief, diplome: "Master" }), { ok: false, code: "format_invalide" });
});

test("contenu : identifiants stables, ordre conservé, limites de sections et de longueur", () => {
  const ok = lire(schemaContenu(), { objectif: "", sections: [section(3), section(1), section(2)] });
  assert.ok(ok.ok);
  assert.deepEqual(ok.valeur.sections.map((s) => s.id), [uuid(3), uuid(1), uuid(2)], "l'ordre saisi est l'ordre rendu");

  const trop = Array.from({ length: LIMITES_DEFAUT.sections + 1 }, (_, i) => section(i + 1));
  assert.deepEqual(lire(schemaContenu(), { objectif: "", sections: trop }), { ok: false, code: "trop_de_sections" });
  assert.ok(lire(schemaContenu(), { objectif: "", sections: trop.slice(1) }).ok);

  assert.deepEqual(lire(schemaContenu(), { objectif: "", sections: [section(1), section(1)] }), { ok: false, code: "section_dupliquee" });
  assert.deepEqual(lire(schemaContenu(), { objectif: "", sections: [{ ...section(1), id: "1" }] }), { ok: false, code: "format_invalide" });
  assert.deepEqual(
    lire(schemaContenu(), { objectif: "", sections: [section(1, "x".repeat(LIMITES_DEFAUT.section + 1))] }),
    { ok: false, code: "texte_trop_long" }
  );

  // Chaque section sous sa limite, le guide au-dessus de la sienne.
  const longues = Array.from({ length: 11 }, (_, i) => section(i + 1, "x".repeat(11000)));
  assert.deepEqual(lire(schemaContenu(), { objectif: "", sections: longues }), { ok: false, code: "contenu_trop_long" });
  assert.ok(lire(schemaContenu(), { objectif: "", sections: longues.slice(1) }).ok);
});

test("les limites viennent de l'appelant (la config en base), pas d'une constante", () => {
  const deuxSections = { ...LIMITES_DEFAUT, sections: 2 };
  assert.deepEqual(lire(schemaContenu(deuxSections), { objectif: "", sections: [section(1), section(2), section(3)] }), { ok: false, code: "trop_de_sections" });
  assert.ok(lire(schemaContenu(deuxSections), { objectif: "", sections: [section(1), section(2)] }).ok);
  const titreCourt = { ...LIMITES_DEFAUT, titre: 5 };
  assert.deepEqual(lire(schemaProjet(titreCourt), { ...projet, titre: "Six ch" }), { ok: false, code: "texte_trop_long" });
  assert.ok(lire(schemaProjet(titreCourt), { ...projet, titre: "Cinq", marcheDiaspora: "" }).ok);
});

test("limites par défaut : celles du PRD §11.1, gelées", () => {
  assert.deepEqual({ ...LIMITES_DEFAUT }, { titre: 160, brief: 6000, sections: 12, section: 12000, total: 120000 });
  assert.ok(Object.isFrozen(LIMITES_DEFAUT));
  assert.equal(longueurContenu({ objectif: "ab", sections: [{ titre: "c", resultat: "d", corps: "ef" }] }), 6);
});

// ── Opérations (PRD §10) ────────────────────────────────────────────────────

test("transitions : rien ne réussit ni ne devient incertain sans envoi, rien ne repart d'un état final", () => {
  const admises: string[] = [];
  for (const de of ETATS_OPERATION) for (const vers of ETATS_OPERATION) for (const soumis of [false, true]) {
    if (transitionAdmise(de, vers, soumis)) admises.push(`${de}>${vers}${soumis ? "!" : ""}`);
  }
  // La table COMPLÈTE : un ajout ou un retrait silencieux fait échouer ce test.
  assert.deepEqual(admises.sort(), [
    "queued>cancelled", "queued>failed", "queued>running",
    "running>cancelled", "running>failed", "running>failed!", "running>succeeded!", "running>uncertain!",
  ].sort());
  for (const e of ["succeeded", "failed", "uncertain", "cancelled"] as EtatOperation[]) assert.ok(estFinal(e));
  assert.ok(!estFinal("queued") && !estFinal("running"));
});

test("reprise : un bail expiré AVANT l'envoi rend la main, APRÈS l'envoi il rend l'incertitude", () => {
  assert.ok(repriseAdmise({ etat: "queued", soumis: false, bailExpire: false }));
  assert.ok(repriseAdmise({ etat: "running", soumis: false, bailExpire: true }));
  assert.ok(!repriseAdmise({ etat: "running", soumis: false, bailExpire: false }), "bail encore valide : un seul exécuteur");
  assert.ok(!repriseAdmise({ etat: "running", soumis: true, bailExpire: true }), "envoi possible : jamais de second appel");
  assert.ok(doitDevenirIncertaine({ etat: "running", soumis: true, bailExpire: true }));
  assert.ok(!doitDevenirIncertaine({ etat: "running", soumis: false, bailExpire: true }));
});

test("quota : rendu seulement si rien n'a pu partir", () => {
  assert.ok(reservationLiberable({ etat: "cancelled", soumis: false }));
  assert.ok(reservationLiberable({ etat: "failed", soumis: false }));
  assert.ok(!reservationLiberable({ etat: "failed", soumis: true }), "le fournisseur a répondu : l'appel a pu coûter");
  assert.ok(!reservationLiberable({ etat: "uncertain", soumis: true }));
  assert.ok(!reservationLiberable({ etat: "succeeded", soumis: true }));
});

test("issue d'un envoi : sans réponse = incertain, réponse invalide = échec, jamais de relance implicite", () => {
  assert.deepEqual(classerIssue({ type: "aucune_reponse" }), { etat: "uncertain", code: "delai_depasse" });
  assert.deepEqual(classerIssue({ type: "reponse", statut: 200, sortieValide: true }), { etat: "succeeded", code: null });
  assert.deepEqual(classerIssue({ type: "reponse", statut: 200, sortieValide: false }), { etat: "failed", code: "sortie_invalide" });
  assert.deepEqual(classerIssue({ type: "reponse", statut: 400, sortieValide: false }), { etat: "failed", code: "fournisseur_refus" });
  assert.deepEqual(classerIssue({ type: "reponse", statut: 429, sortieValide: false }), { etat: "failed", code: "fournisseur_refus" });
  for (const statut of [408, 500, 503, 504]) {
    assert.equal(classerIssue({ type: "reponse", statut, sortieValide: false }).etat, "uncertain", String(statut));
  }
});

test("rejeu d'une clé : même empreinte = même opération, autre empreinte = conflit", () => {
  assert.equal(rejeu({ empreinte: "a" }, "a"), "meme_operation");
  assert.equal(rejeu({ empreinte: "a" }, "b"), "conflit");
});

// ── Empreintes ─────────────────────────────────────────────────────────────

test("empreinte : indépendante de l'ordre des clés, sensible à l'ordre des sections et à un caractère", () => {
  assert.equal(empreinte({ a: 1, b: { c: "x", d: [1, 2] } }), empreinte({ b: { d: [1, 2], c: "x" }, a: 1 }));
  assert.notEqual(empreinte({ s: [1, 2] }), empreinte({ s: [2, 1] }));
  assert.notEqual(empreinte({ t: "vandè" }), empreinte({ t: "vande" }));
  assert.match(empreinte({}), /^[0-9a-f]{64}$/);
  assert.equal(jsonCanonique({ b: 1, a: undefined, c: null }), '{"b":1,"c":null}');
  assert.throws(() => jsonCanonique({ n: Number.NaN }));
  assert.throws(() => jsonCanonique(undefined));
});

test("empreinte : deux saisies du même texte, composée et décomposée, coïncident après normalisation", () => {
  const compose = lire(schemaProjet(), { ...projet, titre: "Vandè" });
  const decompose = lire(schemaProjet(), { ...projet, titre: `Vande${String.fromCodePoint(0x300)}` });
  assert.ok(compose.ok && decompose.ok);
  assert.equal(empreinte(compose.valeur), empreinte(decompose.valeur));
});

// ── Révisions (PRD §10.1) ───────────────────────────────────────────────────

test("sauvegarde : une ligne = enregistré à la révision suivante, zéro = conflit, jamais d'écrasement", () => {
  assert.deepEqual(issueSauvegarde(4, 1, 5), { etat: "enregistre", revision: 5 });
  assert.deepEqual(issueSauvegarde(4, 0, 6), { etat: "conflit", revisionServeur: 6 });
  assert.throws(() => issueSauvegarde(4, 2, 5));
  assert.ok(revisionValide(1) && !revisionValide(0) && !revisionValide(1.5) && !revisionValide("2"));
});

test("réponse perdue : la relecture tranche entre « c'était nous », « rien d'écrit » et « conflit »", () => {
  const envoi = { revisionAttendue: 4, empreinte: "e1" };
  assert.equal(rapprocherApresPerte(envoi, { revision: 5, empreinte: "e1" }), "deja_enregistre");
  assert.equal(rapprocherApresPerte(envoi, { revision: 4, empreinte: "e0" }), "non_enregistre");
  assert.equal(rapprocherApresPerte(envoi, { revision: 5, empreinte: "e2" }), "conflit", "un autre onglet a écrit la 5");
  assert.equal(rapprocherApresPerte(envoi, { revision: 7, empreinte: "e1" }), "conflit");
  assert.equal(etatProposition(4, 4), "a_jour");
  assert.equal(etatProposition(4, 6), "texte_modifie_depuis");
});
