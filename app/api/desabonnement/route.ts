import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, rateLimit } from "@/lib/zabelie-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JETON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Désabonnement des relances (0124). POST seulement : un GET ne coupe rien,
 * sans quoi les scanners de liens des messageries désabonneraient tout le
 * monde. Sert le bouton de `/desabonnement/[jeton]` (formulaire) et le
 * « un clic » des messageries (`List-Unsubscribe-Post`, RFC 8058).
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const parLien = url.searchParams.get("jeton");
  let jeton = parLien ?? "";
  if (!jeton && (req.headers.get("content-type") ?? "").includes("form")) {
    jeton = String((await req.formData().catch(() => null))?.get("jeton") ?? "");
  }
  if (!JETON.test(jeton)) return NextResponse.json({ ok: false }, { status: 400 });
  const admin = createAdminClient();
  // Le jeton suffit à protéger le geste (122 bits) ; le plafond borne l'essai à l'aveugle.
  if (!(await rateLimit(admin, `desabonnement:${clientIp(req)}`, 10))) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const { data, error } = await admin.rpc("zabelie_email_desabonner", { p_jeton: jeton });
  if (error) return NextResponse.json({ ok: false }, { status: 503 });
  // Le formulaire revient sur la page ; la messagerie lit le code.
  if (!parLien) {
    return NextResponse.redirect(new URL(`/desabonnement/${jeton}?${data ? "ok" : "invalide"}=1`, url), 303);
  }
  return NextResponse.json({ ok: Boolean(data) }, { status: data ? 200 : 404 });
}
