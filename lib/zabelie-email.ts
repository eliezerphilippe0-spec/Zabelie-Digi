/**
 * Envoi d'e-mails transactionnels (V-13) via Resend (API REST, sans SDK).
 * Non configuré (RESEND_API_KEY absent) → no-op silencieux : AUCUN e-mail ne
 * doit jamais bloquer ni faire échouer une confirmation de paiement.
 */

export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Expéditeur de repli — voir `EXPEDITEUR_REPLI_LIMITE` plus bas. */
export const EXPEDITEUR_REPLI = "Zabelie <onboarding@resend.dev>";

/**
 * ⚠️ LE REPLI N'EST PAS UN EXPÉDITEUR DE PRODUCTION. `onboarding@resend.dev`
 * est l'adresse de bac à sable de Resend : elle n'accepte de livrer qu'à
 * **l'adresse du titulaire du compte**. Tout envoi vers un acheteur ou un
 * vendeur est refusé côté fournisseur.
 *
 * C'est le mode de panne le plus probable de ce dépôt, et le plus silencieux :
 * `RESEND_API_KEY` peut être parfaitement valide, `isEmailEnabled()` rendre
 * `true`, la sonde de cohérence afficher « configuré », et **aucun e-mail
 * n'atteindre jamais personne**.
 */
export const EXPEDITEUR_REPLI_LIMITE =
  "bac à sable Resend : ne livre qu'à l'adresse du titulaire du compte";

export function emailFrom(): string {
  return process.env.EMAIL_FROM ?? EXPEDITEUR_REPLI;
}

export function isEmailFromConfigured(): boolean {
  return Boolean(process.env.EMAIL_FROM);
}

/** `Zabelie <bonjou@zabelie.com>` → `zabelie.com`. `null` si illisible. */
export function domaineExpediteur(from: string): string | null {
  const m = from.match(/[^\s<>@]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * ⚠️ AUCUNE CLÉ NE DOIT SORTIR D'ICI, JAMAIS — y compris par le corps d'erreur
 * du fournisseur, qu'on ne contrôle pas. Un préfixe Resend (`re_…`) est donc
 * masqué avant journalisation. Ceinture ET bretelles : Resend ne renvoie pas la
 * clé aujourd'hui, et « aujourd'hui » n'est pas une garantie.
 */
function sansSecret(s: string): string {
  return s.replace(/re_[A-Za-z0-9_-]{4,}/g, "re_***");
}

/** `achteur@gmail.com` → `a***@gmail.com`. Un journal n'est pas un carnet d'adresses. */
function masquer(adresse: string): string {
  const i = adresse.indexOf("@");
  if (i <= 0) return "***";
  return `${adresse[0]}***${adresse.slice(i)}`;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = emailFrom();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html }),
      cache: "no-store",
    });
    /* ⚠️ CE JOURNAL MANQUAIT, ET SON ABSENCE ÉTAIT LE VRAI DÉFAUT.
     *
     * Jusqu'au 2026-08-22, cette fonction rendait `res.ok` sans un mot. Un
     * `401` (clé révoquée), un `403` (expéditeur non autorisé — le cas du
     * repli ci-dessus), un `422` (domaine non vérifié) : tous devenaient un
     * `false` muet. Et deux des trois appelants JETTENT ce booléen
     * (`zabelie-notify.ts`, `messagerie-notify.ts`) — seul
     * `fulfillment-notices.ts` le regarde.
     *
     * Autrement dit : un refus du fournisseur était indiscernable d'un envoi
     * réussi, à tous les étages. C'est le corollaire d'observabilité de
     * `CLAUDE.md` — « l'absence de signal doit être un signal » — enfreint à
     * l'endroit exact où le porteur posait la question. */
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `[email] REFUS DU FOURNISSEUR — HTTP ${res.status} · from=${from} · ` +
          `to=${masquer(input.to)} · ${sansSecret(detail).slice(0, 300)}`
      );
    }
    return res.ok;
  } catch (e) {
    // Jamais d'exception : l'e-mail est best-effort. Mais plus jamais muet.
    console.error("[email] FOURNISSEUR INJOIGNABLE", e);
    return false;
  }
}

