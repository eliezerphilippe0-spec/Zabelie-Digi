import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DÉCONNEXION — POST uniquement, révocation SERVEUR.
 *
 * ─── CE QUI EXISTAIT, ET POURQUOI C'ÉTAIT PIRE QUE RIEN ────────────────────
 * `components/sign-out-button.tsx` appelait `createClient().auth.signOut()`
 * depuis le NAVIGATEUR, sans `scope`. L'utilisateur voyait la page d'accueil
 * et se croyait sorti. Deux mensonges dans ce geste :
 *   1. sans révocation serveur, les refresh tokens des AUTRES appareils
 *      restaient valides — « j'ai prêté mon téléphone la semaine dernière » ;
 *   2. le rendu SSR pouvait continuer à voir un utilisateur authentifié tant
 *      que les cookies n'étaient pas effacés côté serveur.
 * Un bouton qui ment sur son effet retire l'inquiétude sans retirer le
 * risque. Sur un Android partagé ou un poste de cybercafé à Cap-Haïtien, ce
 * qui reste exposé est l'historique de commandes, l'adresse de livraison, le
 * solde vendeur, les pièces KYC (0079) et le déclenchement de retrait.
 *
 * ─── POURQUOI POST, ET SEULEMENT POST ──────────────────────────────────────
 * Aucun `GET` n'est exporté : une balise `<img src="/api/auth/signout">` sur
 * n'importe quel site tiers déconnecterait l'utilisateur à son insu (CSRF de
 * déconnexion). Un GET rend donc 405, sans effet — vérifié par test.
 *
 * ─── SANS JAVASCRIPT ───────────────────────────────────────────────────────
 * Les surfaces postent un `<form method="POST">` : la déconnexion fonctionne
 * sur un téléphone d'entrée de gamme où l'hydratation n'a pas eu lieu. C'est
 * la même raison que le repli en liens simples de la barre mobile.
 */
export async function POST(req: Request) {
  const cookieStore = await cookies();

  try {
    const supabase = await createClient();
    // `global` : TOUS les refresh tokens de l'utilisateur, pas seulement
    // celui de cet appareil. C'est le cas d'usage réel — un compte laissé
    // ouvert ailleurs doit tomber aussi.
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      console.log(
        "[auth]",
        JSON.stringify({
          at: new Date().toISOString(),
          code: "ZB083",
          issue: "signout_revocation_echouee",
          message: error.message,
        })
      );
      // On NE s'arrête PAS : les cookies sont effacés ci-dessous quoi qu'il
      // arrive. Une révocation distante en panne ne doit pas laisser une
      // session locale ouverte sur un poste partagé — l'utilisateur qui
      // clique veut d'abord que CE poste soit propre.
    }
  } catch (e) {
    console.log(
      "[auth]",
      JSON.stringify({
        at: new Date().toISOString(),
        code: "ZB083",
        issue: "signout_client_indisponible",
        message: e instanceof Error ? e.message : String(e),
      })
    );
  }

  /* Effacement EXPLICITE des cookies Supabase, en plus de ce que `signOut`
   * a pu faire. Le nom dépend du projet (`sb-<ref>-auth-token`, parfois
   * découpé en `.0`, `.1`) : on balaie par préfixe plutôt que de deviner un
   * nom exact — un nom deviné qui ne correspond pas laisserait la session
   * intacte en silence, exactement le défaut qu'on répare. */
  const reponse = NextResponse.redirect(new URL("/", req.url), {
    status: 303, // POST → GET : le rechargement ne repostera pas.
  });
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith("sb-") || c.name.startsWith("supabase")) {
      reponse.cookies.set(c.name, "", { path: "/", maxAge: 0 });
    }
  }

  // Purge du cache rendu côté serveur : une page SSR mise en cache avec les
  // données de l'utilisateur ne doit pas survivre à sa déconnexion.
  revalidatePath("/", "layout");

  return reponse;
}
