import { supportCopy } from "@/lib/support-copy";
import { RecipientDetails } from "@/components/recipient-details";
import { ZoneCommande } from "@/components/zone-commande";
import { HandoverCodeSeller } from "@/components/handover-code";
import { zonesDesCommandes } from "@/lib/zone-remise-serveur";
import { delaiAffichable, delaiConstateVendeur, uniteDelai } from "@/lib/delai-constate";
import { grouperParZone } from "@/lib/zone-ventes";
import type { OrderRecipient } from "@/lib/order-recipient";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { FulfillmentAction } from "@/components/fulfillment-actions";
import { SonVentes } from "@/components/son-ventes";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/products";
import { formatHTG } from "@/lib/sample-data";
import { cleEtatRemise, estEtatRemise, type EtatRemise } from "@/lib/fulfillment";
import { afficherNumero } from "@/lib/rechaj";
import { getLang } from "@/lib/i18n-server";
import { t, tn, type Lang } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes ventes — Zabelie", robots: { index: false, follow: false } };

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
    status: string;
    products: { title: string; seller_id: string } | null;
  } | null;
};

/* Une vente REMBOURSÉE garde son dernier état de remise (`refund_order` n'y
 * touche pas) : sans ce garde, l'écran disait « En cours d'examen » après la
 * clôture du litige du 2026-08-22, et proposerait « Déclarer l'envoi », le
 * numéro à recharger et l'adresse de livraison d'une commande remboursée. */
function venteRemboursee(v: VenteRow): boolean {
  return v.order?.status === "refunded";
}

