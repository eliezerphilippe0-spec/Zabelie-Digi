import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Configuration ESLint à plat (Next 16).
 *
 * `next lint` a disparu avec Next 16 : le script `lint` du dépôt rendait
 * « Invalid project directory … /lint » — une erreur qui se lisait comme un
 * échec de lint, alors qu'aucun lint ne tournait, ni ici ni en CI (audit du
 * 2026-09-02, constat #7). Un contrôle qui ne bloque rien est un vœu ; celui-ci
 * bloque le job `build`.
 *
 * ─── CE QUI EST EN `warn`, ET POURQUOI CE N'EST PAS UNE CAPITULATION ────────
 * Trois règles du compilateur React (`react-hooks/set-state-in-effect`,
 * `react-hooks/immutability`, `react-hooks/refs`) signalent 8 sites
 * PRÉEXISTANTS, tous dans du code d'hydratation (thème, langue, statut en
 * ligne, sondage) — exactement le code où une « correction » hâtive casse le
 * rendu serveur. Elles ne décrivent pas un défaut de comportement aujourd'hui.
 * Les passer en `warn` les garde VISIBLES à chaque `npm run lint` sans
 * bloquer la CI sur du code qui marche ; les passer en `off` les ferait
 * disparaître. Chantier à part : `useSyncExternalStore` là où c'est justifié.
 */
const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**", "public/sw.js", "supabase/**"],
  },
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
    },
  },
  {
    // Les tests ré-importent des modules APRÈS avoir changé l'environnement
    // (`config-supabase`, `fixtures-gate`) : `require()` est le seul moyen de
    // forcer une évaluation fraîche en CommonJS. Légitime ici, nulle part
    // ailleurs.
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default config;
