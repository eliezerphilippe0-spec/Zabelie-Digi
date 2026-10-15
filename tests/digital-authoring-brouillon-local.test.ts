import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  brouillonDiffere,
  cleBrouillon,
  ecrireBrouillon,
  effacerBrouillon,
  lireBrouillon,
  type BrouillonLocal,
  type EtatLocal,
  type Stockage,
} from "../lib/digital-authoring/local-draft";
import { PREFIXE_BROUILLON, purgerBrouillons } from "../lib/digital-authoring/local-draft-purge";

/**
 * Studio de création éditoriale — brouillon local (décision D6, tâche 2.5).
 * Un stockage en mémoire tient lieu de `localStorage` ; un autre lève à
 * chaque appel, comme en navigation privée ou quota plein.
 */

function memoire(): Stockage & { cles(): string[] } {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    cles: () => [...m.keys()],
  };
}
const refuse: Stockage = {
  get length(): number { throw new Error("refusé"); },
  key: () => { throw new Error("refusé"); },
  getItem: () => { throw new Error("refusé"); },
  setItem: () => { throw new Error("refusé"); },
  removeItem: () => { throw new Error("refusé"); },
};

const A = "11400000-0000-4000-8000-000000000001";
const B = "11400000-0000-4000-8000-000000000002";
const P = "11400000-0000-4000-8000-0000000000aa";
const SECTION = "00000000-0000-4000-8000-0000000000d1";
const brief = { sujet: "Manje", publicDetail: "", probleme: "", resultat: "", methode: "", exemples: "", prerequis: "", ton: "", limitesMethode: "", notes: "", references: "" };
const etat: EtatLocal = {
  titre: "Gid", langue: "ht", public: "haiti", marcheDiaspora: "", brief,
  contenu: { objectif: "", sections: [{ id: SECTION, titre: "Kòmanse", resultat: "", corps: "Tèks" }] },
};
const brouillon = (userId = A): BrouillonLocal => ({ v: 1, userId, projetId: P, revisionBase: 3, enregistreA: 1760000000000, etat });

test("aller-retour : ce qui est écrit pour un compte et un projet se relit à l'identique", () => {
  const s = memoire();
  assert.ok(ecrireBrouillon(s, brouillon()));
  assert.deepEqual(lireBrouillon(s, A, P), brouillon());
  assert.equal(cleBrouillon(A, P), `${PREFIXE_BROUILLON}${A}:${P}`);
});

test("isolement : jamais le brouillon d'un autre compte ni d'un autre projet", () => {
  const s = memoire();
  ecrireBrouillon(s, brouillon(A));
  assert.equal(lireBrouillon(s, B, P), null, "un autre compte ne lit rien");
  assert.equal(lireBrouillon(s, A, "11400000-0000-4000-8000-0000000000bb"), null);
  // Un brouillon déposé sous la clé de B mais signé A est refusé.
  s.setItem(cleBrouillon(B, P), JSON.stringify(brouillon(A)));
  assert.equal(lireBrouillon(s, B, P), null);
});

test("illisible, autre version ou forme fausse : ignoré, jamais une exception", () => {
  const s = memoire();
  for (const valeur of ["{", "null", "42", JSON.stringify({ ...brouillon(), v: 2 }), JSON.stringify({ ...brouillon(), revisionBase: 0 }), JSON.stringify({ ...brouillon(), enregistreA: "hier" })]) {
    s.setItem(cleBrouillon(A, P), valeur);
    assert.equal(lireBrouillon(s, A, P), null, valeur.slice(0, 30));
  }
  // Une forme approximative est remise en forme, pas acceptée telle quelle.
  s.setItem(cleBrouillon(A, P), JSON.stringify({ ...brouillon(), etat: { ...etat, titre: { html: "<b>" }, brief: { sujet: 1 } } }));
  const b = lireBrouillon(s, A, P);
  assert.ok(b);
  assert.equal(b.etat.titre, "");
  assert.equal(b.etat.brief.sujet, "");
});

test("stockage refusé : rien ne lève, l'appelant le sait", () => {
  assert.equal(ecrireBrouillon(refuse, brouillon()), false);
  assert.equal(lireBrouillon(refuse, A, P), null);
  assert.doesNotThrow(() => effacerBrouillon(refuse, A, P));
});

test("purge : déconnecté = tous les brouillons partent ; connecté = seuls les siens restent ; le reste du site intact", () => {
  const s = memoire();
  ecrireBrouillon(s, brouillon(A));
  ecrireBrouillon(s, brouillon(B));
  s.setItem("zab_offres_recentes", "garder");
  assert.equal(purgerBrouillons(s, A), 1);
  assert.deepEqual(s.cles().sort(), [cleBrouillon(A, P), "zab_offres_recentes"].sort());
  assert.equal(purgerBrouillons(s, null), 1);
  assert.deepEqual(s.cles(), ["zab_offres_recentes"], "une autre fonction du site ne perd rien");
});

test("comparaison : l'ordre des clés du brief (jsonb) ne crée pas de faux écart", () => {
  const inverse = { ...etat, brief: Object.fromEntries(Object.entries(brief).reverse()) as typeof brief };
  assert.equal(brouillonDiffere(etat, inverse), false);
  assert.equal(brouillonDiffere(etat, { ...etat, titre: "Autre" }), true);
  assert.equal(brouillonDiffere(etat, { ...etat, contenu: { ...etat.contenu, sections: [{ ...etat.contenu.sections[0], corps: "Lòt" }] } }), true);
});

test("l'en-tête du site purge à chaque page, et le module de purge ne tire aucune dépendance", () => {
  const nav = readFileSync("components/site-nav.tsx", "utf8");
  assert.match(nav, /<PurgeBrouillonsCreation garder=\{user\?\.id \?\? null\} \/>/);
  const purge = readFileSync("lib/digital-authoring/local-draft-purge.ts", "utf8");
  assert.ok(!/^import /m.test(purge), "le module chargé sur toutes les pages n'importe rien");
});

test("éditeur : saisie jamais bloquée par un envoi, réponse perdue tranchée en relisant le serveur", () => {
  const src = readFileSync("components/authoring-editor.tsx", "utf8");
  assert.match(src, /<fieldset disabled=\{archive\}/, "la saisie ne doit dépendre que de l'archivage");
  assert.match(src, /incertain\.current = suivi;\s*setStatut\("hors_ligne"\);/, "une réponse perdue doit devenir incertaine, pas un échec");
  assert.match(src, /rapprocherApresPerte\(/);
  assert.match(src, /window\.addEventListener\("beforeunload", avertir\)/);
  assert.match(src, /const minuterie = setTimeout\(\(\) => void sauver\(\), 1000\);/, "sauvegarde automatique après une seconde");
});
