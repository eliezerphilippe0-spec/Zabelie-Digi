import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `.env.example` doit documenter TOUTE variable que le code lit — et rien de plus.
 *
 * ⚠️ CONSTAT QUI A PRODUIT CE FICHIER (audit `docs/41` §7.5, 2026-08-20) :
 * le code lisait **32** variables, `.env.example` en documentait **21**. Onze
 * manquaient, dont `OPENAI_API_KEY`, les deux `NEXT_PUBLIC_WHATSAPP_*` et
 * `ZABELIE_DEMO_FIXTURES`. Rien ne cassait : un environnement démarré sur ce
 * fichier partait simplement **amputé**, et chaque fonctionnalité manquante se
 * taisait à sa manière — l'assistant de description ne répondait plus, le
 * canal de contact disparaissait de l'écran. Aucune erreur, nulle part.
 *
 * C'est la même famille que les colonnes invisibles de `profiles` : une liste
 * FERMÉE que personne ne rouvre en même temps que le code grandit.
 *
 * Le croisement va DANS LES DEUX SENS. Une variable documentée que plus rien
 * ne lit est un piège inverse : on la pose consciencieusement dans un nouvel
 * environnement, elle ne sert à rien, et elle fait croire que le fichier est à
 * jour.
 */

const FICHIER = ".env.example";

/**
 * Injectées par la plateforme de déploiement, jamais posées à la main.
 * Les documenter inviterait à les renseigner — ce qui écraserait la valeur
 * que Vercel calcule.
 */
const INJECTEES_PAR_VERCEL: Record<string, string> = {
  VERCEL_URL: "injectée par Vercel à chaque déploiement (hôte, sans protocole)",
  NEXT_PUBLIC_VERCEL_URL: "idem, exposée au navigateur",
  // `production` · `preview` · `development` — lue par `garderProduction`
  // (lib/moncash.ts) pour refuser un paiement en bac à sable UNIQUEMENT sur
  // un déploiement de production. La poser à la main en local simulerait
  // la production, ce qui est précisément ce qu'on ne veut pas.
  VERCEL_ENV: "injectée par Vercel : production, preview ou development",
};

function fichiersSource(): string[] {
  const out: string[] = ["middleware.ts"];
  const pile = ["app", "lib", "components"];
  while (pile.length) {
    const d = pile.pop()!;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        if (e !== "node_modules" && e !== ".next") pile.push(p);
      } else if (/\.(ts|tsx)$/.test(e)) out.push(p);
    }
  }
  return out.filter((f) => {
    try {
      return statSync(f).isFile();
    } catch {
      return false;
    }
  });
}

/** Les variables que le code lit, avec l'endroit où il les lit. */
function luesParLeCode(): Map<string, string[]> {
  const vues = new Map<string, string[]>();
  for (const f of fichiersSource()) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const liste = vues.get(m[1]) ?? [];
      if (!liste.includes(f)) liste.push(f);
      vues.set(m[1], liste);
    }
  }
  return vues;
}

/** Les clés déclarées dans `.env.example`, commentées ou non. */
function declarees(): string[] {
  return readFileSync(FICHIER, "utf8")
    .split("\n")
    .map((l) => /^\s*#?\s*([A-Z0-9_]+)=/.exec(l)?.[1])
    .filter((k): k is string => Boolean(k));
}

test("les deux inventaires sont lisibles — sinon les comparaisons ne prouvent rien", () => {
  const lues = luesParLeCode();
  const dec = declarees();
  assert.ok(
    lues.size >= 25,
    `seulement ${lues.size} variable(s) trouvée(s) dans le code : l'extraction est cassée, et « rien ne manque » serait le vert du vide`
  );
  assert.ok(dec.length >= 25, `seulement ${dec.length} clé(s) lues dans ${FICHIER}`);
});

test("aucune clé en double dans .env.example", () => {
  /* Un doublon n'est pas cosmétique : la seconde occurrence écrase la
     première au chargement, donc le commentaire qu'on lit n'est pas celui qui
     s'applique. (Introduits puis retirés le 2026-08-20 — d'où cette ligne.) */
  const vues = declarees();
  const doublons = [...new Set(vues.filter((k, i) => vues.indexOf(k) !== i))].sort();
  assert.deepEqual(doublons, [], `Clé(s) déclarée(s) deux fois : ${doublons.join(", ")}`);
});

test("toute variable lue par le code est documentée", () => {
  const dec = new Set(declarees());
  const manquantes = [...luesParLeCode().entries()]
    .filter(([nom]) => !dec.has(nom) && !(nom in INJECTEES_PAR_VERCEL))
    .map(([nom, ou]) => `${nom}  (lue dans ${ou.slice(0, 2).join(", ")})`)
    .sort();

  assert.deepEqual(
    manquantes,
    [],
    `Variable(s) lue(s) par le code et absente(s) de ${FICHIER} :\n  ${manquantes.join(
      "\n  "
    )}\nUn environnement monté sur ce fichier démarrera amputé, et la fonctionnalité correspondante se taira sans erreur. Ajoutez-la avec ce qui disparaît quand elle manque — pas seulement son nom.`
  );
});

test("toute variable documentée est réellement lue — l'exemption se périme aussi", () => {
  const lues = luesParLeCode();
  const mortes = declarees()
    .filter((k) => !lues.has(k) && !(k in INJECTEES_PAR_VERCEL))
    .sort();

  assert.deepEqual(
    mortes,
    [],
    `Variable(s) documentée(s) que plus aucun code ne lit :\n  ${mortes.join(
      "\n  "
    )}\nOn la posera consciencieusement dans un nouvel environnement, elle ne servira à rien, et elle fera croire que le fichier est à jour. Retirez-la, ou dites où elle sert.`
  );

  for (const [nom, raison] of Object.entries(INJECTEES_PAR_VERCEL)) {
    assert.ok(
      lues.has(nom),
      `${nom} est déclarée « injectée par Vercel » mais plus aucun code ne la lit — retirez-la de INJECTEES_PAR_VERCEL (${raison})`
    );
  }
});
