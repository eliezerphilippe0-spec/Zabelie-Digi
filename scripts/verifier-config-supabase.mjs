#!/usr/bin/env node
/**
 * Contrôle des variables Supabase AU BUILD — avant publication, pas après.
 *
 * POURQUOI ICI ET PAS SEULEMENT AU RUNTIME
 * -----------------------------------------
 * La garde de `lib/supabase/config.ts` se déclenche à la construction du
 * client, donc **dans le navigateur d'un acheteur**. Elle rend la panne
 * lisible — mais après qu'elle a atteint la production.
 *
 * Les variables `NEXT_PUBLIC_*` sont disponibles au build. Un contrôle exécuté
 * avant `next build` fait **échouer le déploiement** au lieu de le publier
 * cassé : Vercel conserve alors la version précédente, et l'acheteur ne voit
 * rien du tout.
 *
 * ET ÇA CHANGE L'ARBITRAGE SUR LA SÉVÉRITÉ. Au runtime, une garde stricte casse
 * la production pour un faux positif, donc elle sera désarmée à la première
 * fausse alerte. Au build, un faux positif ne bloque qu'une publication : le
 * coût s'effondre. C'est le seul endroit où l'on peut se permettre d'être
 * exigeant sans risquer le désarmement.
 *
 * ⚠️ CE QUI EST DÉLIBÉRÉMENT TOLÉRÉ : L'ABSENCE.
 * La CI construit **sans aucune variable Supabase** — vérifié, `ci.yml` ne
 * définit que `DATABASE_URL` pour les tests SQL. Échouer sur une variable
 * absente casserait chaque build de chaque branche, et ce contrôle serait
 * retiré dans la semaine. On ne juge donc que ce qui est PRÉSENT.
 *
 * Le contrôle runtime reste utile comme filet, pour les cas où une variable
 * change sans reconstruction.
 */

const VARIABLES = [
  ["NEXT_PUBLIC_SUPABASE_URL", "url"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "cle_publique"],
  ["SUPABASE_SERVICE_ROLE_KEY", "cle_service"],
];

const fautes = [];
const vus = [];

for (const [nom, genre] of VARIABLES) {
  const brut = process.env[nom];
  if (brut === undefined || brut === "") continue; // absence tolérée — voir l'en-tête
  vus.push(nom);

  // 1. Espaces et sauts de ligne — la cause la plus fréquente, et invisible.
  //    Au build on le SIGNALE en plus de le nettoyer : ici, contrairement au
  //    runtime, quelqu'un lit la sortie et peut corriger la source.
  if (brut !== brut.trim()) {
    fautes.push(
      `${nom} : espace ou saut de ligne en début ou fin de valeur. ` +
        `Le collage depuis un tableau de bord en embarque souvent un. ` +
        `Retape la valeur à la main plutôt que de la coller.`
    );
  }
  const v = brut.trim();

  if (genre === "url") {
    let hote;
    try {
      hote = new URL(v).hostname.toLowerCase();
    } catch {
      fautes.push(`${nom} : « ${v} » n'est pas une URL.`);
      continue;
    }
    if (hote === "supabase.com" || hote.endsWith(".supabase.com")) {
      fautes.push(
        `${nom} : « ${v} » est l'URL du TABLEAU DE BORD, pas celle de l'API. ` +
          `Attendu : https://<ref>.supabase.co`
      );
    }
  }

  if (genre === "cle_publique") {
    if (v.startsWith("sb_secret_")) {
      fautes.push(
        `${nom} : c'est la CLÉ DE SERVICE. Dans une variable NEXT_PUBLIC_, elle ` +
          `partirait dans le navigateur de chaque visiteur et rendrait la RLS ` +
          `contournable. Rien ne casserait — c'est ce qui la rend dangereuse.`
      );
    }
    const p = v.split(".");
    if (p.length === 3 && v.startsWith("eyJ")) {
      try {
        const b64 = p[1].replace(/-/g, "+").replace(/_/g, "/");
        const charge = JSON.parse(
          Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64").toString("utf8")
        );
        if (charge.role === "service_role") {
          fautes.push(
            `${nom} : ce JWT porte le rôle « service_role ». C'est la clé de ` +
              `service, elle ne doit jamais être exposée au navigateur.`
          );
        }
      } catch {
        /* charge illisible : on ne juge pas ce qu'on n'a pas lu */
      }
    }
  }

  if (genre === "cle_service" && v.startsWith("sb_publishable_")) {
    fautes.push(
      `${nom} : c'est la clé PUBLIABLE, pas la clé de service. Les routes ` +
        `d'administration échoueront avec une erreur de droits, pas de config.`
    );
  }
}

const prefixe = "[config-supabase]";

if (vus.length === 0) {
  // Journalisé même à zéro — sinon « le contrôle n'a pas tourné » et « il a
  // tourné, rien à vérifier » produisent le même silence (CLAUDE.md).
  console.log(`${prefixe} aucune variable Supabase définie — rien à vérifier (build CI).`);
  process.exit(0);
}

if (fautes.length === 0) {
  console.log(`${prefixe} OK — ${vus.length} variable(s) vérifiée(s) : ${vus.join(", ")}`);
  process.exit(0);
}

console.error(`\n${prefixe} ⛔ BUILD INTERROMPU — ${fautes.length} problème(s) :\n`);
for (const f of fautes) console.error(`  • ${f}`);
console.error(
  `\n  Corrige dans Vercel → Settings › Environment Variables, puis redéploie.` +
    `\n  Rien n'est publié : le déploiement précédent reste en ligne.\n`
);
process.exit(1);
