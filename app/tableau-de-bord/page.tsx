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
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
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
          className="mt-4 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
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
      .select("id, slug, title, status, sales_count")
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

  const stats = [
    { label: "Disponible", value: formatHTG(balance) },
    {
      label: nextMaturity
        ? `En attente · débloqué le ${new Date(nextMaturity).toLocaleDateString("fr-HT")}`
        : "En attente (J+7)",
      value: formatHTG(pending),
    },
    // Montant net cumulé d'abord (standard Chariow), le compte en contexte.
    {
      label: `Revenus nets · ${totalSales} vente${totalSales > 1 ? "s" : ""}`,
      value: netComplet ? formatHTG(netTotal) : `≥ ${formatHTG(netTotal)}`,
    },
    { label: "Produits publiés", value: String(published) },
  ];

  // PR-Z3 (docs/33 §4) : la déclaration de zone (« Ki kote ou ye ? ») vit
  // dans le formulaire de profil. Libellés précalculés côté serveur — un
  // composant client ne lit pas les cookies de langue.
  const lang = await getLang();
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

  return (
    <Shell title={`Bonjour, ${user.displayName}`}>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-line bg-surface-maroon/70 p-5"
          >
            <p className="metric text-2xl font-extrabold text-gradient">{s.value}</p>
            <p className="mt-1 text-xs text-mist">{s.label}</p>
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
        <h2 className="text-lg font-semibold">Ventes récentes</h2>
        {sales.length === 0 ? (
          <p className="mt-3 text-sm text-mist">Aucune vente pour l'instant.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {sales.map((o) => {
              const product = Array.isArray(o.product) ? o.product[0] : o.product;
              return (
                <li
                  key={o.id}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm"
                >
                  <span>
                    {product?.title ?? "Produit"}
                    {/* Le numéro que le vendeur cite à l'acheteur — WhatsApp. */}
                    {o.order_ref && (
                      <span className="numeric ml-2 text-xs text-mist select-all">
                        {o.order_ref}
                      </span>
                    )}
                  </span>
                  <span className="text-mist">
                    {formatHTG(o.amount_htg)} ·{" "}
                    {new Date(o.created_at).toLocaleDateString("fr-HT")}
                  </span>
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
            {products.map((p) => (
              <li
                key={p.slug}
                className="flex items-center justify-between rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm"
              >
                <Link href={`/produit/${p.slug}`} className="hover:text-cloud">
                  {p.title}
                </Link>
                <span className="text-xs text-mist">
                  {p.sales_count} ventes · {p.status}
                </span>
              </li>
            ))}
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
          <h2 className="text-lg font-semibold">Mon profil public</h2>
          <Link
            href={`/createur/${user.id}`}
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
