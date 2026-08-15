import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { FulfillmentAction } from "@/components/fulfillment-actions";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/products";
import { formatHTG } from "@/lib/sample-data";
import { cleEtatRemise, estEtatRemise, type EtatRemise } from "@/lib/fulfillment";
import { getLang } from "@/lib/i18n-server";
import { t, type Lang } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes ventes — Zabelie" };

/**
 * L'ÉCRAN QUI MANQUAIT AU VENDEUR.
 *
 * `/vendre` liste ses PRODUITS ; rien n'a jamais listé ses VENTES. Tant que
 * cette page n'existait pas, le vendeur d'un produit physique n'avait aucun
 * endroit où déclarer une remise — donc, au bout de `shipment_deadline_days`,
 * chacune de ses commandes honorées serait partie en « action requise » et
 * aurait attendu une main humaine. Le mécanisme entier tenait sur un bouton
 * qui n'existait pas.
 *
 * Ce que la page NE PROMET PAS : Zabelie ne livre pas, ne suit rien, ne
 * vérifie rien. La note de remise est du texte libre à destination de
 * l'acheteur, et l'écran le dit plutôt que de le laisser supposer.
 */

type VenteRow = {
  order_id: string;
  status: EtatRemise;
  shipped_at: string | null;
  order: {
    id: string;
    order_ref: string | null;
    amount_htg: number;
    created_at: string;
    buyer_id: string;
    products: { title: string; seller_id: string } | null;
  } | null;
};

function Shell({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">{t(lang, "sales.title")}</h1>
        <p className="mt-2 text-sm text-mist">{t(lang, "sales.subtitle")}</p>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export default async function MesVentesPage() {
  const lang = await getLang();

  if (!isSupabaseConfigured()) {
    return (
      <Shell lang={lang}>
        <p className="mt-6 text-sm text-mist">
          Base non configurée (mode démo).
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell lang={lang}>
        <Link
          href="/connexion?next=/mes-ventes"
          className="mt-6 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
        >
          {t(lang, "auth.signin.cta")}
        </Link>
      </Shell>
    );
  }

  /* Client de SESSION, jamais le service role : la RLS de `zabelie_fulfillment`
   * n'ouvre la ligne qu'au vendeur du produit et à l'acheteur de la commande.
   * La requête se dégrade si la table n'existe pas (base en retard de
   * migration) : la page dit « rien à remettre » plutôt que de tomber.
   *
   * ⚠️ LE FILTRE `seller_id` N'EST PAS REDONDANT AVEC LA RLS, ET L'OUBLIER
   * AURAIT ÉTÉ SILENCIEUX. Les deux politiques de `zabelie_fulfillment`
   * ouvrent la ligne à l'acheteur ET au vendeur (0043 §1) : sans ce filtre,
   * cette page listerait aussi les ACHATS de l'utilisateur, avec un bouton
   * « j'ai remis » dessus. La RPC les refuserait (`non_autorise`), donc rien
   * de grave ne se produirait — mais l'acheteur verrait un bouton qui ne
   * marche pas, et il aurait raison de croire que le site est cassé.
   * Les deux `!inner` sont ce qui rend le filtre imbriqué effectif. */
  const { data } = await supabase
    .from("zabelie_fulfillment")
    .select(
      "order_id, status, shipped_at, order:orders!inner(id, order_ref, amount_htg, created_at, buyer_id, products!inner(title, seller_id))"
    )
    .eq("order.products.seller_id", user.id)
    .order("created_at", { ascending: true });

  const ventes = ((data ?? []) as unknown as VenteRow[]).filter((v) =>
    estEtatRemise(v.status)
  );

  /* V-5 (docs/35) : coordonnées de livraison des acheteurs — CLIENT DE
   * SESSION exprès : c'est la policy `zabelie_delivery_seller_read` (0076)
   * qui décide ce que CE vendeur a le droit de voir (commande payée
   * uniquement). Un service-role ici contournerait le garde qu'on vient de
   * poser. Table absente (0076 non appliquée) → map vide, rien ne s'affiche. */
  const buyerIds = [
    ...new Set(ventes.map((v) => v.order?.buyer_id).filter(Boolean)),
  ] as string[];
  const livParAcheteur = new Map<
    string,
    { full_name: string | null; phone: string | null; adres_liv: string | null }
  >();
  if (buyerIds.length > 0) {
    const { data: livs } = await supabase
      .from("zabelie_delivery_info")
      .select("user_id, full_name, phone, adres_liv")
      .in("user_id", buyerIds);
    for (const l of livs ?? []) {
      livParAcheteur.set(l.user_id, l);
    }
  }

  return (
    <Shell lang={lang}>
      {ventes.length === 0 ? (
        <p className="mt-6 text-sm text-mist">{t(lang, "sales.empty")}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {ventes.map((v) => (
            <li
              key={v.order_id}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-surface/60 p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {v.order?.products?.title ?? "Produit"}
                </p>
                <p className="text-xs text-mist">
                  {v.order ? formatHTG(v.order.amount_htg) : "—"}
                  {v.order && (
                    <>
                      {" · "}
                      {new Date(v.order.created_at).toLocaleDateString("fr-HT")}
                    </>
                  )}
                  {/* Le numéro que l'acheteur lit au téléphone : c'est par lui
                      que les deux parties se reconnaissent. */}
                  {v.order?.order_ref && (
                    <>
                      {" · "}
                      <span className="numeric select-all">{v.order.order_ref}</span>
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs text-mist">{t(lang, cleEtatRemise(v.status))}</p>
                {/* V-5 : les coordonnées de livraison — présentes UNIQUEMENT
                    si la policy 0076 les a laissées passer (commande payée),
                    en attente d'expédition. */}
                {v.status === "awaiting_shipment" &&
                  (() => {
                    const liv = v.order
                      ? livParAcheteur.get(v.order.buyer_id)
                      : undefined;
                    if (!liv || (!liv.full_name && !liv.phone && !liv.adres_liv)) {
                      return (
                        <p className="mt-2 text-xs text-mist">
                          {t(lang, "sales.liv.missing")}
                        </p>
                      );
                    }
                    return (
                      <div className="mt-2 rounded-lg border border-line/60 p-2 text-xs">
                        <p className="font-semibold text-cloud">
                          {t(lang, "sales.liv.title")}
                        </p>
                        {liv.full_name && <p>{liv.full_name}</p>}
                        {liv.phone && (
                          <p>
                            <a className="underline" href={`tel:${liv.phone}`}>
                              {liv.phone}
                            </a>
                          </p>
                        )}
                        {liv.adres_liv && <p className="text-mist">{liv.adres_liv}</p>}
                      </div>
                    );
                  })()}
              </div>

              <div className="shrink-0">
                {v.status === "awaiting_shipment" ? (
                  <FulfillmentAction
                    orderId={v.order_id}
                    variante="declare"
                    labels={{
                      cta: t(lang, "sales.declare.cta"),
                      placeholder: t(lang, "sales.declare.ph"),
                      hint: t(lang, "sales.declare.hint"),
                      erreur: t(lang, "ship.error.generic"),
                      reseau: t(lang, "error.network"),
                    }}
                  />
                ) : (
                  v.shipped_at && (
                    <p className="text-right text-xs text-mist">
                      {t(lang, "sales.declared", {
                        date: new Date(v.shipped_at).toLocaleDateString("fr-HT"),
                      })}
                    </p>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
