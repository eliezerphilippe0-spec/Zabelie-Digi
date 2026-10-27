import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * AUDIT DU 2026-10-27, LOT 4 — accessibilité des formulaires, états
 * sélectionnés et cibles tactiles. Constats mesurés au rendu (Chromium,
 * 360/768/1280 px) au commit acc72c9.
 *
 * Chaque garde porte sur ce qui COMMANDE (l'attribut, la classe dans
 * l'élément qui la reçoit, la condition) et a été éprouvée par une mutation
 * connue-négative, notée au-dessus d'elle.
 */

const lire = (f: string) => readFileSync(f, "utf8");

/** Commentaires retirés : les gardes ne doivent pas se satisfaire de la prose. */
function code(src: string): string {
  return src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/** Les éléments `<balise …>` entiers (jusqu'à la fin de la balise ouvrante). */
function balises(src: string, nom: string): string[] {
  return [...src.matchAll(new RegExp(`<${nom}\\b(?:[^>"'{}]|"[^"]*"|\\{[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\})*>`, "g"))].map((m) => m[0]);
}

const classes = (el: string): string[] => (el.match(/className="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);

// ── M8 — les pièces d'identité se déposent au clavier ──────────────────────
/*
 * MESURÉ : trois `<input type="file" className="hidden">` sur
 * /tableau-de-bord/compte — `display: none`, donc hors de l'ordre de
 * tabulation, dans un libellé de ~30 px. Le retrait d'argent attend ce
 * dossier : un vendeur au clavier ou au lecteur d'écran ne pouvait pas être payé.
 *
 * Mutations éprouvées :
 *   `className="sr-only"` → `className="hidden"`                        → K1 rouge
 *   `min-h-11` retiré du libellé                                        → K2 rouge
 *   `{busy ? labels.sending` → `{false ? labels.sending`               → K3 rouge
 *   `role="alert"` retiré de l'erreur                                   → K3 rouge
 */

const KYC = code(lire("components/kyc-form.tsx"));

test("K1 — les trois champs de pièce sont joignables au clavier (sr-only, jamais hidden)", () => {
  const champs = balises(KYC, "input").filter((i) => /\btype="file"/.test(i));
  assert.equal(champs.length, 1, "un seul <input type=file>, rendu pour chaque pièce par la boucle");
  assert.match(KYC, /\(\["cin", "paspo", "selfie"\] as KycType\[\]\)\.map\(\(k\) => \(/, "la boucle des trois pièces a changé");
  assert.deepEqual(classes(champs[0]), ["sr-only"], `champ fichier : « ${classes(champs[0]).join(" ")} »`);
});

test("K2 — le libellé qui porte le champ fait 44 px et dessine l'anneau de focus", () => {
  const m = KYC.match(/<label\b[^>]*className="([^"]*)"[^>]*>(?:(?!<\/label>)[\s\S])*?<input\s+type="file"/);
  assert.ok(m, "le champ fichier n'est plus DANS son libellé");
  const c = m[1].split(/\s+/);
  for (const attendu of ["min-h-11", "inline-flex", "items-center", "has-[:focus-visible]:outline", "has-[:focus-visible]:outline-2", "has-[:focus-visible]:outline-accent"]) {
    assert.ok(c.includes(attendu), `libellé KYC sans « ${attendu} » : « ${m[1]} »`);
  }
});

test("K3 — l'envoi est annoncé (role=status, présente avant l'envoi) et l'échec aussi (role=alert)", () => {
  // La région existe TOUJOURS dans la rangée, et c'est `busy` qui la remplit.
  assert.match(KYC, /<p role="status" className="sr-only">\s*\{busy \? labels\.sending : \(depose \?\? ""\)\}\s*<\/p>/);
  // Le texte du succès vient de l'envoi réussi, pas d'ailleurs.
  assert.match(KYC, /setPieces\(\(p\) => \[\.\.\.p, \{ id: data\.id, kind \}\]\);\s*setDepose\(`\$\{libelle\[kind\]\} : \$\{labels\.deposited\}`\);/);
  assert.match(KYC, /\{error && <p role="alert" className="[^"]*">\{error\}<\/p>\}/);
});

// ── m2 — l'échec de paiement est annoncé ───────────────────────────────────
/*
 * `cart-pay-all.tsx` annonçait son erreur (`role="alert"`), `buy-button.tsx`
 * — le même chemin, depuis la fiche — non : un acheteur au lecteur d'écran
 * appuyait sur « Payer » et n'entendait rien.
 *
 * Mutation éprouvée : `role="alert"` retiré de l'erreur                → P1 rouge
 */

const BOUTON = code(lire("components/buy-button.tsx"));

test("P1 — l'erreur de paiement de la fiche est annoncée, comme celle du panier", () => {
  // L'élément rendu PAR la condition `error &&`, pas un rôle ailleurs dans le fichier.
  assert.match(BOUTON, /\{error && <p role="alert" className="[^"]*">\{error\}<\/p>\}/);
  assert.match(code(lire("components/cart-pay-all.tsx")), /\{msg && <p role="alert" /, "le panier a perdu le motif de référence");
});

// ── m3 — l'anneau de focus global n'est plus éteint ─────────────────────────
/*
 * `app/globals.css` dessine, en couche base, un anneau `:focus-visible` de
 * 2 px d'accent décollé de 2 px (garde `ux-lot-a` UA3). `outline-none`, en
 * couche utilitaire, l'écrasait sur le champ de recherche de l'en-tête, les
 * deux champs du numéro à recharger, le champ de code promo et les champs du
 * profil : il ne restait qu'une bordure de 1 px. Retiré : ces champs
 * reçoivent l'anneau commun, sans rien réinventer.
 *
 * Mutation éprouvée : `outline-none` remis sur le champ du profil       → F2 rouge
 */

/** Prédicat SANS `g` : un utilitaire qui éteint l'anneau, variante comprise. */
const ETEINT = /(?<![\w-])(?:[\w-]+:)*outline-(?:none|hidden)(?![\w-])/;

test("F1 — l'instrument voit l'anneau éteint, et laisse passer l'anneau dessiné", () => {
  for (const faute of ["text-base outline-none focus:border-accent", "focus:border-brand/60 focus:outline-none", "outline-hidden"]) {
    assert.ok(ETEINT.test(faute), `non vu : « ${faute} »`);
  }
  for (const sain of ["has-[:focus-visible]:outline", "focus-visible:outline-2 outline-accent", "outline-offset-2"]) {
    assert.ok(!ETEINT.test(sain), `faux positif : « ${sain} »`);
  }
});

test("F2 — recherche, recharge, code promo et profil gardent l'anneau de focus global", () => {
  const TEMOINS: Array<[string, RegExp]> = [
    ["components/search-box.tsx", /name="q"/],
    ["components/buy-button.tsx", /value=\{numeroBis\}/],
    ["components/profile-form.tsx", /const input =\s*"[^"]*\bfocus:border-accent\b/],
  ];
  for (const [f, temoin] of TEMOINS) {
    const src = code(lire(f));
    assert.match(src, temoin, `${f} : le champ témoin a disparu — le contrôle regarderait le vide`);
    assert.ok(!ETEINT.test(src), `${f} : un utilitaire éteint de nouveau l'anneau de focus global`);
  }
});

// ── m4 — l'orange est aux CTA et aux prix, le « sélectionné » est l'encre ───
/*
 * Brief §3.1 : « UN accent orange réservé aux CTA et aux prix ». Trois états
 * SÉLECTIONNÉS l'empruntaient (onglet actif de /mes-achats, vignette active
 * de la galerie, variante choisie) quand le dépôt a déjà son motif — l'encre,
 * `bg-cloud text-ink` (catalogue, navigation vendeur). Et le prix de la fiche,
 * lui, était en encre quand la carte produit le met en orange.
 *
 * Chaque garde lit la classe DANS la branche commandée par la même condition
 * que l'attribut ARIA de l'état : l'état annoncé et l'état peint ne peuvent
 * plus diverger sans rougir.
 *
 * Mutations éprouvées :
 *   onglet actif remis en `border-brand bg-brand text-on-brand`            → S1 rouge
 *   vignette : condition `i === principale` → `i === 0` dans la classe     → S2 rouge
 *   variante active remise en `border-brand bg-brand/10 text-cloud`        → S3 rouge
 *   prix de la fiche remis en `text-cloud`                                 → S4 rouge
 */

function brancheActive(src: string, re: RegExp, quoi: string): string[] {
  const m = src.match(re);
  assert.ok(m, `${quoi} : la condition qui commande l'état et sa classe sont introuvables (ou ne sont plus la même)`);
  return m[1].split(/\s+/);
}
const encre = (c: string[], quoi: string) => {
  assert.ok(!c.some((x) => /brand/.test(x)), `${quoi} : l'orange est revenu sur un état sélectionné (« ${c.join(" ")} »)`);
};

test("S1 — l'onglet actif de /mes-achats est à l'encre, commandé par aria-current", () => {
  const src = code(lire("app/mes-achats/page.tsx"));
  const c = brancheActive(
    src,
    /aria-current=\{v === view \? "page" : undefined\}\s*className=\{`[^`]*\$\{v === view \? "([^"]*)" : "[^"]*"\}`\}/,
    "onglet de /mes-achats"
  );
  assert.ok(c.includes("bg-cloud") && c.includes("text-ink"), `onglet actif : « ${c.join(" ")} »`);
  encre(c, "onglet de /mes-achats");
});

test("S2 — la vignette active de la galerie est à l'encre, et son état est annoncé (aria-pressed)", () => {
  const src = code(lire("components/galerie-produit.tsx"));
  const c = brancheActive(
    src,
    /aria-pressed=\{i === principale\}\s*className=\{`[^`]*\$\{\s*i === principale \? "([^"]*)" : "[^"]*"\s*\}`\}/,
    "vignette de la galerie"
  );
  assert.ok(c.includes("border-cloud"), `vignette active : « ${c.join(" ")} »`);
  encre(c, "vignette de la galerie");
});

test("S3 — la variante choisie est à l'encre, commandée par le même `active` que aria-pressed", () => {
  const src = code(lire("components/buy-button.tsx"));
  assert.match(src, /const active = v\.id === variantId;/);
  const c = brancheActive(
    src,
    /aria-pressed=\{active\}[\s\S]{0,200}?className=\{`[^`]*\$\{\s*active\s*\? "([^"]*)"\s*: "[^"]*"\s*\}/,
    "variante"
  );
  assert.ok(c.includes("bg-cloud") && c.includes("text-ink"), `variante active : « ${c.join(" ")} »`);
  encre(c, "variante");
});

test("S4 — le prix de la fiche est en orange de texte, comme sur la carte produit", () => {
  const src = code(lire("app/produit/[slug]/page.tsx"));
  // L'élément qui REND le prix affiché et débité, pas une classe ailleurs.
  const m = src.match(/<p className="([^"]*)">(?:(?!<\/p>)[\s\S])*?\{formatHTG\(flash \? flash\.prixFlashHtg : product\.priceHTG\)\}/);
  assert.ok(m, "le paragraphe du prix est introuvable");
  const c = m[1].split(/\s+/);
  assert.ok(c.includes("text-accent") && !c.includes("text-cloud"), `prix de la fiche : « ${m[1]} »`);
  assert.match(code(lire("components/product-card.tsx")), /numeric font-bold text-accent/, "la carte produit, référence du prix, a changé");
});

// ── M10 — cibles tactiles de 44 px ──────────────────────────────────────────
/*
 * MESURÉ à 360 px (sauf mention) : « Tout voir » de l'accueil 59 × 20 px ;
 * questions de /aide 24 px ; « Enregistrer » du profil 42 px ; variantes,
 * champ et bouton du code promo sous 44 px ; à 768 et 1 280 px, liens du pied
 * à 28 px et titres de rubrique du pied à 20 px.
 *
 * Même convention que `tests/cibles-tactiles` : `min-h-11` dans le
 * `className` DE L'ÉLÉMENT qui reçoit le geste. Et quand la cible grandit
 * sans que la page doive bouger, la compensation (`-my-*`) est gardée AVEC
 * elle : l'une sans l'autre est soit une petite cible, soit une page qui saute.
 *
 * Mutations éprouvées :
 *   « Tout voir » sans `min-h-11`                                     → C1 rouge
 *   FAQ : `-my-2.5` retiré (la carte grandirait de 20 px)            → C2 rouge
 *   pied : `md:min-h-7` remis sur les liens                          → C3 rouge
 *   profil : `min-h-11` retiré de « Enregistrer »                    → C4 rouge
 *   achat : `min-h-11` retiré du bouton « Appliquer »                → C5 rouge
 */

const T44 = "min-h-11";
/** Une hauteur minimale REPRISE à une largeur donnée (`md:min-h-7`, `lg:min-h-0`). */
const REPRISE = /^(?:[\w-]+:)+min-h-/;

test("C1 — « Tout voir » des rangées de l'accueil : 44 × 44 px au moins, la rangée garde sa hauteur", () => {
  const src = code(lire("app/page.tsx"));
  const m = src.match(/<Link href=\{href\} className="([^"]*)">\s*\{more\}\s*<\/Link>/);
  assert.ok(m, "le lien « Tout voir » de HomeRow est introuvable");
  const c = m[1].split(/\s+/);
  for (const a of [T44, "min-w-11", "inline-flex", "items-center", "-my-3"]) assert.ok(c.includes(a), `« Tout voir » sans « ${a} » : « ${m[1]} »`);
});

test("C2 — les questions de la FAQ (/aide) : 44 px, compensés pour que la carte ne bouge pas", () => {
  const src = code(lire("components/faq-list.tsx"));
  const sommaires = balises(src, "summary");
  assert.equal(sommaires.length, 1, "un <summary> par question, rendu par la boucle");
  const c = classes(sommaires[0]);
  assert.ok(c.includes(T44), `question sans ${T44} : « ${c.join(" ")} »`);
  // La paire : autant de rembourrage ajouté que de marge rendue.
  const py = c.find((x) => /^py-/.test(x));
  assert.ok(py && c.includes(`-my-${py.slice(3)}`), `rembourrage et compensation désaccordés : « ${c.join(" ")} »`);
});

test("C3 — pied de page : liens à 44 px à toutes les largeurs, titres de rubrique aussi", () => {
  const pied = code(lire("components/site-footer.tsx"));
  const lien = pied.match(/const LIEN =\s*"([^"]*)";/);
  assert.ok(lien, "la classe commune des liens du pied est introuvable");
  const c = lien[1].split(/\s+/);
  assert.ok(c.includes(T44), `liens du pied sans ${T44}`);
  assert.deepEqual(c.filter((x) => REPRISE.test(x)), [], "une largeur reprend la hauteur des liens du pied");
  // Chaque lien des rubriques emploie bien cette classe.
  const liens = [...pied.matchAll(/<Link href=[^>]*className=\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(liens.length >= 15, `témoin : ${liens.length} liens lus`);
  for (const l of liens) assert.match(l, /^`?\$?\{?LIEN\b|^LIEN$/, `lien du pied hors de la classe commune : ${l}`);
  const rubrique = code(lire("components/footer-section.tsx"));
  const s = balises(rubrique, "summary");
  assert.equal(s.length, 1);
  const cs = classes(s[0]);
  assert.ok(cs.includes(T44), "titre de rubrique sans min-h-11");
  assert.deepEqual(cs.filter((x) => REPRISE.test(x)), [], "une largeur reprend la hauteur du titre de rubrique");
  assert.ok(cs.includes("md:-my-3"), "sans compensation, le titre de rubrique pousse les colonnes de 24 px sur ordinateur");
});

test("C4 — profil : chaque bouton fait 44 px", () => {
  const boutons = balises(code(lire("components/profile-form.tsx")), "button");
  assert.equal(boutons.length, 2, "« Enregistrer » et la demande de katye");
  for (const b of boutons) assert.ok(classes(b).includes(T44), `bouton du profil sans ${T44} : « ${classes(b).join(" ")} »`);
});

test("C5 — achat : variantes, code promo, « Appliquer » et autres moyens de paiement à 44 px", () => {
  const src = code(lire("components/buy-button.tsx"));
  const cibles: Array<[string, RegExp]> = [
    ["variante", /aria-pressed=\{active\}[\s\S]{0,200}?className=\{`([^`$]*)/],
    ["champ du code promo", /<input\s+value=\{code\}(?:(?!<input|\/>)[\s\S]){0,600}className="([^"]*)"/],
    ["« Appliquer »", /onClick=\{applyCoupon\}(?:(?!<button|<\/button>)[\s\S]){0,200}className="([^"]*)"/],
    ["autre moyen de paiement", /onClick=\{\(\) => handleBuy\(o\)\}(?:(?!<button|<\/button>)[\s\S]){0,200}className="([^"]*)"/],
  ];
  for (const [quoi, re] of cibles) {
    const m = src.match(re);
    assert.ok(m, `${quoi} : élément introuvable`);
    assert.ok(m[1].split(/\s+/).includes(T44), `${quoi} sans ${T44} : « ${m[1]} »`);
  }
});
