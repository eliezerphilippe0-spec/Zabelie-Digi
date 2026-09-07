#!/usr/bin/env node
/**
 * LE DÉPLOIEMENT A-T-IL VRAIMENT ABOUTI ? — contrôle d'après-fusion.
 *
 * Pourquoi ce script existe. `/api/readyz` sonde le chemin des ACHETEURS —
 * client anon, PostgREST, RLS — et rend 503 quand la base ne répond pas. Il
 * était en place depuis `docs/30`, correct, publiquement exposé… et **personne
 * ne l'appelait**. Ni la CI, ni les huit crons, ni un contrôle après
 * déploiement. C'est le motif « code sans appelant » de `CLAUDE.md` appliqué à
 * la vérification du déploiement : l'instrument existe, il n'a jamais servi.
 *
 * Les géants font tourner un *canary* sur un pourcentage du trafic réel. À 0
 * utilisateur il n'y a pas de trafic à découper — la version utile ici tient en
 * une phrase : **après chaque fusion, quelqu'un appelle la sonde et crie si
 * elle ne répond pas.**
 *
 * ─── LES TROIS FAÇONS DONT CE GENRE DE CONTRÔLE MENT ────────────────────────
 * Chacune produit un vert qui ne veut rien dire, et chacune est gardée ici :
 *
 *   1. **L'URL manquante lue comme un succès.** Un contrôle qui « saute » faute
 *      de configuration est PIRE que pas de contrôle : il rassure. Ici,
 *      l'absence d'URL est un ÉCHEC.
 *   2. **Le réseau injoignable lu comme un succès.** Un `try/catch` qui avale
 *      l'erreur, épuise ses essais et sort en 0 dit « tout va bien » alors que
 *      rien n'a répondu. Ici, l'épuisement est un ÉCHEC.
 *   3. **Le 200 pris pour argent comptant.** Une page d'erreur servie en 200
 *      passerait. On exige donc `ok: true` DANS le corps — c'est le contrat de
 *      `readyz`, et il coûte une ligne à vérifier.
 *
 * ⚠️ Ce que ce contrôle NE dit pas : que le déploiement sert le dernier
 * commit. `readyz` n'expose ni version ni schéma — délibérément, il est public.
 * Il dit « le site répond et la base derrière lui aussi ». C'est déjà tout ce
 * qui manquait.
 */

/** Budget par défaut : Vercel déploie en général sous une minute. */
export const ESSAIS_PAR_DEFAUT = 10;
export const ATTENTE_MS_PAR_DEFAUT = 6000;

/**
 * @param {{url?: string, fetchFn?: typeof fetch, essais?: number,
 *          attendreMs?: number, dormir?: (ms: number) => Promise<void>,
 *          journal?: (ligne: string) => void}} options
 * @returns {Promise<{ok: boolean, motif: string, tentatives: number}>}
 */
export async function verifierDeploiement({
  url,
  fetchFn = fetch,
  essais = ESSAIS_PAR_DEFAUT,
  attendreMs = ATTENTE_MS_PAR_DEFAUT,
  dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
  journal = () => {},
} = {}) {
  // (1) Pas d'URL : ÉCHEC, jamais un saut silencieux.
  const base = (url ?? "").trim();
  if (!base) {
    return {
      ok: false,
      motif:
        "URL absente — posez ZABELIE_URL. Un contrôle qui saute faute de configuration rassure sans rien vérifier.",
      tentatives: 0,
    };
  }

  const cible = `${base.replace(/\/+$/, "")}/api/readyz`;
  let dernier = "aucune tentative";

  for (let n = 1; n <= essais; n++) {
    try {
      const res = await fetchFn(cible, {
        headers: { "Cache-Control": "no-cache" },
      });
      let corps = null;
      try {
        corps = await res.json();
      } catch {
        corps = null;
      }

      // (3) Le corps décide, pas seulement le code.
      if (res.status === 200 && corps && corps.ok === true) {
        journal(`✓ ${cible} — 200, ok:true (tentative ${n}, ${corps.latencyMs ?? "?"} ms côté base)`);
        return { ok: true, motif: `200 ok:true en ${n} tentative(s)`, tentatives: n };
      }
      dernier = `HTTP ${res.status}, corps ${corps ? JSON.stringify(corps) : "illisible"}`;
    } catch (e) {
      dernier = `injoignable : ${e instanceof Error ? e.message : String(e)}`;
    }

    journal(`… tentative ${n}/${essais} — ${dernier}`);
    if (n < essais) await dormir(attendreMs);
  }

  // (2) Essais épuisés : ÉCHEC. Le silence n'est pas un succès.
  return {
    ok: false,
    motif: `${essais} tentative(s) sans réponse saine. Dernière : ${dernier}`,
    tentatives: essais,
  };
}

/* Exécution directe : la sortie non nulle fait rougir le workflow.
 *
 * Enveloppé dans une fonction async — PAS de `await` de haut niveau : le
 * fichier est importé par `tests/verifier-deploiement.test.ts`, et un
 * top-level await casse la transformation du lanceur de tests. Un script
 * qu'on ne peut pas importer est un script qu'on ne peut pas éprouver. */
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const r = await verifierDeploiement({
      url: process.env.ZABELIE_URL ?? process.argv[2],
      journal: (l) => console.log(l),
    });
    if (!r.ok) {
      console.error(`✗ Déploiement NON vérifié — ${r.motif}`);
      process.exit(1);
    }
    console.log(`✓ Déploiement vérifié — ${r.motif}`);
  })();
}
