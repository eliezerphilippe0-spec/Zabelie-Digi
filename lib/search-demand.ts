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
/**
 * Le jour, tel qu'il bascule EN HAÏTI.
 *
 * `toISOString()` donne la date UTC : la rotation tomberait vers 20 h locales,
 * en plein pic d'usage, et couperait une même soirée en deux empreintes — donc
 * une personne comptée deux fois. La colonne `day` de `0047` bascule déjà sur
 * `America/Port-au-Prince` ; les deux doivent parler du même jour.
 */
export function jourHaiti(now: Date = new Date()): string {
  // `en-CA` rend AAAA-MM-JJ, seul format ISO parmi les locales courantes.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Port-au-Prince",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Poivre serveur — secret NON dérivable de ce qu'un tiers peut deviner.
 *
 * Sans lui, l'espace d'entrée est minuscule : une IPv4 et une poignée de
 * chaînes d'agent utilisateur courantes, sur un jour connu. Quelques millions
 * de condensés suffisent à répondre à « telle adresse a-t-elle cherché tel
 * terme ». La rotation quotidienne empêche le SUIVI dans le temps, pas la
 * ré-identification ponctuelle : ce sont deux propriétés différentes, et il
 * faut les deux.
 *
 * Rend `null` si aucun secret n'est disponible — l'appelant cesse alors
 * d'enregistrer. Mieux vaut pas de capteur qu'un journal ré-identifiable.
 */
function poivre(): string | null {
  const explicite = process.env.SEARCH_FINGERPRINT_SALT;
  if (explicite && explicite.length >= 16) return explicite;
  // Repli : dérivé d'un secret serveur qui existe déjà, jamais la clé
  // elle-même. Évite une variable d'environnement de plus à poser et à
  // oublier — c'est le mode nominal en pratique.
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (cle && cle.length >= 16) {
    return createHash("sha256").update(`zabelie/search-fingerprint/v1|${cle}`).digest("hex");
  }
  return null;
}

/**
 * Empreinte de session — sert à ne pas compter dix fois la même personne.
 *
 * ⚠️ Ce qui SORT d'ici est stocké ; ce qui ENTRE ne l'est jamais. L'adresse IP
 * et l'agent utilisateur servent à calculer un condensé et sont aussitôt
 * oubliés : la table ne contient que le condensé.
 *
 * Deux propriétés, obtenues par deux mécanismes distincts :
 *   - le JOUR entre dans le calcul → pas de suivi d'un jour sur l'autre ;
 *   - un POIVRE serveur entre dans le calcul → pas de ré-identification par
 *     force brute sur un jour donné.
 *
 * Rend `null` quand aucun poivre n'est disponible : on préfère perdre la
 * mesure plutôt que produire un journal ré-identifiable.
 */
export function sessionFingerprint(
  headers: { get(name: string): string | null },
  now: Date = new Date()
): string | null {
  const sel = poivre();
  if (!sel) return null;

  const ip = (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  const ua = headers.get("user-agent") ?? "";
  return createHash("sha256")
    .update(`${jourHaiti(now)}|${sel}|${ip}|${ua}`)
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
