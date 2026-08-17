/**
 * FIL DE DÉTENTE SUR LES FILES ADMIN — prévenir avant que le risque soit réel.
 *
 * ─── LE RISQUE, ET POURQUOI IL EST THÉORIQUE AUJOURD'HUI ───────────────────
 * Les files d'action admin (Zelle en attente, topups à traiter) sont bornées
 * à `FILE_AFFICHEE` lignes. Au-delà, les plus anciennes disparaissent de
 * l'écran — et comme le tri est par date CROISSANTE, ce sont les plus vieilles
 * demandes, donc les plus urgentes, qui restent visibles… jusqu'à ce que le
 * plafond soit atteint. À partir de là, un paiement Zelle en attente peut
 * n'apparaître JAMAIS à l'admin. Le vrai correctif est une pagination admin ;
 * ce module ne la remplace pas.
 *
 * ─── CE QU'IL FAIT À LA PLACE ──────────────────────────────────────────────
 * Il demande le compte RÉEL (`count: exact, head: true` — une ligne, pas
 * cinquante) et le compare à ce que l'écran sait montrer. Deux seuils :
 *   • `SEUIL_ALERTE` — on prévient AVANT la troncature, pendant qu'il reste
 *     de la marge pour construire la pagination sans urgence ;
 *   • le plafond lui-même — la file EST tronquée, il faut le dire à l'écran.
 *
 * Sans ça, « la file est vide » et « la file déborde et tu n'en vois qu'un
 * bout » produisent le même écran calme. C'est le corollaire d'observabilité
 * du dépôt appliqué à une liste : l'absence de signal doit être un signal.
 */

/** Ce que les écrans admin savent afficher — doit rester égal au `.limit()`. */
export const FILE_AFFICHEE = 50;

/**
 * Seuil de prévenance. 35 = 70 % du plafond : assez tôt pour que la
 * pagination se construise posément, assez tard pour ne pas crier à vide.
 */
export const SEUIL_ALERTE = 35;

export type EtatFile = {
  /** Compte réel en base. */
  total: number;
  /** Ce que l'écran montre. */
  affichees: number;
  /** Le total approche ou dépasse le seuil — il est temps de paginer. */
  alerte: boolean;
  /** Des lignes sont INVISIBLES à l'admin. */
  tronquee: boolean;
};

/**
 * Compare le compte réel au plafond d'affichage, journalise ce qui sort de
 * l'ordinaire, et rend l'état pour que l'écran puisse le dire.
 *
 * ⚠️ `total` doit venir d'un COUNT en base, jamais de `lignes.length` : la
 * longueur du tableau est plafonnée par construction, elle ne peut pas
 * dépasser le seuil et l'alerte ne se déclencherait donc jamais. C'est le
 * piège de la sonde qui regarde à côté — l'appelant est vérifié par test.
 */
export function surveillerFile(
  nom: string,
  total: number,
  affichees: number = FILE_AFFICHEE
): EtatFile {
  const tronquee = total > affichees;
  const alerte = total >= SEUIL_ALERTE;

  if (tronquee || alerte) {
    console.log(
      "[file]",
      JSON.stringify({
        at: new Date().toISOString(),
        code: "ZB086",
        file: nom,
        issue: tronquee ? "file_tronquee" : "file_approche_du_plafond",
        total,
        affichees,
        seuil: SEUIL_ALERTE,
      })
    );
  }

  return { total, affichees, alerte, tronquee };
}
