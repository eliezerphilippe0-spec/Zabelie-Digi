import type { SupabaseClient } from "@supabase/supabase-js";
export async function exportCollections(client: SupabaseClient, userId: string) {
  async function read(table: string, select: string, owner: string, sort: string) {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from(table).select(select).eq(owner, userId).order(sort).range(offset, offset + 499);
      if (error) throw new Error("collection_export_unavailable");
      rows.push(...(data ?? []) as unknown as Record<string, unknown>[]);
      if (!data || data.length < 500) return rows;
    }
  }
  const [favorites, followed_shops, recipients] = await Promise.all([
    read("zabelie_favorites", "product_id,created_at", "user_id", "product_id"),
    read("zabelie_shop_follows", "seller_id,created_at", "user_id", "seller_id"),
    read("zabelie_order_recipients", "order_id,full_name,phone,locality,note,consented_at,order:orders!inner(buyer_id)", "order.buyer_id", "order_id"),
  ]);
  return { favorites, followed_shops, order_recipients: recipients.map(({ order_id, full_name, phone, locality, note, consented_at }) => ({ order_id, full_name, phone, locality, note, consented_at })) };
}
