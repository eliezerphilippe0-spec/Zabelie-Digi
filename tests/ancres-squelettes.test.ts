import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadRoute } from "./helpers/route-harness";

/**
 * UN LIEN À FRAGMENT VERS UN SEGMENT QUI A SON SQUELETTE — croiser, parce que
 * rien ne le signalera (CLAUDE.md, « le code sans appelant »).
 *
 * ⚠️ NÉ D'UNE RÉGRESSION MESURÉE le 2026-10-27, sur la branche d'intégration
 * de l'audit : `app/vendre/loading.tsx` (lot 6, m6) a fait échouer
 * `e2e/parcours-physique-ancres` 10 fois sur 10 — le lien du tableau de bord
 * vers `/vendre#mes-produits` ne faisait plus défiler la page. Le même
 * squelette retiré, 15 sur 15 verts.
 *
 * LE MÉCANISME (Next 16, `layout-router.js`) : un lien visible est préchargé ;
 * le préchargement apporte le squelette du segment ; à la navigation, Next
 * valide d'abord ce squelette, cherche le fragment dedans, ne le trouve pas,
 * et tient l'intention pour traitée — « A missing hash target is still a
 * handled scroll intent ». La page arrive ensuite en flux, et personne ne
 * recommence. Le même défaut frappait déjà, sans que rien ne le dise, le
 * chemin ACHETEUR : « Réessayer » de `/paiement/echec` vers
 * `/produit/<slug>#acheter` (squelette de la fiche depuis le 2026-09-02),
 * mesuré rouge 5 fois sur 5 au navigateur.
 *
 * LE CROISEMENT : chaque lien interne à fragment est rapproché des
 * `loading.tsx` que traverse son chemin SOUS la racine (celui de la racine
 * n'a jamais cassé ce parcours, mesuré). S'il en existe un seul, le relais
 * d'ancre du layout racine (`components/ancre-au-chargement.tsx`) doit couvrir
 * les navigations clientes — et ça s'EXÉCUTE ici, scénario par scénario, au
 * lieu de se lire dans la source. Le résultat au navigateur est gardé par
 * `e2e/parcours-physique-ancres.spec.ts`.
 */

// ── L'extraction des liens à fragment ───────────────────────────────────────

/** Les cibles internes à fragment d'une source : `/chemin(?recherche)#ancre`,
 *  en littéral ou en gabarit (`href`, objets de menu, `router.push`). */
export function liensAFragment(src: string): Array<{ chemin: string; ancre: string }> {
  const code = src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const out: Array<{ chemin: string; ancre: string }> = [];
  // Un `${…}` de gabarit se traverse entier : il peut porter des espaces
  // (`?ventes=${page - 1}#ventes` — manqué par la première version, mesuré).
  const morceau = (exclus: string) => `(?:\\$\\{[^}]*\\}|[^"'\`\\s${exclus}])`;
  const lien = new RegExp(`(["'\`])(\\/(?!\\/)${morceau("#?")}*)(?:\\?${morceau("#")}*)?#(${morceau("")}+)\\1`, "g");
  for (const m of code.matchAll(lien)) {
    out.push({ chemin: m[2], ancre: m[3] });
  }
  return out;
}

/** Les `loading.tsx` que traverse un chemin, SOUS la racine (`app/loading.tsx` exclu). */
export function squelettesSousLaRacine(chemin: string): string[] {
  let dossier = "app";
  const trouves: string[] = [];
  for (const segment of chemin.split("/").filter(Boolean)) {
    const exact = join(dossier, segment);
    if (!segment.includes("${") && existsSync(exact) && statSync(exact).isDirectory()) dossier = exact;
    else {
      const dynamique = readdirSync(dossier).find((e) => /^\[.+\]$/.test(e) && statSync(join(dossier, e)).isDirectory());
      if (!dynamique) break;
      dossier = join(dossier, dynamique);
    }
    const f = join(dossier, "loading.tsx");
    if (existsSync(f)) trouves.push(f.replace(/\\/g, "/"));
  }
  return trouves;
}

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) sources(f, out);
    else if (/\.tsx?$/.test(e)) out.push(f.replace(/\\/g, "/"));
  }
  return out;
}

