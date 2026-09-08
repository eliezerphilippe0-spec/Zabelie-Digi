/** Digital delivery subtypes keep the existing file payment/escrow contract. */
export const DIGITAL_MODES = ["file", "bundle", "course"] as const;
export type DigitalMode = typeof DIGITAL_MODES[number];
export const MAX_DIGITAL_FILES = 20;
export const MAX_DIGITAL_FILE_BYTES = 50 * 1024 * 1024;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type DigitalLesson = { id: string; chapter: string; title: string; body: string; assetId: string; free: boolean };
export type DigitalStudio = { mode: DigitalMode; preview: string; outcomes: string; prerequisites: string; include_updates: boolean; lessons: DigitalLesson[]; faq: { question: string; answer: string }[] };
export const EMPTY_DIGITAL_STUDIO: DigitalStudio = { mode: "file", preview: "", outcomes: "", prerequisites: "", include_updates: false, lessons: [], faq: [] };
export type DigitalAsset = { id: string; file_name: string; size_bytes: number; storage_path: string };
export type DigitalManifest = Omit<DigitalStudio, "lessons"> & { lessons: Omit<DigitalLesson, "assetId">[]; files: Omit<DigitalAsset, "storage_path">[] };
export type DigitalRelease = { id: string; product_id: string; version: number; title: string; created_at: string; details: Record<string, string>; manifest: DigitalManifest; payload: { lessons: DigitalLesson[]; files: DigitalAsset[] } };
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value); }
function only(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).every(k => keys.includes(k)); }
export function parseDigitalStudio(value: unknown): DigitalStudio | null {
  if (!object(value) || !only(value, Object.keys(EMPTY_DIGITAL_STUDIO)) || !DIGITAL_MODES.includes(value.mode as DigitalMode)
    || !text(value.preview, 6000) || !text(value.outcomes, 1600) || !text(value.prerequisites, 1200)
    || typeof value.include_updates !== "boolean" || !Array.isArray(value.lessons) || value.lessons.length > 40
    || !Array.isArray(value.faq) || value.faq.length > 8) return null;
  const ids = new Set<string>();
  const lessons: DigitalLesson[] = [];
  for (const l of value.lessons) {
    if (!object(l) || !only(l, ["id", "chapter", "title", "body", "assetId", "free"]) || typeof l.id !== "string" || !UUID_RE.test(l.id) || ids.has(l.id)
      || !text(l.chapter, 120) || !text(l.title, 160) || !l.title.trim() || !text(l.body, 12000)
      || typeof l.assetId !== "string" || (l.assetId !== "" && !UUID_RE.test(l.assetId)) || typeof l.free !== "boolean") return null;
    ids.add(l.id); lessons.push({ id: l.id, chapter: l.chapter.trim(), title: l.title.trim(), body: l.body.trim(), assetId: l.assetId, free: l.free });
  }
  if (JSON.stringify(lessons).length > 160000 || (value.mode !== "course" && lessons.length > 0)) return null;
  const faq: DigitalStudio["faq"] = [];
  for (const f of value.faq) {
    if (!object(f) || !only(f, ["question", "answer"]) || !text(f.question, 200) || !f.question.trim() || !text(f.answer, 1600) || !f.answer.trim()) return null;
    faq.push({ question: f.question.trim(), answer: f.answer.trim() });
  }
  return { mode: value.mode as DigitalMode, preview: value.preview.trim(), outcomes: value.outcomes.trim(), prerequisites: value.prerequisites.trim(), include_updates: value.include_updates, lessons, faq };
}
/** Explicitly allow paid/delivered only, including when the product is archived. */
export function digitalAccessAllowed(buyerId: string, order: { buyer_id: string; status: string } | null): boolean {
  return !!order && order.buyer_id === buyerId && (order.status === "paid" || order.status === "delivered");
}
export function releaseAllowed(original: Pick<DigitalRelease, "id" | "product_id" | "version" | "manifest">, candidate: Pick<DigitalRelease, "id" | "product_id" | "version">): boolean {
  return candidate.id === original.id || (original.manifest.include_updates && candidate.product_id === original.product_id && candidate.version > original.version);
}
export function conversionPercent(confirmed: number, started: number): number | null { return started > 0 ? Math.round(confirmed / started * 1000) / 10 : null; }
