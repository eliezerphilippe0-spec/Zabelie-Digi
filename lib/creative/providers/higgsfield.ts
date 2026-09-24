import { z } from "zod";
import type { Brief } from "../prompt-builder";
import type { CreativeProvider, ResultatSoumission, SoumissionCreative, StatutCreatif } from "./creative";

/**
 * CreativeProvider Higgsfield — Marketing Studio Image 2.0 Alpha.
 *
 * Chaque champ vient de la page « Marketing Studio Image — 2.0 Alpha API »
 * copiée par le porteur le 2026-09-24 (docs/65 §3.1). Ce qui n'y est pas
 * n'est PAS supposé :
 *   - les états intermédiaires : seuls `queued` et `completed` sont documentés.
 *     Tout autre état est rendu `generating` et NOMMÉ au journal (`etatInconnu`),
 *     jamais interprété — le sondage borné de `runGeneration` tranche au délai ;
 *   - l'idempotence : aucune clé n'est documentée. Ce provider n'est donc PAS
 *     idempotent ; l'appelant la garantit EN BASE avant de soumettre (Phase 3).
 *
 * Module sans environnement ni `server-only` : la configuration et le
 * transport sont injectés, pour que les tests n'ouvrent aucun réseau. La
 * lecture des clés vit dans le câblage serveur.
 */

export const HIGGSFIELD_BASE = "https://api.higgsfield.ai";
export const ENDPOINT_IMAGE = "/marketing-studio/image";
export const PROMPT_MAX = 5000;
/** Ratios acceptés par 2.0 Alpha (docs/65 §3.1). `4:5` n'y est pas. */
export const HIGGSFIELD_RATIOS = ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"] as const;

export type HiggsfieldConfig = { keyId: string; keySecret: string; timeoutMs: number };

export function higgsfieldConfigFromEnv(env: Record<string, string | undefined>): HiggsfieldConfig {
  const keyId = env.HF_API_KEY_ID?.trim() ?? "";
  const keySecret = env.HF_API_KEY_SECRET?.trim() ?? "";
  if (!keyId || !keySecret) throw new Error("config_cle_absente : HF_API_KEY_ID / HF_API_KEY_SECRET");
  const timeoutMs = Number(env.HF_TIMEOUT_MS ?? 15_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60_000) throw new Error("config_timeout_invalide : 1000..60000 ms");
  return { keyId, keySecret, timeoutMs };
}

/**
 * Corps de soumission. `enhance_prompt` reste `false` : la réécriture du prompt
 * par Higgsfield annulerait le contrôle R-STUDIO-01 (aucun texte libre,
 * interdits en tête). Sans champ négatif chez Higgsfield, les interdits sont
 * écrits dans le prompt lui-même, APRÈS le prompt positif et avant toute
 * troncature — c'est la troncature qui est refusée, jamais les interdits.
 */
export function buildHiggsfieldBody(brief: Brief, referenceImageUrl: string) {
  const prompt = `${brief.prompt} Strictly avoid: ${brief.negative_prompt}.`;
  if (prompt.length > PROMPT_MAX) throw new Error("prompt_trop_long");
  if (!(HIGGSFIELD_RATIOS as readonly string[]).includes(brief.format)) throw new Error("format_non_supporte");
  const ref = new URL(referenceImageUrl);
  if (ref.protocol !== "https:" || ref.username || ref.password) throw new Error("image_reference_invalide");
  return {
    prompt,
    image_urls: [ref.toString()],
    aspect_ratio: brief.format,
    enhance_prompt: false,
    quality: "high",
    resolution: "2k",
    moderation: "auto",
  } as const;
}

const REF = /^[A-Za-z0-9_-]{1,128}$/;
const soumisSchema = z.object({ request_id: z.string().regex(REF) }).passthrough();
const statutSchema = z.object({
  status: z.string().min(1).max(40),
  images: z.array(z.object({ url: z.string().url() }).passthrough()).optional(),
}).passthrough();

export type Transport = (url: string, init: { method: "GET" | "POST"; headers: Record<string, string>; body?: string; signal: AbortSignal }) =>
  Promise<{ status: number; json: () => Promise<unknown> }>;

const fetchTransport: Transport = async (url, init) => {
  const r = await fetch(url, { ...init, redirect: "error" });
  return { status: r.status, json: () => r.json() };
};

function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export function createHiggsfieldProvider(
  config: HiggsfieldConfig,
  deps: { transport?: Transport; etatInconnu?: (etat: string) => void } = {},
): CreativeProvider {
  const transport = deps.transport ?? fetchTransport;
  const headers = {
    Authorization: `Key ${config.keyId}:${config.keySecret}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const call = async (method: "GET" | "POST", path: string, body?: unknown) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), config.timeoutMs);
    try {
      return await transport(`${HIGGSFIELD_BASE}${path}`, {
        method, headers, signal: ctrl.signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } finally { clearTimeout(t); }
  };

  return {
    name: "higgsfield",
    async submit(job: SoumissionCreative): Promise<ResultatSoumission> {
      let body;
      try { body = buildHiggsfieldBody(job.brief, job.referenceImageUrl); }
      catch (e) { return { ok: false, retryable: false, error: (e as Error).message }; }
      let r;
      try { r = await call("POST", ENDPOINT_IMAGE, body); }
      catch { return { ok: false, retryable: true, error: "reseau" }; }
      if (r.status < 200 || r.status >= 300) return { ok: false, retryable: retryable(r.status), error: `http_${r.status}` };
      const parsed = soumisSchema.safeParse(await r.json().catch(() => null));
      if (!parsed.success) return { ok: false, retryable: false, error: "reponse_invalide" };
      return { ok: true, providerRef: parsed.data.request_id };
    },
    async status(providerRef: string): Promise<StatutCreatif> {
      // L'URL de statut est RECONSTRUITE depuis la référence validée, jamais
      // reprise de la réponse : aucune adresse fournie par un tiers n'est suivie.
      if (!REF.test(providerRef)) return { state: "failed", error: "reference_invalide" };
      const r = await call("GET", `/requests/${providerRef}/status`);
      if (r.status < 200 || r.status >= 300) {
        if (retryable(r.status)) return { state: "generating" };
        return { state: "failed", error: `http_${r.status}` };
      }
      const parsed = statutSchema.safeParse(await r.json().catch(() => null));
      if (!parsed.success) return { state: "failed", error: "reponse_invalide" };
      const { status, images } = parsed.data;
      if (status === "completed") {
        const url = images?.[0]?.url;
        if (!url || !url.startsWith("https://")) return { state: "failed", error: "image_absente" };
        return { state: "completed", imageUrl: url };
      }
      if (status !== "queued") deps.etatInconnu?.(status.replace(/[^a-z_]/gi, "").slice(0, 40));
      return { state: "generating" };
    },
  };
}
