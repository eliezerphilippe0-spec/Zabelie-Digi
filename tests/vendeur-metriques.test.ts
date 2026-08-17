import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DICT } from "../lib/i18n";

/**
 * DEUX QUESTIONS, DEUX CARTES (2026-08-17).
 *
 * « Revenus nets · 12 ventes » fusionnait deux mesures dans un libellé : le
 * compte des ventes vivait dans la ligne de contexte, comme une note de bas
 * de page. Or « combien de fois quelqu'un m'a acheté » et « combien j'ai
 * gagné » ne répondent pas à la même question — et l'écart entre les deux est
 * précisément ce qu'une remise ou une vente flash creuse. Un vendeur qui voit
 * ses ventes monter pendant que ses revenus stagnent apprend quelque chose ;
 * le libellé fusionné le lui cachait.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = sansCommentaires(readFileSync("app/tableau-de-bord/page.tsx", "utf8"));
const LANGUES = ["fr", "ht", "en", "es"] as const;

// ── Les deux mesures sont séparées ─────────────────────────────────────────

test("le compte de ventes a sa PROPRE carte — plus une note de bas de page", () => {
  assert.match(PAGE, /label: t\(lang, "tb\.ventes"\),\s*\n\s*value: String\(totalSales\)/);
  // Et il n'est plus fondu dans la fenêtre des revenus.
  assert.ok(
    !/\$\{totalSales\} vente/.test(PAGE),
    "le compte ne doit plus vivre dans le libellé des revenus"
  );
});

test("les revenus nets sont SEULS sur leur carte", () => {
  assert.match(
    PAGE,
    /label: t\(lang, "tb\.nets"\),\s*\n\s*value: netComplet \? formatHTG\(netTotal\) : `≥ \$\{formatHTG\(netTotal\)\}`/
  );
});

test("cinq métriques : une principale, quatre secondaires", () => {
  const labels = PAGE.match(/label: t\(lang, "tb\.[a-z]+"\)/g) ?? [];
  assert.equal(labels.length, 5, `${labels.length} métriques — attendu 5`);
});

// ── Le panier moyen ────────────────────────────────────────────────────────

test("le panier moyen est une division ENTIÈRE — jamais de flottant sur l'argent", () => {
  // Règle dure n°3. Un `netTotal / totalSales` nu produirait 1 233,3333 HTG.
  assert.match(PAGE, /Math\.floor\(netTotal \/ totalSales\)/);
});

test("il ne s'affiche PAS quand le total est incomplet ou nul", () => {
  /* Deux pièges dans une seule expression : une division par zéro (aucune
   * vente), et une moyenne calculée sur un numérateur AMPUTÉ — le total
   * préfixé « ≥ ». La seconde serait fausse sans le dire, ce qui est pire
   * que de ne rien afficher. */
  assert.match(
    PAGE,
    /netComplet && totalSales > 0 \? Math\.floor\(netTotal \/ totalSales\) : null/
  );
  // Et la carte retombe alors sur une fenêtre neutre, jamais sur du vide.
  assert.match(
    PAGE,
    /panierMoyen !== null\s*\n\s*\? t\(lang, "tb\.ventes\.moy"\)[\s\S]{0,120}: t\(lang, "tb\.ventes\.f"\)/
  );
});

test("le calcul, vérifié sur des nombres et pas sur du texte", () => {
  const moyen = (net: number, ventes: number, complet: boolean) =>
    complet && ventes > 0 ? Math.floor(net / ventes) : null;
  assert.equal(moyen(12_500, 4, true), 3125);
  assert.equal(moyen(10_000, 3, true), 3333, "arrondi vers le bas, pas de centime inventé");
  assert.equal(moyen(5_000, 0, true), null, "aucune vente : pas de division");
  assert.equal(moyen(5_000, 2, false), null, "total amputé : pas de moyenne");
});

// ── Les quatre langues ─────────────────────────────────────────────────────

test("les douze libellés existent dans les quatre langues, et diffèrent", () => {
  const CLES = [
    "tb.dispo", "tb.dispo.f", "tb.attente", "tb.attente.f", "tb.attente.date",
    "tb.ventes", "tb.ventes.f", "tb.ventes.moy", "tb.nets", "tb.nets.f",
    "tb.produits", "tb.produits.f",
  ];
  for (const cle of CLES) {
    for (const l of LANGUES) {
      const v = (DICT[l] as Record<string, string>)[cle];
      assert.ok(typeof v === "string" && v.trim(), `${cle} absente en ${l}`);
    }
  }
  /* Le kreyòl et le français partagent des mots ; s'ils partagent la PHRASE
   * entière sur tout un bloc, c'est que personne n'a traduit. On tolère qu'un
   * terme coïncide (« Disponible » / « Disponib » diffèrent, mais certaines
   * langues peuvent converger) — pas que le bloc entier soit identique. */
  const identiques = CLES.filter(
    (c) => (DICT.fr as Record<string, string>)[c] === (DICT.ht as Record<string, string>)[c]
  );
  assert.ok(identiques.length <= 2, `fr et ht identiques sur ${identiques.join(", ")}`);
});

test("les marqueurs de substitution survivent dans toutes les langues", () => {
  // Sans eux, `replace` ne remplace rien : la date ou le montant disparaît.
  for (const l of LANGUES) {
    assert.match((DICT[l] as Record<string, string>)["tb.attente.date"], /\{date\}/, l);
    assert.match((DICT[l] as Record<string, string>)["tb.ventes.moy"], /\{montant\}/, l);
    assert.match((DICT[l] as Record<string, string>)["tb.produits.f"], /\{total\}/, l);
  }
});

test("chaque marqueur est effectivement REMPLACÉ à l'usage", () => {
  /* Une clé qui porte `{date}` et un rendu qui ne fait pas le `replace`
   * afficherait le marqueur brut à l'écran — un défaut qui passe tous les
   * contrôles de traduction. */
  assert.match(PAGE, /t\(lang, "tb\.attente\.date"\)\.replace\(\s*\n?\s*"\{date\}"/);
  assert.match(PAGE, /t\(lang, "tb\.ventes\.moy"\)\.replace\("\{montant\}"/);
  assert.match(PAGE, /t\(lang, "tb\.produits\.f"\)\.replace\("\{total\}"/);
});

test("la langue est résolue AVANT le bloc — `t()` est réservé au serveur", () => {
  const iLang = PAGE.indexOf("const lang = await getLang()");
  const iBloc = PAGE.indexOf("const metriquePrincipale");
  assert.ok(iLang > 0 && iBloc > 0);
  assert.ok(iLang < iBloc, "sinon `lang` serait utilisé avant sa déclaration");
});

test("la grille des secondaires est PAIRE — plus de carte orpheline à rattraper", () => {
  assert.match(PAGE, /grid grid-cols-2 gap-4 sm:grid-cols-4/);
  assert.ok(
    !/last:col-span-2/.test(PAGE),
    "le rattrapage de la carte orpheline n'a plus d'objet avec quatre secondaires"
  );
});
