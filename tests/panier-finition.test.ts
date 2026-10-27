import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadRoute } from "./helpers/route-harness";

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
 *   `cart-pay-all.tsx` remis tel que sur `main` : PF1–PF6 rouges.
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
