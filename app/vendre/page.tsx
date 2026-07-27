import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { PublishForm } from "@/components/publish-form";
import { UploadAsset } from "@/components/upload-asset";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/products";
import { getLang } from "@/lib/i18n-server";
import { t, type Lang } from "@/lib/i18n";
import type { ProductKind } from "@/lib/sample-data";
import { isDownloadable, kindLabelKey } from "@/lib/product-kind";
import { ROUNDING_IN_FORCE, type CreatorTier } from "@/lib/commission";
import { POLICY_PATH } from "@/lib/policy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendre — Zabelie" };

function Shell({
  children,
  lang,
  subtitle,
}: {
  children: React.ReactNode;
  lang: Lang;
  subtitle?: string;
}) {
  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-lg px-5 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">{t(lang, "sell.title")}</h1>
        {subtitle && <p className="mt-2 text-sm text-mist">{subtitle}</p>}
        {/* Le lien vit dans le Shell : il est donc présent AUSSI sur l'écran de
            connexion vendeur, qui est le premier écran du parcours. */}
        <p className="mt-2 text-xs">
          <Link href={POLICY_PATH} className="text-mist underline hover:text-cloud">
            {t(lang, "policy.link")}
          </Link>
        </p>
        <div className="mt-8">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

export default async function VendrePage() {
  const lang = await getLang();

  if (!isSupabaseConfigured()) {
    return (
      <Shell lang={lang} subtitle={t(lang, "sell.demo.subtitle")}>
        <div className="glass rounded-2xl p-6 text-sm text-mist">
          {t(lang, "sell.demo.body.pre")}
          <code className="mx-1 text-cloud">supabase/README.md</code>
          {t(lang, "sell.demo.body.post")}
        </div>
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell lang={lang} subtitle={t(lang, "sell.login.subtitle")}>
        <Link
          href="/connexion?next=/vendre"
          className="inline-block rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink"
        >
          {t(lang, "auth.signin.cta")}
        </Link>
      </Shell>
    );
  }

  // Palier du vendeur : il détermine le taux annoncé sous le champ prix.
  // Lu en base et jamais deviné — mais la colonne peut manquer sur une base
  // en retard de migration, et une estimation d'affichage ne doit pas faire
  // tomber la page de publication. Repli sur le palier standard, qui est
  // aujourd'hui celui de TOUS les vendeurs (aucun chemin n'attribue elite).
  const { data: profile } = await supabase
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();
  const tier: CreatorTier =
    (profile as { tier?: string } | null)?.tier === "elite" ? "elite" : "standard";

  const { data: mineRaw } = await supabase
    .from("products")
    .select("id, slug, title, status, kind, product_assets(id)")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  type MineRow = {
    id: string;
    slug: string;
    title: string;
    status: string;
    kind: ProductKind;
    product_assets: { id: string }[];
  };
  const mine = (mineRaw ?? []) as unknown as MineRow[];
  // BL-130 (FRONT-14) : `status` est un mot-clé technique brut ("published")
  // — jamais affiché tel quel, toujours mappé sur un libellé FR/KR.
  //
  // « Brouillon » était exact et inutile : depuis que les trois types naissent
  // en brouillon et attendent une revue humaine, le vendeur qui ne voit rien
  // conclut que sa soumission a échoué — et resoumet. On récolterait des
  // doublons avant la première vente. Le libellé dit donc ce qui se passe.
  const statusLabel = (s: string) =>
    s === "published" ? t(lang, "status.published") : t(lang, "status.review");
  const uploadLabels = {
    sending: t(lang, "upload.sending"),
    replace: t(lang, "upload.replace"),
    add: t(lang, "upload.add"),
    saved: t(lang, "upload.saved"),
    error: t(lang, "upload.error"),
    errorNetwork: t(lang, "error.network"),
  };

  return (
    <Shell lang={lang} subtitle={t(lang, "sell.subtitle")}>
      <div className="glass rounded-2xl p-6">
        <PublishForm
          tier={tier}
          labels={{
            titlePh: t(lang, "publish.title.ph"),
            kindAria: t(lang, "publish.kind.aria"),
            kindFile: t(lang, "product.kind.file"),
            kindService: t(lang, "product.kind.service"),
            categoryAria: t(lang, "publish.category.aria"),
            categoryEmpty: t(lang, "publish.category.empty"),
            pricePh: t(lang, "publish.price.ph"),
            descriptionPh: t(lang, "publish.description.ph"),
            serviceHint: t(lang, "publish.service.hint"),
            deliveryDaysPh: t(lang, "publish.deliveryDays.ph"),
            includesPh: t(lang, "publish.includes.ph"),
            includesAria: t(lang, "product.includes"),
            submit: t(lang, "publish.submit"),
            submitting: t(lang, "publish.submitting"),
            errorGeneric: t(lang, "publish.error.generic"),
            errorNetwork: t(lang, "error.network"),
            footerHint: t(lang, "publish.footer.hint"),
            net: {
              youReceive: t(lang, "publish.net.youReceive"),
              fee: t(lang, "publish.net.fee"),
              rounding: t(
                lang,
                ROUNDING_IN_FORCE === "floor"
                  ? "publish.net.rounding.floor"
                  : "publish.net.rounding",
              ),
              caveat: t(lang, "publish.net.caveat"),
            },
            policyLink: t(lang, "policy.link"),
          }}
        />
      </div>

      {mine.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-cloud">{t(lang, "sell.mine.title")}</h2>
          {mine.some((p) => p.status !== "published") && (
            <p className="mt-2 text-xs text-mist">{t(lang, "status.review.hint")}</p>
          )}
          <ul className="mt-3 space-y-2">
            {mine.map((p) => (
              <li
                key={p.slug}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  {/* Correctif audit : un produit brouillon (BL-103, fichier
                      sans livrable) n'est pas encore sur /produit/[slug]
                      (filtré status='published') — le lien y menait quand
                      même et tombait sur une 404 pour le vendeur. */}
                  {p.status === "published" ? (
                    <Link
                      href={`/produit/${p.slug}`}
                      className="block truncate hover:text-cloud"
                    >
                      {p.title}
                    </Link>
                  ) : (
                    <span className="block truncate">{p.title}</span>
                  )}
                  <span
                    className={
                      p.status === "published"
                        ? "text-xs text-mist"
                        : "text-xs font-semibold text-warning-text"
                    }
                  >
                    {statusLabel(p.status)}
                  </span>
                </div>
                {/* L'upload de livrable n'a de sens que pour un fichier. Le
                    `else` étiquetait « Service » tout le reste — un produit
                    physique s'affichait donc comme un service dans le
                    tableau de bord de son propre vendeur. */}
                {isDownloadable(p.kind, p.id) ? (
                  <UploadAsset
                    productId={p.id}
                    hasAsset={p.product_assets.length > 0}
                    labels={uploadLabels}
                  />
                ) : (
                  kindLabelKey(p.kind, p.id) && (
                    <span className="shrink-0 text-xs text-mist">
                      {t(lang, kindLabelKey(p.kind, p.id)!)}
                    </span>
                  )
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
}
