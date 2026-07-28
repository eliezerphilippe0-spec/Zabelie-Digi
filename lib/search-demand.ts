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
 * Le jour, tel qu'il bascule EN HAÏTI.
 *
 * `toISOString()` donne la date UTC : la rotation tomberait vers 20 h locales,
 * en plein pic d'usage, et couperait une même soirée en deux empreintes — donc
 * une personne comptée deux fois. La colonne `day` de `0047` bascule déjà sur
 * `America/Port-au-Prince` ; les deux doivent parler du même jour.
 *
 * Fuseau NOMMÉ et non décalage figé : Haïti observe l'heure d'été (vérifié en
 * base — juillet à UTC−4, janvier à UTC−5). Un `-05:00` en dur dériverait
 * d'une heure pendant huit mois de l'année.
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
 * ré-identification ponctuelle : deux propriétés distinctes, il faut les deux.
 *
 * ⚠️ AUCUN REPLI SUR UN AUTRE SECRET DU SERVEUR, et surtout pas sur la clé de
 * service. Ce serait coupler deux cycles de vie qui doivent rester séparés :
 * une rotation de clé — routine, ou obligatoire après incident — changerait
 * TOUTES les empreintes en milieu de fenêtre et casserait le comptage de
 * sessions distinctes sans rien signaler. Pire, une fuite de cette clé
 * donnerait de quoi reconstruire rétroactivement l'espace des empreintes de
 * tous les jours passés : la propriété qu'on vient d'acheter disparaîtrait au
 * moment précis où elle servirait.
 *
 * ROTATION — une politique, pas seulement une existence. Changer ce secret un
 * mardi après-midi scinde le comptage de sessions distinctes des sept jours
 * suivants : une même personne compte deux fois de part et d'autre de la
 * bascule, et le seuil de crédibilité mesure alors du vent. S'il doit tourner,
 * que ce soit **au basculement de journée en Haïti** (minuit
 * America/Port-au-Prince) — le même instant que la rotation d'empreinte, pour
 * que les deux discontinuités coïncident au lieu de s'ajouter. → OPS_TODO.
 */
function poivre(): string | null {
  const explicite = process.env.SEARCH_FINGERPRINT_SALT;
  return explicite && explicite.length >= 16 ? explicite : null;
}

/**
 * La collecte est-elle possible ? Exposé pour que l'écran d'administration
 * puisse le DIRE, au lieu de laisser croire que personne ne cherche.
 *
 * C'est la règle du dépôt appliquée à ce lot : l'absence de signal doit être
 * un signal. Un journal vide parce que le poivre manque et un journal vide
 * parce que personne n'a cherché se ressemblent trait pour trait.
 */
export function captureActive(): boolean {
  return poivre() !== null;
}

/** Une seule fois par processus : un avertissement répété devient du bruit. */
let avertie = false;
function avertirUneFois(): void {
  if (avertie) return;
  avertie = true;
  console.warn(
    "[recherche] SEARCH_FINGERPRINT_SALT absente — le capteur de demande est " +
      "DÉSACTIVÉ. Le journal restera vide : ce n'est pas l'absence de " +
      "recherches, c'est l'absence de collecte."
  );
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
 * Rend `null` si le poivre est absent : on préfère perdre la mesure plutôt que
 * produire un journal ré-identifiable.
 */
export function sessionFingerprint(
  headers: { get(name: string): string | null },
  now: Date = new Date()
): string | null {
  const sel = poivre();
  if (!sel) {
    avertirUneFois();
    return null;
  }

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
    const personnes =
      t.sessions === 1 ? "1 personne a cherché" : `${t.sessions} personnes ont cherché`;
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
