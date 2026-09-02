import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { alerterAdmins, corpsAlerte } from "../lib/alertes";

/**
 * L'ALERTE SORTANTE (C2.3) — éprouvée sur ses quatre issues, pas seulement
 * sur la bonne. Une alerte qui échoue en silence est exactement le défaut
 * qu'elle existe pour corriger.
 */

type Envoi = { to: string; subject: string };

function admin(opts: { admins: string[]; emails: Record<string, string | null>; erreur?: string }) {
  const chaine = {
    select: () => chaine,
    eq: () =>
      Promise.resolve(
        opts.erreur
          ? { data: null, error: { message: opts.erreur } }
          : { data: opts.admins.map((id) => ({ id })), error: null }
      ),
  };
  return {
    from: () => chaine,
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: opts.emails[id] ? { email: opts.emails[id] } : null },
        }),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

test("A1 — deux admins, deux e-mails → envoyée", async () => {
  const envois: Envoi[] = [];
  const r = await alerterAdmins(
    admin({ admins: ["a", "b"], emails: { a: "a@x.ht", b: "b@x.ht" } }),
    "sujet",
    "<p>corps</p>",
    { envoyer: async (i) => { envois.push(i); return true; }, emailActif: () => true }
  );
  assert.equal(r.statut, "envoyee");
  assert.equal(r.envoyes, 2);
  assert.deepEqual(envois.map((e) => e.to).sort(), ["a@x.ht", "b@x.ht"]);
});

test("A2 — e-mail non configuré → le DIT, n'envoie rien, ne lève pas", async () => {
  let appele = false;
  const r = await alerterAdmins(
    admin({ admins: ["a"], emails: { a: "a@x.ht" } }),
    "s", "c",
    { envoyer: async () => { appele = true; return true; }, emailActif: () => false }
  );
  assert.equal(r.statut, "email_non_configure");
  assert.equal(appele, false, "sans clé, aucun envoi ne doit même être tenté");
  assert.match(r.detail, /RESEND_API_KEY/);
});

test("A3 — aucun profil admin → aucun_destinataire", async () => {
  const r = await alerterAdmins(admin({ admins: [], emails: {} }), "s", "c", {
    envoyer: async () => true, emailActif: () => true,
  });
  assert.equal(r.statut, "aucun_destinataire");
});

test("A4 — un admin sans e-mail n'empêche pas l'autre : partielle", async () => {
  const r = await alerterAdmins(
    admin({ admins: ["a", "b"], emails: { a: "a@x.ht", b: null } }),
    "s", "c",
    { envoyer: async () => true, emailActif: () => true }
  );
  assert.equal(r.statut, "partielle");
  assert.equal(r.envoyes, 1);
  assert.equal(r.destinataires, 2);
});

test("A5 — le fournisseur refuse tout → echec, pas « envoyée »", async () => {
  const r = await alerterAdmins(
    admin({ admins: ["a"], emails: { a: "a@x.ht" } }),
    "s", "c",
    { envoyer: async () => false, emailActif: () => true }
  );
  assert.equal(r.statut, "echec");
});

test("A6 — lecture des admins en erreur → echec nommé, pas une exception", async () => {
  const r = await alerterAdmins(admin({ admins: [], emails: {}, erreur: "boum" }), "s", "c", {
    envoyer: async () => true, emailActif: () => true,
  });
  assert.equal(r.statut, "echec");
  assert.match(r.detail, /boum/);
});

test("A7 — le corps échappe le HTML : une explication hostile ne devient pas du balisage", () => {
  const html = corpsAlerte("t", [["k", "<script>x</script>"]]);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

/* ── A8 — CROISEMENT : la route déclenche l'alerte sur ce qui COMMANDE ─────
 * Ancré sur le `if` qui porte les deux déclencheurs, pas sur la présence du
 * nom `alerterAdmins` quelque part. Un `if (false && …)` doit rougir. */
test("A8 — la route de cohérence appelle alerterAdmins sous la condition exacte", () => {
  const route = readFileSync(
    join(import.meta.dirname, "..", "app/api/admin/coherence/route.ts"),
    "utf8"
  );
  assert.match(
    route,
    /if \(alerteRequise\(cheminArgent\.verdict\) \|\| registreRompu\)\s*\{\s*alerte = await alerterAdmins\(/,
    "l'alerte doit être déclenchée par le verdict OU l'écart registre, et par rien d'autre"
  );
  assert.match(route, /const registreRompu = Boolean\(data && data\.ok === false\)/);
  assert.match(route, /alerte,\s*\}\);/, "le résultat de l'alerte doit sortir dans la réponse");
});
