/**
 * Taxonomie d'évaluation Jev — PROPOSITION de `docs/61` §4, non validée.
 *
 * C'est le SEUL endroit où la liste vit : le lecteur CSV, les questions
 * envoyées à Jev, la validation de la réponse et le rapport en dérivent.
 * Retirer `plent` ou en ajouter une se fait ici, et nulle part ailleurs.
 *
 * Identifiants ASCII, volontairement : `vandè` a l'accent en position finale,
 * le seul cas où `\b` tombe du mauvais côté (CLAUDE.md, règle kreyòl).
 */
export const INTENTS = [
  "swivi_komand",
  "pwoblem_peman",
  "ranbousman",
  "akse_nimerik",
  "kont",
  "kesyon_pwodwi",
  "vande",
  "plent",
  "lot",
] as const;
export type Intent = (typeof INTENTS)[number];

/** Définitions transmises à Jev comme `criteria` de la question `choice`. */
export const INTENT_CRITERIA: Record<Intent, string> = {
  swivi_komand: "Order tracking: where is my order, delivery status, order not yet received",
  pwoblem_peman: "Payment problem: debited but not confirmed, payment failed, MonCash or card issue",
  ranbousman: "Refund or return request, wrong or damaged item, wants money back",
  akse_nimerik: "Cannot access or download a purchased digital product",
  kont: "Account access: login, password, sign-up, email or profile",
  kesyon_pwodwi: "Question about a product before buying: price, size, availability, details",
  vande: "Seller assistance: selling on Zabelie, shop, listing products, seller payouts",
  plent: "Complaint about a seller's behaviour or about the service, not covered by another category",
  lot: "Other, greeting only, ambiguous, or several unrelated issues",
};

/** Étiquettes binaires du CSV. Strictes : `oui`, `yes`, `1` sont refusés. */
export const WI = "wi";
export const NON = "non";
export const BINARY = [WI, NON] as const;
export type Binary = (typeof BINARY)[number];

export function isIntent(value: string): value is Intent {
  return (INTENTS as readonly string[]).includes(value);
}
export function isBinary(value: string): value is Binary {
  return (BINARY as readonly string[]).includes(value);
}
