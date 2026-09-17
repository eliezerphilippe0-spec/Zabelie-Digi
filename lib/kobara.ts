import { createHmac, timingSafeEqual } from "node:crypto";
import { siteUrl } from "@/lib/site-url";

/**
 * Rail KOBARA — passerelle haïtienne encaissant NatCash **et** MonCash
 * (`docs/03-PAIEMENTS.md` §9.1).
 *
 * Flux, et il est le même que Stripe plutôt que MonCash :
 *   1. createKobaraPayment()  — crée une session, renvoie `checkout_url`.
 *   2. webhook signé          — SEULE source de vérité (INVARIANT 2).
 *   3. retrieveKobaraPayment()— vérification S2S, pour le réconciliateur.
 *
 * ⚠️ CE QUE CE MODULE NE PROUVE PAS, et c'est écrit ici parce que le code a
 * l'air aussi sûr dans les deux cas : **aucun appel n'a jamais été émis vers
 * cet hôte.** `kobara.app` est `EGRESS_BLOCKED` depuis l'agent, aucun compte
 * n'existe, aucun aller-retour en bac à sable n'a eu lieu. Les formes ci-dessous
 * sont transcrites de la documentation lue par le porteur le 2026-08-24 —
 * `docs/03` §9.1 le dit mot pour mot : « Documenté ≠ testé ». Ce dépôt a déjà
 * payé cette confusion : cinq paiements MonCash ont échoué contre un hôte qui
 * répondait exactement comme sa documentation l'annonçait.
 *
 * ⚠️ DEUX CASES D'ÉTAPE 0 RESTENT OUVERTES, et elles ne sont pas techniques :
 * le statut BRH de l'entité (circulaire 121) et la DÉTENTION des fonds entre
 * l'encaissement et le retrait. `isKobaraEnabled()` est donc le vrai
 * interrupteur de ce fichier : sans secrets posés, rien de tout ceci n'atteint
 * un acheteur. Le code peut vivre dans `main` sans que le rail existe.
 */

/** Les trois valeurs que le champ `provider` de Kobara accepte. */
export const KOBARA_PROVIDERS = ["natcash", "moncash", "kobara"] as const;
export type KobaraProvider = (typeof KOBARA_PROVIDERS)[number];

export function isKobaraProvider(v: unknown): v is KobaraProvider {
  return (KOBARA_PROVIDERS as readonly string[]).includes(String(v));
}

/**
 * PLAFONDS PAR TRANSACTION — ce sont ceux des OPÉRATEURS, pas ceux de Kobara.
 *
 * ⚠️ La distinction est réelle et elle est laissée visible : la fiche d'étape 0
 * ne documente AUCUN plafond par transaction propre à la passerelle. Le seul
 * chiffre connu — 2 500 HTG/jour — est un plafond de **retrait du solde
 * marchand**, corrigé par le porteur le 2026-08-24 après qu'une première
 * lecture en ait fait un plafond d'encaissement. Il ne se contrôle donc pas
 * ici : il se vit en trésorerie, au moment de régler les vendeurs.
 *
 * Reprendre les plafonds opérateur est le choix prudent — Kobara route vers
 * ces mêmes opérateurs, elle ne peut pas encaisser au-delà de ce qu'ils
 * acceptent. Si la passerelle impose plus bas, le refus viendra d'elle et
 * l'acheteur verra un échec au lieu d'un message clair. C'est une limite
 * CONNUE, pas une hypothèse oubliée.
 */
export const KOBARA_CAPS: Record<KobaraProvider, number> = {
  moncash: 25000,
  natcash: 20000,
  kobara: 20000, // page de choix unifiée : on retient le plus bas des deux
};

export function kobaraCap(provider: KobaraProvider): number {
  return KOBARA_CAPS[provider];
}

