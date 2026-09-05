import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * UNE CLÉ DE `lib/i18n.ts` SANS SITE D'APPEL EST UN DÉFAUT MÉCANIQUEMENT
 * DÉTECTABLE — même motif que la fonction de maintenance sans appelant
 * (`tests/crons-appelants.test.ts`), et il a coûté plus cher ici.
 *
 * Ce qu'il a produit, deux fois :
 *
 *   • `home.cta.sell` — traduite dans quatre langues, zéro site d'appel. Le
 *     bouton vendeur avait disparu du hero, et le `h1` acheteur est resté seul
 *     au-dessus d'un champ de recherche pendant que TOUTE la page en dessous
 *     s'adresse au vendeur. Lu de l'extérieur, ça ressemblait à un choix de
 *     positionnement à trancher ; c'était une régression silencieuse.
 *
 *   • `nav.logout` — traduite dans quatre langues, zéro site d'appel, pendant
 *     que `components/sign-out-button.tsx` affichait « Déconnexion » EN DUR.
 *     Un utilisateur en kreyòl, en anglais ou en espagnol voyait un bouton en
 *     français. La clé morte et le texte en dur sont les deux faces du même
 *     défaut : rien ne relie une traduction à son écran.
 *
 * Le compilateur ne peut pas le dire — `Record<I18nKey, string>` vérifie que
 * chaque langue porte chaque clé, jamais que chaque clé sert. Et un `grep` ne
 * prouve rien sur ce qu'il n'a pas trouvé.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE PROUVE PAS : qu'une clé appelée est AFFICHÉE. Un
 * appel dans une branche morte reste un appel. Il ferme la classe « traduit
 * mais jamais branché », pas « branché mais jamais rendu ».
 */

const I18N = "lib/i18n.ts";
/**
 * Modules du système i18n lui-même : ils DÉCLARENT les clés, les compter comme
 * appelants rendrait le test vide.
 */
const EXCLUS = ["lib/i18n.ts", "lib/i18n-server.ts", "lib/i18n-erreur.ts"];
const ROOTS = ["app", "components", "lib"];

/**
 * Clés sans site d'appel, tolérées AVEC LEUR RAISON, et le contrôle vérifie
 * les DEUX SENS : une exemption dont la clé a regagné un appelant échoue
 * aussi. Une liste qui ne sait que grandir devient une conformité par usure —
 * c'est précisément ce qui est arrivé au test i18n qui listait `"es"` en
 * contre-exemple longtemps après que l'espagnol soit devenu valide.
 */
const SANS_APPELANT: Record<string, string> = {
  "status.draft":
    "Supplantée par une décision produit explicite, pas oubliée : " +
    "`app/vendre/page.tsx:126` mappe tout ce qui n'est pas `published` sur " +
    "`status.review`, parce qu'un vendeur qui lisait « Brouillon » croyait " +
    "sa soumission échouée et resoumettait. Conservée si la revue humaine " +
    "cesse un jour d'être systématique.",
  "home.badge":
    "Résidu de l'assainissement de l'accueil — le bandeau « La marketplace " +
    "haïtienne » a été retiré du hero. À supprimer ou à rebrancher, non " +
    "tranché (OPS_TODO.md).",
  "sec.free.badge":
    "`sec.free` et `sec.free.sub` sont rendues, la pastille « GRATUIT » ne " +
    "l'est pas. Écart d'affichage non tranché, pas un résidu (OPS_TODO.md).",
  "product.pay.loading":
    "État de chargement de la redirection MonCash, jamais rendu : le bouton " +
    "ne montre rien pendant la redirection. Manque d'interface probable, à " +
    "vérifier sur le chemin réel (OPS_TODO.md).",
  "order.ref":
    "Libellé « N° de commande » de `0042`. La référence `ZB-…` est lue et " +
    "affichée, mais jamais avec ce libellé. À rebrancher quand l'écran de " +
    "suivi affichera la référence en clair (OPS_TODO.md).",
};

// ────────────────────────── Extraction ───────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Les clés se lisent dans le dictionnaire `fr`, qui est la source de
 * `I18nKey` (`export type I18nKey = keyof typeof fr`).
 */
function clesDeclarees(src: string): string[] {
  const debut = src.indexOf("const fr = {");
  const fin = src.indexOf("export type I18nKey");
  assert.ok(debut >= 0 && fin > debut, "bornes du dictionnaire `fr` introuvables");
  return [...src.slice(debut, fin).matchAll(/^\s{2}"([^"]+)":/gm)].map((m) => m[1]);
}

/**
 * Les commentaires sont retirés AVANT de chercher les appels. Sans ça, une clé
 * simplement CITÉE dans un commentaire — ce que fait justement le commentaire
 * qui explique pourquoi le bouton vendeur est revenu — compterait comme un
 * site d'appel, et le test se tairait sur la clé qu'il est censé surveiller.
 */
function sansCommentaires(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");
}

