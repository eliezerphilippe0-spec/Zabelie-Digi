// Isolated test server: no production keys and loopback binding only.
import {createServer} from "node:http";
const port=Number(process.env.STUB_PORT||54329),appPort=Number(process.env.APP_PORT||3059);
const ids={buyer:"11300000-0000-4000-8000-000000000003",seller:"11300000-0000-4000-8000-000000000001",foreign:"11300000-0000-4000-8000-000000000004",admin:"11300000-0000-4000-8000-000000000005"};
const order="11300000-0000-4000-8000-000000000020",caseId="11300000-0000-4000-8000-000000000030";
let messages=[],status="open";
function token(role){return Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url")+"."+Buffer.from(JSON.stringify({sub:ids[role],aal:role==="admin"?"aal2":"aal1",exp:4102444800,iat:1700000000,role:"authenticated"})).toString("base64url")+".fixture";}
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,"http://127.0.0.1");
 const send=(data,code=200)=>{res.writeHead(code,{"content-type":"application/json","content-range":"0-0/0"});res.end(JSON.stringify(data));};
 const single=rows=>req.headers.accept?.includes("pgrst.object")?send(rows[0]??null):send(rows);
 const body=async()=>{let s="";for await(const c of req)s+=c;return JSON.parse(s||"{}");};
 const jwt=(req.headers.authorization||"").replace("Bearer ","");const role=Object.keys(ids).find(r=>token(r)===jwt)||"buyer";
 if(u.pathname==="/__health")return send({ok:true});
 if(u.pathname==="/__reset"){messages=[];status="open";return send({ok:true});}
 if(u.pathname==="/__messages")return send(messages);
 if(u.pathname==="/__login"){
  const who=Object.keys(ids).includes(u.searchParams.get("role"))?u.searchParams.get("role"):"buyer";
  const session={access_token:token(who),refresh_token:"fixture",expires_at:4102444800,expires_in:3600,token_type:"bearer",user:{id:ids[who],aud:"authenticated",role:"authenticated"}};
  const value="base64-"+Buffer.from(JSON.stringify(session)).toString("base64url");
  const lang=["ht","fr","en","es"].includes(u.searchParams.get("lang"))?u.searchParams.get("lang"):"fr";
  res.writeHead(302,{"set-cookie":["sb-127-auth-token="+value+"; Path=/; SameSite=Lax","zabelie_lang="+lang+"; Path=/; SameSite=Lax"],location:"http://127.0.0.1:"+appPort+(who==="admin"?"/admin/operations":"/assistance/commande/"+order)});return res.end();
 }
 if(u.pathname==="/auth/v1/user")return send({id:ids[role],aud:"authenticated",role:"authenticated",email:role+"@example.ht",app_metadata:{},user_metadata:{},created_at:"2026-01-01T00:00:00Z",factors:role==="admin"?[{id:"fixture",status:"verified",factor_type:"totp"}]:[]});
 if(u.pathname==="/rest/v1/profiles"){const id=u.searchParams.get("id")?.slice(3)||ids[role];const who=Object.keys(ids).find(r=>ids[r]===id)||role;return single([{id,role:who==="admin"?"admin":who==="seller"?"creator":"buyer",display_name:"Compte de recette",tier:"standard",suspended_at:null}]);}
 if(u.pathname==="/rest/v1/rpc/zabelie_order_participant"){const b=await body();return send(b.p_order_id===order&&role!=="foreign");}
 if(u.pathname==="/rest/v1/rpc/zabelie_rate_limit")return send(true);
 if(u.pathname==="/rest/v1/orders")return single([{id:order,order_ref:"ZB-RECETTE",amount_htg:1500,status:"paid"}]);
 if(u.pathname==="/rest/v1/zabelie_support_cases")return single(messages.length&&role!=="foreign"?[{id:caseId,order_id:order,order:{order_ref:"ZB-RECETTE"},status,response_due_at:"2026-09-24T16:00:00Z",created_at:"2026-09-22T16:00:00Z"}]:[]);
 if(u.pathname==="/rest/v1/zabelie_support_messages")return send(messages.toReversed());
 if(u.pathname==="/rest/v1/zabelie_refund_receipts")return single([]);
 if(u.pathname==="/rest/v1/rpc/zabelie_submit_support"){
  const b=await body();if(!messages.some(m=>m.request_id===b.p_request_id))messages.push({id:b.p_request_id,request_id:b.p_request_id,author_id:b.p_actor,author_role:b.p_actor===ids.admin?"admin":b.p_actor===ids.seller?"seller":"buyer",body:b.p_body,created_at:new Date().toISOString()});
  status=b.p_status||"open";return send({ok:true,id:caseId});
 }
 if(u.pathname==="/rest/v1/rpc/zabelie_operations_queue")return send({total:1,rows:[{kind:"support",id:caseId,order_id:order,reference:"ZB-RECETTE",amount_htg:1500,rail:"moncash",since:"2026-09-22T16:00:00Z"}]});
 if(u.pathname==="/rest/v1/rpc/zabelie_market_metrics")return send({days:30,orders:3,paid:1,pending:2,buyers:1,repeat_buyers:0,first_sale_median_hours:12,markets:[{category:"Pyès machin",zone:"Petyonvil",products:2,sellers:1,paid:1}]});
 if(u.pathname==="/rest/v1/rpc/zabelie_claim_pending_payments")return send([]);
 if(u.pathname.startsWith("/rest/v1/rpc/"))return send([]);
 if(u.pathname.startsWith("/rest/v1/"))return single([]);
 return send({});
});
server.listen(port,"127.0.0.1",()=>console.log("Operations fixture ready on loopback"));
