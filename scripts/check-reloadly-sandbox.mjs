// Read-only provider check. Run on Vercel with the existing protected secrets.
// No wallet funding, top-up, database change or secret output.
const base = "https://topups-sandbox.reloadly.com";
const report = { check: "reloadly-sandbox", transactions: 0 };
async function json(url, options, stage) {
  const response = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    report.failure = { stage, httpStatus: response.status };
    return null;
  }
  return response.json();
}
async function run() {
  if (process.env.RELOADLY_MODE !== "sandbox") {
    report.failure = { stage: "sandbox-mode-required" };
    return;
  }
  const id = process.env.RELOADLY_CLIENT_ID?.trim();
  const secret = process.env.RELOADLY_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    report.failure = { stage: "credentials-missing" };
    return;
  }
  const auth = await json("https://auth.reloadly.com/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: "client_credentials", audience: base }),
  }, "authentication");
  if (!auth) return;
  if (typeof auth.access_token !== "string" || !auth.access_token) {
    report.failure = { stage: "access-token-missing" };
    return;
  }
  report.authentication = "successful";
  const operators = await json(base + "/operators/countries/HT?includeData=true", {
    headers: { Authorization: "Bearer " + auth.access_token, Accept: "application/com.reloadly.topups-v1+json" },
  }, "haiti-operators");
  if (!operators) return;
  const rows = Array.isArray(operators) ? operators : operators.content;
  if (!Array.isArray(rows)) {
    report.failure = { stage: "operator-response-invalid" };
    return;
  }
  report.operators = rows.filter(op => /digicel|natcom/i.test(String(op.name))).map(op => ({
    id: op.operatorId, name: op.name, currency: op.destinationCurrencyCode,
    localAmounts: op.supportsLocalAmounts, denominationType: op.denominationType,
    localMinAmount: op.localMinAmount, localMaxAmount: op.localMaxAmount,
  }));
  if (!report.operators.some(op => /digicel/i.test(op.name)) || !report.operators.some(op => /natcom/i.test(op.name))) {
    report.failure = { stage: "haiti-operator-missing" };
  }
}
try { await run(); } catch { report.failure = { stage: "network-or-response-error" }; }
console.log("RELOADLY_READ_ONLY_CHECK " + JSON.stringify(report));
if (report.failure) process.exitCode = 1;
