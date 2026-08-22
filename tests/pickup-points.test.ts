import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { refus } from "./refus-forme";

/** Points de retrait (docs/37, 0082) — ce qui doit rester vrai. */

const MIG = readFileSync("supabase/migrations/0082_pickup_points.sql", "utf8");
const ROUTE = readFileSync("app/api/admin/pickup-points/route.ts", "utf8");
const PAGE = readFileSync("app/admin/points-retrait/page.tsx", "utf8");

test("0082 : l'acheteur ne voit que les points OUVERTS, l'écriture est fermée", () => {
  // La condition qui commande : la policy de lecture porte `actif`.
  assert.match(MIG, /for select using \(actif\)/);
  // Redit en post-condition — une policy d'écriture ajoutée « pour dépanner »
  // casserait l'application.
  assert.match(MIG, /cmd in \('INSERT','UPDATE','DELETE'\)[\s\S]{0,150}raise exception/);
  assert.match(MIG, /qual = 'actif'[\s\S]{0,180}raise exception/);
});

test("0082 : un point naît FERMÉ — l'ouverture est un acte, pas un défaut", () => {
  assert.match(MIG, /actif\s+boolean not null default false/);
});

test("route admin : gardée par le rôle, chaque acte journalisé (0055)", () => {
  assert.match(ROUTE, new RegExp(`me\\.role !== "admin"[\\s\\S]{0,160}${refus(401)}`));
  assert.match(ROUTE, /journaliserActeAdmin\(/);
});

test("la page admin monte le composant — un répertoire sans porte n'existe pas", () => {
  assert.match(PAGE, /<PickupAdmin \/>/);
  const menu = readFileSync("components/admin/menu-badges.tsx", "utf8");
  assert.match(menu, /href: "\/admin\/points-retrait"/);
});
