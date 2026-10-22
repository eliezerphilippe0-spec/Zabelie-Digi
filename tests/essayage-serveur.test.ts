import { test } from "node:test";
import assert from "node:assert/strict";

import { POIDS_MAX_PHOTO, demarrerEssai, suivreEssai, type BaseEssayage, type LigneEssai } from "../lib/essayage/serveur";
import { simulation } from "../lib/essayage/fournisseurs/simulation";
import { DUREE_MAX_ESSAI_MS, ErreurFournisseur, type FournisseurEssayage } from "../lib/essayage/fournisseurs/types";

/**
 * ESSAYAGE VIRTUEL — cœur serveur (docs/74 §3 ; tasks/essayage-todo.md 4.1).
 *
 * La base et le fournisseur sont simulés : on vérifie l'enchaînement
 * (réserver, créer, noter, suivre, clore, effacer), les refus, et qu'aucune
 * image n'est écrite ni journalisée.
 */

const ESSAI_ID = "0000aaaa-0000-4000-8000-000000000001";
const ACHETEUR = "22222222-2222-2222-2222-222222222222"; // groupe « essai » (tests/essayage-regles.test.ts R5b)
const TEMOIN = "11111111-1111-1111-1111-111111111111"; // groupe « témoin »
const PRODUIT = "44444444-4444-4444-4444-444444444444";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const ROBE = { imageUrl: "https://exemple.supabase.co/storage/v1/object/public/covers/robe.jpg", titre: "Robe", sousRayon: "wob" };

type Journal = string[];
function fausseBase(options: { vetement?: typeof ROBE | null; refus?: "non_eligible" | "pause" | "plafond" | "quota"; ligne?: LigneEssai | null; maintenant?: () => number } = {}) {
  const journal: Journal = [];
  let ligne: LigneEssai | null = options.ligne ?? null;
  const base: BaseEssayage = {
    async lireVetement(produit) {
      journal.push(`lireVetement:${produit}`);
      return options.vetement === undefined ? ROBE : options.vetement;
    },
    async reserver(acheteur, produit, fournisseur) {
      journal.push(`reserver:${acheteur}:${produit}:${fournisseur}`);
      if (options.refus) return { refus: options.refus };
      ligne = { id: ESSAI_ID, fournisseur, travailId: null, statut: "en_cours", raison: null, creeLe: (options.maintenant ?? Date.now)() };
      return { essai: ESSAI_ID };
    },
    async lancer(essai, travail) {
      journal.push(`lancer:${essai}:${travail}`);
      if (ligne) ligne = { ...ligne, travailId: travail };
    },
    async terminer(essai, statut, raison) {
      journal.push(`terminer:${essai}:${statut}:${raison ?? ""}`);
      if (ligne && ligne.statut === "en_cours") ligne = { ...ligne, statut, raison: raison ?? null };
    },
    async lireEssai(essai, acheteur) {
      journal.push(`lireEssai:${essai}:${acheteur}`);
      return ligne && ligne.id === essai && acheteur === ACHETEUR ? ligne : null;
    },
  };
  return { base, journal, ligne: () => ligne };
}
const espion = (f: FournisseurEssayage, journal: Journal): FournisseurEssayage => ({
  nom: f.nom,
  async creer(p, v) {
    journal.push(`creer:${v.piece}:${p.type}:${p.octets.length}`);
    return f.creer(p, v);
  },
  async statut(t) {
    journal.push("statut");
    return f.statut(t);
  },
  async effacer(t) {
    journal.push("effacer");
    return f.effacer(t);
  },
});

test("S1 — démarrer : réserve, crée chez le fournisseur, note le travail ; la pièce suit le sous-rayon", async () => {
  const { base, journal } = fausseBase();
  const r = await demarrerEssai({ base, fournisseur: espion(simulation({ delaiMs: 0 }), journal) }, { acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } });
  assert.deepEqual(r, { ok: true, essai: ESSAI_ID });
  assert.deepEqual(journal.map((l) => l.split(":")[0]), ["lireVetement", "reserver", "creer", "lancer"]);
  assert.ok(journal.includes(`reserver:${ACHETEUR}:${PRODUIT}:simulation`));
  assert.ok(journal.includes("creer:entier:image/jpeg:10"));
});

/** Un vrai en-tête JPEG, un octet au-delà du plafond : seule la taille peut le refuser. */
const trop = () => {
  const o = new Uint8Array(POIDS_MAX_PHOTO + 1);
  o.set(JPEG);
  return o;
};

