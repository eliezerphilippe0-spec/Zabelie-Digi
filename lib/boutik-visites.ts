import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { estVisiteHumaine } from "@/lib/boutik-visites-calcul";

/**
 * VISITES DES VITRINES — docs/75 §5.A (PR-Z2), V-24 A4.
 *
 * Un compteur par boutique et par jour (`0155`), sans IP, sans identifiant,
 * sans cookie, sans référent : on compte des AFFICHAGES de la page, jamais des
 * personnes. Le vendeur le lit comme tel (« vues de la page, y compris les
 * vôtres »).
 *
 * L'écriture part APRÈS la réponse (`after`) et n'échoue jamais la page : un
 * compteur absent (migration pas encore appliquée), en panne ou lent ne doit
 * pas coûter une vitrine à un acheteur sur 3G.
 */
export function compterVisite(vendeurId: string, entetes: Headers): void {
  if (!vendeurId || !estVisiteHumaine(entetes)) return;
  after(async () => {
    try {
      await createAdminClient().rpc("zabelie_boutik_visite", { p_seller: vendeurId });
    } catch {
      /* Silence voulu : un compteur ne casse jamais une vitrine. */
    }
  });
}
