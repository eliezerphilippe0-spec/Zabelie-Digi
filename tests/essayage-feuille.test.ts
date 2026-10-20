import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { VERSION_CONSENTEMENT } from "../lib/essayage/photo-locale";
import { libellesEssayage } from "../lib/essayage/libelles";
import { LANGS } from "../lib/i18n";

/**
 * ESSAYAGE VIRTUEL — la feuille (tâche 4.4). Tests de source : sans DOM ici,
 * le parcours réel (consentement, photo, attente, résultat, effacement) est
 * joué dans un vrai navigateur par l'e2e (tâche 4.5).
 */

/** Commentaires JSX, puis blocs et lignes qui OUVRENT une ligne : `accept="image/*"` n'est pas un commentaire. */
const sansCommentaires = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/^\s*\/\*[\s\S]*?\*\//gm, " ").replace(/^\s*\/\/[^\n]*/gm, " ");
const FEUILLE = sansCommentaires(readFileSync("components/essayage-feuille.tsx", "utf8"));
const LOCALE = sansCommentaires(readFileSync("lib/essayage/photo-locale.ts", "utf8"));

/** Le bloc JSX rendu pour une étape, de son `{etape === "…" &&` jusqu'à l'étape suivante. */
function bloc(etape: string): string {
  const debut = FEUILLE.indexOf(`{etape === "${etape}"`);
  assert.ok(debut > 0, etape);
  const suite = FEUILLE.indexOf("{etape === ", debut + 10);
  return FEUILLE.slice(debut, suite > 0 ? suite : undefined);
}