/** Les liens exposés : fragment + au moins un squelette sous la racine. */
function exposes(): string[] {
  const out = new Set<string>();
  for (const f of [...sources("app"), ...sources("components")]) {
    for (const l of liensAFragment(readFileSync(f, "utf8"))) {
      const sq = squelettesSousLaRacine(l.chemin);
      if (sq.length) out.add(`${l.chemin}#${l.ancre}  (${f} → ${sq.join(", ")})`);
    }
  }
  return [...out].sort();
}

// ── Le relais d'ancre, exécuté dans un navigateur de carton ─────────────────

type Element = { cache: boolean; closest: (s: string) => Element | null; scrollIntoView: (o?: unknown) => void };
type Observateur = { rappel: () => void; actif: boolean };

/** Monte `AncreAuChargement` avec des doubles explicites : adresse, DOM, observateur, écouteurs, crochets React. */
function monter(debut: { chemin: string; recherche?: string; fragment?: string; chargement?: string }) {
  const etat = {
    chemin: debut.chemin,
    recherche: debut.recherche ?? "",
    fragment: debut.fragment ?? "",
    scrollY: 0,
    chargement: debut.chargement ?? "navigate",
  };
  const elements = new Map<string, Element>();
  const observateurs: Observateur[] = [];
  const ecouteurs = new Map<string, Set<() => void>>();
  const defilements: string[] = [];

  const window = {
    get location() {
      return { hash: etat.fragment, href: `https://zabelie.test${etat.chemin}${etat.recherche}${etat.fragment}` };
    },
    get scrollY() {
      return etat.scrollY;
    },
    addEventListener(type: string, f: () => void) {
      if (!ecouteurs.has(type)) ecouteurs.set(type, new Set());
      ecouteurs.get(type)!.add(f);
    },
    removeEventListener(type: string, f: () => void) {
      ecouteurs.get(type)?.delete(f);
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
  const document = { body: {}, getElementById: (id: string) => elements.get(id) ?? null };
  class MutationObserver {
    o: Observateur;
    constructor(rappel: () => void) {
      this.o = { rappel, actif: false };
      observateurs.push(this.o);
    }
    observe() {
      this.o.actif = true;
    }
    disconnect() {
      this.o.actif = false;
    }
  }
  const performance = { getEntriesByType: () => [{ type: etat.chargement }] };

  // Crochets React minimaux : `useRef` persiste, `useEffect` rejoue quand ses dépendances changent.
  const cases: Array<{ ref?: { current: unknown }; deps?: unknown[]; nettoyage?: unknown }> = [];
  let curseur = 0;
  let enAttente: Array<() => void> = [];
  const react = {
    Suspense: "Suspense",
    useRef(initial: unknown) {
      const i = curseur++;
      cases[i] ??= { ref: { current: initial } };
      return cases[i].ref;
    },
    useEffect(f: () => unknown, deps?: unknown[]) {
      const i = curseur++;
      const ancien = cases[i];
      const change = !ancien || !deps || !ancien.deps || deps.length !== ancien.deps.length || deps.some((d, k) => !Object.is(d, ancien.deps![k]));
      if (change) {
        enAttente.push(() => {
          if (typeof ancien?.nettoyage === "function") (ancien.nettoyage as () => void)();
          cases[i] = { deps, nettoyage: f() };
        });
      }
    },
  };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const mod = loadRoute(
    "components/ancre-au-chargement.tsx",
    {
      react,
      "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
      "next/navigation": {
        usePathname: () => etat.chemin,
        useSearchParams: () => new URLSearchParams(etat.recherche),
      },
    },
    {},
    { window, document, MutationObserver, performance },
  ) as unknown as { AncreAuChargement: () => { props: { children: { type: (p: object) => unknown } } } };
  // Le relais vit SOUS la frontière Suspense que pose `AncreAuChargement`.
  const Interne = mod.AncreAuChargement().props.children.type;
  const rendre = () => {
    curseur = 0;
    enAttente = [];
    Interne({});
    for (const e of enAttente) e();
  };
  const emettre = (type: string) => [...(ecouteurs.get(type) ?? [])].forEach((f) => f());
  rendre();

  return {
    defilements,
    attend: () => observateurs.some((o) => o.actif),
    /** Navigation CLIENTE : l'adresse change, React rend la nouvelle page (ou son squelette). */
    naviguer(chemin: string, recherche: string, fragment: string) {
      Object.assign(etat, { chemin, recherche, fragment });
      rendre();
    },
    /** Retour arrière/avant : `popstate` d'abord, comme le navigateur. */
    retour(chemin: string, recherche: string, fragment: string) {
      Object.assign(etat, { chemin, recherche, fragment });
      emettre("popstate");
      rendre();
    },
    /** Un élément entre dans le DOM (`cache` : encore rangé dans le `<div hidden>` du flux). */
    apparaitre(id: string, cache = false) {
      const el: Element = {
        cache,
        closest: (s: string) => (s === "[hidden]" && el.cache ? el : null),
        scrollIntoView: () => defilements.push(id),
      };
      elements.set(id, el);
      observateurs.filter((o) => o.actif).forEach((o) => o.rappel());
      return el;
    },
    reveler(el: Element) {
      el.cache = false;
      observateurs.filter((o) => o.actif).forEach((o) => o.rappel());
    },
    geste: (type: string) => emettre(type),
  };
}

// ── Les instruments, éprouvés d'abord ───────────────────────────────────────

test("AS0 — extraction : littéral, gabarit, objet de menu, router.push ; rien d'externe ni de local", () => {
  const src = `
    <Link href="/vendre#mes-produits">a</Link>
    { cle: "produits", href: "/vendre#mes-produits" }
    <Bouton href={\`/produit/\${encodeURIComponent(produit)}#acheter\`}>b</Bouton>
    router.push(\`/vendre#produit-\${data.productId}\`);
    <Link href={\`/tableau-de-bord?ventes=\${ventesPage - 1}#ventes\`}>c</Link>
    {/* <Link href="/aide#commentaire">d</Link> */}
    <a href="https://zabelie.com/#ext">e</a>
    <a href="#local">f</a>
    <a href="/aide">g</a>`;
  assert.deepEqual(
    liensAFragment(src).map((l) => `${l.chemin}#${l.ancre}`),
    [
      "/vendre#mes-produits",
      "/vendre#mes-produits",
      "/produit/${encodeURIComponent(produit)}#acheter",
      "/vendre#produit-${data.productId}",
      "/tableau-de-bord#ventes",
    ],
  );
});

test("AS0 — résolution : le chemin traverse les dossiers, dynamiques compris, racine exclue", () => {
  assert.deepEqual(squelettesSousLaRacine("/vendre"), ["app/vendre/loading.tsx"]);
  assert.deepEqual(squelettesSousLaRacine("/produit/${encodeURIComponent(produit)}"), ["app/produit/[slug]/loading.tsx"]);
  assert.deepEqual(squelettesSousLaRacine("/tableau-de-bord/boutique"), ["app/tableau-de-bord/loading.tsx"]);
  assert.deepEqual(squelettesSousLaRacine("/aide"), [], "la racine seule ne compte pas");
  assert.deepEqual(squelettesSousLaRacine("/"), []);
});

// ── Le croisement ───────────────────────────────────────────────────────────

test("AS1 — tout lien à fragment vers un segment à squelette est relayé après une navigation cliente", () => {
  const liste = exposes();
  // Témoins : les deux parcours mesurés au navigateur DOIVENT être vus.
  assert.ok(liste.some((l) => l.startsWith("/vendre#mes-produits")), `extraction aveugle :\n${liste.join("\n")}`);
  assert.ok(liste.some((l) => /^\/produit\/.*#acheter/.test(l)), `extraction aveugle :\n${liste.join("\n")}`);

  // La couverture, EXÉCUTÉE : page déjà ouverte, navigation cliente, squelette
  // d'abord (cible absente), puis contenu rangé dans le `<div hidden>` du flux,
  // puis contenu mis en place.
  const p = monter({ chemin: "/tableau-de-bord" });
  p.naviguer("/vendre", "", "#mes-produits");
  assert.ok(p.attend(), `le relais d'ancre ne réagit pas à une navigation cliente — ces liens arrivent en haut de page :\n${liste.join("\n")}`);
  const el = p.apparaitre("mes-produits", true);
  assert.deepEqual(p.defilements, [], "une cible encore rangée dans le <div hidden> du flux n'est pas une cible");
  p.reveler(el);
  assert.deepEqual(p.defilements, ["mes-produits"], "la cible arrivée n'a pas été amenée");
  assert.ok(!p.attend(), "le relais doit se retirer une fois la cible amenée");
});

test("AS2 — la recherche seule change (pagination `?ventes=2#ventes`) : relayé aussi", () => {
  const p = monter({ chemin: "/tableau-de-bord" });
  p.naviguer("/tableau-de-bord", "?ventes=2", "#ventes");
  assert.ok(p.attend(), "un changement de recherche avec fragment n'est pas relayé");
  p.apparaitre("ventes");
  assert.deepEqual(p.defilements, ["ventes"]);
});

test("AS3 — retour arrière/avant : jamais de défilement forcé", () => {
  const p = monter({ chemin: "/tableau-de-bord" });
  p.retour("/vendre", "", "#mes-produits");
  p.apparaitre("mes-produits");
  assert.deepEqual(p.defilements, [], "un popstate a été suivi d'un défilement : la position restaurée doit primer");
  // Et le retour ne « contamine » pas la navigation suivante.
  p.naviguer("/produit/x", "", "#acheter");
  p.apparaitre("acheter");
  assert.deepEqual(p.defilements, ["acheter"]);
});

test("AS4 — cible déjà là quand le relais passe : Next l'a amenée, on ne refait rien", () => {
  const p = monter({ chemin: "/tableau-de-bord" });
  p.apparaitre("ma-boutique");
  p.naviguer("/tableau-de-bord/boutique", "", "#ma-boutique");
  assert.deepEqual(p.defilements, [], "double défilement : Next avait déjà amené la cible");
  assert.ok(!p.attend());
});

test("AS5 — premier geste, ou nouvelle navigation : l'attente s'abandonne", () => {
  const p = monter({ chemin: "/tableau-de-bord" });
  p.naviguer("/vendre", "", "#mes-produits");
  p.geste("wheel");
  p.apparaitre("mes-produits");
  assert.deepEqual(p.defilements, [], "quelqu'un qui a commencé à lire ne doit pas être emporté");

  const q = monter({ chemin: "/tableau-de-bord" });
  q.naviguer("/vendre", "", "#mes-produits");
  q.naviguer("/aide", "", "");
  q.apparaitre("mes-produits");
  assert.deepEqual(q.defilements, [], "une attente survit à la navigation suivante");
});

test("AS6 — chargement complet : inchangé (rattrapé si `navigate`, jamais sur rechargement)", () => {
  const p = monter({ chemin: "/vendre", fragment: "#mes-produits" });
  assert.ok(p.attend());
  p.apparaitre("mes-produits");
  assert.deepEqual(p.defilements, ["mes-produits"]);

  const r = monter({ chemin: "/vendre", fragment: "#mes-produits", chargement: "reload" });
  r.apparaitre("mes-produits");
  assert.deepEqual(r.defilements, [], "rechargement : la position restaurée prime");
});
