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
}): { subject: string; html: string } {
  return {
    subject: `🎉 Ou fè yon vant ! — ${input.productTitle}`,
    html: wrap(`
      <p><strong>🎉 Félicitations — nouvelle vente !</strong></p>
      <p style="font-size:15px">${input.productTitle}</p>
      <p>Net vendeur crédité (en attente J+7) : <strong>${input.netLabel}</strong></p>
      <p><a href="${input.dashboardUrl}"
            style="display:inline-block;background:#5c2340;color:#fff;
                   padding:12px 20px;border-radius:10px;text-decoration:none;
                   font-weight:700">Wè tablo bò mwen / Voir mon tableau de bord</a></p>
    `),
  };
}
