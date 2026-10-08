import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * ACCESSIBILITÉ — axe-core sur les pages publiques clés, à chaque CI.
 *
 * Mesuré le 2026-10-08 sur les 25 pages ci-dessous, à 360 et 1280 px, en
 * thème clair et sombre : zéro violation WCAG 2.2 AA, sauf les trois blocs de
 * code défilants de `/developpeurs` à 360 px (inatteignables au clavier),
 * corrigés dans le même lot. Ce garde empêche le compte de remonter : une page
 * qui gagne une violation rougit ici, avec la règle et l'élément en cause.
 *
 * ⚠️ L'instrument est éprouvé à CHAQUE passage (dernier test) : une violation
 * connue, injectée dans une vraie page, doit être vue. Sans ça, un axe absent
 * ou mal chargé rendrait « 0 » partout — et ce zéro se lirait comme un succès.
 *
 * axe est injecté par `page.evaluate` (protocole du navigateur), donc hors de
 * la CSP stricte du site, que ce garde n'a pas à affaiblir.
 */

const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const NORMES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Pages publiques : le parcours d'achat, la vente, la confiance — en français et en kreyòl. */
const PAGES = [
  "/",
  "/catalogue",
  "/categories",
  "/produit/pack-presets-lightroom-afro",
  "/panier",
  "/connexion",
  "/mot-de-passe-oublie",
  "/vendre",
  "/vendre/physique",
  "/assistant",
  "/recharges",
  "/hors-ligne",
  "/aide",
  "/a-propos",
  "/securite",
  "/pro",
  "/conditions",
  "/confidentialite",
  "/produits-interdits",
  "/developpeurs",
  "/ht",
  "/ht/catalogue",
  "/ht/produit/pack-presets-lightroom-afro",
  "/ht/vendre",
  "/ht/developpeurs",
];

const RENDUS = [
  { largeur: 360, theme: "light" },
  { largeur: 360, theme: "dark" },
  { largeur: 1280, theme: "light" },
  { largeur: 1280, theme: "dark" },
] as const;

type Violation = { id: string; impact: string | null; nodes: { target: string[] }[] };

async function violations(page: Page): Promise<string[]> {
  await page.evaluate(AXE);
  return page.evaluate(async (normes) => {
    const axe = (window as unknown as {
      axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: Violation[] }> };
    }).axe;
    const r = await axe.run(document, { runOnly: { type: "tag", values: normes } });
    return r.violations.map(
      (v) => `${v.id} (${v.impact}) : ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`
    );
  }, NORMES);
}

async function ouvrir(page: Page, chemin: string, largeur: number, theme: string) {
  await page.context().addCookies([{ name: "zab_theme", value: theme, url: test.info().project.use.baseURL! }]);
  await page.setViewportSize({ width: largeur, height: 900 });
  const rep = await page.goto(chemin, { waitUntil: "networkidle" });
  expect(rep?.status(), `${chemin} doit répondre`).toBe(200);
  // Le thème demandé est celui rendu : sinon le passage « sombre » mesurerait le clair.
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

for (const chemin of PAGES) {
  for (const { largeur, theme } of RENDUS) {
    test(`a11y ${chemin} — ${largeur} px, ${theme}`, async ({ page }) => {
      await ouvrir(page, chemin, largeur, theme);
      expect(await violations(page), `violations WCAG 2.2 AA sur ${chemin}`).toEqual([]);
    });
  }
}

test("l'instrument voit une violation connue — sinon ses zéros ne prouvent rien", async ({ page }) => {
  await ouvrir(page, "/", 360, "light");
  await page.evaluate(() => {
    const img = document.createElement("img");
    img.src = "/icon.svg";
    document.querySelector("main")!.prepend(img);
  });
  const vues = await violations(page);
  expect(vues.some((v) => v.startsWith("image-alt ")), vues.join("\n")).toBe(true);
});
