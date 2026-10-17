import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { LANGS, t } from "../lib/i18n";
import { IMAGE_PARTAGE, META_PAGES, metaPage } from "../lib/meta-page";
import { PROFILS_SOCIAUX } from "../lib/brand";
import { llmsTxt } from "../lib/llms";

/**
 * SEO ET GEO — CORRECTIFS DU 2026-10-16 (points 3 à 5 du relevé du 14 octobre).
 *
 *  P1  chaque page à adresse par langue annonce titre et description DANS LA
 *      LANGUE SERVIE, avec un aperçu de partage complet (image comprise) ;
 *  P2  le kreyòl est traduit, pas recopié du français ;
 *  P3  toute page qui déclare son propre `openGraph` redonne l'image : Next.js
 *      remplace celui de la racine, image comprise ;
 *  P4  la fiche d'identité de l'accueil dit ce qu'est Zabelie, où et en
 *      quelles langues, et `sameAs` ne vient que des profils donnés par le
 *      porteur ;
 *  P5  `llms.txt` répond aussi en kreyòl et en français, avant « Optional ».
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");

test("P1 — titre, description et partage dans la langue servie", () => {
  for (const page of Object.keys(META_PAGES) as Array<keyof typeof META_PAGES>) {
    for (const lang of LANGS) {
      const m = metaPage("/vendre", lang, page);
      const [cleTitre, cleDescription] = META_PAGES[page];
      assert.equal(m.title, t(lang, cleTitre));
      assert.equal(m.description, t(lang, cleDescription));
      const og = m.openGraph as { title: string; description: string; images: Array<{ url: string }>; locale: string };
      assert.equal(og.title, m.title, `${page}/${lang} : og:title différent du titre`);
      assert.equal(og.description, m.description);
      assert.deepEqual(og.images.map((i) => i.url), [IMAGE_PARTAGE.url], `${page}/${lang} : aperçu sans image`);
      assert.match(og.locale, new RegExp(`^${lang}_`));
    }
  }
  assert.ok(lire("app/opengraph-image.tsx").includes("export const alt = OG_IMAGE_ALT;"), "le texte de l'image doit venir de la même source");
});

test("P2 — le kreyòl est traduit, pas recopié du français", () => {
  for (const [page, [cleTitre, cleDescription]] of Object.entries(META_PAGES)) {
    assert.notEqual(t("ht", cleDescription), t("fr", cleDescription), `${page} : description kreyòl identique au français`);
    if (page !== "developpeurs") assert.notEqual(t("ht", cleTitre), t("fr", cleTitre), `${page} : titre kreyòl identique au français`);
  }
});

function pages(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(join(RACINE, dir))) {
    const p = `${dir}/${e}`;
    if (statSync(join(RACINE, p)).isDirectory()) pages(p, acc);
    else if (e === "page.tsx") acc.push(p);
  }
  return acc;
}

test("P3 — toute page qui déclare son openGraph redonne l'image", () => {
  // Une image propre au dossier (`opengraph-image.tsx`, ex. la fiche produit)
  // est ajoutée par Next.js lui-même : la page n'a pas à la redonner.
  const fautives = pages("app").filter((f) => {
    if (existsSync(join(RACINE, dirname(f), "opengraph-image.tsx"))) return false;
    const src = lire(f);
    return /openGraph:\s*\{/.test(src) && !/openGraph:\s*\{[\s\S]{0,600}images:/.test(src);
  });
  assert.deepEqual(fautives, [], `aperçu sans image : ${fautives.join(", ")}`);
  for (const f of ["app/catalogue/page.tsx", "app/categories/page.tsx", "app/aide/page.tsx", "app/a-propos/page.tsx", "app/recharges/page.tsx", "app/ouvrir-ma-boutique/page.tsx", "app/guides/[lang]/page.tsx", "app/guides/[lang]/[slug]/page.tsx"]) {
    assert.match(lire(f), /\.\.\.partage\(lang, /, `${f} : pas d'aperçu de partage`);
  }
});

test("P4 — la fiche d'identité de l'accueil", () => {
  const src = lire("app/page.tsx");
  assert.match(src, /"@type": "Organization",[\s\S]{0,400}description: t\(lang, "meta\.accueil\.description"\),/);
  assert.match(src, /areaServed: \{ "@type": "Country", name: "Haiti" \},/);
  assert.match(src, /knowsLanguage: \[\.\.\.LANGS\],/);
  assert.match(src, /contactPoint: \{ "@type": "ContactPoint", contactType: "customer support", email: IDENTITE\.email/);
  assert.match(src, /\.\.\.\(PROFILS_SOCIAUX\.length \? \{ sameAs: \[\.\.\.PROFILS_SOCIAUX\] \} : \{\}\),/);
  assert.doesNotMatch(src, /sameAs: \["http/, "une adresse de profil écrite en dur, hors de lib/brand.ts");
  for (const url of PROFILS_SOCIAUX) assert.match(url, /^https:\/\/\S+$/, `profil invalide : ${url}`);
});

test("P5 — llms.txt répond aussi en kreyòl et en français", () => {
  const texte = llmsTxt("https://exemple.test");
  const ht = texte.indexOf("## An kreyòl");
  const fr = texte.indexOf("## En français");
  const optionnel = texte.indexOf("## Optional");
  assert.ok(ht > 0 && fr > ht && optionnel > fr, "sections kreyòl et française absentes, ou après « Optional »");
  assert.ok(texte.slice(ht, fr).includes(t("ht", "meta.accueil.description")));
  assert.ok(texte.slice(ht, fr).includes("https://exemple.test/ht/ouvrir-ma-boutique"));
  assert.ok(texte.slice(fr, optionnel).includes(t("fr", "meta.accueil.description")));
});
