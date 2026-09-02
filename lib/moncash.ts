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
 * LE MODE SE RÉSOUT, IL NE SE CASTE PAS — posé le 2026-08-22, la veille du
 * geste 4 de `docs/22`.
 *
 * ⚠️ CE QUE FAISAIT LA LIGNE D'AVANT, et pourquoi c'était un piège armé :
 *
 *     const mode = (process.env.MONCASH_MODE as MonCashMode) ?? "sandbox";
 *
 * Un `as` n'est pas une vérification, c'est une promesse au compilateur. Et
 * `bases()` compare `mode === "production"` avec un `else` binaire : donc
 * **`Production`, `production ` (espace de fin), `prod`, ou la chaîne VIDE
 * retombaient silencieusement en bac à sable.** La chaîne vide n'est pas
 * `null` — le `?? "sandbox"` ne la rattrapait même pas ; c'est `bases()` qui
 * la renvoyait au sandbox par défaut de branche.
 *
 * `docs/22` §« Après le geste 4 » nomme ce défaut : « une valeur malformée ne
 * lève RIEN. La cause n'est pas gardée ; seul l'effet est désormais lisible. »
 * Ce bloc garde la cause.
 *
 * Pourquoi ça compte MAINTENANT et pas avant : cinq paiements ont déjà échoué
 * en production entre le 2026-08-11 et le 2026-08-14, tous pour cause d'hôte
 * bac à sable. Le geste 4 consiste précisément à taper `production` dans un
 * champ de formulaire Vercel. Un espace de fin collé depuis un presse-papier
 * produirait une **sixième** tentative ratée — cette fois sur un rail qu'on
 * croit réel, avec un acheteur réel devant l'écran.
 *
 * Les trois comportements, et l'asymétrie est délibérée :
 *   • ABSENTE / VIDE   → `sandbox`, MAIS la SOURCE est rendue avec le mode.
 *                        Voir l'avertissement ci-dessous : c'est la revue
 *                        porteur du 2026-08-22 qui a exigé cette distinction.
 *   • casse/espaces    → NORMALISÉE. « Production » veut dire production, et
 *                        refuser au moment du basculement serait une cruauté
 *                        gratuite. `lib/site-url.ts:16` `.trim()` déjà pour la
 *                        même raison.
 *   • autre chose      → **LÈVE**. `prod`, `true`, `1`, `live` sont ambigus :
 *                        les deviner, c'est choisir à la place de quelqu'un
 *                        quel hôte encaisse de l'argent réel.
 *
 * ⚠️ **LA MÊME PANNE PAR UNE AUTRE PORTE — trouvée par la revue porteur du
 * 2026-08-22, pas par moi.** La première version rendait `"sandbox"` tout court
 * pour une variable ABSENTE. Or c'est exactement le défaut que ce garde
 * prétendait fermer : quelqu'un qui SUPPRIME `MONCASH_MODE` d'un déploiement
 * de production retombe en bac à sable, silencieusement, et l'on recommence les
 * cinq échecs — cette fois sans même un espace à incriminer.
 *
 * La fonction rend donc `{ mode, source }`. Le chemin de paiement n'utilise que
 * `mode` (le défaut local ne bouge pas — sinon tout développement casse), et le
 * PRÉ-VOL distingue `sandbox (absente)` de `sandbox (explicite)`. Deux états du
 * monde qui produisaient jusqu'ici la même chaîne de caractères.
 *
 * Pourquoi ne pas lever aussi sur l'absence : ce serait casser le local et les
 * Preview de tout le monde pour se prémunir d'une suppression en production. Le
 * défaut reste légitime ; ce qui ne l'était pas, c'est qu'il soit INDISCERNABLE.
 *
 * Fail-closed assumé sur les valeurs illisibles : lever empêche le paiement.
 * C'est voulu — un paiement qui part chez le mauvais hôte est strictement pire
 * qu'un paiement qui ne part pas, et c'est exactement ce que les cinq échecs
 * ont coûté.
 */
