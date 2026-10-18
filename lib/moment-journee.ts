/**
 * Le moment de la journée À L'HEURE D'HAÏTI, pour la salutation des tableaux
 * (Studio, phase T2 ; tableau vendeur, docs/73). Le serveur tourne en UTC :
 * sans fuseau, un vendeur du Cap lirait « Bonsoir » à 15 h.
 */
export type MomentJournee = "matin" | "apresMidi" | "soir";

export function momentDeLaJournee(maintenant: Date, fuseau = "America/Port-au-Prince"): MomentJournee {
  const partie = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: fuseau })
    .formatToParts(maintenant)
    .find((p) => p.type === "hour");
  const heure = Number(partie?.value ?? 12) % 24;
  if (heure >= 5 && heure < 12) return "matin";
  if (heure >= 12 && heure < 18) return "apresMidi";
  return "soir";
}
