import { test } from "node:test";
import assert from "node:assert/strict";

import { loadRoute } from "./helpers/route-harness";
import * as flags from "../lib/essayage/flags";
import * as serveur from "../lib/essayage/serveur";
import * as reponses from "../lib/essayage/reponses";
import { simulation } from "../lib/essayage/fournisseurs/simulation";
import { ErreurFournisseur, type FournisseurEssayage } from "../lib/essayage/fournisseurs/types";
import type { BaseEssayage, LigneEssai } from "../lib/essayage/serveur";

/**
 * ESSAYAGE VIRTUEL — routes (tâche 4.2). Les vraies routes, le vrai cœur
 * (`lib/essayage/serveur.ts`) et la vraie table des réponses ; la session, la
 * base, le limiteur et le fournisseur sont des doublures. On vérifie l'ordre
 * des gardes, ce qui est demandé à la base, et ce qui revient au navigateur.
 */

const ACHETEUR = "22222222-2222-2222-2222-222222222222"; // groupe « essai »
const TEMOIN = "11111111-1111-1111-1111-111111111111"; // groupe « témoin »
const AUTRE = "33333333-3333-3333-3333-333333333333";
const PRODUIT = "44444444-4444-4444-4444-444444444444";
const ESSAI = "0000aaaa-0000-4000-8000-000000000001";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const ROBE = { imageUrl: "https://exemple.supabase.co/storage/v1/object/public/covers/robe.jpg", titre: "Robe", sousRayon: "wob" };
const ALLUME = { ZABELIE_ESSAYAGE_ENABLED: "true", ZABELIE_ESSAYAGE_FOURNISSEUR: "simulation" };

type Opts = {
  env?: flags.EnvEssayage;
  user?: string | null;
  compte?: Response;
  limite?: string;
  refus?: "non_eligible" | "pause" | "plafond" | "quota";
  base?: "panne";
  fournisseur?: FournisseurEssayage;
};

function fixture(o: Opts = {}) {
  const gestes: string[] = [];
  const optionsCompte: unknown[] = [];
  const limites: [string, number, number][] = [];
  const erreurs: string[] = [];
  let ligne: LigneEssai | null = null;
  const base: BaseEssayage = {
    async lireVetement() {
      gestes.push("lireVetement");
      if (o.base === "panne") throw new Error("essayage : base indisponible");
      return ROBE;
    },
    async reserver(acheteur, _produit, fournisseur) {
      gestes.push(`reserver:${acheteur}`);
      if (o.refus) return { refus: o.refus };
      ligne = { id: ESSAI, fournisseur, travailId: null, statut: "en_cours", raison: null, creeLe: Date.now() };
      return { essai: ESSAI };
    },
    async lancer(_essai, travail) {
      gestes.push("lancer");
      if (ligne) ligne = { ...ligne, travailId: travail };
    },
    async terminer(_essai, statut, raison) {
      gestes.push(`terminer:${statut}:${raison ?? ""}`);
      if (ligne) ligne = { ...ligne, statut, raison: raison ?? null };
    },
    async lireEssai(essai, acheteur) {
      gestes.push(`lireEssai:${acheteur}`);
      return ligne && ligne.id === essai && acheteur === ACHETEUR ? ligne : null;
    },
  };
  const env = o.env ?? ALLUME;
  let utilisateur = o.user === undefined ? ACHETEUR : o.user;
  const deps = {
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: {
          getUser: async () => {
            gestes.push("session");
            return { data: { user: utilisateur === null ? null : { id: utilisateur } } };
          },
        },
      }),
    },
    "@/lib/supabase/admin": { createAdminClient: () => ({ role: "service" }) },
    "@/lib/auth": {
      requireActiveAccount: async (_id: string, options?: unknown) => {
        optionsCompte.push(options);
        return o.compte ?? null;
      },
    },
    "@/lib/zabelie-rate-limit": {
      rateLimit: async (_admin: unknown, cle: string, n: number, fenetre: number) => {
        limites.push([cle, n, fenetre]);
        return !(o.limite && cle.startsWith(o.limite));
      },
    },
    "@/lib/api-erreur": { erreurAvecLangue: (_l: string, cle: string, status: number, extra?: Record<string, unknown>) => Response.json({ error: cle, ...extra }, { status }) },
    "@/lib/essayage/flags": { lireEnvEssayage: () => env, essayageActif: flags.essayageActif },
    "@/lib/essayage/fournisseur": {
      // Sans l'interrupteur, exprès : la route doit le vérifier elle-même.
      lireFournisseur: (e: flags.EnvEssayage) => (e.ZABELIE_ESSAYAGE_FOURNISSEUR ? (o.fournisseur ?? simulation({ delaiMs: 0 })) : null),
    },
    "@/lib/essayage/base": { baseEssayage: () => base },
    "@/lib/essayage/serveur": serveur,
    "@/lib/essayage/reponses": reponses,
    "@/lib/essayage/fournisseurs/types": {},
  };
  const globals = { console: { error: (...a: unknown[]) => erreurs.push(a.map(String).join(" ")), log: console.log } };
  const liste = loadRoute("app/api/essayage/route.ts", deps, {}, globals);
  const detail = loadRoute("app/api/essayage/[id]/route.ts", deps, {}, globals);
  const formulaire = (champs: Record<string, string | Blob> = { produit: PRODUIT, photo: new File([JPEG], "moi.jpg", { type: "image/jpeg" }) }) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(champs)) f.append(k, v);
    return f;
  };
  return {
    gestes, optionsCompte, limites, erreurs,
    demarrer: (corps: FormData | string = formulaire()) => liste.POST(new Request("https://z.test/api/essayage", { method: "POST", body: corps })),
    suivre: (id = ESSAI) => detail.GET(new Request(`https://z.test/api/essayage/${id}`), { params: Promise.resolve({ id }) }),
    formulaire,
    connecter: (id: string) => {
      utilisateur = id;
    },
  };
}
const json = async (r: Response) => JSON.parse(JSON.stringify(await r.json()));

