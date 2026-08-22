import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * UN REFUS SERVEUR SE DIT, IL NE S'AVALE PAS.
 *
 * ⚠️ NÉ D'UNE PANNE SUBIE. Le 2026-08-21 : « quand je clique sur published,
 * cela ne reste pas ». `components/admin-product-row.tsx` faisait, dans sa
 * branche d'échec, `setValue(prev)` et RIEN d'autre — le sélecteur revenait en
 * arrière, aucun message n'apparaissait.
 *
 * Or le serveur écrivait déjà le motif exact, et il était utile :
 *
 *   « Ce produit est un fichier et n'a aucun livrable téléversé. Publier
 *     reviendrait à le mettre en vente sans rien à remettre. »
 *
 * La porte de `0059` faisait son travail ; l'écran le jetait. C'est le motif
 * dominant du dépôt appliqué à l'interface : **l'échec se présente comme une
 * absence**. Rien ne casse, rien ne s'affiche, et l'utilisateur conclut que le
 * bouton ne marche pas — puis cherche ailleurs, longtemps.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE FAIT PAS : garantir que le message est BON. Il
 * garantit qu'une branche d'échec ne reste pas MUETTE. C'est le minimum, et
 * c'est précisément ce qui manquait.
 */

/** Retire les commentaires : un motif ne doit jamais matcher de la prose. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function composants(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) composants(p, acc);
    else if (p.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

const FICHIERS = [...composants("components"), ...composants("app")];

test("S0 — l'extracteur a lu le dépôt, pas le vide", () => {
  // « aucune branche muette » et « rien lu » ne doivent pas se ressembler.
  assert.ok(FICHIERS.length >= 40, `composants lus : ${FICHIERS.length}`);
  const avecFetch = FICHIERS.filter((f) =>
    /fetch\(\s*["'`]\//.test(code(readFileSync(f, "utf8")))
  );
  assert.ok(
    avecFetch.length >= 5,
    `composants appelant une route interne : ${avecFetch.length} — trop peu, la sonde ne mesure rien`
  );
});

test("S1 — toute branche `!res.ok` fait quelque chose du motif serveur", () => {
  const muets: string[] = [];

  for (const f of FICHIERS) {
    const src = code(readFileSync(f, "utf8"));
    // On isole chaque branche `if (!res.ok) { … }` et on regarde son CORPS.
    const re = /if\s*\(\s*!\s*(\w+)\.ok\s*\)\s*\{([\s\S]{0,600}?)\n\s*\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const corps = m[2];
      // Le corps doit LIRE la réponse (json/text) ou poser un état d'erreur.
      // `throw` compte aussi : la branche remonte, elle ne se tait pas.
      const parle =
        /\.(json|text)\s*\(/.test(corps) ||
        /\b(setErreur|setError|setMsg|setMessage|toast|throw)\b/.test(corps);
      if (!parle) muets.push(`${f} → ${corps.trim().slice(0, 60)}`);
    }
  }

  assert.deepEqual(
    muets,
    [],
    "Branche d'échec MUETTE — elle annule sans rien dire :\n  " +
      muets.join("\n  ") +
      "\n\nLe serveur envoie un motif ; le jeter transforme un refus " +
      "explicable en « ça ne marche pas ». Lire `await res.json()` et " +
      "afficher `error`, ou remonter l'échec. Voir " +
      "`components/admin-product-row.tsx` pour la forme."
  );
});

test("S2 — la ligne produit admin affiche bien le motif du refus", () => {
  // Le cas nommé, en plus du contrôle général : si ce composant change de
  // forme, S1 pourrait cesser de le voir sans que personne s'en aperçoive.
  const SRC = code(readFileSync("components/admin-product-row.tsx", "utf8"));

  // La LIAISON : le motif lu dans la réponse doit atteindre l'état affiché.
  assert.match(
    SRC,
    /res\s*\n?\s*\.json\(\)[\s\S]{0,200}setErreur\(/,
    "le motif serveur doit être lu PUIS posé dans l'état affiché"
  );
  // Et cet état doit être rendu — un état posé jamais lu ne dit rien.
  assert.match(
    SRC,
    /\{erreur\s*&&[\s\S]{0,300}\{erreur\}/,
    "l'état d'erreur doit être RENDU, pas seulement stocké"
  );
  // Le repli ne doit jamais écraser un motif présent.
  assert.match(
    SRC,
    /setErreur\(\s*motif\s*\|\|\s*REFUS_SANS_MOTIF\s*\)/,
    "le repli ne s'applique QUE si le serveur n'a rien transmis"
  );
});
