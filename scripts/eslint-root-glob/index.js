// Point d'entrée CommonJS chargé par require() depuis le plugin Next.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Interop synchrone du plugin tiers.
const { isAbsolute, parse, posix, relative, resolve } = require("node:path");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Interop synchrone du plugin tiers.
const { readdirSync, realpathSync, statSync } = require("node:fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Même moteur de motifs que tinyglobby.
const picomatch = require("picomatch");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Interop synchrone du plugin tiers.
const { globSync: findDirectories } = require("tinyglobby");

// Contrat CommonJS étroit de get-root-dirs dans @next/eslint-plugin-next 16.4.3 (dist identique à 16.4.2, vérifié le 2026-10-27).
// Ce module n'est pas une réimplémentation générale de fast-glob.
function globSync(pattern, options = {}) {
  if (typeof pattern !== "string" || pattern.length === 0) {
    throw new TypeError("La racine ESLint Next doit être un motif textuel.");
  }

  // tinyglobby ne reproduit pas toutes les plages numériques de braces.
  // Refuser ces configurations plutôt que perdre silencieusement des racines.
  let depth = 0;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "{") depth++;
    else if (pattern[i] === "}") depth = Math.max(0, depth - 1);
    else if (depth > 0 && pattern[i] === "." && pattern[i + 1] === ".") {
      throw new TypeError("Les plages d'accolades ne sont pas prises en charge pour les racines ESLint Next ; utiliser des chemins ou alternances explicites.");
    }
  }

  // fast-glob conserve la forme des chemins littéraux (notamment ./ et C:/).
  // Une simple stat évite aussi de parcourir toute une racine de disque.
  // Une accolade littérale peut précéder un vrai glob : examiner tout le motif.
  const scanned = picomatch.scan(pattern, { scanToEnd: true });
  if (!scanned.isGlob && !scanned.negated) {
    try {
      return statSync(pattern).isDirectory() ? [pattern] : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  const absolute = options.absolute ?? isAbsolute(pattern);
  const cwd = resolve(options.cwd || process.cwd());
  const links = [];
  let failure;
  // fdir masque les erreurs de lecture par défaut. Conserver le contrat de
  // fast-glob : seul ENOENT est ignoré, jamais un accès refusé ou une erreur IO.
  const observe = (operation) => (...args) => {
    try {
      return operation(...args);
    } catch (error) {
      if (error.code !== "ENOENT") failure ??= error;
      throw error;
    }
  };
  const readRealpath = observe(realpathSync);
  const readStat = observe(statSync);
  const paths = findDirectories(pattern, {
    ...options,
    absolute,
    expandDirectories: false,
    // fdir suit les liens mais omet le dossier lié lui-même. Observer leur
    // résolution conserve ses protections de parcours et son contrôle des cycles.
    fs: {
      readdirSync: observe(readdirSync),
      statSync: readStat,
      realpathSync(path) {
        const target = readRealpath(path);
        if (readStat(target).isDirectory()) {
          links.push((absolute ? path : relative(cwd, path)).replace(/\\/g, "/"));
        }
        return target;
      },
    },
  });
  if (failure) throw failure;
  const withoutDirectoryMark = (path) => path.endsWith("/") && path !== parse(path).root.replace(/\\/g, "/") ? path.slice(0, -1) : path;
  const matches = picomatch(withoutDirectoryMark(posix.normalize(pattern)), { dot: false, nonegate: true, posix: true });
  const roots = paths.map(withoutDirectoryMark);
  // Le plugin appelle chaque motif séparément : un motif négatif seul ne
  // sélectionne rien, il ne retire pas les résultats d'un appel précédent.
  if (!pattern.startsWith("!") || pattern.startsWith("!(")) roots.push(...links.filter((link) => matches(link)));
  return [...new Set(roots)];
}

module.exports = { globSync };