/** Verdicts de `verifierFournisseur`, du pire au meilleur. */
export type VerdictEmail =
  | "absente"
  | "cle_refusee"
  | "injoignable"
  | "repli_bac_a_sable"
  | "domaine_non_verifie"
  | "ok";

export type RapportEmail = {
  verdict: VerdictEmail;
  /** Présence de la clé — jamais sa valeur. */
  clePresente: boolean;
  /** Code HTTP rendu par Resend, `null` si on n'a pas pu demander. */
  statutFournisseur: number | null;
  /** L'expéditeur EFFECTIF. Une adresse d'envoi est publique par nature. */
  expediteur: string;
  expediteurConfigure: boolean;
  domaineExpediteur: string | null;
  /** Domaines que Resend déclare vérifiés pour ce compte. */
  domainesVerifies: string[];
  explication: string;
};

/**
 * LA VÉRIFICATION RÉELLE — celle qui interroge le fournisseur.
 *
 * ⚠️ POURQUOI ELLE EXISTE, ET POURQUOI LA SONDE PRÉCÉDENTE NE SUFFISAIT PAS.
 * Le 2026-08-22, la question « vérifie RESEND_API_KEY » a reçu pour toute
 * réponse un booléen de PRÉSENCE (`integrations.email.configure`). Ce booléen
 * est vrai dans trois situations où rien ne part :
 *
 *   1. la clé est présente mais RÉVOQUÉE → Resend répond 401 ;
 *   2. `EMAIL_FROM` n'est pas posé → repli sur le bac à sable, qui ne livre
 *      qu'au titulaire du compte. **Aucun acheteur, aucun vendeur ne reçoit
 *      rien**, et c'est le cas par défaut du dépôt aujourd'hui ;
 *   3. `EMAIL_FROM` est posé sur un domaine non vérifié chez Resend → refus.
 *
 * Les trois passent `isEmailEnabled()`. Aucun ne laisse de trace, puisque
 * `sendEmail` était muet. Une sonde qui ne distingue pas « configuré » de
 * « fonctionne » répond à côté de la question qu'on lui pose.
 *
 * `GET /domains` est choisi plutôt qu'un envoi d'essai : il ne consomme aucun
 * quota, n'écrit rien, et rend d'un seul coup la validité de la clé ET la
 * liste des domaines vérifiés — c'est-à-dire les deux moitiés de la réponse.
 */
export async function verifierFournisseur(): Promise<RapportEmail> {
  const from = emailFrom();
  const domaine = domaineExpediteur(from);
  const base = {
    clePresente: isEmailEnabled(),
    statutFournisseur: null as number | null,
    expediteur: from,
    expediteurConfigure: isEmailFromConfigured(),
    domaineExpediteur: domaine,
    domainesVerifies: [] as string[],
  };

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return {
      ...base,
      verdict: "absente",
      explication:
        "RESEND_API_KEY n'est pas posée. L'outbox (0061) et les notifications " +
        "de messagerie (0090) se drainent sans rien envoyer.",
    };
  }

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
  } catch (e) {
    console.error("[email-verify] fournisseur injoignable", e);
    return {
      ...base,
      verdict: "injoignable",
      explication:
        "Resend n'a pas répondu. La clé peut être bonne : ce verdict ne dit " +
        "rien d'elle, seulement que la question n'a pas pu être posée.",
    };
  }

  base.statutFournisseur = res.status;
  if (!res.ok) {
    const detail = sansSecret(await res.text().catch(() => "")).slice(0, 300);
    console.error(`[email-verify] CLÉ REFUSÉE — HTTP ${res.status} · ${detail}`);
    return {
      ...base,
      verdict: "cle_refusee",
      explication:
        `Resend a répondu ${res.status}. La clé est présente mais elle n'est ` +
        "pas acceptée — révoquée, tronquée, ou copiée depuis un autre compte.",
    };
  }

  type Domaine = { name?: string; status?: string };
  let liste: Domaine[] = [];
  try {
    const corps = (await res.json()) as { data?: Domaine[] } | Domaine[];
    liste = Array.isArray(corps) ? corps : (corps.data ?? []);
  } catch {
    liste = [];
  }
  base.domainesVerifies = liste
    .filter((d) => d.status === "verified" && typeof d.name === "string")
    .map((d) => d.name!.toLowerCase());

  if (!base.expediteurConfigure) {
    return {
      ...base,
      verdict: "repli_bac_a_sable",
      explication:
        `La clé est VALIDE, mais EMAIL_FROM n'est pas posée : l'expéditeur ` +
        `retombe sur ${EXPEDITEUR_REPLI} — ${EXPEDITEUR_REPLI_LIMITE}. ` +
        "Aucun acheteur ni vendeur ne reçoit quoi que ce soit.",
    };
  }

  if (!domaine || !base.domainesVerifies.includes(domaine)) {
    return {
      ...base,
      verdict: "domaine_non_verifie",
      explication:
        `La clé est VALIDE, mais le domaine « ${domaine ?? "illisible"} » de ` +
        "EMAIL_FROM ne figure pas parmi les domaines vérifiés du compte " +
        `(${base.domainesVerifies.join(", ") || "aucun"}). Resend refusera ` +
        "chaque envoi. La vérification passe par les enregistrements DNS.",
    };
  }

  return {
    ...base,
    verdict: "ok",
    explication:
      `Clé valide, expéditeur ${from}, domaine ${domaine} vérifié chez Resend. ` +
      "Reste non prouvé : qu'un e-mail soit effectivement REÇU — seul un envoi " +
      "réel le dirait.",
  };
}

