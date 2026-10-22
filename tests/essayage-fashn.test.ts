import { test } from "node:test";
import assert from "node:assert/strict";

import { fashn } from "../lib/essayage/fournisseurs/fashn";
import { ErreurFournisseur, type PhotoAcheteur, type VetementEssaye } from "../lib/essayage/fournisseurs/types";
import { lireFournisseur } from "../lib/essayage/fournisseur";

/**
 * ESSAYAGE VIRTUEL — adaptateur FASHN (docs/74 §3 ; tasks/essayage-todo.md 2.2).
 *
 * Aucun appel réseau : un faux `fetch` rejoue les réponses de la
 * documentation officielle (docs.fashn.ai, relevée le 2026-10-19) et
 * enregistre ce que l'adaptateur envoie. La photo de l'acheteur doit partir
 * en base64 : FASHN garde sans limite les URL envoyées dans son historique.
 */

const CLE = "fa-cle-de-test-ne-pas-utiliser";
const BASE = "https://api.fashn.ai/v1";
const PHOTO: PhotoAcheteur = { octets: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 7]), type: "image/jpeg" };
const vetement = (piece: VetementEssaye["piece"]): VetementEssaye => ({ imageUrl: "https://exemple.supabase.co/storage/v1/object/public/covers/v.jpg", titre: "Vêtement", piece });
const ID = "123a87r9-4129-4bb3-be18-9c9fb5bd7fc1-u1";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 4, 4]);
const JPEG_B64 = Buffer.from(JPEG).toString("base64");

type Reponse = Response | (() => Promise<Response>);
function fauxFetch(reponses: Reponse[]) {
  const appels: Request[] = [];
  const f = async (entree: RequestInfo | URL, init?: RequestInit) => {
    const requete = new Request(entree, init);
    appels.push(requete);
    const suivante = reponses.shift();
    if (!suivante) throw new Error("appel inattendu : " + requete.url);
    return typeof suivante === "function" ? suivante() : suivante;
  };
  return { f: f as typeof fetch, appels };
}
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });
const statut = (s: string, extra: Record<string, unknown> = {}) => json({ id: ID, status: s, output: null, error: null, ...extra });
const travail = { fournisseur: "fashn" as const, id: ID };

test("X1 — créer : la photo part en base64 (jamais en URL), modération stricte, résultat en base64", async () => {
  const { f, appels } = fauxFetch([json({ id: ID, error: null })]);
  const t = await fashn({ cle: CLE, fetch: f }).creer(PHOTO, vetement("entier"));
  assert.deepEqual(t, { fournisseur: "fashn", id: ID });
  const [run] = appels;
  assert.equal(run.method, "POST");
  assert.equal(run.url, `${BASE}/run`);
  assert.equal(run.headers.get("authorization"), `Bearer ${CLE}`);
  assert.deepEqual(await run.json(), {
    model_name: "tryon-v1.6",
    inputs: {
      model_image: `data:image/jpeg;base64,${Buffer.from(PHOTO.octets).toString("base64")}`,
      garment_image: vetement("entier").imageUrl,
      category: "one-pieces",
      moderation_level: "conservative",
      return_base64: true,
      output_format: "jpeg",
    },
  });
});

test("X2 — la catégorie suit ce que couvre le vêtement", async () => {
  const cas: [VetementEssaye["piece"], string][] = [["haut", "tops"], ["bas", "bottoms"], ["entier", "one-pieces"], ["ensemble", "auto"]];
  for (const [piece, categorie] of cas) {
    const { f, appels } = fauxFetch([json({ id: ID, error: null })]);
    await fashn({ cle: CLE, fetch: f }).creer(PHOTO, vetement(piece));
    assert.equal(((await appels[0].json()) as { inputs: { category: string } }).inputs.category, categorie, piece);
  }
});

test("X3 — statut : en attente, puis le résultat en base64 ; une URL est récupérée sans la clé ; « _expired » est un échec", async () => {
  const { f, appels } = fauxFetch([statut("starting"), statut("in_queue"), statut("processing"), statut("completed", { output: [`data:image/jpeg;base64,${JPEG_B64}`] })]);
  const x = fashn({ cle: CLE, fetch: f });
  for (let i = 0; i < 3; i++) assert.deepEqual(await x.statut(travail), { etat: "en_cours" });
  assert.deepEqual(await x.statut(travail), { etat: "reussi", image: { type: "image/jpeg", base64: JPEG_B64 } });
  assert.equal(appels[0].url, `${BASE}/status/${ID}`);
  assert.equal(appels[0].headers.get("authorization"), `Bearer ${CLE}`);

  const url = fauxFetch([statut("completed", { output: [`https://cdn.fashn.ai/${ID}/output_0.jpeg`] }), new Response(JPEG, { headers: { "content-type": "image/jpeg" } })]);
  assert.deepEqual(await fashn({ cle: CLE, fetch: url.f }).statut(travail), { etat: "reussi", image: { type: "image/jpeg", base64: JPEG_B64 } });
  assert.equal(url.appels[1].headers.get("authorization"), null, "la clé ne part jamais vers l'hôte de l'image");

  // Une URL sans chiffrement (http://) est refusée : l'image pourrait être modifiée en chemin.
  for (const output of [["_expired"], [], null, ["data:image/gif;base64,R0lG"], [`data:image/jpeg;base64,${"A".repeat(15 * 1024 * 1024)}`], [`http://cdn.fashn.ai/${ID}/output_0.jpeg`]]) {
    const { f: g } = fauxFetch([statut("completed", { output })]);
    assert.deepEqual(await fashn({ cle: CLE, fetch: g }).statut(travail), { etat: "echec", raison: "fournisseur" }, JSON.stringify(output)?.slice(0, 40));
  }
});