function Shell({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-3xl px-5 py-16">
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
          className="bouton mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
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
      "order_id, status, shipped_at, order:orders!inner(id, order_ref, amount_htg, created_at, buyer_id, status, products!orders_product_id_fkey!inner(title, seller_id))"
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

  /* 0099 — le numéro à recharger. CLIENT DE SESSION, comme au-dessus : c'est
   * `zabelie_rechaj_cible_seller_read` qui décide, et elle n'ouvre la ligne
   * qu'une fois la commande PAYÉE. Un service-role ici rendrait la policy
   * décorative. Table absente (0099 non appliquée) → map vide, rien ne
   * s'affiche, et le reste de la page fonctionne. */
  const orderIds = ventes.map((v) => v.order_id);
  const { data: recipients, error: recipientReadError } = orderIds.length
    ? await supabase.from("zabelie_order_recipients").select("order_id,full_name,phone,locality,note").in("order_id", orderIds)
    : { data: [], error: null };
  const recipientByOrder = new Map((recipients ?? []).map(r => [r.order_id, r as OrderRecipient]));
  // Zone de remise structurée (0161) : sous la session, fenêtre « commande payée ».
  const zoneParCommande = await zonesDesCommandes(supabase, orderIds, lang);
  // Les tournées : on RANGE ce que l'acheteur a déclaré, rien de plus (docs/77 §12.5).
  const { groupes, afficherTitres } = grouperParZone(ventes, zoneParCommande, lang === "ht" ? "fr-HT" : lang);
  // Ce que les acheteurs voient du vendeur, il le voit aussi (0165). Identité = SESSION.
  const delai = await delaiConstateVendeur(user.id);
  const delaiMontre = delaiAffichable(delai);
  const delaiTexte = delaiMontre !== null
    ? (() => { const u = uniteDelai(delaiMontre); return t(lang, u.cle, { n: String(u.n) }); })()
    : null;

  const cibleParCommande = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: cibles } = await supabase
      .from("zabelie_rechaj_cible")
      .select("order_id, msisdn")
      .in("order_id", orderIds);
    for (const c of cibles ?? []) {
      cibleParCommande.set(c.order_id, c.msisdn);
    }
  }

  return (
    <Shell lang={lang}>
      <Link href="/assistance" className="mt-4 inline-flex min-h-11 items-center text-sm underline">{supportCopy(lang).cases}</Link>
      {/* Son de vente (niveau 1) : AUSSI quand la liste est vide — la première vente est le moment à ne pas manquer. */}
      <SonVentes
        labels={{
          activer: t(lang, "sales.sound.enable"),
          actif: t(lang, "sales.sound.on"),
          couper: t(lang, "sales.sound.off"),
          nouvelle: t(lang, "sales.sound.new"),
        }}
      />
      {delai && (
        <section aria-labelledby="delai-constate" className="mt-4 rounded-xl border border-line bg-ink/40 p-4">
          <h2 id="delai-constate" className="text-sm font-semibold">{t(lang, "sales.measured.title")}</h2>
          <p className="mt-1 text-sm text-mist">
            {delaiTexte !== null
              ? t(lang, "sales.measured.shown", { delay: delaiTexte, n: String(delai.nb) })
              : t(lang, "sales.measured.pending", { n: String(delai.nb), seuil: String(delai.seuil) })}
          </p>
        </section>
      )}
      {ventes.length === 0 ? (
        <p className="mt-6 text-sm text-mist">{t(lang, "sales.empty")}</p>
      ) : (
        <div className="mt-6 space-y-6">
          {groupes.map((g, i) => (
            <section key={g.cle} aria-labelledby={afficherTitres ? `zone-groupe-${i}` : undefined}>
              {afficherTitres && (
                <h2 id={`zone-groupe-${i}`} className="mb-2 text-sm font-semibold">
                  {g.libelle ?? t(lang, "sales.zone.group.none")}{" "}
                  <span className="ml-2 font-normal text-mist">
                    {tn(lang, g.items.length, "sales.zone.group.count.one", "sales.zone.group.count", { n: String(g.items.length) })}
                  </span>
                </h2>
              )}
              <ul className="space-y-3">
          {g.items.map((v) => (
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
                <p className="mt-1 text-xs text-mist">{t(lang, venteRemboursee(v) ? "purchases.status.refunded" : cleEtatRemise(v.status))}</p>

                {/* 0099 — LE NUMÉRO À RECHARGER, en évidence et sélectionnable.
                    C'est la donnée sans laquelle cette commande n'est pas
                    délivrable : elle passe avant l'adresse, avant tout le
                    reste. `select-all` parce que le vendeur va le recopier
                    dans son application d'opérateur, sur un téléphone, et
                    qu'un chiffre recopié de travers coûte la recharge. */}
                {!venteRemboursee(v) && (() => {
                  const cible = cibleParCommande.get(v.order_id);
                  if (!cible) return null;
                  return (
                    <div className="mt-2 rounded-lg border border-brand/40 bg-brand/5 p-2 text-xs">
                      <p className="font-semibold text-cloud">
                        {t(lang, "sales.rechaj.title")}
                      </p>
                      <p className="numeric mt-0.5 select-all text-base font-bold tracking-wide text-cloud">
                        {afficherNumero(cible)}
                      </p>
                      <p className="mt-1 text-mist">{t(lang, "sales.rechaj.hint")}</p>
                    </div>
                  );
                })()}
                {/* V-5 : les coordonnées de livraison — présentes UNIQUEMENT
                    si la policy 0076 les a laissées passer (commande payée),
                    en attente d'expédition. */}
                {!venteRemboursee(v) && zoneParCommande.has(v.order_id) && <ZoneCommande libelle={zoneParCommande.get(v.order_id)!} lang={lang}/>}
                {!venteRemboursee(v) && recipientByOrder.has(v.order_id) && <RecipientDetails recipient={recipientByOrder.get(v.order_id)!} lang={lang}/>}
                {recipientReadError && <p className="mt-2 text-sm text-mist">{t(lang, "recipient.unavailable")}</p>}
                {!venteRemboursee(v) && !recipientReadError && !recipientByOrder.has(v.order_id) && v.status === "awaiting_shipment" &&
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
                <Link href={`/assistance/commande/${v.order_id}`} className="mb-2 flex min-h-11 items-center text-sm underline">{supportCopy(lang).helpLink}</Link>
                {venteRemboursee(v) ? null : v.status === "awaiting_shipment" ? (
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
                {/* Code de remise (0163) : remise en main propre, avant ou après la déclaration. */}
                {!venteRemboursee(v) && (v.status === "awaiting_shipment" || v.status === "shipped") && (
                  <HandoverCodeSeller
                    orderId={v.order_id}
                    labels={{
                      title: t(lang, "hc.seller.title"), placeholder: t(lang, "hc.seller.ph"), cta: t(lang, "hc.seller.cta"),
                      hint: t(lang, "hc.seller.hint"), done: t(lang, "hc.seller.done"), network: t(lang, "error.network"),
                      errors: {
                        code_incorrect: t(lang, "hc.err.incorrect"), verrouille: t(lang, "hc.err.locked"),
                        code_absent: t(lang, "hc.err.absent"), code_invalide: t(lang, "hc.err.invalid"),
                        etat_incompatible: t(lang, "hc.err.state"), generic: t(lang, "hc.err.generic"),
                      },
                    }}
                  />
                )}
              </div>
            </li>
          ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Shell>
  );
}
