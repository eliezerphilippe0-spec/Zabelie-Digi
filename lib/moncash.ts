/**
 * Client MonCash (Digicel Haïti) — rail de paiement du MVP (docs/03-PAIEMENTS.md).
 *
 * Flux :
 *   1. getAccessToken()         — OAuth client_credentials.
 *   2. createPayment()          — crée une session, renvoie l'URL de redirection.
 *   3. retrieveOrderPayment()   — vérification SERVEUR-À-SERVEUR (INVARIANT 2).
 *
 * On ne fait JAMAIS confiance au seul retour navigateur : la vérité vient de
 * retrieveOrderPayment(), appelée au retour ET par le réconciliateur.
 */

type MonCashMode = "sandbox" | "production";

/**
 * ⚠️ L'hôte est `digicelgroup.com`, PAS `digicel.com` — mesuré le 2026-08-10 :
 * `sandbox.moncashbutton.digicel.com` ne résout plus du tout (DNS mort), là où
 * `…digicelgroup.com` rend 401 sur /Api/oauth/token et /Api/v1/CreatePayment
 * (le serveur existe et exige l'authentification). C'est aussi l'hôte du
 * portail Business et de la doc officielle. Verrouillé par
 * tests/moncash-hote.test.ts.
 */
function bases(mode: MonCashMode) {
  return mode === "production"
    ? {
        rest: "https://moncashbutton.digicelgroup.com/Api",
        gateway: "https://moncashbutton.digicelgroup.com/Moncash-middleware",
      }
    : {
        rest: "https://sandbox.moncashbutton.digicelgroup.com/Api",
        gateway: "https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware",
      };
}

function config() {
  const clientId = process.env.MONCASH_CLIENT_ID;
  const clientSecret = process.env.MONCASH_CLIENT_SECRET;
  const mode = (process.env.MONCASH_MODE as MonCashMode) ?? "sandbox";

  if (!clientId || !clientSecret) {
    throw new Error(
      "MonCash: MONCASH_CLIENT_ID / MONCASH_CLIENT_SECRET manquant."
    );
  }
  return { clientId, clientSecret, mode, ...bases(mode) };
}

// BL-122 (C-4c) : cache du token client_credentials en mémoire de module —
// avant, CHAQUE appel MonCash (create/retrieve/réconciliateur) redemandait un
// token. Marge de 60 s avant l'expiration annoncée ; un échec vide le cache.
let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const { clientId, clientSecret, rest } = config();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${rest}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "scope=read,write&grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`MonCash oauth: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error("MonCash oauth: access_token absent.");
  const ttl = Math.max(0, (data.expires_in ?? 0) - 60) * 1000;
  tokenCache = ttl > 0 ? { token: data.access_token, expiresAt: Date.now() + ttl } : null;
  return data.access_token;
}

export type CreatePaymentResult = {
  paymentToken: string;
  redirectUrl: string;
  /**
   * LE MODE ET L'HÔTE RÉELLEMENT UTILISÉS — pas ceux qu'on suppose.
   *
   * ⚠️ CETTE PAIRE EXISTE À CAUSE D'UNE PANNE DE CINQ SEMAINES QUE PERSONNE
   * NE POUVAIT LIRE. Cinq paiements tentés du 2026-08-11 au 2026-08-14, tous
   * terminés en `moncash_unknown_48h` — MonCash répond 404, il ne connaît pas
   * la transaction. La cause a été CONFIRMÉE le 2026-08-21 par le porteur, en
   * lisant l'hôte dans la barre d'adresse : `sandbox.moncashbutton…`. Le rail
   * encaissait en bac à sable, et aucun compte réel ne pouvait l'honorer.
   *
   * Rien en base ne le disait. `payments.raw` portait le jeton et le motif
   * d'expiration, jamais **sur quel hôte on avait demandé** — donc « mode
   * sandbox » et « l'acheteur a renoncé » laissaient exactement la même trace.
   * Il a fallu un humain devant un navigateur pour trancher ce qu'une colonne
   * aurait dit en une requête.
   *
   * `redirectUrl` est construit à partir du MÊME `gateway` : l'hôte inscrit
   * est donc celui où l'acheteur est réellement parti, jamais une seconde
   * dérivation qui pourrait diverger. C'est ce qu'assure
   * `tests/moncash-mode-journalise.test.ts` — et la mutation qui le prouve
   * change la SOURCE de `gatewayHost` en gardant le reste intact.
   */
  mode: MonCashMode;
  gatewayHost: string;
};

/**
 * Crée une session de paiement. `orderId` doit être unique côté MonCash et
 * sert de clé de rapprochement (on y stocke notre order.id).
 */
