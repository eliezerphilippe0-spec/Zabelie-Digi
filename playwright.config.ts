import { defineConfig, devices } from "@playwright/test";

/**
 * Tests E2E ciblés sur le CHEMIN DE L'ARGENT (checkout, redirection MonCash,
 * pages de résultat) et sur le PARCOURS PRODUIT PHYSIQUE. Pas de couverture UI
 * exhaustive — uniquement ce qui te coûterait cher si ça cassait.
 *
 * Deux environnements, parce qu'ils ne peuvent pas cohabiter :
 *   - `chromium` (port 3000) : mode démo, sans Supabase. Les appels backend
 *     sont interceptés par Playwright.
 *   - `physique` (port 3001) : adossé à `e2e/fixtures/stub-supabase.mjs`. Le
 *     mode démo n'a pas de base, donc aucun produit `physical` — or c'est
 *     exactement ce qu'il faut faire traverser le flux.
 *
 * En local, un Chromium complet peut vivre ailleurs que le « headless shell »
 * attendu : `PW_CHROMIUM_PATH=/chemin/vers/chromium npm run test:e2e`.
 */
const executablePath = process.env.PW_CHROMIUM_PATH;
const launchOptions = executablePath ? { executablePath } : undefined;

/**
 * Serveurs JAMAIS recyclés, en local comme en CI.
 *
 * `reuseExistingServer: !CI` a produit un faux vert : une vérification par
 * mutation est passée alors que le garde avait été retiré, parce que le
 * serveur de la série précédente — construit AVANT la modification — avait
 * été réutilisé. Une vérification qui tourne dans des conditions différentes
 * de la CI ne vérifie rien de ce que la CI verra.
 */
const RECYCLER = false;

const STUB_URL = "http://127.0.0.1:54321";
const STUB_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: STUB_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "cle-anon-de-test",
  SUPABASE_SERVICE_ROLE_KEY: "cle-service-de-test",
  PORT: "3001",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { trace: "on-first-retry", launchOptions },
  webServer: [
    {
      command: "npm run start",
      url: "http://localhost:3000",
      reuseExistingServer: RECYCLER,
      timeout: 120_000,
    },
    {
      command: "node e2e/fixtures/stub-supabase.mjs",
      url: `${STUB_URL}/__sante`,
      reuseExistingServer: RECYCLER,
      timeout: 30_000,
    },
    {
      command: "npm run start",
      url: "http://127.0.0.1:3001",
      env: STUB_ENV,
      reuseExistingServer: RECYCLER,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      testIgnore: /parcours-physique/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3000" },
    },
    {
      // ⚠️ CE QUE CE PROJET NE PEUT PAS TESTER — mesuré le 2026-08-01, en
      // essayant d'y ajouter un test des messages d'échec d'inscription.
      //
      // `STUB_ENV` est passé à `npm run START`, donc au RUNTIME. Or
      // `lib/supabase/client.ts` lit `process.env.NEXT_PUBLIC_SUPABASE_URL`,
      // que Next.js **remplace à la compilation** dans le bundle navigateur.
      // Le build a lieu avant, sans ces variables : le client embarque donc
      // `undefined`, `createClient()` lève, et tout composant client tombe en
      // « Mode démo » — constaté dans la capture d'échec de Playwright.
      //
      // Conséquence : ce projet couvre les chemins rendus par le SERVEUR
      // (fiche produit, /mes-achats, route de téléchargement), qui lisent
      // `process.env` à l'exécution. AUCUN comportement client adossé à
      // Supabase n'est atteignable — inscription, connexion, déconnexion.
      // C'est pour ça que le formulaire d'inscription n'a jamais eu de
      // couverture de bout en bout, et pourquoi une panne réelle a dû être
      // diagnostiquée en interrogeant la base.
      //
      // Pour lever la limite il faudrait BUILD avec les variables du stub.
      // Ce n'est pas gratuit : le projet `chromium` (port 3000) repose sur
      // l'absence de configuration Supabase, et le même `.next` sert les
      // deux. Toucher à ça touche au harnais du money-path — à faire
      // délibérément, pas en passant.
      name: "physique",
      testMatch: /parcours-physique/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3001" },
    },
  ],
});
