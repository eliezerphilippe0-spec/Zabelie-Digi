import type { KobaraProvider } from "@/lib/kobara";

/**
 * PAIEMENT GROUPÉ DU PANIER (0128) — le contexte que `/api/panier/payer`
 * passe au checkout d'un article.
 *
 * ⚠️ Une `WeakMap` indexée par l'OBJET `Request`, jamais un en-tête ni un
 * champ du corps. Une requête venue du réseau est un objet neuf, construit
 * par Next.js : elle ne peut pas figurer dans cette table. Seul le code qui a
 * construit la requête — la route du panier, dans le même processus — peut
 * l'y inscrire. Un en-tête `x-zabelie-groupe` se forgerait avec `curl` et
 * permettrait de rattacher une commande au groupe d'un autre, ou d'obtenir
 * un paiement en rail `groupe` qu'aucun opérateur n'encaisserait jamais.
 */
export type ContexteGroupe = {
  groupId: string;
  /** La commande meneuse porte le vrai rail ; les autres, le rail `groupe`. */
  meneuse: boolean;
  rail: "moncash" | "kobara" | "stripe";
  kobaraProvider: KobaraProvider;
};

const contextes = new WeakMap<Request, ContexteGroupe>();

export function inscrireContexteGroupe(req: Request, ctx: ContexteGroupe): Request {
  contextes.set(req, ctx);
  return req;
}

export function contexteGroupe(req: Request): ContexteGroupe | null {
  return contextes.get(req) ?? null;
}