export async function createPayment(
  orderId: string,
  amountHTG: number
): Promise<CreatePaymentResult> {
  const token = await getAccessToken();
  const { rest, gateway, mode } = config();

  const res = await fetch(`${rest}/v1/CreatePayment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    /* ⚠️ AUCUN PLANCHER ICI, ET C'EST UN FAIT MESURÉ, PAS UN OUBLI SUPPOSÉ.
     *
     * Le montant part tel quel. Plusieurs commentaires du dépôt affirmaient
     * que MonCash « refuse » un montant de 0 — relecture du 2026-08-22 :
     * aucun garde dans cette fonction, aucune trace d'un appel à 0 qui aurait
     * échoué, aucun test. C'était une supposition écrite au présent de
     * l'indicatif, et elle a servi à justifier le rail `gratis` de `0087`.
     *
     * Le rail reste bon et il fonctionne ; ce qui n'est pas établi, c'est
     * qu'il était nécessaire. La question du montant minimal est partie chez
     * Digicel le 2026-08-22 (`docs/42` §1 ter, question 7).
     *
     * ⚠️ Ne pas ajouter de plancher ici en attendant la réponse : un plancher
     * inventé serait la MÊME faute une couche plus bas — une règle métier
     * financière posée sans source. */
    body: JSON.stringify({ amount: amountHTG, orderId }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`MonCash CreatePayment: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    payment_token?: { token?: string };
  };
  const paymentToken = data.payment_token?.token;
  if (!paymentToken) throw new Error("MonCash CreatePayment: token absent.");

  const redirectUrl = `${gateway}/Payment/Redirect?token=${paymentToken}`;
  return {
    paymentToken,
    redirectUrl,
    mode,
    // Tiré de `redirectUrl`, donc de l'URL réellement remise à l'acheteur —
    // et non recalculé depuis l'environnement. Deux dérivations peuvent
    // diverger ; celle-ci ne le peut pas.
    gatewayHost: new URL(redirectUrl).host,
  };
}

export type MonCashPayment = {
  reference: string; // notre orderId
  transactionId: string;
  cost: number;
  message: string;
  payer: string;
  status: "successful" | "failed" | "pending" | string;
};

// Réponse brute MonCash : snake_case, et le succès est porté par `message`
// ("successful"), pas toujours par un champ `status`. On normalise pour tolérer
// les deux formats.
type RawMonCashPayment = {
  reference?: string;
  transaction_id?: string;
  transactionId?: string;
  cost?: number | string;
  message?: string;
  payer?: string;
  status?: string;
  payment_status?: string;
};

export function normalizePayment(
  raw: RawMonCashPayment | null | undefined
): MonCashPayment | null {
  if (!raw) return null;
  const status = String(raw.status ?? raw.payment_status ?? raw.message ?? "")
    .trim()
    .toLowerCase();
  return {
    reference: raw.reference ?? "",
    transactionId: raw.transaction_id ?? raw.transactionId ?? "",
    cost: Number(raw.cost ?? 0),
    message: raw.message ?? "",
    payer: raw.payer ?? "",
    status,
  };
}

/**
 * Vérifie l'état réel d'un paiement côté MonCash, par notre orderId.
 * C'est l'appel de vérité (INVARIANT 2) utilisé au retour et par le réconciliateur.
 * Renvoie null si MonCash ne connaît pas encore de paiement pour cet orderId.
 */
export async function retrieveOrderPayment(
  orderId: string
): Promise<MonCashPayment | null> {
  const token = await getAccessToken();
  const { rest } = config();

  const res = await fetch(`${rest}/v1/RetrieveOrderPayment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ orderId }),
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `MonCash RetrieveOrderPayment: ${res.status} ${await res.text()}`
    );
  }
  const data = (await res.json()) as { payment?: RawMonCashPayment };
  return normalizePayment(data.payment);
}

/**
 * Vérifie un paiement par son transactionId MonCash (ce que le retour navigateur
 * fournit). `reference` du résultat = notre orderId.
 */
export async function retrieveTransactionPayment(
  transactionId: string
): Promise<MonCashPayment | null> {
  const token = await getAccessToken();
  const { rest } = config();

  const res = await fetch(`${rest}/v1/RetrieveTransactionPayment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ transactionId }),
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `MonCash RetrieveTransactionPayment: ${res.status} ${await res.text()}`
    );
  }
  const data = (await res.json()) as { payment?: RawMonCashPayment };
  return normalizePayment(data.payment);
}

/** Statut MonCash → décision applicative. Succès = message/statut "successful". */
export function isSuccessful(p: MonCashPayment | null): boolean {
  return p?.status === "successful";
}

/**
 * Minimisation RGPD avant stockage dans payments.raw : on conserve ce qui sert à
 * la réconciliation/l'audit (référence, transaction, montant, statut, message)
 * mais on RETIRE l'identifiant du payeur (téléphone/compte), donnée personnelle
 * inutile à la vérité du paiement. On garde juste un booléen de présence.
 */
export function redactPayment(p: MonCashPayment): Record<string, unknown> {
  const { payer: _payer, ...rest } = p;
  return { ...rest, payer_present: Boolean(_payer) };
}