test("S2 — le groupe témoin, une photo invalide, ou un vêtement fermé : refus, sans réserver ni appeler le fournisseur", async () => {
  const cas: [Parameters<typeof demarrerEssai>[1], ReturnType<typeof fausseBase>, string][] = [
    [{ acheteurId: TEMOIN, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } }, fausseBase(), "non_eligible"],
    [{ acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: new Uint8Array(), type: "image/jpeg" } }, fausseBase(), "photo"],
    [{ acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: PNG, type: "image/jpeg" } }, fausseBase(), "photo"],
    [{ acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: new Uint8Array([1, 2, 3, 4]), type: "image/png" } }, fausseBase(), "photo"],
    [{ acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: trop(), type: "image/jpeg" } }, fausseBase(), "photo"],
    [{ acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/gif" as never } }, fausseBase(), "photo"],
    [{ acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } }, fausseBase({ vetement: null }), "non_eligible"],
    [{ acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } }, fausseBase({ vetement: { ...ROBE, sousRayon: "lenjri" } }), "non_eligible"],
    [{ acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } }, fausseBase({ vetement: { ...ROBE, imageUrl: "http://exemple/robe.jpg" } }), "non_eligible"],
    [{ acheteurId: ACHETEUR, produitId: "pas-un-uuid", photo: { octets: JPEG, type: "image/jpeg" } }, fausseBase(), "non_eligible"],
  ];
  for (const [entree, fausse, refus] of cas) {
    const appels: Journal = [];
    const r = await demarrerEssai({ base: fausse.base, fournisseur: espion(simulation({ delaiMs: 0 }), appels) }, entree);
    assert.deepEqual(r, { ok: false, refus }, `${entree.acheteurId} ${entree.photo.type} ${entree.photo.octets.length}`);
    assert.ok(!fausse.journal.some((l) => l.startsWith("reserver")), "pas de réservation");
    assert.equal(appels.length, 0, "pas d'appel au fournisseur");
  }
  for (const photo of [{ octets: PNG, type: "image/png" as const }, { octets: WEBP, type: "image/webp" as const }]) {
    const { base } = fausseBase();
    assert.equal((await demarrerEssai({ base, fournisseur: simulation({ delaiMs: 0 }) }, { acheteurId: ACHETEUR, produitId: PRODUIT, photo })).ok, true, photo.type);
  }
});

test("S3 — un refus de la base (pause, plafond, quota) est rendu tel quel, sans appeler le fournisseur", async () => {
  for (const refus of ["non_eligible", "pause", "plafond", "quota"] as const) {
    const { base } = fausseBase({ refus });
    const appels: Journal = [];
    assert.deepEqual(await demarrerEssai({ base, fournisseur: espion(simulation(), appels) }, { acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } }), { ok: false, refus });
    assert.equal(appels.length, 0);
  }
});

test("S4 — le fournisseur refuse à la création : l'essai est clos en échec (il ne compte pas)", async () => {
  const refuse: FournisseurEssayage = { ...simulation(), async creer() { throw new ErreurFournisseur("photo_refusee", "refusée"); } };
  const { base, journal, ligne } = fausseBase();
  assert.deepEqual(await demarrerEssai({ base, fournisseur: refuse }, { acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } }), { ok: false, echec: "photo_refusee" });
  assert.ok(journal.includes(`terminer:${ESSAI_ID}:echec:photo_refusee`));
  assert.equal(ligne()?.statut, "echec");
  const casse: FournisseurEssayage = { ...simulation(), async creer() { throw new TypeError("imprévu"); } };
  const deux = fausseBase();
  assert.deepEqual(await demarrerEssai({ base: deux.base, fournisseur: casse }, { acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } }), { ok: false, echec: "fournisseur" });
});

test("S5 — suivre : en cours, puis réussi (clos, effacé chez le fournisseur, image en data:) ; relire ensuite dit « expiré »", async () => {
  let t = 1_000_000;
  const f = simulation({ delaiMs: 3_000, maintenant: () => t });
  const { base, journal, ligne } = fausseBase({ maintenant: () => t });
  await demarrerEssai({ base, fournisseur: f }, { acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } });
  const deps = { base, fournisseur: espion(f, journal), maintenant: () => t };
  assert.deepEqual(await suivreEssai(deps, ACHETEUR, ESSAI_ID), { etat: "en_cours" });
  t += 3_000;
  const fin = await suivreEssai(deps, ACHETEUR, ESSAI_ID);
  assert.equal(fin?.etat, "reussi");
  assert.match(fin?.etat === "reussi" ? fin.image : "", /^data:image\/svg\+xml;base64,/);
  assert.ok(journal.includes(`terminer:${ESSAI_ID}:reussi:`));
  assert.ok(journal.indexOf("effacer") > journal.indexOf(`terminer:${ESSAI_ID}:reussi:`), "effacé après la clôture");
  assert.equal(ligne()?.statut, "reussi");
  assert.deepEqual(await suivreEssai(deps, ACHETEUR, ESSAI_ID), { etat: "expire" }, "l'image n'est pas conservée");
});

