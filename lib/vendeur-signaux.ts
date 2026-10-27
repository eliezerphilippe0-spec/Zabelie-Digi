import { z } from "zod";

/**
 * SIGNAUX DE DEMANDE — docs/75 §5.C (PR-Z4), V-24 A7. Lecture de
 * `zabelie_vendeur_signaux()` (0156) : des totaux, jamais une personne.
 *
 * La base ne rend pas le nombre exact de paniers sous 3 ; ce schéma le
 * REFUSE aussi, et refuse tout champ inattendu. Une réponse incohérente fait
 * taire la section (fail-closed) plutôt que d'afficher un chiffre qui ne
 * devrait pas sortir.
 */
const Panier = z.object({
  titre: z.string().max(300),
  paniers: z.number().int().min(3).nullable(),
  moins_de_3: z.boolean(),
}).strict().refine((p) => (p.moins_de_3 ? p.paniers === null : p.paniers !== null));

const Recherche = z.object({
  terme: z.string().min(1).max(200),
  sessions: z.number().int().min(5),
  mon_rayon: z.boolean(),
}).strict();

export const SignauxSchema = z.object({
  fenetre_jours: z.literal(30),
  abonnes: z.number().int().min(0),
  paniers: z.array(Panier).max(10),
  recherches: z.array(Recherche).max(10),
}).strict();

export type Signaux = z.infer<typeof SignauxSchema>;

export function lireSignaux(brut: unknown): Signaux | null {
  const r = SignauxSchema.safeParse(brut);
  return r.success ? r.data : null;
}
