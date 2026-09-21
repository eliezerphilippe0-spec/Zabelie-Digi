/**
 * NOMS DE BUCKETS — SOURCE UNIQUE.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST VIDE DE TOUTE DÉPENDANCE.
 *
 * Un nom de bucket est un artefact **adressé par CHAÎNE** : `tsc` ne verra
 * jamais qu'il a divergé. Mesuré le 2026-09-21 — trois buckets, **sept sites
 * de déclaration** : `DIGITAL_BUCKET` exporté ici sans aucun importeur pendant
 * que quatre fichiers recodaient `"product-files"` à la main, et un cinquième
 * le passait en littéral brut (`app/api/admin/digital-preview`). Renommer un
 * bucket par la constante aurait laissé les autres pointer vers un bucket
 * inexistant, compilation propre, sans un mot.
 *
 * Et l'échec aurait été muet du côté qui compte : le chemin VENDEUR n'est pas
 * instrumenté (`CLAUDE.md`, mesure du 2026-08-11). Un téléversement vers un
 * bucket absent ne remonte nulle part.
 *
 * ⚠️ **Aucun import ici, jamais** — pas même `import type`. Ce module est lu
 * par des composants `"use client"` (`components/upload-asset.tsx`). C'est
 * précisément pour ça qu'il ne vit pas dans `lib/digital-file-security.ts`,
 * qui importe `node:crypto` : y prendre le nom du bucket depuis le client
 * tirerait du Node dans le bundle.
 *
 * Le croisement `tests/buckets-croisement.test.ts` garde trois choses, dans
 * les deux sens : chaque nom d'ici a une migration qui le crée, chaque bucket
 * créé en migration est adressé, et **aucun site n'adresse un bucket par
 * littéral** — seul le passage par ces constantes rend un renommage sûr.
 */

/** Livrables numériques. Privé — jamais d'URL publique, uniquement signée. */
export const DIGITAL_BUCKET = "product-files";

/** Couvertures et galerie produit. Public — l'URL se dérive du chemin. */
export const MEDIA_BUCKET = "product-covers";

/** Pièces d'identité vendeur. Privé — le titulaire seul lit son dossier. */
export const KYC_BUCKET = "kyc-documents";
