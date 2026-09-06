import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formaterTaux, EXEMPLE_HTG } from "../components/commission-annonce";
import { commissionAuTaux, RATE_BPS } from "../lib/commission";

/**
 * LE TAUX DE COMMISSION EST ÉCRIT SUR `/vendre`, ET IL EST LU EN BASE.
 *
 * Deux choses tiennent ensemble, et l'une sans l'autre ne vaut rien :
 *   • le taux est AFFICHÉ sur la page qui recrute les vendeurs, et avant
 *     l'inscription — sinon il arrive après la décision ;
 *   • il est LU dans `zabelie_commission_config`, jamais gravé dans un
 *     libellé. Un « 10 % » en dur serait une promesse FIXE adossée à une
 *     valeur MOBILE : au premier `UPDATE`, la page annoncerait un taux que la
 *     plateforme ne pratique plus, et rien ne relierait le libellé à la base.
 *
 * Mutations éprouvées (toutes passées, journal dans la PR) :
 *   CV1  « 10 % » écrit en dur dans le libellé i18n        → rouge
 *   CV2  le bloc déplacé dans la seule branche connectée    → rouge
 *   CV3  l'exemple calculé avec `round` au lieu de l'arrondi en vigueur → rouge
 *   CV4  `taux` remplacé par `RATE_BPS` à l'appel du composant → rouge
 */

const PAGE = readFileSync("app/vendre/page.tsx", "utf8");
const COMPOSANT = readFileSync("components/commission-annonce.tsx", "utf8");
const I18N = readFileSync("lib/i18n.ts", "utf8");

/** Le code exécutable seul : une interdiction ne doit pas porter sur la prose. */
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

test("CV1 — AUCUN taux n'est écrit dans les libellés : ils portent des trous", () => {
  // Les quatre clés existent dans les quatre langues.
  for (const cle of ["sell.fee.title", "sell.fee.line", "sell.fee.example", "sell.fee.free"]) {
    const n = (I18N.match(new RegExp(`^\\s*"${cle.replace(/\./g, "\\.")}":`, "gm")) ?? []).length;
    assert.equal(n, 4, `${cle} : ${n} langue(s), 4 attendues`);
  }

  /* LE CŒUR. Un pourcentage littéral dans l'une de ces valeurs serait le
     retour exact du défaut qu'on ferme. On extrait les valeurs et on cherche
     un chiffre suivi de « % » — `{taux} %` n'existe pas, le composant met le
     signe lui-même. */
  const valeurs = [...I18N.matchAll(/"sell\.fee\.(?:line|example|title|free)":\s*\n?\s*"([^"]+)"/g)]
    .map((m) => m[1]);
  assert.equal(valeurs.length, 16, `${valeurs.length} valeurs extraites, 16 attendues (4 clés × 4 langues)`);
  for (const v of valeurs) {
    assert.doesNotMatch(
      v,
      /\d\s*%/,
      `un taux littéral est écrit dans un libellé : « ${v} » — il doit venir de la base`,
    );
    assert.doesNotMatch(v, /\d+\s*HTG/, `un montant littéral est écrit dans un libellé : « ${v} »`);
  }

  // Et les trous existent bien, sinon le composant n'aurait rien à remplacer.
  const ligne = /"sell\.fee\.line":\s*\n?\s*"([^"]+)"/.exec(I18N)?.[1] ?? "";
  assert.match(ligne, /\{taux\}/);
  assert.match(ligne, /\{palier\}/);
  const exemple = /"sell\.fee\.example":\s*\n?\s*"([^"]+)"/.exec(I18N)?.[1] ?? "";
  for (const trou of ["{brut}", "{net}"]) {
    assert.ok(exemple.includes(trou), `${trou} manque à sell.fee.example`);
  }
});

