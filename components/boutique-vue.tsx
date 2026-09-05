import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import { ShareButtons } from "@/components/share-buttons";
import { t, type Lang } from "@/lib/i18n";
import { cheminZone, getZonesActives, libelleZone } from "@/lib/zones";
import type { CreatorProfile } from "@/lib/creators";

/**
 * LA VITRINE D'UN VENDEUR — une vue, deux adresses.
 *
 * `/boutik/<slug>` est l'adresse qu'on partage ; `/createur/<id>` est celle
 * qui ne casse jamais (liens déjà en circulation, profils sans slug, `0083`
 * pas encore appliquée). Dupliquer 90 lignes de JSX entre les deux, c'est se
 * garantir qu'une correction n'atterrira un jour que d'un côté — le dépôt en
 * porte déjà la trace avec les deux copies du logo.
 *
 * `partageHref` est passé par l'appelant : c'est la SEULE différence entre
 * les deux routes, et c'est celle qui compte — le bouton « partager » doit
 * proposer l'adresse lisible dès qu'elle existe.
 */
export async function BoutiqueVue({
  creator,
  lang,
  partageHref,
}: {
  creator: CreatorProfile;
  lang: Lang;
  partageHref: string;
}) {
  // La zone du vendeur, remontée jusqu'au depatman — lue seulement si une
  // zone est déclarée : pas de lecture de table pour ne rien afficher.
  const cheminVendeur = creator.zoneId
    ? cheminZone(await getZonesActives(), creator.zoneId)
    : [];

  const initials = creator.displayName.slice(0, 2).toUpperCase();

  return (
    <div className="bg-grain min-h-dvh">
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
            <span className="grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-accent to-brand text-2xl font-extrabold text-on-brand">
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

        {/* Zone déclarée (PR-Z3, docs/33 §4) : « Katye, Komin — Depatman »
            + pwen repè. Rien ne s'affiche sans zone — pas de ligne vide. */}
        {cheminVendeur.length > 0 && (
          <p className="mt-4 text-sm text-mist">
            <span className="font-semibold text-cloud">
              {t(lang, "zone.seller.label")}
            </span>{" "}
            : {cheminVendeur
              .slice()
              .reverse()
              .map((z) => libelleZone(z, lang))
              .join(", ")}
            {creator.pwenRepe ? ` · ${creator.pwenRepe}` : ""}
          </p>
        )}

        {/* Boutique en un lien : se partage sur WhatsApp comme une vitrine */}
        <div className="mt-6">
          <ShareButtons
            path={partageHref}
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {creator.products.map((p) => (
              <ProductCard
                key={p.slug}
                product={p}
                labels={{
                  kindFile: t(lang, "card.kind.file"),
                  kindService: t(lang, "card.kind.service"),
                  kindPhysical: t(lang, "card.kind.physical"),
                  by: t(lang, "product.by"),
                  sales: t(lang, "product.sales"),
                  salesOne: t(lang, "product.sales.one"),
                  lang,
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
