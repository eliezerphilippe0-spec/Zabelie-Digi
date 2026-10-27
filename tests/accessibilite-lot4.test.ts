import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadRoute } from "./helpers/route-harness";

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
 *   `disabled={busy !== null}` remis sur le champ                       → K4 rouge
 *   garde du clic rendue inatteignable (`if (false)`)                   → K4 rouge
 *   garde de `deposer` retirée (`busy !== null` ôté)                    → K4 rouge
 *   `aria-disabled` jamais posé (`aria-disabled={undefined}`)           → K4 rouge
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
  assert.match(KYC, /setPieces\(\(p\) => \[\.\.\.p, \{ id: data\.id, kind \}\]\);\s*setDepose\(`\$\{libelle\[kind\]\} — \$\{labels\.deposited\}`\);/);
  assert.match(KYC, /\{error && <p role="alert" className="[^"]*">\{error\}<\/p>\}/);
});

/*
 * K4 — LE FOCUS NE TOMBE PAS SUR `body` PENDANT L'ENVOI (relecture du
 * 2026-10-27, m4). Le champ se désactivait (`disabled`) dès l'envoi : le
 * navigateur retire alors le focus de l'élément désactivé, et l'utilisateur
 * au clavier repartait du haut de la page, succès comme échec.
 *
 * Éprouvé sur le COMPOSANT RÉEL, rendu avec un `useState` minimal et un
 * `fetch` dont on tient la réponse : on lit les props que React recevrait,
 * on déclenche les gestionnaires tels quels. Aucune regex ne peut dire
 * qu'un clic n'ouvre plus le sélecteur ; un `preventDefault` appelé, si.
 */
type El = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
function champsFichier(n: unknown, out: El[] = []): El[] {
  if (Array.isArray(n)) n.forEach((x) => champsFichier(x, out));
  else if (n && typeof n === "object" && "props" in n) {
    const el = n as El;
    if (el.type === "input" && el.props.type === "file") out.push(el);
    champsFichier(el.props.children, out);
  }
  return out;
}
function texteStatut(n: unknown): string | null {
  if (Array.isArray(n)) {
    for (const x of n) { const t = texteStatut(x); if (t !== null) return t; }
    return null;
  }
  if (!n || typeof n !== "object" || !("props" in n)) return null;
  const el = n as El;
  if (el.props.role === "status") return [el.props.children].flat().join("");
  return texteStatut(el.props.children);
}

