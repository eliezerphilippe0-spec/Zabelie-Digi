import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Une vente REMBOURSÉE garde son dernier état de remise : `refund_order` ne
 * touche pas `zabelie_fulfillment`. Mesuré le 2026-10-30 à la clôture du
 * litige du 2026-08-22 : « Mes ventes » affichait encore « En cours
 * d'examen ». Pour une vente remboursée avant l'envoi, il aurait proposé
 * « Déclarer l'envoi », le code de remise, le numéro à recharger et
 * l'adresse de livraison — l'invitation à expédier une commande remboursée.
 *
 * Page serveur (Next interdit d'en exporter le prédicat) : les assertions
 * portent sur ce qui COMMANDE — la source du prédicat, la colonne lue, et la
 * condition posée devant chaque élément —, jamais sur un libellé seul.
 */
const VENTES = readFileSync("app/mes-ventes/page.tsx", "utf8");

test("le prédicat lit le statut de la COMMANDE, pas celui de la remise", () => {
  assert.match(VENTES, /function venteRemboursee\(v: VenteRow\): boolean \{\s*return v\.order\?\.status === "refunded";\s*\}/);
  // La colonne doit être lue : sans elle, `v.order.status` vaut undefined et le garde ne s'ouvre jamais.
  assert.match(VENTES, /order:orders!inner\(id, order_ref, amount_htg, created_at, buyer_id, status, products!/);
});

test("le libellé dit « Remboursée » à la place de l'état de remise", () => {
  assert.match(VENTES, /t\(lang, venteRemboursee\(v\) \? "purchases\.status\.refunded" : cleEtatRemise\(v\.status\)\)/);
  assert.equal(VENTES.match(/cleEtatRemise\(v\.status\)/g)?.length, 1, "aucun autre libellé d'état non gardé");
});

test("aucune action ni détail de livraison pour une vente remboursée", () => {
  const gardes: Array<[string, RegExp]> = [
    ["déclarer l'envoi", /venteRemboursee\(v\) \? null : v\.status === "awaiting_shipment" \? \(\s*<FulfillmentAction/],
    ["code de remise", /!venteRemboursee\(v\) && \(v\.status === "awaiting_shipment" \|\| v\.status === "shipped"\) && \(\s*<HandoverCodeSeller/],
    ["numéro à recharger", /!venteRemboursee\(v\) && \(\(\) => \{\s*const cible = cibleParCommande\.get\(v\.order_id\);/],
    ["zone de remise", /!venteRemboursee\(v\) && zoneParCommande\.has\(v\.order_id\) && <ZoneCommande/],
    ["destinataire", /!venteRemboursee\(v\) && recipientByOrder\.has\(v\.order_id\) && <RecipientDetails/],
    ["adresse de livraison", /!venteRemboursee\(v\) && !recipientReadError && !recipientByOrder\.has\(v\.order_id\) && v\.status === "awaiting_shipment"/],
  ];
  for (const [nom, motif] of gardes) assert.match(VENTES, motif, `garde absent : ${nom}`);
  // Chaque élément n'apparaît qu'UNE fois : un second rendu non gardé ne passerait pas inaperçu.
  for (const balise of ["<FulfillmentAction", "<HandoverCodeSeller", "<ZoneCommande", "<RecipientDetails", "cibleParCommande.get(v.order_id)"]) {
    assert.equal(VENTES.split(balise).length - 1, 1, `${balise} rendu plus d'une fois`);
  }
});
