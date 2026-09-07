import Link from "next/link";
import { DepartmentIcon } from "@/components/department-icons";
import type { RayonMenu } from "@/lib/taxonomy";

/** Les univers restent accessibles même vides. Les catégories détaillées
 * s'ajoutent lorsqu'elles contiennent des offres. Défilement natif sans JS.
 */
export function CategoryChips({ rayons, labels, links, activeHref }: {
  rayons: RayonMenu[];
  labels: { all: string; more: string; nav: string };
  links: { href: string; label: string }[];
  activeHref?: string;
}) {
  const pleins = rayons.filter((r) => !r.vide);
  const desVides = rayons.some((r) => r.vide);
  const style = (href: string) => `inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition hover:border-on-chrome/60 active:scale-[0.97] ${activeHref === href ? "border-on-chrome bg-on-chrome/15 text-on-chrome" : "border-on-chrome/25 text-on-chrome"}`;
  return <nav aria-label={labels.nav} className="header-fold -mx-3 overflow-x-auto px-3 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    <ul className="flex items-center gap-2 whitespace-nowrap">
      <li><Link href="/catalogue" aria-current={activeHref === "/catalogue" ? "page" : undefined} className={style("/catalogue")}>{labels.all}</Link></li>
      {links.map((link) => <li key={link.href}><Link href={link.href} aria-current={activeHref === link.href ? "page" : undefined} className={style(link.href)}>{link.label}</Link></li>)}
      {pleins.map((r) => (
        <li key={r.slug}><Link href={r.href} className={style(r.href)}><DepartmentIcon slug={r.slug} className="h-4 w-4 stroke-on-chrome" />{r.label}</Link></li>
      ))}
      {desVides && (<li className="pl-1 text-xs text-on-chrome">{labels.more}</li>)}
    </ul>
  </nav>;
}
