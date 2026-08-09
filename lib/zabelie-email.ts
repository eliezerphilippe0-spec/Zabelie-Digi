/**
 * Envoi d'e-mails transactionnels (V-13) via Resend (API REST, sans SDK).
 * Non configuré (RESEND_API_KEY absent) → no-op silencieux : AUCUN e-mail ne
 * doit jamais bloquer ni faire échouer une confirmation de paiement.
 */

export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.EMAIL_FROM ?? "Zabelie <onboarding@resend.dev>";
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
    return res.ok;
  } catch {
    return false; // jamais d'exception : l'e-mail est best-effort
  }
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
