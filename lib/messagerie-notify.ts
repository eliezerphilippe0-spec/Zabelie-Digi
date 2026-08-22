import type { SupabaseClient } from "@supabase/supabase-js";
import { isEmailEnabled, sendEmail } from "./zabelie-email";

/**
 * Prévenir le destinataire d'un message — BEST-EFFORT INTÉGRAL.
 *
 * ⚠️ POURQUOI PAS L'OUTBOX (`0061`), ALORS QU'ELLE EXISTE ET QU'ELLE EST
 * CÂBLÉE. Mesuré avant d'écrire ce fichier : `zabelie_outbox` porte
 * `order_id uuid NOT NULL` et `unique (order_id, kind)`. Deux obstacles, tous
 * deux structurels :
 *
 *   • une question posée AVANT l'achat n'a pas de commande — il n'y a rien à
 *     mettre dans `order_id` ;
 *   • « un seul message de chaque type par commande » est exactement l'inverse
 *     de ce qu'il faut pour une conversation.
 *
 * L'y faire entrer aurait demandé de déformer une table appliquée en
 * production pour un usage qu'elle n'a pas. On envoie donc directement, sur le
 * modèle de `notifyOrderPaid` : hors du chemin critique, aucune erreur ne
 * remonte.
 *
 * ⚠️ CE QUE ÇA COÛTE, ET IL FAUT LE DIRE : sans file, un envoi raté est
 * PERDU. L'outbox existe précisément pour éviter ça. Le jour où la messagerie
 * compte, la bonne réponse est d'élargir `0061` (un `order_id` nullable et une
 * clé d'unicité par message), pas de bricoler ici. C'est écrit pour que ce ne
 * soit pas redécouvert.
 *
 * ⚠️ Et rien ne part si `RESEND_API_KEY` n'est pas posée — `OPS_TODO` 🟡. Le
 * silence sera alors total et sans trace : c'est pourquoi le cas est
 * JOURNALISÉ plutôt que simplement ignoré.
 */
export async function notifierMessage(
  admin: SupabaseClient,
  conversationId: string,
  expediteurId: string
): Promise<void> {
  if (!isEmailEnabled()) {
    // L'absence de signal DOIT être un signal (`CLAUDE.md`). Sans cette ligne,
    // « personne n'a été prévenu » et « tout va bien » produisent le même vide.
    console.log(
      "[messagerie/notify]",
      JSON.stringify({
        at: new Date().toISOString(),
        issue: "email_desactive",
        conversationId,
      })
    );
    return;
  }

  const { data, error } = await admin
    .from("zabelie_conversations")
    .select(
      "id, buyer_id, seller_id, " +
        "products!zabelie_conversations_product_id_fkey(title, slug)"
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (error || !data) return;

  const c = data as unknown as {
    buyer_id: string;
    seller_id: string;
    products: { title: string; slug: string } | { title: string; slug: string }[] | null;
  };
  const prod = Array.isArray(c.products) ? c.products[0] : c.products;
  const destinataireId = expediteurId === c.buyer_id ? c.seller_id : c.buyer_id;

  /* L'adresse vient de `auth.users`, pas de `profiles` : `0015` ne donne à
   * `anon` que sept colonnes de `profiles`, et l'e-mail n'en fait pas partie.
   * C'est le client d'administration qui lit ici, et il ne lit QUE l'adresse
   * du destinataire. */
  const { data: u } = await admin.auth.admin.getUserById(destinataireId);
  const to = u?.user?.email;
  if (!to) return;

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zabelie.com";

  /* ⚠️ LE CORPS DU MESSAGE N'EST PAS DANS LE COURRIEL, ET C'EST DÉLIBÉRÉ.
   *
   * Deux raisons, la seconde étant la vraie : un texte écrit par un inconnu
   * qu'on relaie tel quel dans un e-mail au nom de Zabelie est une surface
   * d'hameçonnage offerte — « votre compte est bloqué, cliquez ici ». Et le
   * destinataire doit de toute façon venir répondre sur la plateforme.
   *
   * Le courriel dit qu'il se passe quelque chose ; le fil dit quoi. */
  const { subject, html } = messageRecuEmail({
    productTitle: prod?.title ?? "",
    threadUrl: `${base}/messages/${conversationId}`,
  });
  await sendEmail({ to, subject, html });
}

/** Gabarit — bilingue comme les autres courriels du dépôt. */
export function messageRecuEmail(input: {
  productTitle: string;
  threadUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `💬 Yon mesaj sou « ${input.productTitle} » / Un message sur « ${input.productTitle} »`,
    html:
      `<p><strong>Ou gen yon mesaj.</strong> / Vous avez un message.</p>` +
      `<p>Sou / Au sujet de : <strong>${echapper(input.productTitle)}</strong></p>` +
      `<p><a href="${input.threadUrl}">Reponn sou Zabelie / Répondre sur Zabelie</a></p>` +
      `<p style="color:#888;font-size:12px">Nou pa mete mesaj la nan imel la : reponn sou sit la. / ` +
      `Le message n'est pas repris ici : répondez sur le site.</p>`,
  };
}

/**
 * Échappement HTML du TITRE — écrit par un vendeur, donc jamais sûr.
 *
 * Le corps du message n'entre pas dans le courriel (voir ci-dessus), mais le
 * titre du produit si, et il vient de la même famille : du texte tapé par un
 * tiers. `<img src=x onerror=…>` dans un titre de fiche deviendrait sinon du
 * balisage dans un e-mail signé Zabelie.
 */
function echapper(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
