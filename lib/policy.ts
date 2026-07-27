/**
 * Version de la politique « produits interdits ».
 *
 * ⚠️ VALEUR, PAS LIBELLÉ. Elle n'est pas traduite : c'est l'identifiant que
 * l'attestation vendeur enregistrera (`policy_version`, lot R3). Une version
 * qui vivrait dans les deux dictionnaires i18n pourrait diverger entre le
 * français et le Kreyòl — et l'attestation enregistrerait alors une version
 * différente selon la langue du navigateur. Un seul endroit, donc.
 *
 * Faire évoluer la politique = incrémenter ici ET ajouter une ligne
 * d'attestation, jamais mettre à jour l'ancienne (registre append-only).
 */
export const POLICY_VERSION = "v1";

/** Chemin public de la politique — cité par le pied de page et les formulaires. */
export const POLICY_PATH = "/produits-interdits";
