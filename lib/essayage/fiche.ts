import { pickByKind, type ProductKind } from "../product-kind";
import { essayageActif, type EnvEssayage } from "./flags";
import { lireFournisseur } from "./fournisseur";
import { groupeDe, sousRayonOuvert } from "./regles";
import type { FicheEssayage } from "./base";

/**
 * Essayage virtuel — la fiche produit montre-t-elle le bouton ? (tâche 4.3)
 *
 * Dans l'ordre, du moins cher au plus cher : interrupteur et fournisseur,
 * visiteur connecté qui n'est pas le vendeur, fiche physique dans un
 * sous-rayon ouvert. Alors seulement la base tranche (`zabelie_essayage_eligible` :
 * fiche publiée, vendeur pilote actif, photo principale), et l'exposition est
 * notée dans LES DEUX groupes : c'est elle qui permet de comparer l'essai au
 * témoin (docs/74 §7). Le bouton ne s'affiche que pour le groupe « essai ».
 *
 * Une panne de la base cache le bouton : la fiche s'affiche toujours, et
 * l'API revérifie tout de toute façon.
 */

export type FicheVue = { id: string; kind: ProductKind; creatorId: string | null; sousRayonSlug: string | null };

export async function boutonEssayage(
  deps: { env: EnvEssayage; base: () => FicheEssayage },
  fiche: FicheVue,
  visiteurId: string | null | undefined,
): Promise<boolean> {
  if (!essayageActif(deps.env) || !lireFournisseur(deps.env)) return false;
  if (!visiteurId || visiteurId === fiche.creatorId) return false;
  if (pickByKind(fiche.kind, { file: false, service: false, physical: true }, fiche.id) !== true) return false;
  if (!sousRayonOuvert(fiche.sousRayonSlug)) return false;
  try {
    const base = deps.base();
    if (!(await base.eligible(fiche.id, visiteurId))) return false;
    const groupe = groupeDe(visiteurId);
    await base.exposer(visiteurId, fiche.id, groupe);
    return groupe === "essai";
  } catch {
    console.error("[essayage] fiche : base indisponible");
    return false;
  }
}
