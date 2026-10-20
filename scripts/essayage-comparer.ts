/**
 * Essayage virtuel — comparaison À L'AVEUGLE des fournisseurs (docs/74 §4.2 ;
 * tasks/essayage-todo.md 2.3).
 *
 *   node --import tsx scripts/essayage-comparer.ts --candidats genlook,fashn \
 *     --photos <dossier hors dépôt> --produits <produits.json> --sortie <dossier hors dépôt> [--payer] [--graine N]
 *
 * À BLANC par défaut : compte les essais et annonce le coût, sans un seul
 * appel. `--payer` appelle vraiment (clés `GENLOOK_API_KEY`, `FASHN_API_KEY`
 * de l'environnement local), après accord du porteur sur le coût annoncé.
 *
 * Sortie (refusée dans le dépôt : ce sont des photos de vraies personnes) :
 *   planche.html                        résultats mélangés, sous des lettres, sans fournisseur ni durée
 *   notes.csv                           grille à remplir par les juges
 *   cle-a-ouvrir-apres-notation.json    lettre → fournisseur, durée, issue
 *   resume.json                         par fournisseur : réussis, échecs, durées, coût réel
 *
 * Les photos sont à fournir déjà réduites (1 024 px côté long), comme le
 * téléphone le fera en production. Un service dans `produits.json` :
 *   [{ "imageUrl": "https://…", "titre": "Robe", "piece": "entier" }]  (piece : haut, bas, entier, ensemble)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fashn } from "../lib/essayage/fournisseurs/fashn";
import { genlook } from "../lib/essayage/fournisseurs/genlook";
import { DUREE_MAX_ESSAI_MS, ErreurFournisseur, type FournisseurEssayage, type ImageResultat, type PhotoAcheteur, type RaisonEchec, type TypePhoto, type VetementEssaye } from "../lib/essayage/fournisseurs/types";

/** Prix d'un essai réussi, relevés le 2026-10-19 (docs/74 §4.1) ; les échecs ne sont pas facturés. */
export const PRIX_PAR_ESSAI_USD = { genlook: 0.04, fashn: 0.075 } as const;
type Candidat = keyof typeof PRIX_PAR_ESSAI_USD;
const CANDIDATS: readonly Candidat[] = ["genlook", "fashn"];
const PIECES = ["haut", "bas", "entier", "ensemble"] as const;
const TYPES: Record<string, TypePhoto> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const POIDS_CONSEILLE = 3 * 1024 * 1024;
const INTERVALLE_MS = 2_000;
const DEPOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

export type Essai = { photo: string; produit: number; candidat: Candidat };

export function planifier(photos: string[], produits: VetementEssaye[], candidats: readonly Candidat[]): Essai[] {
  const plan: Essai[] = [];
  for (const photo of photos) for (let produit = 0; produit < produits.length; produit++) for (const candidat of candidats) plan.push({ photo, produit, candidat });
  return plan;
}

export function estimerCout(plan: Essai[]): Partial<Record<Candidat, { essais: number; usd: number }>> {
  const total: Partial<Record<Candidat, { essais: number; usd: number }>> = {};
  for (const e of plan) {
    const t = (total[e.candidat] ??= { essais: 0, usd: 0 });
    t.essais += 1;
    t.usd = Math.round(t.essais * PRIX_PAR_ESSAI_USD[e.candidat] * 1000) / 1000;
  }
  return total;
}

/** La sortie contient des photos de personnes : jamais dans le dépôt. */
export function verifierSortie(dossier: string, depot: string = DEPOT): void {
  const r = relative(resolve(depot), resolve(dossier));
  if (r === "" || (!r.startsWith("..") && !isAbsolute(r))) throw new Error("la sortie doit être hors du dépôt (photos de personnes)");
}

export function lireProduits(fichier: string): VetementEssaye[] {
  const brut: unknown = JSON.parse(readFileSync(fichier, "utf8"));
  if (!Array.isArray(brut) || brut.length === 0) throw new Error("produits.json : un tableau non vide est attendu");
  return brut.map((p, i) => {
    const v = p as Partial<VetementEssaye>;
    if (typeof v.imageUrl !== "string" || !v.imageUrl.startsWith("https://")) throw new Error(`produit ${i + 1} : imageUrl en https:// attendue`);
    if (typeof v.titre !== "string" || v.titre.trim() === "") throw new Error(`produit ${i + 1} : titre attendu`);
    if (!PIECES.includes(v.piece as (typeof PIECES)[number])) throw new Error(`produit ${i + 1} : piece parmi ${PIECES.join(", ")}`);
    return { imageUrl: v.imageUrl, titre: v.titre.trim(), piece: v.piece as VetementEssaye["piece"] };
  });
}

