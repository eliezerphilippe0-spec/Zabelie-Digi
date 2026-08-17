import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attribuerSlug, ESSAIS_MAX } from "../lib/boutik-slug-attribution";

/**
 * L'ENTRÉE DU CHEMIN OUVERT PAR `0083` (2026-08-17).
 *
 * La migration a rempli les profils EXISTANTS et s'est arrêtée là. Sans ce
 * module, tout vendeur inscrit après elle repartagerait un UUID sur WhatsApp
 * — le chantier annulé pour les seules personnes qui comptent, les
 * prochaines. Une colonne qui ne se remplit qu'une fois est un artefact sans
 * appelant, et ce dépôt connaît le motif.
 */

/** Faux client Supabase : enregistre ce qu'on lui demande, rend ce qu'on veut. */
function faux(opts: {
  actuel?: { boutik_slug?: string | null } | null;
  erreurLecture?: { code?: string; message?: string };
  voisins?: string[];
  /** Codes d'erreur rendus par les `update` successifs. `null` = succès. */
  updates?: (string | null)[];
}) {
  const ecrits: string[] = [];
  const motifs: string[] = [];
  let iUpdate = 0;
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: opts.actuel ?? null,
                  error: opts.erreurLecture ?? null,
                }),
              };
            },
            like(_col: string, motif: string) {
              motifs.push(motif);
              return {
                limit: async () => ({
                  data: (opts.voisins ?? []).map((s) => ({ boutik_slug: s })),
                  error: null,
                }),
              };
            },
          };
        },
        update(patch: { boutik_slug: string }) {
          ecrits.push(patch.boutik_slug);
          const code = (opts.updates ?? [null])[iUpdate++] ?? null;
          return {
            eq() {
              return { is: async () => ({ error: code ? { code } : null }) };
            },
          };
        },
      };
    },
  };
  return { client: client as never, ecrits, motifs };
}

async function sansBruit<T>(f: () => Promise<T>): Promise<[T, string]> {
  const vrai = console.log;
  let sortie = "";
  console.log = (...a: unknown[]) => {
    sortie += a.map(String).join(" ") + "\n";
  };
  try {
    return [await f(), sortie];
  } finally {
    console.log = vrai;
  }
}

// ── Le cas normal ──────────────────────────────────────────────────────────

test("un profil sans adresse en reçoit une, dépliée des accents", async () => {
  const f = faux({ actuel: { boutik_slug: null } });
  assert.equal(await attribuerSlug(f.client, "u1", "Marie Jakmèl"), "attribue");
  assert.deepEqual(f.ecrits, ["marie-jakmel"]);
});

test("une adresse existante n'est JAMAIS remplacée", async () => {
  /* Une adresse qui suivrait le nom casserait tous les liens déjà envoyés
   * dans des conversations — et personne ne revient corriger un message
   * WhatsApp de la semaine dernière. Renommer sa boutique et déménager sont
   * deux gestes différents. */
  const f = faux({ actuel: { boutik_slug: "ancienne-adresse" } });
  assert.equal(await attribuerSlug(f.client, "u1", "Tout Autre Nom"), "deja");
  assert.deepEqual(f.ecrits, [], "aucune écriture ne doit partir");
});

test("l'écriture porte la garde `is null` — la lecture n'est pas une réservation", () => {
  /* Entre la lecture et l'écriture, une autre requête peut avoir attribué une
   * adresse. `is("boutik_slug", null)` fait que l'UPDATE ne mord que si la
   * colonne est encore vide : c'est la base qui garantit, pas notre
   * instantané. */
  const SRC = readFileSync("lib/boutik-slug-attribution.ts", "utf8");
  assert.match(SRC, /\.eq\("id", userId\)\s*\n\s*\.is\("boutik_slug", null\)/);
});

// ── Les collisions ─────────────────────────────────────────────────────────

test("un voisinage déjà pris fait glisser le suffixe", async () => {
  const f = faux({
    actuel: { boutik_slug: null },
    voisins: ["marie-jakmel", "marie-jakmel-2"],
  });
  assert.equal(await attribuerSlug(f.client, "u1", "Marie Jakmèl"), "attribue");
  assert.deepEqual(f.ecrits, ["marie-jakmel-3"]);
});

test("le voisinage est lu SUR PRÉFIXE, pas le répertoire entier", async () => {
  const f = faux({ actuel: { boutik_slug: null } });
  await attribuerSlug(f.client, "u1", "Marie Jakmèl");
  assert.deepEqual(f.motifs, ["marie-jakmel%"]);
});

