import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slugifier,
  slugValide,
  slugLibre,
  SLUG_RE,
  SLUG_MAX,
  SLUGS_RESERVES,
} from "../lib/boutik-slug";

/**
 * L'ADRESSE PUBLIQUE D'UNE BOUTIQUE (2026-08-17).
 *
 * Le lien que l'écran vendeur met dans un message WhatsApp valait
 * `zabelie.com/createur/8f3a1c22-7b90-…`. Personne ne colle ça dans une
 * conversation, et surtout personne ne le retape sous la dictée — or c'est
 * comme ça qu'une boutique circule ici.
 */

// ── Les accents, c'est-à-dire le cas normal ────────────────────────────────

test("les accents sont DÉPLIÉS, jamais supprimés", () => {
  /* ⚠️ Le défaut à ne pas commettre : `Jakmèl` → `jakml`. Retirer la lettre
   * accentuée au lieu de la déplier mutile le mot, et ça ne se voit qu'en
   * kreyòl ou en français. Le dépôt porte déjà la trace du même angle mort
   * (`\b` qui ne connaît pas le kreyòl). */
  assert.equal(slugifier("Jakmèl"), "jakmel");
  assert.equal(slugifier("Marie Jakmèl"), "marie-jakmel");
  assert.equal(slugifier("Bòtik Vandè"), "botik-vande");
  assert.equal(slugifier("Café des Artistes"), "cafe-des-artistes");
  assert.equal(slugifier("Sètifye Ayiti"), "setifye-ayiti");
  assert.equal(slugifier("Élève & Co"), "eleve-co");
  assert.equal(slugifier("Côte Sud"), "cote-sud");
});

test("l'accent en PREMIÈRE et en DERNIÈRE position — les deux frontières", () => {
  // Ce sont les positions qui cassent d'habitude, et elles sont fréquentes en
  // kreyòl : `vandè`, `bò`, `lè`, `èske`.
  assert.equal(slugifier("èske"), "eske");
  assert.equal(slugifier("vandè"), "vande");
  assert.equal(slugifier("bò lanmè"), "bo-lanme");
  assert.equal(slugifier("déjà"), "deja");
});

test("tout ce qui n'est pas lettre ou chiffre devient UNE césure", () => {
  assert.equal(slugifier("Ti  Machann   Nan Ri A"), "ti-machann-nan-ri-a");
  assert.equal(slugifier("A+B / C"), "a-b-c");
  assert.equal(slugifier("—Boutik—"), "boutik");
  assert.equal(slugifier("boutik_2026"), "boutik-2026");
});

test("un nom qui ne laisse rien d'utilisable rend « », jamais un slug inventé", () => {
  for (const nom of ["", "   ", "!!!", "—", "字", "A"]) {
    assert.equal(slugifier(nom), "", JSON.stringify(nom));
  }
});

test("la longueur est bornée, et le découpage ne laisse pas de tiret en bout", () => {
  const long = slugifier("Boutik " + "ti ".repeat(40));
  assert.ok(long.length <= SLUG_MAX, `${long.length} caractères`);
  assert.ok(!long.endsWith("-"), `finit par un tiret : ${long}`);
});

// ── Ce qu'un slug a le droit d'être ────────────────────────────────────────

test("les noms de routes sont refusés — `/boutik/admin` n'est pas `/admin`", () => {
  for (const r of ["admin", "api", "catalogue", "vendre", "panier"]) {
    assert.ok(SLUGS_RESERVES.has(r), `${r} devrait être réservé`);
    assert.equal(slugValide(r), false, r);
  }
});

test("la validation refuse les formes que l'URL ne porte pas", () => {
  assert.equal(slugValide("mari-jakmel"), true);
  assert.equal(slugValide("boutik2026"), true);
  assert.equal(slugValide("a"), false, "un caractère ne se dicte pas");
  assert.equal(slugValide("-mari"), false, "tiret en tête");
  assert.equal(slugValide("mari-"), false, "tiret en queue");
  assert.equal(slugValide("mari--jakmel"), false, "tiret double");
  assert.equal(slugValide("Mari"), false, "majuscule");
  assert.equal(slugValide("mari jakmel"), false, "espace");
  assert.equal(slugValide("jakmèl"), false, "accent non déplié");
  assert.equal(slugValide("x".repeat(SLUG_MAX + 1)), false, "trop long");
});

const NOMS = [
  "Jakmèl", "Marie Jakmèl", "A+B / C", "—Boutik—", "boutik_2026",
  "Ti  Machann   Nan Ri A", "Bòtik Vandè", "Élève & Co", "déjà",
  "Boutik " + "ti ".repeat(40),
];

test("tout ce que `slugifier` produit respecte la FORME, ou est vide", () => {
  /* ⚠️ Première version de ce test : « tout ce que `slugifier` produit est
   * VALIDE ». Rouge — et le code avait raison. `slugifier("—Boutik—")` rend
   * `boutik`, qui est RÉSERVÉ : une forme parfaite, un nom interdit. Les deux
   * règles ne sont pas la même, et les confondre dans une seule assertion
   * fabriquait une contradiction là où il y a une division du travail :
   * `slugifier` façonne, `slugValide` juge, `slugLibre` contourne. */
  for (const n of NOMS) {
    const s = slugifier(n);
    if (s === "") continue;
    assert.match(s, SLUG_RE, `« ${n} » → « ${s} » : forme invalide`);
    assert.ok(s.length >= 2 && s.length <= SLUG_MAX, `« ${s} » : longueur`);
  }
});

test("`slugLibre` ne rend JAMAIS un nom réservé, quel que soit le nom d'entrée", () => {
  // C'est là que la réservation se résout — pas dans le façonnage.
  for (const n of [...NOMS, "Admin", "API", "Catalogue", "Panier"]) {
    const s = slugLibre(n, new Set());
    if (s !== null) assert.ok(!SLUGS_RESERVES.has(s), `« ${n} » → « ${s} » réservé`);
  }
});

// ── La résolution des collisions ───────────────────────────────────────────

test("le suffixe est un COMPTEUR, pas un aléa", () => {
  /* Deux exécutions sur le même état doivent donner le même résultat : sinon
   * une reprise après erreur fabriquerait une SECONDE adresse pour la même
   * boutique, et l'ancienne circulerait encore sur WhatsApp. */
  const pris = new Set(["marie-jakmel"]);
  assert.equal(slugLibre("Marie Jakmèl", pris), "marie-jakmel-2");
  assert.equal(slugLibre("Marie Jakmèl", pris), "marie-jakmel-2", "déterministe");
});

test("les collisions s'empilent, et la base garde le dernier mot", () => {
  const pris = new Set(["marie-jakmel", "marie-jakmel-2", "marie-jakmel-3"]);
  assert.equal(slugLibre("Marie Jakmèl", pris), "marie-jakmel-4");
});

test("un slug réservé est contourné, pas rendu", () => {
  // « Admin » comme nom de boutique ne doit pas donner `/boutik/admin`.
  assert.equal(slugLibre("Admin", new Set()), "admin-2");
});

test("le suffixe respecte la longueur maximale", () => {
  const nom = "b".repeat(SLUG_MAX + 10);
  const s = slugLibre(nom, new Set([("b".repeat(SLUG_MAX))]))!;
  assert.ok(s.length <= SLUG_MAX, `${s.length} caractères : ${s}`);
  assert.ok(slugValide(s), s);
});

test("un nom sans matière rend null — l'appelant décide, il n'invente pas", () => {
  assert.equal(slugLibre("!!!", new Set()), null);
  assert.equal(slugLibre("", new Set()), null);
});
