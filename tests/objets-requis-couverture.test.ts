import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Le garde qui empêche `zabelie_objets_requis()` de re-geler.
 *
 * ⚠️ CE FICHIER EXISTE À CAUSE D'UN CAS RÉEL. `0048` a posé la bonne sonde —
 * constater la PRÉSENCE des objets plutôt que croire le registre — et l'a
 * posée pour DEUX fonctions, le 2026-07-31, quand le dépôt en comptait 48
 * migrations. Mesuré le 2026-08-18, à 83 migrations : le code déployé appelle
 * **46** fonctions par leur nom, la sonde en surveillait **2**.
 *
 * Rien n'était cassé. C'est ce qui rend le défaut dangereux plutôt qu'urgent :
 * `/api/admin/coherence` affichait « tous les objets requis existent en base »
 * en ayant vérifié 4 % de la surface. Une sonde qui ne grandit pas avec le
 * système qu'elle observe finit par mesurer son propre passé — et son vert
 * devient une caution.
 *
 * `0085` étend la liste. Ce fichier-ci est la seule chose qui l'empêche de
 * geler à nouveau, parce qu'aucun compilateur ne voit qu'un `.rpc("…")` est
 * une dépendance : c'est un artefact **adressé par chaîne**, la classe que
 * `CLAUDE.md` dit de croiser mécaniquement faute de le voir autrement.
 *
 * Le croisement va dans LES DEUX SENS. Une liste qui ne saurait que grandir
 * finirait par surveiller des fantômes, et l'on désarmerait le garde à la
 * première fausse alerte.
 */

const MIGRATION = "supabase/migrations/0085_objets_requis_v2.sql";

/**
 * Objets surveillés par la sonde mais appelés depuis **SQL**, pas depuis TS.
 * Une entrée ici est une exemption, donc elle porte sa raison — et elle se
 * périme dans l'autre sens : si l'objet devient un `.rpc()`, le test exige
 * qu'on la retire.
 */
const APPELES_DEPUIS_SQL: Record<string, string> = {
  zabelie_search_normalize:
    "appelée à l'intérieur d'autres fonctions SQL (0047), jamais par le code TS — mais le capteur de demande en dépend, donc elle reste surveillée",
};

function fichiers(racine: string): string[] {
  const out: string[] = [];
  const pile = [racine];
  while (pile.length) {
    const d = pile.pop()!;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        if (e !== "node_modules" && e !== ".next") pile.push(p);
      } else if (/\.(ts|tsx)$/.test(e)) out.push(p);
    }
  }
  return out;
}

/** Les noms appelés par le code déployé — `supabase.rpc("nom", …)`. */
function nomsAppelesParLeCode(): Map<string, string[]> {
  const vus = new Map<string, string[]>();
  for (const f of ["app", "lib", "components"].flatMap(fichiers)) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\.rpc\(\s*["'`]([a-z0-9_]+)["'`]/g)) {
      const liste = vus.get(m[1]) ?? [];
      liste.push(f);
      vus.set(m[1], liste);
    }
  }
  return vus;
}

/** Les noms surveillés par la sonde — lus dans la migration, jamais recopiés. */
function nomsSurveillesParLaSonde(): string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  // Chaque entrée est `('nom(args)', '…')` dans la liste `values`.
  return [...sql.matchAll(/\(\s*'([a-z0-9_]+)\([^)]*\)'\s*,/g)].map((m) => m[1]);
}

