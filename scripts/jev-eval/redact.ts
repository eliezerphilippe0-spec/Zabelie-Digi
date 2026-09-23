/**
 * Minimisation AVANT tout envoi à Jev (invariant 4, esprit BRH BL-115).
 *
 * `redactPayment()` (lib/moncash.ts:512) ne s'applique pas : il retire un
 * champ d'un OBJET MonCash, il ne lit pas de texte libre. Aucun masquage de
 * texte n'existait dans le dépôt (docs/61 §2) — d'où ce module.
 *
 * Le client (`jev-client.ts`) REFUSE tout état qui n'est pas sorti d'ici : le
 * résultat est inscrit dans un registre privé à ce module, vérifié à
 * l'exécution, pas seulement par le type. Une chaîne brute ne peut pas partir,
 * ni une copie retouchée d'un objet redacté.
 *
 * ─── CE QUI EST MASQUÉ ──────────────────────────────────────────────────────
 *   [IMEL]    adresse courriel
 *   [LYEN]    URL (un lien de facture ou de commande porte un jeton)
 *   [ID]      UUID (identifiant de commande, de compte)
 *   [KOMAND]  numéro de commande complet, format ZB-YYMMDD-XXXXX (0042:32)
 *   [NIMEWO]  toute suite d'au moins 7 chiffres, séparateurs espace/point/tiret
 *             admis : téléphone (+509 3737-6615), transaction MonCash
 *   [NON]     nom propre après une formule de présentation
 *
 * ─── CE QUI NE L'EST PAS, ET DOIT ÊTRE DIT ──────────────────────────────────
 * Un nom propre cité hors formule de présentation (« Jan te di m… ») PASSE.
 * Aucun motif ne retire les noms de façon fiable ; le jeu doit donc arriver
 * déjà anonymisé, et ce module est une seconde ligne, pas la première.
 * Faux positif assumé : un montant de 7 chiffres ou plus (« 1 500 000 goud »)
 * est masqué — un montant de cette taille est rare, une fuite de numéro ne
 * l'est pas.
 */
// Registre des objets RÉELLEMENT émis par `redactForJev`. Une marque symbolique
// ne suffit pas, mesuré : `{ ...redactForJev("x"), text: brut }` copie le
// symbole avec le spread et laissait partir un texte brut. Un objet copié
// n'est jamais dans ce registre.
const ISSUED = new WeakSet<object>();
declare const BRAND: unique symbol;

export type RedactionKind = "imel" | "lyen" | "id" | "komand" | "nimewo" | "non";
export type Redacted = {
  readonly text: string;
  readonly counts: Readonly<Record<RedactionKind, number>>;
  readonly [BRAND]: true;
};

const L = "\\p{L}";
// Formules sans ambiguïté : le mot suivant est un nom, quelle que soit sa casse.
const INTRO_SURE = new RegExp(
  `(?<![${L}])(non (?:mwen|m) se|je m['’]appelle|my name is|me llamo)\\s+([${L}][${L}'’-]*(?:\\s+[${L}][${L}'’-]*)?)`,
  "giu",
);
// « rele » veut aussi dire « appeler » (« m rele sèvis la ») : on n'y masque
// qu'un mot à majuscule initiale. Pas de drapeau `i` sur le nom : sous `iu`,
// \p{Lu} accepterait aussi les minuscules.
const INTRO_RELE = new RegExp(
  `(?<![${L}])((?:[Mm]wen|[Mm]) [Rr]ele)\\s+(\\p{Lu}[${L}'’-]*(?:\\s+\\p{Lu}[${L}'’-]*)?)`,
  "gu",
);

const RULES: [RedactionKind, RegExp, string][] = [
  ["imel", /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, "[IMEL]"],
  ["lyen", /\b(?:https?:\/\/|www\.)[^\s]+/giu, "[LYEN]"],
  ["id", /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, "[ID]"],
  ["komand", /\bZB[-\s]?\d{6}[-\s]?[2-9A-Z]{5}\b/giu, "[KOMAND]"],
  ["nimewo", /\+?\d(?:[\s.-]?\d){6,}/gu, "[NIMEWO]"],
];

export function redactForJev(raw: string): Redacted {
  const counts: Record<RedactionKind, number> = { imel: 0, lyen: 0, id: 0, komand: 0, nimewo: 0, non: 0 };
  let text = raw.normalize("NFC");
  for (const [kind, re, token] of RULES) {
    text = text.replace(re, () => { counts[kind]++; return token; });
  }
  for (const re of [INTRO_SURE, INTRO_RELE]) {
    text = text.replace(re, (_m, intro: string) => { counts.non++; return `${intro} [NON]`; });
  }
  const result = Object.freeze({ text, counts: Object.freeze(counts) }) as Redacted;
  ISSUED.add(result);
  return result;
}

/** Vérifié à l'exécution par le client : un objet forgé à la main échoue. */
export function isRedacted(value: unknown): value is Redacted {
  return typeof value === "object" && value !== null && ISSUED.has(value);
}
