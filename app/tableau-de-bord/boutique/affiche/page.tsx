import Link from "next/link";
import { BoutonImprimer } from "@/components/bouton-imprimer";
import { createAdminClient } from "@/lib/supabase/admin";
import { vendeurOuRedirection } from "@/lib/vendeur-acces";
import { qrBoutique } from "@/lib/boutique-qr";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import "./affiche.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Affiche — Zabelie", robots: { index: false, follow: false } };

/**
 * /tableau-de-bord/boutique/affiche — l'affiche A5 à coller au comptoir
 * (docs/75 §5.A, PR-Z1). Même garde que les autres pages vendeur : un compte
 * suspendu est renvoyé vers l'accueil du tableau, qui dit pourquoi, et
 * n'obtient donc jamais d'affiche.
 */
export default async function AffichePage() {
  const user = await vendeurOuRedirection("/tableau-de-bord/boutique/affiche");
  const lang = await getLang();
  const { data } = await createAdminClient()
    .from("profiles")
    .select("display_name, boutik_slug")
    .eq("id", user.id)
    .maybeSingle();
  const row = data as { display_name?: string | null; boutik_slug?: string | null } | null;
  const nom = row?.display_name || user.displayName;
  const qr = qrBoutique({ id: user.id, boutikSlug: row?.boutik_slug ?? null });

  return (
    <main id="main" className="min-h-dvh bg-surface px-4 py-6">
      <div className="mx-auto flex max-w-md flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/tableau-de-bord/boutique#qr" className="inline-flex min-h-11 items-center text-sm text-cloud underline">
          {t(lang, "vendeur.affiche.retour")}
        </Link>
        <BoutonImprimer label={t(lang, "vendeur.affiche.imprimer")} />
      </div>
      <article className="affiche mx-auto mt-6 flex max-w-md flex-col items-center rounded-2xl border border-line p-8 text-center">
        <p className="font-heading text-2xl font-semibold break-words">{nom}</p>
        <h1 className="mt-2 text-lg">{t(lang, "vendeur.affiche.titre")}</h1>
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG en data: généré côté serveur, rien à optimiser */}
        <img src={qr.dataUrl} alt={t(lang, "vendeur.qr.alt", { url: qr.url })} width={288} height={288} className="mt-6 size-72" />
        <p className="affiche-url mt-6 text-base font-semibold">{qr.url.replace(/^https?:\/\//, "")}</p>
      </article>
    </main>
  );
}
