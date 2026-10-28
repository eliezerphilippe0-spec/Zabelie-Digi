import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * La PAGE affiliation du tableau vendeur (option B, docs/37 §A — migration
 * 0081). Elle ne porte aucune logique d'argent : la cascade, la maturation et
 * les bornes vivent en base. Ce que ces gardes tiennent, c'est la GOUVERNANCE
 * (l'UI n'arme jamais le programme) et les deux liaisons qui, cassées,
 * passeraient inaperçues : la dormance comme première branche, et la conversion
 * pourcentage → points de base.
 *
 * Assertions sur ce qui COMMANDE, et chaque proximité porte sa liaison
 * (CLAUDE.md, régression de proximité).
 */

const PAGE = readFileSync("app/tableau-de-bord/affiliation/page.tsx", "utf8");
const MANAGER = readFileSync("components/affiliation-manager.tsx", "utf8");
const SHELL = readFileSync("components/vendeur-shell.tsx", "utf8");

test("page : LECTURE SEULE — aucune écriture n'échappe aux routes gardées", () => {
  // Les gestes (devenir affilié, offrir un taux) passent par /api/affiliate et
  // /api/products/affiliate-rate, qui portent requireActiveAccount et la
  // vérification de propriété. Une écriture Supabase DANS la page les
  // contournerait. La page ne doit donc porter aucun verbe d'écriture.
  assert.doesNotMatch(
    PAGE,
    /\.(update|insert|upsert|delete)\(/,
    "La page doit rester en lecture seule — tout write passe par une route API gardée."
  );
});

test("page : DORMANTE par défaut — seul actif===true ouvre le programme", () => {
  // La dormance est la valeur sûre. `!== true` : une config absente (undefined)
  // reste fermée. Une mutation en `=== false` ouvrirait sur l'absence de config.
  assert.match(PAGE, /const dormant = cfg\?\.actif !== true/);
  // Et la page n'arme jamais : elle ne cite config.actif qu'en LECTURE.
  assert.doesNotMatch(PAGE, /actif:\s*true/);
});

test("page : bornes par défaut = PRD (5–40 %), jamais inventées", () => {
  assert.match(PAGE, /taux_min_bps \?\? 500/);
  assert.match(PAGE, /taux_max_bps \?\? 4000/);
});

test("manager : la dormance est évaluée AVANT le code — aucun lien programme fermé", () => {
  const iDormant = MANAGER.indexOf("dormant ?");
  const iCode = MANAGER.indexOf("monCode ?");
  assert.ok(iDormant > 0, "la branche dormante doit exister");
  assert.ok(
    iCode > iDormant,
    "`dormant ?` doit précéder `monCode ?` : sinon le lien de partage s'afficherait programme fermé."
  );
  // Et la branche dormante rend bien le « bientôt », pas le lien. Les libellés
  // sont résolus serveur et passés en props (règle i18n client) : c'est donc
  // `labels.bientot` que la branche dormante affiche.
  assert.match(MANAGER, /dormant \?[\s\S]{0,160}labels\.bientot/);
});

test("manager : devenir affilié passe par POST /api/affiliate (503 si dormant, côté serveur)", () => {
  assert.match(MANAGER, /fetch\("\/api\/affiliate", \{ method: "POST" \}\)/);
});

test("manager : le taux offert est converti en points de base (× 100), lié à l'entrée", () => {
  // L'entrée vendeur est en POURCENTAGE ; la base travaille en bps. La liaison
  // porte sur `pct` (la valeur saisie), × 100, dans le corps POSTé. Une mutation
  // qui enverrait `pct` nu offrirait 0,10 % au lieu de 10 %.
  assert.match(MANAGER, /rateBps: Math\.round\(pct \* 100\)/);
  // L'affichage fait l'inverse exact : bps / 100.
  assert.match(MANAGER, /produit\.rateBps !== null \? produit\.rateBps \/ 100 : null/);
});

test("manager : l'opt-in vendeur passe par la route affiliate-rate, POST et DELETE", () => {
  assert.match(MANAGER, /fetch\("\/api\/products\/affiliate-rate", \{\s*\n\s*method: "POST"/);
  assert.match(MANAGER, /fetch\("\/api\/products\/affiliate-rate", \{\s*\n\s*method: "DELETE"/);
});

test("shell : l'entrée de menu mène à la page affiliation, et le type la connaît", () => {
  assert.match(SHELL, /cle: "affiliation", href: "\/tableau-de-bord\/affiliation"/);
  // Sans la rubrique dans l'union, `actif="affiliation"` de la page ne compile pas.
  assert.match(SHELL, /RubriqueVendeur =[\s\S]{0,160}"affiliation"/);
});
