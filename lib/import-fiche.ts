/**
 * IMPORT D'UNE FICHE PAR LIEN — extraction (lot 2, 2026-11-11).
 *
 * Le vendeur colle le lien d'une fiche qu'il a déjà ailleurs ; Zabelie relit ce
 * que la page PUBLIE d'elle-même pour être partagée (Open Graph, données
 * structurées schema.org, balise `<title>`) et préremplit le titre et la
 * description du formulaire. Rien n'est enregistré ici : le vendeur relit,
 * corrige, puis envoie sa fiche à la revue comme toutes les autres.
 *
 * Ce que ce module ne fait PAS, volontairement :
 *
 * * aucune PHOTO n'est reprise. Les conditions exigent des photos du produit
 *   réel du vendeur, sans logo ni marque d'un tiers (`lib/policy-terms.ts`), et
 *   une image copiée d'un fournisseur est exactement ce qu'elles interdisent.
 *   Reprendre des images est une décision du porteur, pas un détail technique ;
 * * aucun PRIX n'est repris. Le prix se saisit en gourdes ; convertir un prix
 *   étranger demanderait un taux de change, paramètre commercial (CLAUDE.md,
 *   règle dure n°3) ;
 * * aucune lecture « astucieuse » : pas de contournement d'une page qui refuse
 *   d'être lue, pas d'interface privée. Une page qui ne publie ni titre ni
 *   métadonnée rend « rien trouvé », et c'est la bonne réponse.
 *
 * Ce fichier est PUR (une chaîne HTML entre, un objet sort) : il se teste sans
 * réseau. La lecture de la page vit dans `lib/import-fiche-serveur.ts`.
 */

export const IMPORT_TITRE_MAX = 140;
export const IMPORT_DESCRIPTION_MAX = 5000;
export const IMPORT_MARQUE_MAX = 80;

export type FicheImportee = {
  titre: string;
  description: string;
  /** Marque déclarée par la page, si elle en déclare une. */
  marque: string | null;
  /** D'où viennent le titre et la description : utile au vendeur pour juger. */
  origine: "donnees_structurees" | "open_graph" | "balises";
};

const ENTITES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", hellip: "…",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ograve: "ò", ocirc: "ô", ugrave: "ù", ucirc: "û",
  ccedil: "ç", icirc: "î", iuml: "ï", euml: "ë", oelig: "œ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—",
  Eacute: "É", Egrave: "È", Agrave: "À", Ccedil: "Ç",
};

/** Décode les entités HTML : nommées courantes, décimales et hexadécimales. */
export function decoderEntites(texte: string): string {
  return texte.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (tout, corps: string) => {
    if (corps[0] === "#") {
      const code = corps[1].toLowerCase() === "x" ? parseInt(corps.slice(2), 16) : parseInt(corps.slice(1), 10);
      // Points de code de contrôle ou hors plage : on ne fabrique pas de caractère.
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return " ";
      return String.fromCodePoint(code);
    }
    return ENTITES[corps] ?? ENTITES[corps.toLowerCase()] ?? tout;
  });
}

/**
 * Du texte, et rien d'autre : balises retirées, entités décodées, blancs
 * ramenés à un espace (les fins de paragraphe gardent un saut de ligne).
 * Le résultat est rendu par React comme du TEXTE ; il n'est jamais du HTML.
 */
export function texteSeul(brut: unknown, max: number): string {
  if (typeof brut !== "string") return "";
  const sansBalises = (t: string) => t
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]{0,2000}>/g, " ");
  /* DEUX passes, et la seconde n'est pas une précaution : une description
   * arrive souvent avec son HTML ÉCHAPPÉ (`&lt;b&gt;…`), dans un attribut ou
   * dans du JSON-LD. Décodée, elle redevient des balises. Mesuré en écrivant
   * le test : une seule passe rendait `<script>alert(1)</script>` en clair. */
  const propre = sansBalises(decoderEntites(sansBalises(brut)))
    // Caractères de contrôle et caractères de FORMAT (marques de direction,
    // espaces de largeur nulle : la catégorie Unicode `Cf`) : jamais dans un
    // titre. Écrits par catégorie et par échappement, jamais en clair :
    // `tests/police-inter` lit tout caractère de ce fichier comme du texte
    // d'interface à dessiner, et un caractère invisible dans le source est un piège.
    .replace(/\p{Cf}/gu, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (propre.length <= max) return propre;
  // Coupe sur un point de code entier : jamais au milieu d'une paire de substitution.
  return Array.from(propre).slice(0, max).join("").trimEnd();
}

