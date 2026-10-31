import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPairSync, verify } from "node:crypto";
import { loadRoute } from "./helpers/route-harness";
import { adressePushAcceptable, envoyerSignal, jetonVapid, lireClesVapid } from "../lib/web-push";
import { ECHECS_MAX, signalerVentePush } from "../lib/notifications-push";
import { afficherNotificationVente, ouvrirMesVentes, texteNotificationVente, URL_VENTES } from "../lib/notification-vente";

/**
 * Notifications de vente, page fermée (niveau 2, 0169). Éprouvé sur le code réel :
 * clés VAPID, jeton signé, liste d'hôtes (SSRF), envoi sans contenu, signalement
 * unique par vente, route d'abonnement, service worker, câblage.
 */

function paire() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const priv = privateKey.export({ format: "jwk" });
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x!, "base64url"), Buffer.from(pub.y!, "base64url")]);
  return { publique: point.toString("base64url"), privee: priv.d!, publicKey };
}
const A = paire();
const B = paire();
const SUJET = "mailto:contact@zabelie.com";
const cles = () => lireClesVapid(A.publique, A.privee, SUJET)!;
const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));

// ── Clés et jeton ─────────────────────────────────────────────────────────
test("clés VAPID : une paire valide s'allume ; une seule pièce fausse éteint tout", () => {
  assert.ok(cles(), "paire valide");
  assert.equal(lireClesVapid(A.publique, B.privee, SUJET), null, "clé privée d'une AUTRE paire");
  assert.equal(lireClesVapid(A.publique, A.privee, undefined), null, "sujet absent");
  assert.equal(lireClesVapid(A.publique, A.privee, "contact@zabelie.com"), null, "sujet ni mailto ni https");
  assert.equal(lireClesVapid(A.publique.slice(4), A.privee, SUJET), null, "clé publique tronquée");
  assert.equal(lireClesVapid(A.publique, A.privee.slice(2), SUJET), null, "clé privée tronquée");
  assert.equal(lireClesVapid(undefined, A.privee, SUJET), null);
});

test("jeton VAPID : signé ES256 par la clé privée, aud = origine du service, 12 h", () => {
  const maintenant = Date.UTC(2026, 9, 31, 12, 0, 0);
  const jeton = jetonVapid("https://fcm.googleapis.com/fcm/send/abc", cles(), maintenant);
  const [entete, corps, signature] = jeton.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(entete, "base64url").toString()), { typ: "JWT", alg: "ES256" });
  assert.deepEqual(JSON.parse(Buffer.from(corps, "base64url").toString()), {
    aud: "https://fcm.googleapis.com", exp: maintenant / 1000 + 12 * 3600, sub: SUJET,
  });
  const ok = (cle: typeof A.publicKey, donnees: string) =>
    verify("sha256", Buffer.from(donnees), { key: cle, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"));
  assert.equal(ok(A.publicKey, `${entete}.${corps}`), true, "vérifié par la clé publique annoncée");
  assert.equal(ok(B.publicKey, `${entete}.${corps}`), false, "pas par une autre");
  assert.equal(ok(A.publicKey, `${entete}.${corps}x`), false, "un corps altéré ne passe pas");
});

test("liste d'hôtes : seuls les services de notification connus, jamais une URL quelconque (SSRF)", () => {
  for (const bonne of [
    "https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QGx", "https://db5p.notify.windows.com/w/?token=abc",
  ]) assert.equal(adressePushAcceptable(bonne), true, bonne);
  for (const mauvaise of [
    "http://fcm.googleapis.com/fcm/send/abc", "https://fcm.googleapis.com.evil.com/x", "https://evil.com/fcm.googleapis.com",
    "https://user@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://localhost/x", "https://169.254.169.254/latest",
    "https://notify.windows.com.evil.com/x", "https://evilfcm.googleapis.com/x", "https://xweb.push.apple.com/x", "pas une url", 42, null, `https://fcm.googleapis.com/${"a".repeat(2100)}`,
  ]) assert.equal(adressePushAcceptable(mauvaise), false, String(mauvaise).slice(0, 60));
});

