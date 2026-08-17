import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DICT } from "../lib/i18n";

/**
 * HIÉRARCHIE ET ALIGNEMENT DU TABLEAU DE BORD VENDEUR (2026-08-17).
 *
 * Ce que ces assertions protègent n'est pas « joli » mais LISIBLE :
 *   • un seul accent, sinon l'accent ne désigne plus rien ;
 *   • les montants dans une colonne, sinon on ne compare pas deux ventes.
 *
 * Vérifié à l'écran en plus des assertions — 390 px et 1100 px, thèmes sombre
 * ET clair, sur la feuille de style compilée. Les bords droits des quatre
 * montants ont été mesurés identiques (x = 353), et les largeurs de cartes à
 * 390 px valent 167 · 167 · 350 : aucune carte orpheline à mi-largeur.
 */
const TB = readFileSync("app/tableau-de-bord/page.tsx", "utf8");
/* Les commentaires JSX `{/* … *​/}` partent EN PREMIER : nettoyer les
 * commentaires de bloc d'abord laisserait un `{}` orphelin au milieu du
 * balisage, et une assertion d'adjacence tomberait sur ce résidu — l'outil
 * mentirait sur le code au lieu de le décrire. Mordu à l'écriture de ce
 * fichier ; la trace reste. */
const CODE = TB.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("l'accent de marque est RARE — une seule métrique le porte", () => {
  /* Le défaut d'origine : `text-gradient` sur les quatre cartes. Un accent
   * posé partout ne hiérarchise rien — « Produits publiés » brillait autant
   * que « Disponible ». Compter est ici la bonne assertion : deux occurrences
   * signifient que la rareté a été perdue, quel que soit l'endroit. */
  const n = CODE.split("text-gradient").length - 1;
  assert.equal(n, 1, `text-gradient apparaît ${n}× — l'accent doit rester unique`);
});

test("le dégradé est sur la métrique PRINCIPALE, pas sur une secondaire", () => {
  // La liaison : le dégradé et la valeur du hero dans le même élément.
  assert.match(
    CODE,
    /text-gradient[^"]*"\s*>\s*\n?\s*\{metriquePrincipale\.value\}/,
    "l'accent doit désigner le solde disponible"
  );
});

test("le libellé passe AVANT la valeur — on sait ce qu'on lit", () => {
  const iLabel = CODE.indexOf("{metriquePrincipale.label}");
  const iValue = CODE.indexOf("{metriquePrincipale.value}");
  assert.ok(iLabel > 0 && iValue > 0, "les deux doivent être rendus");
  assert.ok(iLabel < iValue, "le libellé doit précéder la valeur dans le rendu");
});

test("chaque métrique porte sa FENÊTRE — un montant sans période ne dit rien", () => {
  /* C'est la correction de fond : « Revenus nets » ne disait pas sur quel
   * intervalle, donc n'était pas interprétable. La fenêtre est RENDUE, pas
   * seulement déclarée — un champ posé dans l'objet et jamais affiché serait
   * exactement le garde décoratif que ce dépôt traque. */
  /* Les libellés viennent désormais de `t()` — le bloc est traduit dans les
     quatre langues (2026-08-17). Ce que l'assertion protège n'a pas changé :
     CHAQUE métrique porte une fenêtre, et elle est RENDUE. Seule la source du
     texte a bougé, et c'est elle qu'on vérifie maintenant — un libellé en dur
     qui reviendrait ici rougirait. */
  assert.match(CODE, /fenetre: t\(lang, "tb\.dispo\.f"\)/);
  const fenetres = CODE.match(/fenetre:/g) ?? [];
  assert.equal(fenetres.length, 5, "une fenêtre par métrique, hero compris");
  for (const cle of ["tb.dispo.f", "tb.attente.f", "tb.ventes.f", "tb.nets.f", "tb.produits.f"]) {
    for (const l of ["fr", "ht", "en", "es"] as const) {
      const v = (DICT[l] as Record<string, string>)[cle];
      assert.ok(typeof v === "string" && v.trim(), `${cle} absente en ${l}`);
    }
  }
  assert.match(CODE, /\{metriquePrincipale\.fenetre\}/, "rendue pour le hero");
  assert.match(CODE, /\{m\.fenetre && <p[^>]*>\{m\.fenetre\}<\/p>\}/, "rendue pour les secondaires");
});

test("le MONTANT occupe seul une colonne — c'est ce qui les aligne", () => {
  /* Le défaut d'origine : montant et date dans le même `<span>` poussé à
   * droite par `justify-between`. Deux montants ne se superposaient donc pas.
   * L'assertion porte sur la LIAISON — le montant DANS une cellule alignée à
   * droite — et non sur la présence du mot « grid » quelque part. */
  assert.match(
    CODE,
    /<p className="metric text-right[^"]*">\s*\n?\s*\{formatHTG\(o\.amount_htg\)\}/,
    "le montant doit vivre seul dans une cellule alignée à droite"
  );
  assert.match(CODE, /<li\s+key=\{o\.id\}\s+className="grid grid-cols-\[1fr_auto\]/);
});

test("la date est une MÉTADONNÉE, plus une mesure collée au montant", () => {
  assert.ok(
    !/\{formatHTG\(o\.amount_htg\)\} ·/.test(CODE),
    "l'ancienne concaténation montant · date doit avoir disparu"
  );
  // Elle vit désormais avec le numéro de commande, sur la ligne discrète.
  assert.match(
    CODE,
    /\{new Date\(o\.created_at\)\.toLocaleDateString\("fr-HT"\)\}\s*\n\s*\{o\.order_ref/
  );
});

test("le numéro de commande reste sélectable — il se dicte sur WhatsApp", () => {
  // Détail local, invisible dans n'importe quel tableau de bord occidental :
  // l'acheteur et le vendeur poursuivent la conversation ailleurs.
  assert.match(CODE, /className="numeric select-all">\s*\n?\s*\{o\.order_ref\}/);
});
