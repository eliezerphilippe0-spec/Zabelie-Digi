import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adresseIpPrivee, envoyerUne, genererSecret, lookupPublic, repartir, signer, urlWebhookValide, verifierSignature, type Envoyeur, type Livraison,
} from "../lib/webhooks";

const SQL = readFileSync("supabase/migrations/0122_zabelie_webhooks.sql", "utf8");
const T = 1_790_000_000;

test("H1 — signature : vérifiable, liée au corps, au secret et à l'heure", () => {
  const secret = genererSecret();
  assert.match(secret, new RegExp(SQL.match(/secret ~ '([^']+)'/)![1]));
  const corps = JSON.stringify({ type: "sale.paid", data: { amount_htg: 1500 } });
  const sig = signer(secret, T, corps);
  assert.match(sig, /^t=\d+,v1=[0-9a-f]{64}$/);
  assert.equal(verifierSignature(secret, sig, corps, T + 10), true);
  assert.equal(verifierSignature(secret, sig, corps.replace("1500", "15000"), T), false, "corps modifié");
  assert.equal(verifierSignature(genererSecret(), sig, corps, T), false, "autre secret");
  assert.equal(verifierSignature(secret, sig, corps, T + 301), false, "rejeu tardif");
  // Valeur de référence calculée HORS du module : la signature couvre `<t>.<corps>`,
  // donc changer l'heure d'un en-tête capturé ne la rend pas valide.
  const attendu = createHmac("sha256", secret).update(`${T}.${corps}`).digest("hex");
  assert.equal(sig, `t=${T},v1=${attendu}`);
  assert.equal(verifierSignature(secret, sig.replace(`t=${T}`, `t=${T + 200}`), corps, T + 200), false, "heure substituée");
  for (const mauvais of [null, "", "t=abc,v1=00", `v1=${"0".repeat(64)}`, `t=${T},v1=${"0".repeat(63)}`]) {
    assert.equal(verifierSignature(secret, mauvais, corps, T), false, String(mauvais));
  }
});

test("H2 — adresses privées refusées (IPv4, IPv6, IPv4 mappée)", () => {
  for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.4", "172.31.255.255", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "pas-une-ip"]) {
    assert.equal(adresseIpPrivee(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700::1111"]) assert.equal(adresseIpPrivee(ip), false, ip);
});

test("H3 — adresse de réception : https public seulement, et la base l'accepte aussi", () => {
  const sqlUrl = new RegExp(SQL.match(/url ~ '([^']+)'/)![1].replace("[^\\s/?#@]", "[^\\s/?#@]"));
  for (const ok of ["https://boutik.example/hooks/zabelie", "https://shop.example.ht/h?x=1", "https://boutik.example:443/h"]) {
    const u = urlWebhookValide(ok);
    assert.ok(u, ok);
    assert.match(u!, sqlUrl, `${u} serait refusée par la contrainte SQL`);
  }
  assert.equal(urlWebhookValide("https://boutik.example/h#frag"), "https://boutik.example/h");
  for (const non of ["http://boutik.example/h", "https://127.0.0.1/h", "https://[::1]/h", "https://localhost/h", "https://user:pw@boutik.example/h",
    "https://boutik.example:8443/h", "https://api.internal/h", "https://intranet/h", "ftp://boutik.example", "", 42, "https://x.example/" + "a".repeat(500)]) {
    assert.equal(urlWebhookValide(non), null, String(non));
  }
});

test("H4 — la résolution est vérifiée À LA CONNEXION : une seule adresse privée suffit à refuser", async () => {
  const faux = (adresses: string[]) => ((_h: string, _o: object, cb: (e: Error | null, a: unknown) => void) =>
    cb(null, adresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })))) as never;
  const resoudre = (adresses: string[]) => new Promise<string>((res) =>
    lookupPublic(faux(adresses))("boutik.example", {}, (err, a) => res(err ? err.message : String(a))));
  assert.equal(await resoudre(["93.184.216.34"]), "93.184.216.34");
  assert.equal(await resoudre(["10.0.0.5"]), "adresse_privee");
  assert.equal(await resoudre(["93.184.216.34", "127.0.0.1"]), "adresse_privee", "DNS rebinding partiel");
  assert.equal(await resoudre([]), "adresse_privee");
  assert.match(readFileSync("lib/webhooks.ts", "utf8"), /httpsRequest\(url, \{[\s\S]{0,200}lookup: lookupPublic\(\)/, "l'envoi réel doit passer par le lookup filtré");
});

const livraison = (o: Partial<Livraison> = {}): Livraison => ({
  delivery_id: "d1", url: "https://boutik.example/h", secret: genererSecret(), event_id: "e1", event_type: "sale.paid",
  payload: { type: "sale.paid", data: { amount_htg: 1500 } }, attempts: 1, ...o,
});

test("H5 — un envoi porte une signature valide ; seul un 2xx compte comme reçu", async () => {
  const l = livraison();
  let vu: { entetes: Record<string, string>; corps: string } | null = null;
  const ok: Envoyeur = async (_u, entetes, corps) => { vu = { entetes, corps }; return { status: 204 }; };
  assert.deepEqual(await envoyerUne(l, ok, T), { ok: true, status: 204, erreur: null });
  assert.ok(verifierSignature(l.secret, vu!.entetes["Zabelie-Signature"], vu!.corps, T));
  assert.equal(vu!.entetes["Zabelie-Event"], "sale.paid");
  assert.equal((await envoyerUne(l, async () => ({ status: 302 }), T)).ok, false, "une redirection n'est pas une réception");
  assert.equal((await envoyerUne(l, async () => ({ status: 500 }), T)).erreur, "http_500");
  assert.deepEqual(await envoyerUne(l, async () => { throw new Error("timeout"); }, T), { ok: false, status: null, erreur: "timeout" });
  let appele = false;
  await envoyerUne(livraison({ url: "https://10.0.0.1/h" }), async () => { appele = true; return { status: 200 }; }, T);
  assert.equal(appele, false, "une adresse refusée ne part jamais");
});

test("H6 — le répartiteur enregistre chaque résultat et ne lève jamais", async () => {
  const lots = [[livraison({ delivery_id: "a" }), livraison({ delivery_id: "b", url: "https://autre.example/h" })], []];
  const enregistres: unknown[] = [];
  const admin = { rpc: async (nom: string, args: Record<string, unknown>) => {
    if (nom === "zabelie_webhook_claim") return { data: lots.shift() ?? [], error: null };
    enregistres.push(args); return { data: "x", error: null };
  } } as unknown as SupabaseClient;
  const bilan = await repartir(admin, { envoyer: async (u) => ({ status: u.includes("autre") ? 500 : 200 }) });
  assert.deepEqual(bilan, { envoyes: 2, livres: 1, echecs: 1, erreurBase: false });
  assert.deepEqual(enregistres.map((a) => [(a as { p_delivery: string }).p_delivery, (a as { p_ok: boolean }).p_ok]).sort(), [["a", true], ["b", false]]);
  const enPanne = { rpc: async () => ({ data: null, error: { message: "panne" } }) } as unknown as SupabaseClient;
  assert.equal((await repartir(enPanne)).erreurBase, true);
});

test("H7 — câblage : chaque confirmation et le remboursement déclenchent l'envoi, APRÈS la notification", () => {
  for (const f of ["app/api/moncash/return/route.ts", "app/api/kobara/webhook/route.ts", "app/api/stripe/webhook/route.ts", "app/api/admin/confirm-zelle/route.ts"]) {
    assert.match(readFileSync(f, "utf8"), /notifyOrderPaid\(admin, [\w.]+\)\.catch\(\(\) => undefined\);\s*repartirApresReponse\(admin\);/, f);
  }
  assert.match(readFileSync("app/api/admin/refund/route.ts", "utf8"), /if \(error\) \{[\s\S]{0,120}\}\s*repartirApresReponse\(admin\);/);
  assert.match(readFileSync("lib/webhooks-apres.ts", "utf8"), /after\(async \(\) => \{ await repartir\(admin, \{ lots: 1 \}\); \}\)/);
  const cron = JSON.parse(readFileSync("vercel.json", "utf8")).crons.map((c: { path: string }) => c.path);
  assert.ok(cron.includes("/api/webhooks/dispatch"));
  assert.match(readFileSync("app/api/webhooks/dispatch/route.ts", "utf8"), /if \(!authorize\(req\)\) \{[\s\S]{0,300}status: 401/);
});

test("H8 — le secret : généré à la création, jamais relu par le tableau de bord, et le trigger ne bloque pas un paiement", () => {
  const creer = readFileSync("app/api/account/webhooks/route.ts", "utf8");
  assert.match(creer, /const secret = genererSecret\(\);[\s\S]{0,200}\.insert\(\{ seller_id: user\.id, url, secret, events \}\)/);
  const page = readFileSync("app/tableau-de-bord/api/page.tsx", "utf8");
  const selection = page.match(/from\("zabelie_webhook_endpoints"\)\.select\("([^"]+)"\)/)![1];
  assert.doesNotMatch(selection, /secret/);
  const desactiver = readFileSync("app/api/account/webhooks/[id]/route.ts", "utf8");
  assert.match(desactiver, /\.eq\("id", id\)\s*\.eq\("seller_id", user\.id\)\s*\.is\("disabled_at", null\)/);
  assert.match(SQL, /begin\s+select seller_id into v_seller[\s\S]{0,1600}exception when others then[\s\S]{0,120}raise warning/);
});

test("H9 — l'exemple de vérification publié sur /developpeurs fonctionne vraiment", async () => {
  const { createHmac: ch, timingSafeEqual: tse } = await import("node:crypto");
  const page = readFileSync("app/developpeurs/page.tsx", "utf8");
  const code = page.match(/const exempleSignature = `([\s\S]*?)`;/)![1].replace(/^import .*$/m, "");
  const valide = new Function("createHmac", "timingSafeEqual", "Buffer", `${code}; return isValidZabelieWebhook;`)(ch, tse, Buffer) as
    (s: string, e: string, c: string) => boolean;
  const secret = genererSecret();
  const corps = JSON.stringify({ type: "sale.paid" });
  const maintenant = Math.floor(Date.now() / 1000);
  assert.equal(valide(secret, signer(secret, maintenant, corps), corps), true);
  assert.equal(valide(secret, signer(secret, maintenant, corps), corps + " "), false);
  assert.equal(valide(secret, signer(secret, maintenant - 600, corps), corps), false);
});
