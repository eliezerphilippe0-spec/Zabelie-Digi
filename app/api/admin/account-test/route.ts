import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { getCurrentUser } from "@/lib/auth";
import { journaliserActeAdmin } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/account-test  { userId, isTest: boolean }
 *
 * Marque ou démarque un COMPTE D'ESSAI (`0101`). Réservé au rôle admin.
 *
 * ─── POURQUOI UNE ROUTE À PART, ET PAS UNE ACTION DE `user-status` ──────────
 * `user-status` est de la MODÉRATION : elle bannit l'authentification, exige
 * un motif, et porte un avertissement BRH sur ce qu'elle ne fait pas au wallet.
 * Marquer un compte d'essai n'est rien de tout cela — pas de sanction, pas de
 * motif, pas de ban. Les fondre ferait mentir le commentaire de l'une ou de
 * l'autre, et un lecteur pressé croirait qu'un compte d'essai est puni.
 *
 * ─── CE QUE ÇA FAIT, EXACTEMENT ─────────────────────────────────────────────
 * Un seul booléen sur `profiles`. La policy `products_public_read_published`
 * fait le reste : les fiches du compte cessent d'être visibles du public, et
 * redeviennent visibles si la marque tombe. **Aucune fiche n'est modifiée** —
 * ni statut, ni contenu — dans un sens comme dans l'autre.
 *
 * Le compte marqué garde TOUT le reste : il publie, achète, remet, encaisse.
 * C'est la distinction que `0101` existe pour poser — « invisible du public »
 * n'est pas « bridé ».
 *
 * ─── DEUX REFUS QUE CETTE ROUTE NE FAIT PAS, ET POURQUOI ────────────────────
 * `user-status` refuse d'agir sur soi-même (on se verrouillerait dehors) et
 * sur un autre admin. Ici, ni l'un ni l'autre :
 *
 *   • marquer SON PROPRE compte est un usage légitime — c'est même le cas le
 *     plus courant, le porteur teste avec son compte. Ça ne verrouille rien,
 *     et l'écran nomme le compte et affiche « (vous) » ;
 *   • un compte admin peut être d'essai. Le marquer ne retire aucun droit.
 *
 * Le vrai garde-fou n'est pas un refus, c'est la RÉVERSIBILITÉ en un clic plus
 * la trace : chaque bascule est écrite au journal d'audit append-only, donc
 * « pourquoi mes fiches ont-elles disparu ? » a toujours une réponse datée.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return erreurTraduite("api.access.denied", 403);
  }

  let body: { userId?: string; isTest?: unknown };
  try {
    body = await req.json();
  } catch {
    return erreurTraduite("api.json.invalid", 400);
  }

  const { userId } = body;
  // `typeof === "boolean"` et non une conversion : `isTest: "false"` ou
  // `isTest: 0` sont des appels malformés, pas des « faux ». Les convertir
  // silencieusement démarquerait un compte sur une faute de frappe.
  if (!userId || typeof body.isTest !== "boolean") {
    return erreurTraduite("api.params.invalid", 400);
  }
  const isTest = body.isTest;

  const admin = createAdminClient();

  const { data: cible } = await admin
    .from("profiles")
    .select("id, display_name, is_test")
    .eq("id", userId)
    .maybeSingle();
  if (!cible) {
    return erreurTraduite("api.account.notfound", 404);
  }

  // Rejeu : déjà dans l'état demandé. Succès, pas erreur — un double clic sur
  // une connexion qui coupe est le cas normal, pas une faute.
  if (cible.is_test === isTest) {
    return NextResponse.json({ ok: true, isTest, duplicate: true });
  }

  const { error } = await admin
    .from("profiles")
    .update({ is_test: isTest })
    .eq("id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  /* La trace est écrite APRÈS l'acte, comme pour la suspension : la marque est
     posée, un échec d'audit ne doit pas la faire échouer — mais il n'est
     jamais muet (lib/admin-audit journalise `echec_ecriture`). */
  await journaliserActeAdmin(admin, {
    actorId: me.id,
    action: isTest ? "user.mark_test" : "user.unmark_test",
    targetType: "user",
    targetId: userId,
  });

  return NextResponse.json({ ok: true, isTest });
}
