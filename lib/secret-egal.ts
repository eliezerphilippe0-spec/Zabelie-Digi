import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Comparaison d'un secret reçu (en-tête d'un cron, d'un appel manuel) à celui
 * de l'environnement, en TEMPS CONSTANT. `===` s'arrête au premier caractère
 * différent : la durée de la réponse dit, en théorie, combien de caractères
 * étaient justes (audit du 2026-10-29, docs/78 L3).
 *
 * Les deux côtés passent par SHA-256 : `timingSafeEqual` exige deux longueurs
 * égales, et une longueur qui diffère ne doit pas non plus répondre plus vite.
 * Secret attendu absent ou vide → refus, toujours (fail-closed).
 */
export function secretEgal(recu: string | null | undefined, attendu: string | null | undefined): boolean {
  if (!attendu || typeof recu !== "string") return false;
  const empreinte = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(empreinte(recu), empreinte(attendu));
}
