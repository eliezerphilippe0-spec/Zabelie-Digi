import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DICT } from "../lib/i18n";

/**
 * SIGNAUX DE CONFIANCE DE LA VITRINE (0153, audit REA 2026-10-26, #5).
 *
 * La fiche publique n'exposait ni note agrégée ni ancienneté : l'acheteur
 * trust-first décidait à l'aveugle. Deux liaisons portent la correction, et
 * c'est elles qu'on garde — pas un libellé :
 *   • la MOYENNE se décide côté applicatif, sur les AGRÉGATS BRUTS rendus par
 *     la fonction (seuil unique dans lib/note-affichee) ;
 *   • la fonction est modifiée EN PLACE (même signature) : elle doit garder
 *     `security definer` et ses ACL, et rendre les trois nouvelles clés liées
 *     à leur source.
 */

const CREATORS = readFileSync("lib/creators.ts", "utf8");
const BOUTIQUE = readFileSync("components/boutique-vue.tsx", "utf8");
const MIG = readFileSync("supabase/migrations/0153_zabelie_boutik_confiance.sql", "utf8");

test("la moyenne de la boutique est DÉCIDÉE sur les agrégats bruts, pas rendue par la base", () => {
  // La liaison : noteAffichee reçoit rating_sum ET rating_count de la fiche.
  // Changer la source (p.ex. une moyenne pré-calculée) ferait rougir ceci.
  assert.match(
    CREATORS,
    /ratingAvg:\s*noteAffichee\(fiche\.rating_sum \?\? 0,\s*fiche\.rating_count \?\? 0\)/,
    "ratingAvg doit venir de noteAffichee(rating_sum, rating_count) — seuil unique"
  );
  assert.match(CREATORS, /memberSince:\s*fiche\.created_at \?\? null/);
  assert.match(CREATORS, /import \{ noteAffichee \} from "@\/lib\/note-affichee"/);
});

test("les nouveaux champs sont OPTIONNELS — le code survit à « déployé avant appliqué »", () => {
  // Avant 0153, la fonction rend l'ancienne forme sans ces clés ; `?? null`
  // et `?? 0` garantissent que la vitrine s'affiche sans eux, comme zone/slug
  // avant 0084.
  assert.match(CREATORS, /created_at\?:\s*string \| null;/);
  assert.match(CREATORS, /rating_sum\?:\s*number \| null;/);
  assert.match(CREATORS, /rating_count\?:\s*number \| null;/);
});

test("la vitrine n'affiche la note que SOUS CONDITION — jamais « ★ null »", () => {
  assert.match(BOUTIQUE, /creator\.ratingAvg !== null \|\| creator\.memberSince/);
  // La note réutilise les libellés d'avis des fiches, pas un libellé neuf.
  assert.match(BOUTIQUE, /creator\.ratingCount[\s\S]{0,80}"product\.reviews\.badge\.one",\s*"product\.reviews\.badge"/);
  assert.match(BOUTIQUE, /t\(lang, "creator\.member\.since"\)/);
});

test("0153 modifie la fonction EN PLACE, avec les trois clés liées à leur source", () => {
  assert.match(MIG, /create or replace function public\.zabelie_boutik_public\(p_id uuid default null, p_slug text default null\)/);
  assert.match(MIG, /security definer/);
  // Agrégat sur les produits PUBLIÉS du vendeur, pas tout le catalogue.
  assert.match(
    MIG,
    /sum\(rating_sum\)[\s\S]{0,120}from products where seller_id = v_p\.id and status = 'published'/,
    "la note doit s'agréger sur les produits publiés du vendeur"
  );
  for (const paire of [
    /'created_at',v_p\.created_at/,
    /'rating_sum',v_rating_sum/,
    /'rating_count',v_rating_count/,
  ]) {
    assert.match(MIG, paire, `clé manquante dans jsonb_build_object : ${paire}`);
  }
  // ACL conservées : publique interdite, trois rôles autorisés.
  assert.match(MIG, /grant execute on function public\.zabelie_boutik_public\(uuid,text\) to anon,authenticated,service_role/);
});

test("creator.member.since existe dans les quatre langues", () => {
  for (const l of ["fr", "ht", "en", "es"] as const) {
    const v = (DICT[l] as Record<string, string>)["creator.member.since"];
    assert.ok(typeof v === "string" && v.trim(), `creator.member.since absente en ${l}`);
  }
});
