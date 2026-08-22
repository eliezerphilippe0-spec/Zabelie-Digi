import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  domaineExpediteur,
  emailFrom,
  sendEmail,
  verifierFournisseur,
  EXPEDITEUR_REPLI,
} from "@/lib/zabelie-email";

/**
 * « VÉRIFIE RESEND_API_KEY » — la question posée deux fois, le 2026-08-22.
 *
 * La première réponse fut un booléen de PRÉSENCE
 * (`integrations.email.configure`). Il est vrai dans trois situations où rien
 * ne part, et c'est tout l'objet de ce fichier :
 *
 *   1. clé présente mais RÉVOQUÉE                     → Resend répond 401
 *   2. `EMAIL_FROM` absent → repli bac à sable         → refus pour tout tiers
 *   3. `EMAIL_FROM` posé sur un domaine non vérifié    → refus
 *
 * Le cas 2 est l'état PAR DÉFAUT du dépôt : `EMAIL_FROM` n'est posée nulle
 * part, et `onboarding@resend.dev` ne livre qu'au titulaire du compte. Une
 * clé parfaitement valide y donne « configuré » à l'écran et zéro e-mail reçu.
 *
 * ⚠️ Et le défaut de fond était plus grave que la sonde : `sendEmail` rendait
 * `res.ok` SANS UN MOT. Deux de ses trois appelants jettent ce booléen. Un
 * refus du fournisseur était donc indiscernable d'un envoi réussi, à tous les
 * étages — « l'absence de signal doit être un signal », enfreint à l'endroit
 * exact de la question.
 */

// ───────────────────────── Harnais ───────────────────────────────────────────

type Repondeur = () => Promise<Response> | Response;

