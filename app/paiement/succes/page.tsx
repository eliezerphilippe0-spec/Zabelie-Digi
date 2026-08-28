import Link from "next/link";
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
): Promise<{ ref: string | null; kind: string | null }> {
  const vide = { ref: null, kind: null };
  if (!isSupabaseConfigured()) return vide;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("orders")
      .select("order_ref, product:products(kind)")
      .eq("id", orderId)
      .maybeSingle();
    if (error && !isMissingColumn(error)) return vide;
    const ligne = data as
      | { order_ref?: string | null; product?: { kind?: string | null } | null }
      | null;
    return {
      ref: ligne?.order_ref ?? null,
      kind: ligne?.product?.kind ?? null,
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

export const metadata = { title: "Paiement réussi — Zabelie" };

export default async function SuccesPage({
  searchParams,
}: {
  searchParams: Promise<{ commande?: string }>;
}) {
  const [{ commande }, lang] = await Promise.all([searchParams, getLang()]);
  const { ref, kind } = commande
    ? await detailsCommande(commande)
    : { ref: null, kind: null };

  /* L'escrow ne se dit que là où il veut dire quelque chose : sur une
   * prestation ou un bien physique, l'acheteur vient de payer pour une chose
   * qu'il n'a PAS encore. C'est le moment exact où « le vendeur n'est payé
   * qu'après la remise » le rassure. Sur un fichier, la livraison est
   * immédiate : la même phrase y sèmerait un doute au lieu de le lever. */
  const montrerEscrow = isProductKind(kind) && !isDownloadable(kind, "paiement/succes");

  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-md px-5 py-24 text-center">
        <span className="reveal-mark mx-auto grid h-16 w-16 place-items-center rounded-full bg-success text-2xl text-ink">
          ✓
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
          <Link
            href="/mes-achats"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand"
          >
            {t(lang, "pay.ok.cta")}
          </Link>
          <Link
            href="/catalogue"
            className="inline-flex min-h-11 items-center justify-center text-sm text-mist hover:text-cloud"
          >
            {t(lang, "pay.back")}
          </Link>
        </div>
      </main>
    </div>
  );
}
