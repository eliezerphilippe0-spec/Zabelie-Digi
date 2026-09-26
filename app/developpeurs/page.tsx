import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { getLang } from "@/lib/i18n-server";
import { apiDocsCopy } from "@/lib/api/v1/docs-copy";
import { PUBLIC_OPERATIONS } from "@/lib/api/v1/openapi";

export const metadata = {
  title: "API Zabelie",
  description:
    "API publique de Zabelie : lecture sans clé des produits, catégories, vendeurs, avis et stock de la marketplace haïtienne. Contrat OpenAPI disponible.",
  alternates: { canonical: "/developpeurs" },
};
const example = `const response = await fetch("https://zabelie.com/api/v1/search_products", {
  method: "POST",
  credentials: "omit",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ limit: 5 })
});
const result = await response.json();
if (!response.ok) throw new Error(result.code);
console.log(result.results, result.nextCursor);`;
export default async function DevelopersPage() {
  const c = apiDocsCopy(await getLang());
  return <div className="bg-grain min-h-dvh"><SiteNav/><main id="main" className="mx-auto max-w-4xl px-5 py-12">
    <h1 className="text-3xl font-black">{c.title}</h1><p className="mt-3 text-lg">{c.intro}</p><p className="mt-4 text-mist">{c.scope}</p>
    <Link href="/api/v1/openapi.json" className="mt-6 inline-block font-semibold underline">{c.contract}</Link>
    <h2 className="mt-10 text-xl font-bold">{c.start}</h2>
    <pre className="mt-4 max-w-full overflow-x-auto rounded-xl border border-line p-4 text-sm"><code>{example}</code></pre>
    <h2 className="mt-10 text-xl font-bold">{c.endpoints}</h2>
    <ul className="mt-4 space-y-2">{PUBLIC_OPERATIONS.map(([name]) => <li key={name}><code className="break-all text-sm">POST /api/v1/{name}</code></li>)}</ul>
    <h2 className="mt-10 text-xl font-bold">{c.limits}</h2>
    {[c.details,c.quota,c.access,c.empty,c.texts,c.delivery].map(text => <p key={text} className="mt-4 text-sm leading-relaxed text-mist">{text}</p>)}
  </main><SiteFooter/></div>;
}