test("RT1 — interrupteur éteint, ou aucun fournisseur (préversion) : 404 partout, sans lire la session", async () => {
  for (const env of [{}, { ZABELIE_ESSAYAGE_ENABLED: "1", ZABELIE_ESSAYAGE_FOURNISSEUR: "simulation" }, { ZABELIE_ESSAYAGE_ENABLED: "true" }]) {
    const f = fixture({ env });
    for (const r of [await f.demarrer(), await f.suivre()]) {
      assert.equal(r.status, 404, JSON.stringify(env));
      assert.equal((await json(r)).error, "api.feature.off");
    }
    assert.deepEqual(f.gestes, []);
  }
});

test("RT2 — anonyme : 401, sans limite de débit ni base", async () => {
  const f = fixture({ user: null });
  for (const r of [await f.demarrer(), await f.suivre()]) {
    assert.equal(r.status, 401);
    assert.equal((await json(r)).error, "api.auth.required");
  }
  assert.deepEqual(f.gestes, ["session", "session"]);
  assert.equal(f.limites.length, 0);
});

test("RT3 — compte suspendu ou conditions non acceptées : la réponse du garde passe telle quelle ; le POST exige les conditions", async () => {
  const f = fixture({ compte: Response.json({ error: "api.suspended", code: "suspended" }, { status: 403 }) });
  assert.equal((await f.demarrer()).status, 403);
  assert.deepEqual(JSON.parse(JSON.stringify(f.optionsCompte[0])), { legalAcceptance: true });
  assert.ok(!f.gestes.some((g) => g.startsWith("reserver")));
});

test("RT4 — formulaire abîmé, produit ou photo manquants : 400 avant la base", async () => {
  const f = fixture();
  assert.equal((await f.demarrer("pas un formulaire")).status, 400);
  assert.equal((await f.demarrer(f.formulaire({ photo: new File([JPEG], "moi.jpg", { type: "image/jpeg" }) }))).status, 400);
  assert.equal((await f.demarrer(f.formulaire({ produit: PRODUIT, photo: "pas un fichier" }))).status, 400);
  assert.equal(f.limites.length, 0);
});

test("RT5 — photo trop lourde : 422 « photo » sans la lire, sans limite de débit ni base", async () => {
  const f = fixture();
  const lourde = new Uint8Array(serveur.POIDS_MAX_PHOTO + 1);
  lourde.set(JPEG);
  const r = await f.demarrer(f.formulaire({ produit: PRODUIT, photo: new File([lourde], "moi.jpg", { type: "image/jpeg" }) }));
  assert.equal(r.status, 422);
  assert.deepEqual(await json(r), { error: "essayage.refus.photo", code: "photo" });
  assert.equal(f.limites.length, 0);
  assert.ok(!f.gestes.includes("lireVetement"));
});

