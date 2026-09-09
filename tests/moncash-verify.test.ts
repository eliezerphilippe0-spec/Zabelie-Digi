import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifierMonCash } from "../lib/moncash";

/**
 * LA SONDE QUI POSE LA QUESTION À MONCASH.
 *
 * Ce qui la motive, mesuré en production le 2026-09-05 : quinze paiements,
 * sept `failed` et sept `pending`, **aucune référence opérateur**. Le rail n'a
 * jamais abouti depuis l'ouverture, et rien ne dit pourquoi — l'acheteur voit
 * « Création de la commande impossible », le porteur voit un 502, et la cause
 * reste invisible. Or les causes s'excluent et appellent des gestes
 * différents : une clé du bac à sable employée en production ne se corrige pas
 * comme un MonCash injoignable.
 *
 * Mutations éprouvées (chacune passée, chacune rouge) :
 *   MV2  le 401 rend `ok` au lieu de `identifiants_refuses`   → rouge
 *   MV4  le mode sandbox rend `ok` au lieu de `bac_a_sable`   → rouge
 *   MV6  le secret est ajouté au rapport                      → rouge
 *   MV7  le `fetch` qui lève est traité comme un refus        → rouge
 */

/** Remplace `fetch` et l'environnement le temps d'un appel, et les rend. */
async function sous<T>(
  env: Record<string, string | undefined>,
  faux: typeof fetch,
  fn: () => Promise<T>,
): Promise<{ valeur: T; journal: string[] }> {
  const avantFetch = globalThis.fetch;
  const avantEnv: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    avantEnv[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const journal: string[] = [];
  const erreurAvant = console.error;
  const infoAvant = console.info;
  console.error = (...a: unknown[]) => void journal.push(a.map(String).join(" "));
  console.info = (...a: unknown[]) => void journal.push(a.map(String).join(" "));
  globalThis.fetch = faux;
  try {
    return { valeur: await fn(), journal };
  } finally {
    globalThis.fetch = avantFetch;
    console.error = erreurAvant;
    console.info = infoAvant;
    for (const [k, v] of Object.entries(avantEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const IDENTIFIANTS = {
  MONCASH_CLIENT_ID: "id-de-test",
  MONCASH_CLIENT_SECRET: "SECRET_MONCASH_A_NE_JAMAIS_VOIR_98765",
};
const reponse = (statut: number, corps: unknown): Response =>
  ({ status: statut, ok: statut >= 200 && statut < 300, json: async () => corps }) as Response;
const jamaisAppele: typeof fetch = async () => {
  throw new Error("fetch ne devait pas être appelé");
};

test("MV1 — identifiants absents : `absente`, et MonCash n'est même pas interrogé", async () => {
  const { valeur } = await sous(
    { MONCASH_CLIENT_ID: undefined, MONCASH_CLIENT_SECRET: undefined, MONCASH_MODE: "sandbox" },
    jamaisAppele,
    verifierMonCash,
  );
  assert.equal(valeur.verdict, "absente");
  assert.equal(valeur.identifiantsPresents, false);
  assert.equal(valeur.statutFournisseur, null, "aucune question posée → aucun statut");
});

test("MV2 — MonCash refuse (401) : `identifiants_refuses`, et l'explication nomme le piège des deux portails", async () => {
  const { valeur } = await sous(
    { ...IDENTIFIANTS, MONCASH_MODE: "production" },
    async () => reponse(401, { message: "unauthorized" }),
    verifierMonCash,
  );
  assert.equal(valeur.verdict, "identifiants_refuses");
  assert.equal(valeur.statutFournisseur, 401);
  assert.equal(valeur.jetonObtenu, false);
  // La cause la plus fréquente doit être NOMMÉE : c'est ce qui fait la
  // différence entre un diagnostic et un code d'erreur.
  assert.match(valeur.explication, /bac à sable|portail/i);
});

test("MV3 — MonCash injoignable : `injoignable`, et le rapport le dit sans accuser les clés", async () => {
  const { valeur } = await sous(
    { ...IDENTIFIANTS, MONCASH_MODE: "production" },
    async () => {
      throw new TypeError("fetch failed");
    },
    verifierMonCash,
  );
  assert.equal(valeur.verdict, "injoignable");
  assert.equal(valeur.statutFournisseur, null);
  assert.match(
    valeur.explication,
    /ne dit RIEN des identifiants/,
    "un injoignable ne doit jamais se lire comme un refus",
  );
});

test("MV4 — jeton obtenu MAIS mode sandbox : `bac_a_sable`, jamais `ok`", async () => {
  // Le cas le plus traître : tout « marche », et pas une gourde ne circulera.
  const { valeur } = await sous(
    { ...IDENTIFIANTS, MONCASH_MODE: "sandbox" },
    async () => reponse(200, { access_token: "jeton-bac-a-sable", expires_in: 3600 }),
    verifierMonCash,
  );
  assert.equal(valeur.verdict, "bac_a_sable");
  assert.equal(valeur.jetonObtenu, true);
  assert.equal(valeur.mode, "sandbox");
  assert.match(valeur.hote ?? "", /^sandbox\./, "le bac à sable a son propre hôte");
});

test("MV5 — jeton obtenu en production : `ok`, sur l'hôte de production", async () => {
  const { valeur } = await sous(
    { ...IDENTIFIANTS, MONCASH_MODE: "production" },
    async () => reponse(200, { access_token: "jeton-production", expires_in: 3600 }),
    verifierMonCash,
  );
  assert.equal(valeur.verdict, "ok");
  assert.equal(valeur.mode, "production");
  assert.equal(valeur.hote, "moncashbutton.digicelgroup.com");
  assert.doesNotMatch(valeur.hote ?? "", /sandbox/);
});

test("MV6 — AUCUN secret, dans AUCUN verdict, ni dans le rapport ni dans les journaux", async () => {
  /* ⚠️ ON ASSERTE SUR LE JSON SÉRIALISÉ, pas sur les champs connus. Un champ
   * ajouté demain — « les quatre premiers caractères, pour vérifier que c'est
   * la bonne clé » — passerait une assertion écrite champ par champ. Le jeton
   * obtenu est un secret au même titre que le client secret. */
  const SECRET = IDENTIFIANTS.MONCASH_CLIENT_SECRET;
  const JETON = "JETON_A_NE_JAMAIS_VOIR_abcdef";
  const cas: [string, typeof fetch][] = [
    ["production", async () => reponse(200, { access_token: JETON, expires_in: 3600 })],
    ["sandbox", async () => reponse(200, { access_token: JETON, expires_in: 3600 })],
    // Le cas retors : MonCash renvoie la clé dans son propre corps d'erreur.
    ["production", async () => reponse(401, { message: `secret ${SECRET} rejected` })],
  ];
  for (const [mode, rep] of cas) {
    const { valeur, journal } = await sous({ ...IDENTIFIANTS, MONCASH_MODE: mode }, rep, verifierMonCash);
    const rendu = JSON.stringify(valeur);
    assert.ok(!rendu.includes(SECRET), `le client secret apparaît dans le rapport (${valeur.verdict})`);
    assert.ok(!rendu.includes(JETON), `le jeton apparaît dans le rapport (${valeur.verdict})`);
    assert.ok(!rendu.includes("A_NE_JAMAIS_VOIR"), `un fragment de secret survit (${valeur.verdict})`);
    const tout = journal.join("\n");
    assert.ok(!tout.includes(SECRET), "le client secret apparaît dans les JOURNAUX");
    assert.ok(!tout.includes(JETON), "le jeton apparaît dans les JOURNAUX");
  }
});

test("MV7 — la sonde ne CRÉE rien : un seul appel, vers /oauth/token", async () => {
  // Une sonde qui créerait un paiement d'essai laisserait des commandes
  // fantômes en base — ce dépôt en compte déjà quatorze.
  const appels: string[] = [];
  await sous({ ...IDENTIFIANTS, MONCASH_MODE: "production" }, async (url) => {
    appels.push(String(url));
    return reponse(200, { access_token: "j", expires_in: 3600 });
  }, verifierMonCash);
  assert.equal(appels.length, 1, `${appels.length} appels réseau, 1 attendu`);
  assert.match(appels[0], /\/oauth\/token$/);
  assert.ok(
    !appels.some((u) => /CreatePayment|Payment\/Redirect/i.test(u)),
    "aucune création de paiement",
  );
});

test("MV8 — la route est réservée à l'administration et journalise dans les deux sens", () => {
  const src = readFileSync("app/api/admin/moncash-verify/route.ts", "utf8");
  // Ce qui COMMANDE : le garde et son refus, pas un mot dans un commentaire.
  assert.match(src, /if \(!\(await autoriserAdmin\(req\)\)\) \{\s*return erreurTraduite\("api\.access\.denied", 401\);/);
  assert.match(src, /verdict === "ok"[\s\S]{0,120}console\.info/);
  assert.match(src, /\} else \{[\s\S]{0,120}console\.error/);
});


test("MV9 — une panne HTTP ou une limitation de débit ne constitue pas un refus des clés", async () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    const { valeur } = await sous({ ...IDENTIFIANTS, MONCASH_MODE: "production" }, async () => reponse(status, {}), verifierMonCash);
    assert.equal(valeur.verdict, "fournisseur_indisponible", `HTTP ${status}`);
    assert.equal(valeur.statutFournisseur, status);
    assert.equal(valeur.jetonObtenu, false);
  }
});

test("MV10 — une réponse OAuth inattendue reste indéterminée, jamais une authentification réussie", async () => {
  const cases: typeof fetch[] = [
    async () => reponse(404, {}),
    async () => reponse(200, null),
    async () => reponse(200, []),
    async () => reponse(200, {}),
    async () => reponse(200, { access_token: 123 }),
    async () => reponse(200, { access_token: "   " }),
    async () => ({ ...reponse(200, {}), json: async () => { throw new SyntaxError("Invalid JSON"); } }) as Response,
  ];
  for (const response of cases) {
    const { valeur } = await sous({ ...IDENTIFIANTS, MONCASH_MODE: "production" }, response, verifierMonCash);
    assert.equal(valeur.verdict, "reponse_invalide");
    assert.equal(valeur.jetonObtenu, false);
  }
});

test("MV11 — les exceptions réseau et valeurs de configuration ne divulguent aucun secret", async () => {
  const secret = IDENTIFIANTS.MONCASH_CLIENT_SECRET;
  for (const mode of ["production", secret]) {
    const { valeur, journal } = await sous({ ...IDENTIFIANTS, MONCASH_MODE: mode }, async () => {
      throw new Error(`Network error containing ${secret}`);
    }, verifierMonCash);
    assert.ok(!JSON.stringify({ valeur, journal }).includes(secret));
  }
});


for (const phase of ["headers", "body"] as const) {
  test(`MV12 — le délai annule la requête pendant ${phase} et rend un diagnostic lisible`, async () => {
    let signal: AbortSignal | null = null;
    const { valeur } = await sous({ ...IDENTIFIANTS, MONCASH_MODE: "production" }, async (_url, init) => {
      signal = init?.signal ?? null;
      const wait = () => new Promise<never>((_resolve, reject) => {
        if (!signal) { reject(new Error("missing signal")); return; }
        signal.addEventListener("abort", () => reject(signal!.reason), { once: true });
      });
      if (phase === "headers") return wait();
      return { ...reponse(200, {}), json: wait } as Response;
    }, () => verifierMonCash({ timeoutMs: 20 }));
    assert.ok(signal, "la requête doit recevoir le signal d'annulation");
    assert.equal((signal as AbortSignal).aborted, true);
    assert.equal(valeur.verdict, "injoignable");
    assert.equal(valeur.statutFournisseur, phase === "body" ? 200 : null);
    assert.equal(valeur.jetonObtenu, false);
    assert.match(valeur.explication, /délai/);
  });
}

test("MV13 — le succès de la sonde n'annonce pas un encaissement validé", async () => {
  const { valeur } = await sous({ ...IDENTIFIANTS, MONCASH_MODE: "production" }, async () => reponse(200, { access_token: "j" }), verifierMonCash);
  assert.equal(valeur.verdict, "ok");
  assert.match(valeur.explication, /ne confirme aucun encaissement/);
});