/** Remplace `fetch`, `console.error`/`info` et l'environnement, puis restaure. */
async function sous(
  env: Record<string, string | undefined>,
  repondeur: Repondeur,
  corps: () => Promise<void>
): Promise<string[]> {
  const avantEnv: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    avantEnv[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const vraiFetch = globalThis.fetch;
  const vraiErr = console.error;
  const vraiInfo = console.info;
  const journal: string[] = [];
  globalThis.fetch = (async () => repondeur()) as typeof fetch;
  console.error = (...a: unknown[]) => journal.push(a.map(String).join(" "));
  console.info = (...a: unknown[]) => journal.push(a.map(String).join(" "));
  try {
    await corps();
  } finally {
    globalThis.fetch = vraiFetch;
    console.error = vraiErr;
    console.info = vraiInfo;
    for (const [k, v] of Object.entries(avantEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  return journal;
}

const json = (statut: number, corps: unknown) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { "Content-Type": "application/json" },
  });

const DOMAINES_OK = { data: [{ name: "zabelie.com", status: "verified" }] };

// ─────────────────── L'instrument avant la mesure ────────────────────────────

test("E0 — le harnais intercepte vraiment fetch et les journaux", async () => {
  /* ⚠️ SANS CE CAS, tout le reste du fichier pourrait être vert en ayant
   * mesuré le vide. C'est la leçon des fixtures qui encodaient le bug : un
   * harnais écrit une fois, sous pression, et jamais vérifié lui-même.
   *
   * ⚠️ ET IL A SERVI IMMÉDIATEMENT. Sa première version prenait le chemin
   * HEUREUX (`200`) et exigeait `journal.length > 0`. Elle est partie rouge à
   * l'état sain : `verifierFournisseur` ne journalise QUE sur `injoignable` et
   * `cle_refusee` — le verdict, lui, est journalisé par la ROUTE. J'avais
   * supposé le contraire sans le vérifier. Un contrôle d'instrument qui ne
   * peut pas se tromper sur l'instrument ne contrôle rien ; celui-ci s'est
   * trompé sur moi, ce qui est exactement son emploi.
   *
   * On prend donc le chemin qui journalise VRAIMENT — c'est aussi celui où
   * l'interception compte, puisque E7 assert que la clé n'y fuit pas. */
  let appele = false;
  const journal = await sous({ RESEND_API_KEY: "re_test" }, () => {
    appele = true;
    return json(401, { message: "invalid" });
  }, async () => {
    const r = await verifierFournisseur();
    assert.equal(r.verdict, "cle_refusee");
  });
  assert.ok(appele, "le fetch stubé n'a jamais été appelé — le harnais ne mesure rien");
  assert.ok(journal.length > 0, "aucun journal capturé — l'interception est morte");
  // Et l'environnement est bien restauré : la clé factice ne survit pas.
  assert.notEqual(process.env.RESEND_API_KEY, "re_test");
});

// ───────────────────── Les cinq verdicts ─────────────────────────────────────

test("E1 — clé absente : `absente`, et le fournisseur n'est même pas appelé", async () => {
  let appele = false;
  await sous({ RESEND_API_KEY: undefined }, () => {
    appele = true;
    return json(200, DOMAINES_OK);
  }, async () => {
    const r = await verifierFournisseur();
    assert.equal(r.verdict, "absente");
    assert.equal(r.clePresente, false);
    assert.equal(r.statutFournisseur, null);
  });
  assert.equal(appele, false, "sans clé, il n'y a rien à demander à Resend");
});

test("E2 — clé refusée : `cle_refusee`, avec le code du fournisseur", async () => {
  await sous({ RESEND_API_KEY: "re_revoquee" }, () => json(401, { message: "API key is invalid" }), async () => {
    const r = await verifierFournisseur();
    assert.equal(r.verdict, "cle_refusee");
    assert.equal(r.clePresente, true, "la clé EST présente — c'est bien le piège");
    assert.equal(r.statutFournisseur, 401);
  });
});

test("E3 — fournisseur injoignable : un verdict à part, jamais « refusée »", async () => {
  /* Confondre « la clé est mauvaise » et « le réseau n'a pas répondu » ferait
   * révoquer une clé saine. Les deux sortent donc distincts. */
  await sous({ RESEND_API_KEY: "re_bonne" }, () => {
    throw new Error("ECONNREFUSED");
  }, async () => {
    const r = await verifierFournisseur();
    assert.equal(r.verdict, "injoignable");
    assert.equal(r.statutFournisseur, null);
  });
});

test("E4 — LE CAS QUI COMPTE : clé valide, EMAIL_FROM absente", async () => {
  /* L'état par défaut du dépôt. `isEmailEnabled()` rend `true`, la sonde de
   * cohérence affiche « configuré », et pas un acheteur ne reçoit rien. */
  await sous(
    { RESEND_API_KEY: "re_bonne", EMAIL_FROM: undefined },
    () => json(200, DOMAINES_OK),
    async () => {
      const r = await verifierFournisseur();
      assert.equal(r.verdict, "repli_bac_a_sable");
      assert.equal(r.clePresente, true);
      assert.equal(r.statutFournisseur, 200, "la clé a bien été acceptée");
      assert.equal(r.expediteurConfigure, false);
      assert.equal(r.expediteur, EXPEDITEUR_REPLI);
      assert.match(r.explication, /titulaire du compte/);
    }
  );
});

test("E5 — clé valide, expéditeur sur un domaine non vérifié", async () => {
  await sous(
    { RESEND_API_KEY: "re_bonne", EMAIL_FROM: "Zabelie <bonjou@pa-verifye.ht>" },
    () => json(200, DOMAINES_OK),
    async () => {
      const r = await verifierFournisseur();
      assert.equal(r.verdict, "domaine_non_verifie");
      assert.equal(r.domaineExpediteur, "pa-verifye.ht");
      assert.deepEqual(r.domainesVerifies, ["zabelie.com"]);
    }
  );
});

test("E6 — tout est en place : `ok`, et la limite reste ÉCRITE", async () => {
  await sous(
    { RESEND_API_KEY: "re_bonne", EMAIL_FROM: "Zabelie <bonjou@zabelie.com>" },
    () => json(200, DOMAINES_OK),
    async () => {
      const r = await verifierFournisseur();
      assert.equal(r.verdict, "ok");
      assert.equal(r.domaineExpediteur, "zabelie.com");
      /* ⚠️ Un `ok` qui laisserait croire à une preuve de RÉCEPTION serait pire
       * que pas de sonde du tout. Le rapport doit continuer à dire ce qu'il ne
       * prouve pas — c'est la discipline `docs/44` §6, appliquée à un verdict. */
      assert.match(r.explication, /Reste non prouvé/);
    }
  );
});

// ─────────────────── Ce qui ne doit JAMAIS sortir ────────────────────────────

test("E7 — aucune valeur de secret dans le rapport, dans AUCUN verdict", async () => {
  /* ⚠️ ON ASSERTE SUR LE JSON SÉRIALISÉ, pas sur les champs connus. Un champ
   * ajouté demain — « les quatre premiers caractères, pour vérifier que c'est
   * la bonne clé » — passerait une assertion écrite champ par champ. */
  const SECRET = "re_SECRET_A_NE_JAMAIS_VOIR_123456";
  for (const [env, rep] of [
    [{ EMAIL_FROM: undefined }, () => json(200, DOMAINES_OK)],
    [{ EMAIL_FROM: "Zabelie <bonjou@zabelie.com>" }, () => json(200, DOMAINES_OK)],
    // Et le cas retors : le fournisseur RENVOIE la clé dans son corps d'erreur.
    [{ EMAIL_FROM: undefined }, () => json(401, { message: `key ${SECRET} rejected` })],
  ] as [Record<string, string | undefined>, Repondeur][]) {
    const journal = await sous({ RESEND_API_KEY: SECRET, ...env }, rep, async () => {
      const r = await verifierFournisseur();
      assert.ok(
        !JSON.stringify(r).includes(SECRET),
        `la clé apparaît dans le rapport (verdict ${r.verdict})`
      );
      assert.ok(!JSON.stringify(r).includes("SECRET_A_NE_JAMAIS_VOIR"));
    });
    assert.ok(
      !journal.join("\n").includes(SECRET),
      "la clé apparaît dans les JOURNAUX — un journal est lisible par qui a la console"
    );
  }
});

// ──────────────── Le silence de `sendEmail`, le vrai défaut ──────────────────

test("E8 — un refus du fournisseur est JOURNALISÉ, plus jamais muet", async () => {
  const journal = await sous(
    { RESEND_API_KEY: "re_bonne", EMAIL_FROM: undefined },
    () => json(403, { message: "You can only send testing emails to your own address" }),
    async () => {
      const parti = await sendEmail({ to: "achte@gmail.com", subject: "s", html: "h" });
      assert.equal(parti, false, "un refus doit rendre false");
    }
  );
  const texte = journal.join("\n");
  assert.match(texte, /REFUS DU FOURNISSEUR/, "le refus est passé sous silence");
  assert.match(texte, /HTTP 403/, "le code du fournisseur manque : on ne sait pas POURQUOI");
  assert.match(texte, /own address/, "le motif du fournisseur manque");
  /* Le destinataire est MASQUÉ : un journal n'est pas un carnet d'adresses.
   * Le domaine reste, parce qu'il aide à diagnostiquer ; le nom part. */
  assert.ok(!texte.includes("achte@gmail.com"), "l'adresse complète est journalisée");
  assert.match(texte, /a\*\*\*@gmail\.com/, "le domaine du destinataire aide au diagnostic");
});

test("E9 — un envoi réussi ne journalise AUCUN refus", async () => {
  /* Connu-négatif du précédent : un garde qui crie toujours ne dit rien. */
  const journal = await sous(
    { RESEND_API_KEY: "re_bonne", EMAIL_FROM: "Zabelie <bonjou@zabelie.com>" },
    () => json(200, { id: "abc" }),
    async () => {
      assert.equal(await sendEmail({ to: "a@b.com", subject: "s", html: "h" }), true);
    }
  );
  assert.ok(!journal.join("\n").includes("REFUS"), "un succès ne doit rien crier");
});

// ─────────────────────── Fonctions pures ─────────────────────────────────────

test("E10 — le domaine se lit dans les deux formes d'expéditeur", () => {
  assert.equal(domaineExpediteur("Zabelie <bonjou@zabelie.com>"), "zabelie.com");
  assert.equal(domaineExpediteur("bonjou@zabelie.com"), "zabelie.com");
  assert.equal(domaineExpediteur("Zabelie <BONJOU@Zabelie.COM>"), "zabelie.com");
  assert.equal(domaineExpediteur(EXPEDITEUR_REPLI), "resend.dev");
  // Connu-négatif : rien d'exploitable ne doit produire un domaine inventé.
  assert.equal(domaineExpediteur("Zabelie"), null);
  assert.equal(domaineExpediteur(""), null);
  assert.equal(domaineExpediteur("bonjou@localhost"), null);
});

test("E11 — l'expéditeur retombe sur le bac à sable, et c'est explicite", async () => {
  await sous({ EMAIL_FROM: undefined }, () => json(200, {}), async () => {
    assert.equal(emailFrom(), EXPEDITEUR_REPLI);
  });
  await sous({ EMAIL_FROM: "Z <a@b.com>" }, () => json(200, {}), async () => {
    assert.equal(emailFrom(), "Z <a@b.com>");
  });
});

// ─────────────────────── Croisements de dépôt ────────────────────────────────

test("E12 — la route est GARDÉE avant d'interroger quoi que ce soit", () => {
  /* ⚠️ ASSERTION SUR L'ORDRE, pas sur la présence. Une route qui appellerait
   * le garde APRÈS avoir construit le rapport exposerait déjà l'état du compte
   * fournisseur à quiconque, et `autoriserAdmin` serait pourtant bien là. */
  const src = readFileSync("app/api/admin/email-verify/route.ts", "utf8");
  const garde = src.indexOf("await autoriserAdmin(req)");
  const travail = src.indexOf("await verifierFournisseur()");
  assert.ok(garde > -1, "le garde d'administration a disparu de la route");
  assert.ok(travail > -1, "la route n'interroge plus le fournisseur");
  assert.ok(
    garde < travail,
    "le garde passe APRÈS l'interrogation : l'état du compte fournisseur " +
      "serait calculé pour un appelant non autorisé"
  );
  assert.match(
    src.slice(garde, travail),
    /return\s+erreurTraduite\(/,
    "le garde n'arrête plus rien : il est évalué puis ignoré"
  );
});

test("E13 — le garde est PARTAGÉ, pas recopié", () => {
  /* Deux copies d'une règle d'autorisation divergent toujours, et c'est
   * toujours la plus récente qui reste en arrière — la leçon de
   * `tests/messagerie.test.ts` M4, transposée du SQL au TypeScript. */
  const coherence = readFileSync("app/api/admin/coherence/route.ts", "utf8");
  assert.match(
    coherence,
    /import \{ autoriserAdmin \} from "@\/lib\/admin-gate"/,
    "`coherence` n'importe plus le garde partagé"
  );
  assert.ok(
    !/async function authorize\s*\(/.test(coherence),
    "`coherence` a de nouveau sa PROPRE copie du garde : les deux routes " +
      "vont diverger, et c'est la copie oubliée qui restera permissive"
  );
});
