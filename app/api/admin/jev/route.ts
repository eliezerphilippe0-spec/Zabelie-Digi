import { erreurTraduite } from "@/lib/api-erreur";
import { exigerTraceAdmin } from "@/lib/admin-audit";
import { getAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { classifySupportMessage, jevConfigured } from "@/lib/jev-server";
import { readJevInput } from "@/lib/jev";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

async function failure(key: Parameters<typeof erreurTraduite>[0], status: number) {
  const response = await erreurTraduite(key, status);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Admin + MFA only. Observation: no customer message sent, no business mutation. */
export async function POST(req: Request) {
  try {
    const user = await getAdminUser();
    if (!user || user.role !== "admin") return failure("api.access.denied", 403);
    if (req.headers.get("origin") !== new URL(req.url).origin) return failure("api.access.denied", 403);
    if (req.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return failure("api.params.invalid", 415);
    if (!jevConfigured()) return failure("api.unavailable", 503);
    let input;
    try { input = await readJevInput(req); }
    catch { return failure("api.params.invalid", 400); }
    // Existing atomic limiter: privileged client restricted to counters and the audit trail.
    // No customer data is read with service-role and no quota is billed to users.
    const limiter = createAdminClient();
    if (!(await rateLimit(limiter, `jev:${user.id}`, 5, 60)) ||
        !(await rateLimit(limiter, "jev:global:day", 100, 86400))) {
      return failure("api.rate.limited", 429);
    }
    if (!(await exigerTraceAdmin(limiter, {
      actorId: user.id, action: "jev.classify", metadata: { mode: "observation" },
    }))) return failure("api.audit.unavailable", 503);
    return json({ mode: "observation", result: await classifySupportMessage(input.message) });
  } catch {
    return failure("api.unavailable", 503);
  }
}
