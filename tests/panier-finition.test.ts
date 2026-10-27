import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { loadRoute, database } from "./helpers/route-harness";
import { DICT, LANGS, t } from "../lib/i18n";
import { formatHTG } from "../lib/sample-data";
import { isDownloadable, isProductKind } from "../lib/product-kind";
import { marketplaceCopy } from "../lib/marketplace-copy";
import { hrefBoutique } from "../lib/boutique-href";

/**
 * FINITION DU PANIER — audit du 2026-10-27 (M9 côté client, m11, prix,
 * squelette, titre d'onglet).
 *
 * Ces gardes EXÉCUTENT les composants (doublures de React et des E/S, motif de
 * `tests/buy-button-recovery.test.ts`) plutôt que de lire leur texte : un
 * verrou absent et un verrou rendu inatteignable laissent le même texte dans
 * le fichier, seul un double clic les distingue.
 *
 * Mutations éprouvées (chacune passée, chacune ROUGE, puis restaurée) :
 *   PF1  `if (verrou.current) return;` → `if (false) return;`  (PF1, PF6)
 *   PF2  le chargement indexé sur `o.rail` au lieu de l'option
 *   PF3  `echec()` ne relâche plus le verrou
 *   PF4  les moyens secondaires repassent en CTA plein
 *   PF5  `pageshow` restauré ne relâche plus le verrou. ⚠️ Cette mutation est
 *        d'abord restée VERTE : PF5 ne lisait que le libellé et `disabled`.
 *        Il clique désormais, et compte les demandes.
 *   PR1  l'échec du retrait ne pose plus l'erreur ; `catch` retiré ;
 *        `finally` ne relâche plus le verrou
 *   PR2  le succès ne relit plus le serveur
 *   PR3  `if (verrou.current) return;` → `if (false) return;` (retrait)
 *   PR3  m4 : `disabled={envoi}` remis à la place d'`aria-disabled`
 *   PF9  m4 : `disabled={bloque}` remis (PF1-PF3, PF5, PF7, PF9) ; garde du gestionnaire inatteignable
 *   PF7  m3 : la minuterie ne signale plus ; délai ramené à 3 s ; le signal relâche le verrou
 *   PF8  m3 : `visibilitychange` ignoré ; `assign` refusé relâche le verrou ; `pageshow` garde la surveillance
 *   PI1  une langue perd `{title}`
 *   `cart-pay-all.tsx` remis tel que sur `main` : PF1–PF6 rouges.
 *   `remove-from-cart.tsx` remis tel que sur `main` : PR1–PR3 rouges.
 */

type El = { type: unknown; props: Record<string, unknown> };
const el = (type: unknown, props: Record<string, unknown>): El => ({ type, props });
const JSX = { jsx: el, jsxs: el, Fragment: "fragment" };

/** Tous les éléments d'un arbre, dans l'ordre du document. */
function tous(arbre: unknown, out: El[] = []): El[] {
  if (Array.isArray(arbre)) {
    for (const a of arbre) tous(a, out);
    return out;
  }
  if (!arbre || typeof arbre !== "object") return out;
  const n = arbre as El;
  out.push(n);
  tous(n.props?.children, out);
  return out;
}
const boutons = (arbre: unknown) => tous(arbre).filter((n) => n.type === "button");
/** Le texte d'un élément, enfants compris. */
function texte(arbre: unknown): string {
  if (typeof arbre === "string" || typeof arbre === "number") return String(arbre);
  if (Array.isArray(arbre)) return arbre.map(texte).join("");
  if (!arbre || typeof arbre !== "object") return "";
  return texte((arbre as El).props?.children);
}
const classe = (n: El) => String(n.props.className ?? "");

