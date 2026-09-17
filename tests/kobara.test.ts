import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  FENETRE_SIGNATURE_MS,
  KOBARA_PROVIDERS,
  autoriserWebhookKobara,
  isKobaraEnabled,
  isKobaraProvider,
  kobaraCap,
  kobaraEstPaye,
  redactKobaraPayment,
  resolveKobaraMode,
  verifierSignatureKobara,
  type KobaraPayment,
} from "../lib/kobara";

/**
 * LE RAIL KOBARA DOIT SAVOIR REFUSER.
 *
 * Ce rail est le premier du dépôt dont l'étape 0 est INCOMPLÈTE au moment où
 * le code est écrit (`docs/03` §9.1 : statut BRH et détention des fonds non
 * établis), et dont **aucun appel n'a jamais atteint l'hôte réel**. Ce qu'on
 * peut éprouver ici est donc borné, et la borne mérite d'être dite :
 *
 *   • ce fichier prouve que NOTRE code refuse ce qu'il doit refuser ;
 *   • il ne prouve RIEN sur le comportement de la passerelle — ni le format
 *     exact de sa signature, ni ses codes de statut, ni sa politique de rejeu.
 *
 * C'est la distinction « documenté ≠ testé » de `docs/03` §9.1, appliquée à
 * l'instrument lui-même. Un test vert ici et un rail qui marche en production
 * sont deux affirmations différentes.
 */

const SECRET = "whsec_kobara_de_test";
const CORPS = JSON.stringify({ type: "payment.succeeded", data: { id: "pay_1", amount: 500 } });

