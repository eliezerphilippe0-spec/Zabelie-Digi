#!/usr/bin/env node
/**
 * PRÉFLIGHT — les dépendances déclarées sont-elles RÉELLEMENT installées ?
 *
 * ⚠️ POURQUOI CE SCRIPT EXISTE, ET C'EST UNE PANNE MESURÉE, PAS UNE PRÉCAUTION.
 *
 * Le 2026-08-21, `node_modules` s'est retrouvé amputé au démarrage du
 * conteneur : 46 entrées au lieu du compte attendu, `zod` et `serwist`
 * absents. Le symptôme visible fut une pluie de `TS2307` — bruyante, donc
 * inoffensive.
 *
 * Le danger n'est pas là. `npm test` charge `tests/*.test.ts` ; une amputation
 * qui toucherait une dépendance chargée par UN SEUL fichier de test ferait
 * échouer le chargement de CE fichier, et la suite rendrait un total plus
 * petit — « 700/700 vert » au lieu de « 717/717 vert ». **Un vert mensonger,
 * parce qu'un vert sur moins de tests ressemble exactement à un vert.**
 *
 * C'est le motif dominant de ce dépôt : l'échec se présente comme une
 * réussite. La mutation qui n'a pas muté, la commande dont le `&&` porte sur
 * `head`, le drapeau qui réinstalle au lieu de filtrer. Ici : l'environnement
 * qui rétrécit la mesure sans rien dire.
 *
 * Ce que ce script fait, et rien de plus : il compare ce que `package.json`
 * DÉCLARE avec ce que `node_modules` PORTE, et il échoue bruyamment sur le
 * moindre écart. Il ne répare rien — réinstaller à la volée masquerait le
 * symptôme au lieu de le nommer.
 *
 * Éprouvé sur un cas connu-négatif le 2026-08-21 : `node_modules/zod` déplacé
 * → sortie 1, `zod` nommé dans le rapport ; remis → sortie 0. Le résultat de
 * cette épreuve est consigné dans `docs/43` §5 — un instrument qui n'a jamais
 * échoué n'a pas démontré qu'il pouvait.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "..");

/**
 * Un paquet est présent si `node_modules/<nom>/package.json` existe.
 *
 * ⚠️ PAS `require.resolve` — il échoue sur les paquets sans point d'entrée
 * (`@types/*` en tête), qui sont pourtant exactement ceux dont l'absence a
 * produit la panne du 2026-08-21 (`@types/react` retiré par
 * `npm audit fix --omit=dev`, `tsc` incapable de trouver le namespace React).
 * Un contrôle qui ne voit pas la classe de paquets par laquelle la panne est
 * arrivée ne contrôle rien.
 *
 * ⚠️ PAS non plus un simple test de dossier : `npm` laisse des dossiers vides
 * derrière lui. C'est `package.json` qui atteste d'une installation, pas
 * l'entrée de répertoire.
 */
function present(nom) {
  return existsSync(join(RACINE, "node_modules", ...nom.split("/"), "package.json"));
}

function main() {
  const manifeste = JSON.parse(readFileSync(join(RACINE, "package.json"), "utf8"));

  const declares = [
    ...Object.keys(manifeste.dependencies ?? {}),
    ...Object.keys(manifeste.devDependencies ?? {}),
  ];

  // Post-condition sur l'instrument lui-même : un manifeste qu'on lirait mal
  // rendrait une liste vide, et une liste vide passe toujours au vert. C'est
  // le « compteur à zéro » du CLAUDE.md — « aucun manquant » et « rien
  // vérifié » doivent être distinguables.
  if (declares.length === 0) {
    console.error(
      "[preflight] ÉCHEC — aucune dépendance déclarée n'a été lue dans package.json.\n" +
        "            Ce n'est pas « rien à vérifier » : c'est le contrôle lui-même qui est cassé."
    );
    process.exit(1);
  }

  const manquants = declares.filter((nom) => !present(nom));

  if (manquants.length > 0) {
    console.error(
      `[preflight] ÉCHEC — ${manquants.length} dépendance(s) déclarée(s) absente(s) de node_modules ` +
        `sur ${declares.length} :\n` +
        manquants.map((nom) => `              • ${nom}`).join("\n") +
        "\n\n" +
        "            L'installation est INCOMPLÈTE. Toute suite lancée dans cet état\n" +
        "            peut rendre un vert portant sur MOINS de tests que prévu — un\n" +
        "            vert plus petit ressemble exactement à un vert.\n\n" +
        "            → npm ci    puis relancer.\n"
    );
    process.exit(1);
  }

  console.log(
    `[preflight] OK — ${declares.length}/${declares.length} dépendances déclarées présentes.`
  );
}

main();
