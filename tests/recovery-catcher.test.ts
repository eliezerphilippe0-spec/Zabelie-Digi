import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { porteMarqueurRecovery, CIBLE_RECOVERY } from "../components/recovery-catcher";

/**
 * RATTRAPAGE DU LIEN DE RÉINITIALISATION (2026-08-16).
 *
 * Ce filet existe parce que l'allowlist « Redirect URLs » de Supabase est un
 * réglage de console qu'AUCUN outil MCP n'atteint — mesuré, pas supposé : le
 * schéma `auth` n'expose que des données, jamais de configuration.
 *
 * ⚠️ Les interdictions de chaîne portent sur le CODE, jamais sur les
 * commentaires — un en-tête qui EXPLIQUE le défaut ne doit pas le rallumer.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SRC = readFileSync("components/recovery-catcher.tsx", "utf8");
const CODE = sansCommentaires(SRC);
const LAYOUT = readFileSync("app/layout.tsx", "utf8");

// ── Le prédicat, sur de VRAIES URL de retour GoTrue ─────────────────────────

test("cas connus-POSITIFS : les formes que Supabase produit vraiment", () => {
  assert.ok(
    porteMarqueurRecovery(
      "#access_token=eyJ.a.b&expires_in=3600&refresh_token=zzz&token_type=bearer&type=recovery"
    ),
    "la forme fragment est celle qui atterrit sur le Site URL de repli"
  );
  assert.ok(porteMarqueurRecovery("?type=recovery"));
  assert.ok(porteMarqueurRecovery("#type=recovery&access_token=eyJ"));
});

test("cas connus-NÉGATIFS : ce qu'il ne faut surtout PAS détourner", () => {
  // Un `?code=` nu est un retour OAuth ordinaire. Le capter casserait la
  // connexion — on ne détourne que ce qu'on sait nommer.
  assert.equal(porteMarqueurRecovery("?code=abc123"), false);
  assert.equal(porteMarqueurRecovery("#access_token=eyJ&type=signup"), false);
  assert.equal(porteMarqueurRecovery("#error=access_denied&error_code=otp_expired"), false);
  assert.equal(porteMarqueurRecovery(""), false);
  // La frontière, et c'est elle que le motif doit tenir : un paramètre qui
  // COMMENCE par la bonne valeur n'est pas la bonne valeur.
  assert.equal(porteMarqueurRecovery("#type=recoveryX"), false);
  assert.equal(porteMarqueurRecovery("#xtype=recovery"), false);
});

test("le motif est ÉVALUÉ SUR PLACE et sans `g` — les deux, pas l'un ou l'autre", () => {
  /* ⚠️ La version comportementale de ce test (appeler trois fois, vérifier la
   * même réponse) a été ÉCRITE, puis MESURÉE contre la mutation « ajouter g » :
   * elle est restée VERTE. Un littéral regex placé dans un corps de fonction
   * crée un objet neuf à chaque évaluation — `lastIndex` ne survit donc jamais,
   * et l'assertion était vraie par construction. Un test qui ne peut pas
   * échouer ne prouve rien : c'est la règle du dépôt, appliquée à elle-même.
   *
   * Le danger RÉEL est le hissage : `const RE = /…/g` au niveau du module,
   * partagé entre appels. L'assertion ci-dessous rougit sur les DEUX formes —
   * drapeau ajouté au littéral, ou littéral sorti de la fonction — parce
   * qu'elle exige que le motif soit suivi immédiatement de `.test`. */
  assert.match(
    CODE,
    /\/\(\?:\^\|\[#&\?\]\)type=recovery\(\?:\$\|&\)\/\.test\(s\)/,
    "le motif doit être évalué sur place, sans aucun drapeau"
  );
});

// ── Ce qui COMMANDE la redirection ─────────────────────────────────────────

test("le marqueur COMMANDE la redirection — pas juste voisin d'elle", () => {
  /* La liaison est ici : le `return` anticipé sur absence de marqueur, puis
   * `replace` juste après. Une proximité nue (« le mot apparaît quelque part
   * près du mot ») ne prouverait rien — règle de régression de proximité. */
  assert.match(
    CODE,
    /if \(!porteMarqueurRecovery\(hash\) && !porteMarqueurRecovery\(search\)\) return;\s*\n[\s\S]{0,120}window\.location\.replace\(`\$\{CIBLE_RECOVERY\}\$\{search\}\$\{hash\}`\)/,
    "sans marqueur on ne redirige pas, et avec marqueur on reporte fragment ET query"
  );
});

test("anti-boucle : déjà à destination, on ne redirige pas", () => {
  assert.match(CODE, /if \(pathname === CIBLE_RECOVERY\) return;/);
  assert.equal(CIBLE_RECOVERY, "/reinitialiser-mot-de-passe");
});

test("`replace` et non `assign` : l'URL porteuse de jetons ne reste pas dans l'historique", () => {
  assert.ok(
    !/location\.assign|location\.href\s*=/.test(CODE),
    "un retour arrière ramènerait l'utilisateur sur une URL qui porte ses jetons"
  );
});

test("le filet est monté sur TOUTES les pages — le repli peut tomber n'importe où", () => {
  // Frontière explicite : `RecoveryCatcher` seul resterait vert sur un
  // `RecoveryCatcherOff` (piège de sous-chaîne, mesuré sur CartPayButton).
  assert.match(LAYOUT, /<RecoveryCatcher[\s/>]/);
  assert.match(LAYOUT, /from "@\/components\/recovery-catcher"/);
});

// ── La cible sait traiter ce qu'on lui envoie ──────────────────────────────

test("la page cible consomme les DEUX formes — fragment et ?code=", () => {
  const cible = sansCommentaires(readFileSync("components/reset-password-form.tsx", "utf8"));
  assert.match(cible, /exchangeCodeForSession\(code\)/, "forme PKCE");
  assert.match(
    cible,
    /window\.history\.replaceState\(\{\}, "", window\.location\.pathname\)/,
    "les jetons sont effacés de la barre d'adresse une fois la session ouverte"
  );
});
