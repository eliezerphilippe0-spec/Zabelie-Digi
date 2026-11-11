import { request as httpsRequest } from "node:https";
import { lookupPublic, urlWebhookValide } from "@/lib/webhooks";
import { extraireFiche, type FicheImportee } from "@/lib/import-fiche";

/**
 * IMPORT D'UNE FICHE PAR LIEN — lecture de la page (lot 2, 2026-11-11).
 *
 * Le serveur va chercher une adresse fournie par un utilisateur : c'est la
 * définition d'une faille SSRF si on n'y prend pas garde. Les gardes, tous
 * repris de l'envoi des webhooks (`lib/webhooks.ts`), pas réécrits :
 *
 * * `urlWebhookValide` : https seulement, port 443, pas d'identifiants, pas
 *   d'adresse IP en clair, pas de nom local ;
 * * `lookupPublic` : à la CONNEXION, refus si une seule des adresses résolues
 *   est privée. Le contrôle porte sur l'adresse réellement jointe, pas sur un
 *   nom vérifié plus tôt ;
 * * redirections suivies À LA MAIN, trois au plus, chaque étape repassant les
 *   deux gardes : une page publique ne peut pas renvoyer vers l'intérieur ;
 * * délai, taille et type bornés : une page lente, énorme ou qui n'est pas du
 *   HTML est abandonnée.
 *
 * Aucun cookie, aucune identité n'accompagne la requête : la page est lue comme
 * par un visiteur anonyme, et une page qui exige une connexion n'est pas lue.
 */

export const IMPORT_DELAI_MS = 8_000;
export const IMPORT_OCTETS_MAX = 600 * 1024;
export const IMPORT_REDIRECTIONS_MAX = 3;
const AGENT = "ZabelieImport/1.0 (+https://zabelie.com/developpeurs)";

export type ReponseBrute = { status: number; type: string; emplacement: string | null; corps: Buffer };
export type Lecteur = (url: string) => Promise<ReponseBrute>;

/** Lecteur réel : GET https, DNS filtré à la connexion, aucune redirection automatique, corps borné. */
export const lireHttps: Lecteur = (url) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(url, {
      method: "GET",
      headers: { "User-Agent": AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "fr,ht;q=0.9,en;q=0.5" },
      lookup: lookupPublic() as never,
      timeout: IMPORT_DELAI_MS,
    }, (res) => {
      const morceaux: Buffer[] = [];
      let lu = 0;
      const rendre = () => resolve({
        status: res.statusCode ?? 0,
        type: String(res.headers["content-type"] ?? "").toLowerCase(),
        emplacement: typeof res.headers.location === "string" ? res.headers.location : null,
        corps: Buffer.concat(morceaux),
      });
      res.on("data", (c: Buffer) => {
        lu += c.length;
        // Au-delà de la borne, on garde ce qui est lu : les métadonnées sont en tête de page.
        if (lu > IMPORT_OCTETS_MAX) { morceaux.push(c.subarray(0, Math.max(0, c.length - (lu - IMPORT_OCTETS_MAX)))); res.destroy(); return; }
        morceaux.push(c);
      });
      res.on("end", rendre);
      res.on("close", rendre);
      res.on("error", rendre);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });

export type ResultatImport =
  | { ok: true; fiche: FicheImportee; hote: string }
  | { ok: false; raison: "lien_invalide" | "illisible" | "rien_trouve" };

/** Le texte de la page, dans l'encodage qu'elle annonce (UTF-8 par défaut). */
function decoder(corps: Buffer, type: string): string {
  const annonce = /charset\s*=\s*"?([a-z0-9_-]+)/i.exec(type)?.[1] ?? /<meta[^>]+charset\s*=\s*["']?([a-z0-9_-]+)/i.exec(corps.subarray(0, 2048).toString("latin1"))?.[1];
  try {
    return new TextDecoder(annonce ?? "utf-8").decode(corps);
  } catch {
    return new TextDecoder("utf-8").decode(corps);
  }
}

/**
 * Lit une page publique et en extrait titre et description.
 * Le lecteur est injectable : les tests n'ouvrent aucune connexion.
 */
export async function importerFicheParLien(brut: unknown, lire: Lecteur = lireHttps): Promise<ResultatImport> {
  let url = urlWebhookValide(brut);
  if (!url) return { ok: false, raison: "lien_invalide" };
  for (let saut = 0; saut <= IMPORT_REDIRECTIONS_MAX; saut++) {
    let reponse: ReponseBrute;
    try {
      reponse = await lire(url);
    } catch {
      return { ok: false, raison: "illisible" };
    }
    if (reponse.status >= 300 && reponse.status < 400) {
      if (!reponse.emplacement) return { ok: false, raison: "illisible" };
      let suivante: string;
      try { suivante = new URL(reponse.emplacement, url).toString(); } catch { return { ok: false, raison: "illisible" }; }
      // La cible d'une redirection repasse le MÊME garde que le lien d'origine.
      const valide = urlWebhookValide(suivante);
      if (!valide) return { ok: false, raison: "illisible" };
      url = valide;
      continue;
    }
    if (reponse.status !== 200 || !/^(text\/html|application\/xhtml\+xml)\b/.test(reponse.type)) return { ok: false, raison: "illisible" };
    const fiche = extraireFiche(decoder(reponse.corps, reponse.type));
    return fiche ? { ok: true, fiche, hote: new URL(url).hostname } : { ok: false, raison: "rien_trouve" };
  }
  return { ok: false, raison: "illisible" };
}