/** React minimal : les cases des hooks survivent d'un rendu à l'autre. */
function fauxReact() {
  const cases: unknown[] = [];
  let curseur = 0;
  return {
    debut() { curseur = 0; },
    react: {
      useState(initial: unknown) {
        const i = curseur++;
        if (!(i in cases)) cases[i] = typeof initial === "function" ? (initial as () => unknown)() : initial;
        return [cases[i], (v: unknown) => { cases[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(cases[i]) : v; }];
      },
      useRef(initial: unknown) {
        const i = curseur++;
        if (!(i in cases)) cases[i] = { current: initial };
        return cases[i];
      },
      useEffect(effet: () => unknown) {
        const i = curseur++;
        if (!(i in cases)) { cases[i] = true; effet(); }
      },
      useId() { curseur++; return ":r1:"; },
    },
  };
}

// ─────────────────────────── « Payer tout le panier » ──────────────────────

const OPTIONS = [
  { rail: "moncash", label: "MonCash" },
  { rail: "kobara", kobaraProvider: "natcash", label: "NatCash" },
  { rail: "kobara", kobaraProvider: "moncash", label: "MonCash par Kobara" },
];
const LIBELLES = { title: "T", note: "N", coupon: "C", loading: "CHARGEMENT", error: "ERREUR", network: "RESEAU", age: "AGE", stalled: "BLOQUE", reload: "RECHARGER" };

type Reponse = Record<string, unknown>;
function monterPayerTout() {
  const f = fauxReact();
  const appels: Reponse[] = [];
  const enAttente: ((r: Reponse) => void)[] = [];
  const rejets: ((e: unknown) => void)[] = [];
  const parties: string[] = [];
  const ecoute: Record<string, (e: { persisted: boolean }) => void> = {};
  // Minuteries et écoutes de visibilité : déclenchées À LA MAIN par le test.
  const minuteries = new Map<number, { fn: () => void; ms: number }>();
  let prochaine = 1;
  const visibilite: { etat: string; ecoute: (() => void) | null } = { etat: "hidden", ecoute: null };
  const etat = { rechargements: 0, assignLeve: false };
  const fenetre = {
    location: {
      assign: (u: string) => {
        if (etat.assignLeve) throw new Error("navigation refusée");
        parties.push(u); // la page ne part pas : c'est le cas que m3 couvre
      },
      reload: () => { etat.rechargements++; },
    },
    addEventListener: (type: string, fn: (e: { persisted: boolean }) => void) => { ecoute[type] = fn; },
    removeEventListener() {},
    setTimeout: (fn: () => void, ms: number) => { minuteries.set(prochaine, { fn, ms }); return prochaine++; },
    clearTimeout: (id: number) => { minuteries.delete(id); },
  };
  const doc = {
    get visibilityState() { return visibilite.etat; },
    addEventListener: (type: string, fn: () => void) => { if (type === "visibilitychange") visibilite.ecoute = fn; },
    removeEventListener: (type: string, fn: () => void) => { if (type === "visibilitychange" && visibilite.ecoute === fn) visibilite.ecoute = null; },
  };
  const mod = loadRoute("components/cart-pay-all.tsx", {
    react: f.react,
    "react/jsx-runtime": JSX,
    "@/lib/appel-session": {
      appelSession: (_url: string, corps: Reponse) => {
        appels.push(corps);
        return new Promise<Reponse>((oui, non) => { enAttente.push(oui); rejets.push(non); });
      },
    },
  }, {}, { window: fenetre, document: doc }) as unknown as { CartPayAll(p: unknown): El };
  const rendre = () => { f.debut(); return mod.CartPayAll({ options: OPTIONS, labels: LIBELLES }); };
  return { rendre, appels, enAttente, rejets, parties, ecoute, minuteries, visibilite, etat };
}
const clic = (b: El) => (b.props.onClick as () => Promise<void> | void)();
/** Laisse s'écouler les suites de promesses (le gestionnaire ne rend rien). */
const vider = () => new Promise<void>((r) => setImmediate(r));
const desactive = (b: El) => b.props["aria-disabled"] === true;

test("PF1 — M9 : un double clic n'envoie qu'UNE demande de paiement groupé", async () => {
  const m = monterPayerTout();
  const [premier] = boutons(m.rendre());
  // Les deux clics viennent du MÊME rendu : c'est exactement le double clic,
  // le second arrive avant que React ait repeint quoi que ce soit.
  void clic(premier);
  void clic(premier);
  assert.equal(m.appels.length, 1, "le second clic a ouvert une seconde demande : deux groupes, deux réservations de stock");
  m.enAttente[0]({ etat: "ok", data: { redirectUrl: "https://moncash.test/pay" } });
  await vider();
  assert.deepEqual(m.parties, ["https://moncash.test/pay"]);
  // Parti vers l'opérateur : le verrou reste fermé, aucun bouton ne repart.
  const apres = boutons(m.rendre());
  assert.ok(apres.every(desactive));
  void clic(apres[1]);
  await vider();
  assert.equal(m.appels.length, 1);
});

test("PF2 — seul le bouton cliqué dit « chargement » ; les autres sont désactivés, avec leur libellé", () => {
  const m = monterPayerTout();
  const [, natcash] = boutons(m.rendre());
  void clic(natcash);
  const b = boutons(m.rendre());
  assert.deepEqual(b.map(texte), ["MonCash", "CHARGEMENT", "MonCash par Kobara"],
    "deux options Kobara partagent `rail` : le chargement doit être indexé sur l'option, pas sur le rail");
  assert.ok(b.every(desactive), "pendant la demande, aucun autre moyen ne part");
  assert.deepEqual(b.map((x) => x.props["aria-busy"]), [false, true, false]);
});

test("PF3 — chaque issue d'échec relâche le verrou et se dit dans une alerte", async () => {
  for (const [issue, attendu] of [
    [{ etat: "refus", statut: 409, code: "stock_insuffisant", error: "« Pagne » : plus en stock" }, "« Pagne » : plus en stock"],
    [{ etat: "refus", statut: 500 }, "ERREUR"],
    [{ etat: "reseau" }, "RESEAU"],
    [{ etat: "ok", data: {} }, "ERREUR"],
    ["leve", "ERREUR"],
  ] as const) {
    const m = monterPayerTout();
    const [premier] = boutons(m.rendre());
    void clic(premier);
    if (issue === "leve") m.rejets[0](new Error("panne"));
    else m.enAttente[0](issue as Reponse);
    await vider();
    const arbre = m.rendre();
    const alerte = tous(arbre).find((n) => n.props.role === "alert");
    assert.equal(alerte && texte(alerte), attendu, `issue ${JSON.stringify(issue)}`);
    const apres = boutons(arbre);
    assert.deepEqual(apres.map(texte), ["MonCash", "NatCash", "MonCash par Kobara"]);
    assert.ok(apres.every((x) => x.props["aria-disabled"] === false), `issue ${JSON.stringify(issue)} : boutons restés bloqués`);
    // Le verrou est RELÂCHÉ : un nouveau clic repart.
    void clic(apres[0]);
    assert.equal(m.appels.length, 2, `issue ${JSON.stringify(issue)} : le verrou n'a pas été relâché`);
    assert.equal(m.parties.length, 0);
  }
});

test("PF4 — le premier moyen est le CTA plein, les suivants en contour ; tous ≥ 44 px", () => {
  const b = boutons(monterPayerTout().rendre());
  assert.match(classe(b[0]), /(?<![\w:/-])bg-brand(?![\w/-])/);
  assert.match(classe(b[0]), /(?<![\w:/-])text-on-brand\b/);
  for (const x of b.slice(1)) {
    assert.doesNotMatch(classe(x), /(?<![\w:/-])bg-brand(?![\w/-])/, "un moyen secondaire est encore orange plein");
    assert.match(classe(x), /(?<![\w:/-])border(?![\w-])/, "un moyen secondaire n'a pas de contour");
  }
  for (const x of b) assert.match(classe(x), /(?<![\w:/-])min-h-11\b/);
});

test("PF5 — retour arrière depuis l'opérateur (bfcache) : la page n'affiche plus un chargement fantôme", async () => {
  const m = monterPayerTout();
  const [premier] = boutons(m.rendre());
  void clic(premier);
  m.enAttente[0]({ etat: "ok", data: { redirectUrl: "https://moncash.test/pay" } });
  await vider();
  // Un `pageshow` ordinaire (premier affichage) ne touche à rien.
  m.ecoute.pageshow({ persisted: false });
  assert.equal(texte(boutons(m.rendre())[0]), "CHARGEMENT");
  void clic(boutons(m.rendre())[0]);
  assert.equal(m.appels.length, 1, "page encore affichée : le verrou tient");
  m.ecoute.pageshow({ persisted: true });
  const b = boutons(m.rendre());
  assert.equal(texte(b[0]), "MonCash");
  assert.ok(b.every((x) => x.props["aria-disabled"] === false));
  // Le libellé ET le verrou : un bouton qui a l'air actif mais n'envoie rien
  // serait pire qu'un chargement fantôme.
  void clic(b[0]);
  assert.equal(m.appels.length, 2, "page restaurée : le verrou n'a pas été relâché");
});

test("PF6 — le verrou est posé AVANT tout `await`, sur la condition qui commande", () => {
  const src = readFileSync("components/cart-pay-all.tsx", "utf8");
  assert.match(
    src,
    /async function payer\(o: OptionPanier\) \{\s*if \(verrou\.current\) return;\s*verrou\.current = true;/,
    "le verrou synchrone doit être la première instruction de `payer`"
  );
  const pose = src.search(/verrou\.current = true;/);
  const attente = src.search(/await appelSession/);
  assert.ok(pose > 0 && attente > pose, "le verrou doit précéder l'appel");
});

/** Mène un paiement jusqu'au départ (`assign`), page restée affichée. */
async function partiSansQuitter(m: ReturnType<typeof monterPayerTout>) {
  void clic(boutons(m.rendre())[0]);
  m.enAttente[0]({ etat: "ok", data: { redirectUrl: "https://moncash.test/pay" } });
  await vider();
}
const alerteBloquee = (arbre: unknown) =>
  tous(arbre).find((n) => n.props.role === "alert" && texte(n).includes("BLOQUE"));

test("PF7 — m3 : la page n'est pas partie ; après le délai, l'écran dit de recharger, et le verrou TIENT", async () => {
  const m = monterPayerTout();
  await partiSansQuitter(m);
  assert.equal(alerteBloquee(m.rendre()), undefined, "rien à dire tant que le départ peut encore aboutir");
  const [minuterie] = [...m.minuteries.values()];
  assert.ok(minuterie, "aucune surveillance du départ");
  assert.ok(minuterie.ms >= 15_000, `délai de ${minuterie.ms} ms : un « rechargez » trop tôt interromprait un départ lent en 3G`);
  minuterie.fn();
  const arbre = m.rendre();
  const alerte = alerteBloquee(arbre);
  assert.ok(alerte, "après le délai, l'écran reste muet sur « Préparation du paiement… »");
  const recharger = boutons(alerte).find((b) => texte(b) === "RECHARGER");
  assert.ok(recharger, "pas de bouton de rechargement");
  assert.match(classe(recharger!), /(?<![\w:/-])min-h-11\b/);
  (recharger!.props.onClick as () => void)();
  assert.equal(m.etat.rechargements, 1);
  // Le groupe existe côté serveur : aucun moyen de paiement ne repart.
  const moyens = boutons(arbre).filter((b) => b !== recharger);
  assert.ok(moyens.every(desactive));
  for (const b of moyens) void clic(b);
  await vider();
  assert.equal(m.appels.length, 1, "un second groupe s'ouvrirait : la moitié serveur attend l'arbitrage M9");
});

test("PF8 — m3 : retour au premier plan (une application a capté l'adresse), ou navigation refusée : dit tout de suite", async () => {
  const m = monterPayerTout();
  await partiSansQuitter(m);
  m.visibilite.etat = "hidden";
  m.visibilite.ecoute?.();
  assert.equal(alerteBloquee(m.rendre()), undefined, "passer en arrière-plan n'est pas un échec");
  m.visibilite.etat = "visible";
  assert.ok(m.visibilite.ecoute, "aucune écoute du retour au premier plan");
  m.visibilite.ecoute!();
  assert.ok(alerteBloquee(m.rendre()));
  // bfcache : la page restaurée oublie tout, surveillance comprise.
  m.ecoute.pageshow({ persisted: true });
  assert.equal(alerteBloquee(m.rendre()), undefined);
  assert.equal(m.minuteries.size, 0, "la minuterie survit à la restauration");
  assert.equal(m.visibilite.ecoute, null, "l'écoute de visibilité survit à la restauration");

  const refus = monterPayerTout();
  refus.etat.assignLeve = true;
  await partiSansQuitter(refus);
  assert.ok(alerteBloquee(refus.rendre()), "navigation refusée : l'écran doit le dire sans attendre");
  void clic(boutons(refus.rendre())[0]);
  await vider();
  assert.equal(refus.appels.length, 1, "navigation refusée : le verrou ne se relâche pas pour autant");
});

test("PF9 — m4 : le bouton cliqué reste focalisable (aria-disabled, jamais disabled) ; le garde du gestionnaire tient l'âge", async () => {
  const m = monterPayerTout();
  void clic(boutons(m.rendre())[0]);
  for (const b of boutons(m.rendre())) {
    assert.equal(b.props.disabled, undefined, "`disabled` jette le focus clavier sur <body>");
    assert.equal(b.props["aria-disabled"], true);
  }
  // Attestation d'âge demandée par le serveur, case non cochée : refusé AVANT tout appel.
  m.enAttente[0]({ etat: "refus", statut: 422, code: "age_attestation_requise", error: "AGE REQUIS" });
  await vider();
  let arbre = m.rendre();
  assert.ok(boutons(arbre).every(desactive));
  void clic(boutons(arbre)[0]);
  await vider();
  assert.equal(m.appels.length, 1, "case non cochée : aucun appel ne doit partir");
  const caseAge = tous(arbre).find((n) => n.type === "input" && n.props.type === "checkbox")!;
  (caseAge.props.onChange as (e: unknown) => void)({ target: { checked: true } });
  arbre = m.rendre();
  assert.ok(boutons(arbre).every((b) => b.props["aria-disabled"] === false));
  void clic(boutons(arbre)[0]);
  assert.equal(m.appels.length, 2);
  assert.equal(m.appels[1].ageAttestation, true);
});

// ─────────────────────────────── Retirer ───────────────────────────────────

const L_RETRAIT = { remove: "Retirer", aria: "Retirer « Pagne » du panier", error: "PAS RETIRE", offline: "HORS LIGNE", retry: "Réessayer" };

function monterRetrait() {
  const f = fauxReact();
  const appels: { url: string; init: Reponse }[] = [];
  const enAttente: ((r: Reponse) => void)[] = [];
  const rejets: ((e: unknown) => void)[] = [];
  let relectures = 0;
  const parties: string[] = [];
  const mod = loadRoute("components/remove-from-cart.tsx", {
    react: f.react,
    "react/jsx-runtime": JSX,
    "next/navigation": { useRouter: () => ({ refresh: () => { relectures++; } }) },
    "@/lib/appel-session": {
      appelAvecSession: (url: string, init: Reponse) => {
        appels.push({ url, init });
        return new Promise<Reponse>((oui, non) => { enAttente.push(oui); rejets.push(non); });
      },
    },
  }, {}, { window: { location: { assign: (u: string) => parties.push(u) } } }) as unknown as { RemoveFromCart(p: unknown): El };
  const rendre = () => { f.debut(); return mod.RemoveFromCart({ productId: "p 1", labels: L_RETRAIT }); };
  return { rendre, appels, enAttente, rejets, parties, relectures: () => relectures };
}

test("PR1 — m11 : hors ligne, le retrait raté se DIT (alerte, cause, « Réessayer ») au lieu de rien", async () => {
  for (const [issue, attendu] of [
    [{ etat: "reseau" }, "HORS LIGNE"],
    [{ etat: "refus", statut: 503, error: "Panier indisponible" }, "PAS RETIRE"],
    ["leve", "PAS RETIRE"],
  ] as const) {
    const m = monterRetrait();
    const p = clic(boutons(m.rendre())[0]);
    assert.equal(m.appels[0].url, "/api/panier?productId=p%201");
    assert.equal(m.appels[0].init.method, "DELETE");
    if (issue === "leve") m.rejets[0](new TypeError("Failed to fetch"));
    else m.enAttente[0](issue as Reponse);
    await p; // une promesse rejetée non gérée ferait échouer cette ligne
    const arbre = m.rendre();
    const alerte = tous(arbre).find((n) => n.props.role === "alert");
    assert.ok(alerte, `issue ${JSON.stringify(issue)} : aucune alerte, l'échec est muet`);
    assert.match(texte(alerte), new RegExp(attendu));
    assert.equal(m.relectures(), 0, "un échec ne relit pas la page comme si le retrait avait eu lieu");
    const reessayer = boutons(alerte).find((b) => texte(b) === "Réessayer");
    assert.ok(reessayer, "pas de « Réessayer »");
    assert.match(classe(reessayer!), /(?<![\w:/-])min-h-11\b/);
    // « Réessayer » relance le MÊME geste : le verrou a été relâché.
    void clic(reessayer!);
    assert.equal(m.appels.length, 2);
    assert.equal(m.appels[1].url, m.appels[0].url);
  }
});

test("PR2 — succès : la page relit le serveur ; connexion : on part se connecter", async () => {
  const ok = monterRetrait();
  const p = clic(boutons(ok.rendre())[0]);
  ok.enAttente[0]({ etat: "ok", data: { ok: true } });
  await p;
  assert.equal(ok.relectures(), 1);
  assert.equal(tous(ok.rendre()).find((n) => n.props.role === "alert"), undefined);

  const cx = monterRetrait();
  const q = clic(boutons(cx.rendre())[0]);
  cx.enAttente[0]({ etat: "connexion", vers: "/connexion?next=%2Fpanier" });
  await q;
  assert.deepEqual(cx.parties, ["/connexion?next=%2Fpanier"]);
});

test("PR3 — le bouton fait 44 px, porte le titre dans son nom accessible, et ne part qu'une fois", () => {
  const m = monterRetrait();
  const [b] = boutons(m.rendre());
  assert.equal(texte(b), "Retirer");
  assert.equal(b.props["aria-label"], "Retirer « Pagne » du panier");
  assert.match(classe(b), /(?<![\w:/-])min-h-11\b/);
  void clic(b);
  // m4 : le bouton activé reste focalisable ; le verrou refuse le second envoi.
  const pendant = boutons(m.rendre())[0];
  assert.equal(pendant.props.disabled, undefined, "`disabled` jette le focus clavier sur <body>");
  assert.equal(pendant.props["aria-disabled"], true);
  void clic(pendant);
  void clic(b);
  assert.equal(m.appels.length, 1);
});

test("PI1 — les libellés du retrait existent dans les quatre langues et nomment l'article", () => {
  for (const lang of LANGS) {
    for (const cle of ["cart.remove.aria", "cart.remove.error", "cart.remove.offline"] as const) {
      const s = DICT[lang][cle];
      assert.ok(s && s.includes("{title}"), `${lang} ${cle} ne nomme pas l'article`);
    }
    // Le nom accessible CONTIENT le libellé visible (WCAG 2.5.3, « label in name »).
    assert.ok(DICT[lang]["cart.remove.aria"].startsWith(DICT[lang]["cart.remove"]), `${lang} : « ${DICT[lang]["cart.remove.aria"]} »`);
  }
});

// ─────────────────────────────── La page ───────────────────────────────────
// La page est EXÉCUTÉE (doublures de Supabase et des composants), puis son
// arbre est lu. Mutations éprouvées, chacune rouge puis restaurée :
//   PP1  `parBoutique` range toutes les lignes sous un seul vendeur
//   PP2  le prix de ligne, puis le total, repassent en `text-cloud`
//   PP3  source de vignette à 640 px ; `tabIndex={-1}` retiré ; une image
//        rendue aussi pour les produits SANS photo (`{true ? (`)
//   PP4  le nom accessible de « Retirer » perd le titre

type Ligne = { product_id: string; product: Record<string, unknown> };
const LIGNES: Ligne[] = [
  { product_id: "a", product: { slug: "guide", title: "Guide PDF", price_htg: 500, kind: "fichier", cover_url: "https://cdn.test/a.jpg", seller_id: "s1", creator: { display_name: "Lakay" } } },
  { product_id: "b", product: { slug: "pagne", title: "Pagne brodé", price_htg: 2500, kind: "physical", cover_url: null, seller_id: "s2", creator: { display_name: "Atelye Jacmel" } } },
  { product_id: "c", product: { slug: "sac", title: "Sac latanye", price_htg: 1750, kind: "physical", cover_url: "https://cdn.test/c.jpg", seller_id: "s1", creator: { display_name: "Lakay" } } },
  { product_id: "d", product: { slug: "chapo", title: "Chapo pay", price_htg: 900, kind: "physical", cover_url: null, seller_id: "s2", creator: { display_name: "Atelye Jacmel" } } },
];

function monterPage(lang = "ht", ouvert = false) {
  const largeurs: number[] = [];
  const page = loadRoute("app/panier/page.tsx", {
    "react/jsx-runtime": JSX,
    "next/link": { default: "a" },
    "@/components/product-commitment-details": { ProductCommitmentDetails: "PCD" },
    "@/lib/product-commitments-server": { getProductCommitments: async () => new Map() },
    "@/lib/marketplace-copy": { marketplaceCopy },
    "@/components/site-nav": { SiteNav: "SiteNav" },
    "@/components/site-footer": { SiteFooter: "SiteFooter" },
    "@/components/remove-from-cart": { RemoveFromCart: "RemoveFromCart" },
    "@/components/cart-pay-all": { CartPayAll: "CartPayAll" },
    "@/components/card-image": { CardImage: "CardImage" },
    "@/lib/supabase/server": {
      createClient: async () => ({
        ...database(() => ({ data: LIGNES, error: null })),
        auth: { getUser: async () => ({ data: { user: { id: "acheteur" } } }) },
      }),
    },
    "@/lib/supabase/admin": {
      createAdminClient: () => ({
        ...database(() => ({ data: { max_articles: 10 }, error: null })),
        rpc: async () => ({ data: ouvert, error: null }),
      }),
    },
    "@/lib/sample-data": { formatHTG },
    "@/lib/i18n-server": { getLang: async () => lang },
    "@/lib/i18n": { t },
    "@/lib/product-kind": { isProductKind, isDownloadable },
    "@/lib/stripe": { isStripeEnabled: () => false },
    "@/lib/kobara": { isKobaraEnabled: () => false },
    "@/lib/payment-utils": { usdCentsFromHtg: () => 0, formatUsd: () => "" },
    "@/lib/product-image": { coverUrlAt: (u: string | null, w: number) => { largeurs.push(w); return u; } },
    "@/lib/boutique-href": { hrefBoutique },
  }) as unknown as { default(): Promise<El>; generateMetadata(): Promise<{ title: string; robots: unknown }> };
  return { page, largeurs };
}

/** Les enfants DIRECTS d'un élément (tableaux de `map` aplatis). */
function enfants(n: El): El[] {
  const out: El[] = [];
  const plat = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(plat);
    else if (x && typeof x === "object") out.push(x as El);
  };
  plat(n.props.children);
  return out;
}

/** Les cartes de boutique d'une section : le nom en tête, les produits dans l'ordre. */
function boutiques(section: El) {
  return tous(section)
    .filter((n) => n.type === "div" && enfants(n).some((c) => c.type === "ul"))
    .map((carte) => ({
      nom: texte(tous(carte).find((n) => n.type === "a" && String(n.props.href).startsWith("/createur/"))),
      produits: tous(carte).filter((n) => n.type === "li").map((li) => tous(li).find((n) => n.type === "a")!.props.href),
    }));
}

test("PP1 — m11 : l'affichage est rangé PAR BOUTIQUE dans chaque mode de remise, sans perdre ni doubler une ligne", async () => {
  const { page } = monterPage();
  const arbre = await page.default();
  const sections = tous(arbre).filter((n) => n.type === "section");
  assert.equal(sections.length, 2, "à télécharger + à remettre");
  assert.deepEqual(boutiques(sections[0]), [{ nom: "Lakay", produits: ["/produit/guide"] }]);
  // Ordre d'ajout conservé : Atelye Jacmel apparaît d'abord (pagne), puis Lakay (sac).
  assert.deepEqual(boutiques(sections[1]), [
    { nom: "Atelye Jacmel", produits: ["/produit/pagne", "/produit/chapo"] },
    { nom: "Lakay", produits: ["/produit/sac"] },
  ]);
  // Le lien de boutique passe par la fonction unique du dépôt.
  assert.ok(tous(arbre).some((n) => n.type === "a" && n.props.href === hrefBoutique({ id: "s2", boutikSlug: null })));
});

test("PP2 — les prix (lignes ET total) sont en orange de texte, et le total n'a pas bougé", async () => {
  const { page } = monterPage();
  const noeuds = tous(await page.default());
  const prix = noeuds.filter((n) => n.type === "span" && /\bnumeric\b/.test(classe(n)));
  assert.equal(prix.length, LIGNES.length + 1, "une étiquette de prix par ligne, plus le total");
  for (const p of prix) {
    assert.match(classe(p), /(?<![\w:/-])text-accent(?![\w-])/, `prix « ${texte(p)} » hors de l'orange de texte`);
    assert.doesNotMatch(classe(p), /(?<![\w:/-])text-cloud\b/);
  }
  const somme = LIGNES.reduce((n, l) => n + Number(l.product.price_htg), 0);
  assert.equal(texte(prix.at(-1)), formatHTG(somme), "présentation seule : le total reste la somme des lignes");
  assert.deepEqual(
    prix.slice(0, -1).map(texte).sort(),
    LIGNES.map((l) => formatHTG(Number(l.product.price_htg))).sort()
  );
});

test("PP3 — vignette carrée de 64 px, différée, hors tabulation ; sans photo, un aplat honnête", async () => {
  const { page, largeurs } = monterPage();
  const arbre = await page.default();
  const vignettes = tous(arbre).filter((n) => n.type === "a" && n.props.tabIndex === -1);
  assert.equal(vignettes.length, LIGNES.length, "une vignette par ligne");
  for (const v of vignettes) {
    assert.equal(v.props["aria-hidden"], "true", "la vignette doublerait le lien du titre au lecteur d'écran");
    assert.match(classe(v), /(?<![\w:/-])h-16\b/);
    assert.match(classe(v), /(?<![\w:/-])w-16\b/);
  }
  const images = tous(arbre).filter((n) => n.type === "CardImage");
  assert.deepEqual(images.map((i) => i.props.src).sort(), ["https://cdn.test/a.jpg", "https://cdn.test/c.jpg"]);
  for (const i of images) {
    assert.equal(i.props.size, 64, "dimensions explicites : aucun saut de mise en page");
    assert.equal(i.props.alt, "");
  }
  assert.ok(largeurs.length >= LIGNES.length && largeurs.every((w) => w === 128), `source demandée à ${largeurs} px`);
  // Les lignes sans photo : aucune image, ni réelle ni de remplissage.
  const sansPhoto = vignettes.filter((x) => ["/produit/pagne", "/produit/chapo"].includes(String(x.props.href)));
  assert.equal(sansPhoto.length, 2, "le cas sans photo doit être réellement examiné");
  for (const v of sansPhoto) {
    assert.ok(!tous(v).some((n) => n.type === "CardImage" || n.type === "img"), "une image de remplissage ferait croire à la marchandise");
  }
  // Titre limité à deux lignes : exactement les titres des lignes.
  const titres = tous(arbre).filter((n) => n.type === "a" && /(?<![\w:/-])line-clamp-2\b/.test(classe(n))).map(texte);
  assert.deepEqual(titres.sort(), LIGNES.map((l) => String(l.product.title)).sort());
});

test("PP4 — chaque « Retirer » reçoit ses libellés traduits, titre compris, et le paiement groupé son message réseau", async () => {
  const { page } = monterPage("ht", true);
  const arbre = await page.default();
  const retraits = tous(arbre).filter((n) => n.type === "RemoveFromCart");
  assert.equal(retraits.length, LIGNES.length);
  const pagne = retraits.find((r) => r.props.productId === "b")!.props.labels as Record<string, string>;
  assert.equal(pagne.aria, "Retire « Pagne brodé » nan panyen an");
  assert.equal(pagne.offline, "Nou pa t ka retire « Pagne brodé » : koneksyon an pa pase.");
  assert.equal(pagne.retry, DICT.ht["offline.retry"]);
  const payer = tous(arbre).find((n) => n.type === "CartPayAll");
  assert.ok(payer, "le paiement groupé ouvert doit s'afficher");
  const lp = payer!.props.labels as Record<string, string>;
  assert.equal(lp.network, DICT.ht["error.network"]);
  assert.equal(lp.stalled, DICT.ht["cart.pay.all.stalled"]);
  assert.equal(lp.reload, DICT.ht["cart.pay.all.reload"]);
});

// ─────────────────────────────── Squelette ─────────────────────────────────
// Mutations éprouvées : la vignette fantôme passe à `h-12 w-12` ; le `<main>`
// du squelette passe à `max-w-6xl`. Rouges toutes deux.

test("PL1 — `/panier` a son squelette, à la forme du panier et dans la même coquille", () => {
  assert.ok(existsSync("app/panier/loading.tsx"), "sans lui, `/panier` retombe sur le squelette de l'ACCUEIL");
  const src = readFileSync("app/panier/loading.tsx", "utf8");
  assert.doesNotMatch(src, /SkeletonGrid|SkeletonCard/, "une grille de cartes est la forme de l'accueil, pas du panier");
  const mod = loadRoute("app/panier/loading.tsx", {
    "react/jsx-runtime": JSX,
    "@/components/site-nav": { SiteNav: "SiteNav" },
    "@/components/skeleton": { SkeletonBlock: "SkeletonBlock", SkeletonPage: "SkeletonPage" },
  }) as unknown as { default(): El };
  const arbre = mod.default();
  assert.equal(arbre.type, "SkeletonPage", "l'attente doit être annoncée (aria-busy du squelette partagé)");
  const noeuds = tous(arbre);
  assert.ok(noeuds.some((n) => n.type === "SiteNav"));
  const lignes = noeuds.filter((n) => n.type === "li");
  assert.ok(lignes.length >= 2 && lignes.length <= 3, `${lignes.length} lignes fantômes`);
  for (const li of lignes) {
    assert.ok(
      tous(li).some((n) => n.type === "SkeletonBlock" && /(?<![\w:/-])h-16\b/.test(classe(n)) && /(?<![\w:/-])w-16\b/.test(classe(n))),
      "chaque ligne fantôme a sa vignette carrée de 64 px"
    );
  }
  // La LIAISON avec la vraie page : même conteneur `<main>`, lu dans page.tsx.
  const coquille = /<main id="main" className="([^"]*)">/.exec(readFileSync("app/panier/page.tsx", "utf8"));
  assert.ok(coquille, "la coquille de page.tsx est introuvable");
  const main = noeuds.find((n) => n.type === "main");
  assert.equal(main?.props.id, "main");
  assert.equal(classe(main!), coquille![1], "le squelette et la page n'ont plus la même largeur : la page sauterait");
  assert.equal(texte(arbre).trim(), "", "un squelette ne porte aucun texte");
});

// ─────────────────────────────── Titre d'onglet ────────────────────────────
// Mutations éprouvées : titre remis en dur (« Mon panier — Zabelie ») ;
// `robots: { index: true }`. Rouges toutes deux (et F1 de
// `tests/finitions-pages.test.ts` pour la seconde).

test("PT1 — le titre d'onglet suit la langue, et la page reste noindex", async () => {
  for (const lang of LANGS) {
    const meta = await monterPage(lang).page.generateMetadata();
    assert.equal(meta.title, `${DICT[lang]["cart.title"]} — Zabelie`);
    assert.deepEqual(JSON.parse(JSON.stringify(meta.robots)), { index: false, follow: false });
  }
  assert.doesNotMatch(readFileSync("app/panier/page.tsx", "utf8"), /export const metadata\b/, "un titre fixe est revenu");
});
