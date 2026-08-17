import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sommeHTG, LOT, PLAFOND_LOTS } from "../lib/somme-htg";

/**
 * SOMMES D'ARGENT COMPLÈTES (2026-08-16).
 *
 * Deux totaux étaient calculés sur `.limit(1000)` puis sommés en mémoire : au
 * delà de 1 000 lignes ils devenaient faux VERS LE BAS, sans rien signaler.
 * Ce qui suit vérifie les deux moitiés du correctif — la somme est complète,
 * et quand elle ne peut pas l'être elle le DIT.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ADMIN = sansCommentaires(readFileSync("app/admin/page.tsx", "utf8"));
const VENDEUR = sansCommentaires(readFileSync("app/tableau-de-bord/page.tsx", "utf8"));

/** Faux dépôt : rend `n` lignes de `montant`, en journalisant les bornes reçues. */
function depot(n: number, montant = 1) {
  const bornes: Array<[number, number]> = [];
  const lot = async (de: number, a: number) => {
    bornes.push([de, a]);
    const combien = Math.max(0, Math.min(a, n - 1) - de + 1);
    return { data: Array.from({ length: combien }, () => ({ amount_htg: montant })), error: null };
  };
  return { lot, bornes };
}

/** Capture `console.log` — et rend ce qui a été écrit. */
async function sansBruit<T>(f: () => Promise<T>): Promise<[T, string]> {
  const vrai = console.log;
  let sortie = "";
  console.log = (...a: unknown[]) => {
    sortie += a.map(String).join(" ") + "\n";
  };
  try {
    return [await f(), sortie];
  } finally {
    console.log = vrai;
  }
}

// ── La somme elle-même ─────────────────────────────────────────────────────

test("un seul lot partiel : total exact, complet, une seule requête", async () => {
  const { lot, bornes } = depot(3, 500);
  const r = await sommeHTG(lot, "test");
  assert.deepEqual(r, { total: 1500, lignes: 3, complet: true });
  assert.equal(bornes.length, 1, "rien à demander après un lot incomplet");
});

test("le total DÉPASSE l'ancien plafond de 1 000 — c'est tout l'objet du correctif", async () => {
  /* Connu-négatif du défaut d'origine : avec `.limit(1000)` ce total valait
   * 1 000 au lieu de 1 500. Le test échouerait sur l'ancien code. */
  const { lot } = depot(1500, 1);
  const r = await sommeHTG(lot, "test");
  assert.equal(r.total, 1500);
  assert.equal(r.lignes, 1500);
  assert.equal(r.complet, true);
});

test("la frontière exacte : un multiple de LOT demande un lot de plus", async () => {
  // C'est l'erreur de ±1 classique — LOT lignes pile ne sont PAS la fin
  // connue : il faut un lot vide pour l'établir.
  const { lot, bornes } = depot(LOT, 1);
  const r = await sommeHTG(lot, "test");
  assert.equal(r.total, LOT);
  assert.equal(r.complet, true);
  assert.equal(bornes.length, 2, "un lot plein ne prouve pas qu'il n'y a plus rien");
});

test("les bornes sont INCLUSIVES aux deux bouts, comme .range()", async () => {
  const { lot, bornes } = depot(LOT * 2 + 1, 1);
  await sommeHTG(lot, "test");
  assert.deepEqual(bornes[0], [0, LOT - 1]);
  assert.deepEqual(bornes[1], [LOT, LOT * 2 - 1]);
  assert.deepEqual(bornes[2], [LOT * 2, LOT * 3 - 1]);
});

// ── Ce qu'elle refuse de promettre ─────────────────────────────────────────

