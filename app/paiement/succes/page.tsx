import { SellerPixels } from "@/components/seller-pixels";
import { lirePixelsVendeur } from "@/lib/pixels-server";
import { ProductOffers } from "@/components/product-offers";
import { publicOffers } from "@/lib/product-offers-server";
import { offerCopy } from "@/lib/product-offer-copy";
import { Bouton } from "@/components/bouton";
import { SiteNav } from "@/components/site-nav";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, isMissingColumn } from "@/lib/products";
import { getLang } from "@/lib/i18n-server";
import { t, type I18nKey } from "@/lib/i18n";
import { isProductKind, pickByKind, isDownloadable } from "@/lib/product-kind";

/**
 * Numéro lisible de la commande (0042) ET type du produit acheté.
 *
 * C'est le numéro que l'acheteur note et colle dans WhatsApp, pas l'UUID
 * tronqué. RLS : l'acheteur lit ses propres commandes (orders_buyer_read).
 * Tout échec — colonne pas encore migrée, session absente, commande
 * introuvable — retombe sur l'affichage UUID historique : la page de succès
 * ne casse jamais pour un numéro.
 *
 * ⚠️ LE `kind` A ÉTÉ AJOUTÉ LE 2026-08-27, ET IL RÉPARE UN DÉFAUT MESURÉ.
 * Cette page rendait `pay.ok.body` SANS CONDITION — « votre fichier est
 * disponible dans vos téléchargements », dans les quatre langues. Zabelie vend
 * trois types. Un acheteur de prestation ou de produit physique arrivait donc,
 * juste après avoir payé, sur l'ordre d'aller chercher un fichier qui
 * n'existerait jamais.
 *
 * Et ce n'était pas théorique : les deux seuls produits publiés au moment de
 * la correction sont des PRESTATIONS, et la première commande réelle prévue
 * par `docs/22` porte sur l'une d'elles. Le premier acheteur de Zabelie serait
 * tombé dessus.
 *
 * La jointure passe par le client de SESSION : `orders_buyer_read` la borne à
 * l'acheteur, et `products` est lisible pour un produit publié. Aucun droit
 * supplémentaire n'est demandé.
 */
async function detailsCommande(
  orderId: string
): Promise<{ payee: boolean; ref: string | null; kind: string | null; productId: string | null; buyerId: string | null; sellerId: string | null; montantHtg: number | null }> {
  const vide = { payee: false, ref: null, kind: null, productId: null, buyerId: null, sellerId: null, montantHtg: null };
  if (!isSupabaseConfigured()) return vide;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return vide;
    const { data, error } = await supabase
      .from("orders")
      .select("order_ref,product_id,buyer_id,status,amount_htg,product:products!orders_product_id_fkey(kind,seller_id)")
      .eq("buyer_id", user.id)
      .eq("id", orderId)
      .maybeSingle();
    if (error && !isMissingColumn(error)) return vide;
    const ligne = data as
      | { order_ref?: string | null; product_id: string; buyer_id: string; status: string; amount_htg?: number | null; product?: { kind?: string | null; seller_id?: string | null } | null }
      | null;
    // Statut lu en base sous la session, jamais le retour navigateur : seule source de « payée ».
    const payee = !!ligne && ["paid", "delivered"].includes(ligne.status);
    return {
      payee,
      productId: payee && ligne ? ligne.product_id : null,
      buyerId: user.id,
      ref: ligne?.order_ref ?? null,
      kind: ligne?.product?.kind ?? null,
      // Pixel « achat » : seulement pour une commande PAYÉE (statut lu en base, jamais le retour navigateur).
      sellerId: payee && ligne ? ligne.product?.seller_id ?? null : null,
      montantHtg: payee && ligne ? ligne.amount_htg ?? null : null,
    };
  } catch {
    return vide;
  }
}

/**
 * La phrase de confirmation, accordée au type — et le REPLI EST NEUTRE.
 *
 * ⚠️ C'est la décision qui compte dans ce fichier. Quand le type est inconnu
 * — Supabase non configuré, commande absente du paramètre, jointure en échec —
 * on ne devine PAS. `pay.ok.body` a été réécrite pour ne plus promettre de
 * fichier : elle renvoie l'acheteur vers « Mes achats », ce qui est vrai dans
 * les trois cas.
 *
 * Un repli qui promet quelque chose est pire qu'un repli qui ne promet rien :
 * c'est exactement l'ancien comportement de cette page.
 *
 * La comparaison de type passe par `pickByKind` — obligatoire hors de
 * `lib/product-kind.ts` (CLAUDE.md, `tests/product-kind-discipline.test.ts`) :
 * un `switch` exhaustif du module garantit qu'une quatrième valeur ajoutée à
 * l'énumération sera signalée, là où un ternaire resterait silencieux.
 */
function cleCorps(kind: string | null): I18nKey {
  if (!isProductKind(kind)) return "pay.ok.body";
  return (
    pickByKind<I18nKey>(
      kind,
      {
        file: "pay.ok.body.file",
        service: "pay.ok.body.service",
        physical: "pay.ok.body.physical",
      },
      "paiement/succes"
    ) ?? "pay.ok.body"
  );
}

/* Titre neutre : il s'affiche avant de savoir si la commande est payée.
   Dans la langue de session (audit du système de design, m10) : il était en
   français fixe pour un acheteur kreyòl. Hors index, toujours (S12). */
