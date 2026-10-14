import test from "node:test";
import assert from "node:assert/strict";
import { resteSurLeSite, safeNext } from "../lib/safe-next";

test("safeNext : accepte les chemins internes", () => {
  assert.equal(safeNext("/produit/beat-kompa"), "/produit/beat-kompa");
  assert.equal(safeNext("/rechaj"), "/rechaj");
  assert.equal(safeNext("/produit/x?a=1#acheter"), "/produit/x?a=1#acheter");
});

test("safeNext : rejette tout open redirect → repli sur /", () => {
  assert.equal(safeNext("https://site-malveillant.com"), "/"); // URL absolue
  assert.equal(safeNext("http://evil.com/produit"), "/");
  assert.equal(safeNext("//evil.com"), "/"); // protocol-relative
  assert.equal(safeNext("/\\evil.com"), "/"); // backslash traité en slash
  assert.equal(safeNext("\\/evil.com"), "/");
  assert.equal(safeNext("javascript:alert(1)"), "/"); // pas un chemin
  assert.equal(safeNext("@evil.com"), "/"); // userinfo-redirect (site+next)
  assert.equal(safeNext("produit/x"), "/"); // relatif sans slash initial
  assert.equal(safeNext(""), "/");
  assert.equal(safeNext(null), "/");
  assert.equal(safeNext(undefined), "/");
});

/* Les caractères de contrôle. Le parseur d'URL des navigateurs (WHATWG)
 * RETIRE la tabulation, le saut de ligne et le retour chariot avant de lire
 * l'adresse : `/<TAB>/hote` devient `//hote`, donc un AUTRE site, alors qu'il
 * commence par un seul « / » et passait les gardes ci-dessus. Le formulaire de
 * connexion fait `router.push(nextPath)`, qui navigue en dur vers une autre
 * origine : la victime se connectait sur le vrai Zabelie, puis partait ailleurs.
 * Le témoin prouve que le vecteur existe, pour que le refus ne teste pas le vide. */
test("témoin : le parseur d'URL fait d'une tabulation après « / » un autre site", () => {
  assert.equal(new URL("/\t/site-piege.example", "https://www.zabelie.com").origin, "https://site-piege.example");
});

test("safeNext : rejette les caractères de contrôle, que le navigateur effacerait", () => {
  for (const c of ["\t", "\n", "\r", "\u0000", "\u001f", "\u007f"]) {
    assert.equal(safeNext(`/${c}/site-piege.example`), "/", `contrôle U+${c.charCodeAt(0).toString(16).padStart(4, "0")} accepté`);
  }
  assert.equal(safeNext("/produit/\tx"), "/", "aucun chemin légitime ne porte de caractère de contrôle");
});

/* La défense en profondeur, éprouvée SEULE : dans safeNext, les gardes
 * textuels la précèdent et aucune entrée connue n'arrive jusqu'à elle en
 * sortant du site — un test de safeNext ne la verrait jamais refuser. */
test("resteSurLeSite : refuse ce que le navigateur résoudrait ailleurs", () => {
  assert.equal(resteSurLeSite("/produit/beat-kompa"), true);
  assert.equal(resteSurLeSite("/produit/x?a=1#acheter"), true);
  assert.equal(resteSurLeSite("/\t/site-piege.example"), false);
  assert.equal(resteSurLeSite("//site-piege.example"), false);
  assert.equal(resteSurLeSite("/\\site-piege.example"), false);
  assert.equal(resteSurLeSite("https://site-piege.example/"), false);
});

test("safeNext : toute valeur acceptée reste sur l'origine du site", () => {
  const candidats = [
    "/produit/beat-kompa", "/produit/x?a=1#acheter", "/\t/site-piege.example", "/\n/site-piege.example",
    "/%09/site-piege.example", "/　/site-piege.example", "/.//site-piege.example", "/ /site-piege.example",
  ];
  for (const brut of candidats) {
    const accepte = safeNext(brut);
    assert.equal(new URL(accepte, "https://www.zabelie.com").origin, "https://www.zabelie.com", `${JSON.stringify(brut)} → ${JSON.stringify(accepte)} sort du site`);
  }
});