test("RT6 — deux limites au démarrage (minute et jour, par acheteur), une au suivi", async () => {
  const f = fixture();
  await f.demarrer();
  await f.suivre();
  assert.deepEqual(f.limites, [[`essayage:minute:${ACHETEUR}`, 6, 60], [`essayage:jour:${ACHETEUR}`, 20, 86_400], [`essayage:suivi:${ACHETEUR}`, 60, 60]]);
  for (const prefixe of ["essayage:minute:", "essayage:jour:"]) {
    const g = fixture({ limite: prefixe });
    const r = await g.demarrer();
    assert.equal(r.status, 429, prefixe);
    assert.ok(!g.gestes.includes("lireVetement"), prefixe);
  }
  const s = fixture({ limite: "essayage:suivi:" });
  assert.equal((await s.suivre()).status, 429);
  assert.ok(!s.gestes.some((g) => g.startsWith("lireEssai")));
});

test("RT7 — parcours : 201 avec l'essai, l'acheteur vient de la session ; le suivi rend l'image une fois, puis « expiré » ; jamais en cache", async () => {
  const f = fixture();
  const formulaire = f.formulaire({ produit: PRODUIT, acheteur: AUTRE, photo: new File([JPEG], "moi.jpg", { type: "image/jpeg" }) });
  const r = await f.demarrer(formulaire);
  assert.equal(r.status, 201);
  assert.deepEqual(await json(r), { essai: ESSAI });
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.ok(f.gestes.includes(`reserver:${ACHETEUR}`), "l'acheteur du formulaire est ignoré");

  const s1 = await f.suivre();
  const c1 = await json(s1);
  assert.equal(s1.status, 200);
  assert.equal(c1.etat, "reussi");
  assert.match(c1.image, /^data:image\/svg\+xml;base64,/);
  assert.equal(s1.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await json(await f.suivre()), { error: "essayage.expire", etat: "expire" });
});

test("RT8 — refus du cœur : statut et message de chaque code", async () => {
  const cas: [Opts, number, string, string][] = [
    [{ refus: "quota" }, 429, "essayage.refus.quota", "quota"],
    [{ refus: "plafond" }, 503, "essayage.refus.plafond", "plafond"],
    [{ refus: "pause" }, 503, "essayage.refus.pause", "pause"],
    [{ refus: "non_eligible" }, 403, "essayage.refus.non_eligible", "non_eligible"],
    [{ user: TEMOIN }, 403, "essayage.refus.non_eligible", "non_eligible"],
  ];
  for (const [o, statut, error, code] of cas) {
    const r = await fixture(o).demarrer();
    assert.equal(r.status, statut, code);
    assert.deepEqual(await json(r), { error, code });
  }
  const r = await fixture().demarrer(fixture().formulaire({ produit: PRODUIT, photo: new File([new Uint8Array([1, 2, 3, 4, 5])], "x.jpg", { type: "image/jpeg" }) }));
  assert.deepEqual(await json(r), { error: "essayage.refus.photo", code: "photo" });
});

test("RT9 — échec immédiat chez le fournisseur : 422 avec la raison ; échec au suivi : 200 « echec » avec son message", async () => {
  const refuse: FournisseurEssayage = { ...simulation(), async creer() { throw new ErreurFournisseur("photo_refusee", "refusée"); } };
  const r = await fixture({ fournisseur: refuse }).demarrer();
  assert.equal(r.status, 422);
  assert.deepEqual(await json(r), { error: "essayage.echec.photo_refusee", code: "echec", raison: "photo_refusee" });

  const f = fixture({ fournisseur: simulation({ delaiMs: 0, echec: "moderation" }) });
  await f.demarrer();
  const s = await f.suivre();
  assert.equal(s.status, 200);
  assert.deepEqual(await json(s), { error: "essayage.echec.moderation", etat: "echec", raison: "moderation" });
});

test("RT10 — l'essai d'un autre acheteur, ou un identifiant abîmé : le même 404", async () => {
  const f = fixture();
  await f.demarrer();
  assert.equal((await f.suivre("pas-un-uuid")).status, 404);
  f.connecter(AUTRE);
  const r = await f.suivre();
  assert.equal(r.status, 404);
  assert.deepEqual(await json(r), { error: "essayage.introuvable", code: "introuvable" });
  assert.ok(f.gestes.includes(`lireEssai:${AUTRE}`), "l'essai est lu pour l'acheteur de la session");
  f.connecter(ACHETEUR);
  assert.equal((await json(await f.suivre())).etat, "reussi", "son auteur le lit toujours");
});

test("RT11 — base en panne : 503 sans détail, et rien d'une image au journal", async () => {
  const f = fixture({ base: "panne" });
  const r = await f.demarrer();
  assert.equal(r.status, 503);
  assert.deepEqual(await json(r), { error: "api.unavailable" });
  assert.deepEqual(f.erreurs, ["[essayage] demarrage interrompu"]);
});
