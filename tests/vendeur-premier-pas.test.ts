import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { etapeVendeur, besoinDeGuidage, clesEtape } from "../lib/vendeur-etape";
import { DICT } from "../lib/i18n";

/**
 * L'ÉCRAN DU VENDEUR QUI N'A PAS ENCORE VENDU (2026-08-17).
 *
 * La décision est une fonction PURE, donc elle se teste sans rien rendre :
 * les quatre cas s'énumèrent, les frontières s'éprouvent une par une. Ce que
 * les assertions structurelles ajoutent, c'est la LIAISON entre cette
 * décision et l'écran — une machine à états correcte branchée nulle part
 * serait exactement le défaut « code sans appelant ».
 */
const sansCommentaires = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = sansCommentaires(readFileSync("app/tableau-de-bord/page.tsx", "utf8"));
const COMP = sansCommentaires(readFileSync("components/vendeur-premier-pas.tsx", "utf8"));

// ── Les quatre états ───────────────────────────────────────────────────────

test("les quatre cas, aux frontières exactes", () => {
  assert.equal(etapeVendeur({ produits: 0, publies: 0, ventes: 0 }), "aucun_produit");
  assert.equal(etapeVendeur({ produits: 1, publies: 0, ventes: 0 }), "brouillon");
  assert.equal(etapeVendeur({ produits: 1, publies: 1, ventes: 0 }), "publie_sans_vente");
  assert.equal(etapeVendeur({ produits: 1, publies: 1, ventes: 1 }), "en_vente");
});

test("une VENTE prime sur tout — même sans produit publié aujourd'hui", () => {
  /* Cas réel : un vendeur qui a vendu puis dépublié. Lui remontrer « publiez
   * votre premier produit » effacerait ce qu'il a fait. L'ordre des tests EST
   * la règle métier, pas un détail d'écriture. */
  assert.equal(etapeVendeur({ produits: 0, publies: 0, ventes: 3 }), "en_vente");
  assert.equal(etapeVendeur({ produits: 2, publies: 0, ventes: 1 }), "en_vente");
});

test("le guidage s'arrête exactement à la première vente", () => {
  assert.equal(besoinDeGuidage(etapeVendeur({ produits: 1, publies: 1, ventes: 0 })), true);
  assert.equal(besoinDeGuidage(etapeVendeur({ produits: 1, publies: 1, ventes: 1 })), false);
});

// ── Les clés, en toutes lettres et dans les quatre langues ─────────────────

test("chaque étape porte trois clés RÉELLES, traduites partout", () => {
  /* `Record<I18nKey, string>` vérifie qu'une langue ne perd pas une clé ; il
   * ne vérifie pas qu'une clé EXISTE. Ici on part de ce que le code demande
   * et on redescend vers le dictionnaire — le sens qui attrape une faute de
   * frappe. */
  const langues = ["fr", "ht", "en", "es"] as const;
  for (const etape of ["aucun_produit", "brouillon", "publie_sans_vente"] as const) {
    const c = clesEtape(etape);
    for (const cle of [c.titre, c.texte, c.cta, "pas.publie.lien", "pas.publie.message"]) {
      for (const l of langues) {
        const v = (DICT[l] as Record<string, string>)[cle];
        assert.equal(typeof v, "string", `${cle} absente en ${l}`);
        assert.ok(v.trim().length > 0, `${cle} vide en ${l}`);
      }
    }
  }
});

test("les quatre traductions DIFFÈRENT — un copier-coller n'est pas une traduction", () => {
  // Le kreyòl et le français partagent des mots ; s'ils partagent la PHRASE
  // entière, c'est que personne n'a traduit.
  for (const cle of ["pas.aucun.titre", "pas.publie.texte", "pas.brouillon.cta"]) {
    const vues = new Set(
      (["fr", "ht", "en", "es"] as const).map((l) => (DICT[l] as Record<string, string>)[cle])
    );
    assert.equal(vues.size, 4, `${cle} : ${vues.size} formulations pour 4 langues`);
  }
});

