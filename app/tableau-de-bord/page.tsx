import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { getCurrentUser, getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, isMissingColumn } from "@/lib/products";
import { formatHTG } from "@/lib/sample-data";
import { ProfileForm } from "@/components/profile-form";
import { DeliveryInfoForm } from "@/components/delivery-info-form";
import { KycForm } from "@/components/kyc-form";
import { lireDossierKyc } from "@/lib/kyc";
import { isMissingTable } from "@/lib/product-media";
import { getZonesActives, libelleZone } from "@/lib/zones";
import { sommeHTG } from "@/lib/somme-htg";
import { etapeVendeur, besoinDeGuidage, clesEtape } from "@/lib/vendeur-etape";
import { VendeurPremierPas } from "@/components/vendeur-premier-pas";
import { siteUrl } from "@/lib/site-url";
import { hrefBoutique } from "@/lib/boutique-href";
import { coverUrlAt, COVER_WIDTHS } from "@/lib/product-image";
import { getLang } from "@/lib/i18n-server";
import { t, type I18nKey } from "@/lib/i18n";
import { AccountActions } from "@/components/account-actions";
import { PayoutRequest } from "@/components/payout-request";
import {
  ZabelieCouponManager,
  type CouponItem,
} from "@/components/zabelie-coupon-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tableau de bord — Zabelie" };

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-5xl px-5 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {children}
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
};

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <Shell title="Tableau de bord">
        <p className="mt-4 text-sm text-mist">
          Mode démo — connecte Supabase pour voir tes revenus et tes ventes.
        </p>
      </Shell>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return (
      <Shell title="Tableau de bord">
        <p className="mt-4 text-sm text-mist">Connecte-toi pour accéder à ton tableau de bord.</p>
        <Link
          href="/connexion"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
        >
          Se connecter
        </Link>
      </Shell>
    );
  }

  // Compte suspendu (modération) : accès au tableau de bord bloqué, motif
  // affiché. Le wallet reste intact (aucun gel de solde — cadre BRH) ; seul
  // l'accès et la visibilité catalogue sont coupés le temps de la suspension.
  const suspension = await getSuspension(user.id);
  if (suspension) {
    return (
      <Shell title="Compte suspendu">
        <div className="mt-6 max-w-xl rounded-2xl border border-danger-text/40 bg-surface/60 p-6 text-sm">
          <p>
            Votre compte a été suspendu le{" "}
            <strong>
              {new Date(suspension.suspendedAt).toLocaleDateString("fr-HT")}
            </strong>{" "}
            pour non-respect du règlement de Zabelie.
          </p>
          {suspension.reason && (
            <p className="mt-3 text-mist">
              Motif : <span className="text-cloud">{suspension.reason}</span>
            </p>
          )}
          <p className="mt-3 text-mist">
            Vos produits sont retirés du catalogue et vos gains restent
            conservés. Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur,
            contactez l&apos;équipe pour faire appel — la suspension est
            réversible.
          </p>
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
  let coupons: CouponItem[] = [];
  // V-5 : coordonnées de livraison — `undefined` = 0076 non appliquée (le
  // bloc ne se rend pas), sinon les valeurs (vides si jamais renseignées).
  let livInfo:
    | { full_name: string; phone: string; adres_liv: string }
    | undefined;
  // V-6 : dossier KYC — `null` = 0079 non appliquée, la section se tait.
  let dossierKyc: Awaited<ReturnType<typeof lireDossierKyc>> = null;
  let profile = {
    display_name: user.displayName,
    bio: "",
    avatar_url: "",
    country_code: "",
    region_code: "",
    zone_id: "",
    pwen_repe: "",
  };

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

    const { data: liv, error: livErr } = await admin
      .from("zabelie_delivery_info")
      .select("full_name, phone, adres_liv")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!livErr) {
      livInfo = {
        full_name: liv?.full_name ?? "",
        phone: liv?.phone ?? "",
        adres_liv: liv?.adres_liv ?? "",
      };
    } else if (!isMissingTable(livErr)) {
      console.error("[delivery-info] lecture échouée", livErr.code);
    }

    dossierKyc = await lireDossierKyc(admin, user.id);

    const { data: prof } = await admin
      .from("profiles")
      .select("display_name, bio, avatar_url, country_code, region_code, zone_id, pwen_repe")
      .eq("id", user.id)
      .maybeSingle();
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
    if (prof) {
      profile = {
        display_name: prof.display_name ?? user.displayName,
        bio: prof.bio ?? "",
        avatar_url: prof.avatar_url ?? "",
        country_code: prof.country_code ?? "",
        region_code: prof.region_code ?? "",
        zone_id: prof.zone_id ?? "",
        pwen_repe: prof.pwen_repe ?? "",
      };
    }

    const { data: prods } = await admin
      .from("products")
      .select("id, slug, title, status, sales_count, cover_url")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });
    products = (prods ?? []) as ProductRow[];

    const { data: cps } = await admin
      .from("zabelie_coupons")
      .select("id, code, percent, product_id, max_uses, uses, expires_at, active")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    coupons = (cps ?? []) as CouponItem[];

    const productIds = (prods ?? []).map((p) => (p as { id: string }).id);
    if (productIds.length > 0) {
      // Sélection tolérante : 0042 pas encore appliquée → colonne absente,
      // on redemande sans elle (même motif que le catalogue).
      const first = await admin
        .from("orders")
        .select("id, order_ref, amount_htg, created_at, status, product:products(title)")
        .in("product_id", productIds)
        .in("status", ["paid", "delivered"])
        .order("created_at", { ascending: false })
        .limit(8);
      let rows = first.data;
      if (isMissingColumn(first.error)) {
        const retry = await admin
          .from("orders")
          .select("id, amount_htg, created_at, status, product:products(title)")
          .in("product_id", productIds)
          .in("status", ["paid", "delivered"])
          .order("created_at", { ascending: false })
          .limit(8);
        rows = (retry.data ?? []).map((o) => ({ ...o, order_ref: null }));
      }
      sales = (rows ?? []) as unknown as Sale[];
    }
  } catch {
    return (
      <Shell title={`Bonjour, ${user.displayName}`}>
        <p className="mt-4 text-sm text-danger-text">
          Données indisponibles (clé service role manquante côté serveur ?).
        </p>
      </Shell>
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
  /* La langue est résolue AVANT les métriques : elles traduisent désormais
     leurs libellés, et `t()` est réservé au serveur (règle de lib/i18n.ts). */
  const lang = await getLang();

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

  // PR-Z3 (docs/33 §4) : la déclaration de zone (« Ki kote ou ye ? ») vit
  // dans le formulaire de profil. Libellés précalculés côté serveur — un
  // composant client ne lit pas les cookies de langue.
  const zonesPourForm = (isSupabaseConfigured() ? await getZonesActives() : []).map((z) => ({
    id: z.id,
    parent_id: z.parent_id,
    level: z.level,
    label: libelleZone(z, lang),
  }));
  const zoneLabels = {
    title: t(lang, "zone.form.title"),
    hint: t(lang, "zone.form.hint"),
    depatman: t(lang, "zone.level.depatman"),
    komin: t(lang, "zone.level.komin"),
    katye: t(lang, "zone.level.katye"),
    pwen: t(lang, "zone.form.pwen"),
    pwenPh: t(lang, "zone.form.pwen.ph"),
    all: t(lang, "zone.filter.all"),
    reqHint: t(lang, "zone.req.hint"),
    reqPh: t(lang, "zone.req.ph"),
    reqBtn: t(lang, "zone.req.btn"),
    reqOk: t(lang, "zone.req.ok"),
    reqDup: t(lang, "zone.req.dup"),
    reqErr: t(lang, "zone.req.err"),
  };

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

  return (
    <Shell title={`Bonjour, ${user.displayName}`}>
      {premierPas && (
        <VendeurPremierPas
          etape={premierPas.etape}
          labels={premierPas.labels}
          href={premierPas.href}
          lienBoutique={premierPas.lienBoutique}
        />
      )}

      {/* La seule métrique qui répond à « où en est mon argent ? » : pleine
          largeur, et SEULE à porter le dégradé de la marque. */}
      <div className="mt-8 rounded-2xl border border-line bg-surface-maroon/70 p-6">
        <p className="text-xs uppercase tracking-wide text-mist">
          {metriquePrincipale.label}
        </p>
        <p className="metric mt-1 text-4xl font-extrabold text-gradient sm:text-5xl">
          {metriquePrincipale.value}
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
            <p className="metric mt-1 text-lg font-bold leading-tight text-cloud sm:text-xl">
              {m.value}
            </p>
            {m.fenetre && <p className="mt-1 text-xs text-mist">{m.fenetre}</p>}
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-4 rounded-2xl border border-line bg-surface-brown/50 p-5">
        <p className="text-sm text-mist">
          Chaque vente confirmée est créditée <strong>en attente</strong> et
          devient <strong>disponible 7 jours plus tard</strong> (fenêtre
          anti-fraude / remboursement).
        </p>
        <PayoutRequest
          disponibleHtg={balance}
          hasPending={hasPendingPayout}
          labels={{
            open: "Demander un retrait",
            title: "Demande de retrait",
            intro: `Disponible : ${formatHTG(balance)}. Le versement est effectué par MonCash après vérification ; vous recevrez la référence du reçu.`,
            amount: "Montant à retirer (HTG)",
            submit: "Envoyer la demande",
            submitting: "Envoi…",
            cancel: "Annuler",
            pending: "Une demande de retrait est en cours de traitement. Vous serez réglé par MonCash.",
            networkError: "Réseau instable — réessayez.",
            success: "Demande enregistrée. Le montant est réservé en attendant le versement.",
          }}
        />
      </div>

      {/* Ventes récentes */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t(lang, "dashboard.sales.recent")}</h2>
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
                    <p className="truncate text-sm">{product?.title ?? "Produit"}</p>
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
      </section>

      {/* Mes produits */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mes produits</h2>
          <Link
            href="/vendre"
            className="text-sm text-mist transition hover:text-cloud"
          >
            + Publier
          </Link>
        </div>
        {products.length === 0 ? (
          <p className="mt-3 text-sm text-mist">
            Aucun produit.{" "}
            <Link href="/vendre" className="text-cloud underline">
              Publier le premier
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
                    className="grid h-12 w-12 place-items-center rounded-lg border border-line bg-ink/40 text-[10px] leading-tight text-mist"
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
                      décision que `app/vendre` : tout ce qui n'est pas publié
                      est « en revue », parce qu'un vendeur qui lisait
                      « Brouillon » croyait sa soumission échouée. */}
                  <span className="mt-0.5 block text-xs text-mist">
                    {p.status === "published"
                      ? t(lang, "status.published")
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

      {/* Codes promo (V-13) */}
      {products.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Codes promo</h2>
          <p className="mt-1 text-xs text-mist">
            Créez un code (ex. <span className="numeric text-accent">PROMO50</span>),
            partagez-le sur WhatsApp — la remise s&apos;applique automatiquement au
            paiement. Valable sur tous vos produits.
          </p>
          <div className="mt-4 rounded-2xl border border-line bg-surface/60 p-5">
            <ZabelieCouponManager coupons={coupons} />
          </div>
        </section>
      )}

      {/* Profil public */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t(lang, "dashboard.profile.public")}</h2>
          <Link
            href={hrefBoutique({ id: user.id, boutikSlug })}
            className="text-sm text-mist transition hover:text-cloud"
          >
            Voir mon profil →
          </Link>
        </div>
        <div className="mt-4 max-w-lg rounded-2xl border border-line bg-surface/60 p-5">
          <ProfileForm initial={profile} zones={zonesPourForm} zoneLabels={zoneLabels} />
        </div>
        {/* V-5 (docs/35) : coordonnées de livraison — table SÉPARÉE du profil
            public, masquée tant que 0076 n'est pas appliquée. */}
        {dossierKyc && (
          <div className="max-w-lg">
            <KycForm
              statut={dossierKyc.statut}
              deposes={dossierKyc.documents}
              noteAdmin={dossierKyc.noteAdmin}
              labels={{
                title: t(lang, "kyc.title"),
                why: t(lang, "kyc.why"),
                pending: t(lang, "kyc.pending"),
                approved: t(lang, "kyc.approved"),
                rejected: t(lang, "kyc.rejected"),
                cin: t(lang, "kyc.cin"),
                paspo: t(lang, "kyc.paspo"),
                selfie: t(lang, "kyc.selfie"),
                add: t(lang, "kyc.add"),
                sending: t(lang, "kyc.sending"),
                error: t(lang, "sell.galerie.error"),
                deposited: t(lang, "kyc.deposited"),
              }}
            />
          </div>
        )}
        {livInfo !== undefined && (
          <div className="max-w-lg">
            <DeliveryInfoForm
              initial={livInfo}
              labels={{
                title: t(lang, "profile.liv.title"),
                fullName: t(lang, "profile.liv.fullname"),
                phone: t(lang, "profile.liv.phone"),
                adres: t(lang, "profile.liv.adres"),
                hint: t(lang, "profile.liv.hint"),
                save: t(lang, "profile.liv.save"),
                saving: t(lang, "profile.liv.saving"),
                saved: t(lang, "profile.liv.saved"),
                error: t(lang, "sell.galerie.error"),
              }}
            />
          </div>
        )}
      </section>

      {/* Données & compte (RGPD) */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Mes données &amp; mon compte</h2>
        <p className="mt-1 text-sm text-mist">
          Téléchargez une copie de vos données ou supprimez votre compte. Voir
          notre{" "}
          <Link href="/confidentialite" className="text-cloud underline">
            politique de confidentialité
          </Link>
          .
        </p>
        <div className="mt-4 max-w-lg rounded-2xl border border-line bg-surface/60 p-5">
          <AccountActions />
        </div>
      </section>
    </Shell>
  );
}
