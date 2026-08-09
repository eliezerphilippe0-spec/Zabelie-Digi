import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { codeHttpDuMotif, type ResultatDeclaration } from "@/lib/fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/fulfillment/declare  { orderId, note? }
 *
 * Le VENDEUR déclare avoir remis. Zabelie ne livre pas et n'observe rien : la
 * note est du texte libre — « remis en main propre à Delmas », « envoyé par
 * Sanon Express » — que la plateforme n'a AUCUN moyen de vérifier. Ne jamais
 * l'afficher comme une preuve de remise.
 *
 * Ce que cette déclaration déclenche : l'horloge d'auto-réception de
 * l'acheteur, et les deux avis qui la rendent légitime (avis immédiat + rappel
 * à mi-parcours, écrits dans la MÊME transaction en base). Sans eux,
 * l'auto-réception serait un transfert de propriété sur un silence non informé.
 *
 * L'identité du vendeur vient de la SESSION, jamais du corps de requête : la
 * RPC re-vérifie que l'appelant est bien le vendeur du produit, et un
 * `p_user_id` fourni par le client ne ferait jamais autorité.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  let body: { orderId?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.orderId) {
    return NextResponse.json({ error: "orderId requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("zabelie_declare_shipment", {
    p_order_id: body.orderId,
    p_user_id: user.id,
    // Borne de longueur côté serveur : la note est libre, pas illimitée.
    p_note: typeof body.note === "string" ? body.note.trim().slice(0, 280) : null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const res = (data ?? {}) as ResultatDeclaration;
  if (!res.ok) {
    return NextResponse.json(
      { error: res.reason ?? "refus", status: res.status },
      { status: codeHttpDuMotif(res.reason) }
    );
  }
  return NextResponse.json({ ok: true, duplicate: res.duplicate === true });
}
