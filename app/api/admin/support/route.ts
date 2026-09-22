import { exigerTraceAdmin } from "@/lib/admin-audit";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { caseUpdateInput } from "@/lib/support-case";
import { erreurTraduite } from "@/lib/api-erreur";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
 const user = await getAdminUser();
 if (!user || user.role !== "admin") return erreurTraduite("api.access.denied",403);
 let body; try { body=caseUpdateInput.safeParse(await req.json()); } catch {return erreurTraduite("api.json.invalid",400);}
 if (!body.success) return erreurTraduite("api.params.invalid",400);
 const trace = await exigerTraceAdmin(createAdminClient(), {actorId:user.id,action:"support.reply_attempt",targetType:"order",targetId:body.data.orderId});
 if (!trace) return erreurTraduite("api.unavailable",503);
 const {data,error}=await createAdminClient().rpc("zabelie_submit_support",{
 p_order_id:body.data.orderId,p_actor:user.id,p_request_id:body.data.requestId,p_reason:"other",p_body:body.data.message,p_status:body.data.status,
 });
 if(error) return erreurTraduite("api.unavailable",503);
 return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
}
