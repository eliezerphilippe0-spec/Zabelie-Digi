// LES JOINTURES QUE LE VRAI POSTGREST REFUSE (PGRST201).
//
// Depuis `0111`, `orders` porte deux clés vers `products` : `product_id` et
// `zabelie_recommendation_source_id`. PostgREST ne choisit pas entre les deux :
// une jointure commandes → produits qui ne nomme pas la clé
// (`products!orders_product_id_fkey`) répond 300 PGRST201. Les faux serveurs
// l'acceptaient sans regarder, et onze écrans sont restés cassés en production
// du 2026-09-22 au 2026-10-17 (page de succès, mes achats, mes ventes, retour
// MonCash, e-mails de vente…) sans qu'un seul test e2e le voie. Mesuré sur le
// vrai PostgREST le 2026-10-17 : l'ancienne forme répond PGRST201, la forme
// nommée répond 200.
//
// Partagé par les faux serveurs et par `tests/jointure-commandes-produits.test.ts`.

const PRODUIT_SANS_CLE = /(^|[\s,(:])products(!inner)?\(/;
const COMMANDES = /(^|[\s,(:])orders(!inner)?\(/g;

/** Le contenu des parenthèses qui s'ouvrent à l'index `ouverture`. */
function interieur(texte, ouverture) {
  let profondeur = 0;
  for (let i = ouverture; i < texte.length; i++) {
    if (texte[i] === "(") profondeur++;
    else if (texte[i] === ")" && --profondeur === 0) return texte.slice(ouverture + 1, i);
  }
  return texte.slice(ouverture + 1);
}

/** La sélection `select` lue sur la table `table` serait-elle refusée ? */
export function jointureAmbigue(table, select) {
  if (!select) return false;
  if (table === "orders" && PRODUIT_SANS_CLE.test(select)) return true;
  for (const m of select.matchAll(COMMANDES)) {
    if (PRODUIT_SANS_CLE.test(interieur(select, m.index + m[0].length - 1))) return true;
  }
  return false;
}

/** La réponse du vrai PostgREST, au statut près (300). */
export const REFUS_PGRST201 = {
  code: "PGRST201",
  details: null,
  hint: "Try changing 'products' to 'products!orders_product_id_fkey'.",
  message: "Could not embed because more than one relationship was found for 'orders' and 'products'",
};

/** Table visée par une URL PostgREST (`/rest/v1/orders` → `orders`). */
export function tableDe(chemin) {
  return chemin.replace(/^\/rest\/v1\//, "").split(/[/?]/)[0];
}
