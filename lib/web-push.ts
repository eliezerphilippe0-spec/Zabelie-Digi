import { createECDH, createPrivateKey, sign, type KeyObject } from "node:crypto";

/**
 * NOTIFICATIONS PUSH — l'envoi, sans dépendance (niveau 2, 2026-10-31).
 *
 * ─── UN SIGNAL SANS CONTENU ────────────────────────────────────────────────
 * Le message part VIDE : aucun chiffrement de charge utile à faire, et le
 * service de notification du navigateur (Google, Apple, Mozilla, Microsoft)
 * ne voit passer qu'un signal, jamais un montant ni un produit. Le service
 * worker de Zabelie écrit lui-même le texte (`lib/notification-vente.ts`).
 *
 * ─── VAPID (RFC 8292) ──────────────────────────────────────────────────────
 * Chaque envoi porte un jeton ES256 signé avec la clé privée de Zabelie : le
 * service de notification n'accepte que les envois du propriétaire de la clé
 * publique avec laquelle l'appareil s'est abonné. Les clés vivent dans Vercel
 * (`ZABELIE_VAPID_PUBLIC_KEY`, `ZABELIE_VAPID_PRIVATE_KEY`,
 * `ZABELIE_VAPID_SUBJECT`) ; sans les trois, tout est éteint.
 *
 * ─── LISTE D'HÔTES ─────────────────────────────────────────────────────────
 * Le serveur appelle l'adresse que l'appareil a fournie. Sans liste, un client
 * pourrait faire appeler n'importe quelle URL par le serveur (SSRF) : seules
 * les adresses des services de notification connus sont acceptées.
 */

const HOTES_PUSH = /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/;

/** L'adresse d'abonnement est-elle celle d'un service de notification connu ? */
export function adressePushAcceptable(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.port === "" && url.username === "" && url.password === "" && HOTES_PUSH.test(url.hostname);
}

export type ClesVapid = { publique: string; prive: KeyObject; sujet: string };

const b64url = (b: Buffer) => b.toString("base64url");

/**
 * Lit et VALIDE les trois variables. Clé publique : point P-256 non compressé
 * (65 octets, base64url) ; clé privée : scalaire de 32 octets (base64url) ;
 * sujet : `mailto:` ou `https:`. Une seule invalide → `null`, tout s'éteint.
 */
export function lireClesVapid(
  publiqueBrute: string | undefined = process.env.ZABELIE_VAPID_PUBLIC_KEY,
  priveeBrute: string | undefined = process.env.ZABELIE_VAPID_PRIVATE_KEY,
  sujetBrut: string | undefined = process.env.ZABELIE_VAPID_SUBJECT,
): ClesVapid | null {
  // Lectures EXPLICITES (inventaire `.env.example`), injectables par argument.
  const publique = publiqueBrute?.trim();
  const privee = priveeBrute?.trim();
  const sujet = sujetBrut?.trim();
  if (!publique || !privee || !sujet || !/^(mailto:|https:\/\/)/.test(sujet)) return null;
  try {
    const point = Buffer.from(publique, "base64url");
    const d = Buffer.from(privee, "base64url");
    if (point.length !== 65 || point[0] !== 0x04 || d.length !== 32) return null;
    // La clé privée doit ENGENDRER la clé publique donnée : sinon chaque envoi
    // serait refusé par le service, en silence, et l'erreur se lirait « aucun abonné ».
    // ⚠️ Recalculée depuis le SEUL scalaire (ECDH) : importée en JWK, une clé
    // privée garde le point public qu'on lui fournit, sans le vérifier — mesuré
    // le 2026-10-31, une paire incohérente passait un contrôle fondé sur elle.
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(d);
    if (!ecdh.getPublicKey().equals(point)) return null;
    const prive = createPrivateKey({
      key: { kty: "EC", crv: "P-256", x: b64url(point.subarray(1, 33)), y: b64url(point.subarray(33, 65)), d: b64url(d) },
      format: "jwk",
    });
    return { publique, prive, sujet };
  } catch {
    // Clé privée qui ne correspond pas à la publique, ou mal formée.
    return null;
  }
}

/** Jeton VAPID : `aud` = origine du service, expiration 12 h (le maximum est 24 h). */
export function jetonVapid(endpoint: string, cles: ClesVapid, maintenant = Date.now()): string {
  const entete = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corps = b64url(
    Buffer.from(
      JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(maintenant / 1000) + 12 * 3600, sub: cles.sujet }),
    ),
  );
  const signature = sign("sha256", Buffer.from(`${entete}.${corps}`), { key: cles.prive, dsaEncoding: "ieee-p1363" });
  return `${entete}.${corps}.${b64url(signature)}`;
}

export type IssueEnvoi = "envoye" | "expire" | "echec";

/**
 * Envoie UN signal vide. `expire` (404, 410) : l'abonnement n'existe plus, à
 * supprimer. `echec` : autre refus ou réseau, à réessayer à la vente suivante.
 */
export async function envoyerSignal(
  endpoint: string,
  cles: ClesVapid,
  fetcher: typeof fetch = fetch,
  delaiMs = 5000,
): Promise<IssueEnvoi> {
  if (!adressePushAcceptable(endpoint)) return "expire";
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), delaiMs);
  try {
    const reponse = await fetcher(endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jetonVapid(endpoint, cles)}, k=${cles.publique}`,
        TTL: "86400",
        Urgency: "high",
        "Content-Length": "0",
      },
      signal: controleur.signal,
    });
    if (reponse.status === 404 || reponse.status === 410) return "expire";
    return reponse.ok ? "envoye" : "echec";
  } catch {
    return "echec";
  } finally {
    clearTimeout(minuterie);
  }
}