// ── Envoi ─────────────────────────────────────────────────────────────────
test("envoi : un POST VIDE signé ; 404/410 = abonnement mort ; le reste = échec ; hôte inconnu jamais appelé", async () => {
  const appels: Array<{ url: string; init: RequestInit }> = [];
  const repondre = (status: number) => (async (url: string, init: RequestInit) => { appels.push({ url, init }); return new Response(null, { status }); }) as unknown as typeof fetch;
  assert.equal(await envoyerSignal("https://fcm.googleapis.com/fcm/send/a", cles(), repondre(201)), "envoye");
  const { init } = appels[0];
  assert.equal(init.method, "POST");
  assert.equal(init.body, undefined, "aucun contenu ne part");
  const h = init.headers as Record<string, string>;
  assert.match(h.Authorization, new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${A.publique}$`));
  assert.equal(h.TTL, "86400");
  assert.equal(h["Content-Length"], "0");
  assert.equal(await envoyerSignal("https://fcm.googleapis.com/fcm/send/a", cles(), repondre(410)), "expire");
  assert.equal(await envoyerSignal("https://fcm.googleapis.com/fcm/send/a", cles(), repondre(404)), "expire");
  assert.equal(await envoyerSignal("https://fcm.googleapis.com/fcm/send/a", cles(), repondre(500)), "echec");
  assert.equal(await envoyerSignal("https://fcm.googleapis.com/fcm/send/a", cles(), (async () => { throw new Error("réseau"); }) as unknown as typeof fetch), "echec");
  const avant = appels.length;
  assert.equal(await envoyerSignal("https://evil.com/x", cles(), repondre(201)), "expire");
  assert.equal(appels.length, avant, "un hôte inconnu n'est jamais appelé");
});

// ── Signalement d'une vente ───────────────────────────────────────────────
function base(options: { statut?: string; dejaReservee?: boolean; abonnements?: Array<{ id: string; endpoint: string; echecs: number }> }) {
  const journal: Array<{ table: string; op: string; args: unknown[] }> = [];
  const admin = {
    from(table: string) {
      const etat: { op: string; args: unknown[] } = { op: "select", args: [] };
      const q = {
        select(...a: unknown[]) { if (etat.op === "select") etat.args = a; return q; },
        upsert(...a: unknown[]) { etat.op = "upsert"; etat.args = a; return q; },
        update(...a: unknown[]) { etat.op = "update"; etat.args = a; return q; },
        delete() { etat.op = "delete"; return q; },
        eq(...a: unknown[]) { etat.args = [...etat.args, ["eq", ...a]]; return q; },
        maybeSingle: async () => {
          journal.push({ table, op: "lecture", args: etat.args });
          return { data: options.statut === undefined ? null : { status: options.statut, product: { seller_id: "vendeur-1" } } };
        },
        then(r: (v: unknown) => unknown) {
          journal.push({ table, op: etat.op, args: etat.args });
          if (table === "zabelie_push_ventes" && etat.op === "upsert") return Promise.resolve({ data: options.dejaReservee ? [] : [{ order_id: "o1" }], error: null }).then(r);
          if (table === "zabelie_push_abonnements" && etat.op === "select") return Promise.resolve({ data: options.abonnements ?? [] }).then(r);
          return Promise.resolve({ data: null, error: null }).then(r);
        },
      };
      return q;
    },
  };
  return { admin: admin as never, journal };
}
const parStatut = (map: Record<string, number>) => (async (url: string) => new Response(null, { status: map[url] ?? 500 })) as unknown as typeof fetch;

test("signal : rien sans clés, rien pour une commande non payée, rien au rejeu", async () => {
  const sansCles = base({ statut: "paid" });
  await signalerVentePush(sansCles.admin, "o1", null);
  assert.equal(sansCles.journal.length, 0, "éteint : aucune lecture");

  const enAttente = base({ statut: "pending" });
  await signalerVentePush(enAttente.admin, "o1", cles());
  assert.equal(enAttente.journal.some((j) => j.table === "zabelie_push_ventes"), false, "commande non payée : aucune réservation");

  const rejeu = base({ statut: "paid", dejaReservee: true, abonnements: [{ id: "a", endpoint: "https://fcm.googleapis.com/x", echecs: 0 }] });
  let envois = 0;
  await signalerVentePush(rejeu.admin, "o1", cles(), (async () => { envois += 1; return new Response(null, { status: 201 }); }) as unknown as typeof fetch);
  assert.equal(envois, 0, "déjà signalée : aucun envoi");
});

test("signal : chaque appareil ; réussite notée, abonnement mort retiré, échec compté, dix échecs = retiré", async () => {
  const abonnements = [
    { id: "ok", endpoint: "https://fcm.googleapis.com/ok", echecs: 3 },
    { id: "mort", endpoint: "https://fcm.googleapis.com/mort", echecs: 0 },
    { id: "panne", endpoint: "https://fcm.googleapis.com/panne", echecs: 1 },
    { id: "use", endpoint: "https://fcm.googleapis.com/use", echecs: ECHECS_MAX - 1 },
  ];
  const b = base({ statut: "paid", abonnements });
  const logs: string[] = [];
  const log = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
  try {
    await signalerVentePush(b.admin, "o1", cles(), parStatut({ "https://fcm.googleapis.com/ok": 201, "https://fcm.googleapis.com/mort": 410 }));
  } finally {
    console.log = log;
  }
  const sur = (op: string, id: string) => b.journal.find((j) => j.table === "zabelie_push_abonnements" && j.op === op && json(j.args).some((x: unknown) => JSON.stringify(x) === JSON.stringify(["eq", "id", id])));
  assert.ok(sur("update", "ok") && json(sur("update", "ok")!.args)[0].echecs === 0, "réussite : échecs remis à zéro");
  assert.ok(sur("delete", "mort"), "410 : abonnement retiré");
  assert.equal(json(sur("update", "panne")!.args)[0].echecs, 2, "échec : compté");
  assert.ok(sur("delete", "use"), `${ECHECS_MAX} échecs de suite : retiré`);
  const reserve = b.journal.find((j) => j.table === "zabelie_push_ventes" && j.op === "upsert")!;
  assert.deepEqual(json(reserve.args), [{ order_id: "o1" }, { onConflict: "order_id", ignoreDuplicates: true }]);
  const lectureAbonnes = b.journal.find((j) => j.table === "zabelie_push_abonnements" && j.op === "select")!;
  assert.ok(json(lectureAbonnes.args).some((x: unknown) => JSON.stringify(x) === JSON.stringify(["eq", "user_id", "vendeur-1"])), "les appareils du VENDEUR de la commande");
  assert.ok(logs.some((l) => l.includes('"envoyes":1')), "le journal compte");
  assert.ok(!logs.some((l) => l.includes("fcm.googleapis.com")), "le journal ne porte jamais une adresse d'appareil");
});

// ── Route d'abonnement ────────────────────────────────────────────────────
function route(options: { user?: { id: string } | null; cles?: boolean; compte?: number } = {}) {
  const ecritures: Array<{ op: string; args: unknown[] }> = [];
  const admin = {
    from() {
      const etat: { op: string; args: unknown[] } = { op: "select", args: [] };
      const q = {
        select(...a: unknown[]) { etat.args = a; return q; },
        upsert(...a: unknown[]) { etat.op = "upsert"; etat.args = a; return q; },
        delete() { etat.op = "delete"; return q; },
        eq(...a: unknown[]) { etat.args = [...etat.args, ["eq", ...a]]; return q; },
        neq(...a: unknown[]) { etat.args = [...etat.args, ["neq", ...a]]; return q; },
        then(r: (v: unknown) => unknown) {
          if (etat.op !== "select") ecritures.push({ op: etat.op, args: etat.args });
          return Promise.resolve({ count: options.compte ?? 0, error: null }).then(r);
        },
      };
      return q;
    },
  };
  const mod = loadRoute("app/api/seller/push/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.user === undefined ? { id: "vendeur-1" } : options.user } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/web-push": { adressePushAcceptable, lireClesVapid: () => (options.cles === false ? null : cles()) },
  }) as { POST(r: Request): Promise<Response>; DELETE(r: Request): Promise<Response> };
  const requete = (methode: string, corps: unknown, origine = "https://zabelie.com") =>
    new Request("https://zabelie.com/api/seller/push", { method: methode, headers: { "Content-Type": "application/json", origin: origine, host: "zabelie.com" }, body: JSON.stringify(corps) });
  return { mod, ecritures, requete };
}
const APPAREIL = "https://fcm.googleapis.com/fcm/send/appareil";

test("route : refus avant toute écriture (sans clés, sans session, autre origine, adresse étrangère)", async () => {
  let r = route({ cles: false });
  assert.equal((await r.mod.POST(r.requete("POST", { endpoint: APPAREIL }))).status, 404);
  r = route({ user: null });
  assert.equal((await r.mod.POST(r.requete("POST", { endpoint: APPAREIL }))).status, 401);
  r = route();
  assert.equal((await r.mod.POST(r.requete("POST", { endpoint: APPAREIL }, "https://evil.com"))).status, 403);
  assert.equal((await r.mod.POST(r.requete("POST", { endpoint: "https://evil.com/x" }))).status, 400);
  assert.equal(r.ecritures.length, 0);
});

test("route : l'appareil est inscrit au compte connecté ; plafond d'appareils ; désinscription bornée au compte", async () => {
  let r = route();
  assert.equal((await r.mod.POST(r.requete("POST", { endpoint: APPAREIL }))).status, 200);
  assert.deepEqual(json(r.ecritures[0]), { op: "upsert", args: [{ user_id: "vendeur-1", endpoint: APPAREIL, echecs: 0 }, { onConflict: "endpoint" }] });
  r = route({ compte: 10 });
  assert.equal((await r.mod.POST(r.requete("POST", { endpoint: APPAREIL }))).status, 409);
  assert.equal(r.ecritures.length, 0, "plafond atteint : rien n'est écrit");
  r = route();
  assert.equal((await r.mod.DELETE(r.requete("DELETE", { endpoint: APPAREIL }))).status, 200);
  assert.deepEqual(json(r.ecritures[0]), { op: "delete", args: [["eq", "user_id", "vendeur-1"], ["eq", "endpoint", APPAREIL]] });
});

// ── Service worker ────────────────────────────────────────────────────────
test("service worker : texte selon la langue du navigateur, kreyòl et français par défaut", () => {
  assert.match(texteNotificationVente("en-US").titre, /new sale/);
  assert.match(texteNotificationVente("es-HT").titre, /nueva venta/);
  for (const l of ["fr-FR", "ht", undefined, ""]) {
    const t = texteNotificationVente(l);
    assert.match(t.titre, /Nouvo vant/);
    assert.match(t.titre, /Nouvelle vente/);
  }
});

test("service worker : une notification par signal, sans tag ; le clic ramène « Mes ventes »", async () => {
  const montrees: Array<{ titre: string; options: Record<string, unknown> }> = [];
  await afficherNotificationVente({ showNotification: async (titre, options) => { montrees.push({ titre, options }); } }, "fr");
  assert.equal(montrees.length, 1);
  assert.equal("tag" in montrees[0].options, false, "un tag remplacerait la vente précédente en silence");
  assert.equal((montrees[0].options.data as { url: string }).url, URL_VENTES);

  const focus: string[] = [];
  const ouvertes: string[] = [];
  const clients = (urls: string[]) => ({
    matchAll: async () => urls.map((url) => ({ url, focus: async () => { focus.push(url); } })),
    openWindow: async (url: string) => { ouvertes.push(url); },
  });
  await ouvrirMesVentes(clients(["https://zabelie.com/", "https://zabelie.com/mes-ventes"]), "https://zabelie.com");
  assert.deepEqual(focus, ["https://zabelie.com/mes-ventes"]);
  await ouvrirMesVentes(clients(["https://autre.example/mes-ventes"]), "https://zabelie.com");
  assert.deepEqual(ouvertes, [URL_VENTES], "un onglet d'une autre origine n'est jamais repris");
});

test("câblage : le service worker écoute push et clic ; notifyOrderPaid planifie le signal AVANT tout await ; la fermeture désabonne", () => {
  const sw = readFileSync("app/sw.ts", "utf8");
  assert.match(sw, /addEventListener\("push", \(event\) => \{\s*event\.waitUntil\(afficherNotificationVente\(self\.registration, self\.navigator\.language\)\)/);
  assert.match(sw, /addEventListener\("notificationclick", \(event\) => \{\s*event\.notification\.close\(\);\s*event\.waitUntil\(ouvrirMesVentes\(self\.clients, self\.location\.origin\)\)/);
  const notify = readFileSync("lib/zabelie-notify.ts", "utf8");
  assert.match(notify, /export async function notifyOrderPaid\([^)]*\): Promise<void> \{\s*(?:\/\/[^\n]*\n\s*)*signalerVenteApresReponse\(admin, orderId\);\s*await notifierUneCommande/);
  const compte = readFileSync("app/api/account/route.ts", "utf8");
  assert.match(compte, /const removals = await Promise\.all\(\[[\s\S]{0,400}admin\.from\("zabelie_push_abonnements"\)\.delete\(\)\.eq\("user_id", user\.id\)/);
});
