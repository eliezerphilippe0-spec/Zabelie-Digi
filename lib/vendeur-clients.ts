/**
 * « MES CLIENTS » — docs/75 §5.C (PR-Z3), V-24.
 *
 * Le client se DÉRIVE des commandes payées (principe R4) : aucune table client,
 * aucune saisie, aucun export. Une « vente réelle » est la définition déjà en
 * service (`0111`, `0128:76-86`) : commande payée ou remise, paiement en mode
 * production, montant > 0. Un paiement d'essai ne fabrique pas de client.
 *
 * La requête filtre déjà tout cela ; `resumerClients` le REVÉRIFIE ligne par
 * ligne. Un filtre oublié dans une requête future ne doit pas suffire à
 * montrer à un vendeur les acheteurs d'un autre, ni une commande impayée.
 */

export const STATUTS_VENTE_REELLE = ["paid", "delivered"] as const;
export const LIMITE_VENTES_LUES = 1000;
const JOUR_MS = 86_400_000;

export type LigneVente = {
  buyer_id: string;
  product_id: string;
  amount_htg: number;
  status: string;
  zabelie_payment_is_live: boolean;
  created_at: string;
  products: { seller_id: string; title: string } | null;
};

export type ResumeClients = {
  clients30: number;
  clients90: number;
  clientsTotal: number;
  clientsRevenus: number;
  produits: { productId: string; titre: string; ventes: number; montantHtg: number }[];
  clients: { buyerId: string; commandes: number; montantHtg: number; derniere: string }[];
};

export function estVenteReelle(l: LigneVente, vendeurId: string): boolean {
  return l.products?.seller_id === vendeurId
    && (STATUTS_VENTE_REELLE as readonly string[]).includes(l.status)
    && l.zabelie_payment_is_live === true
    && Number.isSafeInteger(l.amount_htg) && l.amount_htg > 0
    && typeof l.buyer_id === "string" && l.buyer_id.length > 0
    && l.buyer_id !== vendeurId;
}

export function resumerClients(
  lignes: LigneVente[],
  vendeurId: string,
  maintenant: Date,
  { topProduits = 5, maxClients = 50 } = {},
): ResumeClients {
  const ventes = lignes.filter((l) => estVenteReelle(l, vendeurId));
  const depuis = (jours: number) => maintenant.getTime() - jours * JOUR_MS;
  const distincts = (seuil: number) =>
    new Set(ventes.filter((v) => Date.parse(v.created_at) >= seuil).map((v) => v.buyer_id)).size;

  const parClient = new Map<string, { commandes: number; montantHtg: number; derniere: string }>();
  const parProduit = new Map<string, { titre: string; ventes: number; montantHtg: number }>();
  for (const v of ventes) {
    const c = parClient.get(v.buyer_id) ?? { commandes: 0, montantHtg: 0, derniere: v.created_at };
    c.commandes += 1;
    c.montantHtg += v.amount_htg;
    if (Date.parse(v.created_at) > Date.parse(c.derniere)) c.derniere = v.created_at;
    parClient.set(v.buyer_id, c);
    const p = parProduit.get(v.product_id) ?? { titre: v.products!.title, ventes: 0, montantHtg: 0 };
    p.ventes += 1;
    p.montantHtg += v.amount_htg;
    parProduit.set(v.product_id, p);
  }

  return {
    clients30: distincts(depuis(30)),
    clients90: distincts(depuis(90)),
    clientsTotal: parClient.size,
    clientsRevenus: [...parClient.values()].filter((c) => c.commandes >= 2).length,
    produits: [...parProduit.entries()]
      .map(([productId, p]) => ({ productId, ...p }))
      .sort((a, b) => b.ventes - a.ventes || b.montantHtg - a.montantHtg || a.productId.localeCompare(b.productId))
      .slice(0, topProduits),
    clients: [...parClient.entries()]
      .map(([buyerId, c]) => ({ buyerId, ...c }))
      .sort((a, b) => Date.parse(b.derniere) - Date.parse(a.derniere) || a.buyerId.localeCompare(b.buyerId))
      .slice(0, maxClients),
  };
}

/** Le prénom seul : le reste du nom n'apporte rien à la relation et ne quitte pas la commande. */
export function prenom(nomComplet: string | null | undefined): string | null {
  const premier = nomComplet?.trim().split(/\s+/u)[0];
  return premier ? premier.slice(0, 40) : null;
}
