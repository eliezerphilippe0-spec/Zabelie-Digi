import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DICT } from "../lib/i18n";
import { lirePolice } from "./woff2-lecteur";
import { entreeActive } from "../lib/barre-navigation";

/**
 * PARCOURS — chantier design, Phase 4 (`docs/design/PHASE-4.md`, V-28).
 *
 * Chaque test porte sur ce qui COMMANDE le comportement (la condition, la
 * source, l'attribut), jamais sur un libellé seul : un libellé survit à un
 * garde rendu inatteignable (règle du dépôt).
 */

const lire = (p: string) => readFileSync(p, "utf8");
const FORM = lire("components/connexion-form.tsx");
const LANGUES = Object.keys(DICT) as Array<keyof typeof DICT>;

test("P4 — panier : un seul bouton orange, et la remise non renseignée dite une fois", () => {
  const panier = lire("app/panier/page.tsx");
  // La SOURCE de la condition : le nombre d'articles, pas un libellé.
  assert.match(panier, /const unSeulAchat = items\.length === 1;/);
  assert.match(panier, /className=\{`bouton \$\{unSeulAchat \? "bouton-primaire" : "bouton-secondaire"\} bouton-compact`\}>\{trustLabels\.checkPay\}/,
    "avant : un bouton orange par article");
  // Une fois par groupe, et seulement si une ligne n'a rien déclaré.
  assert.match(panier, /\{g\.escrow && g\.lignes\.some\(\(l\) => !commitments\?\.get\(l\.product_id\)\) && \(\s*<p className="[^"]*">\{trustLabels\.missing\}<\/p>/);
  // Par ligne : le bloc complet si la remise est déclarée, sinon le seul lien.
  assert.match(panier, /\{g\.escrow && \(commitments\?\.get\(l\.product_id\)\s*\? <div className="basis-full"><ProductCommitmentDetails[^]*?: <a href=\{`\/produit\/\$\{l\.product!\.slug\}#contacter-vendeur`\} className="bouton bouton-texte bouton-compact[^"]*">\{trustLabels\.ask\}<\/a>\)\}/);
});

test("P5 — fiche : un <main>, le prix sous le titre, la remise avant le bouton, la réassurance après", () => {
  const fiche = lire("app/produit/[slug]/page.tsx");
  const pos = (motif: string) => {
    const i = fiche.indexOf(motif);
    assert.ok(i >= 0, `introuvable : ${motif}`);
    return i;
  };
  // Le lien d'évitement de l'en-tête menait nulle part (audit A20, Lighthouse).
  assert.equal((fiche.match(/<main id="main">/g) ?? []).length, 1);
  assert.ok(pos('<main id="main">') < pos('<section className="mx-auto grid max-w-6xl') && pos("</main>") < pos("<SiteFooter />"));
  const titre = pos("<h1 className=\"mt-4\">");
  const prix = pos("<Prix montant={flash ? flash.prixFlashHtg : product.priceHTG} />");
  const description = pos("{product.blurb}</p>");
  const acheter = pos('id="acheter"');
  const remise = pos('aria-labelledby="remise-avant-achat"');
  const bouton = pos("<BuyButton");
  const confiance = pos('aria-labelledby="achat-confiance"');
  assert.ok(titre < prix && prix < description, "le prix vient juste sous le titre, avant la description");
  assert.ok(prix < acheter, "le prix n'attend plus la carte d'achat");
  assert.ok(acheter < remise && remise < bouton, "la remise se lit AVANT de payer");
  assert.ok(bouton < confiance, "la réassurance générale suit le bouton");
});

test("P1 — connexion : un titre qui dit où l'on est, avec son mot d'accent, dans les quatre langues", () => {
  // « Konekte » était titre, onglet et bouton à la fois (audit Phase 0).
  assert.match(FORM, /<TitreAccent texte=\{mode === "signin" \? labels\.titleSignin : labels\.titleSignup\} accent=\{labels\.titleAccent\} \/>/);
  const police = lirePolice(readFileSync("app/fonts/InstrumentSerifZabelie.woff2"));
  for (const lang of LANGUES) {
    const d = DICT[lang] as Record<string, string>;
    const mot = d["auth.title.accent"];
    for (const cle of ["auth.title.signin", "auth.title.signup"]) {
      assert.equal(d[cle].split(mot).length - 1, 1, `${lang} : « ${mot} » doit figurer une fois dans « ${d[cle]} »`);
      assert.notEqual(d[cle], d["auth.tab.signin"], `${lang} : le titre répète l'onglet`);
    }
    assert.deepEqual([...mot].filter((c) => !police.caracteres.has(c.codePointAt(0)!)), [], `${lang} : lettres absentes de la police d'accent`);
  }
});

test("P2 — connexion : le mot de passe s'affiche à la demande, et le bouton dit son état", () => {
  assert.match(FORM, /type=\{voirMdp \? "text" : "password"\}/, "la bascule commande le type du champ");
  assert.match(FORM, /onClick=\{\(\) => setVoirMdp\(\(v\) => !v\)\}\s*aria-pressed=\{voirMdp\}\s*aria-controls="auth-password"\s*aria-label=\{voirMdp \? labels\.hidePassword : labels\.showPassword\}/);
  assert.match(FORM, /className="champ pr-14"/, "le texte ne passe pas sous le bouton");
  for (const lang of LANGUES) {
    const d = DICT[lang] as Record<string, string>;
    assert.ok(d["auth.password.show"] && d["auth.password.hide"] && d["auth.password.show"] !== d["auth.password.hide"], `${lang} : libellés de la bascule`);
  }
});

test("P3 — connexion : focus sur le premier champ du mode affiché, oubli en lien texte, erreurs avec icône", () => {
  // Inscription : le nom vient en premier ; connexion : l'e-mail.
  assert.match(FORM, /id="auth-name"[\s\S]{0,200}?autoFocus\s/, "le nom porte le focus quand il est affiché");
  assert.match(FORM, /id="auth-email"[\s\S]{0,200}?autoFocus=\{mode === "signin"\}/);
  assert.match(FORM, /href="\/mot-de-passe-oublie"\s*className="bouton bouton-texte bouton-compact"/);
  assert.match(FORM, /\{msg && \(msg === labels\.signupSuccess \|\| msg === labels\.demoMode\s*\? <p role="status"[^>]*>\{msg\}<\/p>\s*: <MessageErreur className="mt-4">\{msg\}<\/MessageErreur>\)\}/,
    "une erreur passe par MessageErreur ; seuls le succès et le mode démonstration restent une information");
});

test("P6 — barre inférieure : quatre entrées sous le pouce, mobile seulement, et rien ne passe dessous", () => {
  const barre = lire("components/barre-navigation.tsx");
  const nav = lire("components/site-nav.tsx");
  const css = lire("app/marketplace-header.css");
  // Mobile seulement : au-delà de md, l'en-tête porte tout.
  assert.match(barre, /<nav ref=\{ref\} aria-label=\{libelles\.nav\} className="barre-nav md:hidden">/);
  // Quatre entrées : accueil, rayons, panier, puis le menu du compte.
  const liens = [...barre.matchAll(/<Link\s+href="([^"]+)"\s+aria-current=\{actif\("([^"]+)"\) \? "page" : undefined\}/g)];
  assert.deepEqual(liens.map((m) => m[1]), ["/", "/categories", "/panier"]);
  for (const m of liens) assert.equal(m[1], m[2], `aria-current de ${m[1]} lit l'état d'une autre entrée`);
  assert.match(barre, /const actif = \(href: string\) => entreeActive\(chemin, href\);/);
  assert.match(barre, /const chemin = usePathname\(\) \?\? "\/";/);
  assert.match(barre, /<li>\{compte\}<\/li>\s*<\/ul>/);
  // Le compteur ne s'affiche qu'avec un contenu, comme celui de l'en-tête.
  assert.match(barre, /const panier = articlesPanier !== null && articlesPanier > 0 \? articlesPanier : null;/);
  // Le panier et le compte quittent l'en-tête sous md : pas deux fois à l'écran.
  assert.match(nav, /href="\/panier"[\s\S]{0,200}?className="relative hidden [^"]*\bmd:inline-flex"/);
  assert.match(nav, /<AccountMenu label=\{t\(lang, "nav\.account"\)\} className="hidden md:block">/);
  assert.match(nav, /<BarreNavigation\s+libelles=\{\{\s*nav: t\(lang, "a11y\.nav\.bottom"\),/);
  // Le CSS : fixe en bas, zone sûre de l'appareil, cibles de 56 px.
  const regle = (sel: string) => {
    const m = css.match(new RegExp(`(?:^|\n)${sel.replace(/[.[\]()"=]/g, "\$&")} \{([^}]*)\}`));
    assert.ok(m, `règle ${sel} introuvable`);
    return m[1];
  };
  const bloc = regle(".barre-nav");
  assert.match(bloc, /position: fixed;/);
  assert.match(bloc, /bottom: 0;/);
  assert.match(bloc, /padding-bottom: env\(safe-area-inset-bottom, 0px\);/);
  // Hors couche : un `display` ici l'emporterait sur `md:hidden`.
  assert.doesNotMatch(bloc, /\bdisplay\s*:/, "la barre s'afficherait aussi sur ordinateur");
  assert.match(regle(".barre-nav-lien"), /min-height: --spacing\(14\);/, "56 px : au-dessus des 48 px du brief");
  // L'état actif ne prend pas l'orange (réservé à l'action principale).
  const actif = css.slice(css.indexOf('.barre-nav-lien[aria-current="page"]'), css.indexOf(".barre-nav-compteur"));
  assert.ok(actif.length > 0, "état actif introuvable");
  assert.doesNotMatch(actif, /accent/);
  // La page gagne la hauteur de la barre, sous md seulement.
  assert.match(css, /@media \(width < 48rem\) \{\s*body:has\(\.barre-nav\) \{\s*--barre-nav-h: calc\(--spacing\(14\) \+ 1px \+ env\(safe-area-inset-bottom, 0px\)\);\s*padding-bottom: var\(--barre-nav-h\);/);
  // L'accueil ne s'allume que sur « / » ; les autres couvrent leurs sous-pages.
  assert.equal(entreeActive("/", "/"), true);
  assert.equal(entreeActive("/catalogue", "/"), false, "l'accueil serait allumé partout");
  assert.equal(entreeActive("/categories", "/categories"), true);
  assert.equal(entreeActive("/categories/mode", "/categories"), true);
  assert.equal(entreeActive("/panier-partage", "/panier"), false, "un préfixe de mot n'est pas une sous-page");
  for (const lang of LANGUES) {
    const d = DICT[lang] as Record<string, string>;
    assert.ok(d["a11y.nav.bottom"], `${lang} : nom accessible de la barre`);
  }
});
