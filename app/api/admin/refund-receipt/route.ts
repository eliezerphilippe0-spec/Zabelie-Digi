import { exigerTraceAdmin } from "@/lib/admin-audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { erreurTraduite } from "@/lib/api-erreur";
export const dynamic="force-dynamic";
const input=z.object({orderId:z.string().uuid(),method:z.enum(["moncash","natcash","stripe","zelle","bank","cash"]),reference:z.string().trim().min(5).max(120),paidAt:z.string().datetime(),confirmed:z.literal(true)}).strict();
export async function POST(req:Request){
 const user=await getAdminUser();
 if(!user||user.role !== "admin") return erreurTraduite("api.access.denied",403);
 let body;try{body=input.safeParse(await req.json());}catch{return erreurTraduite("api.json.invalid",400);}
 if(!body.success) return erreurTraduite("api.params.invalid",400);
 const trace = await exigerTraceAdmin(createAdminClient(), {actorId:user.id,action:"refund.receipt.attempt",targetType:"order",targetId:body.data.orderId});
 if (!trace) return erreurTraduite("api.unavailable",503);
 const {data,error}=await createAdminClient().rpc("zabelie_record_refund_receipt",{p_order_id:body.data.orderId,p_actor:user.id,p_method:body.data.method,p_reference:body.data.reference,p_paid_at:body.data.paidAt});
 if(error) return erreurTraduite("api.unavailable",error.code==="23505"||error.code==="22023"?409:503);
 return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
}
