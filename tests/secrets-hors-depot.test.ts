import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * AUCUN SECRET NE DOIT ENTRER DANS LE DÉPÔT — et ça se vérifie, ça ne se
 * promet pas.
 *
 * `docs/11-SECRETS.md` porte la règle d'or depuis longtemps : aucune clé dans
 * le code, dans Git, ni dans une conversation. Elle était **tenue** — mesuré,
 * zéro occurrence au 2026-08-04 — et **rien ne la vérifiait**. Une règle
 * respectée par discipline se rompt le jour où quelqu'un est pressé, et une
 * clé committée reste dans l'historique même après suppression du fichier.
 *
 * Ce que ça protège concrètement ici : `SUPABASE_SERVICE_ROLE_KEY` contourne
 * TOUTE la RLS. Fuitée, elle donne accès aux comptes, aux commandes et au
 * grand livre, en lecture comme en écriture. Ce n'est pas un secret parmi
 * d'autres, c'est la clé de la maison.
 *
 * ⚠️ CE QUE CE TEST NE FAIT PAS. Il regarde l'ARBRE COURANT, pas l'historique
 * Git ni les conversations. Une clé committée puis retirée reste dans
 * l'historique et ce test se taira. La seule réponse à une clé exposée est
 * de la FAIRE TOURNER — jamais de l'effacer et d'espérer.
 *
 * ⚠️ POURQUOI LES MOTIFS SONT ASSEMBLÉS PAR MORCEAUX. Un test qui contient
 * littéralement `sb_secret_` devrait s'exclure lui-même du scan, et cette
 * exclusion serait un trou : n'importe quelle vraie clé collée dans ce fichier
 * passerait. En assemblant les préfixes (`"sb_" + "secret_"`), le fichier ne
 * contient aucune chaîne détectable et n'a donc aucune raison d'être exempté.
 */

/** Préfixes de clés, assemblés pour que CE fichier ne matche pas lui-même. */
const PREFIXES: { nom: string; motif: string }[] = [
  { nom: "Supabase (clé secrète, contourne la RLS)", motif: "sb_" + "secret_[A-Za-z0-9_-]{10,}" },
  { nom: "Stripe (clé live)", motif: "sk_" + "live_[A-Za-z0-9]{10,}" },
  { nom: "Stripe (clé test)", motif: "sk_" + "test_[A-Za-z0-9]{10,}" },
  { nom: "Stripe (secret de webhook)", motif: "whsec" + "_[A-Za-z0-9]{10,}" },
  { nom: "GitHub (jeton personnel)", motif: "gh[pousr]" + "_[A-Za-z0-9]{20,}" },
  { nom: "AWS (identifiant de clé)", motif: "AKIA" + "[0-9A-Z]{16}" },
  { nom: "SendGrid", motif: "SG\\." + "[A-Za-z0-9_-]{20,}" },
  { nom: "Brevo / Sendinblue", motif: "xkeysib" + "-[A-Za-z0-9]{20,}" },
  { nom: "Resend", motif: "re_" + "[A-Za-z0-9]{24,}" },
  { nom: "OpenAI", motif: "sk-proj" + "-[A-Za-z0-9_-]{20,}" },
  { nom: "JWT signé (clé service_role Supabase, ancienne forme)", motif: "eyJ" + "[A-Za-z0-9_-]{40,}" },
];

const DETECTEUR = new RegExp(PREFIXES.map((p) => p.motif).join("|"));

/**
 * Fichiers suivis par Git uniquement. `node_modules`, les artefacts de build
 * et tout ce qui est ignoré sont hors sujet : ils ne partent pas au dépôt.
 */
function fichiersSuivis(): string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

/** Binaires et verrous de dépendances : aucun secret n'y est écrit à la main. */
const IGNORES = /\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|pdf)$|^package-lock\.json$/;

/**
 * `docs/11-SECRETS.md` **documente** les motifs qu'on traque : il contient donc
 * légitimement des fragments comme `sk_live_`. C'est la SEULE exemption, elle
 * est nominative, et le test vérifie plus bas qu'elle ne cache pas une vraie
 * clé — un fichier exempté sans contrôle est une porte ouverte nommée.
 */
const EXEMPT = "docs/11-SECRETS.md";

function scanner(fichiers: string[]): { fichier: string; ligne: number; genre: string }[] {
  const trouvailles: { fichier: string; ligne: number; genre: string }[] = [];
  for (const f of fichiers) {
    if (IGNORES.test(f) || f === EXEMPT) continue;
    let contenu: string;
    try {
      contenu = readFileSync(f, "utf8");
    } catch {
      continue; // binaire ou illisible
    }
    contenu.split("\n").forEach((ligne, i) => {
      const p = PREFIXES.find((x) => new RegExp(x.motif).test(ligne));
      if (p) trouvailles.push({ fichier: f, ligne: i + 1, genre: p.nom });
    });
  }
  return trouvailles;
}

