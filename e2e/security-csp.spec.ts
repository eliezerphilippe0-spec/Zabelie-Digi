import { test, expect } from "@playwright/test";
for (const removePolicy of [false, true]) test("CSP parser injection: " + (removePolicy ? "negative control executes" : "untrusted script blocked"), async ({ page }) => {
  // Inject into the HTTP document: CDP evaluate can bypass CSP and is not an XSS test.
  await page.route(url => url.pathname === "/", async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace("<head>", '<head><script>window.__untrustedExecuted = true</script>');
    const headers = response.headers();
    if (removePolicy) delete headers["content-security-policy"];
    await route.fulfill({ response, body, headers });
  });
  const response = await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "__untrustedExecuted"))).toBe(removePolicy ? true : undefined);
  if (removePolicy) return;
  const policy = response?.headers()["content-security-policy"] ?? "";
  expect(policy).toContain("strict-dynamic");
  expect(policy).not.toContain("unsafe-eval");
  const firstNonce = await page.locator("#zabelie-theme-init").evaluate((script: HTMLScriptElement) => script.nonce);
  expect((firstNonce ?? "").length).toBeGreaterThan(20);
  expect(policy).toContain("'nonce-" + firstNonce + "'");
  await page.reload();
  const secondNonce = await page.locator("#zabelie-theme-init").evaluate((script: HTMLScriptElement) => script.nonce);
  expect(secondNonce).not.toBe(firstNonce);
});
