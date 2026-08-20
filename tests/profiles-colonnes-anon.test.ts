import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * C3.1 (docs/31) — le croisement CODE × liste blanche de colonnes.
 *
 * `supabase/tests/colonnes_liste_blanche.test.sql` garde la BASE : toute
 * colonne de `profiles` est accordée, ou déclarée privée avec sa raison. Ce
 * fichier-ci garde le CODE, et les deux sont nécessaires — la base peut être
 * parfaitement déclarée pendant qu'une page demande une colonne réservée avec
 * la clé anon. C'est exactement ce qui s'est passé.
 *
 * ⚠️ CE QUE ÇA A COÛTÉ, mesuré en production le 2026-08-18 sous le rôle
 * `anon` réel : `/createur/[id]` et `/boutik/[slug]` en 404 pour tout le
 * monde, le filtre acheteur par zone à zéro vendeur, et aucune adresse de
 * boutique attribuée depuis `0083`. Quatre chemins, une seule cause — la
 * liste blanche de `0015` est FERMÉE, et `0069`/`0083` ont ajouté des
 * colonnes sans l'ouvrir.
 *
 * ⚠️ ET DEUX TESTS STRUCTURELS ÉTAIENT VERTS PENDANT CE TEMPS. Ils
 * asserttaient la PRÉSENCE de la ligne `.select("…, zone_id, pwen_repe")` —
 * c'est-à-dire précisément la ligne qui était refusée. Un test qui épingle le
 * texte du code ne peut pas dire que ce texte ne marche pas ; il le fige.
 * D'où la forme de ce fichier : il n'assertte aucune ligne, il croise la
 * liste des colonnes DEMANDÉES avec celle des colonnes ACCORDÉES, et la
 * seconde est lue dans la migration, pas recopiée ici.
 *
 * ⚠️ Il suffit de CITER une colonne réservée dans un `where` pour que toute
 * la requête soit refusée (`42501`) — elle n'a pas besoin d'être demandée en
 * sortie. Les filtres comptent donc autant que les `select`.
 */

// ── Les colonnes accordées, LUES DANS 0015 — jamais recopiées ───────────────
// La liaison est ici : si quelqu'un modifie le grant, ce test suit. Recopier
// la liste en dur ferait un test qui décrit un état de 2026 pour toujours.
const M0015 = readFileSync(
  "supabase/migrations/0015_profiles_hardening.sql",
  "utf8"
);
const GRANT =
  /grant\s+select\s*\(([^)]*)\)\s*\n?\s*on profiles to anon, authenticated/i.exec(
    M0015
  );

test("la liste blanche de 0015 est lisible — sans elle, tout ce fichier serait vide de sens", () => {
  assert.ok(
    GRANT,
    "le `grant select (…) on profiles to anon, authenticated` de 0015 est introuvable : si le grant a changé de forme, ce test croiserait contre une liste vide et passerait au vert en ne vérifiant rien"
  );
});

const ACCORDEES = new Set(
  (GRANT?.[1] ?? "").split(",").map((c) => c.trim()).filter(Boolean)
);

const TOUTES_COLONNES = [
  "id", "role", "display_name", "bio", "avatar_url", "created_at", "tier",
  "country_code", "region_code", "suspended_at", "suspended_reason",
  "suspended_by", "zone_id", "pwen_repe", "boutik_slug",
];
const RESERVEES = TOUTES_COLONNES.filter((c) => !ACCORDEES.has(c));

// ── Le parcours des fichiers ───────────────────────────────────────────────
function fichiers(racine: string): string[] {
  const out: string[] = [];
  const pile = [racine];
  while (pile.length) {
    const d = pile.pop()!;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        if (e !== "node_modules" && e !== ".next") pile.push(p);
      } else if (/\.(ts|tsx)$/.test(e)) out.push(p);
    }
  }
  return out;
}

/** Le client d'un site est-il celui du service (RLS et grants contournés) ? */
function estClientDeService(source: string, ident: string): boolean {
  const decl = new RegExp(
    `(?:const|let|var)\\s+${ident}\\b[^;\\n]*=\\s*(?:await\\s+)?createAdminClient\\s*\\(`
  );
  return decl.test(source);
}

type Site = { fichier: string; ident: string; chaine: string; entiere: boolean };

/**
 * Les commentaires sont retirés AVANT de découper les chaînes.
 *
 * ⚠️ Ce n'est pas de la cosmétique — c'est le correctif d'un défaut de ce
 * fichier même, trouvé à l'audit du 2026-08-18. La première version découpait
 * la chaîne PostgREST au premier `;` rencontré dans le texte brut. Dans
 * `app/api/profile/route.ts`, un `;` vit à l'intérieur d'un COMMENTAIRE, 150
 * caractères avant le `.eq("id", …)` : la chaîne était coupée à cet endroit,
 * l'extracteur rendait `[]`, et ce vide se lisait comme « ce site ne lit
 * aucune colonne réservée ». Un `.eq("boutik_slug", …)` placé après ce
 * commentaire serait passé inaperçu.
 *
 * C'est très exactement le défaut que ce fichier existe pour attraper, commis
 * par l'outil qui l'attrape : l'instrument ne lisait rien, et son silence
 * ressemblait à une réussite.
 */
