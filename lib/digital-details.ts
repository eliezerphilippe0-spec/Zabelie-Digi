/** Public seller-authored facts. Never includes the private deliverable URL. */
export const DIGITAL_DETAIL_LIMITS = { formats: 100, language: 80, compatibility: 500, license: 1200, contents: 1600, updates: 500 } as const;
export type DigitalDetailField = keyof typeof DIGITAL_DETAIL_LIMITS;
export type DigitalDetails = Record<DigitalDetailField, string>;
export const DIGITAL_DETAIL_FIELDS = Object.keys(DIGITAL_DETAIL_LIMITS) as DigitalDetailField[];
export const EMPTY_DIGITAL_DETAILS: DigitalDetails = { formats: "", language: "", compatibility: "", license: "", contents: "", updates: "" };
export function parseDigitalDetails(input: unknown): DigitalDetails | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !DIGITAL_DETAIL_FIELDS.includes(key as DigitalDetailField))) return null;
  const result = { ...EMPTY_DIGITAL_DETAILS };
  for (const key of DIGITAL_DETAIL_FIELDS) {
    const value = record[key];
    if (typeof value !== "string" || value.length > DIGITAL_DETAIL_LIMITS[key] || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return null;
    result[key] = value.trim();
  }
  return result;
}
