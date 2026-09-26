/**
 * ENTONNOIR DE LA SEMAINE — où les gens décrochent, sept jours contre sept.
 *
 * Lecture seule, sur les tables existantes : aucune migration, aucune écriture.
 * Chaque étape se compte deux fois (semaine courante, semaine précédente) par
 * une requête `count: exact, head: true` — zéro ligne transférée.
 *
 * ⚠️ Un compte en ERREUR se rend `null`, jamais `0`. « Aucun paiement cette
 * semaine » et « le compte a échoué » ne doivent pas s'afficher pareil
 * (CLAUDE.md : l'absence de signal doit être un signal).
 *
 * Ce qui n'y est PAS, faute de date en base : la remise des commandes
 * (`orders` n'a pas de `delivered_at`) et la PUBLICATION d'une offre
 * (`products` n'a pas de `published_at` — on compte les offres CRÉÉES).
 * Les libellés (`funnel.step.*`, lib/i18n.ts) le disent plutôt que de
 * faire passer l'un pour l'autre.
 */

export const JOUR_MS = 86_400_000;

export type Fenetre = { debut: string; fin: string };

/** [maintenant − 7 j, maintenant) et [maintenant − 14 j, maintenant − 7 j) — bornes ISO, fin exclue. */
export function fenetres(maintenant: Date): { courante: Fenetre; precedente: Fenetre } {
  const t = maintenant.getTime();
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    courante: { debut: iso(t - 7 * JOUR_MS), fin: iso(t) },
    precedente: { debut: iso(t - 14 * JOUR_MS), fin: iso(t - 7 * JOUR_MS) },
  };
}

export type Etape = {
  cle: string;
  table: string;
  colonneDate: string;
  egal?: Record<string, string | boolean>;
};

/** L'ordre est celui du parcours : on arrive, on vend, on commande, on paie. */
export const ETAPES: readonly Etape[] = [
  { cle: "comptes", table: "profiles", colonneDate: "created_at", egal: { is_test: false } },
  { cle: "offres", table: "products", colonneDate: "created_at" },
  { cle: "recherches_vides", table: "zabelie_search_misses", colonneDate: "created_at" },
  { cle: "commandes", table: "orders", colonneDate: "created_at" },
  { cle: "paiements_ok", table: "payments", colonneDate: "confirmed_at", egal: { status: "confirmed" } },
  { cle: "paiements_ko", table: "payments", colonneDate: "created_at", egal: { status: "failed" } },
];

/** Écart lisible entre deux comptes. `null` d'un côté → pas de comparaison. */
export function variation(courant: number | null, precedent: number | null): string {
  if (courant === null || precedent === null) return "—";
  if (courant === precedent) return "=";
  if (precedent === 0) return `+${courant}`;
  const pct = Math.round(((courant - precedent) / precedent) * 100);
  return `${pct > 0 ? "+" : ""}${pct} %`;
}

export type LigneEntonnoir = { cle: string; courant: number | null; precedent: number | null };

type Requete = {
  eq(col: string, v: string | boolean): Requete;
  gte(col: string, v: string): Requete;
  lt(col: string, v: string): Requete;
} & PromiseLike<{ count: number | null; error: unknown }>;

export type ClientComptage = {
  from(table: string): { select(cols: string, opts: { count: "exact"; head: true }): Requete };
};

async function compter(client: ClientComptage, etape: Etape, f: Fenetre): Promise<number | null> {
  try {
    let q = client.from(etape.table).select("*", { count: "exact", head: true });
    for (const [col, v] of Object.entries(etape.egal ?? {})) q = q.eq(col, v);
    const { count, error } = await q.gte(etape.colonneDate, f.debut).lt(etape.colonneDate, f.fin);
    if (error || count === null) {
      console.warn(`[entonnoir] compte indisponible : ${etape.cle}`);
      return null;
    }
    return count;
  } catch {
    console.warn(`[entonnoir] compte indisponible : ${etape.cle}`);
    return null;
  }
}

export async function chargerEntonnoir(client: ClientComptage, maintenant: Date): Promise<LigneEntonnoir[]> {
  const { courante, precedente } = fenetres(maintenant);
  return Promise.all(
    ETAPES.map(async (e) => {
      const [courant, precedent] = await Promise.all([compter(client, e, courante), compter(client, e, precedente)]);
      return { cle: e.cle, courant, precedent };
    }),
  );
}
