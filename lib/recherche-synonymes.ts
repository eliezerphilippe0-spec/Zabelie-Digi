/**
 * SYNONYMES KREYÒL ↔ FRANÇAIS DANS LA RECHERCHE — audit `docs/69` (lot 1).
 *
 * Mesuré le 2026-10-14 sur zabelie.com : chercher « soulye » ne trouve jamais
 * une fiche intitulée « Chaussures en cuir », et l'inverse non plus. Le
 * rattrapage trigramme (`zabelie_search_fuzzy`, 0047) corrige une ORTHOGRAPHE
 * (« batery » → « Batri ») ; il ne peut pas relier deux MOTS différents. Or le
 * cas est la règle en Haïti : le vendeur écrit sa fiche en français, l'acheteur
 * cherche en kreyòl, ou l'inverse. Etsy traduit les requêtes ; ici, un
 * dictionnaire suffit, sans base, sans dépendance, sans appel réseau.
 *
 * ─── COMMENT ─────────────────────────────────────────────────────────────────
 * `variantesRecherche(q)` rend la requête d'origine, puis des variantes où UN
 * mot est remplacé par un équivalent de son groupe. Le catalogue en fait des
 * clauses `ilike` de plus dans le même `or(...)` : une seule requête, comme
 * avant. Le capteur de demande n'enregistre un manque que si rien n'a été
 * trouvé, synonymes compris : on n'ira pas recruter un vendeur de « soulye »
 * quand trois boutiques vendent des chaussures.
 *
 * ─── TROIS RÈGLES, CHACUNE GARDÉE PAR `tests/recherche-synonymes.test.ts` ──
 * 1. AUCUN MOT DE MOINS DE 4 LETTRES N'EST INJECTÉ. La recherche est une
 *    sous-chaîne (`ilike '%…%'`) : « rad » trouverait « radio », « riz »
 *    « horizon ». Un mot court peut être une CLÉ (on le reconnaît dans la
 *    requête), jamais une variante injectée. D'où `MIN_VARIANTE`.
 * 2. UN MOT N'APPARTIENT QU'À UN GROUPE. « tablèt » est à la fois la tablette
 *    électronique et la friandise à l'arachide : un mot ambigu n'entre dans
 *    AUCUN groupe plutôt que dans le mauvais.
 * 3. LE NOMBRE DE VARIANTES EST BORNÉ (`MAX_VARIANTES`). Une requête de six
 *    mots ne doit pas produire soixante clauses sur un réseau 3G.
 *
 * Accents : la reconnaissance d'un mot ignore les accents (« telefon » =
 * « telefòn »), mais `ilike` ne les ignore pas ; les groupes portent donc les
 * deux graphies quand les deux s'écrivent (« téléphone », « telephone »).
 * Les pluriels viennent seuls : « chaussure » trouve « chaussures ».
 *
 * ⚠️ Le kreyòl de ce dictionnaire suit l'orthographe standard et reste à faire
 * relire par un locuteur natif, comme `lib/i18n.ts`. Ajouter un groupe : une
 * ligne ici ; le test vérifie les trois règles.
 */

export const MIN_VARIANTE = 4;
export const MAX_VARIANTES = 12;

