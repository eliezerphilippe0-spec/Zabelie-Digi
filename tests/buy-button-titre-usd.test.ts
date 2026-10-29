import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRoute } from "./helpers/route-harness";
import { marketplaceCopy } from "../lib/marketplace-copy";

/**
 * « Diaspora ? Payez en USD : » ne coiffe que les rails en USD (Stripe, Zelle).
 * NatCash et MonCash via Kobara (0106) sont en gourdes : mesuré en production
 * le 2026-10-29, le titre USD était posé au-dessus de « Payer 5 HTG avec
 * NatCash » et de « … MonCash (via Kobara) », sans aucun rail USD dessous.
 *
 * Le test rend le VRAI composant et lit l'ordre du document — pas la présence
 * d'une chaîne dans le fichier.
 */
type Element = { type: unknown; props: Record<string, unknown> };
const element = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
const TITRE = "Diaspora ? Payez en USD :";

/** Séquence du document : boutons par libellé, paragraphes par texte. */
function sequence(tree: unknown, out: string[] = []): string[] {
  if (Array.isArray(tree)) { for (const c of tree) sequence(c, out); return out; }
  if (!tree || typeof tree !== "object") return out;
  const node = tree as Element;
  if (node.type === "button" && typeof node.props.children === "string") out.push(`bouton:${node.props.children}`);
  else if (node.type === "p" && node.props.children === TITRE) out.push("titre-usd");
  else sequence(node.props?.children, out);
  return out;
}

function rendre(options: Array<{ rail: string; label: string; kobaraProvider?: string }>) {
  const slots: unknown[] = [];
  let cursor = 0;
  const react = {
    useState(initial: unknown) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (next: unknown) => { slots[i] = next; }];
    },
    useRef(initial: unknown) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
  };
  const source = loadRoute("components/buy-button.tsx", {
    react, "react/jsx-runtime": { jsx: element, jsxs: element }, "next/link": { default: "a" },
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/lib/order-recipient": { normalizeRecipient: () => null },
    "@/lib/rechaj": { normaliserNumeroHaiti: () => null, operateurDouteux: () => false },
    "@/lib/use-session-draft": {
      CHECKOUT_ATTEMPT_MAX_AGE: Infinity,
      prepareCheckoutAttempt: async () => "k",
      readCheckoutAttempt: () => null,
      clearCheckoutAttempt() {},
      useSessionDraft: (_k: string, initial: unknown) => [initial, () => {}, () => {}, true],
    },
    "@/lib/appel-session": { appelSession: async () => ({ etat: "ok", data: {} }) },
  }, {}, { window: { location: { href: "" } }, navigator: { onLine: true } }) as unknown as {
    BuyButton(props: unknown): Element;
  };
  cursor = 0;
  return sequence(source.BuyButton({
    productId: "p", draftScope: "buyer", trustLabels: marketplaceCopy("fr"), othersLabel: TITRE, options,
  }));
}

const MONCASH = { rail: "moncash", label: "Payer 5 HTG avec MonCash" };
const NATCASH = { rail: "kobara", kobaraProvider: "natcash", label: "Payer 5 HTG avec NatCash" };
const KOBARA_MONCASH = { rail: "kobara", kobaraProvider: "moncash", label: "Payer 5 HTG avec MonCash (via Kobara)" };
const STRIPE = { rail: "stripe", label: "Payer 0,04 $ par carte" };
const ZELLE = { rail: "zelle", label: "Payer 0,04 $ par Zelle" };

test("titre USD : absent quand aucun rail USD n'est proposé (état de la production au 2026-10-29)", () => {
  assert.deepEqual(rendre([MONCASH, NATCASH, KOBARA_MONCASH]), [
    `bouton:${MONCASH.label}`, `bouton:${NATCASH.label}`, `bouton:${KOBARA_MONCASH.label}`,
  ]);
});

test("titre USD : au-dessus des SEULS rails USD, après les rails en gourdes", () => {
  assert.deepEqual(rendre([MONCASH, NATCASH, STRIPE, ZELLE]), [
    `bouton:${MONCASH.label}`, `bouton:${NATCASH.label}`, "titre-usd", `bouton:${STRIPE.label}`, `bouton:${ZELLE.label}`,
  ]);
});

test("titre USD : toujours présent quand seuls des rails USD suivent MonCash", () => {
  assert.deepEqual(rendre([MONCASH, ZELLE]), [`bouton:${MONCASH.label}`, "titre-usd", `bouton:${ZELLE.label}`]);
  assert.deepEqual(rendre([MONCASH]), [`bouton:${MONCASH.label}`], "un seul rail : ni titre ni bouton secondaire");
});