function monterKyc() {
  const etats: unknown[] = [];
  let curseur = 0;
  const react = {
    useState(init: unknown) {
      const i = curseur++;
      if (!(i in etats)) etats[i] = init;
      return [etats[i], (v: unknown) => { etats[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(etats[i]) : v; }];
    },
  };
  const el = (type: unknown, props: El["props"]) => ({ type, props });
  const appels: unknown[] = [];
  let repondre: (r: unknown) => void = () => {};
  const fetch = (...args: unknown[]) => { appels.push(args); return new Promise((r) => { repondre = r; }); };
  const mod = loadRoute("components/kyc-form.tsx", { react, "react/jsx-runtime": { jsx: el, jsxs: el } }, {}, { fetch }) as unknown as {
    KycForm: (p: unknown) => unknown;
  };
  const labels = { title: "t", why: "w", pending: "p", approved: "a", rejected: "r", cin: "CIN", paspo: "Paspò",
    selfie: "Selfie", add: "Ajoute", sending: "Envoi…", error: "Erreur", deposited: "depoze" };
  const rendre = () => { curseur = 0; return mod.KycForm({ actorId: "acteur", statut: "pending", deposes: [], noteAdmin: null, labels }); };
  return { rendre, appels, repondre: (r: unknown) => repondre(r) };
}

test("K4 — pendant l'envoi le champ reste focalisable (aria-disabled), le clic n'ouvre rien, un second fichier est refusé", async () => {
  const k = monterKyc();
  const fichier = new File(["x"], "cin.png", { type: "image/png" });
  const avant = champsFichier(k.rendre());
  assert.equal(avant.length, 3, "trois champs de pièce");
  for (const c of avant) assert.equal(c.props["aria-disabled"], undefined, "un champ est marqué indisponible hors envoi");

  // Envoi de la CIN.
  (avant[0].props.onChange as (e: unknown) => void)({ target: { files: [fichier], value: "C:\\cin.png" } });
  assert.equal(k.appels.length, 1, "le dépôt n'est pas parti");
  const pendant = champsFichier(k.rendre());
  for (const c of pendant) {
    assert.ok(!c.props.disabled, "un champ est `disabled` pendant l'envoi : le focus tombe sur body");
    assert.equal(c.props["aria-disabled"], true, "pendant l'envoi, le champ doit s'annoncer indisponible");
  }
  assert.equal(texteStatut(k.rendre()), "Envoi…");
  // Un clic (souris, Entrée, Espace) sur un autre champ n'ouvre pas le sélecteur…
  let empeche = 0;
  (pendant[1].props.onClick as (e: unknown) => void)({ preventDefault: () => { empeche++; } });
  assert.equal(empeche, 1, "pendant l'envoi, le clic ouvre encore le sélecteur de fichier");
  // … et un fichier posé sans clic ne part pas.
  (pendant[1].props.onChange as (e: unknown) => void)({ target: { files: [fichier], value: "x" } });
  assert.equal(k.appels.length, 1, "un second envoi est parti pendant le premier");

  // Fin de l'envoi : tout redevient disponible, et le clic ouvre de nouveau.
  k.repondre({ ok: true, json: async () => ({ id: "piece-1" }) });
  await new Promise((r) => setTimeout(r, 0));
  const apres = champsFichier(k.rendre());
  for (const c of apres) assert.equal(c.props["aria-disabled"], undefined, "un champ reste indisponible après l'envoi");
  let apresEmpeche = 0;
  (apres[1].props.onClick as (e: unknown) => void)({ preventDefault: () => { apresEmpeche++; } });
  assert.equal(apresEmpeche, 0, "après l'envoi, le sélecteur ne s'ouvre plus");
  assert.equal(texteStatut(k.rendre()), "CIN — depoze");

  // Et sur un ÉCHEC : même retour, rien ne reste bloqué.
  (apres[1].props.onChange as (e: unknown) => void)({ target: { files: [fichier], value: "x" } });
  assert.equal(k.appels.length, 2, "le second dépôt, après le premier, doit partir");
  for (const c of champsFichier(k.rendre())) assert.ok(!c.props.disabled && c.props["aria-disabled"] === true);
  k.repondre({ ok: false, json: async () => ({ error: "refus" }) });
  await new Promise((r) => setTimeout(r, 0));
  for (const c of champsFichier(k.rendre())) assert.equal(c.props["aria-disabled"], undefined, "un champ reste indisponible après un échec");
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
 *   vignette : `aria-current={…}` remplacé par `aria-pressed={i === principale}` → S2 rouge
 *   vignette : `aria-current` décroché de `principale` (`i === 0 ? "true"`)    → S2 rouge
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

test("S2 — la vignette affichée est à l'encre, et annoncée comme l'élément COURANT (aria-current)", () => {
  /* Relecture du 2026-10-27 (m6) : `aria-pressed` sur des vignettes qui
   * s'excluent annonçait N bascules indépendantes (« bouton bascule, enfoncé »
   * sur chacune). Une seule vignette est affichée : c'est l'élément COURANT
   * d'un ensemble, `aria-current="true"`. */
  const src = code(lire("components/galerie-produit.tsx"));
  assert.doesNotMatch(src, /\baria-pressed=/, "les vignettes s'annoncent de nouveau comme des bascules indépendantes");
  const c = brancheActive(
    src,
    /aria-current=\{i === principale \? "true" : undefined\}\s*className=\{`[^`]*\$\{\s*i === principale \? "([^"]*)" : "[^"]*"\s*\}`\}/,
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

// ── Titre d'onglet de /mes-achats dans la langue servie ─────────────────────
/*
 * `export const metadata = { title: "Mes achats — Zabelie" }` : un acheteur
 * kreyòl lisait un onglet en français. Passé à `generateMetadata`, motif
 * `getLang()` du dépôt (/connexion, /aide). Le `noindex` suit dans le même
 * objet (garde `finitions-pages` F1, adaptée à la forme rendue).
 *
 * Mutations éprouvées :
 *   `t(lang, "purchases.title")` → `"Mes achats"`                        → M1 rouge
 *   `robots` retiré de l'objet rendu                                      → F1 (finitions-pages) rouge
 */

test("M1 — l'onglet de /mes-achats est titré dans la langue servie", () => {
  const src = code(lire("app/mes-achats/page.tsx"));
  assert.doesNotMatch(src, /export const metadata\b/, "un titre statique (donc fixe) est revenu");
  assert.match(
    src,
    /export async function generateMetadata\(\) \{\s*const lang = await getLang\(\);\s*return \{ title: `\$\{t\(lang, "purchases\.title"\)\} — Zabelie`, robots: \{ index: false, follow: false \} \};\s*\}/
  );
});
