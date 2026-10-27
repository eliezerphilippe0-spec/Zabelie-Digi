import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encode } from "uqr";
import { qrBoutique, QR_OPTIONS, QR_ENCRE, QR_FOND } from "../lib/boutique-qr";
import { DICT, LANGS } from "../lib/i18n";

/**
 * LE QR DE LA VITRINE (docs/75 §5.A, PR-Z1 ; V-24 A3). Ce qui est gardé : le
 * QR porte EXACTEMENT l'adresse affichée (`hrefBoutique`), jamais une adresse
 * reçue ; un slug absent ou invalide retombe sur /createur/<id> au lieu d'un QR
 * vide ou cassé ; la zone de silence de la norme est respectée ; les pages ont
 * la garde vendeur ; la bibliothèque reste épinglée à la version auditée.
 */

const ID = "0f8b5c2e-3a4d-4e1f-9a7b-2c6d8e0f1a2b";
const lire = (f: string) => readFileSync(f, "utf8");

function avecSite<T>(base: string, run: () => T): T {
  const avant = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = base;
  try { return run(); } finally {
    if (avant === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = avant;
  }
}
const modulesDuSvg = (svg: string) =>
  new Set([...svg.matchAll(/M(\d+),(\d+)h1v1h-1z/g)].map(([, x, y]) => `${x},${y}`));
function modulesAttendus(url: string) {
  const r = encode(url, QR_OPTIONS);
  const s = new Set<string>();
  r.data.forEach((ligne, y) => ligne.forEach((sombre, x) => { if (sombre) s.add(`${x},${y}`); }));
  return { modules: s, taille: r.size };
}

test("Q1 — le QR encode exactement l'adresse de la boutique, et rien d'autre", () => {
  const qr = avecSite("https://zabelie.com", () => qrBoutique({ id: ID, boutikSlug: "mari-jakmel" }));
  assert.equal(qr.url, "https://zabelie.com/boutik/mari-jakmel");
  const lus = modulesDuSvg(qr.svg);
  assert.ok(lus.size > 100, `modules lus : ${lus.size}`);
  assert.deepEqual(lus, modulesAttendus("https://zabelie.com/boutik/mari-jakmel").modules);
  assert.notDeepEqual(lus, modulesAttendus("https://zabelie.com/boutik/mari-jakmeL").modules);
  assert.equal(qr.fichier, "zabelie-mari-jakmel-qr.svg");
  assert.equal(decodeURIComponent(qr.dataUrl.replace("data:image/svg+xml;charset=utf-8,", "")), qr.svg);
});

test("Q2 — sans slug valide, le QR mène à /createur/<id>, jamais à une adresse cassée", () => {
  for (const boutikSlug of [null, "", "Mari Jakmel!", "../admin"]) {
    const qr = avecSite("https://zabelie.com", () => qrBoutique({ id: ID, boutikSlug }));
    assert.equal(qr.url, `https://zabelie.com/createur/${ID}`, `slug ${JSON.stringify(boutikSlug)}`);
    assert.deepEqual(modulesDuSvg(qr.svg), modulesAttendus(qr.url).modules);
    assert.equal(qr.fichier, `zabelie-${ID}-qr.svg`);
  }
});

test("Q3 — noir sur blanc, zone de silence de 4 modules, correction M", () => {
  const qr = avecSite("https://zabelie.com", () => qrBoutique({ id: ID, boutikSlug: "mari-jakmel" }));
  assert.equal(QR_OPTIONS.border, 4);
  assert.equal(QR_OPTIONS.ecc, "M");
  assert.ok(qr.svg.includes(`fill="${QR_FOND}"`) && qr.svg.includes(`fill="${QR_ENCRE}"`));
  const { taille } = modulesAttendus(qr.url);
  assert.ok(qr.svg.includes(`viewBox="0 0 ${taille} ${taille}"`));
  for (const cle of modulesDuSvg(qr.svg)) {
    const [x, y] = cle.split(",").map(Number);
    assert.ok(x >= 4 && y >= 4 && x < taille - 4 && y < taille - 4, `module sombre dans la marge : ${cle}`);
  }
});

test("Q4 — la page boutique affiche le QR construit par le module, la page affiche a la garde vendeur", () => {
  const boutique = lire("app/tableau-de-bord/boutique/page.tsx");
  assert.match(boutique, /const qr = qrBoutique\(\{ id: user\.id, boutikSlug \}\)/);
  assert.match(boutique, /id="qr"/);
  assert.match(boutique, /download=\{qr\.fichier\}/);
  assert.match(boutique, /href="\/tableau-de-bord\/boutique\/affiche"/);

  const affiche = lire("app/tableau-de-bord/boutique/affiche/page.tsx");
  assert.match(affiche, /await vendeurOuRedirection\("\/tableau-de-bord\/boutique\/affiche"\)/);
  assert.match(affiche, /robots: \{ index: false, follow: false \}/);
  assert.match(affiche, /qrBoutique\(\{ id: user\.id,/);
  assert.match(affiche, /<BoutonImprimer label=\{t\(lang, "vendeur\.affiche\.imprimer"\)\} \/>/);

  // Personne d'autre ne fabrique un QR à partir d'une adresse libre.
  for (const f of ["app/tableau-de-bord/boutique/page.tsx", "app/tableau-de-bord/boutique/affiche/page.tsx", "components/bouton-imprimer.tsx"]) {
    assert.equal(/from "uqr"|renderSVG\(/.test(lire(f)), false, `${f} contourne lib/boutique-qr.ts`);
  }
});

test("Q5 — uqr reste épinglé à la version auditée (docs/75, V-24 A3)", () => {
  const pkg = JSON.parse(lire("package.json"));
  assert.equal(pkg.dependencies.uqr, "0.1.3", "version exacte, sans ^ ni ~");
  const lock = JSON.parse(lire("package-lock.json"));
  assert.equal(lock.packages["node_modules/uqr"].integrity,
    "sha512-0rjE8iEJe4YmT9TOhwsZtqCMRLc5DXZUI2UEYUUg63ikBkqqE5EYWaI0etFe/5KUcmcYwLih2RND1kq+hrUJXA==");
});

test("Q6 — textes du QR et de l'affiche dans les quatre langues, kreyòl compris", () => {
  const cles = ["vendeur.qr.titre", "vendeur.qr.aide", "vendeur.qr.alt", "vendeur.qr.telecharger", "vendeur.qr.affiche",
    "vendeur.affiche.titre", "vendeur.affiche.imprimer", "vendeur.affiche.retour"] as const;
  for (const lang of LANGS) for (const k of cles) assert.ok(DICT[lang][k]?.trim(), `${lang} ${k}`);
  for (const k of cles) assert.notEqual(DICT.ht[k], DICT.fr[k], `${k} : le kreyòl recopie le français`);
  for (const lang of LANGS) assert.ok(DICT[lang]["vendeur.qr.alt"].includes("{url}"), `${lang} : alt sans l'adresse`);
});