/* ────────────────────────────────────────────────────────────────────────────
 * LE MODE SE RÉSOUT, IL NE SE CASTE PAS
 *
 * Repris de `lib/moncash.ts::resolveMonCashMode`, et pour la raison qui y est
 * écrite : lire une variable d'environnement puis la marquer `as Mode` est une
 * promesse au compilateur, pas une vérification. `Production`, `production `
 * (espace de fin) ou la chaîne vide
 * retombaient silencieusement en bac à sable. Cinq paiements réels ont été
 * perdus ainsi. La forme ci-dessous rend la SOURCE avec le mode, pour qu'une
 * valeur malformée soit distinguable d'une valeur absente.
 * ──────────────────────────────────────────────────────────────────────────── */
export type KobaraMode = "test" | "live";
export type KobaraModeSource = "absente" | "vide" | "explicite" | "invalide";

export function resolveKobaraMode(brut: string | undefined): {
  mode: KobaraMode;
  source: KobaraModeSource;
} {
  if (brut === undefined) return { mode: "test", source: "absente" };
  const net = brut.trim();
  if (net === "") return { mode: "test", source: "vide" };
  if (net === "live" || net === "test") return { mode: net, source: "explicite" };
  // ⚠️ Une valeur non reconnue ne retombe PAS en `live`. Un rail d'argent se
  // trompe vers l'inoffensif, jamais vers l'encaissement réel.
  return { mode: "test", source: "invalide" };
}

/**
 * Le rail est-il configuré ? Les DEUX secrets sont exigés, et c'est délibéré :
 * une clé d'API sans secret de webhook donne un rail qui encaisse et ne sait
 * pas confirmer — c'est-à-dire de l'argent pris sans livraison, le pire état
 * possible. Mieux vaut un rail absent qu'un rail à moitié branché.
 */
/* ⚠️ LES VARIABLES SE LISENT LITTÉRALEMENT, PAS À TRAVERS UN OBJET `env`.
 *
 * La première écriture prenait un paramètre `env: NodeJS.ProcessEnv` et lisait
 * `env.KOBARA_WEBHOOK_SECRET`. C'est commode à tester… et INVISIBLE au
 * croisement `.env.example` ↔ code (`tests/env-example-complet.test.ts`), qui
 * cherche la lecture littérale d'une variable sur l'objet d'environnement
 * global. Le test l'a dit : deux variables documentées que
 * « plus aucun code ne lit ». Elles étaient lues ; l'instrument ne pouvait pas
 * le voir, et c'est le même défaut que les artefacts adressés par CHAÎNE que
 * `CLAUDE.md` décrit — le compilateur n'y voit rien, le grep non plus.
 *
 * La forme retenue garde les deux propriétés : le nom apparaît en toutes
 * lettres (le croisement le voit), et la valeur reste injectable par argument
 * (les tests s'en servent). */
export function isKobaraEnabled(
  cle: string | undefined = process.env.KOBARA_SECRET_KEY,
  webhook: string | undefined = process.env.KOBARA_WEBHOOK_SECRET
): boolean {
  return Boolean(cle?.trim() && webhook?.trim());
}

function apiBase(base: string | undefined = process.env.KOBARA_API_BASE): string {
  return (base?.trim() || "https://api.kobara.app").replace(/\/+$/, "");
}

function secretKey(): string {
  const k = process.env.KOBARA_SECRET_KEY?.trim();
  if (!k) throw new Error("Kobara : KOBARA_SECRET_KEY manquante.");
  return k;
}

export type KobaraSession = {
  id: string;
  redirectUrl: string;
  status: string;
  mode: KobaraMode;
  modeSource: KobaraModeSource;
};

/**
 * Crée une session de paiement.
 *
 * `Idempotency-Key = orderId` — la clé est la MÊME que `payments.idempotency_key`
 * et que `confirm_payment`. Un double clic, une 3G qui recompose la requête ou
 * un réessai du réconciliateur retombent donc sur la même session côté
 * passerelle : c'est l'INVARIANT 1 transmis en amont, pas seulement gardé en
 * base.
 */
