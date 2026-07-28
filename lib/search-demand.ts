import { createHash } from "node:crypto";

/**
 * Capteur de demande — la partie applicative (lot S).
 *
 * Ce module ne normalise RIEN : la forme canonique d'une recherche est
 * produite par `zabelie_search_normalize` (migration 0047), et elle l'est à un
 * seul endroit. Un miroir TypeScript finirait par diverger, et deux
 * orthographes de la même recherche compteraient pour deux termes — soit
 * exactement le chiffre qu'on s'apprête à montrer à un commerçant pour le
 * convaincre.
 */

/**
 * Empreinte de session — sert à ne pas compter dix fois la même personne.
 *
 * ⚠️ Ce qui SORT d'ici est stocké ; ce qui ENTRE ne l'est jamais. L'adresse IP
 * et l'agent utilisateur servent à calculer un condensé et sont aussitôt
 * oubliés : la table ne contient que le condensé.
 *
 * Le jour entre dans le calcul, donc l'empreinte CHANGE chaque jour. C'est
 * délibéré et ça coûte un peu de précision : on ne peut pas suivre quelqu'un
 * d'un jour sur l'autre, même en le voulant. Une suite de recherches en dit
 * plus long sur une personne qu'un profil — « klinik avòtman », « tès VIH » —
 * et ce module est écrit en partant de là.
 *
 * `SEARCH_FINGERPRINT_SALT` est facultatif : sans lui, l'empreinte reste
 * calculable par quelqu'un qui connaîtrait déjà l'IP et l'agent — c'est-à-dire
 * qui aurait déjà l'information. La poser resserre, son absence ne casse rien.
 */
export function sessionFingerprint(
  headers: { get(name: string): string | null },
  now: Date = new Date()
): string {
  const ip = (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  const ua = headers.get("user-agent") ?? "";
  const jour = now.toISOString().slice(0, 10);
  const sel = process.env.SEARCH_FINGERPRINT_SALT ?? "zabelie";
  return createHash("sha256")
    .update(`${jour}|${sel}|${ip}|${ua}`)
    .digest("hex")
    .slice(0, 32);
}

export type TermeDemande = {
  term: string;
  department: string | null;
  sessions: number;
};

/**
 * Le livrable réel du lot : un message prêt à envoyer, pas une ligne de
 * tableau. Un export CSV finit dans un dossier ; un message part.
 *
 * Kreyòl par défaut — c'est la langue dans laquelle on recrute un commerçant
 * à Port-au-Prince ou au Cap.
 */
export function messageSourcing(
  t: TermeDemande,
  opts: { jours?: number; lang?: "ht" | "fr" } = {}
): string {
  const jours = opts.jours ?? 7;
  const rayon = t.department ? ` (${t.department})` : "";

  if ((opts.lang ?? "ht") === "fr") {
    const personnes = t.sessions === 1 ? "1 personne a cherché" : `${t.sessions} personnes ont cherché`;
    return (
      `Bonjour. Sur Zabelie, ${personnes} « ${t.term} »${rayon} ces ${jours} derniers jours ` +
      `et nous n'en avons aucun. Si vous en vendez, je peux vous mettre en ligne aujourd'hui.`
    );
  }

  const moun = t.sessions === 1 ? "1 moun chèche" : `${t.sessions} moun chèche`;
  return (
    `Bonjou. Sou Zabelie, ${moun} « ${t.term} »${rayon} nan ${jours} dènye jou yo ` +
    `epi nou pa gen youn. Si w vann sa, m ka mete w sou platfòm nan jodi a.`
  );
}
