import { readSellerPricing, readSellerLaunch } from "@/lib/seller-pricing-server";
import { SellerLaunchPanel } from "@/components/seller-pricing-panel";
import { DigitalSellerMetrics } from "@/components/digital-seller-metrics";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { VendeurShell } from "@/components/vendeur-shell";
import { IconeStudio, type NomIcone } from "@/components/studio-icones";
import { MontantsMasquables } from "@/components/montants-masquables";
import { getCurrentUser, getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, isMissingColumn } from "@/lib/products";
import { formatHTG } from "@/lib/sample-data";
import { sommeHTG } from "@/lib/somme-htg";
import { etapeVendeur, besoinDeGuidage, clesEtape } from "@/lib/vendeur-etape";
import { VendeurPremierPas } from "@/components/vendeur-premier-pas";
import { siteUrl } from "@/lib/site-url";
import { hrefBoutique } from "@/lib/boutique-href";
import { bornes, pageValide, nbPages, pageDansBornes } from "@/lib/pagination";
import { coverUrlAt, COVER_WIDTHS } from "@/lib/product-image";
import { getLang } from "@/lib/i18n-server";
import { t, type I18nKey, type Lang } from "@/lib/i18n";
import { DIGITAL_KINDS, type ProductKind } from "@/lib/product-kind";
import { estArchivee } from "@/lib/seller-products-filter";
import { momentDeLaJournee } from "@/lib/moment-journee";
import { PayoutRequest } from "@/components/payout-request";

export const dynamic = "force-dynamic";

/** Ventes par page. Huit tiennent dans un écran de 360 px sans défilement. */
const PAGE_VENTES = 8;
/* Titre d'onglet dans la langue de session (audit du système de design, m10) :
   « Tableau de bord » restait en français pour un vendeur kreyòl. Hors index. */
export async function generateMetadata() {
  const lang = await getLang();
  return { title: `${t(lang, "nav.dashboard")} — Zabelie`, robots: { index: false, follow: false } };
}

/** Les trois cas particuliers (démo, non connecté, suspendu) : sans menu. */
function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-5xl px-5 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

/** L'accueil, avec le menu du tableau vendeur (docs/73). */
function Accueil({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main">
        <VendeurShell lang={lang} actif="accueil">
          {children}
        </VendeurShell>
      </main>
      <SiteFooter />
    </div>
  );
}

type Sale = {
  id: string;
  order_ref: string | null; // null avant 0042 (code avant schéma)
  amount_htg: number;
  created_at: string;
  status: string;
  product: { title: string } | { title: string }[] | null;
};

type ProductRow = {
  slug: string;
  title: string;
  status: string;
  sales_count: number;
  /** Couverture publique. `null` = produit sans photo (le cas de départ). */
  cover_url: string | null;
  kind: ProductKind;
};

