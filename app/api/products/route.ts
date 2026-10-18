import { NextResponse } from "next/server";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAccount } from "@/lib/auth";
import { creerBrouillonProduit, type CorpsBrouillon } from "@/lib/product-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/products  { title, description, kind, category, priceHTG }
 * Crée (et publie) un produit pour le créateur connecté.
 */
export async function POST(req: Request) {
  const lang = await getLang();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  }

  // Compte suspendu (modération) : action bloquée même si la session est
  // encore active (le ban auth ne coupe la session qu'au refresh du token).
  const accountRefusal = await requireActiveAccount(user.id, { legalAcceptance: true });
  if (accountRefusal) return accountRefusal;

  let body: CorpsBrouillon;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: t(lang, "api.json.invalid") }, { status: 400 });
  }

  const resultat = await creerBrouillonProduit({ req, lang, supabase, user, body });
  // Un refus est la réponse que la route rendait ; `Response` : NextResponse en hérite.
  if (resultat instanceof Response) return resultat;
  return NextResponse.json({ slug: resultat.slug, status: resultat.status });
}
