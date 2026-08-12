import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RATE_BPS, commissionAuTaux, commissionHTG } from "../lib/commission";
import { RPC_TAUX } from "../lib/commission-config";

/**
 * LE TAUX AFFICHÉ AU VENDEUR DOIT SUIVRE LE TAUX FACTURÉ.
 *
 * `0054` déplace les taux en table de configuration en gardant la signature de
 * `commission_rate_bps` : le chemin d'ARGENT suit tout seul, sans
 * redéploiement. L'ÉCRAN ne suivait pas — `RATE_BPS` est une constante
 * compilée. Un `UPDATE` d'exploitation affichait donc « Vous recevez 900 HTG »
 * à un vendeur qui en toucherait 940, et une estimation fausse a l'air d'un
 * engagement. `0066` expose les taux, `lib/commission-config.ts` les lit, et
 * ce fichier garde la chaîne.
 *
 * ⚠️ LA FORME DU DÉFAUT QU'ON SURVEILLE. Chaque maillon manquant est
 * SILENCIEUX : la prop non passée, le repli qui s'active, la RPC mal nommée —
 * aucun ne casse quoi que ce soit à l'écran. Le vendeur voit un nombre
 * plausible, simplement pas le bon. C'est la classe « artefact adressé par
 * chaîne » : `tsc` ne verra jamais rien, par construction.
 */

const MIG_0054 = readFileSync("supabase/migrations/0054_commission_config.sql", "utf8");
const MIG_0066 = readFileSync("supabase/migrations/0066_commission_taux_lecture.sql", "utf8");
const exec = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "");

test("le repli TS rend EXACTEMENT ce que rend le repli SQL", () => {
  /* LE CROISEMENT CENTRAL. Les deux replis se déclenchent dans le même cas —
   * config illisible ou absente — et doivent donner le même chiffre. S'ils
   * s'écartent, une dégradation fait diverger l'écran du grand livre : le
   * défaut exact que tout ce chantier ferme, réintroduit par la porte de
   * derrière. */
  const sql = exec(MIG_0054);
  const m = /case p_tier when 'elite' then (\d+) else (\d+) end/.exec(sql);
  assert.ok(m, "le `coalesce` de repli de 0054 est introuvable");
  assert.equal(
    Number(m![1]),
    RATE_BPS.elite,
    `repli SQL elite = ${m![1]} bps, repli TS = ${RATE_BPS.elite} bps`,
  );
  assert.equal(
    Number(m![2]),
    RATE_BPS.standard,
    `repli SQL standard = ${m![2]} bps, repli TS = ${RATE_BPS.standard} bps`,
  );
});

