import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { supportInput } from "@/lib/support-case";
import { erreurTraduite } from "@/lib/api-erreur";
import { rateLimit } from "@/lib/zabelie-rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
 const client = await createClient();
 const { data: { user }, error: authError } = await client.auth.getUser();
 if (authError || !user) return erreurTraduite("api.auth.required",401);
 let body; try { body = supportInput.safeParse(await req.json()); } catch { return erreurTraduite("api.json.invalid",400); }
 if (!body.success) return erreurTraduite("api.params.invalid",400);
 const admin = createAdminClient();
 if (!await rateLimit(admin,"support:" + user.id,10)) return erreurTraduite("api.rate.limited",429);
 // The participant endpoint never grants admin authority from a role claim.
 const { data: member, error: membershipError } = await client.rpc("zabelie_order_participant",{p_order_id:body.data.orderId});
 if (membershipError) return erreurTraduite("api.unavailable",503);
 if (!member) return erreurTraduite("api.access.denied",403);
 const { data, error } = await admin.rpc("zabelie_submit_support",{
   p_order_id:body.data.orderId,p_actor:user.id,p_request_id:body.data.requestId,p_reason:body.data.reason,p_body:body.data.message,
 });
 if (error) return erreurTraduite(error.code === "42501" ? "api.access.denied" : "api.unavailable",error.code === "42501" ? 403 : 503);
 return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
}