const wrap = (body: string) => `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
            max-width:520px;margin:0 auto;padding:24px;color:#26141f">
  <p style="font-weight:800;font-size:18px;margin:0 0 16px">
    <span style="color:#d96a16">Z</span> Zabelie</p>
  ${body}
  <p style="margin-top:24px;font-size:12px;color:#77636b">
    Zabelie — makètplas ayisyen an.<br>
    Ne répondez pas à cet e-mail automatique.</p>
</div>`;

/** E-mail acheteur : achat confirmé, lien vers ses téléchargements. FR + KR. */
export function buyerPurchaseEmail(input: {
  productTitle: string;
  amountLabel: string;
  purchasesUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `✅ Achat confirmé — ${input.productTitle}`,
    html: wrap(`
      <p><strong>Mèsi ! Acha ou konfime.</strong> / Merci ! Votre achat est confirmé.</p>
      <p style="font-size:15px">${input.productTitle} — <strong>${input.amountLabel}</strong></p>
      <p><a href="${input.purchasesUrl}"
            style="display:inline-block;background:#d96a16;color:#fff;
                   padding:12px 20px;border-radius:10px;text-decoration:none;
                   font-weight:700">Telechaje / Télécharger mes achats</a></p>
      <p style="font-size:13px;color:#77636b">Fichye ou disponib nan « Acha mwen yo »
      — lien valable à tout moment, même si la connexion a coupé pendant l'achat.</p>
    `),
  };
}

/** E-mail vendeur : nouvelle vente 🎉 (le moment qui rend accro). FR + KR. */
export function sellerSaleEmail(input: {
  productTitle: string;
  netLabel: string;
  dashboardUrl: string;
  /** Numéro lisible (0042) — null tant que la migration n'est pas appliquée. */
  orderRef?: string | null;
}): { subject: string; html: string } {
  return {
    subject: `🎉 Ou fè yon vant ! — ${input.productTitle}`,
    html: wrap(`
      <p><strong>🎉 Félicitations — nouvelle vente !</strong></p>
      <p style="font-size:15px">${input.productTitle}</p>
      ${input.orderRef ? `<p>Nimewo kòmand / N° de commande : <strong>${input.orderRef}</strong></p>` : ""}
      <p>Net vendeur crédité (en attente J+7) : <strong>${input.netLabel}</strong></p>
      <p><a href="${input.dashboardUrl}"
            style="display:inline-block;background:#5c2340;color:#fff;
                   padding:12px 20px;border-radius:10px;text-decoration:none;
                   font-weight:700">Wè tablo bò mwen / Voir mon tableau de bord</a></p>
    `),
  };
}

