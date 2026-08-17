import Link from "next/link";
import type { EtapeVendeur } from "@/lib/vendeur-etape";

/**
 * L'ÉCRAN DU VENDEUR QUI N'A PAS ENCORE VENDU.
 *
 * ─── CE QU'IL REMPLACE ─────────────────────────────────────────────────────
 * Quatre zéros et « Aucune vente pour l'instant. » Honnête, et sans usage :
 * quelqu'un qui lit ça ne sait pas s'il a raté une étape ou s'il doit
 * attendre. Ici, chaque état dit CE QUI MANQUE et donne le geste suivant.
 *
 * ─── POURQUOI WHATSAPP, ET PAS UN BOUTON « PARTAGER » GÉNÉRIQUE ────────────
 * Sur ce terrain, la boutique ne se trouve pas par une recherche : elle
 * circule dans une conversation. Le lien `wa.me` sans numéro ouvre le
 * sélecteur de contacts — aucune configuration, aucun secret, et ça marche
 * même quand rien d'autre n'est branché. Le message part dans la LANGUE du
 * vendeur, pas dans celle du code.
 *
 * ─── AUCUNE CHAÎNE EN DUR ──────────────────────────────────────────────────
 * Tous les libellés arrivent en props, résolus par `t()` côté serveur (règle
 * de `lib/i18n.ts`). Le tableau de bord est en français partout ailleurs —
 * dette antérieure — mais ce nouvel écran ne la creuse pas : il est le
 * premier de cette page à parler les quatre langues, dont le kreyòl.
 */
export type PremierPasLabels = {
  titre: string;
  texte: string;
  cta: string;
  lien: string;
  message: string;
};

export function VendeurPremierPas({
  etape,
  labels,
  href,
  lienBoutique,
}: {
  etape: Exclude<EtapeVendeur, "en_vente">;
  labels: PremierPasLabels;
  /** Destination du bouton principal — /vendre, ou le brouillon à finir. */
  href: string;
  /** URL publique absolue de la boutique. Absente tant que rien n'est publié. */
  lienBoutique?: string;
}) {
  const partage = etape === "publie_sans_vente" && lienBoutique;
  const wa = partage
    ? `https://wa.me/?text=${encodeURIComponent(labels.message.replace("{lien}", lienBoutique))}`
    : null;

  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface-maroon/70 p-6">
      <h2 className="text-xl font-semibold">{labels.titre}</h2>
      <p className="mt-2 max-w-prose text-sm text-mist">{labels.texte}</p>

      {partage && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-mist">{labels.lien}</p>
          {/* `select-all` : sur un téléphone, une adresse qu'on doit
              sélectionner mot à mot ne se copie pas — elle se retape mal. */}
          <p className="numeric mt-1 break-all text-sm text-cloud select-all">
            {lienBoutique}
          </p>
        </div>
      )}

      {/* `min-h-11` : 44 px, la cible tactile du dépôt (RES-01). */}
      <Link
        href={wa ?? href}
        {...(wa ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-brand px-6 text-sm font-semibold text-on-brand transition hover:opacity-90"
      >
        {labels.cta}
      </Link>
    </section>
  );
}
