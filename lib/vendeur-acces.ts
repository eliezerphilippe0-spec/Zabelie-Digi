import { redirect } from "next/navigation";
import { getCurrentUser, getSuspension, type CurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/products";

/**
 * LA GARDE DES PAGES DU TABLEAU VENDEUR (docs/73). L'accueil
 * (`/tableau-de-bord`) rend lui-même ses trois cas particuliers : mode
 * démonstration, visiteur non connecté, compte suspendu avec son motif. Les
 * pages filles (boutique, compte, codes promo) ne les recopient pas : elles
 * renvoient vers la connexion, ou vers l'accueil qui dit pourquoi.
 */
export async function vendeurOuRedirection(chemin: string): Promise<CurrentUser> {
  if (!isSupabaseConfigured()) redirect("/tableau-de-bord");
  const user = await getCurrentUser();
  if (!user) redirect(`/connexion?next=${encodeURIComponent(chemin)}`);
  if (await getSuspension(user.id)) redirect("/tableau-de-bord");
  return user;
}
