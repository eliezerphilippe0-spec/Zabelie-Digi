import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Filet de sécurité (audit sécurité §3.2) : le middleware ne bloque rien
 * lui-même (pattern Supabase App Router) — chaque route API porte son propre
 * garde. Ce test STATIQUE garantit qu'aucune route, présente ou FUTURE, ne
 * peut être ajoutée sans garde d'accès : il échoue à la CI si un route.ts
 * sous app/api/ ne contient ni authentification, ni secret cron, ni
 * vérification serveur-à-serveur documentée ci-dessous.
 */

const API_ROOT = join(__dirname, "..", "app", "api");

// Gardes reconnus dans le code source d'une route.
const AUTH_GUARDS = [
  /\.auth\.getUser\(\)/, // session Supabase validée côté serveur
  /getCurrentUser\(/, //    idem + rôle depuis profiles
  /authorize\(req\)/, //    secret Bearer (routes cron)
  /verifyStripeWebhook/, // signature webhook Stripe
  /!\(await autoriserAdmin\(/, // garde PARTAGÉ (lib/admin-gate.ts) — voir ci-dessous
];

/* ⚠️ POURQUOI LE CINQUIÈME MOTIF EXIGE LA NÉGATION, ET PAS L'APPEL.
 *
 * Le 2026-08-22, le garde d'administration a été extrait de
 * `app/api/admin/coherence/route.ts` vers `lib/admin-gate.ts` parce qu'une
 * seconde route en avait besoin. Ce test est parti ROUGE sur-le-champ, et il
 * avait raison : **un croisement TEXTUEL ne voit plus un garde qui a quitté le
 * fichier**. C'est la limite structurelle de ce contrôle, et elle mérite d'être
 * écrite plutôt que contournée en silence.
 *
 * Le motif ancre donc `!(await autoriserAdmin(` — la forme qui REFUSE — et non
 * `autoriserAdmin(` seul. Une route qui appellerait le garde puis jetterait son
 * résultat satisferait le second motif et laisserait entrer tout le monde :
 * c'est le piège de sous-chaîne de `CLAUDE.md`, appliqué à une autorisation.
 * Ce qu'on assert est ce qui COMMANDE, jamais ce qui est présent.
 *
 * ⚠️ ET IL RESTE UNE FAILLE, NOMMÉE ICI PARCE QU'ELLE NE SE VOIT PAS : ce motif
 * fait confiance au NOM `autoriserAdmin`. Vider cette fonction de son contrôle
 * de rôle dégarnirait d'un coup toutes les routes qui s'y adossent, sans qu'une
 * seule ligne des routes ne bouge. Le test qui suit ancre donc cette confiance
 * à l'endroit où elle est due — dans le garde lui-même. */
test("le garde PARTAGÉ vérifie réellement le rôle, sinon les routes qui s'y fient tombent avec lui", () => {
  const src = readFileSync(join(__dirname, "..", "lib", "admin-gate.ts"), "utf8");
  assert.match(
    src,
    /return user\?\.role === "admin"/,
    "`autoriserAdmin` ne vérifie plus le rôle. Toutes les routes qui l'appellent " +
      "sont dégardées d'un coup, et aucune d'elles n'a changé d'une ligne — " +
      "c'est exactement le prix d'un garde partagé, et la raison de ce test."
  );
  assert.match(
    src,
    /bearer === cron|bearer === manual/,
    "`autoriserAdmin` ne compare plus les jetons cron : les crons Vercel " +
      "recevraient 401 sur toutes les routes gardées"
  );
});

// Routes publiques PAR CONCEPTION — chacune doit exhiber le garde alternatif
// indiqué. Toute nouvelle route publique doit être ajoutée ICI, avec sa raison.
const PUBLIC_ROUTES: Record<string, RegExp> = {
  // Retour navigateur MonCash : pas de session requise, la vérité vient de la
  // vérification serveur-à-serveur auprès de MonCash (INVARIANT 2).
  "moncash/return/route.ts": /retrieveTransactionPayment/,
  // Prévisualisation de code promo : publique par choix (l'acheteur n'est pas
  // encore connecté), bornée par IP contre la force brute.
  "coupons/validate/route.ts": /rateLimit\(/,
  // Portail client d'une facture Business : payer sans login. La facture est
  // résolue SERVEUR par token opaque, le montant (reste dû) est calculé en base
  // — jamais du client ; bornée par token contre l'abus. Confirmation réelle =
  // serveur-à-serveur dans moncash/return (INVARIANT 2).
  "facture/[token]/pay/route.ts": /rateLimit\(/,
  // Mesure de la landing : publique par nature (l'acheteur n'est pas
  // connecté), n'écrit RIEN d'autre qu'une ligne de journal validée contre
  // une liste fermée d'événements ; bornée par IP contre l'inondation du
  // journal.
  "metrics/landing/route.ts": /rateLimit\(/,
  // Sondes de supervision (docs/30, P10) : une sonde derrière un login ne
  // peut pas être appelée par la supervision externe. Elles n'exposent rien
  // (ni version, ni erreur interne) et ne mutent rien — la « preuve » est
  // l'absence de dépendance pour health, la coupure de délai pour readyz.
  // Déconnexion : publique PAR NÉCESSITÉ — exiger une session valide pour en
  // sortir bloquerait précisément le cas qui compte (session expirée, token
  // corrompu, poste partagé). La route ne peut agir que sur le porteur des
  // cookies de LA requête : elle ne révoque jamais la session d'un tiers.
  // Le vecteur restant serait une déconnexion forcée par `<img src>` — fermé
  // par l'absence de tout export GET, vérifiée dans tests/deconnexion.test.ts.
  "auth/signout/route.ts": /cookieStore\.getAll\(\)/,
  "health/route.ts": /never lies|ne ment jamais/,
  "readyz/route.ts": /Promise\.race/,
};

function collectRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...collectRoutes(p));
    else if (entry === "route.ts") out.push(p);
  }
  return out;
}

test("chaque route API a un garde d'accès (auth, secret cron, signature ou allowlist)", () => {
  const routes = collectRoutes(API_ROOT);
  assert.ok(routes.length >= 15, `sanity check : ${routes.length} routes trouvées`);

  for (const file of routes) {
    const rel = relative(API_ROOT, file).replace(/\\/g, "/");
    const src = readFileSync(file, "utf8");

    if (rel in PUBLIC_ROUTES) {
      assert.match(
        src,
        PUBLIC_ROUTES[rel],
        `${rel} : route publique par conception, mais son garde alternatif attendu est absent`
      );
      continue;
    }

    assert.ok(
      AUTH_GUARDS.some((g) => g.test(src)),
      `${rel} : aucun garde d'accès trouvé — ajouter une vérification d'authentification, ` +
        `ou documenter la route dans PUBLIC_ROUTES avec son garde alternatif`
    );
  }
});

/**
 * LE GARDE D'AUTHENTIFICATION NE DIT PAS QUI A LE DROIT.
 *
 * Constat de l'audit Izikit (docs/30, P11) : le test ci-dessus impose qu'une
 * route identifie QUELQU'UN, jamais qu'elle vérifie SON RÔLE. Une route
 * `/api/admin/refund` qui appellerait `getCurrentUser()` sans tester
 * `role === "admin"` passerait la CI au vert — et ouvrirait le remboursement
 * à tout utilisateur connecté. Le seul verrou de rôle existant couvrait une
 * route sur douze (tests/admin-menu-counts.test.ts).
 *
 * Motifs de contrôle reconnus — liste FERMÉE, comme AUTH_GUARDS :
 *   - `.role !== "admin"` : le refus des routes admin classiques
 *     (`getCurrentUser()` puis 403) ;
 *   - `.role === "admin"` : la forme positive des routes doubles cron/admin
 *     (`search-demand` — sa fonction `authorize()` locale termine par
 *     `return user?.role === "admin"`) ;
 *   - `!(await autoriserAdmin(` : depuis le 2026-08-22, le garde PARTAGÉ de
 *     `lib/admin-gate.ts`, employé par `coherence` et `email-verify`. La
 *     négation fait partie du motif — un appel dont on jette le résultat ne
 *     garde rien. Et le contrôle de rôle du garde lui-même est ancré par le
 *     test « le garde PARTAGÉ vérifie réellement le rôle » plus haut, sans
 *     quoi ce motif ne ferait que faire confiance à un nom de fonction.
 * Un nouveau motif s'ajoute ICI, pas en le contournant — c'est le même
 * contrat que PUBLIC_ROUTES. (Correction au passage de docs/30 §3, qui
 * nommait cette fonction locale `estAdmin` : elle s'appelle `authorize`.)
 */
const ROLE_GUARDS = [
  /\.role !== "admin"/,
  /\.role === "admin"/,
  /!\(await autoriserAdmin\(/,
];

test("toute route sous app/api/admin/ vérifie le RÔLE, pas seulement l'identité", () => {
  const routes = collectRoutes(join(API_ROOT, "admin"));
  // Le garde-fou du garde-fou : si le glob ne trouve plus les routes admin,
  // le test passerait vacuement vert — il doit échouer à la place.
  assert.ok(routes.length >= 10, `sanity check : ${routes.length} routes admin trouvées`);

  for (const file of routes) {
    const rel = relative(API_ROOT, file).replace(/\\/g, "/");
    const src = readFileSync(file, "utf8");
    assert.ok(
      ROLE_GUARDS.some((g) => g.test(src)),
      `${rel} : la route identifie l'utilisateur mais ne vérifie jamais son rôle — ` +
        `ajouter le refus (user.role !== "admin" → 403), ou étendre ROLE_GUARDS ` +
        `si un nouveau motif de contrôle est légitime`
    );
  }
});