export type MonCashModeSource = "absente" | "vide" | "explicite";

export function resolveMonCashMode(brut: string | undefined): {
  mode: MonCashMode;
  source: MonCashModeSource;
} {
  if (brut === undefined) return { mode: "sandbox", source: "absente" };
  const v = brut.trim().toLowerCase();
  if (v === "") return { mode: "sandbox", source: "vide" };
  if (v === "sandbox" || v === "production") return { mode: v, source: "explicite" };
  throw new Error(
    `MonCash: MONCASH_MODE vaut « ${brut} », qui n'est ni "sandbox" ni ` +
      `"production". Refus de deviner quel hôte doit encaisser. Corriger la ` +
      `variable dans Vercel, puis redéployer.`
  );
}

/**
 * LE GARDE DE PRODUCTION — un acheteur réel ne part JAMAIS en bac à sable.
 *
 * ⚠️ Écrit le 2026-09-02, après la mesure qui a rendu l'audit NO-GO : sept
 * tentatives d'achat, TROIS acheteurs distincts, cinq jours, toutes parties
 * vers `sandbox.moncashbutton…` parce que `MONCASH_MODE` n'était pas posée.
 * Le repli était sûr pour la sécurité et il l'est toujours ; il était une
 * panne de revenu, et il l'est toujours — sauf qu'il n'est plus PRIS là où
 * il coûte.
 *
 * Le commentaire au-dessus de `resolveMonCashMode` explique pourquoi
 * l'absence ne lève pas : casser le local et les Preview pour se prémunir
 * d'une suppression en production serait un mauvais échange. Ce garde tient
 * les deux bouts : il ne regarde que `VERCEL_ENV === "production"` — PAS
 * `NODE_ENV`, qui vaut aussi « production » sur un build de Preview. Le
 * développement et les Preview gardent leur défaut ; la production, elle,
 * refuse de créer un paiement dont le mode n'a pas été CHOISI.
 *
 * Refuser vaut mieux que router : un 502 renvoie l'acheteur à l'écran avec
 * « opérateur indisponible » et relibère le stock ; un bac à sable lui fait
 * croire qu'il a payé, puis expire 48 h plus tard en silence.
 */
export function garderProduction(
  source: MonCashModeSource,
  vercelEnv: string | undefined
): void {
  if (vercelEnv !== "production") return;
  if (source === "explicite") return;
  throw new Error(
    `MonCash: MONCASH_MODE ${source} sur un déploiement de PRODUCTION — refus ` +
      `de créer un paiement en bac à sable pour un acheteur réel. Poser ` +
      `MONCASH_MODE=production dans Vercel, puis redéployer.`
  );
}

/** Ce que le pré-vol du geste 5 (`docs/22`) rapporte. */
export type SondeMonCash = {
  /** `sandbox` · `production` · `illisible`. */
  mode: string;
  /** `explicite` · `absente` · `vide` · `illisible` — la moitié qui manquait. */
  source: string;
  hote: string | null;
  /**
   * ⚠️ LE VERDICT DE BASCULE — ajouté le 2026-08-22, seconde revue porteur.
   *
   * Sans lui, le geste 5 demande de comparer TROIS champs de tête et de
   * conclure. C'est une impression, pas un relevé — exactement ce que ce
   * document reproche à « ça a marché ». Et l'erreur naturelle est de lire
   * `mode: "sandbox", source: "absente"` comme rassurant : le repli est sûr
   * pour la SÉCURITÉ, il est une panne de REVENU. Un déploiement de production
   * en bac à sable silencieux n'encaisse rien, et personne ne le voit.
   *
   * `pret` n'est vrai QUE pour `production` + `explicite`. En développement il
   * vaut `false` avec une raison, ce qui est correct et non une erreur : on
   * n'est pas prêt à encaisser de l'argent réel, par construction.
   */
  bascule: { pret: boolean; raison: string | null };
};

