import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * UNE FONCTION DE MAINTENANCE SANS APPELANT EST UN DÉFAUT MÉCANIQUEMENT
 * DÉTECTABLE.
 *
 * L'histoire qui produit ce fichier : `zabelie_purge_search_misses()` est née
 * avec `0047`, correcte, révoquée, journalisant même à zéro — et avec zéro
 * appelant. Ses deux seules invocations du dépôt vivaient dans
 * `supabase/tests/search_demand.test.sql`. La suite SQL était verte, la purge
 * était prouvée, et elle n'avait jamais tourné une seule fois. Quatre mois de
 * rétention non bornée seraient passés sans qu'aucun contrôle ne s'exprime,
 * parce que TOUT ce qui existait — migration, tests, revue — regardait la
 * fonction, et rien ne regardait l'endroit d'où elle devait être appelée.
 *
 * C'est le même motif que partout ailleurs dans ce dépôt : l'absence de signal
 * n'était pas un signal. Une fonction jamais appelée ne lève rien, ne
 * journalise rien, ne ralentit rien. Son défaut est invisible PAR NATURE, et
 * seule une vérification croisée peut le rendre visible.
 *
 * Ce que le contrôle croise :
 *   fonctions de maintenance de `supabase/migrations/*.sql`
 *     × RPC appelées par les routes déclarées dans `vercel.json` → `crons`
 *
 * Une fonction qui n'apparaît d'aucun côté échoue le test.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE PROUVE PAS. Il prouve qu'un APPELANT EXISTE dans le
 * dépôt, pas que le cron s'exécute. Un secret absent, un déploiement non
 * promu, un projet Vercel dont les crons sont désactivés — tous laissent ce
 * test vert. La preuve d'EXÉCUTION est le journal de la route, et elle se lit
 * dans Vercel, pas ici. Les deux sont nécessaires ; aucun ne remplace l'autre.
 */

const MIGRATIONS = "supabase/migrations";
const VERCEL = "vercel.json";

/**
 * Ce qui fait qu'une fonction est « de maintenance » : elle est destinée à
 * être déclenchée par le TEMPS, pas par un utilisateur. Le vocabulaire du
 * dépôt est stable là-dessus — purge, expire, sweep, mature, `_job`.
 *
 * Le motif est volontairement large : un faux positif se règle par une ligne
 * d'exemption motivée et visible, un faux négatif ne se règle par rien du tout
 * puisque personne ne saura qu'il a eu lieu. C'est le sens de l'asymétrie.
 */
const MOTIF_MAINTENANCE = /purge|expire|sweep|mature|reconcil|_job\b/;

/**
 * Exemptions — chacune porte sa raison, et le contrôle vérifie les DEUX SENS.
 *
 * Une liste d'exemptions qui ne sait que grandir devient une conformité par
 * usure : on y ajoute, on n'en retire jamais, et au bout d'un an elle décrit
 * l'inverse de ce qu'elle prétend. Le test échoue donc AUSSI quand une entrée
 * de cette liste a gagné un appelant : l'exemption périmée est un défaut au
 * même titre que la fonction orpheline.
 */
const SANS_APPELANT: Record<string, string> = {
  zabelie_fulfillment_sweep:
    "Définie par `0043_fulfillment.sql`, qui est NON APPLIQUÉE et porte trois " +
    "valeurs encore à arbitrer (docs/21). Un cron déclaré aujourd'hui " +
    "appellerait une fonction absente de la base et échouerait chaque jour. " +
    "À câbler EN MÊME TEMPS que l'application de 0043, jamais avant — inscrit " +
    "comme condition dans OPS_TODO.md.",
};

// ─────────────────────────── Extraction ──────────────────────────────────────

/** Noms de fonctions définies par les migrations. */
function fonctionsDeclarees(sql: string): string[] {
  const out: string[] = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+([a-z0-9_]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) out.push(m[1]);
  return out;
}

