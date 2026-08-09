import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * QUATRE SITES D'APPEL, QUATRE OCCASIONS D'OUBLIER.
 *
 * `0043` le dit dans le corps même de son filet : `zabelie_open_fulfillment`
 * doit être appelée depuis chaque route qui confirme un paiement, et « un
 * cinquième rail ajouté plus tard n'hériterait de rien ». Le compilateur ne
 * dira rien : une route qui confirme un paiement sans ouvrir le suivi compile,
 * répond 200, encaisse, et laisse l'escrow d'un produit physique mûrir au
 * chronomètre. Le défaut est invisible par nature — même famille que
 * `tests/crons-appelants.test.ts`, une couche plus haut.
 *
 * Le croisement tenu ici :
 *   fichiers qui appellent `.rpc("confirm_payment")`
 *     × fichiers qui appellent `ouvrirSuiviLivraison`
 *
 * ⚠️ CE QU'IL NE PROUVE PAS. Il prouve que l'appel EXISTE dans le fichier, pas
 * qu'il est placé APRÈS `confirm_payment` ni qu'il s'exécute sur le bon chemin
 * (une branche d'erreur peut sortir avant). L'ordre est une propriété
 * sémantique : elle est portée par la revue et par le filet §6 bis, qui
 * rattrape justement l'appel mal ordonné. Deux instruments, aucun ne remplace
 * l'autre.
 *
 * Éprouvé sur corpus synthétique connu-positif ET connu-négatif avant qu'on
 * lui fasse confiance : voir le premier test.
 */

const RACINES = ["app", "lib"];
const OUVERTURE = "ouvrirSuiviLivraison";
const VERCEL = "vercel.json";

// ─────────────────────────── Extraction ──────────────────────────────────────

type Fichier = { chemin: string; source: string };

function tousLesModules(racine: string, acc: Fichier[] = []): Fichier[] {
  for (const nom of readdirSync(racine)) {
    const chemin = join(racine, nom);
    if (statSync(chemin).isDirectory()) tousLesModules(chemin, acc);
    else if (/\.tsx?$/.test(chemin)) acc.push({ chemin, source: readFileSync(chemin, "utf8") });
  }
  return acc;
}

/**
 * `confirm_payment` EXACTEMENT — pas `zabelie_topup_confirm_payment`, qui est
 * le pipeline de la recharge téléphonique : aucun produit physique, aucun
 * escrow vendeur, donc aucun suivi de remise à ouvrir. Le `["'`]` en tête
 * ancre le début du littéral et écarte le préfixe.
 */
function confirmeUnPaiement(source: string): boolean {
  return /\.rpc\(\s*["'`]confirm_payment["'`]/.test(source);
}

function ouvreLeSuivi(source: string): boolean {
  return source.includes(OUVERTURE);
}

/** Le croisement, isolé de tout accès disque pour être éprouvable. */
function croiser(fichiers: Fichier[]): { manquants: string[]; confirmateurs: string[] } {
  const confirmateurs = fichiers.filter((f) => confirmeUnPaiement(f.source));
  return {
    confirmateurs: confirmateurs.map((f) => f.chemin).sort(),
    manquants: confirmateurs
      .filter((f) => !ouvreLeSuivi(f.source))
      .map((f) => f.chemin)
      .sort(),
  };
}

// ───────────────── L'instrument avant la mesure ──────────────────────────────

test("le croisement voit le site oublié, et se tait quand l'appel est là", () => {
  const avec = { chemin: "a.ts", source: `admin.rpc("confirm_payment", {}); ${OUVERTURE}(a, b, "x");` };
  const sans = { chemin: "b.ts", source: `admin.rpc("confirm_payment", {});` };
  const hors = { chemin: "c.ts", source: `admin.rpc("zabelie_claim_notification", {});` };
  // La recharge téléphonique confirme un paiement TOPUP : jamais de physique.
  const topup = { chemin: "d.ts", source: `admin.rpc("zabelie_topup_confirm_payment", {});` };

  // Connu-positif : le site sans appel ressort, seul.
  assert.deepEqual(croiser([avec, sans, hors, topup]).manquants, ["b.ts"]);

  // Connu-négatif : tout le monde appelle → silence.
  assert.deepEqual(croiser([avec, hors, topup]).manquants, []);

  // Le préfixe topup ne doit JAMAIS être compté comme un confirmateur : sinon
  // le contrôle exigerait un suivi de remise sur une recharge téléphonique.
  assert.deepEqual(croiser([topup]).confirmateurs, []);

  // …et le motif ne doit pas non plus rater le vrai à cause d'espaces.
  const espace = { chemin: "e.ts", source: `admin.rpc(  'confirm_payment' , {})` };
  assert.deepEqual(croiser([espace]).confirmateurs, ["e.ts"]);
});

// ─────────────────────── Lecture du dépôt réel ───────────────────────────────

const modules = RACINES.flatMap((r) => tousLesModules(r));
const { manquants, confirmateurs } = croiser(modules);

test("l'extracteur a lu le dépôt, et pas le vide", () => {
  assert.ok(modules.length >= 100, `modules lus : ${modules.length}`);
  // Les quatre points de confirmation nommés par 0043 §6 bis. Si l'un d'eux
  // disparaît de cette liste, ce n'est pas le contrôle qui a bougé : c'est un
  // rail qui a changé de forme, et il faut aller voir.
  assert.deepEqual(confirmateurs, [
    "app/api/admin/confirm-zelle/route.ts",
    "app/api/moncash/return/route.ts",
    "app/api/reconcile/route.ts",
    "app/api/stripe/webhook/route.ts",
  ]);
});

// ───────────────────────── Les contrôles ─────────────────────────────────────

test("toute route qui confirme un paiement ouvre le suivi de remise", () => {
  assert.deepEqual(
    manquants,
    [],
    `Route(s) confirmant un paiement sans ouvrir le suivi : ${manquants.join(", ")}.\n` +
      "Ajouter `await ouvrirSuiviLivraison(admin, orderId, \"<rail>\")` APRÈS " +
      "`confirm_payment` — avant, l'escrow n'existe pas encore et le gel ne " +
      "toucherait aucune ligne (0043 §6 bis)."
  );
});

/**
 * `p_auto = true` fait sauter la vérification d'identité en base : c'est le
 * mode « prononcé par le système », réservé au balayage. Une route qui le
 * laisserait venir du corps de requête permettrait à n'importe qui de
 * prononcer la réception de la commande d'un autre — donc de payer un vendeur
 * à la place de l'acheteur. Le seul littéral accepté est `false`.
 */
test("aucune route n'expose p_auto : la réception système ne vient pas du client", () => {
  const fautifs = modules
    .filter((f) => f.source.includes("p_auto"))
    .filter((f) => !/p_auto:\s*false\b/.test(f.source))
    .map((f) => f.chemin)
    .sort();
  assert.deepEqual(
    fautifs,
    [],
    `p_auto passé autrement qu'en littéral \`false\` dans : ${fautifs.join(", ")}. ` +
      "Ce drapeau contourne la vérification d'identité de zabelie_mark_received."
  );
  // Connu-positif de l'instrument : la règle porte bien sur un fichier réel.
  assert.ok(
    modules.some((f) => /p_auto:\s*false\b/.test(f.source)),
    "aucun `p_auto: false` trouvé — la route de réception a changé de forme, " +
      "le contrôle ne vérifie plus rien."
  );
});

/**
 * ORDRE DANS LA JOURNÉE — une propriété d'ARGENT, pas de confort.
 *
 * Le balayage répare les orphelins (il GÈLE des escrows) ; `/api/maturation`
 * exécute `mature_wallets()` (il PAIE). Si la maturation passait la première,
 * un orphelin réparé le serait un jour trop tard : le vendeur d'une commande
 * dont personne ne sait si elle a été remise aurait déjà été payé.
 */
test("le balayage passe avant la maturation, dans la même journée", () => {
  const conf = JSON.parse(readFileSync(VERCEL, "utf8")) as {
    crons?: { path: string; schedule: string }[];
  };
  const crons = conf.crons ?? [];
  const minuteDuJour = (chemin: string): number => {
    const c = crons.find((x) => x.path === chemin);
    assert.ok(c, `cron ${chemin} absent de vercel.json`);
    const [min, heure] = c!.schedule.split(" ");
    assert.match(min, /^\d+$/, `${chemin} : minute non littérale (${c!.schedule})`);
    assert.match(heure, /^\d+$/, `${chemin} : heure non littérale (${c!.schedule})`);
    return Number(heure) * 60 + Number(min);
  };
  const balayage = minuteDuJour("/api/fulfillment/sweep");
  const maturation = minuteDuJour("/api/maturation");
  assert.ok(
    balayage < maturation,
    `Le balayage (${balayage} min) doit passer AVANT la maturation ` +
      `(${maturation} min). Sinon un escrow orphelin est payé avant d'être gelé.`
  );
});