test("FE1 — sans consentement, aucun champ photo : les entrées de fichier n'existent qu'à l'étape « photo »", () => {
  assert.equal(FEUILLE.match(/type="file"/g)?.length, 2);
  assert.equal(bloc("photo").match(/type="file"/g)?.length, 2);
  assert.doesNotMatch(bloc("consentement"), /type="file"|essayer\(/);
  assert.match(FEUILLE, /useState<Etape>\(\(\) => \(consentementDonne\(\) \? "photo" : "consentement"\)\)/);
  assert.match(bloc("consentement"), /onClick=\{\(\) => \{ donnerConsentement\(\); setEtape\("photo"\); \}\}/);
});

test("FE2 — le consentement est versionné et gardé sur l'appareil seulement", () => {
  assert.match(VERSION_CONSENTEMENT, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(LOCALE, /localStorage\.getItem\(CLE_CONSENTEMENT\) === VERSION_CONSENTEMENT/);
  assert.doesNotMatch(LOCALE, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("FE3 — « Garder ma photo » est décoché par défaut ; la photo n'est gardée que si la case est cochée", () => {
  assert.match(FEUILLE, /const \[garder, setGarder\] = useState\(false\);/);
  assert.equal(FEUILLE.match(/garderPhoto\(/g)?.length, 1);
  assert.match(FEUILLE, /if \(garder && envoi !== gardee\?\.blob\) await garderPhoto\(envoi\);/);
});

test("FE4 — la photo gardée n'est envoyée qu'au clic « Essayer avec cette photo », et l'effacement la retire de l'appareil", () => {
  // Lue pour l'aperçu (adresse blob: locale), envoyée seulement par `essayer(gardee)`.
  assert.equal(FEUILLE.match(/essayer\(gardee/g)?.length, 1);
  assert.match(bloc("photo"), /onClick=\{\(\) => void essayer\(gardee\.blob\)\}>\{labels\.utiliser\}/);
  assert.match(FEUILLE, /url = URL\.createObjectURL\(b\);/);
  assert.match(FEUILLE, /if \(url\) URL\.revokeObjectURL\(url\);/);
  assert.match(LOCALE, /m\.delete\(CLE_PHOTO\)/);
  assert.match(FEUILLE, /await effacerPhoto\(\);\s*if \(gardee\) URL\.revokeObjectURL\(gardee\.url\);\s*setGardee\(null\);/);
});

test("FE5 — compression sur l'appareil à 1 024 px, envoi multipart par la porte des appels authentifiés", () => {
  assert.match(FEUILLE, /const COTE_MAX = 1024;/);
  assert.match(FEUILLE, /compresserImage\(photo, \{ maxCote: COTE_MAX \}\)/);
  assert.match(FEUILLE, /appelAvecSession<\{ essai: string \}>\("\/api\/essayage", \{ method: "POST", body: form \}\)/);
  assert.doesNotMatch(FEUILLE, /\bfetch\(/, "aucun appel réseau hors de la porte");
});

test("FE6 — attente : un sondage toutes les 2 s, borné ; le résultat porte la mention IA et « Ajouter au panier »", () => {
  assert.match(FEUILLE, /const INTERVALLE_MS = 2_000;/);
  assert.match(FEUILLE, /const ATTENTE_MAX_MS = 66_000;/);
  assert.match(FEUILLE, /while \(ouverte\.current && Date\.now\(\) < fin\)/);
  const resultat = bloc("resultat");
  assert.match(resultat, /<img src=\{image\} alt=\{labels\.resultatAlt\}/);
  assert.match(resultat, /\{labels\.mention\}/);
  assert.match(resultat, /<AddToCart productId=\{produitId\} labels=\{panier\} \/>/);
  assert.match(bloc("attente"), /role="status" aria-live="polite"/);
});

test("FE7 — rien n'est écrit ni journalisé : ni console, ni stockage du résultat", () => {
  assert.doesNotMatch(FEUILLE, /console\./);
  assert.doesNotMatch(FEUILLE, /localStorage|sessionStorage/, "seul photo-locale touche au stockage");
  assert.doesNotMatch(LOCALE, /resultat|image\b/i, "le résultat n'est jamais gardé");
});

test("FE8 — 44 px : chaque bouton et chaque libellé cliquable a min-h-11", () => {
  assert.match(FEUILLE, /const bouton = "inline-flex min-h-11 /);
  const ouvertures = [...FEUILLE.matchAll(/<(button|label|Link)\b/g)];
  assert.ok(ouvertures.length >= 10, "les cibles sont lues");
  for (const o of ouvertures) {
    const balise = FEUILLE.slice(o.index, o.index + 400);
    assert.match(balise, /className=(\{`?\$?\{?(principal|secondaire)|"[^"]*min-h-11)/, balise.slice(0, 80));
  }
});

test("FE10 — quota, plafond, pause ou fiche non éligible : « Fermer » au lieu de « Réessayer », qui échouerait encore", () => {
  assert.match(FEUILLE, /const REFUS_DEFINITIFS = \["quota", "plafond", "pause", "non_eligible"\];/);
  assert.match(FEUILLE, /return echouer\(issue\.error, REFUS_DEFINITIFS\.includes\(issue\.code \?\? ""\)\);/);
  assert.match(bloc("erreur"), /\{definitif \? \(\s*<button[^>]*onClick=\{\(\) => dialogue\.current\?\.close\(\)\}>\{labels\.fermer\}<\/button>\s*\) : \(\s*<button[^>]*onClick=\{\(\) => setEtape\("photo"\)\}>\{labels\.reessayer\}/);
  assert.match(FEUILLE, /setMessage\(texte \?\? labels\.erreur\);\s*setDefinitif\(fin\);/);
});

test("FE9 — libellés : présents et distincts dans les quatre langues, mention IA du §2", () => {
  for (const lang of LANGS) {
    const l = libellesEssayage(lang, "Robe");
    for (const [cle, valeur] of Object.entries(l)) {
      for (const v of Array.isArray(valeur) ? valeur : [valeur]) assert.ok(v.trim().length > 0, `${lang} ${cle}`);
    }
    assert.match(l.resultatAlt, /Robe/, lang);
    assert.equal(l.consentementPoints.length, 3, lang);
  }
  assert.equal(libellesEssayage("fr", "Robe").mention, "Aperçu généré par IA. La coupe et la couleur réelles peuvent différer.");
});
