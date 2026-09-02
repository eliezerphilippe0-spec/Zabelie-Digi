import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { MenuBadges } from "@/components/admin/menu-badges";
import { OnlineStatus } from "@/components/admin/online-status";
import { IdentityBlock } from "@/components/admin/identity-block";

/**
 * Coquille UNIQUE des pages admin.
 *
 * Avant ce lot, `Shell` vivait en TROIS copies divergentes (admin/page.tsx,
 * geo, paiements-vendeurs — titres tantôt font-extrabold tantôt font-black,
 * écran « accès refusé » réécrit à la main). L'invariant anti-duplication du
 * lot s'applique à lui-même : on unifie d'abord, on décore ensuite.
 *
 * [DÉCISION AGENT — à valider] La maquette ancrait bloc identité et badges
 * dans « le sidebar admin » — qui n'existe pas : l'admin n'a ni layout ni
 * sidebar, trois pages seulement. Plutôt que construire un sidebar (la
 * maquette l'interdit : « pas de refonte du sidebar si non déjà présent »),
 * les deux vivent dans une BARRE d'en-tête admin : navigation + badges à
 * gauche, statut réseau + identité à droite. Même information, structure
 * existante respectée.
 *
 * La date sous le titre : heure de PORT-AU-PRINCE, explicitement — le
 * serveur tourne en UTC et le back-office est lu depuis Haïti. Locale fr-HT,
 * celle de toutes les dates admin existantes.
 */
function DatePage() {
  const quand = new Date();
  const date = new Intl.DateTimeFormat("fr-HT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Port-au-Prince",
  }).format(quand);
  const heure = new Intl.DateTimeFormat("fr-HT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Port-au-Prince",
  }).format(quand);
  return (
    <p className="mt-1 text-sm text-mist">
      {date.charAt(0).toUpperCase() + date.slice(1)} · {heure}
    </p>
  );
}

export function AdminShell({
  title,
  actif,
  userName,
  children,
}: {
  title: string;
  /** Chemin de l'entrée de menu active, ex. "/admin". */
  actif: string;
  /** Nom de l'admin connecté — absent sur les écrans refus/démo. */
  userName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-5xl px-5 py-10">
        {userName && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/40 px-4 py-2.5">
            <MenuBadges actif={actif} />
            <div className="flex items-center gap-4">
              <OnlineStatus />
              <IdentityBlock name={userName} />
            </div>
          </div>
        )}
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <DatePage />
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
