import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * LES CHAÎNES VISIBLES EN DUR — LE MIROIR QUI MANQUAIT.
 *
 * `tests/i18n-cles-mortes.test.ts` trouve les clés sans écran. Rien ne
 * trouvait les écrans sans clé — et c'est par ce trou que « Légal »,
 * « Confidentialité » (pied de page) et « Avis déposé ✓ » (`mes-achats`) sont
 * restés en français pour un utilisateur kreyòl, entourés de voisines
 * traduites, jusqu'au signalement du porteur le 2026-08-13.
 *
 * ─── LA FORME : UN CLIQUET, PAS UN GEL ──────────────────────────────────────
 * 28 segments en dur existent aujourd'hui (inventaire ci-dessous, MESURÉ).
 * Les traduire tous est un chantier ; les geler tous serait mentir. Le test
 * fait donc les deux choses qu'un inventaire honnête sait faire :
 *
 *   • un segment NOUVEAU apparaît → rouge. La dette ne grandit plus.
 *   • un segment listé DISPARAÎT → rouge aussi : l'inventaire doit être
 *     décrémenté dans le même geste. C'est la péremption dans les deux sens
 *     (`CLAUDE.md`) — une liste qui ne sait que grandir devient une
 *     conformité par usure, une liste qui se vide sans témoin ne prouve pas
 *     le progrès.
 *
 * ⚠️ 29 → 28 le 2026-08-22. « Confidentialité » d'`app/aide` est passée à
 * `t(lang, "footer.privacy")` — la clé existait DÉJÀ dans les quatre langues,
 * elle n'attendait qu'un appelant. Elle n'a pas été trouvée en cherchant du
 * français : elle est tombée en élargissant les cibles tactiles de cette même
 * colonne de liens, pour la vue mobile. C'est la seconde moitié du cliquet qui
 * l'a fait compter — sans elle, le progrès serait passé inaperçu.
 *
 * ─── CE QUE LE SCANNER NE VOIT PAS, ET C'EST ÉCRIT ──────────────────────────
 * Il lit les NŒUDS DE TEXTE JSX (`>texte<`), après retrait des expressions
 * `{…}`. Un littéral français DANS une expression — `{cond ? "Déjà réglé" :
 * …}` — lui échappe, comme les chaînes sans lettre accentuée (« Menu »).
 * C'est la classe qui a réellement mordu qui est couverte ; le reste relève
 * du chantier de traduction, pas d'un garde.
 *
 * Périmètre : `app/` et `components/`, MOINS `app/admin` (français assumé,
 * outil interne), `app/sw-desinstaller` (français délibéré — page de
 * dépannage qui ne doit dépendre de rien, voir son en-tête) et `app/api`
 * (pas de JSX).
 */

const RACINES = ["app", "components"];
const EXCLUS = /app\/(admin|sw-desinstaller|api)(\/|$)/;

function fichiersTsx(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) {
      if (!EXCLUS.test(f) && e !== "node_modules") fichiersTsx(f, out);
    } else if (/\.tsx$/.test(e)) out.push(f);
  }
  return out;
}

