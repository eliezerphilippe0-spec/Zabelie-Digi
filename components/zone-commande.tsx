import { t, type Lang } from "@/lib/i18n";

/**
 * La zone de remise d'une commande, en une ligne (0161). Composant serveur :
 * le libellé arrive déjà résolu. Le vendeur la lit dans `/mes-ventes` (commande
 * payée seulement, par la policy), l'acheteur dans `/mes-achats`.
 */
export function ZoneCommande({ libelle, lang }: { libelle: string; lang: Lang }) {
  return (
    <p className="mt-2 text-xs text-mist">
      <span className="font-semibold">{t(lang, "zr.shown")}</span>
      {" · "}
      <span className="break-words">{libelle}</span>
    </p>
  );
}
