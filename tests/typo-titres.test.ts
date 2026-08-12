import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * UN TITRE QUI N'EST PAS UN `h*` NE REÇOIT RIEN — ET ÇA NE SE VOIT QU'APRÈS.
 *
 * `app/globals.css` applique `--font-heading` à `h1`→`h6`. Le 2026-08-11, au
 * passage des titres de Manrope à Playfair Display, le plus gros texte de
 * l'accueil — « Achetez en sécurité avec MonCash » — est resté en grotesque :
 * c'est un `<p>` stylé comme un titre, donc la règle ne l'atteignait pas.
 * Personne ne l'aurait su sans une capture d'écran, et il se lisait comme un
 * oubli plutôt que comme un choix.
 *
 * Le balayage manuel qui a suivi n'a trouvé AUCUN autre cas : les quatorze
 * candidats du dépôt sont des montants (`formatHTG`), des valeurs de métrique,
 * des numéros d'étape ou un monogramme d'avatar — tous justement en Inter, un
 * serif à forte modulation confondant ses chiffres à petite taille.
 *
 * Ce test existe pour le composant de DEMAIN. Un balayage manuel protège le
 * jour où on le fait ; un croisement protège les autres jours.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE PROUVE PAS. Il lit des chaînes de `className`, pas
 * du rendu. Une classe composée dynamiquement lui échappe, et il ne dit rien
 * de ce qui EST correctement en `h*`. Il attrape une seule chose, celle qui
 * s'est produite : une balise non-titre stylée comme un titre, sans famille.
 */

const GROS = /text-(xl|2xl|3xl|4xl|5xl|6xl)/;
const GRAS = /font-(bold|extrabold|semibold|black)/;
const BALISE = /<(p|span|div|dt|figcaption)\s[^>]*className="([^"]*)"/;

/**
 * Ce qui a le DROIT de rester en Inter : chiffres et monogrammes.
 *
 * La règle est unique et vaut mieux qu'un arbitrage au cas par cas : les
 * chiffres d'un serif modulé se confondent à petite taille sur un écran
 * d'entrée de gamme, et Zabelie affiche des prix partout.
 */
const NUMERIQUE =
  /formatHTG|amount_htg|priceHTG|\.value\b|step\.n|initials|numeric|metric|slide\.badge/;

function fichiersTsx(racine: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(racine)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = join(racine, e);
    if (statSync(p).isDirectory()) out.push(...fichiersTsx(p));
    else if (e.endsWith(".tsx")) out.push(p);
  }
  return out;
}

test("aucune balise non-titre stylée en titre sans famille explicite", () => {
  const coupables: string[] = [];

  for (const fichier of [...fichiersTsx("app"), ...fichiersTsx("components")]) {
    const lignes = readFileSync(fichier, "utf8").split("\n");
    lignes.forEach((ligne, i) => {
      const m = BALISE.exec(ligne);
      if (!m) return;
      const classes = m[2];
      if (!GROS.test(classes) || !GRAS.test(classes)) return;
      // Famille posée explicitement → intentionnel, quel que soit le choix.
      if (/font-(heading|sans|mono)/.test(classes)) return;
      // Le contenu peut être sur la ligne suivante (JSX formaté par Prettier).
      const contenu = ligne + " " + (lignes[i + 1] ?? "");
      if (NUMERIQUE.test(contenu)) return;
      coupables.push(`${fichier}:${i + 1}  <${m[1]}>  ${contenu.trim().slice(0, 70)}`);
    });
  }

  assert.deepEqual(
    coupables,
    [],
    "Balise(s) non-titre stylée(s) comme un titre, sans famille explicite :\n" +
      coupables.map((c) => `  ${c}`).join("\n") +
      "\n\n`app/globals.css` ne pose `--font-heading` que sur `h1`→`h6`. Un " +
      "`<p>` gros et gras reste donc dans la police du CORPS — c'est ce qui " +
      "a laissé le plus gros texte de l'accueil en grotesque après le passage " +
      "au serif. Deux issues, toutes deux explicites : ajouter `font-heading` " +
      "si c'est un titre, ou en faire un vrai `h*`. Si c'est un chiffre ou un " +
      "montant, il reste en Inter — ajoutez son motif à NUMERIQUE."
  );
});

test("le token de titre existe et pointe bien sur une famille", () => {
  // Le test ci-dessus n'a de sens que si `font-heading` désigne quelque chose.
  const theme = readFileSync("app/zabelie-theme.css", "utf8");
  assert.match(
    theme,
    /--font-heading:\s*var\(--font-display\)/,
    "`font-heading` doit venir du token de titre, sinon la classe posée par " +
      "le contrôle ci-dessus ne change rien du tout."
  );
  // Le repli DOIT être un serif : avec `display: swap`, un repli sans-serif
  // fait sauter la forme ET la largeur du bloc au basculement.
  assert.match(
    theme,
    /--font-heading:[^;]*(Georgia|(?<!sans-)serif)/,
    "Le repli des titres doit rester un serif. ⚠️ La première version de " +
      "cette assertion cherchait `serif` — que `sans-serif` CONTIENT. Elle " +
      "restait donc verte sous la mutation qui remplaçait Georgia par " +
      "`system-ui, sans-serif`, c'est-à-dire exactement la régression " +
      "surveillée. Le harnais l'a dit ; l'attention ne l'aurait pas fait."
  );
});
