import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadRoute } from "./helpers/route-harness";
import { DICT, LANGS } from "../lib/i18n";

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
const LIBELLES = { title: "T", note: "N", coupon: "C", loading: "CHARGEMENT", error: "ERREUR", network: "RESEAU", age: "AGE" };

type Reponse = Record<string, unknown>;
function monterPayerTout() {
  const f = fauxReact();
  const appels: Reponse[] = [];
  const enAttente: ((r: Reponse) => void)[] = [];
  const rejets: ((e: unknown) => void)[] = [];
  const parties: string[] = [];
  const ecoute: Record<string, (e: { persisted: boolean }) => void> = {};
  const fenetre = {
    location: { assign: (u: string) => parties.push(u) },
    addEventListener: (type: string, fn: (e: { persisted: boolean }) => void) => { ecoute[type] = fn; },
    removeEventListener() {},
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
  }, {}, { window: fenetre }) as unknown as { CartPayAll(p: unknown): El };
  const rendre = () => { f.debut(); return mod.CartPayAll({ options: OPTIONS, labels: LIBELLES }); };
  return { rendre, appels, enAttente, rejets, parties, ecoute };
}
const clic = (b: El) => (b.props.onClick as () => Promise<void>)();

test("PF1 — M9 : un double clic n'envoie qu'UNE demande de paiement groupé", async () => {
  const m = monterPayerTout();
  const [premier] = boutons(m.rendre());
  // Les deux clics viennent du MÊME rendu : c'est exactement le double clic,
  // le second arrive avant que React ait repeint quoi que ce soit.
  const a = clic(premier);
  const b = clic(premier);
  assert.equal(m.appels.length, 1, "le second clic a ouvert une seconde demande : deux groupes, deux réservations de stock");
  m.enAttente[0]({ etat: "ok", data: { redirectUrl: "https://moncash.test/pay" } });
  await Promise.all([a, b]);
  assert.deepEqual(m.parties, ["https://moncash.test/pay"]);
  // Parti vers l'opérateur : le verrou reste fermé, aucun bouton ne repart.
  const apres = boutons(m.rendre());
  assert.ok(apres.every((x) => x.props.disabled === true));
  await clic(apres[1]);
  assert.equal(m.appels.length, 1);
});

test("PF2 — seul le bouton cliqué dit « chargement » ; les autres sont désactivés, avec leur libellé", () => {
  const m = monterPayerTout();
  const [, natcash] = boutons(m.rendre());
  void clic(natcash);
  const b = boutons(m.rendre());
  assert.deepEqual(b.map(texte), ["MonCash", "CHARGEMENT", "MonCash par Kobara"],
    "deux options Kobara partagent `rail` : le chargement doit être indexé sur l'option, pas sur le rail");
  assert.ok(b.every((x) => x.props.disabled === true), "pendant la demande, aucun autre moyen ne part");
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
    const p = clic(premier);
    if (issue === "leve") m.rejets[0](new Error("panne"));
    else m.enAttente[0](issue as Reponse);
    await p;
    const arbre = m.rendre();
    const alerte = tous(arbre).find((n) => n.props.role === "alert");
    assert.equal(alerte && texte(alerte), attendu, `issue ${JSON.stringify(issue)}`);
    const apres = boutons(arbre);
    assert.deepEqual(apres.map(texte), ["MonCash", "NatCash", "MonCash par Kobara"]);
    assert.ok(apres.every((x) => x.props.disabled === false), `issue ${JSON.stringify(issue)} : boutons restés bloqués`);
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
  const p = clic(premier);
  m.enAttente[0]({ etat: "ok", data: { redirectUrl: "https://moncash.test/pay" } });
  await p;
  // Un `pageshow` ordinaire (premier affichage) ne touche à rien.
  m.ecoute.pageshow({ persisted: false });
  assert.equal(texte(boutons(m.rendre())[0]), "CHARGEMENT");
  void clic(boutons(m.rendre())[0]);
  assert.equal(m.appels.length, 1, "page encore affichée : le verrou tient");
  m.ecoute.pageshow({ persisted: true });
  const b = boutons(m.rendre());
  assert.equal(texte(b[0]), "MonCash");
  assert.ok(b.every((x) => x.props.disabled === false));
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
