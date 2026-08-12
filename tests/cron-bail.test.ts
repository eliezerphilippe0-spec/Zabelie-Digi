import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { avecBail } from "../lib/cron-lease";

/**
 * LE BAIL D'EXÉCUTION — ce qu'il garantit, et ce qu'il ne prétend pas.
 *
 * Mesuré AVANT de l'écrire, et ça change ce que ce test doit prouver : les
 * sept crons du dépôt sont déjà sûrs en concurrence, chacun par son propre
 * moyen. `mature_wallets()` tient dans une instruction dont le
 * `update … where status = 'maturing' … returning` verrouille la ligne ; les
 * balayages portent `for update skip locked`. Le bail ne répare donc AUCUN
 * défaut existant — il rend la sûreté structurelle au lieu de la laisser
 * dépendre du soin de chaque auteur.
 *
 * Ce qui doit être prouvé ici est donc précis :
 *   1. le refus EMPÊCHE le travail (sinon le bail est décoratif) ;
 *   2. le bail est rendu même quand le travail échoue (sinon un incident
 *      bloque tous les passages suivants jusqu'au TTL) ;
 *   3. la libération est QUALIFIÉE par le détenteur (sinon une exécution
 *      périmée libère le bail de celle qui a pris sa place) ;
 *   4. schéma absent → fail-open, délibérément.
 */

/** Client Supabase simulé : seules les deux RPC du bail sont servies. */
function clientSimule(opts: {
  acquis?: boolean;
  erreurAcquisition?: string;
}) {
  const appels: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      appels.push({ fn, args });
      if (fn === "zabelie_cron_lease_acquire") {
        if (opts.erreurAcquisition) return { data: null, error: { message: opts.erreurAcquisition } };
        return { data: opts.acquis ?? true, error: null };
      }
      return { data: true, error: null };
    },
  } as never;
  return { client, appels };
}

test("bail refusé → le travail n'a PAS lieu", async () => {
  const { client, appels } = clientSimule({ acquis: false });
  let execute = false;
  const { bail, resultat } = await avecBail(client, "k", "d", async () => {
    execute = true;
    return "fait";
  });
  assert.equal(execute, false, "Le travail s'est exécuté malgré un bail refusé — le bail est décoratif.");
  assert.equal(bail.autorise, false);
  assert.equal(resultat, null);
  assert.equal(
    appels.filter((a) => a.fn === "zabelie_cron_lease_release").length,
    0,
    "Une exécution qui n'a pas pris le bail ne doit surtout pas le libérer : elle rendrait celui d'un autre."
  );
});

test("bail pris → le travail a lieu, et le bail est rendu", async () => {
  const { client, appels } = clientSimule({ acquis: true });
  const { bail, resultat } = await avecBail(client, "k", "d", async () => "fait");
  assert.equal(bail.autorise, true);
  assert.equal(resultat, "fait");
  assert.equal(appels.filter((a) => a.fn === "zabelie_cron_lease_release").length, 1);
});

test("travail en échec → le bail est RENDU quand même", async () => {
  const { client, appels } = clientSimule({ acquis: true });
  await assert.rejects(
    avecBail(client, "k", "d", async () => {
      throw new Error("balayage cassé");
    }),
    /balayage cassé/
  );
  assert.equal(
    appels.filter((a) => a.fn === "zabelie_cron_lease_release").length,
    1,
    "Sans libération dans un `finally`, un seul incident bloque TOUS les " +
      "passages suivants jusqu'à l'expiration du TTL — un cron qui gèle des " +
      "escrows resterait muet pendant dix minutes après la moindre erreur."
  );
});

test("la libération est qualifiée par le détenteur, jamais par la clé seule", async () => {
  const { client, appels } = clientSimule({ acquis: true });
  await avecBail(client, "fulfillment_sweep", "porteur-42", async () => null);
  const release = appels.find((a) => a.fn === "zabelie_cron_lease_release");
  assert.ok(release);
  assert.equal(
    release!.args.p_detenteur,
    "porteur-42",
    "Sans le détenteur, une exécution qui a dépassé son TTL libérerait le " +
      "bail de celle qui travaille à sa place, et un troisième porteur entrerait."
  );
});

test("schéma absent → fail-open assumé, et journalisé", async () => {
  const { client } = clientSimule({ erreurAcquisition: 'relation "zabelie_cron_leases" does not exist' });
  const lignes: Record<string, unknown>[] = [];
  let execute = false;
  const { bail } = await avecBail(
    client,
    "k",
    "d",
    async () => {
      execute = true;
      return null;
    },
    { journal: (c) => lignes.push(c) }
  );
  assert.equal(execute, true, "Un cron qui gèle des escrows ne s'abstient pas parce qu'une table de verrous manque.");
  assert.equal(bail.motif, "schema_absent");
  assert.ok(
    lignes.some((l) => l.bail === "indisponible"),
    "Sans journal, « la table n'existe pas » et « le bail a été pris » produisent le même silence."
  );
});

test("la migration porte les deux gardes du pattern", () => {
  const mig = readFileSync("supabase/migrations/0060_cron_leases.sql", "utf8")
    .replace(/--[^\n]*/g, "");
  // La CONDITION qui commande la reprise, pas le mot « expire_a ».
  assert.match(
    mig,
    /on conflict \(cle\) do update[\s\S]{0,400}where zabelie_cron_leases\.expire_a < now\(\)/,
    "Sans le `where … expire_a < now()`, tout appel volerait le bail en cours."
  );
  assert.match(
    mig,
    /update zabelie_cron_leases[\s\S]{0,300}and detenteur = p_detenteur/,
    "La libération doit porter sur le couple (clé, détenteur)."
  );
});

test("le cron de balayage renonce vraiment quand le bail est tenu", () => {
  const src = readFileSync("app/api/fulfillment/sweep/route.ts", "utf8");
  // L'assertion porte sur la CONDITION qui commande le renoncement, pas sur
  // la présence du libellé : un `if (false)` laisserait le texte intact.
  assert.match(
    src,
    /if \(!bail\.autorise\)[\s\S]{0,300}return NextResponse\.json/,
    "Le renoncement doit être commandé par `!bail.autorise` et rendre la main."
  );
  assert.match(src, /avecBail\(/);
});