test("CV2 — le bloc est rendu AVANT l'inscription, sur les trois écrans", () => {
  const code = sansCommentaires(PAGE);

  /* Ce qui COMMANDE : le composant est appelé dans la `Shell`, qui enveloppe
     les trois branches. Un motif qui ne verrait que « le composant est
     importé » resterait vert s'il n'était rendu que pour un vendeur connecté —
     c'est-à-dire après la décision de s'inscrire. */
  const iShell = code.indexOf("function Shell(");
  const iBloc = code.indexOf("<CommissionAnnonce");
  const iFin = code.indexOf("export default async function VendrePage");
  assert.ok(iShell > 0 && iBloc > iShell && iBloc < iFin,
    "CommissionAnnonce doit être rendu DANS la Shell, pas dans une branche");

  // Les trois appels de Shell passent un taux.
  const appels = code.match(/<Shell lang=\{lang\} taux=\{/g) ?? [];
  assert.equal(appels.length, 3, `${appels.length} Shell(s) reçoivent un taux, 3 attendues`);

  // Et la lecture précède la branche « non connecté » : sinon le visiteur sans
  // compte — celui qui vient chercher la commission — ne la verrait jamais.
  const iLecture = code.indexOf("lireTauxCommission(supabase");
  const iBranche = code.indexOf("if (!user)");
  assert.ok(iLecture > 0 && iLecture < iBranche,
    "le taux doit être lu AVANT la branche non-connecté");
});

test("CV3 — l'exemple est CALCULÉ, avec l'arrondi réellement en vigueur", () => {
  const code = sansCommentaires(COMPOSANT);

  /* La liaison : le net doit venir de `commissionAuTaux` appliqué à la base de
     l'exemple, pas d'un nombre écrit à côté. Ancré sur l'affectation, pas sur
     l'usage — un intervalle entre deux fragments voisins ne prouverait qu'une
     adjacence de texte. */
  assert.match(
    code,
    /const net = EXEMPLE_HTG - commissionAuTaux\(EXEMPLE_HTG, bps\)/,
    "le net doit être calculé depuis le taux reçu",
  );
  // Aucun arrondi recopié dans le composant : la règle vit dans lib/commission.
  assert.doesNotMatch(code, /Math\.(floor|round)\s*\(/,
    "le composant ne doit pas refaire l'arrondi — ROUNDING_IN_FORCE est ailleurs");

  // L'oracle : au taux standard d'aujourd'hui, 1 000 HTG donne bien 900 HTG.
  const net = EXEMPLE_HTG - commissionAuTaux(EXEMPLE_HTG, RATE_BPS.standard);
  assert.equal(net, 900);
  // Et il SUIT le taux : ce n'est pas un nombre figé.
  assert.equal(EXEMPLE_HTG - commissionAuTaux(EXEMPLE_HTG, 600), 940);
  assert.equal(EXEMPLE_HTG - commissionAuTaux(EXEMPLE_HTG, 250), 975);
});

test("CV4 — le taux affiché vient de la BASE, pas de la constante compilée", () => {
  const code = sansCommentaires(PAGE);

  /* La branche démo n'a pas de base : elle utilise le repli, et c'est correct.
     Les DEUX autres doivent passer le taux LU. Le motif porte donc sur ce qui
     commande — la variable passée — et non sur la présence de l'import. */
  assert.match(code, /<Shell lang=\{lang\} taux=\{\{ \.\.\.RATE_BPS \}\} subtitle=\{t\(lang, "sell\.demo/);
  const lus = code.match(/<Shell lang=\{lang\} taux=\{taux\}/g) ?? [];
  assert.equal(lus.length, 2, `${lus.length} Shell(s) reçoivent le taux LU, 2 attendues (connexion + connecté)`);

  // Le composant ne lit rien lui-même : il reçoit. Sinon deux chemins de
  // lecture divergeraient un jour.
  assert.doesNotMatch(sansCommentaires(COMPOSANT), /lireTauxCommission|createClient|from\(/);
});

test("CV5 — le formatage du taux tient sur les valeurs qui ne sont pas rondes", () => {
  assert.equal(formaterTaux(1000), "10 %");
  assert.equal(formaterTaux(600), "6 %");
  // Un taux non entier ne doit pas s'afficher « 8 % » : ce serait annoncer
  // moins que ce qui est prélevé.
  assert.equal(formaterTaux(850), "8,5 %");
  assert.equal(formaterTaux(1025), "10,25 %");
  // Et un taux rond ne traîne pas de décimales inutiles.
  assert.doesNotMatch(formaterTaux(1000), /,/);
});