/**
 * /tableau-de-bord — l'accueil du vendeur, façon Chariow (docs/73, demande du
 * porteur du 2026-10-17) : salutation à l'heure d'Haïti, actions rapides,
 * alerte « À traiter », argent masquable, ventes et produits. La boutique, le
 * compte et les codes promo ont leurs pages, derrière le menu.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ ventes?: string }>;
}) {
  /* Les ventes se paginent (2026-08-17). Elles étaient plafonnées à 8 SANS
     rien dire : un vendeur avec trente ventes en voyait huit et n'avait aucun
     moyen de le savoir. C'est le registre de son argent — le même défaut que
     les files admin, sur la personne à qui la plateforme doit quelque chose. */
  const pageVentes = pageValide((await searchParams)?.ventes);
  /* La langue est résolue d'abord : même les cas particuliers parlent celle
     du vendeur (« Bonjour, » restait en français dans les quatre langues). */
  const lang = await getLang();
  if (!isSupabaseConfigured()) {
    return (
      <Shell title={t(lang, "nav.dashboard")}>
        <p className="mt-4 text-sm text-mist">{t(lang, "vendeur.demo")}</p>
      </Shell>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return (
      <Shell title={t(lang, "nav.dashboard")}>
        <p className="mt-4 text-sm text-mist">{t(lang, "vendeur.connexion")}</p>
        <Link
          href="/connexion?next=/tableau-de-bord"
          className="bouton mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
        >
          {t(lang, "nav.login")}
        </Link>
      </Shell>
    );
  }

  // Compte suspendu (modération) : accès au tableau de bord bloqué, motif
  // affiché. Le wallet reste intact (aucun gel de solde — cadre BRH) ; seul
  // l'accès et la visibilité catalogue sont coupés le temps de la suspension.
  // Les pages filles (boutique, compte, codes promo) renvoient ici.
  const suspension = await getSuspension(user.id);
  if (suspension) {
    return (
      <Shell title={t(lang, "vendeur.suspendu.titre")}>
        <div className="mt-6 max-w-xl rounded-2xl border border-danger-text/40 bg-surface/60 p-6 text-sm">
          <p>
            {t(lang, "vendeur.suspendu.texte").replace(
              "{date}",
              new Date(suspension.suspendedAt).toLocaleDateString("fr-HT")
            )}
          </p>
          {suspension.reason && (
            <p className="mt-3 text-mist">
              {t(lang, "vendeur.suspendu.motif").replace("{motif}", suspension.reason)}
            </p>
          )}
          <p className="mt-3 text-mist">{t(lang, "vendeur.suspendu.suite")}</p>
        </div>
      </Shell>
    );
  }

  let balance = 0;
  let pending = 0;
  let hasPendingPayout = false;
  let netTotal = 0;
  // `false` = total partiel. Il est alors préfixé « ≥ » : un vendeur ne doit
  // jamais lire comme exact un montant qu'on sait amputé.
  let netComplet = true;
  let boutikSlug: string | null = null;
  let nextMaturity: string | null = null;
  let products: ProductRow[] = [];
  let sales: Sale[] = [];
  /* Compte RÉEL des ventes, pas la longueur de la page. `sales.length` est
     plafonné à 8 par construction : s'en servir pour dire « 8 ventes » à
     quelqu'un qui en a trente serait le défaut d'origine sous un autre nom. */
  let ventesTotal = 0;
  /* Commandes payées que le vendeur n'a pas encore déclarées remises (0043 ;
     les prestations passent par la même machine depuis 0068). `null` = lecture
     impossible : l'alerte se tait plutôt que de dire « rien à faire ». */
  let aTraiter: number | null = null;

  try {
    const admin = createAdminClient();

    const { data: wallet } = await admin
      .from("wallets")
      .select("id, balance_htg, pending_htg")
      .eq("owner_id", user.id)
      .maybeSingle();
    balance = wallet?.balance_htg ?? 0;
    pending = wallet?.pending_htg ?? 0;

    if (wallet?.id) {
      // Une demande de retrait ouverte bloque les suivantes (0034) : on le dit
      // plutôt que de laisser le vendeur se heurter à un refus.
      const { data: openPayout } = await admin
        .from("payouts")
        .select("id")
        .eq("wallet_id", wallet.id)
        .in("status", ["requested", "processing"])
        .limit(1)
        .maybeSingle();
      hasPendingPayout = Boolean(openPayout);
    }

    if (wallet?.id) {
      // « Quand est-ce que l'argent arrive ? » vaut plus que la règle J+7.
      const [{ data: nextEscrow }, somme] = await Promise.all([
        admin
          .from("escrow_entries")
          .select("matures_at")
          .eq("wallet_id", wallet.id)
          .eq("status", "maturing")
          .order("matures_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        // Somme COMPLÈTE du grand livre, par lots. Le `.limit(1000)` précédent
        // amputait les revenus nets au-delà de 1 000 crédits, en silence — un
        // vendeur n'a aucun moyen de voir qu'un total est tronqué, et celui-ci
        // est le chiffre par lequel il juge ce que la plateforme lui doit.
        sommeHTG(
          (de, a) =>
            admin
              .from("wallet_transactions")
              .select("amount_htg")
              .eq("wallet_id", wallet.id)
              .eq("type", "credit")
              .order("created_at", { ascending: true })
              .range(de, a),
          "vendeur.revenus_nets"
        ),
      ]);
      nextMaturity = nextEscrow?.matures_at ?? null;
      netTotal = somme.total;
      netComplet = somme.complet;
    }

    /* L'adresse publique lisible (0083), lue À PART et sans bruit : la
       colonne n'existe qu'après application, et le code se déploie avant.
       Absente → `boutikSlug` reste null → `hrefBoutique` retombe sur
       /createur/<id>, qui ne cesse jamais de fonctionner. */
    const { data: slugRow } = await admin
      .from("profiles")
      .select("boutik_slug")
      .eq("id", user.id)
      .maybeSingle();
    boutikSlug = (slugRow as { boutik_slug?: string | null } | null)?.boutik_slug ?? null;

    const { data: prods } = await admin
      .from("products")
      .select("id, slug, title, status, sales_count, cover_url, kind")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });
    products = (prods ?? []) as ProductRow[];

    const { count: nbATraiter, error: errATraiter } = await admin
      .from("zabelie_fulfillment")
      .select("order_id, order:orders!inner(products!orders_product_id_fkey!inner(seller_id))", { count: "exact", head: true })
      .eq("status", "awaiting_shipment")
      .eq("order.products.seller_id", user.id);
    aTraiter = errATraiter ? null : (nbATraiter ?? 0);

    const productIds = (prods ?? []).map((p) => (p as { id: string }).id);
    if (productIds.length > 0) {
      // Sélection tolérante : 0042 pas encore appliquée → colonne absente,
      // on redemande sans elle (même motif que le catalogue).
      const first = await admin
        .from("orders")
        .select("id, order_ref, amount_htg, created_at, status, product:products!orders_product_id_fkey(title)",
          { count: "exact" })
        .in("product_id", productIds)
        .in("status", ["paid", "delivered"])
        .order("created_at", { ascending: false })
        .range(...bornes(pageVentes, PAGE_VENTES));
      let rows = first.data;
      ventesTotal = first.count ?? 0;
      if (isMissingColumn(first.error)) {
        const retry = await admin
          .from("orders")
          .select("id, amount_htg, created_at, status, product:products!orders_product_id_fkey(title)",
            { count: "exact" })
          .in("product_id", productIds)
          .in("status", ["paid", "delivered"])
          .order("created_at", { ascending: false })
          .range(...bornes(pageVentes, PAGE_VENTES));
        rows = (retry.data ?? []).map((o) => ({ ...o, order_ref: null }));
        ventesTotal = retry.count ?? 0;
      }
      sales = (rows ?? []) as unknown as Sale[];
    }
  } catch {
    return (
      <Accueil lang={lang}>
        <h1 className="text-2xl font-semibold sm:text-3xl">{user.displayName}</h1>
        <p role="alert" className="mt-4 text-sm text-danger-text">{t(lang, "vendeur.indisponible")}</p>
      </Accueil>
    );
  }

  const totalSales = products.reduce((s, p) => s + p.sales_count, 0);
  const published = products.filter((p) => p.status === "published").length;

  /* HIÉRARCHIE DES MÉTRIQUES (2026-08-17).
   *
   * Les quatre cartes avaient la même taille ET le même `text-gradient` :
   * « Produits publiés », qui est une anecdote, pesait exactement autant que
   * « Disponible », qui est la question que le vendeur se pose vraiment.
   * Un accent posé partout ne désigne plus rien — c'est ce qui distingue un
   * tableau de bord d'une grille de chiffres.
   *
   * Le libellé passe AU-DESSUS de la valeur : on sait ce qu'on lit avant de
   * le lire, ce qui compte d'autant plus quand quatre nombres se suivent.
   *
   * Chaque métrique porte désormais sa FENÊTRE. Un montant sans période est
   * un montant qu'on ne sait pas interpréter — « Revenus nets » ne disait pas
   * sur quel intervalle, donc ne disait rien de vérifiable.
   */
  const pricingClient = createAdminClient();
  const sellerPricing = await readSellerPricing(pricingClient);
  const sellerLaunch = sellerPricing ? await readSellerLaunch(pricingClient, user.id, sellerPricing, user.createdAt) : null;

  const metriquePrincipale = {
    label: t(lang, "tb.dispo"),
    value: formatHTG(balance),
    // C'est la part DÉJÀ MÛRE du grand livre : le reste est dans « En attente ».
    fenetre: t(lang, "tb.dispo.f"),
  };

  /* DEUX QUESTIONS, DEUX CARTES (2026-08-17).
   *
   * « Revenus nets · 12 ventes » fusionnait deux mesures dans un libellé : le
   * compte des ventes vivait dans la ligne de contexte, comme une note de bas
   * de page. Or « combien de fois quelqu'un m'a acheté » et « combien j'ai
   * gagné » ne répondent pas à la même question — et l'écart entre les deux
   * est précisément ce qu'une remise ou une vente flash creuse. Un vendeur
   * qui voit ses ventes monter pendant que ses revenus stagnent apprend
   * quelque chose ; le libellé fusionné le lui cachait.
   *
   * Le PANIER MOYEN prend la place de la fenêtre sur la carte « Ventes » :
   * répéter « depuis l'ouverture » quatre fois n'apprend rien, alors que le
   * montant par vente est le chiffre qui dit s'il faut ajuster ses prix.
   * Division ENTIÈRE (`Math.floor`) — règle dure n°3, jamais de flottant sur
   * de l'argent. Et il ne s'affiche pas si le total est incomplet : une
   * moyenne calculée sur un numérateur amputé serait fausse sans le dire.
   */
  /* Pagination des ventes : le nombre de pages se DÉDUIT du compte réel, et
     la page demandée est ramenée dans les bornes. Deux sources donneraient
     deux réponses le jour où l'une dérive. */
  const ventesPages = nbPages(ventesTotal, PAGE_VENTES);
  const ventesPage = pageDansBornes(pageVentes, ventesTotal, PAGE_VENTES);

  const panierMoyen =
    netComplet && totalSales > 0 ? Math.floor(netTotal / totalSales) : null;

  const metriques: Array<{ label: string; value: string; fenetre?: string }> = [
    {
      label: t(lang, "tb.attente"),
      value: formatHTG(pending),
      fenetre: nextMaturity
        ? t(lang, "tb.attente.date").replace(
            "{date}",
            new Date(nextMaturity).toLocaleDateString("fr-HT")
          )
        : t(lang, "tb.attente.f"),
    },
    {
      label: t(lang, "tb.ventes"),
      value: String(totalSales),
      fenetre:
        panierMoyen !== null
          ? t(lang, "tb.ventes.moy").replace("{montant}", formatHTG(panierMoyen))
          : t(lang, "tb.ventes.f"),
    },
    // Montant net cumulé (standard Chariow), désormais SEUL sur sa carte.
    {
      label: t(lang, "tb.nets"),
      value: netComplet ? formatHTG(netTotal) : `≥ ${formatHTG(netTotal)}`,
      fenetre: t(lang, "tb.nets.f"),
    },
    {
      label: t(lang, "tb.produits"),
      value: String(published),
      // « 3 » seul ne dit pas s'il en reste en brouillon. « 3 sur 5 » le dit.
      fenetre: products.length
        ? t(lang, "tb.produits.f").replace("{total}", String(products.length))
        : undefined,
    },
  ];

  /* PREMIERS PAS (2026-08-17). Décidé par une fonction pure, pas par une
   * cascade de ternaires dans le rendu — les quatre cas s'énumèrent et se
   * testent sans rendre quoi que ce soit. Le guidage passe AVANT les
   * métriques : quatre zéros en très gros au-dessus d'un « publiez votre
   * premier produit » diraient l'échec avant de dire quoi faire. */
  const etape = etapeVendeur({
    produits: products.length,
    publies: published,
    ventes: totalSales,
  });
  const brouillon = products.find((p) => p.status !== "published");
  const premierPas =
    besoinDeGuidage(etape) && etape !== "en_vente"
      ? {
          etape,
          href: etape === "brouillon" && brouillon ? `/vendre?slug=${brouillon.slug}` : "/vendre",
          // La boutique publique, pas un produit : le lien reste valable quand
          // le catalogue du vendeur change.
          lienBoutique:
            etape === "publie_sans_vente"
              ? `${siteUrl()}${hrefBoutique({ id: user.id, boutikSlug })}`
              : undefined,
          labels: {
            titre: t(lang, clesEtape(etape).titre as I18nKey),
            texte: t(lang, clesEtape(etape).texte as I18nKey),
            cta: t(lang, clesEtape(etape).cta as I18nKey),
            lien: t(lang, "pas.publie.lien"),
            message: t(lang, "pas.publie.message"),
          },
        }
      : null;

  /* FAÇON CHARIOW (docs/73). La salutation suit l'heure d'Haïti ; le nom est
     celui de la boutique, souvent un nom d'enseigne (« Garaj Petyonvil ») :
     on ne le coupe pas au premier mot. */
  const salut = t(lang, `vendeur.salut.${momentDeLaJournee(new Date())}` as I18nKey).replace(
    "{nom}",
    user.displayName.trim().slice(0, 60)
  );
  const actions: { cle: string; href: string; texte: string; icone: NomIcone }[] = [
    { cle: "physique", href: "/vendre/physique", texte: t(lang, "sell.physical.cta"), icone: "produits" },
    { cle: "numerique", href: "/vendre#nouveau", texte: t(lang, "seller.new"), icone: "nouveau" },
    // Les codes promo ne s'appliquent qu'à des produits : sans produit, l'action n'a pas d'objet.
    ...(products.length > 0
      ? [{ cle: "promo", href: "/tableau-de-bord/codes-promo", texte: t(lang, "vendeur.action.promo"), icone: "promo" as const }]
      : []),
    { cle: "partager", href: "/tableau-de-bord/boutique", texte: t(lang, "vendeur.action.partager"), icone: "partage" },
  ];
  // La performance numérique ne parle qu'à un vendeur qui a un produit numérique.
  const vendNumerique = products.some((p) => (DIGITAL_KINDS as readonly string[]).includes(p.kind));

  return (
    <Accueil lang={lang}>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <h1 className="text-2xl font-semibold sm:text-3xl">{salut}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">{t(lang, "vendeur.intro")}</p>
        </div>
        <Link
          href={hrefBoutique({ id: user.id, boutikSlug })}
          className="bouton inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold"
        >
          <IconeStudio nom="boutique" />
          {t(lang, "shop.view")}
        </Link>
      </div>

      {/* Une étiquette, pas un titre de carte : les `h2` du tableau portent `titre-section`. */}
      <p id="actions-titre" className="mt-6 text-sm font-semibold">{t(lang, "vendeur.actions")}</p>
      <ul aria-labelledby="actions-titre" className="mt-3 flex flex-wrap gap-2">
        {actions.map((a) => (
          <li key={a.cle}>
            <Link
              href={a.href}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-cloud focus-visible:outline focus-visible:outline-2"
            >
              <IconeStudio nom={a.icone} className="h-5 w-5 text-brand" />
              {a.texte}
            </Link>
          </li>
        ))}
      </ul>

      {aTraiter !== null && aTraiter > 0 && (
        <div role="status" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/40 bg-surface p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <IconeStudio nom="commandes" className="h-5 w-5 text-brand" />
            {aTraiter === 1
              ? t(lang, "vendeur.atraiter.un")
              : t(lang, "vendeur.atraiter.n").replace("{n}", String(aTraiter))}
          </p>
          <Link href="/mes-ventes" className="bouton inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand">
            {t(lang, "vendeur.atraiter.cta")}
          </Link>
        </div>
      )}

      <SellerLaunchPanel launch={sellerLaunch} lang={lang} now={sellerLaunch?.observed_at ?? 0} />
      {premierPas && (
        <VendeurPremierPas
          etape={premierPas.etape}
          labels={premierPas.labels}
          href={premierPas.href}
          lienBoutique={premierPas.lienBoutique}
        />
      )}

      {/* L'ARGENT, masquable comme sur Chariow (même préférence de navigateur
          que le Studio). Chaque valeur garde sa place et son accent ; son
          double « ••••• » ne s'affiche que zone masquée. */}
      <section id="argent" aria-labelledby="chiffres-titre" className="mt-8 scroll-mt-32">
        <MontantsMasquables titre={t(lang, "vendeur.argent")} masquer={t(lang, "vendeur.masquer")} classeTitre="titre-section">
          {/* La seule métrique qui répond à « où en est mon argent ? » : pleine
              largeur, et SEULE à porter le dégradé de la marque. */}
          <div className="mt-3 rounded-2xl border border-line bg-surface-maroon/70 p-6">
            <p className="text-xs uppercase tracking-wide text-mist">
              {metriquePrincipale.label}
            </p>
            <p className="metric mt-1 text-4xl font-extrabold text-gradient sm:text-5xl group-data-[masque]/montants:hidden">
              {metriquePrincipale.value}
            </p>
            <p className="metric mt-1 hidden text-4xl font-extrabold sm:text-5xl group-data-[masque]/montants:block">
              <span aria-hidden="true">•••••</span>
              <span className="sr-only">{t(lang, "vendeur.masque")}</span>
            </p>
            <p className="mt-1 text-xs text-mist">{metriquePrincipale.fenetre}</p>
          </div>

          {/* Les trois secondaires : plus petites, sans dégradé, en couleur pleine.
              Quatre secondaires : la grille est PAIRE (2×2 sur 360 px), donc plus
              de carte orpheline à mi-largeur à rattraper. */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {metriques.map((m) => (
              <div
                key={m.label}
                className="rounded-2xl border border-line bg-surface-maroon/40 p-4"
              >
                <p className="text-xs uppercase tracking-wide text-mist">{m.label}</p>
                {/* `text-lg` sur mobile, MESURÉ et pas choisi : à `text-xl`,
                    « 124 600 HTG » se coupait en deux dans une carte de 167 px et
                    « HTG » restait seul sur sa ligne. Reste honnête sur la limite —
                    un cumul à sept chiffres passera bien sur deux lignes, que
                    `leading-tight` garde compactes. */}
                <p className="metric mt-1 text-lg font-bold leading-tight text-cloud sm:text-xl group-data-[masque]/montants:hidden">
                  {m.value}
                </p>
                <p className="metric mt-1 hidden text-lg font-bold leading-tight text-cloud sm:text-xl group-data-[masque]/montants:block">
                  <span aria-hidden="true">•••••</span>
                  <span className="sr-only">{t(lang, "vendeur.masque")}</span>
                </p>
                {m.fenetre && <p className="mt-1 text-xs text-mist">{m.fenetre}</p>}
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-4 rounded-2xl border border-line bg-surface-brown/50 p-5">
            <p className="text-sm text-mist">{t(lang, "vendeur.retrait.regle")}</p>
            <PayoutRequest
              key={user.id}
              actorId={user.id}
              disponibleHtg={balance}
              hasPending={hasPendingPayout}
              labels={{
                open: t(lang, "vendeur.retrait.ouvrir"),
                title: t(lang, "vendeur.retrait.titre"),
                intro: t(lang, "vendeur.retrait.intro").replace("{montant}", formatHTG(balance)),
                amount: t(lang, "vendeur.retrait.montant"),
                submit: t(lang, "vendeur.retrait.envoyer"),
                submitting: t(lang, "vendeur.retrait.envoi"),
                cancel: t(lang, "vendeur.retrait.annuler"),
                pending: t(lang, "vendeur.retrait.enCours"),
                networkError: t(lang, "vendeur.retrait.reseau"),
                success: t(lang, "vendeur.retrait.ok"),
              }}
            />
          </div>
        </MontantsMasquables>
      </section>

      {vendNumerique && <DigitalSellerMetrics sellerId={user.id} lang={lang}/>}

      {/* Ventes récentes */}
      <section id="ventes" className="mt-10 scroll-mt-32">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="titre-section">{t(lang, "dashboard.sales.recent")}</h2>
          {/* Le compte RÉEL, pas la longueur de la page. Sans lui, « 8 » est
              indiscernable de « 8 sur 30 » — et c'est le registre de son
              argent que le vendeur regarde. */}
          {ventesTotal > 0 && (
            <span className="numeric text-xs text-mist">
              {ventesTotal} {t(lang, "product.sales")}
            </span>
          )}
        </div>
        {sales.length === 0 ? (
          <p className="mt-3 text-sm text-mist">{t(lang, "dashboard.sales.empty")}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {sales.map((o) => {
              const product = Array.isArray(o.product) ? o.product[0] : o.product;
              return (
                /* COLONNES ALIGNÉES (2026-08-17).
                 *
                 * Montant et date vivaient dans le MÊME `<span>` poussé à
                 * droite par un `justify-between` : « 1 200 HTG · 14/08 » et
                 * « 950 HTG · 12/08 » ne se superposaient donc pas, et deux
                 * montants ne pouvaient pas se comparer d'un coup d'œil.
                 *
                 * La date descend au niveau des métadonnées, où elle
                 * appartient : ce n'est pas une mesure. Le montant occupe
                 * seul une colonne de droite, en chiffres tabulaires
                 * (`.metric`, déjà dans globals.css) — c'est ce qui fait lire
                 * un TABLEAU plutôt qu'une liste d'application mobile. */
                <li
                  key={o.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-line bg-surface/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{product?.title ?? t(lang, "vendeur.nav.produits")}</p>
                    <p className="mt-0.5 text-xs text-mist">
                      {new Date(o.created_at).toLocaleDateString("fr-HT")}
                      {/* Le numéro que le vendeur cite à l'acheteur — WhatsApp. */}
                      {o.order_ref && (
                        <>
                          {" · "}
                          <span className="numeric select-all">{o.order_ref}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <p className="metric text-right text-sm font-semibold">
                    {formatHTG(o.amount_htg)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {ventesPages > 1 && (
          /* Liens GET, comme le catalogue et les files admin : le vendeur
             consulte souvent depuis une connexion qui n'exécutera pas le
             JavaScript. Et la page est ramenée dans les bornes — « page 99
             sur 3 » dirait au vendeur qu'il s'est perdu sans lui dire où. */
          <nav className="mt-4 flex items-center justify-center gap-3 text-sm">
            {ventesPage > 1 ? (
              <Link
                href={`/tableau-de-bord?ventes=${ventesPage - 1}#ventes`}
                className="bouton inline-flex min-h-11 items-center rounded-xl border border-line bg-surface/60 px-5 font-semibold text-cloud transition hover:border-accent/50"
              >
                {t(lang, "catalog.prev")}
              </Link>
            ) : null}
            <span className="numeric text-mist">
              {t(lang, "catalog.pageOf")
                .replace("{n}", String(ventesPage))
                .replace("{total}", String(ventesPages))}
            </span>
            {ventesPage < ventesPages ? (
              <Link
                href={`/tableau-de-bord?ventes=${ventesPage + 1}#ventes`}
                className="bouton inline-flex min-h-11 items-center rounded-xl border border-line bg-surface/60 px-5 font-semibold text-cloud transition hover:border-accent/50"
              >
                {t(lang, "catalog.more")}
              </Link>
            ) : null}
          </nav>
        )}
      </section>

      {/* Mes produits */}
      <section id="produits" className="mt-10 scroll-mt-32">
        <div className="flex items-center justify-between">
          <h2 className="titre-section">{t(lang, "vendeur.produits.titre")}</h2>
          <Link
            href="/vendre"
            className="inline-flex min-h-11 items-center text-sm text-mist transition hover:text-cloud"
          >
            {t(lang, "vendeur.produits.publier")}
          </Link>
        </div>
        {products.length === 0 ? (
          <p className="mt-3 text-sm text-mist">
            {t(lang, "vendeur.produits.aucun")}{" "}
            <Link href="/vendre" className="text-cloud underline">
              {t(lang, "vendeur.produits.premier")}
            </Link>
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {products.map((p) => {
              /* UNE SEULE invocation, liée à un nom. La forme précédente
                 appelait `coverUrlAt` deux fois — dans la condition et dans
                 le `src` — et une mutation qui remplaçait le SECOND par
                 `p.cover_url` laissait le test vert : il vérifiait la
                 présence de l'appel, pas qu'il alimente l'image. Un nom
                 unique retire la question. */
              const vignette = coverUrlAt(p.cover_url, COVER_WIDTHS.card);
              return (
              <li
                key={p.slug}
                className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3"
              >
                {/* LA VIGNETTE. Un vendeur reconnaît sa photo avant de lire son
                    titre — et d'autant plus sur un écran de 360 px en kreyòl.
                    Les couvertures existent depuis le pipeline d'images ; cette
                    liste les ignorait encore. `cover` (640 px) est la même
                    largeur que la carte de catalogue : une seule image en
                    cache pour les deux écrans. */}
                {vignette ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={vignette}
                    alt=""
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                ) : (
                  /* Pas de photo : un carré neutre, PAS une image cassée.
                     Et il dit ce qui manque — c'est la première chose qu'un
                     acheteur remarquera. */
                  <span
                    className="grid h-12 w-12 place-items-center rounded-lg border border-line bg-ink/40 text-xs leading-tight text-mist"
                    title="Aucune photo"
                  >
                    ⊘
                  </span>
                )}

                <Link href={`/produit/${p.slug}`} className="min-w-0 hover:text-cloud">
                  <span className="block truncate text-sm">{p.title}</span>
                  {/* STATUT LISIBLE. La ligne affichait la valeur BRUTE de la
                      base — « published », « draft » — à quelqu'un qui ne lit
                      pas l'anglais et n'a pas à connaître notre schéma. Même
                      décision que `app/vendre` (UX-01) : non publié = « en
                      revue », SAUF une fiche archivée (retirée par la
                      modération), à qui « en revue » promettait une décision
                      déjà prise (audit REA 2026-10-26, #9). */}
                  <span className="mt-0.5 block text-xs text-mist">
                    {p.status === "published"
                      ? t(lang, "status.published")
                      : estArchivee(p.status)
                        ? t(lang, "status.archived")
                        : t(lang, "status.review")}
                  </span>
                </Link>

                <span className="metric text-right text-xs text-mist">
                  {p.sales_count} {t(lang, "product.sales")}
                </span>
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </Accueil>
  );
}
