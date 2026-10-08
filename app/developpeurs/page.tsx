import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { getLang } from "@/lib/i18n-server";
import { metaLangue } from "@/lib/langue-url";
import { apiDocsCopy } from "@/lib/api/v1/docs-copy";
import { PUBLIC_OPERATIONS } from "@/lib/api/v1/openapi";
import { SELLER_OPERATIONS } from "@/lib/api/v1/seller-openapi";

const META = {
  title: "API Zabelie",
  description:
    "API publique de Zabelie : lecture sans clé des produits, catégories, vendeurs, avis et stock de la marketplace haïtienne. Contrat OpenAPI disponible.",
};

// Canonique et hreflang selon la langue servie (/ht/, /fr/ — lib/langue-url.ts).
export async function generateMetadata() {
  return { ...META, ...metaLangue("/developpeurs", await getLang()) };
}
const example = `const response = await fetch("https://zabelie.com/api/v1/search_products", {
  method: "POST",
  credentials: "omit",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ limit: 5 })
});
const result = await response.json();
if (!response.ok) throw new Error(result.code);
console.log(result.results, result.nextCursor);`;
// Exemples SANS prose : le code se lit dans toutes les langues ; les
// explications sont dans les paragraphes traduits (docs-copy, fr/ht/en/es).
const exempleVendeur = `const response = await fetch("https://zabelie.com/api/v1/seller/seller_products", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Accept-Language": "ht",
    Authorization: \`Bearer \${apiKey}\`
  },
  body: JSON.stringify({ limit: 20, status: "published" })
});
const result = await response.json();
if (!response.ok) throw new Error(result.code);
for (const p of result.results) console.log(p.untrusted.title, p.priceHtg, p.url);`;
const exempleSignature = `import { createHmac, timingSafeEqual } from "node:crypto";

function isValidZabelieWebhook(secret, header, rawBody) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(t + "." + rawBody).digest();
  const received = Buffer.from(v1, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}`;
export default async function DevelopersPage() {
  const lang = await getLang();
  const c = apiDocsCopy(lang);
  return <div className="bg-grain min-h-dvh"><SiteNav/><main id="main" className="mx-auto max-w-4xl px-5 py-12">
    <h1 className="text-3xl font-black">{c.title}</h1><p className="mt-3 text-lg">{c.intro}</p><p className="mt-4 text-mist">{c.scope}</p>
    <Link href={`/api/v1/openapi.json?lang=${lang}`} className="mt-6 inline-block font-semibold underline">{c.contract}</Link>
    <h2 id="api-exemple" className="mt-10 text-xl font-bold">{c.start}</h2>
    {/* Défilant à 360 px : focusable et nommé, sinon le clavier ne peut pas
        faire défiler le code (axe, scrollable-region-focusable). */}
    <pre tabIndex={0} role="region" aria-labelledby="api-exemple" className="mt-4 max-w-full overflow-x-auto rounded-xl border border-line p-4 text-sm"><code>{example}</code></pre>
    <h2 className="mt-10 text-xl font-bold">{c.endpoints}</h2>
    <ul className="mt-4 space-y-2">{PUBLIC_OPERATIONS.map(([name]) => <li key={name}><code className="break-all text-sm">POST /api/v1/{name}</code></li>)}</ul>
    <h2 className="mt-10 text-xl font-bold">{c.limits}</h2>
    {[c.details,c.quota,c.access,c.empty,c.texts,c.delivery].map(text => <p key={text} className="mt-4 text-sm leading-relaxed text-mist">{text}</p>)}
    <h2 id="api-vendeur" className="mt-14 scroll-mt-24 text-2xl font-bold">{c.sellerTitle}</h2>
    <p className="mt-3">{c.sellerIntro}</p>
    <p className="mt-4 text-sm leading-relaxed text-mist">{c.sellerAuth}</p>
    <Link href={`/api/v1/seller/openapi.json?lang=${lang}`} className="mt-4 inline-block font-semibold underline">{c.sellerContract}</Link>
    <pre tabIndex={0} role="region" aria-labelledby="api-vendeur" className="mt-4 max-w-full overflow-x-auto rounded-xl border border-line p-4 text-sm"><code>{exempleVendeur}</code></pre>
    <ul className="mt-4 space-y-2">{SELLER_OPERATIONS.map(([name, e]) => <li key={name}><code className="break-all text-sm">POST /api/v1/seller/{name}</code> <span className="text-xs text-mist">({e.scope})</span></li>)}</ul>
    <p className="mt-4 text-sm leading-relaxed text-mist">{c.sellerPrivacy}</p>
    <p id="api-webhooks" className="mt-6 text-sm leading-relaxed">{c.sellerWebhooks}</p>
    <pre tabIndex={0} role="region" aria-labelledby="api-webhooks" className="mt-4 max-w-full overflow-x-auto rounded-xl border border-line p-4 text-sm"><code>{exempleSignature}</code></pre>
  </main><SiteFooter/></div>;
}