test("le seed de 0054 est cohérent avec le repli", () => {
  // Un seed qui différerait du repli rendrait la première application de 0054
  // silencieusement visible à l'écran — un changement de taux que personne
  // n'a décidé.
  const sql = exec(MIG_0054);
  const std = /\('standard',\s*(\d+),/.exec(sql);
  const elite = /\('elite',\s*(\d+),/.exec(sql);
  assert.ok(std && elite, "les lignes de seed de 0054 sont introuvables");
  assert.equal(Number(std![1]), RATE_BPS.standard);
  assert.equal(Number(elite![1]), RATE_BPS.elite);
});

test("la RPC appelée par le TS est bien celle que crée 0066", () => {
  /* Adressée par CHAÎNE des deux côtés : un renommage d'un seul côté laisse le
   * code compiler et l'écran s'afficher — sur le repli, en silence. */
  assert.match(
    exec(MIG_0066),
    new RegExp(`create function ${RPC_TAUX}\\s*\\(`),
    `\`${RPC_TAUX}\` (lib/commission-config.ts) n'est créée nulle part dans 0066.`,
  );
});

test("0066 est fermée à `anon` et ouverte à `authenticated`", () => {
  const sql = exec(MIG_0066);
  assert.match(sql, new RegExp(`revoke all on function ${RPC_TAUX}\\(\\) from public, anon`));
  assert.match(sql, new RegExp(`grant execute on function ${RPC_TAUX}\\(\\) to authenticated`));
});

test("l'estimation est COMMANDÉE par le taux reçu, pas par la constante", () => {
  /* L'assertion porte sur la condition qui choisit la source, pas sur la
   * présence du mot `rateBpsEnVigueur` — une prop déclarée puis ignorée
   * laisserait exactement le même texte dans le fichier. */
  const src = readFileSync("components/net-estimate.tsx", "utf8");
  assert.match(
    src,
    /Number\.isInteger\(rateBpsEnVigueur\)[\s\S]{0,160}rateBps\(tier\)/,
    "Le taux affiché doit venir de `rateBpsEnVigueur` quand il est fourni, et " +
      "de la constante seulement sinon.",
  );
  assert.match(
    src,
    /commissionAuTaux\(gross,\s*bps\)/,
    "Le calcul d'affichage doit consommer le taux choisi ci-dessus.",
  );
});

test("la chaîne complète est branchée, page par page", () => {
  /* LE MAILLON MANQUANT EST INVISIBLE. Si une page oublie de passer la prop,
   * l'écran retombe sur la constante : aucune erreur, aucun log, un chiffre
   * plausible. Seul ce croisement mécanique le voit. */
  const maillons: [string, RegExp, string][] = [
    ["app/vendre/page.tsx", /lireTauxCommission\(/, "lit les taux"],
    ["app/vendre/page.tsx", /rateBpsEnVigueur=\{taux\[tier\]\}/, "les passe à PublishForm"],
    ["app/vendre/physique/page.tsx", /lireTauxCommission\(/, "lit les taux"],
    ["app/vendre/physique/page.tsx", /rateBpsEnVigueur=\{taux\[user\.tier\]\}/, "les passe au formulaire"],
    ["components/publish-form.tsx", /rateBpsEnVigueur=\{rateBpsEnVigueur\}/, "les relaie à NetEstimate"],
    ["components/physical-product-form.tsx", /rateBpsEnVigueur=\{rateBpsEnVigueur\}/, "les relaie à NetEstimate"],
  ];
  const rompus = maillons
    .filter(([f, re]) => !re.test(readFileSync(f, "utf8")))
    .map(([f, , quoi]) => `${f} (${quoi})`);
  assert.deepEqual(
    rompus,
    [],
    `Maillons rompus — l'écran retomberait SILENCIEUSEMENT sur la constante :\n  ${rompus.join("\n  ")}`,
  );
});

test("le calcul au taux explicite suit vraiment le taux", () => {
  // Connu-positif ET connu-négatif : un `commissionAuTaux` qui ignorerait son
  // paramètre rendrait la même valeur pour les deux taux.
  assert.equal(commissionAuTaux(1000, 1000, "floor"), 100);
  assert.equal(commissionAuTaux(1000, 600, "floor"), 60);
  assert.notEqual(
    commissionAuTaux(1000, 1000, "floor"),
    commissionAuTaux(1000, 600, "floor"),
    "Le taux passé n'a aucun effet — la fonction ignore son paramètre.",
  );
  // Et l'oracle historique reste d'accord avec lui-même.
  assert.equal(commissionHTG(1000, "standard", "floor"), commissionAuTaux(1000, RATE_BPS.standard, "floor"));
  assert.equal(commissionHTG(1000, "elite", "floor"), commissionAuTaux(1000, RATE_BPS.elite, "floor"));
});

test("le repli est journalisé, sinon il est indiscernable du succès", () => {
  // « la config dit la même chose que le repli » et « la config est
  // illisible » produiraient le même écran. Sans trace, on ne peut pas les
  // distinguer — corollaire d'observabilité.
  const src = readFileSync("lib/commission-config.ts", "utf8");
  assert.match(src, /journal\(\{\s*taux:\s*"repli"/);
  assert.match(src, /source:\s*"repli"/);
  assert.match(src, /source:\s*"config"/);
});
