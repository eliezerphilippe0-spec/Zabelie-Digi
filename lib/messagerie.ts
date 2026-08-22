import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Messagerie acheteur ↔ vendeur — le module partagé (`0090`).
 *
 * ⚠️ `MESSAGE_MAX` DOIT SUIVRE LA CONTRAINTE SQL. `0090` porte
 * `check (length(btrim(body)) between 1 and 2000)`. Deux bornes existent donc,
 * et ce n'est pas une redondance : celle-ci rend une phrase lisible, celle de
 * la base tient face à n'importe quel autre appelant. Les faire diverger
 * produirait le défaut du 2026-08-22 — une contrainte Postgres brute à l'écran
 * d'un vendeur.
 *
 * `tests/messagerie.test.ts` croise les deux valeurs : changer l'une sans
 * l'autre fait rougir.
 */
export const MESSAGE_MAX = 2000;

export type Fil = {
  id: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  /** L'AUTRE participant, du point de vue de celui qui lit. */
  autreNom: string;
  dernierAt: string;
  /** `true` quand l'autre a écrit depuis la dernière lecture du titulaire. */
  nonLu: boolean;
  /** Le titulaire est-il l'acheteur de ce fil ? Décide du libellé affiché. */
  jeSuisAcheteur: boolean;
};

export type Message = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
};

type LigneFil = {
  id: string;
  product_id: string;
  buyer_id: string;
  seller_id: string;
  last_message_at: string;
  products: { slug: string; title: string } | { slug: string; title: string }[] | null;
  acheteur: { display_name: string } | { display_name: string }[] | null;
  vendeur: { display_name: string } | { display_name: string }[] | null;
};

/** PostgREST rend une relation tantôt en objet, tantôt en tableau. */
function un<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * Les fils du titulaire, les deux rôles confondus.
 *
 * ⚠️ AUCUN FILTRE `buyer_id`/`seller_id` ICI, ET C'EST CORRECT — contrairement
 * à `get_user_orders` de l'API v1, où il en fallait un. La différence tient à
 * ce que la sortie ANNONCE : « mes commandes » veut dire mes achats, donc la
 * lecture vendeur de `orders` y était une fuite de périmètre. « Mes messages »
 * veut dire les deux côtés — un vendeur DOIT voir les fils qu'on lui ouvre.
 * La policy `auth.uid() = buyer_id or auth.uid() = seller_id` dit exactement
 * la bonne chose, et s'y ajouter serait retirer la moitié de la boîte.
 */
export async function lireFils(
  supabase: SupabaseClient,
  userId: string,
  limite = 50
): Promise<Fil[]> {
  const { data, error } = await supabase
    .from("zabelie_conversations")
    .select(
      "id, product_id, buyer_id, seller_id, last_message_at, " +
        "products!zabelie_conversations_product_id_fkey(slug, title), " +
        "acheteur:profiles!zabelie_conversations_buyer_id_fkey(display_name), " +
        "vendeur:profiles!zabelie_conversations_seller_id_fkey(display_name)"
    )
    .order("last_message_at", { ascending: false })
    .limit(limite);
  if (error || !data) return [];

  const lignes = data as unknown as LigneFil[];
  if (lignes.length === 0) return [];

  /* Les lectures du titulaire, en UNE requête plutôt qu'une par fil. Une boîte
   * de cinquante fils ferait cinquante allers-retours sur 3G — le terrain
   * déclaré du produit. */
  const { data: lectures } = await supabase
    .from("zabelie_conversation_reads")
    .select("conversation_id, last_read_at")
    .eq("user_id", userId)
    .in("conversation_id", lignes.map((l) => l.id));
  const lu = new Map(
    ((lectures ?? []) as { conversation_id: string; last_read_at: string }[]).map((r) => [
      r.conversation_id,
      r.last_read_at,
    ])
  );

  return lignes.map((l) => {
    const prod = un(l.products);
    const jeSuisAcheteur = l.buyer_id === userId;
    const autre = un(jeSuisAcheteur ? l.vendeur : l.acheteur);
    const derniereLecture = lu.get(l.id);
    return {
      id: l.id,
      productId: l.product_id,
      productSlug: prod?.slug ?? "",
      productTitle: prod?.title ?? "",
      autreNom: autre?.display_name ?? "",
      dernierAt: l.last_message_at,
      /* Jamais lu = non lu, et c'est le bon défaut : un fil qu'on n'a jamais
       * ouvert contient forcément quelque chose qu'on n'a pas vu. */
      nonLu: !derniereLecture || new Date(l.last_message_at) > new Date(derniereLecture),
      jeSuisAcheteur,
    };
  });
}

/** Les messages d'un fil, du plus ancien au plus récent (ordre de lecture). */
export async function lireMessages(
  supabase: SupabaseClient,
  conversationId: string,
  limite = 200
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("zabelie_messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limite);
  if (error || !data) return [];
  return (data as { id: string; sender_id: string; body: string; created_at: string }[]).map(
    (m) => ({ id: m.id, senderId: m.sender_id, body: m.body, createdAt: m.created_at })
  );
}

/**
 * Marque le fil lu PAR SON TITULAIRE.
 *
 * ⚠️ Cette table ne sert QUE le compteur de non-lus de la personne qui lit.
 * Elle n'est jamais rendue à l'autre : un « vu » exposé est une promesse
 * sociale qu'on ne veut pas faire ici, et l'exposer plus tard serait une
 * décision, pas un détail (`0090`).
 */
export async function marquerLu(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<void> {
  // Best-effort : un compteur de non-lus qui échoue ne doit jamais empêcher
  // de lire le fil.
  try {
    await supabase
      .from("zabelie_conversation_reads")
      .upsert(
        { conversation_id: conversationId, user_id: userId, last_read_at: new Date().toISOString() },
        { onConflict: "conversation_id,user_id" }
      );
  } catch {
    /* silence délibéré */
  }
}