test("erreur en cours de route : total PARTIEL marqué, jamais zéro", async () => {
  /* Rendre 0 se lirait « ce vendeur n'a rien gagné » — un mensonge plus grave
   * que « au moins tant ». La somme déjà acquise est conservée et marquée. */
  let appel = 0;
  const lot = async (de: number, a: number) => {
    appel++;
    if (appel === 2) return { data: null, error: { message: "réseau" } };
    return {
      data: Array.from({ length: a - de + 1 }, () => ({ amount_htg: 10 })),
      error: null,
    };
  };
  const [r, journal] = await sansBruit(() => sommeHTG(lot, "vendeur.revenus_nets"));
  assert.equal(r.complet, false, "un total partiel ne se présente jamais comme complet");
  assert.equal(r.total, LOT * 10, "ce qui a été additionné est conservé");
  assert.notEqual(r.total, 0);
  assert.match(journal, /"code":"ZB085"/);
  assert.match(journal, /"issue":"lot_en_erreur"/);
  assert.match(journal, /"source":"vendeur\.revenus_nets"/);
});

test("le plafond de lots est DUR — pas de boucle sur une table entière", async () => {
  // Dépôt infini : chaque lot est plein. Sans borne, cette page tournerait
  // indéfiniment à chaque affichage.
  let appels = 0;
  const lot = async (de: number, a: number) => {
    appels++;
    return {
      data: Array.from({ length: a - de + 1 }, () => ({ amount_htg: 1 })),
      error: null,
    };
  };
  const [r, journal] = await sansBruit(() => sommeHTG(lot, "test"));
  assert.equal(appels, PLAFOND_LOTS, "exactement le plafond, ni plus ni moins");
  assert.equal(r.complet, false);
  assert.match(journal, /"issue":"plafond_de_lots_atteint"/);
});

test("le cas ordinaire ne fait PAS de bruit — un lot, aucune trace", async () => {
  /* Corollaire d'observabilité : si tout journalisait, plus rien ne se verrait.
   * Ce qui sort de l'ordinaire porte une trace ; l'ordinaire, non. */
  const { lot } = depot(12, 100);
  const [, journal] = await sansBruit(() => sommeHTG(lot, "test"));
  assert.equal(journal, "");
});

// ── Les deux sites d'appel ─────────────────────────────────────────────────

test("aucun total d'argent n'est plus calculé sur un .limit(1000)", async () => {
  assert.ok(!/\.limit\(1000\)/.test(ADMIN), "GMV de /admin");
  assert.ok(!/\.limit\(1000\)/.test(VENDEUR), "revenus nets du vendeur");
});

test("le GMV vient de la somme par lots, sur les commandes PAYÉES", () => {
  assert.match(
    ADMIN,
    /sommeHTG\(\s*\(de, a\) =>\s*admin\s*\.from\("orders"\)\s*\.select\("amount_htg"\)\s*\.in\("status", \["paid", "delivered"\]\)[\s\S]{0,120}\.range\(de, a\)/,
    "la source du total doit rester les commandes payées, bornées par range"
  );
});

test("le « ≥ » est COMMANDÉ par l'incomplétude — pas juste présent quelque part", () => {
  /* Règle de régression de proximité : une extrémité doit porter la LIAISON.
   * Ici c'est le ternaire lui-même — la condition ET ses deux issues. */
  assert.match(
    ADMIN,
    /gmvSomme\.complet \? gmv : `≥ \$\{gmv\}`/,
    "admin : le préfixe dépend de `complet`"
  );
  assert.match(
    VENDEUR,
    /netComplet \? formatHTG\(netTotal\) : `≥ \$\{formatHTG\(netTotal\)\}`/,
    "vendeur : le préfixe dépend de `netComplet`"
  );
});

test("`netComplet` est ALIMENTÉ par la somme — un drapeau figé ne prouverait rien", () => {
  // Sans cette liaison, `netComplet = true` en dur laisserait les deux
  // assertions ci-dessus vertes tout en réintroduisant le mensonge.
  assert.match(VENDEUR, /netTotal = somme\.total;\s*\n\s*netComplet = somme\.complet;/);
});
