import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { momentDeLaJournee, resumerVentes, type LigneVente } from "../lib/digital-authoring/ventes";
import { copieVentes } from "../lib/digital-authoring/copy-ventes";

/**
 * L'ACCUEIL DU STUDIO FAÇON CHARIOW (tasks/plan.md, phase T2). Ce qui est
 * gardé : la salutation suit l'heure d'Haïti et non celle du serveur ; chaque
 * chiffre se déduit des commandes et du grand livre, sans rien deviner ; une
 * lecture ratée ne devient pas un zéro ; les textes tiennent en quatre langues.
 */

test("T2.1 — la salutation suit l'heure d'Haïti, pas celle du serveur (UTC)", () => {
  // 19 h UTC un jour d'octobre = 15 h au Cap (UTC−4) : pas encore le soir.
  assert.equal(momentDeLaJournee(new Date("2026-10-17T19:00:00Z")), "apresMidi");
  assert.equal(momentDeLaJournee(new Date("2026-10-17T23:30:00Z")), "soir");
  assert.equal(momentDeLaJournee(new Date("2026-10-17T10:00:00Z")), "matin");
  // En hiver, UTC−5 : 16 h 30 UTC = 11 h 30, encore le matin.
  assert.equal(momentDeLaJournee(new Date("2026-01-15T16:30:00Z")), "matin");
  assert.equal(momentDeLaJournee(new Date("2026-10-17T04:00:00Z")), "soir"); // minuit
  // Le kreyòl dit « bonswa » dès midi ; le français attend le soir.
  assert.match(copieVentes("ht").salut.apresMidi, /^Bonswa/);
  assert.match(copieVentes("fr").salut.apresMidi, /^Bonjour/);
  assert.match(copieVentes("fr").salut.soir, /^Bonsoir/);
});

const MAINTENANT = new Date("2026-10-17T20:00:00Z");
const produit = (id: string, title: string) => ({ id, title, price_htg: 500, cover_url: null, slug: id });
const credit = (amount_htg: number, created_at: string) => ({ amount_htg, type: "credit", created_at });

const LIGNES: LigneVente[] = [
  { id: "o1", buyer_id: "a", product: produit("p1", "Guide A"), wallet_transactions: [credit(465, "2026-10-16T12:00:00Z")] },
  { id: "o2", buyer_id: "b", product: produit("p1", "Guide A"), wallet_transactions: [credit(465, "2026-09-01T12:00:00Z")] },
  { id: "o3", buyer_id: "a", product: produit("p2", "Guide B"), wallet_transactions: [credit(930, "2026-10-12T12:00:00Z"), { amount_htg: 930, type: "debit", created_at: "2026-10-13T12:00:00Z" }] },
  { id: "o4", buyer_id: "c", product: null, wallet_transactions: [credit(999, "2026-10-17T12:00:00Z")] },
  { id: "o5", buyer_id: "d", product: produit("p3", "Guide C"), wallet_transactions: null },
];

test("T2.2 — revenus, 7 jours, clients et classement se déduisent des lignes, rien d'autre", () => {
  const r = resumerVentes(LIGNES, MAINTENANT, true);
  // Seuls les crédits comptent (le débit n'est pas un revenu) ; une ligne sans produit est ignorée.
  assert.equal(r.revenus, 465 + 465 + 930);
  // Fenêtre de sept jours à la date du crédit : o1 (16 oct.) et o3 (12 oct.), pas o2 (1er sept.).
  assert.equal(r.revenus7j, 465 + 930);
  assert.equal(r.ventes, 4);
  assert.equal(r.clients, 3, "a, b et d : un acheteur qui revient compte une fois");
  assert.deepEqual(r.meilleurs.map((p) => [p.titre, p.ventes, p.revenus]), [["Guide A", 2, 930], ["Guide B", 1, 930], ["Guide C", 1, 0]]);
  assert.equal(r.complet, true);
  assert.equal(resumerVentes(LIGNES, MAINTENANT, false).complet, false);
  assert.deepEqual(resumerVentes([], MAINTENANT, true), { revenus: 0, revenus7j: 0, ventes: 0, clients: 0, meilleurs: [], complet: true });
});

test("T2.3 — la lecture : JWT du vendeur, ses produits digitaux, clé nommée, échec dit", () => {
  const src = readFileSync("lib/digital-authoring/ventes.ts", "utf8");
  assert.match(src, /products!orders_product_id_fkey!inner/, "depuis 0111, une jointure sans clé nommée répond PGRST201");
  assert.match(src, /\.eq\("product\.seller_id", vendeurId\)/, "sans ce filtre, les ACHATS du vendeur passeraient pour des ventes");
  assert.match(src, /\.eq\("product\.kind", KIND_FILE\)/);
  assert.match(src, /\.in\("status", \["paid", "delivered"\]\)/);
  assert.match(src, /if \(error\) \{[\s\S]*?return null;/, "une lecture ratée rend null, pas une liste vide");
  const page = readFileSync("app/tableau-de-bord/creation/page.tsx", "utf8");
  assert.ok(!page.includes("createAdminClient"), "le Studio ne lit jamais par la clé de service");
  assert.match(page, /ventes === null \?/, "l'écran dit qu'il n'a pas pu lire");
  assert.match(page, /\{aVendu && blocVentes\}[\s\S]*\{!aVendu && blocVentes\}/, "sans vente, les projets passent avant les chiffres");
});

test("T2.4 — textes : quatre langues complètes, sans tiret de liaison ni émoji", () => {
  const fr = copieVentes("fr");
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    const c = copieVentes(lang);
    for (const [cle, val] of Object.entries(c)) {
      const textes = typeof val === "string" ? [val] : Object.values(val as Record<string, string>);
      for (const texte of textes) {
        assert.ok(texte.trim(), `${lang} ${cle} vide`);
        assert.doesNotMatch(texte, /\s[—–]\s/, `${lang} ${cle} : « ${texte} »`);
        assert.doesNotMatch(texte, /\p{Extended_Pictographic}/u, `${lang} ${cle} : émoji`);
      }
    }
    for (const k of ["carteClientsNote", "ventesN", "incomplet"] as const) assert.ok(c[k].includes("{n}"), `${lang} ${k}`);
    assert.ok(c.salut.matin.includes("{nom}") && c.salut.soir.includes("{nom}"), lang);
    assert.deepEqual(Object.keys(c).sort(), Object.keys(fr).sort(), lang);
  }
});

test("T2.5 — l'action « code promo » mène à une ancre qui existe", () => {
  const tableau = readFileSync("app/tableau-de-bord/page.tsx", "utf8");
  assert.match(tableau, /id="codes-promo"/);
  const page = readFileSync("app/tableau-de-bord/creation/page.tsx", "utf8");
  // Le tableau vendeur ne montre les codes promo qu'à qui a un produit : l'action suit la même condition.
  assert.match(page, /nbProduits \? \[\{ cle: "promo", href: "\/tableau-de-bord#codes-promo"/);
});
