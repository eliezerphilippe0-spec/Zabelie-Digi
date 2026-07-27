import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Le programme de fidélité ne se câble pas au checkout tant que **D-6** n'est
 * pas tranchée (`docs/02`).
 *
 * Motif : la commission se calcule sur `orders.amount_htg`, qui est le prix
 * **remisé** figé au checkout. Une remise de fidélité y entrerait comme
 * n'importe quelle autre — et le vendeur encaisserait moins, pour financer un
 * dispositif de rétention qui appartient à la plateforme, sans l'avoir choisi
 * ni même le savoir. Aujourd'hui seul `zabelie_coupons` (0012) atteint le
 * checkout : ces coupons-là ont un `seller_id`, le vendeur les crée lui-même,
 * il finance sa propre promotion. La table `coupons` (0021) n'a pas de
 * vendeur : c'est un engagement de la plateforme.
 *
 * Aucun point n'a jamais été émis : la décision peut encore se prendre
 * proprement. Une fois une ligne écrite au grand livre, non — il est
 * append-only.
 *
 * Ce test n'interdit pas le programme. Il interdit de le brancher **par
 * inadvertance**, en rendant le câblage impossible à faire en silence.
 */

const ROOTS = ["app", "components", "lib"];

/** Consommation d'une remise de fidélité côté commande. */
const INTERDITS: { motif: RegExp; quoi: string }[] = [
  { motif: /rpc\(\s*["'`]apply_coupon_to_order["'`]/, quoi: "apply_coupon_to_order (0021)" },
  { motif: /rpc\(\s*["'`]redeem_points_for_coupon["'`]/, quoi: "redeem_points_for_coupon (0021)" },
  { motif: /rpc\(\s*["'`]award_points["'`]/, quoi: "award_points (0021)" },
  // `from("coupons")` — surtout PAS `from("zabelie_coupons")`, qui est la
  // promotion vendeur, légitime et déjà en production.
  { motif: /from\(\s*["'`]coupons["'`]/, quoi: 'table `coupons` (0021)' },
];

/** L'expiration est un entretien, pas une émission : elle reste permise. */
const TOLERE = new Set([join("app", "api", "points", "expire", "route.ts")]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

test("fidélité : aucune remise de points n'atteint le money-path (D-6 ouverte)", () => {
  const trouves: string[] = [];
  for (const f of ROOTS.flatMap((r) => walk(r))) {
    if (TOLERE.has(f)) continue;
    const src = readFileSync(f, "utf8");
    for (const { motif, quoi } of INTERDITS) {
      if (motif.test(src)) trouves.push(`${f} → ${quoi}`);
    }
  }

  assert.deepEqual(
    trouves,
    [],
    "Le programme de fidélité vient d'être branché sur un chemin réel :\n" +
      trouves.map((t) => `  - ${t}`).join("\n") +
      "\n\nUne remise de fidélité réduit `orders.amount_htg`, donc le net du VENDEUR :\n" +
      "c'est lui qui paierait la rétention de la plateforme. Trancher D-6 d'abord\n" +
      "(`docs/02`) — commission sur le prix affiché, remise supportée par Zabelie,\n" +
      "ou participation choisie par le vendeur. Puis retirer ce garde en connaissance\n" +
      "de cause.",
  );
});

test("la promotion VENDEUR reste permise — le garde ne confond pas les deux tables", () => {
  // Known-positive du garde lui-même : `zabelie_coupons` ne doit déclencher
  // aucun motif, sinon le test interdirait le checkout existant.
  const echantillon = 'await admin.from("zabelie_coupons").select("*")';
  for (const { motif } of INTERDITS) {
    assert.equal(motif.test(echantillon), false, `faux positif sur ${motif}`);
  }
});
