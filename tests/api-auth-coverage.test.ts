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
];

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
