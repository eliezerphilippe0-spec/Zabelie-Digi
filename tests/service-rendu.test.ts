import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * LE « RENDU » DE PRESTATION (0068) — les croisements que le SQL ne voit pas.
 *
 * La PREUVE du comportement vit dans `supabase/tests/service_rendu.test.sql`
 * (S1→S10, exécutés en CI) : la porte, le verrou, la déclaration,
 * l'acceptation, l'auto-acceptation, les deux filets, l'identité comptable.
 * Ce fichier-ci ne re-prouve rien de tout ça — il croise ce qui est adressé
 * PAR CHAÎNE entre le SQL et l'application, la classe d'artefacts que ni
 * `tsc` ni la suite SQL ne peuvent voir (règle `CLAUDE.md` : le croisement
 * s'écrit avant de conclure).
 */

const ROUTE = readFileSync("app/api/fulfillment/sweep/route.ts", "utf8");
const MIG = readFileSync("supabase/migrations/0068_service_rendu.sql", "utf8")
  .replace(/--[^\n]*/g, "");

test("le filet orphelin service est appelé par le cron déclaré", () => {
  /* Sans appelant, `zabelie_service_sans_suivi_sweep` serait exactement le
   * défaut que `crons-appelants` traque : correcte, révoquée, jamais
   * exécutée — quatre mois de services non surveillés en silence. */
  assert.match(
    ROUTE,
    /rpc\(\s*"zabelie_service_sans_suivi_sweep"/,
    "La fonction de 0068 n'a pas d'appelant dans le cron de balayage.",
  );
});

test("les compteurs service sortent au journal MÊME À ZÉRO", () => {
  for (const compteur of ["services_repares", "services_tardifs"]) {
    assert.ok(
      ROUTE.includes(`${compteur}: services.${compteur} ?? 0`),
      `\`${compteur}\` doit sortir au journal même à zéro — sinon « le filet ` +
        `n'a pas tourné » et « il n'a rien trouvé » se ressemblent.`,
    );
  }
});

test("un échec du filet service est journalisé et n'abat pas le passage physique", () => {
  // Même contrat que le filet digital : l'erreur est captée, nommée, et le
  // reste du balayage — qui a déjà gelé et payé correctement — continue.
  assert.match(
    ROUTE,
    /if \(sErr\) \{\s*journal\(\{ issue: "echec_service"/,
    "Un échec du filet service doit être journalisé, pas avalé ni fatal.",
  );
});

test("la porte de 0068 est une liste EXPLICITE, jamais un « tout sauf »", () => {
  /* Le piège que la migration nomme : un `<>` ou `is distinct from` ferait
   * hériter TOUT kind futur d'un verrou d'escrow par accident — l'inverse
   * exact du bug d'origine (le `else` qui promettait un téléchargement). */
  assert.match(
    MIG,
    /v_kind not in \('physical', 'service'\)/,
    "La porte doit énumérer les kinds admis.",
  );
  assert.doesNotMatch(
    MIG.slice(MIG.indexOf("zabelie_open_fulfillment")),
    /v_kind (is distinct from|<>)/,
    "Une négation ferait entrer tout kind futur dans la machine par défaut.",
  );
});

test("le cas tardif du filet ne touche jamais escrow_entries", () => {
  // La branche tardive : localiser le bloc `else` du filet et vérifier
  // qu'aucun update d'escrow n'y vit. C'est l'identité 0033 qui est en jeu —
  // re-verrouiller un escrow mûri romprait la comptabilité sans rien
  // récupérer. (La preuve d'exécution est S9, instantané champ par champ.)
  const filet = MIG.slice(MIG.indexOf("zabelie_service_sans_suivi_sweep"));
  const tardif = filet.slice(filet.indexOf("else"), filet.indexOf("end if;"));
  assert.ok(tardif.includes("zabelie_fulfillment"), "branche tardive introuvable");
  assert.doesNotMatch(
    tardif,
    /update escrow_entries|insert into escrow_entries/,
    "La branche tardive écrit sur escrow_entries.",
  );
});
