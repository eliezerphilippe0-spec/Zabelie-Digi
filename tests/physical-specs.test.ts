import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { specsEtenduesDisponibles } from "../lib/products-physical";

/**
 * Fiche riche (V-2, docs/35) — le principe vérifié dans les deux sens :
 * sans 0074, les trois champs (marque/matière/état) ne s'affichent pas ET la
 * route les refuse explicitement — jamais une saisie vendeur perdue en
 * silence. Poids et dimensions (0036) passent toujours.
 */

test("specsEtenduesDisponibles : colonne lisible → true ; 42703, erreur ou exception → false", async () => {
  const avec = (error: unknown) =>
    ({
      from: () => ({ select: () => ({ limit: async () => ({ error }) }) }),
    }) as never;
  assert.equal(await specsEtenduesDisponibles(avec(null)), true);
  assert.equal(await specsEtenduesDisponibles(avec({ code: "42703" })), false);
  const jette = {
    from: () => {
      throw new Error("réseau");
    },
  } as never;
  assert.equal(await specsEtenduesDisponibles(jette), false);
});

// ── La route : structurel — conditions avec leurs cibles ────────────────────

const ROUTE = readFileSync("app/api/products/physical/route.ts", "utf8");

test("route physique : specs étendues refusées EXPLICITEMENT sans 0074 (422), jamais perdues", () => {
  assert.match(
    ROUTE,
    /veutSpecsEtendues && !\(await specsEtenduesDisponibles\(admin\)\)[\s\S]{0,300}status: 422/
  );
});

test("route physique : dimensions bornées (mm entiers), état en énumération fermée", () => {
  assert.match(ROUTE, /v < 1 \|\| v > 10000[\s\S]{0,200}status: 422/);
  assert.match(ROUTE, /body\.condition === "nef" \|\| body\.condition === "dezyem-men"/);
});

test("route physique : l'insert porte dimensions toujours, marque/matière/état seulement si fournis", () => {
  assert.match(ROUTE, /\.\.\.dims,/);
  assert.match(ROUTE, /\.\.\.\(brand !== null \? \{ brand \} : \{\}\)/);
  assert.match(ROUTE, /\.\.\.\(condition !== null \? \{ condition \} : \{\}\)/);
});

// ── Les surfaces ────────────────────────────────────────────────────────────

test("formulaire : les trois champs 0074 sont derrière specsEtendues ; cm saisis, mm envoyés", () => {
  const src = readFileSync("components/physical-product-form.tsx", "utf8");
  assert.match(src, /\{specsEtendues && \(/);
  assert.match(src, /lengthMm: longCm\.trim\(\) \? Number\(longCm\) \* 10 : undefined/);
});

test("fiche : le bloc Caractéristiques n'existe que si des specs existent, et seules les lignes renseignées s'affichent", () => {
  const src = readFileSync("app/produit/[slug]/page.tsx", "utf8");
  assert.match(src, /\{physical\?\.specs && \(/);
  assert.match(src, /\{physical\.specs\.brand && \(/);
});

test("la page vendeur physique sonde 0074 au serveur et transmet le verdict", () => {
  const src = readFileSync("app/vendre/physique/page.tsx", "utf8");
  assert.match(src, /specsEtenduesDisponibles\(await createClient\(\)\)/);
  assert.match(src, /specsEtendues=\{specsEtendues\}/);
});
