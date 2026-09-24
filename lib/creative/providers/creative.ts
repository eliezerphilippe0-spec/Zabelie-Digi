import type { Brief } from "../prompt-builder";

/**
 * CreativeProvider (contrat §3.5) — moteur d'image, sur le modèle de
 * `TopupProvider` (lib/zabelie-topup/provider.ts:50) : opérations typées,
 * résultat `ok` / `retryable`, statut interrogeable.
 *
 * ⚠️ Aucune implémentation Higgsfield ici : endpoint, authentification,
 * idempotence, prompt négatif et image de référence ne sont connus que par des
 * sources secondaires (NON VÉRIFIÉ, docs/62 §3). La clé, quand elle existera,
 * ne vivra que côté serveur.
 *
 * Le moteur ne reçoit qu'un `Brief` et la photo du produit : un brief n'a
 * aucun champ de prix, d'accroche ou de CTA (Phase 1), donc aucun texte
 * publicitaire ne peut lui parvenir par ce contrat.
 */
export type EtatGeneration = "requested" | "generating" | "completed" | "failed";

const TRANSITIONS: Record<EtatGeneration, readonly EtatGeneration[]> = {
  requested: ["generating", "failed"],
  generating: ["completed", "failed"],
  completed: [],
  failed: [],
};

export function transitionPermise(de: EtatGeneration, vers: EtatGeneration): boolean {
  return TRANSITIONS[de].includes(vers);
}

export type SoumissionCreative = { idempotencyKey: string; brief: Brief; referenceImageUrl: string };
export type ResultatSoumission = { ok: true; providerRef: string } | { ok: false; retryable: boolean; error: string };
export type StatutCreatif =
  | { state: "generating" }
  | { state: "completed"; imageUrl: string }
  | { state: "failed"; error: string };

export interface CreativeProvider {
  readonly name: string;
  /** Idempotent : la même clé rend la même référence, sans seconde génération. */
  submit(job: SoumissionCreative): Promise<ResultatSoumission>;
  status(providerRef: string): Promise<StatutCreatif>;
}

export const MAX_SONDAGES = 30;
export const INTERVALLE_MS = 2000;
export const DELAI_TOTAL_MS = 120_000;

export type Journalisation = (e: { de: EtatGeneration; vers: EtatGeneration; detail?: string }) => void;

/**
 * Pilote UNE génération. Sondage borné (nombre ET durée), aucune relance de
 * soumission : un échec `retryable` est rendu à l'appelant, qui décide.
 * Chaque transition est vérifiée puis journalisée.
 */
export async function runGeneration(
  provider: CreativeProvider,
  job: SoumissionCreative,
  deps: { journal: Journalisation; sleep?: (ms: number) => Promise<void>; now?: () => number },
): Promise<{ state: "completed"; imageUrl: string; providerRef: string } | { state: "failed"; error: string; retryable: boolean }> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  let etat: EtatGeneration = "requested";
  const passer = (vers: EtatGeneration, detail?: string) => {
    if (!transitionPermise(etat, vers)) throw new Error(`transition_interdite:${etat}->${vers}`);
    deps.journal({ de: etat, vers, detail });
    etat = vers;
  };
  if (!job.idempotencyKey || !job.referenceImageUrl) { passer("failed", "entree_invalide"); return { state: "failed", error: "entree_invalide", retryable: false }; }

  let sub: ResultatSoumission;
  try { sub = await provider.submit(job); } catch { sub = { ok: false, retryable: true, error: "reseau" }; }
  if (!sub.ok) { passer("failed", sub.error); return { state: "failed", error: sub.error, retryable: sub.retryable }; }
  passer("generating", sub.providerRef);

  const debut = now();
  for (let i = 0; i < MAX_SONDAGES && now() - debut < DELAI_TOTAL_MS; i++) {
    let s: StatutCreatif;
    try { s = await provider.status(sub.providerRef); } catch { s = { state: "generating" }; }
    if (s.state === "completed") { passer("completed"); return { state: "completed", imageUrl: s.imageUrl, providerRef: sub.providerRef }; }
    if (s.state === "failed") { passer("failed", s.error); return { state: "failed", error: s.error, retryable: false }; }
    await sleep(INTERVALLE_MS);
  }
  passer("failed", "delai_depasse");
  // Non relançable ici : la génération peut encore aboutir chez le fournisseur,
  // une seconde soumission la paierait deux fois. La référence reste au journal.
  return { state: "failed", error: "delai_depasse", retryable: false };
}

/** Mock déterministe et idempotent, pour les tests et la Phase 3. */
export function createMockCreativeProvider(opts: { pollsBeforeDone?: number; fail?: boolean } = {}) {
  const byKey = new Map<string, string>();
  const polls = new Map<string, number>();
  let submissions = 0;
  const provider: CreativeProvider = {
    name: "mock",
    async submit(job) {
      const existing = byKey.get(job.idempotencyKey);
      if (existing) return { ok: true, providerRef: existing };
      submissions++;
      const ref = `mock-${byKey.size + 1}`;
      byKey.set(job.idempotencyKey, ref);
      return { ok: true, providerRef: ref };
    },
    async status(ref) {
      const n = (polls.get(ref) ?? 0) + 1;
      polls.set(ref, n);
      if (opts.fail) return { state: "failed", error: "mock_echec" };
      return n > (opts.pollsBeforeDone ?? 1) ? { state: "completed", imageUrl: `https://mock.test/${ref}.png` } : { state: "generating" };
    },
  };
  return { provider, submissions: () => submissions };
}
