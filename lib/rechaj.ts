/**
 * LE NUMÉRO À RECHARGER — normalisation, validation, et un avertissement qui
 * n'a PAS le droit de bloquer.
 *
 * Pourquoi ce module existe : `POST /api/checkout` prenait `{ productId, rail }`
 * et rien d'autre. Un acheteur pouvait donc payer une recharge sans jamais dire
 * QUEL numéro recharger — le vendeur recevait une commande payée et
 * indélivrable. C'est le seul maillon qui manquait au rayon ouvert par `0098` :
 * publier, payer, geler l'escrow, déclarer la remise, confirmer la réception
 * existaient déjà (`0068`).
 *
 * CE QUE FONT LES AUTRES (relevé du 2026-09-06). Ding, Recharge.com, BOSS
 * Revolution, Hablax, SalutHaiti : trois champs, toujours dans le même ordre —
 * **opérateur → numéro du destinataire → montant** — puis une étape de
 * CONFIRMATION du numéro avant de payer, parce qu'un chiffre faux est
 * irrécupérable (WorldRemit : « if you enter the wrong number twice, the
 * transfer will go ahead and there is no way to reclaim it »).
 *
 * Sur Zabelie, deux des trois champs existent déjà sans être des champs :
 * l'opérateur EST le sous-rayon (`rechaj-digicel` / `rechaj-natcom`), et le
 * montant EST le prix du produit — un vendeur publie ses coupures comme autant
 * de fiches, exactement le modèle à coupures fixes de l'industrie. Il ne
 * manquait que le numéro.
 *
 * ⚠️ SOURCE DES PRÉFIXES, ET CE QU'ELLE PERMET. Les blocs par opérateur sont
 * tirés de RÉSUMÉS de recherche : le proxy de sortie a refusé chacune des pages
 * (recharge.com, saluthaiti.com, hablax.com, topup.digicelgroup.com), et le
 * service de scraping était hors clé. Aucune page n'a été ouverte. Les résumés
 * se CONTREDISENT sur les blocs en 4 : l'un donne « 4 = Natcom », l'autre
 * attribue `44` et `46` à Digicel. C'est précisément le défaut que
 * `docs/45-CONCURRENCE-HAITI.md` a déjà consigné une fois — un argument de
 * vente lu comme une mesure.
 *
 * D'où la règle de ce module, et c'est une décision, pas une prudence :
 * **la validation BLOQUE sur ce qui est certain, l'attribution AVERTIT sur ce
 * qui est incertain, et se tait sur ce qui est contredit.** Un contrôle bâti
 * sur une donnée non vérifiée qui refuserait un numéro légitime coûterait une
 * vente à chaque faux positif — et personne ne le verrait, puisque l'acheteur
 * refusé ne se plaint pas, il s'en va.
 */

/** Les deux opérateurs servis par le rayon (`0097`). */
export type Operateur = "digicel" | "natcom";

/**
 * Normalise une saisie humaine en 8 chiffres haïtiens, ou `null`.
 *
 * Accepte ce que les gens écrivent vraiment : « 3412 3456 », « +509 34123456 »,
 * « 00509-3412-3456 », « (509) 3412 3456 ». Refuse tout le reste.
 *
 * Le refus des fixes (préfixe `2`) est volontaire et sûr : recharger un fixe
 * n'a pas de sens, et « 2 = fixe, 3 et 4 = mobile » est le seul point où les
 * deux résumés s'accordent. C'est aussi la borne la plus utile : elle attrape
 * la faute de frappe la plus banale, un numéro de maison saisi à la place d'un
 * portable.
 */
export function normaliserNumeroHaiti(entree: unknown): string | null {
  if (typeof entree !== "string") return null;

  // Tout ce qui n'est pas un chiffre disparaît : espaces, tirets, points,
  // parenthèses, le `+`. Une saisie collée depuis les contacts du téléphone
  // arrive avec n'importe lequel de ces habillages.
  let chiffres = entree.replace(/\D/g, "");

  // Indicatif pays, sous ses trois formes courantes. On ne retire `509` que
  // s'il RESTE huit chiffres derrière : sans ce garde, un numéro local
  // commençant par 509… serait amputé. Aucun mobile haïtien ne commence par
  // 5, mais un garde qui dépend de cette croyance est un garde de moins.
  for (const indicatif of ["00509", "509"]) {
    if (chiffres.startsWith(indicatif) && chiffres.length === indicatif.length + 8) {
      chiffres = chiffres.slice(indicatif.length);
      break;
    }
  }

  if (!/^[34]\d{7}$/.test(chiffres)) return null;
  return chiffres;
}

