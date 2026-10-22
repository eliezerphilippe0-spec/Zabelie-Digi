import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { baseEssayage } from "../lib/essayage/base";

/**
 * ESSAYAGE VIRTUEL — la base réelle (lib/essayage/base.ts ; tâche 4.1).
 * Un faux client Supabase enregistre les appels : bons noms de fonctions de
 * 0150, bons arguments, filtre par acheteur, et aucune fuite des erreurs.
 * Plus une garde : rien de l'essayage n'écrit dans Supabase Storage.
 */

type Appel = { rpc?: string; args?: unknown; table?: string; select?: string; filtres?: [string, unknown][] };
function fauxClient(reponses: { data?: unknown; error?: unknown }[]) {
  const appels: Appel[] = [];
  const suivante = () => reponses.shift() ?? { data: null, error: null };
  const client = {
    rpc: async (rpc: string, args: unknown) => {
      appels.push({ rpc, args });
      return suivante();
    },
    from: (table: string) => {
      const a: Appel = { table, filtres: [] };
      appels.push(a);
      const constructeur = {
        select: (s: string) => ((a.select = s), constructeur),
        eq: (c: string, v: unknown) => (a.filtres!.push([c, v]), constructeur),
        maybeSingle: async () => suivante(),
      };
      return constructeur;
    },
  };
  return { client: client as unknown as SupabaseClient, appels };
}

test("B1 — réserver : la fonction de 0150, l'essai ou le refus ; une réponse inattendue est une panne", async () => {
  const { client, appels } = fauxClient([{ data: [{ essai: "e1", refus: null }] }, { data: [{ essai: null, refus: "quota" }] }, { data: [{ essai: null, refus: "inconnu" }] }, { error: { message: "secret interne" } }]);
  const b = baseEssayage(client);
  assert.deepEqual(await b.reserver("a", "p", "genlook"), { essai: "e1" });
  assert.deepEqual(appels[0], { rpc: "zabelie_essayage_reserver", args: { p_acheteur: "a", p_produit: "p", p_fournisseur: "genlook" } });
  assert.deepEqual(await b.reserver("a", "p", "genlook"), { refus: "quota" });
  await assert.rejects(b.reserver("a", "p", "genlook"), /indisponible/);
  await assert.rejects(b.reserver("a", "p", "genlook"), (e: Error) => !e.message.includes("secret"));
});

test("B2 — lancer, terminer, éligible, exposer : les fonctions de 0150 et leurs arguments", async () => {
  const { client, appels } = fauxClient([{}, {}, {}, { data: true }, { data: false }, {}]);
  const b = baseEssayage(client);
  await b.lancer("e1", "gen:zab_x");
  await b.terminer("e1", "reussi");
  await b.terminer("e1", "echec", "delai");
  assert.equal(await b.eligible("p", "a"), true);
  assert.equal(await b.eligible("p", "a"), false);
  await b.exposer("a", "p", "temoin");
  assert.deepEqual(appels.map((x) => [x.rpc, x.args]), [
    ["zabelie_essayage_lancer", { p_essai: "e1", p_travail: "gen:zab_x" }],
    ["zabelie_essayage_terminer", { p_essai: "e1", p_statut: "reussi", p_raison: null }],
    ["zabelie_essayage_terminer", { p_essai: "e1", p_statut: "echec", p_raison: "delai" }],
    ["zabelie_essayage_eligible", { p_produit: "p", p_acheteur: "a" }],
    ["zabelie_essayage_eligible", { p_produit: "p", p_acheteur: "a" }],
    ["zabelie_essayage_exposer", { p_acheteur: "a", p_produit: "p", p_groupe: "temoin" }],
  ]);
});

test("B3 — lire un essai : filtré par acheteur ; lire un vêtement : fiche publiée seulement", async () => {
  const { client, appels } = fauxClient([
    { data: { id: "e1", fournisseur: "fashn", travail_id: "pred", statut: "en_cours", raison: null, cree_le: "2026-10-19T12:00:00.000Z" } },
    { data: { title: "Robe", cover_url: "https://x/robe.jpg", sous_rayon: { slug: "wob" } } },
    { data: null },
  ]);
  const b = baseEssayage(client);
  assert.deepEqual(await b.lireEssai("e1", "a"), { id: "e1", fournisseur: "fashn", travailId: "pred", statut: "en_cours", raison: null, creeLe: Date.parse("2026-10-19T12:00:00.000Z") });
  assert.deepEqual(appels[0].filtres, [["id", "e1"], ["acheteur_id", "a"]]);
  assert.equal(appels[0].table, "zabelie_essayage_essais");
  assert.deepEqual(await b.lireVetement("p"), { imageUrl: "https://x/robe.jpg", titre: "Robe", sousRayon: "wob" });
  assert.deepEqual(appels[1].filtres, [["id", "p"], ["status", "published"]]);
  assert.equal(await b.lireVetement("p"), null);
});

test("B4 — garde : rien de l'essayage n'écrit dans Supabase Storage ni ne journalise une image", () => {
  const fichiers: string[] = [];
  const parcourir = (d: string) => {
    for (const n of readdirSync(d)) {
      const c = join(d, n);
      if (statSync(c).isDirectory()) parcourir(c);
      else if (/\.(ts|tsx)$/.test(n)) fichiers.push(c);
    }
  };
  for (const d of ["lib/essayage", "app/api/essayage"]) {
    try {
      parcourir(d);
    } catch {
      // app/api/essayage n'existe qu'à partir de la tâche 4.2.
    }
  }
  for (const n of readdirSync("components").filter((n) => n.startsWith("essayage-"))) fichiers.push(join("components", n));
  assert.ok(fichiers.length >= 6, "les fichiers de l'essayage sont lus");
  for (const f of fichiers) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /\.storage\b|from\(["'](avatars|covers|product-media)["']\)/, `${f} : pas de Storage`);
    assert.doesNotMatch(src, /console\.(log|info|warn|error)\([^)]*(image|photo|base64|octets)/, `${f} : pas d'image au journal`);
  }
});