/** Forge une signature VALIDE — le connu-positif de tous les tests ci-dessous. */
function signer(corps: string, secret = SECRET, tSec = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${tSec}.${corps}`).digest("hex");
  return `t=${tSec},v1=${v1}`;
}

test("K1 — le connu-POSITIF : une signature correcte passe", () => {
  /* Sans ce cas, tous les refus ci-dessous seraient satisfaits par une
     fonction qui rend `false` sans rien calculer — le piège du garde qui n'a
     jamais réussi et dont on ne sait donc pas s'il vérifie quoi que ce soit. */
  const verdict = verifierSignatureKobara(CORPS, signer(CORPS), SECRET);
  assert.deepEqual(verdict, { ok: true });
});

test("K2 — en-tête absent ou malformé : REFUS, motif distinct", () => {
  assert.deepEqual(verifierSignatureKobara(CORPS, null, SECRET), {
    ok: false,
    motif: "entete_absent",
  });
  for (const entete of [
    "",                              // vide
    "v1=abc",                        // pas d'horodatage
    `t=${Math.floor(Date.now() / 1000)}`, // pas de signature
    "t=abc,v1=" + "a".repeat(64),    // horodatage non numérique
    `t=${Math.floor(Date.now() / 1000)},v1=zz` + "a".repeat(62), // hex invalide
    `t=${Math.floor(Date.now() / 1000)},v1=` + "a".repeat(63),   // longueur fausse
  ]) {
    const v = verifierSignatureKobara(CORPS, entete, SECRET);
    assert.equal(v.ok, false, `« ${entete} » ne doit pas passer`);
  }
});

test("K3 — LE REJEU : une signature AUTHENTIQUE mais périmée est refusée", () => {
  /* Le cas qui compte le plus, et le seul que la seule vérification HMAC ne
     couvre pas : la signature est parfaitement valide — elle a été émise par
     la passerelle — elle est simplement vieille. Sans fenêtre, quiconque a
     capturé une confirmation d'hier obtient une livraison aujourd'hui. */
  const vieux = Math.floor((Date.now() - FENETRE_SIGNATURE_MS - 1000) / 1000);
  const v = verifierSignatureKobara(CORPS, signer(CORPS, SECRET, vieux), SECRET);
  assert.deepEqual(v, { ok: false, motif: "horodatage_hors_fenetre" });

  // Et le FUTUR aussi : une horloge trafiquée ouvrirait la fenêtre sans fin.
  const futur = Math.floor((Date.now() + FENETRE_SIGNATURE_MS + 1000) / 1000);
  assert.equal(verifierSignatureKobara(CORPS, signer(CORPS, SECRET, futur), SECRET).ok, false);

  // Juste DANS la fenêtre : accepté. La borne doit border, pas tout refuser.
  const limite = Math.floor((Date.now() - FENETRE_SIGNATURE_MS / 2) / 1000);
  assert.equal(verifierSignatureKobara(CORPS, signer(CORPS, SECRET, limite), SECRET).ok, true);
});

test("K4 — corps modifié d'un octet : REFUS", () => {
  const entete = signer(CORPS);
  const altere = CORPS.replace('"amount":500', '"amount":50000');
  assert.notEqual(altere, CORPS, "la mutation doit avoir eu lieu");
  assert.deepEqual(verifierSignatureKobara(altere, entete, SECRET), {
    ok: false,
    motif: "signature_invalide",
  });
});

test("K5 — mauvais secret : REFUS", () => {
  const entete = signer(CORPS, "whsec_un_autre_secret");
  assert.equal(verifierSignatureKobara(CORPS, entete, SECRET).ok, false);
});

test("K6 — secret ABSENT de l'environnement : REFUS, jamais un laissez-passer", () => {
  /* Le piège du « contrôle qui saute faute de configuration » : un webhook
     sans secret qui accepterait tout accorderait des livraisons gratuites à
     quiconque connaît l'URL. Ici l'absence FERME. */
  for (const secret of [undefined, "", "   "]) {
    const v = autoriserWebhookKobara(CORPS, signer(CORPS), secret);
    assert.equal(v.ok, false, `secret ${JSON.stringify(secret)} ne doit rien autoriser`);
  }
  // Et avec le secret posé, la même charge passe — sinon K6 ne prouverait que
  // « cette fonction refuse toujours ».
  const v = autoriserWebhookKobara(CORPS, signer(CORPS), SECRET);
  assert.equal(v.ok, true);
});

test("K7 — le rail n'existe pas tant que les DEUX secrets ne sont pas posés", () => {
  assert.equal(isKobaraEnabled("kbr_sk_test_x", "whsec_x"), true);
  for (const [cle, webhook] of [
    [undefined, undefined],
    ["kbr_sk_test_x", undefined],  // pas de secret de webhook
    [undefined, "whsec_x"],        // pas de clé d'API
    ["  ", "whsec_x"],             // blanc
    ["kbr_sk_test_x", ""],
  ] as [string | undefined, string | undefined][]) {
    assert.equal(
      isKobaraEnabled(cle, webhook),
      false,
      `(${JSON.stringify(cle)}, ${JSON.stringify(webhook)}) ne doit pas activer le rail — ` +
        "encaisser sans pouvoir confirmer est le pire état"
    );
  }
});

test("K8 — le mode ne se caste pas : toute valeur non reconnue retombe en `test`", () => {
  /* Leçon MonCash, reprise telle quelle : cinq paiements réels ont été perdus
     parce que `as Mode` acceptait `Production`, `production ` et la chaîne
     vide, toutes silencieusement renvoyées au bac à sable. Ici l'asymétrie est
     l'inverse et délibérée — on se trompe vers l'inoffensif. */
  assert.deepEqual(resolveKobaraMode("live"), { mode: "live", source: "explicite" });
  assert.deepEqual(resolveKobaraMode(" live "), { mode: "live", source: "explicite" });
  assert.deepEqual(resolveKobaraMode("test"), { mode: "test", source: "explicite" });
  assert.deepEqual(resolveKobaraMode(undefined), { mode: "test", source: "absente" });
  assert.deepEqual(resolveKobaraMode(""), { mode: "test", source: "vide" });
  for (const brut of ["Live", "LIVE", "production", "prod", "1", "oui"]) {
    const r = resolveKobaraMode(brut);
    assert.equal(r.mode, "test", `« ${brut} » ne doit JAMAIS encaisser pour de vrai`);
    assert.equal(r.source, "invalide", "et la source doit dire que la valeur était fautive");
  }
});

test("K9 — le succès est une liste FERMÉE, pas l'absence d'échec", () => {
  const base: KobaraPayment = {
    id: "pay_1", status: "succeeded", amount: 500, currency: "HTG",
    reference: "o1", provider: "natcash", providerRef: "NC1",
  };
  for (const status of ["succeeded", "paid", "completed"]) {
    assert.equal(kobaraEstPaye({ ...base, status }), true, status);
  }
  /* Ceux-ci DOIVENT être faux. Un `status !== "failed"` accorderait la
     livraison sur chacun — y compris sur une valeur que la passerelle
     ajouterait l'an prochain et que personne n'aurait lue. */
  for (const status of ["pending", "processing", "failed", "cancelled", "on_hold", "refunded", "inconnu", ""]) {
    assert.equal(kobaraEstPaye({ ...base, status }), false, status);
  }
  assert.equal(kobaraEstPaye(null), false);
});

test("K10 — les plafonds sont ceux des opérateurs, et chacun le sien", () => {
  assert.equal(kobaraCap("moncash"), 25000);
  assert.equal(kobaraCap("natcash"), 20000);
  // La page de choix unifiée peut router vers l'un ou l'autre : on retient le
  // plus bas, sinon un NatCash à 22 000 partirait pour être refusé par l'opérateur.
  assert.equal(kobaraCap("kobara"), 20000);
});

test("K11 — la liste des providers est fermée", () => {
  for (const p of KOBARA_PROVIDERS) assert.equal(isKobaraProvider(p), true);
  for (const p of ["digicel", "natcom", "", "NATCASH", null, undefined, 1, {}]) {
    assert.equal(isKobaraProvider(p), false, String(p));
  }
});

test("K12 — la minimisation ne laisse fuir aucune donnée de payeur", () => {
  const brut = {
    id: "pay_1", status: "succeeded", amount: 500, currency: "HTG",
    reference: "o1", provider: "natcash", providerRef: "NC1",
  } as KobaraPayment & Record<string, unknown>;
  // On simule ce qu'une passerelle renvoie souvent EN PLUS du contrat.
  brut.customer_phone = "50937123456";
  brut.customer_name = "Nom Prenom";
  const reduit = JSON.stringify(redactKobaraPayment(brut));
  assert.ok(!reduit.includes("50937123456"), "le numéro du payeur ne doit pas être écrit en base");
  assert.ok(!reduit.includes("Nom Prenom"), "ni son nom");
  assert.ok(reduit.includes("NC1"), "mais la référence opérateur sert au rapprochement comptable");
});

/* ────────────────────────────────────────────────────────────────────────────
 * LES GARDES STRUCTURELS — ce qui COMMANDE, jamais ce qui est produit
 * ──────────────────────────────────────────────────────────────────────────── */

/** Retire les commentaires : un garde cité en commentaire n'est pas un garde. */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("K13 — le checkout REFUSE le rail quand il n'est pas configuré", () => {
  const src = sansCommentaires(readFileSync("app/api/checkout/route.ts", "utf8"));
  /* Ce qui COMMANDE : la branche `kobara` de `railEnabled` doit RENDRE
     `isKobaraEnabled()`, pas l'appeler à côté. La mutation à laquelle ce motif
     doit résister est `if (rail === "kobara") return true;` — un « en
     attendant » qui ouvrirait le rail en production sans le moindre secret. */
  assert.match(
    src,
    /rail === "kobara"\)\s*return isKobaraEnabled\(\)/,
    "railEnabled ne rend plus isKobaraEnabled() pour le rail kobara : le rail " +
      "s'ouvrirait sans que les secrets soient posés, alors que l'étape 0 de " +
      "docs/03 §9.1 est incomplète sur deux points juridiques."
  );
});

test("K14 — le webhook refuse AVANT de lire la charge, et le refus commande", () => {
  const src = sansCommentaires(readFileSync("app/api/kobara/webhook/route.ts", "utf8"));
  /* La liaison porte à gauche : `verdict` est LIÉ au retour du garde, et la
     condition à droite teste cette même variable. Un motif qui se contenterait
     de voir `autoriserWebhookKobara` quelque part dans le fichier resterait
     vert sur une route qui appelle le garde et jette son résultat — le piège
     de sous-chaîne de `CLAUDE.md`, appliqué à une autorisation. */
  assert.match(
    src,
    /const verdict = autoriserWebhookKobara\([\s\S]{0,200}if \(!verdict\.ok\)[\s\S]{0,400}status: 400/,
    "le webhook n'exige plus une signature valide avant d'agir"
  );
  // Le corps BRUT, jamais un ré-encodage : `JSON.stringify(parsé)` réordonne
  // les clés et ferait échouer des charges authentiques.
  assert.match(src, /const corpsBrut = await req\.text\(\)/);
  // Et la confirmation passe par la fonction d'argent, jamais par un crédit direct.
  assert.match(src, /rpc\("confirm_payment"/);
});

test("K15 — le rail S2S est BRANCHÉ au réconciliateur", () => {
  /* `docs/03` §9 étape 5 : « un rail S2S non branché = paiements orphelins
     silencieux ». Le webhook peut ne jamais arriver, et la documentation de
     Kobara n'annonce aucune politique de rejeu — on ne peut donc pas emprunter
     la justification qui dispense Stripe. */
  const src = sansCommentaires(readFileSync("app/api/reconcile/route.ts", "utf8"));
  assert.match(
    src,
    /if \(isKobaraEnabled\(\)\)[\s\S]{0,300}reconcileKobara\(liveKobaraDeps\(admin\)\)/,
    "la passe Kobara n'est plus appelée par le réconciliateur"
  );
});