function sansCommentaires(src: string): string {
  // Les chaînes sont préservées : un `//` dans une URL n'est pas un
  // commentaire, et un `/*` dans un libellé non plus.
  return src.replace(
    /(["'`])(?:\\.|(?!\1)[^\\])*\1|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (m) => (/^["'`]/.test(m) ? m : " ")
  );
}

function sitesProfils(): Site[] {
  const sites: Site[] = [];
  for (const f of ["app", "lib", "components"].flatMap(fichiers)) {
    const src = sansCommentaires(readFileSync(f, "utf8"));
    const re = /(\w+)\s*\r?\n?\s*\.from\("profiles"\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      // La chaîne PostgREST court jusqu'au `;` qui la termine.
      const suite = src.slice(m.index, m.index + 2000);
      const fin = suite.indexOf(";");
      sites.push({
        fichier: f,
        ident: m[1],
        chaine: fin === -1 ? suite : suite.slice(0, fin),
        entiere: fin !== -1,
      });
    }
  }
  return sites;
}

/**
 * Les colonnes qu'une chaîne PostgREST LIT — et elles seules.
 *
 * ⚠️ La distinction n'est pas cosmétique : `0015` n'a révoqué que le SELECT.
 * Mesuré sous `anon` le 2026-08-18, `update profiles set pwen_repe='x',
 * zone_id=null where id = …` **PASSE**. Enregistrer son profil marche, et a
 * toujours marché. Compter les clés d'un `.update({…})` comme des lectures
 * ferait rougir le test sur du code sain — et un test qui crie à tort finit
 * désarmé, ce qui est pire que pas de test du tout.
 *
 * Sont donc lus : les champs d'un `.select("…")`, et le PREMIER argument des
 * méthodes de filtre — car un filtre exige le droit de lecture tout autant
 * qu'une projection.
 */
const FILTRES =
  "eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|overlaps|textSearch|filter|not|order";

function colonnesLues(chaine: string): string[] {
  const lues: string[] = [];

  for (const m of chaine.matchAll(/\.select\(\s*[`"']([^`"']*)[`"']/g)) {
    for (const champ of m[1].split(",")) {
      const nom = champ.trim().replace(/^.*:/, "").replace(/\(.*$/, "").trim();
      if (/^[a-z_][a-z0-9_]*$/i.test(nom)) lues.push(nom);
    }
  }

  for (const m of chaine.matchAll(
    new RegExp(`\\.(?:${FILTRES})\\(\\s*[\`"']([^\`"']+)[\`"']`, "g")
  )) {
    lues.push(m[1].trim());
  }

  // `.match({ col: val })` filtre par égalité sur ses clés.
  for (const m of chaine.matchAll(/\.match\(\s*\{([^}]*)\}/g)) {
    for (const p of m[1].split(",")) {
      const cle = p.split(":")[0].trim().replace(/["'`]/g, "");
      if (/^[a-z_][a-z0-9_]*$/i.test(cle)) lues.push(cle);
    }
  }

  return [...new Set(lues)];
}

/**
 * Les fichiers dont le client est INJECTÉ (paramètre de fonction) : on ne peut
 * pas le résoudre en lisant le fichier seul. Chacun exige donc une assertion
 * de LIAISON séparée sur son appelant — voir le test dédié plus bas.
 */
const CLIENT_INJECTE: Record<string, string> = {
  "lib/boutik-slug-attribution.ts":
    "client passé en paramètre ; l'appelant unique est app/api/profile/route.ts, dont la liaison est assertée ci-dessous",
  "lib/geo/country-backfill.ts":
    "paramètre nommé `admin`, imposé par la signature (SupabaseClient de service)",
};

test("aucun site à clé anon ne cite une colonne réservée de profiles", () => {
  assert.ok(
    RESERVEES.length > 0,
    "aucune colonne réservée : le croisement ne pourrait rien trouver"
  );

  const fautes: string[] = [];
  const injectesVus = new Set<string>();

  for (const s of sitesProfils()) {
    const rel = s.fichier.replace(/\\/g, "/");
    // Une chaîne tronquée est un ÉCHEC, jamais un silence : sans ce contrôle,
    // un site trop long serait analysé à moitié et son `[]` se lirait comme
    // « rien à signaler ».
    assert.ok(
      s.entiere,
      `${rel} — chaîne PostgREST sans \`;\` dans les 2000 caractères suivants : l'analyse serait partielle, et son résultat vide ne prouverait rien`
    );

    if (rel in CLIENT_INJECTE) {
      injectesVus.add(rel);
      continue;
    }
    if (estClientDeService(readFileSync(s.fichier, "utf8"), s.ident)) continue;

    for (const col of colonnesLues(s.chaine)) {
      if (RESERVEES.includes(col)) {
        fautes.push(
          `${rel} — « ${col} » LUE ou FILTRÉE avec le client de session (${s.ident})`
        );
      }
    }
  }

  assert.deepEqual(
    fautes,
    [],
    `Colonne(s) de profiles hors liste blanche demandée(s) avec la clé anon :\n  ${fautes.join(
      "\n  "
    )}\nPostgreSQL refuse TOUTE la requête (42501) — y compris quand la colonne n'apparaît que dans un filtre. Passez par zabelie_boutik_public / zabelie_vande_nan_zon (0084), ou par le client de service.\nColonnes accordées par 0015 : ${[
      ...ACCORDEES,
    ].join(", ")}`
  );

  // Les exemptions se périment DANS LES DEUX SENS : un fichier déclaré
  // « client injecté » qui n'interroge plus profiles doit sortir de la liste,
  // sinon elle ne sait que grandir.
  for (const rel of Object.keys(CLIENT_INJECTE)) {
    assert.ok(
      injectesVus.has(rel),
      `${rel} est déclaré « client injecté » mais n'interroge plus profiles — retirez-le de CLIENT_INJECTE`
    );
  }
});

test("la liaison — TOUT appelant d'un module à client injecté passe le client de SERVICE", () => {
  /* ⚠️ RÉÉCRIT À L'AUDIT DU 2026-08-18. La version précédente nommait un seul
     appelant (`app/api/profile/route.ts`) et vérifiait son argument. Elle
     était juste et insuffisante : la sûreté de `CLIENT_INJECTE` repose sur
     l'ENSEMBLE des appelants, et rien n'épinglait cet ensemble. Un second
     appelant passant le client de session serait entré sans un rouge — dans
     le fichier même dont l'exemption dépend de cette liaison.

     Les appelants sont donc énumérés mécaniquement, pas nommés. L'assertion
     porte sur ce qui COMMANDE : le premier argument de chaque appel. */
  const MODULES: { fonction: string; pourquoi: string }[] = [
    {
      fonction: "attribuerSlug",
      pourquoi:
        "son premier `select boutik_slug` est refusé (42501) avec la clé anon, et le module ne peut pas le voir — il ne guette que 42703 (colonne absente), si bien que le refus se journalise en « colonne_absente »",
    },
    {
      fonction: "backfillCountry",
      pourquoi: "il écrit `country_code`, colonne réservée au service_role depuis 0015",
    },
  ];

  for (const { fonction, pourquoi } of MODULES) {
    const appels: string[] = [];
    for (const f of ["app", "lib", "components"].flatMap(fichiers)) {
      const src = sansCommentaires(readFileSync(f, "utf8"));
      // L'appel, pas l'import ni la déclaration.
      for (const m of src.matchAll(
        new RegExp(`(?<!function\\s)\\b${fonction}\\(\\s*([A-Za-z_$][\\w$]*(?:\\(\\))?)`, "g")
      )) {
        if (/^(export|import)/.test(src.slice(Math.max(0, m.index - 30), m.index))) continue;
        const arg = m[1];
        const service =
          arg === "createAdminClient()" || estClientDeService(src, arg);
        appels.push(`${f} → ${arg}${service ? "" : "   ⛔"}`);
      }
    }

    assert.ok(
      appels.length > 0,
      `aucun appel de ${fonction} trouvé : soit il est mort, soit la détection ne l'attrape plus — dans les deux cas ce test ne vérifie plus rien`
    );
    assert.deepEqual(
      appels.filter((a) => a.includes("⛔")),
      [],
      `${fonction} reçoit un client de session quelque part — ${pourquoi}.\nAppels vus :\n  ${appels.join("\n  ")}`
    );
  }
});

test("la fiche publique passe par la fonction 0084, pas par un select direct", () => {
  const CREATORS = readFileSync("lib/creators.ts", "utf8");
  assert.match(
    CREATORS,
    /supabase\.rpc\("zabelie_boutik_public",\s*critere\)/,
    "getCreator/getCreatorBySlug doivent appeler la fonction — un select direct sur profiles est refusé dès qu'il cite zone_id, pwen_repe ou boutik_slug"
  );
  const ZONES = readFileSync("lib/zones.ts", "utf8");
  assert.match(
    ZONES,
    /supabase\.rpc\(\s*\n?\s*"zabelie_vande_nan_zon"/,
    "getSellerIdsInZone doit passer par la fonction — `.in(\"zone_id\", …)` fait refuser toute la requête"
  );
});
