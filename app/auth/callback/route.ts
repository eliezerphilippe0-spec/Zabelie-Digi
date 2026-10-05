import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { siteOrigin } from "@/lib/site-origin";
import { ACCOUNT_LEGAL_VERSIONS, hasCurrentLegalAcceptance } from "@/lib/legal-acceptance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /auth/callback?code=...
 * Échange le code d'authentification (confirmation e-mail / OAuth) contre une
 * session, puis redirige. `next` passe par safeNext (anti open-redirect) —
 * sans ce garde-fou, `next=@evil.com` résout en `${site}@evil.com`, une URL
 * valide dont l'hôte est evil.com (userinfo-redirect), un lien de phishing
 * crédible car il part d'un domaine de confiance.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  /* Apex ↔ www : on garde l'origine de la REQUÊTE, sinon le cookie de
     session posé par `exchangeCodeForSession` ne suit pas la redirection et
     l'utilisateur atterrit déconnecté, sans erreur. → lib/site-origin.ts */
  const site = siteOrigin(url, process.env.NEXT_PUBLIC_SITE_URL);

  /* V-19 — un fournisseur tiers qui refuse (ou un utilisateur qui annule chez
     lui) revient SANS `code` et AVEC `error` + `error_description`. Avant, ce
     cas tombait dans la redirection finale : l'utilisateur atterrissait sur
     `next`, déconnecté, sans un mot. La description reste au journal — elle
     nomme le fournisseur et la cause, et c'est la seule trace qui existe. */
  const erreurFournisseur = url.searchParams.get("error");
  if (erreurFournisseur) {
    console.error(
      "[auth/callback] fournisseur:",
      erreurFournisseur,
      url.searchParams.get("error_description") ?? ""
    );
    return NextResponse.redirect(`${site}/connexion?erreur=fournisseur`);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      // BL-121 (C-13) : lien expiré ou déjà consommé (double-clic, préfetch
      // d'antivirus de messagerie) → message clair au lieu d'un atterrissage
      // silencieusement déconnecté.
      return NextResponse.redirect(`${site}/connexion?erreur=lien_expire`);
    }
    // OAuth may CREATE an account from the ordinary sign-in button. Its
    // provider metadata is not acceptance of Zabelie's documents. A missing
    // receipt requires a fresh explicit act; no historical act is invented.
    const { data: receipts, error: receiptError } = await supabase.from("zabelie_policy_acceptances")
      .select("policy_version").eq("user_id", data.user.id)
      .in("policy_version", [...ACCOUNT_LEGAL_VERSIONS]);
    if (receiptError || !receipts || !hasCurrentLegalAcceptance(receipts)) {
      return NextResponse.redirect(`${site}/connexion?mode=legal&next=${encodeURIComponent(next)}`);
    }
  }
  return NextResponse.redirect(`${site}${next}`);
}