/** Segments de texte JSX accentués, normalisés et tronqués à 48 caractères. */
export function segmentsEnDur(src: string): string[] {
  let s = src;
  // Trois passes suffisent aux imbrications simples ; les commentaires
  // `{/* … */}` et le code partent avec les expressions.
  for (let i = 0; i < 3; i++) s = s.replace(/\{[^{}]*\}/g, " ");
  const re = />([^<>{}]*[àâäéèêëîïôöùûüçÀÂÉÈÊËÎÏÔÙÛÇ][^<>{}]*)</g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const t = m[1].replace(/\s+/g, " ").trim();
    if (!t) continue;
    // Résidus de code — jamais du texte visible.
    if (/=>|===|\/\*|\/\/|useState|const |[?] \(|\) :|`/.test(t)) continue;
    out.push(t.slice(0, 48));
  }
  return out.sort();
}

/**
 * L'INVENTAIRE — mesuré le 2026-08-13, jamais édité « de tête ».
 *
 * Pour DÉCRÉMENTER (une chaîne traduite) : retirer sa ligne ici, dans le même
 * commit que la traduction. Pour AJOUTER : ne pas. Traduire à la place.
 */
const INVENTAIRE: Record<string, string[]> = {
  "app/opengraph-image.tsx": [
    "La marketplace haïtienne — payez avec MonCash",
    "Machandiz, sèvis ak pwodui dijital",
  ],
  "app/produit/[slug]/page.tsx": [
    "Vérifiez votre modèle avant d&apos;acheter. En c",
  ],
  "app/tableau-de-bord/page.tsx": [
    "(fenêtre anti-fraude / remboursement).",
    "Chaque vente confirmée est créditée",
    "Mes données &amp; mon compte",
    "Téléchargez une copie de vos données ou supprime",
    // « Ventes récentes » traduite le 2026-09-02 (dashboard.sales.recent),
    // trouvée par le premier passage ESLint du dépôt.
    "politique de confidentialité",
  ],
  "components/account-actions.tsx": ["Exporter mes données"],
  "components/geo-map.tsx": [
    "Données agrégées par pays. Aucune position indiv",
  ],
  "components/haiti-map.tsx": [
    "Intensité = nombre de talents (créateurs) par dé",
  ],
  // `components/hero-visual.tsx` supprimé le 2026-09-02 (audit UX #9) :
  // composant jamais rendu, faux écran produit, trois chaînes en dur.
  "components/payout-form.tsx": [
    "Espèces",
    "Montant versé (HTG)",
    "Obligatoire : c&apos;est la preuve du règlement ",
    "Règlement déjà versé à",
    "Référence du reçu",
  ],
  "components/payout-queue.tsx": [
    "Demandé le",
    "Espèces",
    "Le montant est déjà réservé sur le solde du vend",
  ],
  "components/physical-product-form.tsx": [
    "Catégorie",
    "Compatibilité véhicule",
    "Modèle…",
    "Quantité en stock",
    "Une pièce sans compatibilité est presque invenda",
  ],
};

// ── Le scanner lui-même, éprouvé AVANT qu'on lui fasse confiance ────────────
// (règle du dépôt : connu-positif ET connu-négatif — un instrument qui n'a
// jamais échoué n'a pas encore démontré qu'il pouvait.)

test("scanner — connu-POSITIF : un nœud de texte accenté est vu", () => {
  assert.deepEqual(
    segmentsEnDur(`<p className="x">Déjà réglé</p>`),
    ["Déjà réglé"],
  );
});

test("scanner — connu-NÉGATIF : clés i18n, commentaires et code sont ignorés", () => {
  const src = `
    <p>{t(lang, "footer.legal")}</p>
    {/* un commentaire avec des accents : déjà, réglé */}
    <span>{items.length > 0 ? aide : rien}</span>
    <p>No accents here</p>
  `;
  assert.deepEqual(segmentsEnDur(src), []);
});

test("scanner — la limite documentée est réelle : un littéral DANS une expression échappe", () => {
  // Ce cas est HORS périmètre, et ce test existe pour que la limite reste
  // écrite et mesurée plutôt que découverte. S'il se met à échouer, c'est que
  // le scanner a gagné en portée — mettre l'en-tête à jour.
  assert.deepEqual(segmentsEnDur(`<span>{ok ? "Déjà réglé" : autre}</span>`), []);
});

// ── Le cliquet ──────────────────────────────────────────────────────────────

test("aucune chaîne visible en dur nouvelle, aucun progrès non enregistré", () => {
  const reel: Record<string, string[]> = {};
  for (const racine of RACINES) {
    for (const f of fichiersTsx(racine)) {
      const seg = segmentsEnDur(readFileSync(f, "utf8"));
      if (seg.length) reel[f] = seg;
    }
  }

  const problemes: string[] = [];
  const fichiers = new Set([...Object.keys(reel), ...Object.keys(INVENTAIRE)]);
  for (const f of fichiers) {
    const mesure = reel[f] ?? [];
    const attendu = INVENTAIRE[f] ?? [];
    for (const s of mesure) {
      if (!attendu.includes(s)) {
        problemes.push(
          `NOUVELLE chaîne en dur — ${f} : « ${s} ». La traduire (lib/i18n.ts), pas l'inventorier.`,
        );
      }
    }
    for (const s of attendu) {
      if (!mesure.includes(s)) {
        problemes.push(
          `PROGRÈS non enregistré — ${f} : « ${s} » a disparu. Retirer sa ligne de l'INVENTAIRE dans ce même commit.`,
        );
      }
    }
  }
  assert.deepEqual(problemes, [], `\n${problemes.join("\n")}`);
});
