import { UUID_RE } from "./collections";
import { isDigitalKind, type DigitalKind } from "./product-kind";

export const PUBLISH_DRAFT_PREFIX = "zabelie:publish:v1:";

export type PublishFields = {
  title: string;
  category: string;
  categoryId: string;
  priceHTG: string;
  description: string;
  deliveryDays: string;
  serviceIncludes: string;
  kind: DigitalKind;
};

export type PublishDraft = {
  v: 1;
  actorId: string;
  form: PublishFields;
  verificationRequired: boolean;
};

// Title, description and service scope follow product-draft's server bounds.
// Taxonomy labels and unfinished number inputs need only a small storage bound:
// their current validity is still checked by the form and the server.
export const PUBLISH_DRAFT_LIMITS = {
  title: 140,
  category: 256,
  categoryId: 36,
  priceHTG: 64,
  description: 5000,
  deliveryDays: 64,
  serviceIncludes: 10 * 140 + 9,
} as const;
const DRAFT_KEYS = ["v", "actorId", "form", "verificationRequired"] as const;
const FORM_KEYS = [...Object.keys(PUBLISH_DRAFT_LIMITS), "kind"];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

export function publishDraftKey(actorId: string, kind: DigitalKind): string {
  return `${PUBLISH_DRAFT_PREFIX}${actorId}:${kind}`;
}

/** Non-private safety marker: account/logout draft purges must not lose it. */
export function publishReviewKey(actorId: string, kind: DigitalKind): string {
  return `zabelie:publish-review:v1:${actorId}:${kind}`;
}

export function initialPublishDraft(actorId: string, kind: DigitalKind): PublishDraft {
  return {
    v: 1,
    actorId,
    form: { title: "", category: "", categoryId: "", priceHTG: "", description: "", deliveryDays: "", serviceIncludes: "", kind },
    verificationRequired: false,
  };
}

/** Browser storage is untrusted; neither another account nor consent is restored. */
export function validPublishDraft(value: unknown, actorId: string, kind: DigitalKind): value is PublishDraft {
  if (!UUID_RE.test(actorId) || !isDigitalKind(kind) || !record(value) || !exactKeys(value, DRAFT_KEYS)) return false;
  if (value.v !== 1 || value.actorId !== actorId || typeof value.verificationRequired !== "boolean") return false;
  const form = value.form;
  if (!record(form) || !exactKeys(form, FORM_KEYS) || !isDigitalKind(form.kind) || form.kind !== kind) return false;
  for (const [field, max] of Object.entries(PUBLISH_DRAFT_LIMITS)) {
    if (typeof form[field] !== "string" || form[field].length > max) return false;
  }
  return true;
}

/** Reconcile a saved selection with today's active taxonomy without losing text. */
export function cleanPublishCategories(
  form: PublishFields,
  categories: readonly { value: string }[],
  sousRayons: readonly { id: string; departement: string }[],
): PublishFields {
  if (!categories.some(category => category.value === form.category)) return { ...form, category: "", categoryId: "" };
  if (form.categoryId && !sousRayons.some(sous => sous.id === form.categoryId && sous.departement === form.category)) {
    return { ...form, categoryId: "" };
  }
  return { ...form };
}
