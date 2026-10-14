import type { Metadata } from "next";
import { getLang } from "@/lib/i18n-server";
import { t, type Lang } from "@/lib/i18n";
import { metaLangue } from "@/lib/langue-url";
import { isSupabaseConfigured } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";
import { lireTauxCommission, type TauxCommission } from "@/lib/commission-config";
import { RATE_BPS, ROUNDING_IN_FORCE } from "@/lib/commission";
import { readSellerPricing } from "@/lib/seller-pricing-server";
import type { SellerPricing } from "@/lib/seller-pricing";
import { SellerPricingPanel } from "@/components/seller-pricing-panel";
import { EXEMPLE_HTG, formaterTaux } from "@/components/commission-annonce";
import { MATURATION_DAYS } from "@/lib/escrow";
import { getMonCashAvailability, MONCASH_AVAILABILITY_LABELS } from "@/lib/payment-availability";
import { isStripeEnabled } from "@/lib/stripe-config";
import { POLICY_PATH } from "@/lib/policy";
import { signalerConfigAbsente } from "@/lib/diagnostic";
import { EtalPage, type EtalLabels, type EtalTarifs } from "@/components/etal-page";
import "./etal.css";

/**
 * « OUVRIR MA BOUTIQUE » — la page vendeur à défilement (V-23, 2026-10-14).
 *
 * Plan, décisions et règles tenues : `docs/ouvrir-ma-boutique/PLAN.md`.
 *
 * Cette page serveur ne fait que LIRE et TRADUIRE. Chaque chiffre affiché vient
 * de là où le reste du site le lit :
 *   • le taux : `lireTauxCommission()` (0054/0066), comme `/vendre` ;
 *   • le barème de lancement : `readSellerPricing()`. Quand il est activé, le
 *     taux simple n'est plus la vérité, et la page montre le panneau officiel
 *     de `/vendre` au lieu de son calcul ;
 *   • J+7 : `MATURATION_DAYS` ; l'arrondi : `ROUNDING_IN_FORCE` ;
 *   • MonCash et la carte : l'état réel de configuration, comme le pied de page.
 * Une lecture qui échoue n'invente pas de frais : la page renvoie à `/vendre`.
 */

const CHEMIN = "/ouvrir-ma-boutique";
const VENDRE = "/vendre";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: t(lang, "etal.meta.title"),
    description: t(lang, "etal.meta.description"),
    ...metaLangue(CHEMIN, lang),
  };
}

type Lecture =
  | { mode: "taux"; taux: TauxCommission }
  | { mode: "bareme"; bareme: SellerPricing }
  | { mode: "indisponible" };

async function lireTarifs(): Promise<Lecture> {
  if (!isSupabaseConfigured()) {
    // Même repli que `/vendre` : la constante compilée, identique au
    // `coalesce` de la SQL. Signalé, parce qu'en production c'est un incident.
    signalerConfigAbsente("supabase", { ecran: CHEMIN });
    return { mode: "taux", taux: { ...RATE_BPS } };
  }
  const supabase = await createClient();
  const { taux } = await lireTauxCommission(supabase, (c) => console.error("[commission] taux de repli utilisé", c));
  try {
    const bareme = await readSellerPricing(supabase);
    return bareme ? { mode: "bareme", bareme } : { mode: "taux", taux };
  } catch (e) {
    // `readSellerPricing` refuse d'inventer un frais sur une panne réseau ; ici
    // non plus : aucun chiffre, un renvoi vers `/vendre`.
    console.error("[ouvrir-ma-boutique] barème illisible", e instanceof Error ? e.message : e);
    return { mode: "indisponible" };
  }
}

