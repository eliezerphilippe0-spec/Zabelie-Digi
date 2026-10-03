import { test, expect } from "@playwright/test";

test("public API works cross-origin and does not authorize private reads", async ({ page, request, baseURL }) => {
  const preflight=await request.fetch(`${baseURL}/api/v1/search_products`,{method:"OPTIONS",headers:{Origin:"http://127.0.0.1:3000","Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"content-type"}});
  expect(preflight.status()).toBe(204);expect(preflight.headers()["access-control-allow-origin"]).toBe("*");
  // Real second HTTP origin: no response interception, CSP bypass or disabled browser security.
  await page.goto("http://127.0.0.1:54321/__partner");
  const result=await page.evaluate(async url=>{const r=await fetch(`${url}/api/v1/search_products`,{method:"POST",credentials:"omit",headers:{"Content-Type":"application/json"},body:JSON.stringify({limit:1})});return {status:r.status,body:await r.json()};},baseURL);
  expect(result.status).toBe(200);expect(result.body.type).toBe("product_results");expect(result.body.results[0].untrusted.title).toBe("Filtre à huile Corolla");
  const privateRead=await request.post(`${baseURL}/api/v1/get_user_orders`,{data:{},headers:{Origin:"http://127.0.0.1:3000"}});
  expect(privateRead.status()).toBe(401);expect(privateRead.headers()["access-control-allow-origin"]).toBeUndefined();expect(privateRead.headers()["cache-control"]).toBe("no-store");
  const privatePreflight=await request.fetch(`${baseURL}/api/v1/get_user_orders`,{method:"OPTIONS"});expect(privatePreflight.status()).toBe(403);
});
test("public reads ignore caller cookies and bearer tokens", async ({ request, baseURL }) => {
  const session = { access_token: "vendeur-preparation-api", refresh_token: "test", token_type: "bearer", expires_at: 4102444800, user: { id: "22222222-2222-2222-2222-222222222222", aud: "authenticated", role: "authenticated" } };
  const r = await request.post(`${baseURL}/api/v1/search_products`, { data: { limit: 1 }, headers: {
    Cookie: "sb-127-auth-token=base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), Authorization: "Bearer vendeur-preparation-api",
  } });
  expect(r.status()).toBe(200);expect((await r.json()).results[0].untrusted.title).toBe("Filtre à huile Corolla");expect(r.headers()["set-cookie"]).toBeUndefined();
});
test("public errors and oversized requests keep their JSON and CORS contract", async ({ request, baseURL }) => {
  for(const data of [{limit:21},{query:"x".repeat(17000)}]) {
    const r=await request.post(`${baseURL}/api/v1/search_products`,{data});expect(r.status()).toBe(400);expect((await r.json()).code).toBe("invalid_input");expect(r.headers()["access-control-allow-origin"]).toBe("*");expect(r.headers()["cache-control"]).toBe("no-store");
  }
  const r=await request.post(`${baseURL}/api/v1/get_product`,{data:{slug:"not-published"}});expect(r.status()).toBe(404);
});
test("developer documentation and OpenAPI match the public operations on mobile", async ({ page, request, baseURL }) => {
  const r=await request.get(`${baseURL}/api/v1/openapi.json`);expect(r.status()).toBe(200);const spec=await r.json();expect(Object.keys(spec.paths)).toHaveLength(8);expect(spec.paths["/api/v1/get_order"]).toBeUndefined();
  await page.setViewportSize({width:390,height:844});await page.goto(`${baseURL}/developpeurs`);await expect(page.getByRole("heading",{name:"API Zabelie",exact:true})).toBeVisible();await expect(page.locator('a[href^="/api/v1/openapi.json?lang="]')).toBeVisible();await expect(page.locator('a[href^="/api/v1/seller/openapi.json?lang="]')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("seller API contract is published separately, every operation behind an API key", async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/v1/seller/openapi.json`);
  expect(r.status()).toBe(200);
  const spec = await r.json();
  expect(Object.keys(spec.paths).sort()).toEqual(["/api/v1/seller/create_product_link", "/api/v1/seller/seller_products", "/api/v1/seller/seller_sales"]);
  for (const op of Object.values(spec.paths) as { post: { security: unknown } }[]) expect(op.post.security).toEqual([{ cleApi: [] }]);
  const sansCle = await request.post(`${baseURL}/api/v1/seller/seller_products`, { data: {} });
  expect(sansCle.status()).toBe(401);
  expect(sansCle.headers()["www-authenticate"]).toContain("Bearer");
});

test("public API answers in the caller's language: ht, en, es, fr", async ({ request, baseURL }) => {
  for (const [l, attendu] of [["ht", "Nou pa konnen endpoint"], ["en", "Unknown endpoint"], ["es", "Endpoint desconocido"], ["fr", "Endpoint inconnu"]] as const) {
    const r = await request.post(`${baseURL}/api/v1/inconnu`, { data: {}, headers: { "Accept-Language": l } });
    expect(r.status()).toBe(404);
    expect(r.headers()["content-language"]).toBe(l);
    expect((await r.json()).message).toContain(attendu);
  }
  const r = await request.post(`${baseURL}/api/v1/search_products?lang=ht`, { data: { limit: 21 } });
  expect(r.status()).toBe(400);
  expect((await r.json()).message).toContain("Done yo pa valab");
  const spec = await (await request.get(`${baseURL}/api/v1/openapi.json?lang=es`)).json();
  expect(spec.info.title).toBe("Zabelie — API pública");
});
