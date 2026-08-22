import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { MessageForm } from "@/components/message-form";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/products";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { lireMessages, marquerLu } from "@/lib/messagerie";

export const dynamic = "force-dynamic";

/**
 * Un fil.
 *
 * ⚠️ AUCUN CONTRÔLE D'ACCÈS ÉCRIT ICI, et ce n'est pas un oubli : la RLS de
 * `0090` ne rend le fil qu'à ses deux participants. Un tiers qui devine
 * l'identifiant reçoit `null`, donc `notFound()`.
 *
 * C'est la même réponse que pour une commande d'autrui dans l'API v1 : « ce
 * fil n'existe pas » et « il ne vous regarde pas » se répondent pareil, sinon
 * l'identifiant devient un oracle d'existence.
 */
export default async function FilPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lang = await getLang();

  if (!isSupabaseConfigured()) redirect("/connexion");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?next=/messages/${id}`);

  const { data: fil } = await supabase
    .from("zabelie_conversations")
    .select(
      "id, buyer_id, seller_id, " +
        "products!zabelie_conversations_product_id_fkey(slug, title), " +
        "acheteur:profiles!zabelie_conversations_buyer_id_fkey(display_name), " +
        "vendeur:profiles!zabelie_conversations_seller_id_fkey(display_name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!fil) notFound();

  const c = fil as unknown as {
    id: string;
    buyer_id: string;
    seller_id: string;
    products: { slug: string; title: string } | { slug: string; title: string }[] | null;
    acheteur: { display_name: string } | { display_name: string }[] | null;
    vendeur: { display_name: string } | { display_name: string }[] | null;
  };
  const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const prod = un(c.products);
  const jeSuisAcheteur = c.buyer_id === user.id;
  const autre = un(jeSuisAcheteur ? c.vendeur : c.acheteur);

  const messages = await lireMessages(supabase, id);

  /* Marquer lu APRÈS avoir lu, et sans bloquer le rendu si ça échoue : un
   * compteur de non-lus n'est pas une raison d'empêcher quelqu'un de lire son
   * propre fil. */
  await marquerLu(supabase, id, user.id);

  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-10">
        <Link
          href="/messages"
          className="inline-flex min-h-11 items-center text-sm text-mist hover:text-cloud"
        >
          ← {t(lang, "msg.back")}
        </Link>

        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          {prod?.title ?? ""}
        </h1>
        <p className="mt-1 text-sm text-mist">
          {autre?.display_name ?? ""} ·{" "}
          {t(lang, jeSuisAcheteur ? "msg.role.buyer" : "msg.role.seller")}
          {prod?.slug && (
            <>
              {" · "}
              <Link href={`/produit/${prod.slug}`} className="underline hover:text-cloud">
                {t(lang, "nav.catalog")}
              </Link>
            </>
          )}
        </p>

        <ul className="mt-6 flex flex-col gap-3">
          {messages.map((m) => {
            const deMoi = m.senderId === user.id;
            return (
              <li
                key={m.id}
                className={`max-w-[85%] rounded-2xl border border-line p-3 ${
                  deMoi ? "self-end bg-brand/10" : "bg-surface/40"
                }`}
              >
                <p className="text-xs text-mist">
                  {deMoi ? t(lang, "msg.you") : (autre?.display_name ?? "")}
                </p>
                {/* `whitespace-pre-wrap` : le texte est rendu comme TEXTE, et
                    React échappe tout. Le corps vient d'un inconnu — c'est
                    exactement la frontière `untrusted` de l'API v1, ici sous
                    forme de rendu. */}
                <p className="mt-1 whitespace-pre-wrap break-words text-cloud">{m.body}</p>
              </li>
            );
          })}
        </ul>

        <MessageForm
          conversationId={id}
          labels={{
            placeholder: t(lang, "msg.placeholder"),
            send: t(lang, "msg.send"),
            sending: t(lang, "msg.sending"),
            sent: t(lang, "msg.sent"),
            warn: t(lang, "msg.warn"),
          }}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