test("le message WhatsApp porte le marqueur {lien} dans les quatre langues", () => {
  // Sans lui, `replace` ne remplace rien et le vendeur partage une phrase
  // sans adresse — un partage qui ne mène nulle part.
  for (const l of ["fr", "ht", "en", "es"] as const) {
    assert.match((DICT[l] as Record<string, string>)["pas.publie.message"], /\{lien\}/, l);
  }
});

// ── La liaison avec l'écran ────────────────────────────────────────────────

test("le guidage est rendu AVANT les métriques — pas après", () => {
  /* Quatre zéros en très gros au-dessus d'un « publiez votre premier
   * produit » diraient l'échec avant de dire quoi faire. */
  /* ⚠️ FRONTIÈRE EXPLICITE, et elle a été gagnée à la mutation. La première
   * version cherchait `indexOf("<VendeurPremierPas")` : elle est restée VERTE
   * quand le point de montage a été renommé `<VendeurPremierPasOff`, puisque
   * la sous-chaîne survit à l'ajout d'un suffixe. C'est le piège que ce dépôt
   * documente depuis `CartPayButton` — le connaître ne suffit pas, il se
   * présente comme un test qui passe. */
  const montage = /<VendeurPremierPas[\s/>]/.exec(PAGE);
  assert.ok(montage, "le composant doit être monté, nom exact");
  const iGuide = montage.index;
  const iMetrique = PAGE.indexOf("{metriquePrincipale.value}");
  assert.ok(iMetrique > 0, "les métriques doivent être rendues");
  assert.ok(iGuide < iMetrique, "le guidage doit précéder les métriques");
});

test("l'étape rendue vient de la FONCTION, pas d'un ternaire recopié", () => {
  assert.match(
    PAGE,
    /const etape = etapeVendeur\(\{\s*\n\s*produits: products\.length,\s*\n\s*publies: published,\s*\n\s*ventes: totalSales,/,
    "la décision doit être alimentée par l'état réel du vendeur"
  );
  assert.match(PAGE, /besoinDeGuidage\(etape\)/);
});

test("le lien WhatsApp est construit à partir du message TRADUIT", () => {
  // La liaison : `labels.message` (donc `t()`) alimente l'URL. Un texte en
  // dur ici enverrait un vendeur kreyòl partager une phrase en français.
  assert.match(
    COMP,
    /wa\.me\/\?text=\$\{encodeURIComponent\(labels\.message\.replace\("\{lien\}", lienBoutique\)\)\}/
  );
});

test("le partage n'apparaît QUE quand une boutique existe vraiment", () => {
  /* Un bouton « partager ma boutique » sur une boutique vide enverrait le
   * vendeur promouvoir une page sans produit — pire que pas de bouton. */
  assert.match(COMP, /const partage = etape === "publie_sans_vente" && lienBoutique;/);
  /* L'URL n'est plus composée ici : `hrefBoutique` décide seul entre
     l'adresse lisible et l'ancienne. La condition, elle, n'a pas bougé. */
  assert.match(
    PAGE,
    /etape === "publie_sans_vente"\s*\n\s*\? `\$\{siteUrl\(\)\}\$\{hrefBoutique\(\{ id: user\.id, boutikSlug \}\)\}`\s*\n\s*: undefined/
  );
});

test("le bouton respecte la cible tactile de 44 px", () => {
  assert.match(COMP, /min-h-11/);
});

test("aucune chaîne visible en dur dans le composant", () => {
  // Tout arrive en props, résolu par `t()` côté serveur. C'est le premier
  // bloc de cette page à parler les quatre langues.
  const texteJsx = [...COMP.matchAll(/>([^<>{}]+)</g)].map((m) => m[1].trim()).filter(Boolean);
  assert.deepEqual(texteJsx, [], `texte en dur : ${texteJsx.join(" | ")}`);
});