function libelles(lang: Lang, lecture: Lecture): EtalLabels {
  const moncash = getMonCashAvailability();
  const paiement = moncash === "production" ? null : t(lang, MONCASH_AVAILABILITY_LABELS[moncash]);
  const note: string[] = [t(lang, "etal.argent.gratuit")];
  if (lecture.mode === "taux") {
    note.push(t(lang, "etal.argent.taux", { taux: formaterTaux(lecture.taux.standard), palier: formaterTaux(lecture.taux.elite) }));
    if (ROUNDING_IN_FORCE === "floor") note.push(t(lang, "etal.argent.arrondi"));
  }
  note.push(t(lang, "etal.argent.fichier"));
  if (paiement) note.push(paiement);

  return {
    evitement: t(lang, "a11y.skip"),
    folioRetour: t(lang, "etal.folio.retour"),
    chapitres: {
      titre: "",
      faire: t(lang, "etal.ch.faire"),
      main: t(lang, "etal.ch.main"),
      etal: t(lang, "etal.ch.etal"),
      argent: t(lang, "etal.ch.argent"),
      loin: t(lang, "etal.ch.loin"),
      colophon: t(lang, "etal.ch.colophon"),
    },
    devise: t(lang, "home.kicker"),
    titre: t(lang, "launch.title"),
    nomLabel: t(lang, "etal.nom.label"),
    nomPlaceholder: t(lang, "etal.nom.placeholder"),
    nomDefaut: t(lang, "etal.nom.defaut"),
    nomDefautMilieu: t(lang, "etal.nom.defautMilieu"),
    cta: t(lang, "launch.cta"),
    faire: {
      titre: t(lang, "etal.faire.titre"),
      lede: t(lang, "launch.body"),
      familles: [
        { t: t(lang, "etal.faire.objet.t"), d: t(lang, "etal.faire.objet.d") },
        { t: t(lang, "etal.faire.fichier.t"), d: t(lang, "etal.faire.fichier.d") },
        { t: t(lang, "etal.faire.service.t"), d: t(lang, "etal.faire.service.d") },
      ],
    },
    main: {
      titre: t(lang, "etal.main.titre"),
      lignes: [t(lang, "etal.main.l1"), t(lang, "etal.main.l2"), t(lang, "etal.main.l3")],
      seul: t(lang, "etal.main.seul"),
    },
    etal: {
      titre: t(lang, "etal.etal.titre"),
      lede: t(lang, "etal.etal.lede"),
      nomMini: t(lang, "etal.etal.nomMini"),
      fig: t(lang, "etal.etal.fig"),
      fin: t(lang, "etal.etal.fin"),
    },
    argent: {
      titre: t(lang, "etal.argent.titre"),
      calcul: t(lang, "etal.argent.calcul"),
      prix: t(lang, "etal.argent.prix"),
      etapes: [
        { texte: t(lang, "etal.argent.e1"), etat: t(lang, "etal.argent.s1") },
        { texte: t(lang, "etal.argent.e2"), etat: t(lang, "etal.argent.s2") },
        { texte: t(lang, "etal.argent.e3"), etat: t(lang, "etal.argent.s3") },
        { texte: t(lang, "etal.argent.e4", { jours: String(MATURATION_DAYS) }), etat: t(lang, "etal.argent.s4") },
      ],
      note,
      voirFrais: t(lang, "etal.argent.voirFrais"),
    },
    loin: {
      titre: t(lang, "etal.loin.titre"),
      lede: t(lang, "etal.loin.lede"),
      carte: t(lang, "etal.loin.carte", {
        carte: t(lang, "footer.pay.card"),
        etat: t(lang, isStripeEnabled() ? "footer.pay.active" : "footer.pay.soon"),
      }),
    },
    colo: {
      titre: t(lang, "etal.colo.titre"),
      cta: t(lang, "etal.colo.cta"),
      petit: [t(lang, "etal.colo.role"), ...(paiement ? [paiement] : []), t(lang, "etal.colo.vie")],
      aide: t(lang, "etal.colo.aide"),
      marque: `${t(lang, "etal.colo.marque")} ${t(lang, "footer.madeFor")}`,
      liens: [
        { href: "/confidentialite", label: t(lang, "footer.privacy") },
        { href: "/conditions", label: t(lang, "footer.terms") },
        { href: POLICY_PATH, label: t(lang, "policy.link") },
      ],
    },
  };
}

export default async function OuvrirMaBoutiquePage() {
  const lang = await getLang();
  const lecture = await lireTarifs();
  const tarifs: EtalTarifs =
    lecture.mode === "taux" ? { mode: "taux", bps: lecture.taux.standard, exemple: EXEMPLE_HTG } : { mode: lecture.mode };

  return (
    <EtalPage
      labels={libelles(lang, lecture)}
      tarifs={tarifs}
      bareme={lecture.mode === "bareme" ? <SellerPricingPanel pricing={lecture.bareme} lang={lang} /> : undefined}
      ctaHref={VENDRE}
      aideLiens={[{ href: "/aide", label: t(lang, "footer.contact") }]}
    />
  );
}
