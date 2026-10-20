import type { SupabaseClient } from "@supabase/supabase-js";

type ExportRead = {
  table: string;
  select: string;
  owner: string;
  /** Colonnes sélectionnées formant un ordre unique pour ce titulaire. */
  sort: string | readonly string[];
  optional?: boolean;
};

/** Refuse un préfixe incomplet ; ces lectures ne sont pas un instantané transactionnel. */
export async function readExportRows(client: SupabaseClient, userId: string, options: ExportRead) {
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const sorts = typeof options.sort === "string" ? [options.sort] : options.sort;
  let total: number | undefined;

  for (let offset = 0; ;) {
    let query = client.from(options.table).select(options.select, { count: "exact" }).eq(options.owner, userId);
    for (const field of sorts) query = query.order(field);
    const { data, error, count } = await query.range(offset, offset + 499);
    if (error) {
      if (options.optional && offset === 0 && (error.code === "42P01" || error.code === "PGRST205")) return [];
      throw new Error("account_export_unavailable");
    }
    if (!Array.isArray(data) || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 ||
      (total !== undefined && count !== total) || data.length > 500 || offset + data.length > count) {
      throw new Error("account_export_unavailable");
    }
    total = count;
    for (const row of data) {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("account_export_unavailable");
      const values = sorts.map((field) => row[field]);
      if (values.some((value) => typeof value !== "string" && typeof value !== "number")) throw new Error("account_export_unavailable");
      const key = JSON.stringify(values);
      if (seen.has(key)) throw new Error("account_export_unavailable");
      seen.add(key);
      rows.push(row);
    }
    offset += data.length;
    if (offset === total) return rows;
    if (data.length === 0) throw new Error("account_export_unavailable");
  }
}

export async function exportCollections(client: SupabaseClient, userId: string) {
  const [favorites, followed_shops, recipients] = await Promise.all([
    readExportRows(client, userId, { table: "zabelie_favorites", select: "product_id,created_at", owner: "user_id", sort: "product_id" }),
    readExportRows(client, userId, { table: "zabelie_shop_follows", select: "seller_id,created_at", owner: "user_id", sort: "seller_id" }),
    readExportRows(client, userId, { table: "zabelie_order_recipients", select: "order_id,full_name,phone,locality,note,consented_at,order:orders!inner(buyer_id)", owner: "order.buyer_id", sort: "order_id" }),
  ]);
  return { favorites, followed_shops, order_recipients: recipients.map(({ order_id, full_name, phone, locality, note, consented_at }) => ({ order_id, full_name, phone, locality, note, consented_at })) };
}