/** Noms d'RPC invoquées par un module TypeScript (`admin.rpc("…")`). */
function rpcAppelees(ts: string): string[] {
  const out: string[] = [];
  const re = /\.rpc\(\s*["'`]([a-z0-9_]+)["'`]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ts)) !== null) out.push(m[1]);
  return out;
}

/** Chemins de crons déclarés par `vercel.json`. */
function cheminsCron(json: string): string[] {
  const conf = JSON.parse(json) as { crons?: { path: string }[] };
  return (conf.crons ?? []).map((c) => c.path);
}

/** `/api/search/purge` → `app/api/search/purge/route.ts` */
function fichierDeRoute(chemin: string): string {
  return join("app", chemin.replace(/^\//, ""), "route.ts");
}

/**
 * Le croisement, isolé de toute lecture disque pour être testable sur des
 * corpus synthétiques. Rend la liste des fonctions de maintenance sans
 * appelant cron, et la liste des exemptions devenues périmées.
 */
function croiser(
  declarees: string[],
  appeleesParUnCron: Set<string>,
  exemptions: Record<string, string>
): { orphelines: string[]; exemptionsPerimees: string[] } {
  const maintenance = [...new Set(declarees)].filter((f) => MOTIF_MAINTENANCE.test(f));
  const orphelines = maintenance
    .filter((f) => !appeleesParUnCron.has(f))
    .filter((f) => !(f in exemptions))
    .sort();
  const exemptionsPerimees = Object.keys(exemptions)
    .filter((f) => appeleesParUnCron.has(f))
    .sort();
  return { orphelines, exemptionsPerimees };
}

// ─────────────────────── Lecture du dépôt réel ───────────────────────────────

const declarees = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .flatMap((f) => fonctionsDeclarees(readFileSync(join(MIGRATIONS, f), "utf8")));

const chemins = cheminsCron(readFileSync(VERCEL, "utf8"));
const appeleesParUnCron = new Set(
  chemins.flatMap((p) => {
    const fichier = fichierDeRoute(p);
    return existsSync(fichier) ? rpcAppelees(readFileSync(fichier, "utf8")) : [];
  })
);

// ───────────────── L'instrument avant la mesure ──────────────────────────────

/**
 * Connu-positif / connu-négatif sur corpus synthétique.
 *
 * Sans ça, ce fichier serait exactement ce que la doc de méthode interdit : un
 * instrument écrit une fois, jamais éprouvé, dont on ne sait pas s'il peut
 * échouer. Un `MOTIF_MAINTENANCE` mal écrit ou un extracteur qui rend zéro
 * fonction rendraient le test vert POUR TOUJOURS, et le vert serait pris pour
 * une preuve.
 */
test("le croisement voit une fonction orpheline, et se tait quand elle est appelée", () => {
  const decl = ["zabelie_purge_bidon", "zabelie_reserve_stock"];

  // Connu-positif : personne ne l'appelle → elle doit ressortir.
  const positif = croiser(decl, new Set(), {});
  assert.deepEqual(positif.orphelines, ["zabelie_purge_bidon"]);

  // Connu-négatif : un cron l'appelle → silence. Et `zabelie_reserve_stock`
  // n'est jamais remontée : ce n'est pas de la maintenance, c'est un chemin
  // utilisateur. Un motif trop gourmand se verrait ici.
  const negatif = croiser(decl, new Set(["zabelie_purge_bidon"]), {});
  assert.deepEqual(negatif.orphelines, []);

  // Exemption honorée…
  const exempte = croiser(decl, new Set(), { zabelie_purge_bidon: "raison" });
  assert.deepEqual(exempte.orphelines, []);
  assert.deepEqual(exempte.exemptionsPerimees, []);

  // …mais périmée dès que l'appelant existe.
  const perimee = croiser(decl, new Set(["zabelie_purge_bidon"]), {
    zabelie_purge_bidon: "raison",
  });
  assert.deepEqual(perimee.exemptionsPerimees, ["zabelie_purge_bidon"]);
});

/**
 * Les extracteurs voient-ils quelque chose ? Un test dont la matière première
 * est vide passe sans rien vérifier. Ces seuils ne sont pas décoratifs : ils
 * échouent si `create function` change de forme, si `vercel.json` est
 * restructuré, ou si le test est déplacé hors de la racine du dépôt.
 */
test("les extracteurs ont lu le dépôt, et pas le vide", () => {
  assert.ok(declarees.length >= 50, `fonctions déclarées lues : ${declarees.length}`);
  assert.ok(chemins.length >= 5, `crons déclarés lus : ${chemins.length}`);
  assert.ok(
    appeleesParUnCron.size >= 5,
    `RPC appelées par des crons : ${appeleesParUnCron.size}`
  );
  // Ancres nommées : si l'une disparaît, c'est l'extraction qui a bougé, pas
  // le dépôt.
  assert.ok(declarees.includes("zabelie_purge_search_misses"));
  assert.ok(appeleesParUnCron.has("zabelie_expire_stock_reservations"));
  // Chaque chemin de cron doit pointer sur une route qui existe. Un cron vers
  // un fichier absent rend 404 tous les jours en silence — et rendrait ce
  // test vert, faute d'RPC à collecter.
  for (const p of chemins) {
    assert.ok(existsSync(fichierDeRoute(p)), `cron ${p} → ${fichierDeRoute(p)} introuvable`);
  }
});

// ───────────────────────── Le contrôle ───────────────────────────────────────

test("toute fonction de maintenance a un appelant, et toute exemption sert encore", () => {
  const { orphelines, exemptionsPerimees } = croiser(
    declarees,
    appeleesParUnCron,
    SANS_APPELANT
  );

  assert.deepEqual(
    orphelines,
    [],
    `Fonction(s) de maintenance sans appelant cron : ${orphelines.join(", ")}.\n` +
      "Soit lui écrire une route + une entrée dans `vercel.json`, soit " +
      "l'inscrire dans SANS_APPELANT avec la raison qui l'empêche. Ne pas " +
      "élargir le motif pour la faire disparaître."
  );

  assert.deepEqual(
    exemptionsPerimees,
    [],
    `Exemption(s) devenue(s) fausse(s) : ${exemptionsPerimees.join(", ")} ` +
      "— ces fonctions ont maintenant un appelant. Retirer l'entrée de " +
      "SANS_APPELANT : une exemption qu'on ne retire jamais finit par décrire " +
      "l'inverse de ce qu'elle prétend."
  );
});