/**
 * LE PRÉ-VOL — et il **NE LÈVE JAMAIS**, quelle que soit l'entrée.
 *
 * ⚠️ Exigence de la revue porteur du 2026-08-22, et elle est juste : « une 500
 * au moment du geste 5 me laisserait sans lecture au pire moment ». Le contrôle
 * de cohérence qui l'héberge vérifie l'invariant du grand livre (`0033`) — le
 * faire tomber sur un champ MonCash mal saisi le rendrait indisponible
 * précisément la veille d'un basculement.
 *
 * `tests/moncash-mode-resolu.test.ts` R9 l'ÉPROUVE sur une batterie de valeurs
 * hostiles plutôt que de lire le `catch` dans le fichier : un `try` peut être
 * présent et ne rien attraper.
 */
export function sondeMonCash(): SondeMonCash {
  try {
    const { mode, source } = resolveMonCashMode(process.env.MONCASH_MODE);
    const hote = monCashGatewayHost(mode);
    /* Journalisé DANS LES DEUX SENS. Un `sandbox` par absence de variable sur
     * un déploiement de production est une anomalie qui doit laisser une trace
     * même si personne n'ouvre la route. */
    if (source === "explicite") {
      console.info(`[coherence] MonCash mode=${mode} (explicite) hote=${hote}`);
    } else {
      console.error(
        `[coherence] MONCASH_MODE ${source.toUpperCase()} — repli sur ${mode} ` +
          `(${hote}). En production, aucun paiement réel n'aboutira.`
      );
    }
    return { mode, source, hote, bascule: verdictBascule(mode, source) };
  } catch (e) {
    console.error("[coherence] MONCASH_MODE ILLISIBLE — aucun paiement ne partira", e);
    return {
      mode: "illisible",
      source: "illisible",
      hote: null,
      bascule: {
        pret: false,
        raison:
          "MONCASH_MODE porte une valeur ambiguë : toute création de paiement " +
          "lèvera. Corriger la variable dans Vercel, puis redéployer.",
      },
    };
  }
}

/** Le verdict, et il n'est vrai que pour un seul état du monde. */
function verdictBascule(
  mode: MonCashMode,
  source: MonCashModeSource
): { pret: boolean; raison: string | null } {
  if (source === "absente") {
    return {
      pret: false,
      raison:
        "MONCASH_MODE n'est pas posée : repli sandbox. Le repli est SÛR mais " +
        "il n'encaisse rien — c'est une panne de revenu, invisible depuis " +
        "l'interface. Sur un déploiement de PRODUCTION, createPayment REFUSE " +
        "(garderProduction) : aucun acheteur ne part en bac à sable, mais " +
        "aucun ne peut payer non plus. Poser la variable, puis redéployer.",
    };
  }
  if (source === "vide") {
    return {
      pret: false,
      raison:
        "MONCASH_MODE existe mais vaut la chaîne vide : repli sandbox, aucun " +
        "paiement réel. Renseigner la variable, puis redéployer.",
    };
  }
  if (mode !== "production") {
    return {
      pret: false,
      raison:
        "MONCASH_MODE vaut sandbox, explicitement. Correct en développement " +
        "et en Preview ; à basculer sur production pour encaisser réellement.",
    };
  }
  return { pret: true, raison: null };
}

/** L'hôte de passerelle réellement employé — ni secret, ni devinable. */
export function monCashGatewayHost(mode: MonCashMode): string {
  return new URL(bases(mode).gateway).host;
}

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
  const { mode } = resolveMonCashMode(process.env.MONCASH_MODE);

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
  /* Le garde vit ICI et pas dans `config()`, délibérément : `config()` sert
   * aussi `retrieveOrderPayment`, donc le réconciliateur. Le poser là ferait
   * lever la réconciliation des paiements déjà partis en bac à sable — qui
   * doivent pouvoir expirer proprement, pas rester `pending` à jamais. Ce
   * qu'on refuse, c'est d'en CRÉER un de plus. */
  garderProduction(
    resolveMonCashMode(process.env.MONCASH_MODE).source,
    process.env.VERCEL_ENV
  );
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