/* ─────────────── Avis de remise (0043 §5) — la légitimité de l'horloge ──────
 *
 * CES TROIS MESSAGES NE SONT PAS DÉCORATIFS. L'auto-réception est un transfert
 * de propriété déclenché par le SILENCE : un silence ne vaut consentement que
 * si la personne a su que l'horloge tournait. Sans avis, puis rappel, on ne
 * facture pas un silence — on exproprie quelqu'un qui n'a jamais su.
 *
 * Ils disent donc trois choses, dans cet ordre : ce que le vendeur DÉCLARE
 * (Zabelie ne vérifie rien et ne doit pas laisser croire le contraire), la
 * DATE à laquelle le silence tranchera, et le geste pour dire « je n'ai pas
 * reçu ». Ce dernier lien n'est pas optionnel : sans lui, la seule protection
 * de l'acheteur serait de ne rien faire, or ne rien faire est le geste qui
 * paie le vendeur.
 *
 * Kreyòl d'abord, français ensuite — même règle que les deux e-mails ci-dessus.
 */

const ligneCommande = (titre: string, ref?: string | null) =>
  `<p style="font-size:15px">${titre}${
    ref ? ` — <strong>${ref}</strong>` : ""
  }</p>`;

const boutonAchats = (url: string, libelle: string) =>
  `<p><a href="${url}"
        style="display:inline-block;background:#d96a16;color:#fff;
               padding:12px 20px;border-radius:10px;text-decoration:none;
               font-weight:700">${libelle}</a></p>`;

/** Avis immédiat : le vendeur déclare avoir remis, et l'horloge démarre. */
export function shippedNoticeEmail(input: {
  productTitle: string;
  orderRef?: string | null;
  deadlineLabel: string;
  purchasesUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Vandè a di li remèt li — ${input.productTitle}`,
    html: wrap(`
      <p><strong>Vandè a di li remèt kòmand ou an.</strong><br>
      Le vendeur déclare avoir remis votre commande.</p>
      ${ligneCommande(input.productTitle, input.orderRef)}
      <p><strong>Si ou pa reponn anvan ${input.deadlineLabel}</strong>, n ap
      konsidere ou resevwa l, e n ap peye vandè a.<br>
      <span style="color:#77636b">Sans réponse de votre part avant le
      ${input.deadlineLabel}, la commande sera réputée reçue et le vendeur
      sera payé.</span></p>
      ${boutonAchats(input.purchasesUrl, "Konfime / Signaler un problème")}
      <p style="font-size:13px;color:#77636b">Zabelie pa livre e pa verifye
      remèt la : nou anrejistre sa de pati yo deklare. Si ou pa resevwa anyen,
      di l anvan dat la — se sèl fason lajan an rete bloke.</p>
    `),
  };
}

/** Rappel à mi-délai : la dernière chance utile de réagir. */
export function reminderNoticeEmail(input: {
  productTitle: string;
  orderRef?: string | null;
  deadlineLabel: string;
  purchasesUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Rapèl — ou gen jiska ${input.deadlineLabel}`,
    html: wrap(`
      <p><strong>Rapèl : nou poko tande ou sou kòmand sa a.</strong><br>
      Rappel : nous n'avons pas encore eu votre réponse.</p>
      ${ligneCommande(input.productTitle, input.orderRef)}
      <p><strong>${input.deadlineLabel}</strong> — apre dat sa a, n ap
      konsidere ou resevwa l.<br>
      <span style="color:#77636b">Après cette date, la commande sera réputée
      reçue.</span></p>
      ${boutonAchats(input.purchasesUrl, "Reponn kounye a / Répondre")}
    `),
  };
}

/** Avis final : le délai a tranché. L'acheteur doit l'APPRENDRE. */
export function autoReceivedNoticeEmail(input: {
  productTitle: string;
  orderRef?: string | null;
  purchasesUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Kòmand ou an konsidere resevwa — ${input.productTitle}`,
    html: wrap(`
      <p><strong>San repons, nou konsidere ou resevwa kòmand sa a.</strong><br>
      Faute de réponse, la commande est réputée reçue.</p>
      ${ligneCommande(input.productTitle, input.orderRef)}
      <p>Vandè a ap resevwa lajan l.<br>
      <span style="color:#77636b">Le vendeur va être payé.</span></p>
      <p style="font-size:13px;color:#77636b">Si sa se yon erè, ekri nou —
      dosye a pase nan men yon moun, pa nan yon otomat. Si c'est une erreur,
      écrivez-nous : le dossier est repris à la main.</p>
      ${boutonAchats(input.purchasesUrl, "Wè kòmand mwen yo / Mes achats")}
    `),
  };
}