test("S6 — suivre : un échec du fournisseur clôt l'essai en échec et efface", async () => {
  const t = 0;
  const f = simulation({ delaiMs: 0, echec: "moderation", maintenant: () => t });
  const { base, journal } = fausseBase();
  await demarrerEssai({ base, fournisseur: f }, { acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } });
  assert.deepEqual(await suivreEssai({ base, fournisseur: espion(f, journal), maintenant: () => t }, ACHETEUR, ESSAI_ID), { etat: "echec", raison: "moderation" });
  assert.ok(journal.includes(`terminer:${ESSAI_ID}:echec:moderation`) && journal.includes("effacer"));
  assert.deepEqual(await suivreEssai({ base, fournisseur: f, maintenant: () => t }, ACHETEUR, ESSAI_ID), { etat: "echec", raison: "moderation" });
});

test("S7 — au-delà de 60 secondes, l'essai échoue en « délai » et ne compte pas", async () => {
  let t = 5_000_000;
  const f = simulation({ delaiMs: 10 * 60_000, maintenant: () => t });
  const { base, journal } = fausseBase({ maintenant: () => t });
  await demarrerEssai({ base, fournisseur: f }, { acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } });
  t += DUREE_MAX_ESSAI_MS + 1;
  assert.deepEqual(await suivreEssai({ base, fournisseur: espion(f, journal), maintenant: () => t }, ACHETEUR, ESSAI_ID), { etat: "echec", raison: "delai" });
  assert.ok(journal.includes(`terminer:${ESSAI_ID}:echec:delai`) && journal.includes("effacer"));
});

test("S7b — fournisseur injoignable : l'erreur remonte avant 60 s, l'essai est clos en « délai » après", async () => {
  let t = 7_000_000;
  const injoignable: FournisseurEssayage = { ...simulation({ delaiMs: 10 * 60_000, maintenant: () => t }), async statut() { throw new ErreurFournisseur("fournisseur", "réseau", true); } };
  const { base, journal } = fausseBase({ maintenant: () => t });
  await demarrerEssai({ base, fournisseur: injoignable }, { acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } });
  await assert.rejects(suivreEssai({ base, fournisseur: injoignable, maintenant: () => t }, ACHETEUR, ESSAI_ID), /réseau/);
  assert.ok(!journal.some((l) => l.startsWith("terminer")), "avant le délai, l'essai reste en cours");
  t += DUREE_MAX_ESSAI_MS + 1;
  assert.deepEqual(await suivreEssai({ base, fournisseur: injoignable, maintenant: () => t }, ACHETEUR, ESSAI_ID), { etat: "echec", raison: "delai" });
  assert.ok(journal.includes(`terminer:${ESSAI_ID}:echec:delai`));
});

test("S8 — l'essai d'un autre acheteur, un identifiant abîmé, ou un autre fournisseur", async () => {
  const { base } = fausseBase();
  await demarrerEssai({ base, fournisseur: simulation({ delaiMs: 0 }) }, { acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } });
  const deps = { base, fournisseur: simulation({ delaiMs: 0 }), maintenant: Date.now };
  assert.equal(await suivreEssai(deps, TEMOIN, ESSAI_ID), null, "pas le sien : introuvable");
  assert.equal(await suivreEssai(deps, ACHETEUR, "pas-un-uuid"), null);
  const autre: FournisseurEssayage = { ...simulation(), nom: "fashn" };
  assert.deepEqual(await suivreEssai({ ...deps, fournisseur: autre }, ACHETEUR, ESSAI_ID), { etat: "echec", raison: "fournisseur" }, "fournisseur changé en cours de route");
});

test("S9 — aucune image ni photo n'est journalisée", async () => {
  const journaux: string[] = [];
  const avant = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of ["log", "warn", "error", "info"] as const) console[k] = (...a: unknown[]) => journaux.push(a.map(String).join(" "));
  try {
    const t = 0;
    const f = simulation({ delaiMs: 0, maintenant: () => t });
    const { base } = fausseBase();
    await demarrerEssai({ base, fournisseur: f }, { acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } });
    await suivreEssai({ base, fournisseur: f, maintenant: () => t }, ACHETEUR, ESSAI_ID);
    const casse: FournisseurEssayage = { ...simulation(), async creer() { throw new TypeError("imprévu"); } };
    await demarrerEssai({ base: fausseBase().base, fournisseur: casse }, { acheteurId: ACHETEUR, produitId: PRODUIT, photo: { octets: JPEG, type: "image/jpeg" } });
  } finally {
    Object.assign(console, avant);
  }
  for (const j of journaux) assert.doesNotMatch(j, /base64|data:image|\/9j\/|PHN2Zy/, j.slice(0, 80));
});
