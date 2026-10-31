#!/usr/bin/env node
/**
 * Génère une paire de clés VAPID pour les notifications de vente (0169),
 * sans dépendance : `node scripts/generer-cles-vapid.mjs`.
 *
 * Copier les deux valeurs dans Vercel (Production), avec ZABELIE_VAPID_SUBJECT
 * (`mailto:` + l'adresse de contact). La clé PRIVÉE est un secret : ne jamais la
 * coller dans le dépôt, un ticket ou une discussion. Changer la paire désabonne
 * tous les appareils (chacun devra réactiver les notifications).
 */
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });
const point = Buffer.concat([Buffer.from([0x04]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]);

console.log(`ZABELIE_VAPID_PUBLIC_KEY=${point.toString("base64url")}`);
console.log(`ZABELIE_VAPID_PRIVATE_KEY=${priv.d}`);
console.log("ZABELIE_VAPID_SUBJECT=mailto:<adresse de contact>");
