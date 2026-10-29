import { t, type Lang } from "@/lib/i18n";
import type { MaZoneLabels } from "@/components/ma-zone";

/**
 * Les libellés de « Ma zone », résolus côté serveur (un composant client ne lit pas
 * la langue). Partagé par `/assistant` et `/catalogue`.
 */
export function maZoneLabels(lang: Lang): MaZoneLabels {
  return {
    titre: t(lang, "maZone.titre"),
    aide: t(lang, "maZone.aide"),
    actuelle: t(lang, "maZone.actuelle"),
    memoriser: t(lang, "maZone.memoriser"),
    enCours: t(lang, "maZone.encours"),
    oublier: t(lang, "maZone.oublier"),
    filtrer: t(lang, "maZone.filtrer"),
    erreur: t(lang, "maZone.erreur"),
    depatman: t(lang, "zone.level.depatman"),
    komin: t(lang, "zone.level.komin"),
    katye: t(lang, "zone.level.katye"),
    toutDepatman: t(lang, "svc.all.depatman"),
    toutKomin: t(lang, "svc.all.komin"),
  };
}