function litteraux(s: string): string[] {
  return [...s.matchAll(/["'`]([a-zA-Z0-9_.]+)["'`]/g)].map((m) => m[1]);
}

/**
 * Clés construites dynamiquement : `` t(lang, `faq.q${i}`) ``. Le préfixe
 * couvre alors toutes les clés qui commencent par lui.
 *
 * ⚠️ LE PIÈGE, RENCONTRÉ EN ÉCRIVANT CE FICHIER. Une première version
 * acceptait le préfixe VIDE — n'importe quel `` `${x}` `` du dépôt — et toutes
 * les 307 clés devenaient « utilisées ». Le test rendait 0 clé morte : un vert
 * parfait qui ne vérifiait rien. Un préfixe doit donc être un vrai espace de
 * noms : pointé et non trivial.
 */
function prefixesDynamiques(s: string): string[] {
  return [...s.matchAll(/`([a-zA-Z0-9_.]*)\$\{/g)]
    .map((m) => m[1])
    .filter((p) => p.includes(".") && p.length >= 3);
}

function croiser(
  cles: string[],
  vus: Set<string>,
  prefixes: string[],
  exemptions: Record<string, string>
): { mortes: string[]; exemptionsPerimees: string[] } {
  const appelee = (k: string) => vus.has(k) || prefixes.some((p) => k.startsWith(p));
  return {
    mortes: cles.filter((k) => !appelee(k) && !(k in exemptions)).sort(),
    exemptionsPerimees: Object.keys(exemptions).filter(appelee).sort(),
  };
}

// ─────────────────────── Lecture du dépôt réel ───────────────────────────────

const cles = clesDeclarees(readFileSync(I18N, "utf8"));
const sources = ROOTS.flatMap((r) => walk(r))
  .filter((f) => !EXCLUS.includes(f))
  .map((f) => sansCommentaires(readFileSync(f, "utf8")));
const vus = new Set(sources.flatMap(litteraux));
const prefixes = [...new Set(sources.flatMap(prefixesDynamiques))];

// ───────────────── L'instrument avant la mesure ──────────────────────────────

test("le croisement voit une clé morte, et se tait quand elle est appelée", () => {
  const c = ["nav.logout", "faq.q1", "menu.rayons"];

  // Connu-positif.
  assert.deepEqual(croiser(c, new Set(["menu.rayons"]), [], {}).mortes, [
    "faq.q1",
    "nav.logout",
  ]);

  // Connu-négatif : littéral pour l'une, préfixe dynamique pour l'autre.
  assert.deepEqual(
    croiser(c, new Set(["nav.logout", "menu.rayons"]), ["faq.q"], {}).mortes,
    []
  );

  // Exemption honorée, puis périmée dès que l'appelant existe.
  assert.deepEqual(croiser(c, new Set(), [], { "nav.logout": "r", "faq.q1": "r", "menu.rayons": "r" }).mortes, []);
  assert.deepEqual(
    croiser(c, new Set(["nav.logout"]), [], { "nav.logout": "r" }).exemptionsPerimees,
    ["nav.logout"]
  );

  // Le préfixe vide ne doit RIEN couvrir — c'est le faux vert rencontré ici.
  assert.deepEqual(prefixesDynamiques("const s = `${x}`;"), []);
  assert.deepEqual(prefixesDynamiques("t(lang, `faq.q${i}`)"), ["faq.q"]);

  // Une clé cachée dans un commentaire ne compte pas pour un appel.
  assert.equal(litteraux(sansCommentaires('// voir "nav.logout"\n')).length, 0);
  assert.deepEqual(litteraux(sansCommentaires('t(lang, "nav.logout");')), ["nav.logout"]);
});

test("les extracteurs ont lu le dépôt, et pas le vide", () => {
  assert.ok(cles.length >= 250, `clés lues : ${cles.length}`);
  assert.ok(sources.length >= 40, `fichiers lus : ${sources.length}`);
  assert.ok(vus.size >= 200, `littéraux lus : ${vus.size}`);
  // Ancres nommées : si l'une saute, c'est l'extraction qui a bougé.
  // `home.h1` a disparu avec le carrousel (accueil premium, Phase 3) ; l'ancre
  // est désormais le h1 de la bannière.
  assert.ok(cles.includes("hero.s1.t"), "`hero.s1.t` absente des clés lues");
  assert.ok(vus.has("home.cta.sell"), "`home.cta.sell` doit être appelée depuis le bloc vendeur");
  assert.ok(prefixes.includes("topup.status."), `préfixes : ${prefixes.join(", ")}`);
});

// ───────────────────────── Le contrôle ───────────────────────────────────────

test("toute clé i18n a un site d'appel, et toute exemption sert encore", () => {
  const { mortes, exemptionsPerimees } = croiser(cles, vus, prefixes, SANS_APPELANT);

  assert.deepEqual(
    mortes,
    [],
    `Clé(s) i18n sans site d'appel : ${mortes.join(", ")}.\n` +
      "Soit la brancher, soit la supprimer des QUATRE langues, soit " +
      "l'inscrire dans SANS_APPELANT avec la raison. Une clé traduite qui " +
      "n'atteint aucun écran est un écran qui parle une autre langue que " +
      "l'utilisateur, ou une interface qui a disparu sans le dire."
  );

  assert.deepEqual(
    exemptionsPerimees,
    [],
    `Exemption(s) devenue(s) fausse(s) : ${exemptionsPerimees.join(", ")} — ` +
      "ces clés ont maintenant un appelant, retirer l'entrée de SANS_APPELANT."
  );
});
