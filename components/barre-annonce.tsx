import Link from "next/link";
import { t, type I18nKey, type Lang } from "@/lib/i18n";
import { guideHref } from "@/lib/buying-guides";
import { BarreAnnoncePause } from "@/components/barre-annonce-pause";

/**
 * LA BARRE D'ANNONCE — le bandeau qui défile en haut de chaque page, sur le
 * modèle de celui de Jumia Côte d'Ivoire.
 *
 * Cinq règles, et chacune a une raison :
 *  1. Elle ne dit que ce qui est TENU. Chaque phrase reprend un libellé déjà
 *     validé ailleurs et gardé par les tests de promesse (`trust.2.b` sur la
 *     fiche, le panier et le succès ; `trust.c3`, `trust.c4` dans la barre de
 *     confiance ; le titre d'un guide qui existe ; l'offre « 0 HTG pour
 *     ouvrir »). Ajouter une annonce, c'est ajouter une ligne à `ANNONCES`
 *     avec des clés qui existent dans les quatre langues.
 *  2. Le défilement est en CSS seule (`transform`, calculé par la carte
 *     graphique) : rien ne tourne en JavaScript sur un Android d'entrée de
 *     gamme. Le seul script est le bouton pause.
 *  3. WCAG 2.2.2 (« Mettre en pause, arrêter, masquer ») : bouton pause, arrêt
 *     au survol et quand un lien reçoit le focus, et barre IMMOBILE quand le
 *     visiteur a demandé moins de mouvement.
 *  4. La boucle sans couture demande deux copies : la seconde est
 *     `aria-hidden` et ses liens sortent de la tabulation, sinon un lecteur
 *     d'écran lirait tout deux fois.
 *  5. Elle porte `.header-fold` : dès que l'en-tête se replie au défilement,
 *     elle disparaît et ne prend plus de place à l'écran.
 */
type Annonce = { cles: I18nKey[]; href?: (lang: Lang) => string };

const ANNONCES: Annonce[] = [
  { cles: ["trust.2.b"], href: () => "/aide#comment" },
  { cles: ["guides.diaspora.title"], href: (lang) => guideHref(lang, "acheter-pour-un-proche") },
  { cles: ["trust.c3"] },
  { cles: ["rail.shop.t", "rail.shop.free"], href: () => "/ouvrir-ma-boutique" },
  { cles: ["trust.c4"], href: () => "/aide" },
];

/** Les annonces d'une langue, texte prêt à afficher. */
export function annoncesDe(lang: Lang): { texte: string; href?: string }[] {
  return ANNONCES.map((a) => ({ texte: a.cles.map((c) => t(lang, c)).join(" : "), href: a.href?.(lang) }));
}

/** Environ 35 px par seconde quelle que soit la langue : la durée suit la longueur du texte. */
export function dureeDefilement(annonces: { texte: string }[]): number {
  const caracteres = annonces.reduce((n, a) => n + a.texte.length, 0);
  return Math.max(24, Math.round(caracteres * 0.2));
}

export function BarreAnnonce({ lang }: { lang: Lang }) {
  const annonces = annoncesDe(lang);
  const groupe = (copie: boolean) => (
    <ul className="annonce-groupe" aria-hidden={copie || undefined}>
      {annonces.map((a) => (
        <li key={a.texte} className="annonce-item">
          {a.href ? (
            <Link href={a.href} tabIndex={copie ? -1 : undefined} className="annonce-lien">
              {a.texte}
            </Link>
          ) : (
            <span>{a.texte}</span>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <div
      className="annonce header-fold"
      role="marquee"
      aria-label={t(lang, "annonce.region")}
      style={{ ["--annonce-duree" as string]: `${dureeDefilement(annonces)}s` }}
    >
      <div className="annonce-fenetre">
        <div className="annonce-piste">
          {groupe(false)}
          {groupe(true)}
        </div>
      </div>
      <BarreAnnoncePause pause={t(lang, "annonce.pause")} reprendre={t(lang, "annonce.reprendre")} />
    </div>
  );
}
