import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRoute } from "./helpers/route-harness";
import { marketplaceCopy } from "../lib/marketplace-copy";

type Element = { type: unknown; props: Record<string, unknown> };
function element(type: unknown, props: Record<string, unknown>): Element { return { type, props }; }
function button(tree: unknown, label: string): Element | undefined {
  if (Array.isArray(tree)) return tree.map(child => button(child, label)).find(Boolean);
  if (!tree || typeof tree !== "object") return undefined;
  const node = tree as Element;
  if (node.type === "button" && node.props.children === label) return node;
  return button(node.props?.children, label);
}

test("a retained BuyButton keeps the purchase locked but releases read-only recovery after gateway departure", async () => {
  // Hook slots persist across renders, as they do when the browser restores
  // the same React document. Navigation is captured without unmounting it.
  const slots: unknown[] = [];
  let cursor = 0;
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next: unknown) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
  };
  const drafts = new Map<string, unknown>();
  const requests: Record<string, unknown>[] = [];
  const key = "11111111-1111-4111-8111-111111111111";
  const browser = { location: { href: "" } };
  const source = loadRoute("components/buy-button.tsx", {
    react, "react/jsx-runtime": { jsx: element, jsxs: element }, "next/link": { default: "a" },
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/lib/order-recipient": { normalizeRecipient: () => null },
    "@/lib/rechaj": { normaliserNumeroHaiti: () => null, operateurDouteux: () => false },
    "@/lib/use-session-draft": {
      CHECKOUT_ATTEMPT_MAX_AGE: Infinity,
      prepareCheckoutAttempt: async () => key,
      readCheckoutAttempt: () => key,
      clearCheckoutAttempt() {},
      useSessionDraft(storageKey: string, initial: unknown) {
        if (!drafts.has(storageKey)) drafts.set(storageKey, initial);
        return [drafts.get(storageKey), (value: unknown) => drafts.set(storageKey, value), () => drafts.delete(storageKey), true];
      },
    },
    "@/lib/appel-session": { appelSession: async (_url: string, body: Record<string, unknown>) => {
      requests.push(body);
      return { etat: "ok", data: { checkoutState: "ready", redirectUrl: "https://sandbox.moncashbutton.digicelgroup.com/session" } };
    } },
  }, {}, { window: browser, navigator: { onLine: true } }) as unknown as { BuyButton(props: unknown): Element };
  const render = () => { cursor = 0; return source.BuyButton({ productId: "product", draftScope: "buyer", trustLabels: marketplaceCopy("fr"), options: [{ rail: "moncash", label: "MonCash" }] }); };
  await (button(render(), "MonCash")!.props.onClick as () => Promise<void>)();
  assert.match(browser.location.href, /^https:\/\/sandbox\.moncashbutton\.digicelgroup\.com\//);
  const retained = render();
  const recovery = button(retained, marketplaceCopy("fr").resumeAttempt)!;
  assert.equal(recovery.props.disabled, false, "the retained loading state must not block recovery");
  assert.equal(button(retained, "MonCash")!.props.disabled, true, "returning from the operator must not offer a new purchase");
  await (recovery.props.onClick as () => Promise<void>)();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].recoveryOnly, true);
  assert.equal(requests[1].checkoutKey, requests[0].checkoutKey);
});
