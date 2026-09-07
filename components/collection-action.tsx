import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/products";
import { COLLECTIONS, type CollectionKind, UUID_RE } from "@/lib/collections";
import { CollectionToggle } from "@/components/collection-toggle";
import { t, type Lang } from "@/lib/i18n";
export async function CollectionAction({ kind, id, lang }: { kind: CollectionKind; id: string; lang: Lang }) {
  if (!isSupabaseConfigured() || !UUID_RE.test(id)) return null;
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (kind === "shops" && user?.id === id) return null;
  const config = COLLECTIONS[kind];
  const result = user ? await client.from(config.table).select(config.column).eq("user_id", user.id).eq(config.column, id).maybeSingle() : null;
  if (result?.error) return null; // migration not ready: do not advertise a broken action
  return <CollectionToggle key={`${kind}:${id}:${user?.id ?? "guest"}`} kind={kind} id={id} authenticated={Boolean(user)} initial={Boolean(result?.data)} labels={{
    add: t(lang, kind === "favorites" ? "collections.favorite.add" : "collections.shop.add"),
    remove: t(lang, kind === "favorites" ? "collections.favorite.remove" : "collections.shop.remove"),
    error: t(lang, "collections.error"),
  }} />;
}
