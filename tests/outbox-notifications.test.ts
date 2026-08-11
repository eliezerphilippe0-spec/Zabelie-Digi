import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deposerEtTenter, drainerOutbox } from "../lib/outbox";

/**
 * L'OUTBOX DES CONFIRMATIONS DE VENTE — l'asymétrie qu'il comble.
 *
 * Mesuré le 2026-08-11 : `zabelie_fulfillment_notices` (0043) portait déjà
 * `attempts`, `last_error`, un recul exponentiel et une borne de tentatives.
 * La confirmation de vente, elle, faisait ceci :
 *
 *     if (!claimed) return;            // réclamation CONSOMMÉE
 *     await Promise.allSettled(jobs);  // résultat JETÉ
 *     } catch { }                      // échec AVALÉ
 *
 * Le message le plus important du système — celui qui tient lieu de reçu sur
 * ce marché — était le seul sans filet. L'asymétrie n'était pas voulue : elle
 * vient d'avoir instrumenté un chemin et pas l'autre, encore une fois.
 *
 * Ce qui doit être prouvé ici :
 *   1. un envoi qui ÉCHOUE laisse une ligne rattrapable ;
 *   2. un envoi qui rend `false` sans lever compte comme un échec — c'est
 *      exactement ce que `allSettled` confondait avec un succès ;
 *   3. le dépôt précède l'envoi (sinon un plantage perd le message) ;
 *   4. la borne de tentatives arrête vraiment, et l'abandon est compté.
 */

function clientSimule(opts: { enqueueId?: string | null; erreurEnqueue?: string } = {}) {
  const appels: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      appels.push({ fn, args });
      if (fn === "zabelie_outbox_enqueue") {
        if (opts.erreurEnqueue) return { data: null, error: { message: opts.erreurEnqueue } };
        return { data: opts.enqueueId ?? "id-1", error: null };
      }
      return { data: true, error: null };
    },
  } as never;
  return { client, appels };
}

test("envoi qui LÈVE → la ligne est marquée en échec, pas perdue", async () => {
  const { client, appels } = clientSimule();
  const r = await deposerEtTenter(client, "o1", "order_paid_buyer", "a@b.ht", async () => {
    throw new Error("resend indisponible");
  });
  assert.equal(r.envoye, false);
  assert.equal(r.inscrit, true, "Le message doit rester rattrapable après un échec.");
  const echec = appels.find((a) => a.fn === "zabelie_outbox_mark_failed");
  assert.ok(echec, "Aucun `mark_failed` : l'échec est perdu, exactement comme avant 0061.");
  assert.match(String(echec!.args.p_erreur), /resend indisponible/);
});

test("envoi qui rend `false` SANS lever compte aussi comme un échec", async () => {
  // C'est le cas précis que `Promise.allSettled` confondait avec un succès :
  // une promesse résolue à `false` est « settled », donc satisfaisante.
  const { client, appels } = clientSimule();
  const r = await deposerEtTenter(client, "o1", "order_paid_seller", "v@b.ht", async () => false);
  assert.equal(r.envoye, false);
  assert.ok(
    appels.some((a) => a.fn === "zabelie_outbox_mark_failed"),
    "Un fournisseur qui REFUSE sans lever doit être compté en échec."
  );
  assert.ok(!appels.some((a) => a.fn === "zabelie_outbox_mark_sent"));
});

test("le dépôt précède l'envoi", async () => {
  const { client, appels } = clientSimule();
  let ordreVu: string[] = [];
  await deposerEtTenter(client, "o1", "order_paid_buyer", "a@b.ht", async () => {
    ordreVu = appels.map((a) => a.fn);
    return true;
  });
  assert.deepEqual(
    ordreVu,
    ["zabelie_outbox_enqueue", "zabelie_outbox_claim"],
    "Au moment de l'envoi, le dépôt ET la réclamation doivent DÉJÀ avoir eu " +
      "lieu. Le dépôt d'abord, sinon un plantage perd le message ; la " +
      "réclamation ensuite, sinon le drain du cron peut prendre la même ligne " +
      "pendant que cet envoi est en vol et l'acheteur reçoit deux reçus."
  );
});

test("envoi réussi → marqué parti, jamais marqué en échec", async () => {
  const { client, appels } = clientSimule();
  const r = await deposerEtTenter(client, "o1", "order_paid_buyer", "a@b.ht", async () => true);
  assert.equal(r.envoye, true);
  assert.ok(appels.some((a) => a.fn === "zabelie_outbox_mark_sent"));
  assert.ok(!appels.some((a) => a.fn === "zabelie_outbox_mark_failed"));
});

