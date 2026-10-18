import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { IDS_MODELES, contenuDepuisModele, estIdModele } from "../lib/digital-authoring/modeles";
import { copieCreation } from "../lib/digital-authoring/copy";
import { LIMITES_DEFAUT, lire, schemaContenu } from "../lib/digital-authoring/schema";
import { LANGS } from "../lib/i18n";

/**
 * Studio de création éditoriale — accueil, modèles et liens d'entrée
 * (docs/70, tâches 2.3 et 2.6 ; idées validées le 2026-10-15).
 */

const compteur = () => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
};

test("modèles : chaque plan est un contenu valide, dans les deux langues du guide", () => {
  assert.ok(IDS_MODELES.length >= 4, "au moins quatre modèles");
  for (const id of IDS_MODELES) {
    const ht = contenuDepuisModele(id, "ht", compteur());
    const fr = contenuDepuisModele(id, "fr", compteur());
    assert.equal(ht.sections.length, fr.sections.length, `${id} : ht et fr n'ont pas le même plan`);
    for (const [langue, contenu] of [["ht", ht], ["fr", fr]] as const) {
      assert.ok(lire(schemaContenu(LIMITES_DEFAUT), contenu).ok, `${id}/${langue} : contenu invalide`);
      assert.ok(contenu.sections.every((s) => s.titre.trim() && s.resultat.trim() && s.corps === ""), `${id}/${langue} : titre, résultat, corps vide`);
      assert.equal(new Set(contenu.sections.map((s) => s.titre)).size, contenu.sections.length, `${id}/${langue} : titres en double`);
    }
    // Le kreyòl n'est pas le français recopié.
    assert.notDeepEqual(ht.sections.map((s) => s.titre), fr.sections.map((s) => s.titre), `${id} : plan ht identique au fr`);
  }
});

test("modèles : identifiants neufs à chaque création, jamais partagés entre deux projets", () => {
  const a = contenuDepuisModele("metier", "ht", () => crypto.randomUUID());
  const b = contenuDepuisModele("metier", "ht", () => crypto.randomUUID());
  const ids = [...a.sections, ...b.sections].map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("modèles : seuls les identifiants connus sont admis", () => {
  for (const id of IDS_MODELES) assert.ok(estIdModele(id));
  for (const mauvais of ["", "RECETTE", "__proto__", "toString", 1, null, undefined, {}]) {
    assert.equal(estIdModele(mauvais), false, String(mauvais));
  }
});

test("libellés : les quatre langues portent toutes les clés, aucune vide, compteurs en place", () => {
  const cles = (o: object): string[] =>
    Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? cles(v).map((s) => `${k}.${s}`) : [k])).sort();
  const reference = cles(copieCreation("fr"));
  assert.ok(reference.length > 30, "la référence doit être lue");
  for (const lang of LANGS) {
    const c = copieCreation(lang);
    assert.deepEqual(cles(c), reference, lang);
    const valeurs = JSON.stringify(c);
    assert.ok(!/""/.test(valeurs), `${lang} : un libellé vide`);
    assert.ok(c.actifs.includes("{n}") && c.actifs.includes("{max}"), `${lang} : compteur`);
  }
  assert.notEqual(copieCreation("ht").titre, copieCreation("fr").titre, "le kreyòl n'est pas le français recopié");
});

test("page : drapeau éteint = 404, session requise, noindex, lecture sous le JWT", () => {
  const src = readFileSync("app/tableau-de-bord/creation/page.tsx", "utf8");
  assert.match(src, /if \(!creationActive\(lireEnvCreation\(\)\)\) notFound\(\);/);
  assert.match(src, /redirect\("\/connexion\?next=\/tableau-de-bord\/creation"\)/);
  assert.match(src, /robots: \{ index: false, follow: false \}/);
  assert.ok(!src.includes("createAdminClient"), "la page ne lit pas les projets avec la clé de service");
  assert.match(src, /\.select\(COLONNES_RESUME\)/, "la liste ne charge que des résumés");
  // Publicités abandonnées le 2026-10-16 (« on laisse tomber les pubs ») : aucune entrée.
  assert.ok(!src.includes("/tableau-de-bord/studio") && !src.includes("studioProvider"), "plus d'entrée publicité");
  // Opportunités et compteur lus sous le JWT, par les fonctions de la base.
  assert.match(src, /chargerOpportunites\(supabase, lang\)/);
});

test("liens d'entrée : présents seulement quand le Studio est allumé", () => {
  const vendre = readFileSync("app/vendre/page.tsx", "utf8");
  assert.equal((vendre.match(/href="\/tableau-de-bord\/creation"/g) ?? []).length, 1, "app/vendre : un lien attendu");
  assert.match(
    vendre,
    /\{creationActive\(lireEnvCreation\(\)\) && \(\s*<Link href="\/tableau-de-bord\/creation"/,
    "app/vendre : le lien n'est pas gardé par le drapeau"
  );
  // Le tableau vendeur porte le lien dans son menu (docs/73), sous le même drapeau.
  const menu = readFileSync("components/vendeur-shell.tsx", "utf8");
  assert.equal((menu.match(/href: "\/tableau-de-bord\/creation"/g) ?? []).length, 1, "menu vendeur : un lien attendu");
  assert.match(
    menu,
    /creationActive\(lireEnvCreation\(\)\)\s*\?\s*\[\{ cle: "creation", href: "\/tableau-de-bord\/creation"/,
    "menu vendeur : le lien n'est pas gardé par le drapeau"
  );
});
