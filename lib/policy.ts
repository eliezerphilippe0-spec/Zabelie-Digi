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
// v2 (2026-08-02) — ajout de la section « Alcool », à l'ouverture du rayon
// « Produits locaux » (clairin). La v1 ne disait rien de l'alcool ; un silence
// n'est ni une autorisation ni une règle opposable. Zéro acceptation `v1`
// n'était enregistrée au moment du changement (vérifié en base), donc aucun
// vendeur n'est tenu à un texte qu'il n'a pas lu — c'est précisément ce que
// `0046` existe pour garantir quand il y en aura.
// v3 (2026-09-05) — seconde paire « ne pas confondre » : revendre du SOLDE
// MonCash/NatCash (interdit, monnaie électronique) contre vendre du CRÉDIT
// D'APPEL Digicel/Natcom (autorisé, un service). L'interdiction existait déjà
// dans la liste des services financiers ; ce qui manquait, c'était le côté
// PERMIS juste à côté, avec les mots que les gens emploient — sans lui, un
// vendeur honnête ne devinait pas la frontière, et « rechaj » ouvert par 0098
// (décision porteur, D-7) aurait ouvert « vann balans » dans le même geste.
// Deux acceptations `v2` existent en base au moment du changement : elles
// restent telles quelles (registre append-only) ; la prochaine publication de
// ces vendeurs enregistrera `v3`, parce que la version part du serveur à
// chaque fiche (`app/api/products/*`), jamais du client.
export const POLICY_VERSION = "v3";

/** Chemin public de la politique — cité par le pied de page et les formulaires. */
export const POLICY_PATH = "/produits-interdits";
