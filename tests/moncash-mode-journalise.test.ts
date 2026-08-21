import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * LE MODE MONCASH EST INSCRIT EN BASE — parce que son absence a coûté cinq
 * semaines de silence.
 *
 * ⚠️ CE GARDE EST NÉ D'UNE PANNE RÉELLE, PAS D'UN PRINCIPE. Cinq paiements
 * tentés du 2026-08-11 au 2026-08-14, tous terminés en `moncash_unknown_48h`
 * — MonCash répond 404, il ne connaît pas la transaction. Zéro écriture au
 * grand livre depuis l'origine du projet.
 *
 * La cause a été CONFIRMÉE le 2026-08-21, et pas par un instrument : par le
 * porteur, cliquant « Peye ak MonCash » et lisant `sandbox.moncashbutton…`
 * dans la barre d'adresse. Le rail encaissait en bac à sable.
 *
 * Ce que la base disait pendant ce temps : rien. `payments.raw` portait le
 * jeton et le motif d'expiration, jamais l'hôte demandé — donc « mode
 * sandbox » et « l'acheteur a renoncé » laissaient EXACTEMENT la même trace.
 * C'est le corollaire d'observabilité du dépôt, pris en défaut à l'endroit le
 * plus cher : le rail d'argent.
 */

const OAUTH = { access_token: "jeton-test", expires_in: 3600 };
const CREATE = { payment_token: { token: "TOK-123" } };

/** Remplace `fetch` le temps d'un appel, et le rend TOUJOURS — même en cas
 *  d'exception, sinon un échec ici casserait les tests suivants en silence. */
async function avecFetchSimule<T>(travail: () => Promise<T>): Promise<T> {
  const vrai = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const s = String(url);
    const corps = s.includes("/oauth/token") ? OAUTH : CREATE;
    return new Response(JSON.stringify(corps), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    return await travail();
  } finally {
    globalThis.fetch = vrai;
  }
}

type ResultatCreation = {
  paymentToken: string;
  redirectUrl: string;
  mode: string;
  gatewayHost: string;
};

async function creer(mode: string): Promise<ResultatCreation> {
  const avant = { ...process.env };
  process.env.MONCASH_CLIENT_ID = "id-test";
  process.env.MONCASH_CLIENT_SECRET = "secret-test";
  process.env.MONCASH_MODE = mode;
  try {
    /* Import FRAIS à chaque appel : `lib/moncash.ts` garde le jeton OAuth dans
       un cache de module, et un cache partagé entre deux modes ferait passer
       le second appel sans jamais toucher `config()`. Le test mesurerait
       alors le cache, pas le mode — un instrument qui ne regarde plus ce
       qu'il croit regarder. */
    const mod = (await import(`../lib/moncash.ts?mode=${mode}-${Date.now()}`)) as {
      createPayment: (id: string, montant: number) => Promise<ResultatCreation>;
    };
    return await avecFetchSimule(() => mod.createPayment("cmd-1", 300));
  } finally {
    process.env = avant;
  }
}

test("createPayment inscrit le mode ET l'hôte, et l'hôte est celui de la redirection", async () => {
  const bac = await creer("sandbox");

  // ── La LIAISON, et c'est tout l'objet de ce cas ────────────────────────
  // L'hôte inscrit doit être celui de l'URL réellement remise à l'acheteur.
  // Une seconde dérivation depuis l'environnement pourrait diverger de la
  // redirection sans que rien ne le signale — c'est précisément le motif
  // « un intervalle ne prouve rien, il faut qu'une extrémité porte la
  // liaison » de CLAUDE.md, transposé à une valeur.
  assert.equal(
    bac.gatewayHost,
    new URL(bac.redirectUrl).host,
    "gatewayHost ne vient plus de redirectUrl — les deux peuvent diverger"
  );

  // ── Le CONTENU sémantique : sandbox doit se voir ───────────────────────
  assert.equal(bac.mode, "sandbox");
  assert.ok(
    bac.gatewayHost.startsWith("sandbox."),
    `mode sandbox mais hôte « ${bac.gatewayHost} » — c'est la panne du 2026-08-11 à l'envers`
  );

  const prod = await creer("production");
  assert.equal(prod.gatewayHost, new URL(prod.redirectUrl).host);
  assert.equal(prod.mode, "production");
  assert.ok(
    !prod.gatewayHost.startsWith("sandbox."),
    `mode production mais hôte « ${prod.gatewayHost} » — le rail encaisserait en bac à sable`
  );

  // Connu-négatif du couple : les deux modes ne doivent PAS rendre le même
  // hôte. S'ils le rendaient, les deux assertions ci-dessus passeraient pour
  // une raison qui n'a rien à voir avec le mode.
  assert.notEqual(
    bac.gatewayHost,
    prod.gatewayHost,
    "sandbox et production rendent le même hôte : le mode ne commande plus rien"
  );
});

test("le checkout écrit le mode dans payments.raw, depuis la valeur rendue par createPayment", () => {
  // Commentaires décapés : cette route en porte beaucoup, et ils citent
  // légitimement `moncash_mode` en prose. Le garde vise le code exécutable.
  const src = readFileSync("app/api/checkout/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  /* ⚠️ ANCRÉ SUR LA DESTRUCTURATION, PAS SUR L'USAGE. Chercher la seule
     présence de « moncash_mode » resterait vert si quelqu'un écrivait une
     constante en dur à la place de la valeur rendue par createPayment — le
     texte serait toujours là, et il ne dirait plus rien de vrai. Le motif
     exige donc que `mode` soit LIÉ à son producteur avant d'être inscrit. */
  const liaison =
    /const\s*\{[^}]*\bmode\b[^}]*\}\s*=\s*await\s+createPayment\([\s\S]{0,600}moncash_mode:\s*mode/;

  // Connu-positif ET connu-négatif du motif lui-même, sur des chaînes
  // fabriquées : un motif qu'on n'a pas vu échouer n'a rien démontré.
  assert.match(
    "const { redirectUrl, mode } = await createPayment(a, b);\n raw: { moncash_mode: mode }",
    liaison
  );
  assert.doesNotMatch(
    "const { redirectUrl } = await createPayment(a, b);\n raw: { moncash_mode: \"production\" }",
    liaison,
    "le motif accepte une constante en dur — il ne prouve pas la liaison"
  );

  assert.match(
    src,
    liaison,
    "app/api/checkout/route.ts n'inscrit plus `moncash_mode` depuis la valeur rendue par createPayment"
  );
  assert.ok(
    /moncash_host:\s*gatewayHost/.test(src),
    "l'hôte n'est plus inscrit dans payments.raw"
  );
});
