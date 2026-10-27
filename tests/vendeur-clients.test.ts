import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estVenteReelle, prenom, resumerClients, type LigneVente } from "../lib/vendeur-clients";
import { DICT, LANGS } from "../lib/i18n";

/**
 * « MES CLIENTS » (docs/75 §5.C, PR-Z3 ; V-24). Ce qui est gardé : un client
 * ne naît que d'une vente RÉELLE de CE vendeur ; aucun numéro, aucune adresse,
 * aucun export ne sort sur la page ; le prénom vient de la RLS (client de
 * session), jamais d'une lecture service.
 */

const A = "seller-a", B = "seller-b";
const MAINTENANT = new Date("2026-10-27T12:00:00Z");
const ilYa = (jours: number) => new Date(MAINTENANT.getTime() - jours * 86_400_000).toISOString();
const vente = (patch: Partial<LigneVente> = {}): LigneVente => ({
  buyer_id: "c1", product_id: "p1", amount_htg: 1500, status: "paid", zabelie_payment_is_live: true,
  created_at: ilYa(5), products: { seller_id: A, title: "Sak an pay" }, ...patch,
});

test("V1 — seule une vente réelle de CE vendeur fait un client", () => {
  const negatifs: [string, Partial<LigneVente>][] = [
    ["autre vendeur", { products: { seller_id: B, title: "x" } }],
    ["produit illisible", { products: null }],
    ["en attente", { status: "pending" }],
    ["échouée", { status: "failed" }],
    ["annulée", { status: "cancelled" }],
    ["remboursée", { status: "refunded" }],
    ["en litige", { status: "disputed" }],
    ["paiement d'essai", { zabelie_payment_is_live: false }],
    ["gratuite", { amount_htg: 0 }],
    ["montant non entier", { amount_htg: 10.5 }],
    ["achat à soi-même", { buyer_id: A }],
    ["acheteur vide", { buyer_id: "" }],
  ];
  for (const [nom, patch] of negatifs) {
    assert.equal(estVenteReelle(vente(patch), A), false, nom);
    assert.equal(resumerClients([vente(patch)], A, MAINTENANT).clientsTotal, 0, nom);
  }
  assert.equal(estVenteReelle(vente(), A), true);
  assert.equal(estVenteReelle(vente({ status: "delivered" }), A), true);
});

test("V2 — fenêtres 30 / 90 jours, clients revenus, montants entiers", () => {
  const r = resumerClients([
    vente({ buyer_id: "c1", created_at: ilYa(5) }),
    vente({ buyer_id: "c1", created_at: ilYa(40) }),
    vente({ buyer_id: "c2", created_at: ilYa(60), product_id: "p2", amount_htg: 800, products: { seller_id: A, title: "Liv kreyòl" } }),
    vente({ buyer_id: "c3", created_at: ilYa(200) }),
    vente({ buyer_id: "c9", status: "pending", created_at: ilYa(1) }),
    vente({ buyer_id: "c8", products: { seller_id: B, title: "Ailleurs" }, created_at: ilYa(1) }),
  ], A, MAINTENANT);
  assert.equal(r.clients30, 1);
  assert.equal(r.clients90, 2);
  assert.equal(r.clientsTotal, 3);
  assert.equal(r.clientsRevenus, 1);
  assert.deepEqual(r.clients.map((c) => [c.buyerId, c.commandes, c.montantHtg]), [["c1", 2, 3000], ["c2", 1, 800], ["c3", 1, 1500]]);
  assert.equal(r.clients[0].derniere, ilYa(5));
  assert.deepEqual(r.produits.map((p) => [p.productId, p.ventes, p.montantHtg]), [["p1", 3, 4500], ["p2", 1, 800]]);
});

test("V3 — palmarès borné à 5 produits, liste bornée, ordre stable", () => {
  const lignes = Array.from({ length: 8 }, (_, i) =>
    vente({ buyer_id: `c${i}`, product_id: `p${i}`, created_at: ilYa(i + 1), products: { seller_id: A, title: `P${i}` } }));
  const r = resumerClients(lignes, A, MAINTENANT, { maxClients: 3 });
  assert.equal(r.produits.length, 5);
  assert.deepEqual(r.clients.map((c) => c.buyerId), ["c0", "c1", "c2"]);
  assert.deepEqual(resumerClients([], A, MAINTENANT), { clients30: 0, clients90: 0, clientsTotal: 0, clientsRevenus: 0, produits: [], clients: [] });
});

test("V4 — le prénom seul, jamais le reste du nom", () => {
  assert.equal(prenom("Marie-Lourdes Jean-Baptiste"), "Marie-Lourdes");
  assert.equal(prenom("  Wilson   Pierre "), "Wilson");
  assert.equal(prenom(""), null);
  assert.equal(prenom(null), null);
  assert.equal(prenom("x".repeat(80))?.length, 40);
});

test("V5 — la page : requête filtrée, revérifiée, sans numéro, sans adresse, sans export", () => {
  const page = readFileSync("app/tableau-de-bord/clients/page.tsx", "utf8");
  assert.match(page, /\.eq\("products\.seller_id", user\.id\)/);
  assert.match(page, /\.in\("status", \[\.\.\.STATUTS_VENTE_REELLE\]\)/);
  assert.match(page, /\.eq\("zabelie_payment_is_live", true\)/);
  assert.match(page, /\.gt\("amount_htg", 0\)/);
  assert.match(page, /resumerClients\(lignes, user\.id, new Date\(\)\)/, "revérification ligne par ligne");
  // Prénom : client de SESSION (la RLS décide), et la seule colonne nominative lue.
  assert.match(page, /await \(await createClient\(\)\)\s*\.from\("zabelie_delivery_info"\)\s*\.select\("user_id, full_name"\)/);
  assert.doesNotMatch(page, /createAdminClient\(\)\s*\.from\("zabelie_delivery_info"\)/);
  for (const interdit of [/phone/i, /adres_liv/i, /locality/i, /download/i, /\bcsv\b/i, /text\/csv/i, /new Blob/, /\/api\/.*export/i, /tel:/, /wa\.me/])
    assert.doesNotMatch(page, interdit, `la page ne doit pas contenir ${interdit}`);
  assert.match(readFileSync("components/vendeur-shell.tsx", "utf8"),
    /\{ cle: "clients", href: "\/tableau-de-bord\/clients", texte: t\(lang, "vendeur\.nav\.clients"\), icone: "clients" \}/);
});

test("V6 — textes en quatre langues, gabarits intacts", () => {
  const cles = ["vendeur.nav.clients", "vendeur.clients.titre", "vendeur.clients.intro", "vendeur.clients.k30", "vendeur.clients.k90",
    "vendeur.clients.revenus", "vendeur.clients.revenus.aide", "vendeur.clients.top", "vendeur.clients.liste",
    "vendeur.clients.anonyme", "vendeur.clients.vide"] as const;
  for (const lang of LANGS) {
    for (const k of cles) assert.ok(DICT[lang][k]?.trim(), `${lang} ${k}`);
    for (const k of ["vendeur.clients.ventes", "vendeur.clients.ventes.one", "vendeur.clients.commandes", "vendeur.clients.commandes.one", "vendeur.clients.partiel"] as const)
      assert.ok(DICT[lang][k].includes("{n}"), `${lang} ${k}`);
    assert.ok(DICT[lang]["vendeur.clients.derniere"].includes("{date}"), `${lang} derniere`);
  }
  for (const k of cles) assert.notEqual(DICT.ht[k], DICT.fr[k], `${k} : le kreyòl recopie le français`);
});