/** Attributs d'une balise, en minuscules. Guillemets doubles, simples, ou aucun. */
function attributs(balise: string): Record<string, string> {
  const sortie: Record<string, string> = {};
  for (const m of balise.matchAll(/([a-z][a-z0-9:_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    sortie[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return sortie;
}

/** Contenus des `<meta>` de la page, par `property` ou `name`. Le premier gagne. */
function metas(html: string): Map<string, string> {
  const carte = new Map<string, string>();
  // Borne large : le `content` d'une description peut atteindre la limite du champ.
  for (const m of html.matchAll(/<meta\b[^>]{0,12000}>/gi)) {
    const a = attributs(m[0]);
    const cle = (a.property ?? a.name ?? "").toLowerCase();
    if (cle && a.content !== undefined && !carte.has(cle)) carte.set(cle, a.content);
  }
  return carte;
}

type Noeud = Record<string, unknown>;
const estNoeud = (v: unknown): v is Noeud => typeof v === "object" && v !== null && !Array.isArray(v);

/** Premier objet `Product` trouvé dans les blocs JSON-LD, y compris dans un `@graph`. */
function produitStructure(html: string): Noeud | null {
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    let racine: unknown;
    try { racine = JSON.parse(m[1].trim()); } catch { continue; }
    const file: unknown[] = [racine];
    for (let tours = 0; file.length && tours < 200; tours++) {
      const n = file.shift();
      if (Array.isArray(n)) { file.push(...n.slice(0, 50)); continue; }
      if (!estNoeud(n)) continue;
      const type = n["@type"];
      const types = Array.isArray(type) ? type : [type];
      if (types.some((t) => typeof t === "string" && t.toLowerCase() === "product")) return n;
      if (Array.isArray(n["@graph"])) file.push(...(n["@graph"] as unknown[]).slice(0, 50));
      if (estNoeud(n.mainEntity)) file.push(n.mainEntity);
    }
  }
  return null;
}

function marqueDe(produit: Noeud | null): string | null {
  if (!produit) return null;
  const b = produit.brand;
  const nom = typeof b === "string" ? b : estNoeud(b) && typeof b.name === "string" ? b.name : "";
  return texteSeul(nom, IMPORT_MARQUE_MAX) || null;
}

/**
 * Titre et description d'une page publique. `null` si la page ne publie aucun
 * titre : on n'invente jamais une fiche à partir de rien.
 *
 * Ordre : données structurées `Product` (la source la plus précise), puis Open
 * Graph, puis `<title>` et `<meta name="description">`.
 */
export function extraireFiche(html: string): FicheImportee | null {
  if (typeof html !== "string" || !html) return null;
  const m = metas(html);
  const produit = produitStructure(html);
  const marque = marqueDe(produit);

  const sources: Array<[FicheImportee["origine"], unknown, unknown]> = [
    ["donnees_structurees", produit?.name, produit?.description],
    ["open_graph", m.get("og:title"), m.get("og:description")],
    ["balises", html.match(/<title\b[^>]*>([\s\S]{0,1000}?)<\/title\s*>/i)?.[1], m.get("description")],
  ];
  for (const [origine, t, d] of sources) {
    const titre = texteSeul(t, IMPORT_TITRE_MAX);
    if (!titre) continue;
    // Une source sans description emprunte celle de la source suivante qui en a une.
    const description = texteSeul(d, IMPORT_DESCRIPTION_MAX)
      || sources.map(([, , autre]) => texteSeul(autre, IMPORT_DESCRIPTION_MAX)).find(Boolean)
      || "";
    return { titre, description, marque, origine };
  }
  return null;
}
