import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { openApiDocument, PUBLIC_OPERATIONS } from "../lib/api/v1/openapi";
import { V1_ENDPOINTS, ListCategoriesInput, ListCategoriesOutput } from "../lib/api/v1/schemas";
import { V1_AUTHENTIFIES, listCategories } from "../lib/api/v1/handlers";
import { apiHeaders, isPublicEndpoint, MAX_API_BODY_BYTES, readApiBody } from "../lib/api/v1/transport";
import { apiDocsCopy } from "../lib/api/v1/docs-copy";

test("OpenAPI covers precisely the public runtime contracts, with no account operations", () => {
  const doc = openApiDocument();
  assert.equal(doc.openapi, "3.1.0");
  assert.deepEqual(Object.keys(doc.paths).sort(), Object.keys(V1_ENDPOINTS).filter(k=>!V1_AUTHENTIFIES.has(k)).map(k=>`/api/v1/${k}`).sort());
  assert.equal(PUBLIC_OPERATIONS.length, 8);
  assert.doesNotThrow(()=>JSON.stringify(doc));
  const product = doc.paths["/api/v1/get_product"].post.requestBody.content["application/json"].schema;
  assert.equal(product.oneOf?.length, 2);
  assert.equal(doc.paths["/api/v1/search_products"].post.responses["200"].content["application/json"].schema.type, "object");
});
test("CORS allows only registered public operations and never cookie credentials", () => {
  assert.equal(isPublicEndpoint("search_products"), true);
  for (const name of ["get_order", "get_user_orders", "__proto__", "unknown"]) assert.equal(isPublicEndpoint(name), false);
  assert.equal(apiHeaders(true)["Access-Control-Allow-Origin"], "*");
  assert.equal(apiHeaders(true)["Access-Control-Allow-Credentials"], undefined);
  assert.equal(apiHeaders(false)["Access-Control-Allow-Origin"], undefined);
  assert.equal(apiHeaders(false)["Cache-Control"], "no-store");
});
test("body reader supports empty and UTF-8 bodies and rejects malformed input", async () => {
  assert.deepEqual(await readApiBody(new Request("http://localhost", {method:"POST"})), {});
  assert.deepEqual(await readApiBody(new Request("http://localhost", {method:"POST",body:'{"query":"kreyòl"}'})), {query:"kreyòl"});
  await assert.rejects(()=>readApiBody(new Request("http://localhost", {method:"POST",body:"{"})));
});
test("body limit uses actual streamed bytes, even without Content-Length", async () => {
  const stream = new ReadableStream({start(c){c.enqueue(new Uint8Array(MAX_API_BODY_BYTES));c.enqueue(new Uint8Array(1));c.close();}});
  const req = new Request("http://localhost", {method:"POST",body:stream,duplex:"half"} as RequestInit);
  assert.equal(req.headers.get("content-length"),null);
  await assert.rejects(()=>readApiBody(req),/body_too_large/);
  await assert.rejects(()=>readApiBody(new Request("http://localhost", {method:"POST",body:"{}",headers:{"content-length":"17000"}})),/body_too_large/);
});
test("category pagination filters active rows, keeps canonical department and falls back to French", async () => {
  const ids=["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3"];
  const db=createClient("https://example.supabase.co", "test-anon",{global:{fetch:async (input)=>{
    const u=new URL(String(input));assert.equal(u.searchParams.get("active"),"eq.true");assert.equal(u.searchParams.get("limit"),"2");assert.equal(u.searchParams.get("id"),`gt.${ids[0]}`);assert.equal(u.searchParams.get("order"),"id.asc");
    return Response.json(ids.slice(1).map(id=>({id,slug:"mode",parent_id:null,level:1,label_fr:"Mode",label_kr:"",label_en:"Fashion",label_es:null,private_value:"never expose"})));
  }}});
  const out=await listCategories({language:"ht",limit:1,cursor:ids[0]},{supabase:db,userId:null});
  assert.ok(ListCategoriesOutput.safeParse(out).success);assert.equal(out.nextCursor,ids[1]);assert.equal(out.categories[0].label,"Mode");assert.equal(out.categories[0].departmentFilter,"Mode");assert.equal(JSON.stringify(out).includes("private_value"),false);
});
test("category validation rejects oversized pages, bad cursors and unsupported languages", () => {
  for(const input of [{limit:21},{cursor:"garbage"},{language:"de"}])assert.equal(ListCategoriesInput.safeParse(input).success,false);
  for(const lang of ["fr","ht","en","es"] as const) assert.deepEqual(Object.keys(apiDocsCopy(lang)),Object.keys(apiDocsCopy("fr")));
});