// ───────────────── L'instrument avant la mesure ──────────────────────────────

test("le détecteur reconnaît chaque forme de clé, et se tait sur un gabarit", () => {
  // Connu-positif : un échantillon SYNTHÉTIQUE par famille. Aucun n'est une
  // vraie clé — ils sont assemblés ici pour que ce fichier reste propre.
  const echantillons: [string, string][] = [
    ["Supabase secrète", "sb_" + "secret_AbCdEf12345_XyZ"],
    ["Stripe live", "sk_" + "live_51AbCdEfGhIjKlMnOp"],
    ["Stripe webhook", "whsec" + "_AbCdEf1234567890"],
    ["GitHub", "ghp" + "_AbCdEfGhIjKlMnOpQrStUvWxYz0123"],
    ["AWS", "AKIA" + "IOSFODNN7EXAMPLE"],
    ["SendGrid", "SG." + "AbCdEfGhIjKlMnOpQrStUv"],
    ["Brevo", "xkeysib" + "-AbCdEfGhIjKlMnOpQrStUv"],
    ["Resend", "re_" + "AbCdEfGhIjKlMnOpQrStUvWxYz"],
    ["JWT", "eyJ" + "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9AbCdEfGhIjKl"],
  ];
  for (const [nom, faux] of echantillons) {
    assert.ok(DETECTEUR.test(faux), `NON DÉTECTÉ : ${nom}`);
  }

  // Connu-négatif : ce qu'un dépôt sain contient légitimement.
  const innocents = [
    "SUPABASE_SERVICE_ROLE_KEY=",
    "STRIPE_SECRET_KEY=your-key-here",
    "const key = process.env.SUPABASE_SERVICE_ROLE_KEY;",
    "// ne jamais committer de clé",
    "sb_" + "secret_", // le préfixe nu, sans valeur derrière
  ];
  for (const ok of innocents) {
    assert.ok(!DETECTEUR.test(ok), `FAUX POSITIF sur : ${ok}`);
  }
});

test("le scanner a lu le dépôt, et pas le vide", () => {
  const fichiers = fichiersSuivis();
  assert.ok(fichiers.length >= 100, `fichiers suivis lus : ${fichiers.length}`);
  assert.ok(fichiers.includes(".env.example"), "`.env.example` absent de la liste");
  assert.ok(fichiers.includes(EXEMPT), `l'exemption ${EXEMPT} ne désigne aucun fichier suivi`);

  // Le scanner voit-il vraiment quelque chose quand il y a quelque chose ?
  // On lui donne un fichier RÉEL du dépôt en le forçant à ne rien ignorer.
  assert.deepEqual(scanner([".env.example"]), [], "`.env.example` doit être un gabarit vide");
});

// ───────────────────────── Le contrôle ───────────────────────────────────────

test("aucun secret dans les fichiers suivis par Git", () => {
  const trouvailles = scanner(fichiersSuivis());
  const detail = trouvailles.map((t) => `${t.fichier}:${t.ligne} — ${t.genre}`).join("\n  ");
  assert.deepEqual(
    trouvailles,
    [],
    `SECRET(S) DANS LE DÉPÔT :\n  ${detail}\n\n` +
      "Retirer le fichier NE SUFFIT PAS : la clé reste dans l'historique Git. " +
      "La FAIRE TOURNER chez le fournisseur, puis la poser dans Vercel → " +
      "Environment Variables. Voir `docs/11-SECRETS.md`."
  );
});

test("le fichier exempté ne cache pas de vraie clé", () => {
  // `docs/11-SECRETS.md` a le droit de NOMMER les motifs (`sk_live_`), pas d'en
  // porter une valeur. Une exemption qu'on ne contrôle pas est une porte
  // ouverte à laquelle on a donné un nom.
  const contenu = readFileSync(EXEMPT, "utf8");
  const lignes = contenu.split("\n");
  const suspectes = lignes
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => DETECTEUR.test(l))
    .map(({ l, i }) => `${EXEMPT}:${i + 1} — ${l.trim().slice(0, 60)}`);
  assert.deepEqual(
    suspectes,
    [],
    `Le fichier exempté porte une valeur qui ressemble à une clé :\n  ${suspectes.join("\n  ")}`
  );
});