/** Mélange de Fisher-Yates, graine fixe (mulberry32) : la même graine redonne la même planche. */
export function melanger<T>(liste: readonly T[], graine: number): T[] {
  let a = graine >>> 0;
  const hasard = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

type Dependances = {
  fetch?: typeof fetch;
  /** Fournisseurs injectés (tests) ; sinon, les vrais adaptateurs avec les clés de l'environnement. */
  fabrique?: (nom: Candidat) => FournisseurEssayage;
  attendre?: (ms: number) => Promise<void>;
  ecrire?: (ligne: string) => void;
};

type Issue = { statut: "reussi"; image: ImageResultat; dureeMs: number } | { statut: "echec"; raison: RaisonEchec; dureeMs: number };

async function essayer(f: FournisseurEssayage, photo: PhotoAcheteur, vetement: VetementEssaye, attendre: (ms: number) => Promise<void>): Promise<Issue> {
  const debut = Date.now();
  const duree = () => Date.now() - debut;
  let travail;
  try {
    travail = await f.creer(photo, vetement);
  } catch (e) {
    return { statut: "echec", raison: e instanceof ErreurFournisseur ? e.raison : "fournisseur", dureeMs: duree() };
  }
  try {
    for (;;) {
      const etat = await f.statut(travail);
      if (etat.etat === "reussi") return { statut: "reussi", image: etat.image, dureeMs: duree() };
      if (etat.etat === "echec") return { statut: "echec", raison: etat.raison, dureeMs: duree() };
      if (duree() >= DUREE_MAX_ESSAI_MS) return { statut: "echec", raison: "delai", dureeMs: duree() };
      await attendre(INTERVALLE_MS);
    }
  } finally {
    await f.effacer(travail);
  }
}

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (n: number) => `${n.toFixed(2).replace(".", ",")} $`;

function lireArguments(argv: string[]) {
  const valeur = (nom: string) => {
    const i = argv.indexOf(nom);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    candidats: (valeur("--candidats") ?? "").split(",").map((c) => c.trim()).filter(Boolean),
    photos: valeur("--photos"),
    produits: valeur("--produits"),
    sortie: valeur("--sortie"),
    payer: argv.includes("--payer"),
    graine: valeur("--graine") !== undefined ? Number(valeur("--graine")) : Math.floor(Math.random() * 2 ** 31),
  };
}

/** Code de sortie : 0 fait, 2 refusé (arguments, clé, sortie). */
export async function principal(argv: string[], dep: Dependances = {}): Promise<number> {
  const ecrire = dep.ecrire ?? ((l: string) => console.log(l));
  const attendre = dep.attendre ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const args = lireArguments(argv);
  try {
    if (args.candidats.includes("maison")) throw new Error("le candidat « maison » attend son point d'accès GPU (tâche 2.4, sur « oui »)");
    const inconnus = args.candidats.filter((c) => !CANDIDATS.includes(c as Candidat));
    if (args.candidats.length === 0 || inconnus.length > 0) throw new Error(`--candidats parmi ${CANDIDATS.join(", ")}`);
    if (!args.photos || !args.produits) throw new Error("--photos et --produits sont requis");
    if (!Number.isInteger(args.graine)) throw new Error("--graine : un entier");
    const candidats = args.candidats as Candidat[];
    const produits = lireProduits(args.produits);
    const photos = readdirSync(args.photos).filter((n) => TYPES[extname(n).toLowerCase()]).sort();
    if (photos.length === 0) throw new Error("aucune photo .jpg, .png ou .webp dans --photos");
    const plan = planifier(photos, produits, candidats);

    ecrire(`${photos.length} photo(s) × ${produits.length} vêtement(s) × ${candidats.length} candidat(s) = ${plan.length} essais`);
    for (const [nom, t] of Object.entries(estimerCout(plan))) ecrire(`  ${nom.padEnd(8)} ${t.essais} essais  ${usd(t.usd)} au plus (échecs non facturés)`);
    for (const n of photos) if (statSync(join(args.photos, n)).size > POIDS_CONSEILLE) ecrire(`  ⚠️ ${n} dépasse 3 Mo : réduisez-la à 1 024 px, comme le fera le téléphone`);
    if (!args.payer) {
      ecrire("À BLANC : aucun appel, aucun coût. Ajoutez --payer après accord sur ce coût.");
      return 0;
    }

    if (!args.sortie) throw new Error("--sortie est requis avec --payer");
    verifierSortie(args.sortie);
    if (existsSync(args.sortie) && readdirSync(args.sortie).length > 0) throw new Error("--sortie n'est pas vide : choisissez un nouveau dossier");
    const f = dep.fetch ?? fetch;
    const fournisseurs = new Map<Candidat, FournisseurEssayage>();
    for (const nom of candidats) {
      if (dep.fabrique) fournisseurs.set(nom, dep.fabrique(nom));
      else {
        const cle = (nom === "genlook" ? process.env.GENLOOK_API_KEY : process.env.FASHN_API_KEY)?.trim();
        if (!cle) throw new Error(`clé absente pour ${nom} (${nom === "genlook" ? "GENLOOK_API_KEY" : "FASHN_API_KEY"})`);
        fournisseurs.set(nom, nom === "genlook" ? genlook({ cle, fetch: f }) : fashn({ cle, fetch: f }));
      }
    }

    const resultats: (Essai & Issue)[] = [];
    for (const e of plan) {
      const photo: PhotoAcheteur = { octets: new Uint8Array(readFileSync(join(args.photos, e.photo))), type: TYPES[extname(e.photo).toLowerCase()] };
      resultats.push({ ...e, ...(await essayer(fournisseurs.get(e.candidat)!, photo, produits[e.produit], attendre)) });
      ecrire(`  ${resultats.length}/${plan.length}`);
    }
    ecrireSortie(args.sortie, photos, produits, resultats, args.graine, args.photos);
    ecrire(`Planche écrite dans ${args.sortie}. Ouvrez la clé seulement après la notation.`);
    return 0;
  } catch (e) {
    ecrire(`Refusé : ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
}

function ecrireSortie(sortie: string, photos: string[], produits: VetementEssaye[], resultats: (Essai & Issue)[], graine: number, dossierPhotos: string) {
  mkdirSync(sortie, { recursive: true });
  const cle: { etiquette: string; candidat: Candidat; photo: string; vetement: string; statut: string; raison?: string; dureeMs: number }[] = [];
  const blocs: string[] = [];
  photos.forEach((photo, p) => {
    produits.forEach((produit, v) => {
      const lot = melanger(resultats.filter((r) => r.photo === photo && r.produit === v), graine + p * 1000 + v);
      const base = `P${String(p + 1).padStart(2, "0")}-V${String(v + 1).padStart(2, "0")}`;
      const vignettes = lot.map((r, i) => {
        const etiquette = `${base}-${String.fromCharCode(65 + i)}`;
        cle.push({ etiquette, candidat: r.candidat, photo, vetement: produit.titre, statut: r.statut, ...(r.statut === "echec" ? { raison: r.raison } : {}), dureeMs: r.dureeMs });
        const contenu = r.statut === "reussi" ? `<img src="data:${r.image.type};base64,${r.image.base64}" alt="${etiquette}">` : `<div class="vide">pas d'image</div>`;
        return `<figure>${contenu}<figcaption>${etiquette}</figcaption></figure>`;
      });
      const type = TYPES[extname(photo).toLowerCase()];
      const original = readFileSync(join(dossierPhotos, photo)).toString("base64");
      blocs.push(
        `<section><h2>${base}</h2><div class="rang"><figure><img src="data:${type};base64,${original}" alt="photo"><figcaption>photo</figcaption></figure>` +
          `<figure><img src="${echapper(produit.imageUrl)}" alt="vêtement"><figcaption>${echapper(produit.titre)}</figcaption></figure>${vignettes.join("")}</div></section>`,
      );
    });
  });
  const html =
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Planche à l'aveugle</title>` +
    `<style>body{font-family:system-ui,sans-serif;margin:16px;background:#faf8f5;color:#17123a}section{margin:24px 0}.rang{display:flex;flex-wrap:wrap;gap:12px}` +
    `figure{margin:0;width:180px}img,.vide{width:180px;height:270px;object-fit:contain;background:#fff;border:1px solid #ddd;border-radius:8px}.vide{display:grid;place-items:center;color:#777}figcaption{font-size:13px;margin-top:4px}</style></head>` +
    `<body><h1>Planche à l'aveugle</h1><p>Notez chaque lettre dans notes.csv (1 à 5) avant d'ouvrir la clé.</p>${blocs.join("")}</body></html>`;
  writeFileSync(join(sortie, "planche.html"), html);
  writeFileSync(join(sortie, "notes.csv"), ["etiquette;fidelite_vetement;peau_cheveux;morphologie;defauts;commentaire", ...cle.map((c) => `${c.etiquette};;;;;`)].join("\n") + "\n");
  writeFileSync(join(sortie, "cle-a-ouvrir-apres-notation.json"), JSON.stringify({ graine, essais: cle }, null, 2));
  const resume: Record<string, { essais: number; reussis: number; echecs: Record<string, number>; dureeMedianeMs: number | null; coutReelUsd: number }> = {};
  for (const nom of new Set(resultats.map((r) => r.candidat))) {
    const siens = resultats.filter((r) => r.candidat === nom);
    const reussis = siens.filter((r) => r.statut === "reussi");
    const echecs: Record<string, number> = {};
    for (const r of siens) if (r.statut === "echec") echecs[r.raison] = (echecs[r.raison] ?? 0) + 1;
    const durees = reussis.map((r) => r.dureeMs).sort((a, b) => a - b);
    resume[nom] = {
      essais: siens.length,
      reussis: reussis.length,
      echecs,
      dureeMedianeMs: durees.length ? durees[Math.floor(durees.length / 2)] : null,
      coutReelUsd: Math.round(reussis.length * PRIX_PAR_ESSAI_USD[nom] * 1000) / 1000,
    };
  }
  writeFileSync(join(sortie, "resume.json"), JSON.stringify(resume, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  principal(process.argv.slice(2)).then((code) => process.exit(code));
}
