import type { I18nKey } from "./i18n";
import { isDownloadable, isProductKind, pickByKind } from "./product-kind";

/**
 * CE QU'ON DIT À L'ACHETEUR UNE FOIS L'ACHAT PAYÉ, selon ce qu'il a acheté.
 *
 * Né de l'audit du 2026-11-10 (P0-4) : le courriel de confirmation disait
 * « Télécharger mes achats / Fichye ou disponib » à TOUT le monde, y compris à
 * l'acheteur d'un objet ou d'une prestation. La page `/paiement/succes` avait
 * déjà les trois textes (`pay.ok.body.*`) ; le courriel n'en lisait aucun.
 *
 * Même règle que la page : un type inconnu tombe sur le texte NEUTRE
 * (`pay.ok.body`), qui ne promet ni fichier ni remise. Un repli qui promet
 * quelque chose est pire qu'un repli qui ne promet rien.
 *
 * ⚠️ La page de succès garde sa propre copie de cette table (`cleCorps`) :
 * elle est sur le chemin de l'argent et ne se retouche pas sans accord du
 * porteur. `tests/courriel-achat-par-type.test.ts` croise les deux tables :
 * une clé changée d'un seul côté le fait rougir.
 */
export function cleCorpsAchat(kind: unknown): I18nKey {
  if (!isProductKind(kind)) return "pay.ok.body";
  return (
    pickByKind<I18nKey>(kind, {
      file: "pay.ok.body.file",
      service: "pay.ok.body.service",
      physical: "pay.ok.body.physical",
    }) ?? "pay.ok.body"
  );
}

/** L'achat se télécharge-t-il ? Faux pour un type inconnu : on ne devine pas. */
export function achatTelechargeable(kind: unknown): boolean {
  return isProductKind(kind) && isDownloadable(kind);
}