export async function generateMetadata() {
  const lang = await getLang();
  return { title: `${t(lang, "pay.order")} — Zabelie`, robots: { index: false, follow: false } };
}

export default async function SuccesPage({
  searchParams,
}: {
  searchParams: Promise<{ commande?: string }>;
}) {
  const [{ commande }, lang] = await Promise.all([searchParams, getLang()]);
  const { payee, ref, kind, productId, buyerId, sellerId, montantHtg } = commande
    ? await detailsCommande(commande)
    : { payee: false, ref: null, kind: null, productId: null, buyerId: null, sellerId: null, montantHtg: null };

  /* ⚠️ SEC-01 (audit du 2026-10-17) : la page disait « ✓ Paiement confirmé »
   * à N'IMPORTE QUI — sans session, sans commande, avec un numéro inventé.
   * Une page officielle de zabelie.com servait alors de fausse preuve de
   * paiement : le faux acheteur envoie la capture au vendeur, qui remet
   * l'objet sans être payé.
   *
   * La coche ne s'affiche donc que pour une commande relue en base, sous la
   * session, payée et appartenant à l'acheteur. Tout le reste — session
   * absente, commande d'un autre, en attente, inconnue, Supabase non
   * configuré — reçoit une page qui ne confirme rien et renvoie vers
   * « Mes achats », où l'état fait foi. Pas de numéro de commande non plus :
   * recopié depuis l'URL, il donnerait du crédit à une capture. */
  if (!payee) {
    return (
      <div className="bg-grain min-h-dvh">
        <SiteNav />
        <main id="main" className="mx-auto max-w-md px-5 py-24 text-center">
          <h1 className="text-2xl font-extrabold">{t(lang, "pay.check.title")}</h1>
          <p className="mt-3 text-mist">{t(lang, "pay.check.body")}</p>
          <div className="mt-8 flex flex-col gap-3">
            <Bouton href="/mes-achats">{t(lang, "pay.wait.cta")}</Bouton>
            <Bouton href="/catalogue" variante="discret">
              {t(lang, "pay.back")}
            </Bouton>
          </div>
        </main>
      </div>
    );
  }

  const pixels = sellerId && productId && montantHtg !== null ? await lirePixelsVendeur(sellerId) : null;
  const offers = productId && buyerId ? await publicOffers(productId, buyerId) : [];

  /* L'escrow ne se dit que là où il veut dire quelque chose : sur une
   * prestation ou un bien physique, l'acheteur vient de payer pour une chose
   * qu'il n'a PAS encore. C'est le moment exact où « le vendeur n'est payé
   * qu'après la remise » le rassure. Sur un fichier, la livraison est
   * immédiate : la même phrase y sèmerait un doute au lieu de le lever. */
  const montrerEscrow = isProductKind(kind) && !isDownloadable(kind, "paiement/succes");

  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-md px-5 py-24 text-center">
        {/* La coche est un tracé, pas le glyphe ✓ : un glyphe dépend de la police
            du téléphone (carré vide sur certains Android d'entrée de gamme) et
            se lisait « coche » au lecteur d'écran avant le titre qui le dit. */}
        <span className="reveal-mark mx-auto grid h-16 w-16 place-items-center rounded-full bg-success text-ink">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-8 w-8 fill-none stroke-current"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h1
          className="reveal mt-6 text-2xl font-extrabold"
          style={{ ["--reveal-delay" as string]: "90ms" }}
        >
          {t(lang, "pay.ok.title")}
        </h1>
        <p
          className="reveal mt-3 text-mist"
          style={{ ["--reveal-delay" as string]: "170ms" }}
        >
          {t(lang, cleCorps(kind))}
        </p>

        {montrerEscrow && (
          <p
            className="reveal mx-auto mt-4 flex max-w-xs items-start gap-2 rounded-xl border border-line bg-surface/60 px-3 py-2 text-left text-xs text-mist"
            style={{ ["--reveal-delay" as string]: "250ms" }}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 flex-none fill-none stroke-success"
              strokeWidth="1.8"
            >
              <path d="M4 8h16v11H4zM8 8V6a4 4 0 018 0v2" />
            </svg>
            {t(lang, "trust.2.b")}
          </p>
        )}

        {commande && (
          <p
            className="reveal mt-2 text-xs text-mist"
            style={{ ["--reveal-delay" as string]: "310ms" }}
          >
            {t(lang, "pay.order")}{" "}
            <span className="numeric select-all">
              {ref ?? `#${commande.slice(0, 8)}`}
            </span>
          </p>
        )}
        <div
          className="reveal mt-8 flex flex-col gap-3"
          style={{ ["--reveal-delay" as string]: "380ms" }}
        >
          <Bouton href="/mes-achats">{t(lang, "pay.ok.cta")}</Bouton>
          <Bouton href="/catalogue" variante="discret">
            {t(lang, "pay.back")}
          </Bouton>
        </div>
        <ProductOffers offers={offers} copy={offerCopy(lang)} afterPurchase/>
      </main>
      {pixels && commande && productId && montantHtg !== null && (
        <SellerPixels ids={pixels} evenement={{ type: "achat", orderId: commande, productId, valeurHtg: montantHtg }} labels={{ text: t(lang, "pixels.consent.text"), accept: t(lang, "pixels.consent.accept"), refuse: t(lang, "pixels.consent.refuse"), privacy: t(lang, "pixels.consent.privacy") }} />
      )}
    </div>
  );
}
