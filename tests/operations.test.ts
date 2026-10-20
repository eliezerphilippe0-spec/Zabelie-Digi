import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { loadRoute } from "./helpers/route-harness";
import { operationHref, operationLabels, type Operation, type OperationKind } from "../lib/operations";

const row: Operation = {
  kind: "stripe_dispute", id: "dp_fixture", order_id: null, reference: null,
  amount_htg: null, rail: "stripe", since: "2026-10-20T12:00:00Z",
  stripe_status: "needs_response", stripe_event_type: "charge.dispute.created",
  payment_intent_id: "pi_fixture", freeze_active: false, freeze_enabled: false, requires_review: true,
};

async function renderPage(rows: Operation[], options: { admin?: boolean; queueError?: boolean } = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const amounts: number[] = [];
  const page = loadRoute("app/admin/operations/page.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "next/link": { default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => React.createElement("a", { href, className }, children) },
    "@/components/admin/admin-shell": { AdminShell: ({ children, title }: { children: React.ReactNode; title: string }) => React.createElement("main", null, React.createElement("h1", null, title), children) },
    "./actions": {
      ReconcileAction: () => React.createElement("button", null, "Réconcilier"),
      RefundReceiptForm: ({ orderId }: { orderId: string }) => React.createElement("form", { "data-refund-receipt": orderId }),
    },
    "@/lib/auth": { getAdminUser: async () => options.admin === false ? null : { role: "admin", displayName: "Administrateur" } },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name: string, args: unknown) => {
      calls.push({ name, args: structuredClone(args) });
      if (name === "zabelie_operations_queue") return { data: { rows, total: rows.length }, error: options.queueError ? {} : null };
      assert.equal(name, "zabelie_market_metrics");
      return { data: { orders: 1, paid: 1, pending: 0, repeat_buyers: 0, first_sale_median_hours: null, markets: [] }, error: null };
    } }) },
    "@/lib/sample-data": { formatHTG: (amount: number) => {
      assert.equal(typeof amount, "number", "un montant inconnu ne doit jamais devenir zéro");
      amounts.push(amount); return `${amount} HTG`;
    } },
    "@/lib/operations": { operationHref, operationLabels },
  }) as unknown as { default: (props: { searchParams: Promise<{ page?: string }> }) => Promise<React.ReactNode> };
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  return { html, amounts, calls };
}

test("les litiges Stripe réutilisent l’assistance de commande et restent dans la file sans rapprochement", () => {
  assert.equal(operationLabels.stripe_dispute, "Litige Stripe à examiner");
  assert.equal(operationHref(row), "/admin/operations");
  assert.equal(operationHref({ ...row, order_id: "commande /?" }), "/assistance/commande/commande%20%2F%3F");
  assert.equal(operationHref({ ...row, kind: "payout" }), "/admin/paiements-vendeurs");
  for (const kind of ["payment_pending", "payment_review", "handover", "support", "refund", "payout"] satisfies OperationKind[]) {
    assert.equal(operationHref({ ...row, kind, order_id: "commande" }), "/assistance/commande/commande");
  }
});

test("la vraie page montre le litige non rapproché, son état et le gel désactivé sans inventer un montant", async () => {
  const result = await renderPage([row]);
  assert.match(result.html, /Litige Stripe à examiner/);
  assert.match(result.html, /Montant à rapprocher/);
  assert.doesNotMatch(result.html, /0 HTG/);
  assert.deepEqual(result.amounts, []);
  assert.match(result.html, /États Stripe reçus : <\/dt><dd[^>]*>needs_response<\/dd>/);
  assert.match(result.html, /Gel de maturation : <\/dt><dd[^>]*>Désactivé<\/dd>/);
  assert.match(result.html, /Examen humain : <\/dt><dd[^>]*>Requis<\/dd>/);
  assert.match(result.html, /charge\.dispute\.created/);
  assert.match(result.html, /pi_fixture/);
  assert.match(result.html, /Commande à rapprocher avant toute décision/);
  const queue = result.html.match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? "";
  assert.match(queue, /href="\/admin\/operations"/);
  assert.doesNotMatch(queue, /paiements-vendeurs|<button|<form|dashboard\.stripe/);
  assert.deepEqual(result.calls, [
    { name: "zabelie_operations_queue", args: { p_limit: 30, p_offset: 0 } },
    { name: "zabelie_market_metrics", args: { p_days: 30 } },
  ]);
});

test("la page distingue un gel actif, activé sans gel et inconnu ; elle n’ajoute aucune action financière", async () => {
  for (const [diagnostics, label] of [
    [{ freeze_active: true, freeze_enabled: true }, "Actif"],
    [{ freeze_active: false, freeze_enabled: true }, "Activé, aucun gel actif"],
    [{ freeze_active: true, freeze_enabled: false }, "Actif"],
    [{ freeze_active: null, freeze_enabled: null }, "État indisponible"],
  ] as const) {
    const { html, amounts } = await renderPage([{ ...row, ...diagnostics, order_id: "commande", amount_htg: 1800 }]);
    assert.ok(html.includes(`Gel de maturation : </dt><dd class="inline">${label}</dd>`));
    assert.deepEqual(amounts, [1800]);
    assert.match(html, /Commande liée : 1800 HTG/);
    assert.match(html, /href="\/assistance\/commande\/commande"/);
    assert.doesNotMatch(html, /Commande à rapprocher|data-refund-receipt/);
    const queue = html.match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? "";
    assert.doesNotMatch(queue, /<button|<form|dashboard\.stripe/);
  }
});

test("les opérations classiques gardent leur montant, leur formulaire de reçu et leurs liens", async () => {
  const result = await renderPage([
    { ...row, kind: "refund", order_id: "refunded-order", amount_htg: 1200 },
    { kind: "payout", id: "payout-id", order_id: null, reference: null, amount_htg: 0, rail: null, since: row.since },
  ]);
  assert.deepEqual(result.amounts, [1200, 0]);
  assert.match(result.html, /data-refund-receipt="refunded-order"/);
  assert.match(result.html, /href="\/admin\/paiements-vendeurs"/);
  assert.doesNotMatch(result.html, /États Stripe reçus :|Gel de maturation :|Examen humain :|Montant à rapprocher|Commande liée/);
});

test("les diagnostics Stripe restent du texte échappé ; une valeur absente reste explicite", async () => {
  const { html } = await renderPage([{ ...row, stripe_status: "<script>incident</script>", stripe_event_type: null, payment_intent_id: null, requires_review: false }]);
  assert.match(html, /&lt;script&gt;incident&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|Paiement Stripe :|Événements Stripe reçus :/);
  assert.match(html, /Examen humain : <\/dt><dd[^>]*>Non requis<\/dd>/);
  assert.match((await renderPage([{ ...row, stripe_status: null }])).html, /États Stripe reçus : <\/dt><dd[^>]*>À rapprocher<\/dd>/);
});

test("la page refuse l’accès non administrateur sans requête et signale une file indisponible", async () => {
  const denied = await renderPage([row], { admin: false });
  assert.match(denied.html, /Accès refusé/);
  assert.deepEqual(denied.calls, []);
  assert.doesNotMatch(denied.html, /dp_fixture/);
  const failed = await renderPage([row], { queueError: true });
  assert.match(failed.html, /La file est indisponible/);
  assert.doesNotMatch(failed.html, /Litige Stripe à examiner|Aucune situation/);
});