/** Groupes d'équivalents : objets, alimentation, beauté, maison, services, numérique. */
export const GROUPES_SYNONYMES: readonly (readonly string[])[] = [
  // Habillement et accessoires
  ["soulye", "chaussure", "soulier"],
  ["sapat", "sandale", "pantoufle"],
  ["vètman", "vêtement", "vetement"],
  ["wòb", "robe"],
  ["chemiz", "chemise"],
  ["jip", "jupe"],
  ["chapo", "chapeau"],
  ["sakado", "sac à dos", "sac a dos"],
  ["valiz", "valise"],
  ["bijou", "bijoux"],
  ["zanno", "boucle d'oreille", "boucles d'oreilles"],
  ["kolye", "collier"],
  ["brasle", "bracelet"],
  // Électronique et énergie
  ["telefòn", "telefon", "téléphone", "telephone", "selilè", "cellulaire", "smartphone"],
  ["chajè", "chargeur", "charger"],
  ["batri", "batterie", "battery"],
  ["òdinatè", "ordinateur", "laptop", "konpitè"],
  ["televizyon", "télévision", "television", "téléviseur"],
  ["radyo", "radio"],
  ["ekoutè", "écouteur", "ecouteur"],
  ["panno solè", "panneau solaire", "panel solaire"],
  ["envètè", "onduleur", "inverter"],
  ["dèlko", "delko", "génératrice", "generatrice", "générateur", "generateur"],
  // Alimentation
  ["gato", "gâteau", "gateau"],
  ["kafe", "café", "cafe"],
  ["chokola", "chocolat"],
  ["manba", "beurre d'arachide", "beurre de cacahuète"],
  ["konfiti", "confiture"],
  // Beauté
  ["cheve", "cheveux"],
  ["perik", "perruque"],
  ["makiyaj", "maquillage"],
  ["pafen", "parfum"],
  ["lwil", "huile"],
  ["krèm", "crème", "creme"],
  ["zong", "ongle"],
  // Maison et enfants
  ["meb", "mèb", "meuble"],
  ["matla", "matelas"],
  ["timoun", "enfant"],
  ["jwèt", "jouet"],
  ["bebe", "bébé"],
  // Services
  ["koutiryè", "koutiryèz", "couturier", "couturière", "couturiere", "tayè", "tailleur"],
  ["kwafè", "kwafèz", "coiffeur", "coiffeuse", "coiffure"],
  ["mason", "maçon", "macon"],
  ["elektrisyen", "électricien", "electricien"],
  ["plonbye", "plombier"],
  ["mekanisyen", "mécanicien", "mecanicien"],
  ["chofè", "chauffeur"],
  ["fotograf", "photographe"],
  ["pwofesè", "professeur"],
  // Pas « cours » : en sous-chaîne, il trouverait « parcours » et « concours ».
  ["leson", "leçon", "lecon"],
  ["fòmasyon", "formation"],
  ["tradiksyon", "traduction"],
  ["reparasyon", "réparation", "reparation"],
  ["netwayaj", "nettoyage"],
  // Numérique
  ["liv", "livre", "ebook"],
  ["mizik", "musique"],
  ["videyo", "vidéo", "video"],
  ["modèl", "modèle", "modele", "template"],
  ["sitwèb", "site web", "site internet"],
];

/** Minuscules sans accents ni ponctuation de bord : la clé de reconnaissance. */
export function cleMot(mot: string): string {
  return mot
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** Clé normalisée → groupe. Construit une fois. */
const INDEX: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, readonly string[]>();
  for (const g of GROUPES_SYNONYMES) for (const mot of g) m.set(cleMot(mot), g);
  return m;
})();

/**
 * Le groupe d'un mot, ou de son singulier : « chaussures » est reconnu par
 * « chaussure », « gâteaux » par « gâteau ». Le pluriel n'a pas besoin d'être
 * INJECTÉ (la sous-chaîne le trouve), mais il doit être RECONNU dans la requête.
 */
function groupeDe(cle: string): readonly string[] | undefined {
  return INDEX.get(cle) ?? (/[sx]$/.test(cle) ? INDEX.get(cle.slice(0, -1)) : undefined);
}

/**
 * La requête d'origine d'abord, puis les variantes à UN mot remplacé, puis à
 * expression entière remplacée (« panneau solaire »). Sans doublon, bornée.
 */
export function variantesRecherche(q: string): string[] {
  const origine = q.trim().replace(/\s+/g, " ");
  if (!origine) return [];
  const sortie: string[] = [origine];
  const vues = new Set([cleMot(origine)]);
  const ajouter = (v: string) => {
    const k = cleMot(v);
    if (sortie.length >= MAX_VARIANTES || vues.has(k)) return;
    vues.add(k);
    sortie.push(v);
  };
  const equivalents = (cle: string) => {
    const groupe = groupeDe(cle);
    return (groupe ?? []).filter((m) => cleMot(m) !== cle && m.length >= MIN_VARIANTE);
  };

  // La requête entière est une expression connue (« sac à dos », « dèlko »).
  for (const m of equivalents(cleMot(origine))) ajouter(m);

  // Un mot à la fois.
  const mots = origine.split(" ");
  if (mots.length > 1) {
    mots.forEach((mot, i) => {
      for (const m of equivalents(cleMot(mot))) {
        ajouter([...mots.slice(0, i), m, ...mots.slice(i + 1)].join(" "));
      }
    });
  }
  return sortie;
}

/**
 * Clauses `ilike` d'une recherche pour `or(...)` de PostgREST : la requête,
 * puis ses variantes. Chaque variante est nettoyée comme la requête l'était
 * déjà dans `lib/products.ts` : `%`, `,` et parenthèses casseraient la syntaxe.
 */
export function clausesRecherche(q: string): string[] {
  return variantesRecherche(q)
    .map((v) => v.replace(/[%,()]/g, " ").trim())
    .filter(Boolean)
    .flatMap((v) => [`title.ilike.%${v}%`, `description.ilike.%${v}%`]);
}
