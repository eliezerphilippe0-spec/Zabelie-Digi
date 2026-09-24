import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { t } from "../lib/i18n";

/**
 * « Videyo machann nan » (docs/66 §6.2) : la vidéo de la fiche est celle du
 * VENDEUR, jamais un avis client. Le libellé est attaché à la vidéo elle-même,
 * pas posé quelque part sur la page.
 */

const GALERIE = readFileSync("components/galerie-produit.tsx", "utf8");
const FICHE = readFileSync("app/produit/[slug]/page.tsx", "utf8");

test("le libellé est rendu SOUS la vidéo, dans la même figure", () => {
  assert.match(GALERIE, /<figure[^>]*>\s*<video[\s\S]{0,200}aria-label=\{videoLabel\}[\s\S]{0,200}\/>\s*<figcaption[^>]*>\{videoLabel\}<\/figcaption>\s*<\/figure>/);
  // Et sur la vignette ▶, pour les lecteurs d'écran.
  assert.match(GALERIE, /<span className="sr-only">\{videoLabel\}<\/span>/);
});

test("la fiche passe le libellé traduit, et il est obligatoire", () => {
  assert.match(FICHE, /video=\{medias\.find\(\(m\) => m\.kind === "video"\)\?\.url \?\? null\}\s*videoLabel=\{t\(lang, "product\.video\.seller"\)\}/);
  assert.match(GALERIE, /\n  videoLabel: string;/, "le libellé ne doit pas devenir optionnel");
});

test("le libellé dit « vendeur » dans chaque langue, jamais « avis » ni « client »", () => {
  assert.equal(t("ht", "product.video.seller"), "Videyo machann nan");
  for (const lang of ["ht", "fr", "en", "es"] as const) {
    const s = t(lang, "product.video.seller");
    assert.match(s, /(?<![\p{L}])(machann|vendeur|seller|vendedor)(?![\p{L}])/iu, lang);
    assert.doesNotMatch(s, /(?<![\p{L}])(avis|kliyan|client|review|cliente|reseña)(?![\p{L}])/iu, lang);
  }
});
