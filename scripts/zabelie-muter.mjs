#!/usr/bin/env node
/**
 * HARNAIS DE MUTATION — la protection vient de l'outil, plus de la discipline.
 *
 * Pourquoi ce script existe. Le 2026-08-11, une mutation destinée à éprouver
 * un garde n'a pas été appliquée : l'ancre existait en DEUX exemplaires, la
 * substitution a visé le mauvais endroit, et la suite a rendu **9 verts sur
 * 9**. Ce vert ne voulait rien dire — c'était le dépôt intact. Sans une
 * assertion de comptage écrite à la main ce jour-là, il aurait été lu comme
 * « le garde résiste ».
 *
 * C'est la cinquième occurrence du même motif dans ce dépôt, et la leçon est
 * toujours la même : **un vert qui ne veut rien dire est plus dangereux qu'un
 * rouge.** Tant que la vérification dépend de ce que l'agent pense à écrire,
 * elle sautera un jour où il est pressé.
 *
 * Ce que ce harnais ASSURE, dans l'ordre, en échouant fort à chaque étape :
 *   1. l'ancre existe EXACTEMENT une fois — zéro et dix sont deux fautes
 *      différentes, toutes deux silencieuses ;
 *   2. le fichier est réellement modifié — comparé à son état d'AVANT, en
 *      mémoire, sans dépendre d'aucun état git ;
 *   3. la ligne mutée est AFFICHÉE avant que la suite ne tourne ;
 *   4. le fichier est restauré même si la suite plante.
 *
 * Et il inverse la lecture : ici, un test qui PASSE est un ÉCHEC du harnais —
 * la mutation n'a pas été vue par le garde.
 *
 * Usage :
 *   node scripts/zabelie-muter.mjs <fichier> <ancre> <remplacement> <commande…>
 *
 * Exemple :
 *   node scripts/zabelie-muter.mjs lib/outbox.ts 'if (ok) {' 'if (true) {' \
 *     npx tsx --test tests/outbox-notifications.test.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [fichier, ancre, remplacement, ...commande] = process.argv.slice(2);

if (!fichier || !ancre || remplacement === undefined || commande.length === 0) {
  console.error("usage : zabelie-muter.mjs <fichier> <ancre> <remplacement> <commande…>");
  process.exit(2);
}

function echec(message) {
  console.error(`\n❌ HARNAIS : ${message}`);
  process.exit(2);
}

const avant = readFileSync(fichier, "utf8");

// (1) L'ancre existe exactement une fois.
const n = avant.split(ancre).length - 1;
if (n !== 1) {
  echec(
    `l'ancre apparaît ${n} fois dans ${fichier} (attendu : 1).\n` +
      `   Zéro occurrence et dix occurrences sont deux fautes différentes, et ` +
      `toutes deux produisent un « succès » silencieux.`
  );
}

writeFileSync(fichier, avant.replace(ancre, remplacement));

let code = 1;
try {
  // (2) Le fichier a RÉELLEMENT changé — comparé à l'ÉTAT D'AVANT, en mémoire.
  //
  // La première version comparait avec `git diff`, donc contre HEAD : toute
  // modification non commitée du fichier se mêlait au diff, et le contrôle de
  // restauration se déclenchait à tort. Un harnais écrit pour attraper « la
  // mutation qui n'a pas muté » portait exactement le même défaut — vérifier
  // avec un instrument qu'on n'a pas vérifié. Comparer deux chaînes ne dépend
  // d'aucun état extérieur.
  const apres = readFileSync(fichier, "utf8");
  if (apres === avant) {
    echec(
      `le fichier ${fichier} est IDENTIQUE après substitution.\n` +
        `   C'est la mutation qui n'a pas muté : la suite qui suivrait rendrait ` +
        `du vert sur le dépôt intact.`
    );
  }

  // (3) Montrer ce qui a changé, avant de lancer quoi que ce soit.
  const av = avant.split("\n");
  const ap = apres.split("\n");
  console.log(`\n── mutation appliquée à ${fichier} :`);
  for (let i = 0; i < Math.max(av.length, ap.length); i++) {
    if (av[i] !== ap[i]) {
      if (av[i] !== undefined) console.log(`   -${av[i]}`);
      if (ap[i] !== undefined) console.log(`   +${ap[i]}`);
    }
  }

  console.log(`\n── ${commande.join(" ")}\n`);
  const r = spawnSync(commande[0], commande.slice(1), { stdio: "inherit" });
  code = r.status ?? 1;
} finally {
  // (4) Restauration inconditionnelle.
  writeFileSync(fichier, avant);
  if (readFileSync(fichier, "utf8") !== avant) {
    console.error(`\n⚠️  ${fichier} N'A PAS ÉTÉ RESTAURÉ — vérifier à la main.`);
    process.exit(2);
  }
  console.log(`\n── ${fichier} restauré.`);
}

// (5) Lecture inversée : le garde DOIT avoir vu la mutation.
if (code === 0) {
  echec(
    `la suite est VERTE sous mutation — le garde ne voit pas ce qu'il prétend ` +
      `garder.\n   C'est le résultat le plus dangereux possible : un test qui ` +
      `passe n'appelle aucune inspection.`
  );
}
console.log(`\n✅ HARNAIS : la suite a rougi sous mutation, le garde tient.`);