/** Mise en forme lisible : « 3412 3456 ». Jamais utilisée pour comparer. */
export function afficherNumero(msisdn: string): string {
  return /^\d{8}$/.test(msisdn) ? `${msisdn.slice(0, 4)} ${msisdn.slice(4)}` : msisdn;
}

/**
 * Le numéro semble-t-il appartenir à un AUTRE opérateur que celui du rayon ?
 *
 * Rend `true` UNIQUEMENT quand les deux résumés s'accordent contre la fiche.
 * Les blocs contredits (`44`, `46` — donnés à Digicel par une source, à Natcom
 * par l'autre) et les blocs dont aucune source ne parle (`45`, `48`, `49`)
 * rendent `false` : on n'avertit pas sur ce qu'on ne sait pas.
 *
 * ⚠️ Ne JAMAIS transformer ce booléen en refus. C'est un avertissement lu par
 * l'acheteur, qui sait mieux que nous à qui appartient le numéro de sa mère —
 * et la portabilité du numéro suffirait à elle seule à rendre tout blocage
 * faux. Garde de test : `tests/rechaj-numero.test.ts`.
 */
export function operateurDouteux(msisdn: string, rayon: Operateur | null): boolean {
  if (!rayon || !/^[34]\d{7}$/.test(msisdn)) return false;

  const bloc = msisdn.slice(0, 2);

  // `3x` → Digicel : le seul point d'accord franc entre les deux relevés.
  if (msisdn.startsWith("3")) return rayon === "natcom";

  // Blocs en 4 attribués à Natcom par la source la plus précise, et par aucune
  // à Digicel. Les autres (`44`, `45`, `46`, `48`, `49`) restent muets.
  const NATCOM_SANS_CONTESTATION = ["40", "41", "42", "43", "47"];
  if (NATCOM_SANS_CONTESTATION.includes(bloc)) return rayon === "digicel";

  return false;
}

/** Les deux slugs de sous-rayon de `0097`, et l'opérateur qu'ils désignent. */
const RAYON_OPERATEUR: Record<string, Operateur> = {
  "rechaj-digicel": "digicel",
  "rechaj-natcom": "natcom",
};

/**
 * L'opérateur porté par le sous-rayon d'une fiche, ou `null`.
 *
 * `null` n'est pas une anomalie : une fiche rangée directement sous
 * « Recharge téléphone » (niveau 2) exige quand même un numéro, elle
 * n'affiche simplement aucun avertissement d'opérateur.
 */
export function operateurDuRayon(slug: string | null | undefined): Operateur | null {
  return (slug && RAYON_OPERATEUR[slug]) || null;
}

/**
 * Le slug racine du rayon. Une fiche l'ayant pour ancêtre exige un numéro —
 * c'est la même vérité que celle encodée par `zabelie_est_rechaj` en base, et
 * les deux se croisent dans `tests/rechaj-numero.test.ts`.
 */
export const RECHAJ_RACINE = "rechaj-telefon";

/** Les slugs qui, portés par la fiche elle-même, exigent un numéro. */
export const RECHAJ_SLUGS = [RECHAJ_RACINE, "rechaj-digicel", "rechaj-natcom"] as const;

/**
 * La fiche exige-t-elle un numéro à recharger ?
 *
 * Lit le slug du sous-rayon. C'est le MÊME test que celui du serveur, qui, lui,
 * remonte l'ascendance en SQL — ici on n'a que le slug direct, ce qui suffit
 * tant que le rayon n'a que trois niveaux. Le serveur reste l'autorité : cette
 * fonction décide seulement s'il faut AFFICHER le champ.
 */
export function exigeNumero(slug: string | null | undefined): boolean {
  return Boolean(slug && (RECHAJ_SLUGS as readonly string[]).includes(slug));
}
