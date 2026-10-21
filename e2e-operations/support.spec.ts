import {test,expect} from "@playwright/test";
import {writeFile} from "node:fs/promises";
import {supportCopy} from "../lib/support-copy";
const fixture="http://127.0.0.1:15429";
test.beforeEach(async({request})=>{await request.get(fixture+"/__reset");});
for(const width of [390,1280])test("order support preserves the message across a failed request at "+width+"px",async({page,request})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.setViewportSize({width,height:900});
 await page.goto(fixture+"/__login?role=buyer&lang=fr");
 await expect(page.getByRole("heading",{level:1,name:"Aide pour cette commande"})).toBeVisible();
 const message=page.getByRole("textbox",{name:"Expliquez ce qui s’est passé"});
 await message.fill("Mon paiement MonCash est passé, merci de vérifier.");
 await page.getByRole("combobox").last().selectOption("not_received");
 await page.route("**/api/support/cases",route=>route.abort("failed"));
 await page.getByRole("button",{name:"Enregistrer dans le dossier"}).click();
 await expect(page.getByRole("status")).toContainText("n’a pas pu être confirmée");
 await page.reload();
 await expect(message).toHaveValue("Mon paiement MonCash est passé, merci de vérifier.");
 await expect(page.getByRole("combobox").last()).toHaveValue("not_received");
 await page.unroute("**/api/support/cases");
 await page.getByRole("button",{name:"Enregistrer dans le dossier"}).click();
 await expect(page.getByRole("heading",{name:"Historique du dossier"})).toBeVisible();
 await expect(page.locator("ol").getByText("Mon paiement MonCash est passé, merci de vérifier.",{exact:true})).toBeVisible();
 await expect(message).toHaveValue("");
 const saved=await (await request.get(fixture+"/__messages")).json();expect(saved).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 await page.screenshot({path:test.info().outputPath("support-"+width+".png"),fullPage:true});
 await page.getByRole("link",{name:"Mes dossiers Zabelie",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Mes dossiers Zabelie"})).toBeVisible();
 await expect(page.getByRole("link",{name:/ZB-RECETTE/})).toBeVisible();
});
test("Haitian Creole copy and foreign account refusal",async({page})=>{
 await page.goto(fixture+"/__login?role=buyer&lang=ht");
 await expect(page.getByRole("heading",{name:"Èd pou kòmann sa a"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Anrejistre nan dosye a"})).toBeVisible();
 await page.goto(fixture+"/__login?role=foreign&lang=fr");
 await expect(page.getByRole("textbox",{name:"Expliquez ce qui s’est passé"})).toHaveCount(0);
});
test("MFA administrator sees Haitian market operations and can answer",async({page})=>{
 await page.goto(fixture+"/__login?role=admin");
 await expect(page.getByRole("heading",{name:"Ventes à suivre en Haïti"})).toBeVisible();
 await expect(page.getByRole("cell",{name:"Petyonvil"})).toBeVisible();
 await page.getByRole("link",{name:"Consulter et suivre"}).click();
 await page.getByRole("combobox").last().selectOption("waiting_seller");
 await page.getByRole("textbox",{name:"Expliquez ce qui s’est passé"}).fill("Veuillez confirmer le lieu de remise au client.");
 await page.getByRole("button",{name:"Enregistrer dans le dossier"}).click();
 await expect(page.locator("p").filter({hasText:/^Réponse du vendeur attendue$/})).toBeVisible();
 await expect(page.getByText("Veuillez confirmer le lieu de remise au client.",{exact:true})).toBeVisible();
});
const orderId="11300000-0000-4000-8000-000000000020";
for(const scenario of [
 {name:"participant",first:"buyer",second:"seller",actorA:"11300000-0000-4000-8000-000000000003",actorB:"11300000-0000-4000-8000-000000000001",endpoint:"/api/support/cases"},
 {name:"administrator",first:"admin",second:"admin2",actorA:"11300000-0000-4000-8000-000000000005",actorB:"11300000-0000-4000-8000-000000000006",endpoint:"/api/admin/support"},
].flatMap(scenario=>(scenario.name==="participant"?["fr","ht","en","es"] as const:["fr"] as const).map(lang=>({...scenario,lang}))))test("a stale "+scenario.name+" form cannot send a private draft under another authorized account in "+scenario.lang,async({page})=>{
 const labels=supportCopy(scenario.lang);
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 await page.setViewportSize({width:scenario.name==="participant"?360:1280,height:900});
 await page.goto(fixture+"/__login?role="+scenario.first+"&lang="+scenario.lang);
 if(scenario.first==="admin")await page.getByRole("link",{name:"Consulter et suivre"}).click();
 await expect(page).toHaveURL(new RegExp("/assistance/commande/"+orderId+"$"));
 await expect(page.getByRole("heading",{level:1,name:labels.title})).toBeVisible();
 const message=page.getByRole("textbox",{name:labels.message});
 const privateDraft="Message privé du compte A, à ne jamais attribuer au compte B.";
 await message.fill(privateDraft);
 const switched=await page.request.get(fixture+"/__login?role="+scenario.second+"&lang="+scenario.lang,{maxRedirects:0});
 expect(switched.status()).toBe(302);
 const cookie=(await page.context().cookies()).find(item=>item.name==="sb-127-auth-token");
 expect(cookie).toBeDefined();
 const session=JSON.parse(Buffer.from(cookie!.value.slice("base64-".length),"base64url").toString());
 const authenticated=await page.request.get(fixture+"/auth/v1/user",{headers:{authorization:"Bearer "+session.access_token}});
 expect((await authenticated.json()).id).toBe(scenario.actorB);
 // Changing the cookie must not navigate or replace the still visible A form.
 await expect(message).toHaveValue(privateDraft);
 const before=await (await page.request.get(fixture+"/__rpc-calls")).json();
 const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname===scenario.endpoint&&response.request().method()==="POST");
 await page.getByRole("button",{name:labels.send}).click();
 const response=await responsePromise;
 const sent=response.request().postDataJSON();
 const after=await (await page.request.get(fixture+"/__rpc-calls")).json();
 const saved=await (await page.request.get(fixture+"/__messages")).json();
 const evidence=test.info().outputPath("identity-boundary.json");
 await writeFile(evidence,JSON.stringify({scenario:scenario.name,lang:scenario.lang,actorA:scenario.actorA,verifiedActorB:scenario.actorB,sent,status:response.status(),rpcAfterSubmit:after.slice(before.length),messages:saved},null,2));
 await test.info().attach("identity-boundary",{path:evidence,contentType:"application/json"});
 await page.screenshot({path:test.info().outputPath("support-identity-"+scenario.name+".png"),fullPage:true});
 expect(response.status()).toBe(403);
 expect(sent.expectedActorId).toBe(scenario.actorA);
 expect(after.slice(before.length)).toEqual([]);
 expect(saved).toEqual([]);
 await expect(message).toHaveValue(privateDraft);
 await expect(page.getByRole("status")).toHaveText(labels.error);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.reload();
 await expect(page.getByRole("heading",{level:1,name:labels.title})).toBeVisible();
 await expect(message).toBeEnabled();
 await expect(message).toHaveValue("");
 expect(errors).toEqual([]);
 await expect(page.locator("nextjs-portal")).toHaveCount(0);
});
test("a committed support request with a lost response replays the same request only once",async({page})=>{
 await page.goto(fixture+"/__login?role=buyer&lang=fr");
 const message=page.getByRole("textbox",{name:"Expliquez ce qui s’est passé"});
 const draft="Mon paiement est passé, merci de vérifier cette demande unique.";
 await message.fill(draft);
 let original:Record<string,unknown>|undefined;
 await page.route("**/api/support/cases",async route=>{
  original=route.request().postDataJSON();
  await route.fetch(); // The real handler commits; only its response is lost.
  await route.abort("failed");
 });
 await page.getByRole("button",{name:"Enregistrer dans le dossier"}).click();
 await expect(page.getByRole("status")).toContainText("n’a pas pu être confirmée");
 expect(await (await page.request.get(fixture+"/__messages")).json()).toHaveLength(1);
 await page.reload();await expect(message).toHaveValue(draft);
 await page.unroute("**/api/support/cases");
 const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/support/cases"&&response.request().method()==="POST");
 await page.getByRole("button",{name:"Enregistrer dans le dossier"}).click();
 const response=await responsePromise;expect(response.status()).toBe(200);
 expect(response.request().postDataJSON()).toEqual(original);
 await expect(message).toHaveValue("");
 const calls=await (await page.request.get(fixture+"/__rpc-calls")).json();
 const writes=calls.filter((call:{name:string})=>call.name==="zabelie_submit_support");
 expect(writes).toHaveLength(2);expect(writes[0].args.p_request_id).toBe(writes[1].args.p_request_id);
 expect(await (await page.request.get(fixture+"/__messages")).json()).toHaveLength(1);
});
test("a late response from an unmounted support form cannot erase a newer draft",async({page})=>{
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 await page.goto(fixture+"/__login?role=buyer&lang=fr");
 const message=page.getByRole("textbox",{name:"Expliquez ce qui s’est passé"});
 const first="Premier message envoyé avant de quitter ce formulaire.";
 const next="Nouveau brouillon saisi après le retour dans ce dossier.";
 await message.fill(first);
 await page.evaluate(()=>document.documentElement.dataset.supportDocument="same-document");
 // Finish the real network request, holding only the JS promise returned to
 // the component. A network interception can be aborted by a route change.
 await page.evaluate(()=>{
  const original=window.fetch.bind(window);
  let release!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  const state={committed:false,release};
  (window as unknown as {supportPending:typeof state}).supportPending=state;
  window.fetch=async(...args)=>{
   const response=await original(...args);
   const target=args[0] instanceof Request?args[0].url:String(args[0]);
   if(new URL(target,location.href).pathname==="/api/support/cases"&&args[1]?.method==="POST") {
    await response.clone().arrayBuffer();state.committed=true;await held;
   }
   return response;
  };
 });
 try {
  const finished=page.waitForEvent("requestfinished",request=>new URL(request.url()).pathname==="/api/support/cases"&&request.method()==="POST");
  await page.getByRole("button",{name:"Enregistrer dans le dossier"}).click();
  await finished;
  await page.waitForFunction(()=>(window as unknown as {supportPending:{committed:boolean}}).supportPending.committed);
  await page.getByRole("link",{name:"Mes dossiers Zabelie",exact:true}).click();
  await expect(page.getByRole("heading",{level:1,name:"Mes dossiers Zabelie"})).toBeVisible();
  await page.getByRole("link",{name:/ZB-RECETTE/}).click();
  await expect(page).toHaveURL(new RegExp("/assistance/commande/"+orderId+"$"));
  await expect(message).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.dataset.supportDocument),"the navigation must really unmount the form without reloading the document").toBe("same-document");
  await message.fill(next);
  await page.evaluate(()=>(window as unknown as {supportPending:{release():void}}).supportPending.release());
  // Let the browser process the fulfilled fetch and React updates before reloading.
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(message).toHaveValue(next);
  await page.reload();await expect(message).toBeEnabled();
  await expect(message).toHaveValue(next);
  const stored=await (await page.request.get(fixture+"/__messages")).json();
  expect(stored).toHaveLength(1);expect(stored[0].body).toBe(first);
  expect(errors).toEqual([]);
 }finally {await page.evaluate(()=>(window as unknown as {supportPending?:{release():void}}).supportPending?.release());}
});