test("une violation d'unicité fait reprendre au candidat suivant", async () => {
  /* Deux inscriptions simultanées peuvent viser le même slug. L'index unique
   * de `0083` tranche — et c'est LUI l'autorité, pas notre lecture. */
  const f = faux({
    actuel: { boutik_slug: null },
    updates: ["23505", null],
  });
  assert.equal(await attribuerSlug(f.client, "u1", "Marie Jakmèl"), "attribue");
  assert.deepEqual(f.ecrits, ["marie-jakmel", "marie-jakmel-2"]);
});

test("les collisions sont BORNÉES — pas de boucle sur une table", async () => {
  const f = faux({
    actuel: { boutik_slug: null },
    updates: Array(ESSAIS_MAX + 3).fill("23505"),
  });
  const [r, journal] = await sansBruit(() => attribuerSlug(f.client, "u1", "Marie Jakmèl"));
  assert.equal(r, "echec");
  assert.equal(f.ecrits.length, ESSAIS_MAX, "exactement le plafond, ni plus ni moins");
  assert.match(journal, /"code":"ZB087"/);
});

// ── Les dégradations, et ce qu'elles disent ────────────────────────────────

test("colonne absente (0083 pas appliquée) : on renonce, on ne casse pas", async () => {
  /* Le code se déploie seul, les migrations attendent un geste. Entre les
   * deux, `boutik_slug` n'existe pas — et un profil doit rester
   * enregistrable. */
  const f = faux({ erreurLecture: { code: "42703", message: "column does not exist" } });
  const [r, journal] = await sansBruit(() => attribuerSlug(f.client, "u1", "Marie"));
  assert.equal(r, "colonne_absente");
  assert.deepEqual(f.ecrits, []);
  assert.match(journal, /"issue":"colonne_absente"/);
});

test("un nom sans matière ne produit pas d'adresse inventée", async () => {
  const f = faux({ actuel: { boutik_slug: null } });
  const [r, journal] = await sansBruit(() => attribuerSlug(f.client, "u1", "!!!"));
  assert.equal(r, "sans_matiere");
  assert.deepEqual(f.ecrits, []);
  assert.match(journal, /"issue":"sans_matiere"/);
});

test("le cas ordinaire ne fait PAS de bruit", async () => {
  /* Une ligne de journal par enregistrement de profil noierait les seules
   * qui comptent : celles qui expliquent pourquoi un vendeur partage encore
   * un UUID. */
  const f = faux({ actuel: { boutik_slug: null } });
  const [, j1] = await sansBruit(() => attribuerSlug(f.client, "u1", "Marie Jakmèl"));
  assert.equal(j1, "");
  const g = faux({ actuel: { boutik_slug: "deja-la" } });
  const [, j2] = await sansBruit(() => attribuerSlug(g.client, "u1", "Marie"));
  assert.equal(j2, "");
});

// ── L'appelant ─────────────────────────────────────────────────────────────

test("la route profil APPELLE l'attribution — sinon la colonne ne se remplit qu'une fois", () => {
  const ROUTE = readFileSync("app/api/profile/route.ts", "utf8");
  assert.match(ROUTE, /await attribuerSlug\(/);
  assert.match(ROUTE, /from "@\/lib\/boutik-slug-attribution"/);
});

test("l'attribution est BEST-EFFORT : elle ne peut pas faire échouer un enregistrement", () => {
  /* Quelqu'un qui corrige son nom a fait ce qu'il voulait faire. Lui rendre
   * une erreur parce qu'une adresse n'a pas pu être calculée serait punir la
   * bonne action. La liaison : l'appel est DANS un `try`, et le `catch` ne
   * renvoie rien à l'écran. */
  const ROUTE = readFileSync("app/api/profile/route.ts", "utf8");
  assert.match(
    ROUTE,
    /try \{\s*\n\s*await attribuerSlug\([\s\S]{0,300}\} catch \(e\) \{[\s\S]{0,400}console\.log\(/
  );
  // Et elle vient APRÈS que le profil soit enregistré : l'ordre est la règle.
  const iUpdate = ROUTE.indexOf('.from("profiles")');
  const iSlug = ROUTE.indexOf("await attribuerSlug(");
  assert.ok(iUpdate > 0 && iSlug > iUpdate, "l'adresse s'attribue après l'enregistrement");
});
