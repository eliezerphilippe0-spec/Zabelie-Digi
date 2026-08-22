import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * LA SONDE D'INTÉGRATIONS — deux propriétés, et la seconde est la plus grave.
 *
 * ⚠️ NÉE D'UNE QUESTION SANS RÉPONSE, le 2026-08-22 : « vérifie
 * RESEND_API_KEY ». Rien dans le dépôt ne pouvait y répondre. Pourtant deux
 * files en dépendent — `zabelie_outbox` (0061) et les notifications de
 * messagerie (0090) — et sans la clé elles se drainent dans le VIDE : le cron
 * rend `outbox_envoyes: 0`, ce qui se lit comme « rien à signaler » plutôt que
 * « rien n'est jamais parti ».
 *
 * 1. LA SONDE EXISTE et son résultat est RENDU. Une sonde calculée puis jetée
 *    est le défaut que ce dépôt a déjà payé plusieurs fois.
 * 2. AUCUNE VALEUR DE CLÉ NE SORT. Une route d'administration reste une
 *    surface, et un secret qui transite par une réponse HTTP a cessé d'être un
 *    secret.
 */

const ROUTE = "app/api/admin/coherence/route.ts";

test("I1 — la sonde d'intégrations est CALCULÉE et RENDUE", () => {
  const src = readFileSync(ROUTE, "utf8");

  /* La liaison, pas la présence : `isEmailEnabled()` doit alimenter le champ
   * `configure`, et l'objet doit atteindre la réponse. Chercher
   * `integrations` seul serait vert même si l'objet était calculé puis
   * abandonné — le motif exact que `CLAUDE.md` décrit. */
  assert.match(
    src,
    /const integrations = \{[\s\S]{0,200}configure: isEmailEnabled\(\)/,
    "la sonde ne lit plus `isEmailEnabled()` : elle ne dit plus si les " +
      "notifications peuvent partir"
  );
  assert.match(
    src,
    /return NextResponse\.json\(\{[\s\S]{0,200}integrations,/,
    "`integrations` est calculé mais n'atteint plus la réponse — une sonde " +
      "dont le résultat est jeté ne mesure rien"
  );
});

test("I2 — l'absence de clé est JOURNALISÉE, pas seulement rendue", () => {
  /* Corollaire d'observabilité : quelqu'un doit pouvoir l'apprendre sans
   * ouvrir la route. Un exploitant qui ne consulte jamais `/api/admin/coherence`
   * doit quand même croiser la ligne dans les journaux. */
  const src = readFileSync(ROUTE, "utf8");
  assert.match(
    src,
    /if \(!integrations\.email\.configure\)[\s\S]{0,120}console\.error/,
    "l'absence de RESEND_API_KEY ne produit plus de journal : elle redevient " +
      "un silence indiscernable d'un fonctionnement normal"
  );
});

test("I3 — AUCUNE valeur de secret ne sort de la route", () => {
  /* ⚠️ LE TEST QUI COMPTE. La tentation naturelle, le jour où quelqu'un
   * débogue, est d'ajouter un aperçu — « les quatre premiers caractères, pour
   * vérifier que c'est la bonne clé ». Quatre caractères d'une clé Resend sont
   * quatre caractères de trop dans une réponse HTTP.
   *
   * On assert donc qu'aucune variable d'environnement SENSIBLE n'est lue
   * autrement que comme un booléen. `MONCASH_CLIENT_ID` est un identifiant,
   * pas un secret, et il est déjà enveloppé dans `Boolean(...)`. */
  const src = readFileSync(ROUTE, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  /* ⚠️ TROISIÈME RESSERREMENT DE CETTE MÊME ASSERTION, et le motif vaut plus
   * que le correctif — je l'ai écrite trois fois trop large, et chaque fois
   * elle a condamné du code CORRECT au lieu d'attraper une fuite :
   *
   *   v1 — « tout `process.env` doit être enveloppé dans Boolean() » : rouge
   *        sur `CRON_SECRET`, lu en tête pour AUTHENTIFIER l'appelant.
   *        Comparer un jeton exige sa valeur. Un garde qui interdit la lecture
   *        d'un secret interdit l'authentification.
   *   v2 — « le NOM d'un secret ne doit pas apparaître » : rouge sur
   *        `console.error("[coherence] RESEND_API_KEY ABSENTE …")`. Nommer la
   *        variable manquante est exactement ce qui rend ce journal UTILE à
   *        l'exploitant.
   *
   * Ce qui doit être interdit n'est ni la lecture ni le nom : c'est le
   * **déréférencement**, `process.env.<SECRET>`. La présence se lit par un
   * prédicat (`isEmailEnabled()`), qui ne rend jamais qu'un booléen.
   *
   * La leçon générale : un test faux-positif finit toujours par être assoupli
   * plutôt que compris, et il aura alors coûté deux fois — une fois en bruit,
   * une fois en confiance. */
  const interdits = [
    "RESEND_API_KEY",
    "MONCASH_CLIENT_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
  ];
  for (const nom of interdits) {
    assert.ok(
      !src.includes(`process.env.${nom}`),
      `process.env.${nom} est DÉRÉFÉRENCÉE dans la route. La présence d'une ` +
        "clé se lit par un prédicat (`isEmailEnabled()`), jamais en touchant " +
        "sa valeur — c'est ce qui rend une fuite impossible plutôt " +
        "qu'improbable. La NOMMER dans un message de journal reste permis, et " +
        "souhaitable."
    );
  }

  /* ⚠️ CETTE ASSERTION A ÉTÉ RESSERRÉE LE 2026-08-22, APRÈS AVOIR CONDAMNÉ DU
   * CODE CORRECT. Sa première version exigeait que TOUT `process.env` du
   * fichier soit enveloppé dans `Boolean(...)`. Elle est partie rouge à l'état
   * sain : la route lit `CRON_SECRET` et `RECONCILE_SECRET` en tête pour
   * AUTHENTIFIER l'appelant, et comparer un jeton exige évidemment sa valeur.
   *
   * Un garde qui interdit la lecture d'un secret interdit l'authentification.
   * Ce qui doit être interdit n'est pas de LIRE une valeur, c'est qu'elle
   * atteigne la RÉPONSE — deux choses différentes que la première version
   * confondait, et un test faux-positif finit toujours par être assoupli
   * plutôt que compris.
   *
   * La règle porte donc sur le bloc `integrations`, seul objet de ce fichier
   * qui parte au client. */
  const debut = src.indexOf("const integrations = {");
  assert.ok(debut > -1, "le bloc `integrations` a disparu");
  const bloc = src.slice(debut, src.indexOf("};", debut));
  for (const m of bloc.matchAll(/process\.env\.([A-Z_]+)/g)) {
    const i = m.index ?? 0;
    assert.ok(
      bloc.slice(Math.max(0, i - 20), i).includes("Boolean("),
      `process.env.${m[1]} entre dans \`integrations\` sans être réduit à un ` +
        "booléen — sa VALEUR partirait dans la réponse HTTP"
    );
  }
});
