/** Receipt identifiers for the canonical legal documents, never a consent to
 * every data use or a certified signature. Change the identifier and SQL
 * versions when the document changes; the fingerprint test guards omissions. */
export const CONDITIONS_VERSION = "cgu-v1";
/**
 * ⚖️ 2026-10-10 — `v1` → `v2` : TypeSafe entre au §6 de la politique
 * (`lib/policy-privacy.ts`). Un reçu atteste d'un document PRÉCIS ; changer le
 * texte sous la même étiquette prêterait à l'utilisateur une acceptation qu'il
 * n'a pas donnée. ⚠️ `0136` doit être APPLIQUÉE avant que cette ligne ne soit
 * fusionnée : sinon l'application exige un reçu que la RPC ne sait pas écrire,
 * et la ré-acceptation tourne en boucle sans jamais satisfaire la garde.
 */
export const CONFIDENTIALITE_VERSION = "confidentialite-v3";

export const ACCOUNT_LEGAL_VERSIONS = [CONDITIONS_VERSION, CONFIDENTIALITE_VERSION] as const;

export function hasCurrentLegalAcceptance(rows: readonly { policy_version: string }[]): boolean {
  return ACCOUNT_LEGAL_VERSIONS.every(version => rows.some(row => row.policy_version === version));
}

/** Only an explicit pair of declarations can be submitted. Metadata is a
 * transport for the INSERT trigger, not the immutable receipt itself. */
export function initialLegalDeclaration(conditionsAccepted: boolean, privacyRead: boolean) {
  if (!conditionsAccepted || !privacyRead) throw new Error("legal_acceptance_required");
  return {
    conditions_version: CONDITIONS_VERSION,
    conditions_accepted: true,
    confidentialite_version: CONFIDENTIALITE_VERSION,
    confidentialite_read: true,
  };
}