export async function createKobaraPayment(input: {
  orderId: string;
  amountHtg: number;
  provider: KobaraProvider;
  description: string;
  fetchFn?: typeof fetch;
}): Promise<KobaraSession> {
  const { mode, source } = resolveKobaraMode(process.env.KOBARA_MODE);
  const site = siteUrl();
  const doFetch = input.fetchFn ?? fetch;

  const res = await doFetch(`${apiBase()}/api/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.orderId,
    },
    body: JSON.stringify({
      amount: input.amountHtg, // HTG entier — ce rail est natif HTG, aucun change
      currency: "HTG",
      provider: input.provider,
      description: input.description,
      reference: input.orderId, // clé de rapprochement, comme l'orderId MonCash
      metadata: { order_id: input.orderId },
      callback_url: `${site}/api/kobara/webhook`,
      return_url: `${site}/mes-achats?commande=${input.orderId}`,
    }),
  });

  if (!res.ok) {
    // Le corps de l'opérateur reste dans les journaux serveur, jamais rendu au
    // client (fuite d'infos + intraduisible FR/KR) — BL-114.
    const corps = await res.text().catch(() => "");
    throw new Error(`Kobara ${res.status} : ${corps.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    id?: string;
    checkout_url?: string;
    status?: string;
  };
  if (!data.id || !data.checkout_url) {
    throw new Error("Kobara : réponse sans id ou checkout_url.");
  }
  return {
    id: data.id,
    redirectUrl: data.checkout_url,
    status: data.status ?? "pending",
    mode,
    modeSource: source,
  };
}

export type KobaraPayment = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  reference: string | null;
  provider: string | null;
  providerRef: string | null;
};

function normaliserPaiement(brut: Record<string, unknown>): KobaraPayment | null {
  const id = typeof brut.id === "string" ? brut.id : null;
  if (!id) return null;
  const amount = Number(brut.amount);
  return {
    id,
    status: typeof brut.status === "string" ? brut.status : "unknown",
    amount: Number.isFinite(amount) ? amount : NaN,
    currency: typeof brut.currency === "string" ? brut.currency : "",
    reference: typeof brut.reference === "string" ? brut.reference : null,
    provider: typeof brut.provider === "string" ? brut.provider : null,
    providerRef:
      typeof brut.provider_reference === "string" ? brut.provider_reference : null,
  };
}

/** Vérification SERVEUR-À-SERVEUR de l'état réel — utilisée par le réconciliateur. */
export async function retrieveKobaraPayment(
  paymentId: string,
  fetchFn: typeof fetch = fetch
): Promise<KobaraPayment | null> {
  const res = await fetchFn(`${apiBase()}/api/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Kobara ${res.status} à la consultation.`);
  const data = (await res.json()) as Record<string, unknown>;
  return normaliserPaiement(data);
}

/**
 * Le paiement est-il réellement encaissé ?
 *
 * ⚠️ Liste FERMÉE, et c'est ce qui compte. Une comparaison du genre
 * `status !== "failed"` accorderait la livraison sur tout statut inconnu —
 * `processing`, `on_hold`, une valeur ajoutée par la passerelle l'an prochain.
 * Ici, ce qui n'est pas explicitement un succès n'en est pas un.
 */
export function kobaraEstPaye(p: KobaraPayment | null): boolean {
  if (!p) return false;
  return p.status === "succeeded" || p.status === "paid" || p.status === "completed";
}

/**
 * Minimisation RGPD avant écriture en base (modèle `redactPayment` de MonCash).
 * On garde ce qui sert au rapprochement comptable ; jamais le numéro de
 * téléphone du payeur ni un identifiant de compte opérateur.
 */
