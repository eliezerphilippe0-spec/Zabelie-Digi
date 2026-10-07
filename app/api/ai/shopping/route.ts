import { createHash } from "node:crypto";
import { getLang } from "@/lib/i18n-server";
import { SHOPPING_COPY } from "@/lib/shopping-ai-copy";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { rateLimit, clientIp } from "@/lib/zabelie-rate-limit";
import { readApiBody } from "@/lib/api/v1/transport";
import { aiProviderDisponible } from "@/lib/ai-description";
import { ShoppingRequestSchema, nextShoppingQuestion } from "@/lib/shopping-ai";
import { extractShoppingIntent } from "@/lib/shopping-ai-provider";
import { getShoppingRecommendations } from "@/lib/shopping-ai-catalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function fail(code: string, status: number) {
  const labels = SHOPPING_COPY[await getLang()];
  return reply({ error: status === 429 ? labels.limit : status === 503 && code === "shopping_provider" ? labels.chatUnavailable : labels.error, code }, status);
}

/** Public read-only assistant. All purchase mutations stay behind the existing checkout. */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  // Next.js can normalize req.url to localhost behind its server/proxy.
  // The Host header retains the authority actually addressed by the browser.
  const url = new URL(req.url);
  const requestOrigin = `${url.protocol}//${req.headers.get("host") ?? url.host}`;
  if (origin && origin !== requestOrigin) return fail("shopping_origin", 403);
  let input;
  try { input = ShoppingRequestSchema.parse(await readApiBody(req)); }
  catch { return fail("shopping_input", 400); }
  if (!isSupabaseConfigured()) return fail("shopping_unavailable", 503);
  if (input.message && !aiProviderDisponible()) return fail("shopping_provider", 503);
  try {
    const admin = createAdminClient();
    const ipHash = createHash("sha256").update(clientIp(req)).digest("hex");
    if (!await rateLimit(admin, `shopping:${ipHash}`, 10, 60)) return fail("shopping_limit", 429);
    if (input.message && !await rateLimit(admin, `shopping_day:${ipHash}`, 50, 86400)) return fail("shopping_limit", 429);
    if (input.message && !await rateLimit(admin, "shopping_global", 500, 86400)) return fail("shopping_limit", 429);
    const intent = input.message ? await extractShoppingIntent(input.intent, input.message) : input.intent;
    const question = nextShoppingQuestion(intent);
    const recommendations = question ? [] : await getShoppingRecommendations(intent, input.sellerId);
    return reply({ intent, question, recommendations });
  } catch {
    // Neither user messages, locations, provider responses nor secrets go to logs.
    console.warn("[shopping-ai] request_unavailable");
    return fail("shopping_unavailable", 503);
  }
}