test("X4 — un échec de traitement devient une raison connue", async () => {
  const cas: [string, string][] = [
    ["ContentModerationError", "moderation"],
    ["PoseError", "photo_refusee"],
    ["ImageLoadError", "fournisseur"],
    ["InputValidationError", "fournisseur"],
    ["ThirdPartyError", "fournisseur"],
    ["UnavailableError", "fournisseur"],
    ["PipelineError", "fournisseur"],
    ["ErreurInconnue", "fournisseur"],
  ];
  for (const [name, raison] of cas) {
    const { f } = fauxFetch([statut("failed", { error: { name, message: "…" } })]);
    assert.deepEqual(await fashn({ cle: CLE, fetch: f }).statut(travail), { etat: "echec", raison }, name);
  }
});

test("X5 — un refus à la création lève une erreur typée, sans jamais citer la clé", async () => {
  for (const r of [json({ error: "UnauthorizedAccess" }, 401), json({ error: "OutOfCredits" }, 429), json({ error: "BadRequest" }, 400), json({ error: "InternalServerError" }, 500), json({ error: null })]) {
    const { f } = fauxFetch([r]);
    await assert.rejects(fashn({ cle: CLE, fetch: f }).creer(PHOTO, vetement("haut")), (e: unknown) => {
      assert.ok(e instanceof ErreurFournisseur);
      assert.equal(e.raison, "fournisseur");
      assert.ok(!e.message.includes(CLE));
      return true;
    });
  }
});

test("X6 — statut : une gêne passagère reste « en cours » ; une erreur définitive ou un travail abîmé est un échec", async () => {
  for (const r of [json({ error: "RateLimitExceeded" }, 429), json({ error: "InternalServerError" }, 500), () => Promise.reject(new TypeError("fetch failed"))]) {
    const { f } = fauxFetch([r]);
    assert.deepEqual(await fashn({ cle: CLE, fetch: f }).statut(travail), { etat: "en_cours" });
  }
  for (const r of [json({ error: "NotFound" }, 404), json({ error: "UnauthorizedAccess" }, 401), statut("etat-inconnu")]) {
    const { f } = fauxFetch([r]);
    assert.deepEqual(await fashn({ cle: CLE, fetch: f }).statut(travail), { etat: "echec", raison: "fournisseur" });
  }
  const { f, appels } = fauxFetch([]);
  for (const id of ["", "a/b", "../etat", "id avec espace"]) {
    assert.deepEqual(await fashn({ cle: CLE, fetch: f }).statut({ fournisseur: "fashn", id }), { etat: "echec", raison: "fournisseur" }, id);
  }
  assert.deepEqual(await fashn({ cle: CLE, fetch: f }).statut({ fournisseur: "genlook", id: ID }), { etat: "echec", raison: "fournisseur" });
  assert.equal(appels.length, 0);
});

test("X7 — délais bornés : la création échoue en « délai », le statut reste « en cours »", async () => {
  const attendreAbandon: typeof fetch = (_e, init) => new Promise((_, rejeter) => init?.signal?.addEventListener("abort", () => rejeter(init.signal!.reason)));
  const lent = fashn({ cle: CLE, fetch: attendreAbandon, delaiAppelMs: 20 });
  await assert.rejects(lent.creer(PHOTO, vetement("bas")), (e: unknown) => e instanceof ErreurFournisseur && e.raison === "delai");
  assert.deepEqual(await lent.statut(travail), { etat: "en_cours" });
});

test("X8 — effacer : rien à appeler (pas de point d'effacement ; l'entrée base64 est supprimée à la fin du traitement)", async () => {
  const { f, appels } = fauxFetch([]);
  await fashn({ cle: CLE, fetch: f }).effacer(travail);
  assert.equal(appels.length, 0);
});

test("X9 — FASHN s'allume avec sa clé, jamais sans, jamais sur une prévisualisation", () => {
  const base = { ZABELIE_ESSAYAGE_ENABLED: "true", ZABELIE_ESSAYAGE_FOURNISSEUR: "fashn" };
  assert.equal(lireFournisseur({ ...base, FASHN_API_KEY: CLE })?.nom, "fashn");
  assert.equal(lireFournisseur({ ...base }), null);
  assert.equal(lireFournisseur({ ...base, FASHN_API_KEY: " " }), null);
  assert.equal(lireFournisseur({ ...base, GENLOOK_API_KEY: CLE }), null, "la clé de l'autre fournisseur ne compte pas");
  assert.equal(lireFournisseur({ ...base, FASHN_API_KEY: CLE, VERCEL_ENV: "preview" }), null);
});