test("la sonde et le code sont lisibles — sans ça, tout ce fichier serait vide de sens", () => {
  const surveilles = nomsSurveillesParLaSonde();
  const appeles = nomsAppelesParLeCode();

  /* Le garde du garde. Si le format de la migration change et que l'extraction
     ne trouve plus rien, les deux comparaisons ci-dessous deviendraient
     trivialement vraies : « aucun manquant » sur zéro élément. C'est le vert
     qui ne vérifie rien, et c'est exactement le défaut que ce fichier traque
     chez `0048`. */
  assert.ok(
    surveilles.length >= 40,
    `la sonde n'expose que ${surveilles.length} objet(s) : soit ${MIGRATION} a changé de forme et l'extraction ne trouve plus rien, soit la liste a été amputée. Dans les deux cas la comparaison qui suit ne prouverait rien.`
  );
  assert.ok(
    appeles.size >= 40,
    `seulement ${appeles.size} appel(s) .rpc() trouvé(s) dans le code : l'extraction est cassée`
  );
});

test("tout .rpc() du code est surveillé par zabelie_objets_requis()", () => {
  const surveilles = new Set(nomsSurveillesParLaSonde());
  const appeles = nomsAppelesParLeCode();

  const nonSurveilles = [...appeles.entries()]
    .filter(([nom]) => !surveilles.has(nom))
    .map(([nom, ou]) => `${nom}  (appelé depuis ${[...new Set(ou)].join(", ")})`)
    .sort();

  assert.deepEqual(
    nonSurveilles,
    [],
    `Le code déployé appelle des fonctions que la sonde de présence ne surveille pas :\n  ${nonSurveilles.join(
      "\n  "
    )}\nSi l'une d'elles disparaissait de la base, /api/admin/coherence resterait VERT pendant que le chemin correspondant serait mort. Ajoutez-la dans ${MIGRATION}, avec sa signature COMPLÈTE (to_regprocedure ne résout pas un nom nu) et la conséquence de son absence.`
  );
});

test("la sonde ne surveille pas de fantôme — l'exemption se périme dans les deux sens", () => {
  const surveilles = nomsSurveillesParLaSonde();
  const appeles = nomsAppelesParLeCode();

  const sansAppelant = surveilles
    .filter((n) => !appeles.has(n) && !(n in APPELES_DEPUIS_SQL))
    .sort();

  assert.deepEqual(
    sansAppelant,
    [],
    `La sonde surveille des objets que plus aucun code n'appelle :\n  ${sansAppelant.join(
      "\n  "
    )}\nSoit l'appel a été retiré et l'entrée doit sortir de la liste, soit l'objet est appelé depuis SQL et doit être déclaré dans APPELES_DEPUIS_SQL avec sa raison. Une liste qui ne sait que grandir finit par crier à tort, et un garde qui crie à tort finit désarmé.`
  );

  // L'autre sens de la péremption.
  for (const [nom, raison] of Object.entries(APPELES_DEPUIS_SQL)) {
    assert.ok(
      surveilles.includes(nom),
      `${nom} est déclaré « appelé depuis SQL » mais n'est plus surveillé par la sonde — retirez-le de APPELES_DEPUIS_SQL (${raison})`
    );
    assert.ok(
      !appeles.has(nom),
      `${nom} est déclaré « appelé depuis SQL » alors que le code TS l'appelle maintenant en .rpc() — l'exemption est périmée, retirez-la`
    );
  }
});

test("chaque objet surveillé porte une signature et une conséquence", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const entrees = [
    ...sql.matchAll(/\(\s*'([a-z0-9_]+\([^)]*\))'\s*,\s*\n?\s*'([^']*(?:''[^']*)*)'\s*\)/g),
  ];

  assert.ok(entrees.length >= 40, `extraction cassée : ${entrees.length} entrée(s)`);

  const muettes = entrees
    .filter(([, , pourquoi]) => (pourquoi ?? "").trim().length < 30)
    .map(([, objet]) => objet);

  assert.deepEqual(
    muettes,
    [],
    `Objets surveillés sans conséquence énoncée :\n  ${muettes.join("\n  ")}\nLe message d'alerte de /api/admin/coherence est composé de ces textes. « objet manquant » n'aide personne à 2 h du matin ; « la voie de sortie vendeur est fermée » situe la panne en une lecture.`
  );
});