test("schéma absent → fail-open, l'acheteur reçoit quand même", async () => {
  const { client } = clientSimule({ erreurEnqueue: 'relation "zabelie_outbox" does not exist' });
  let envoye = false;
  const r = await deposerEtTenter(client, "o1", "order_paid_buyer", "a@b.ht", async () => {
    envoye = true;
    return true;
  });
  assert.equal(envoye, true, "Refuser d'envoyer parce que la table de reprise manque priverait l'acheteur de sa confirmation.");
  assert.equal(r.inscrit, false);
});

test("le drain n'entame AUCUNE tentative si l'e-mail est désactivé", async () => {
  const { client } = clientSimule();
  let appele = false;
  const c = await drainerOutbox(client, async () => { appele = true; return true; }, false);
  assert.equal(appele, false);
  assert.deepEqual(c, { dus: 0, envoyes: 0, echecs: 0, abandonnes: 0 });
  // Incrémenter `attempts` sans rien tenter épuiserait la borne sur des envois
  // qui n'ont jamais eu lieu — même règle que lib/fulfillment-notices.ts.
});

test("le recul et la borne sont calculés EN BASE, avec un plafond", () => {
  const mig = readFileSync("supabase/migrations/0061_outbox_notifications.sql", "utf8")
    .replace(/--[^\n]*/g, "");
  assert.match(
    mig,
    /due_at\s*=\s*now\(\)\s*\+\s*make_interval[\s\S]{0,160}least\(/,
    "Sans plafond, la huitième tentative tomberait à une semaine : un reçu " +
      "arrivé huit jours plus tard n'est plus un reçu."
  );
  assert.match(
    mig,
    /update zabelie_outbox[\s\S]{0,300}where id = p_id and sent_at is null/,
    "Un message déjà parti ne doit jamais être ré-échoué ni ré-horodaté."
  );
});

test("le drain est appelé par le cron déclaré", () => {
  const cron = readFileSync("app/api/fulfillment/sweep/route.ts", "utf8");
  assert.match(
    cron,
    /drainerOutbox\(/,
    "Sans appelant, la reprise qu'on vient d'écrire n'a jamais lieu — le " +
      "défaut que l'outbox corrige, reproduit un cran plus haut."
  );
  for (const c of ["outbox_dus", "outbox_envoyes", "outbox_echecs", "outbox_abandonnes"]) {
    assert.ok(cron.includes(`${c}: relances.`), `compteur \`${c}\` absent du journal`);
  }
});

test("le dépôt est ATOMIQUE avec la confirmation du paiement", () => {
  const mig = readFileSync("supabase/migrations/0061_outbox_notifications.sql", "utf8")
    .replace(/--[^\n]*/g, "");
  // Mesuré file:line le 2026-08-11 : le dépôt vivait dans une TROISIÈME
  // transaction, après un `claim` déjà consommé dans la deuxième. Un plantage
  // entre les deux perdait le reçu définitivement. L'assertion porte sur ce
  // qui COMMANDE l'atomicité — le trigger sur `payments` — pas sur un libellé.
  assert.match(
    mig,
    /create trigger \w+\s+after update of status on payments/,
    "Sans trigger sur `payments`, le dépôt reste hors de la transaction qui " +
      "confirme l'argent, et « déposer avant d'envoyer » ne suffit pas."
  );
  assert.match(
    mig,
    /if new\.status <> 'confirmed' or coalesce\(old\.status, ''\) = 'confirmed' then/,
    "Le trigger doit ne rien faire hors de la TRANSITION vers `confirmed`."
  );
});

test("l'abandon est un état lisible, pas une déduction", () => {
  const mig = readFileSync("supabase/migrations/0061_outbox_notifications.sql", "utf8")
    .replace(/--[^\n]*/g, "");
  assert.match(mig, /abandonne_a\s+timestamptz/, "colonne d'état terminal absente");
  assert.match(
    mig,
    /set abandonne_a = now\(\)[\s\S]{0,300}attempts >= coalesce\(v_max/,
    "L'abandon doit être POSÉ quand la borne est atteinte. Le déduire d'un " +
      "`attempts >= 5` à la lecture rend la requête day-J dépendante d'une " +
      "constante qui vit ailleurs."
  );
  const ops = readFileSync("OPS_TODO.md", "utf8");
  assert.match(
    ops,
    /abandon_terminal/,
    "Un abandon qu'aucune requête ne compte est un abandon silencieux — le " +
      "défaut que 0061 corrige, reproduit un cran plus haut."
  );
});

test("notifyOrderPaid ne jette plus le résultat de l'envoi", () => {
  const src = readFileSync("lib/zabelie-notify.ts", "utf8");
  assert.doesNotMatch(
    src,
    /Promise\.allSettled\(jobs\)/,
    "`allSettled` traite une promesse résolue à `false` comme un succès : " +
      "c'est la forme exacte du défaut corrigé."
  );
  assert.match(src, /deposerEtTenter\(/);
});