export function redactKobaraPayment(p: KobaraPayment): Record<string, unknown> {
  return {
    kobara_payment_id: p.id,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    provider: p.provider,
    provider_reference: p.providerRef,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * LA SIGNATURE — le seul endroit qui décide si une confirmation est vraie
 * ──────────────────────────────────────────────────────────────────────────── */

export type VerdictSignature =
  | { ok: true }
  | { ok: false; motif: "entete_absent" | "entete_malforme" | "horodatage_hors_fenetre" | "signature_invalide" };

/** Fenêtre anti-rejeu documentée par la passerelle : 5 minutes. */
export const FENETRE_SIGNATURE_MS = 5 * 60 * 1000;

/**
 * Vérifie `Kobara-Signature: t=<epoch>,v1=<hex>`.
 *
 * `signature = hex(HMAC-SHA256(secret, timestamp + "." + corps_brut))`
 *
 * Trois refus distincts, et chacun ferme une porte différente :
 *
 *   1. **En-tête absent ou malformé** — sans quoi une requête nue passerait.
 *   2. **Horodatage hors fenêtre** — sans quoi une confirmation authentique
 *      capturée hier pourrait être rejouée aujourd'hui. La signature serait
 *      valide ; c'est précisément pourquoi la fenêtre existe.
 *   3. **Signature invalide** — comparaison à temps constant. `a === b` sur une
 *      chaîne sort au premier octet différent et fuit la position de l'erreur,
 *      octet par octet.
 *
 * ⚠️ Le corps DOIT être la chaîne brute reçue, jamais `JSON.stringify(parsé)` :
 * un ré-encodage change l'ordre des clés et les espaces, donc l'empreinte, et
 * la vérification échouerait sur des charges parfaitement authentiques.
 */
export function verifierSignatureKobara(
  corpsBrut: string,
  entete: string | null,
  secret: string,
  maintenantMs: number = Date.now()
): VerdictSignature {
  if (!entete) return { ok: false, motif: "entete_absent" };

  const t = /(?:^|,)\s*t=(\d{1,15})(?:,|$)/.exec(entete)?.[1];
  const v1 = /(?:^|,)\s*v1=([a-f0-9]{64})(?:,|$)/i.exec(entete)?.[1];
  if (!t || !v1) return { ok: false, motif: "entete_malforme" };

  const horodatageMs = Number(t) * 1000;
  if (!Number.isFinite(horodatageMs)) return { ok: false, motif: "entete_malforme" };
  // Valeur absolue : une charge datée du FUTUR est aussi suspecte qu'une
  // charge périmée — une horloge trafiquée ouvrirait la fenêtre indéfiniment.
  if (Math.abs(maintenantMs - horodatageMs) > FENETRE_SIGNATURE_MS) {
    return { ok: false, motif: "horodatage_hors_fenetre" };
  }

  const attendu = createHmac("sha256", secret).update(`${t}.${corpsBrut}`).digest();
  let recu: Buffer;
  try {
    recu = Buffer.from(v1, "hex");
  } catch {
    return { ok: false, motif: "entete_malforme" };
  }
  if (recu.length !== attendu.length) return { ok: false, motif: "signature_invalide" };
  return timingSafeEqual(recu, attendu)
    ? { ok: true }
    : { ok: false, motif: "signature_invalide" };
}

/**
 * Le garde du webhook, en une fonction — pour qu'il soit éprouvable ailleurs
 * que dans une route Next.
 *
 * ⚠️ FAIL-CLOSED SUR LE SECRET ABSENT. Si `KOBARA_WEBHOOK_SECRET` manque, on
 * REFUSE. Un webhook qui accepterait tout parce qu'il n'a rien pour vérifier
 * est la forme la plus coûteuse du « contrôle qui saute faute de
 * configuration » — ici, il accorderait des livraisons gratuites à quiconque
 * connaît l'URL.
 */
export function autoriserWebhookKobara(
  corpsBrut: string,
  entete: string | null,
  secretBrut: string | undefined = process.env.KOBARA_WEBHOOK_SECRET,
  maintenantMs: number = Date.now()
): VerdictSignature {
  const secret = secretBrut?.trim();
  if (!secret) return { ok: false, motif: "signature_invalide" };
  return verifierSignatureKobara(corpsBrut, entete, secret, maintenantMs);
}
