/**
 * LE CHEMIN DE L'ARGENT, tel que le chantier design le laisse intact.
 *
 * Le brief du chantier design et typographie (§1.8) interdit d'y toucher :
 * checkout, MonCash, KYC, versements. Ces fichiers suivent le thème sans être
 * modifiés : un token change, leur rendu suit ; leur code ne bouge pas. La
 * Phase 4 du brief y autorise une retouche de PRÉSENTATION seulement, et elle
 * se fera alors fichier par fichier, en retirant l'entrée d'ici.
 *
 * Partagé par les gardes de la Phase 2 (`boutons-variantes`, `champs`) : une
 * liste recopiée dans chaque test finit par diverger.
 */
export const CHEMIN_ARGENT: readonly RegExp[] = [
  /^app\/paiement\//,
  /^app\/facture\//,
  /^app\/rechaj\//,
  /^app\/admin\/kyc\//,
  /^app\/admin\/paiements-vendeurs\//,
  /^components\/buy-button\.tsx$/,
  /^components\/cart-pay-all\.tsx$/,
  /^components\/cart-pay-button\.tsx$/,
  /^components\/kyc-form\.tsx$/,
  /^components\/payout-(?:queue|request|form)\.tsx$/,
  /^components\/business\//,
  /^components\/zabelie-topup-form\.tsx$/,
  /^components\/zelle-reference-form\.tsx$/,
];

export const surCheminArgent = (fichier: string): boolean =>
  CHEMIN_ARGENT.some((r) => r.test(fichier.replace(/\\/g, "/")));
