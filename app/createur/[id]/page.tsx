import { notFound } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import { getCreator } from "@/lib/creators";
import { ShareButtons } from "@/components/share-buttons";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const creator = await getCreator(id);
  return {
    title: creator
      ? `${creator.displayName} — Zabelie`
      : "Créateur — Zabelie",
  };
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [creator, lang] = await Promise.all([getCreator(id), getLang()]);
  if (!creator) notFound();

  const initials = creator.displayName.slice(0, 2).toUpperCase();

  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />

      <section className="mx-auto max-w-6xl px-5 pb-10 pt-16">
        <div className="flex items-center gap-5">
          {creator.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creator.avatarUrl}
              alt={creator.displayName}
              className="h-20 w-20 rounded-2xl object-cover"
            />
          ) : (
            <span className="grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-gold to-violet text-2xl font-extrabold text-ink">
              {initials}
            </span>
          )}
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              {creator.displayName}
            </h1>
            <p className="mt-1 text-sm text-mist">
              {creator.products.length} {t(lang, "creator.products.label")}
            </p>
          </div>
        </div>

        {creator.bio && (
          <p className="mt-6 max-w-2xl text-mist">{creator.bio}</p>
        )}

        {/* Boutique en un lien : se partage sur WhatsApp comme une vitrine */}
        <div className="mt-6">
          <ShareButtons
            path={`/createur/${creator.id}`}
            text={t(lang, "creator.share.text", { name: creator.displayName })}
            waLabel={t(lang, "share.wa")}
            copyLabel={t(lang, "share.copy")}
            copiedLabel={t(lang, "share.copied")}
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        {creator.products.length === 0 ? (
          <p className="text-sm text-mist">{t(lang, "creator.empty")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {creator.products.map((p) => (
              <ProductCard
                key={p.slug}
                product={p}
                labels={{
                  kindFile: t(lang, "card.kind.file"),
                  kindService: t(lang, "card.kind.service"),
                  by: t(lang, "product.by"),
                  sales: t(lang, "product.sales"),
                }}
              />
            ))}
          </div>
        )}
      </section>

      <SiteFooter />
    </div>
  );
}
