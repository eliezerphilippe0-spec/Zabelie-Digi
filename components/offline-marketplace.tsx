"use client";
import { useEffect, useState } from "react";
import { OFFLINE_KEY, readOfflineListings, rememberListing, type OfflineListing } from "@/lib/marketplace-offline";
import type { MarketplaceCopy } from "@/lib/marketplace-copy";

export function RememberPublicListing({ slug, title, priceHTG }: Omit<OfflineListing, "viewedAt">) {
  useEffect(() => {
    try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(rememberListing(localStorage.getItem(OFFLINE_KEY), { slug, title, priceHTG }))); } catch { /* Storage may be unavailable. Buying still works. */ }
  }, [slug, title, priceHTG]);
  return null;
}

export function OfflineMarketplace({ labels, locale }: { labels: MarketplaceCopy; locale: string }) {
  const [items, setItems] = useState<OfflineListing[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    try {
      const saved = readOfflineListings(localStorage.getItem(OFFLINE_KEY));
      // Remove expired and unrecognised fields, even when no new listing is viewed.
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(saved));
      // Browser-only storage is loaded after hydration, never during SSR.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems(saved);
    } catch { /* Private browsing / storage denied. */ }
  }, []);
  const matches = items.filter(p => p.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section className="mt-8 text-left" aria-labelledby="offline-offers">
    <h2 id="offline-offers" className="text-xl font-bold">{labels.offlineTitle}</h2>
    <p className="mt-3 text-sm text-mist">{labels.offlineHint}</p>
    {items.length > 0 && <label className="mt-4 block text-sm">{labels.search}<input type="search" value={query} onChange={e => setQuery(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-surface p-3"/></label>}
    <ul className="mt-4 space-y-3">{matches.map(p => <li key={p.slug} className="rounded-xl border border-line p-4">
      <h3 className="font-semibold">{p.title}</h3><p className="numeric mt-2">{new Intl.NumberFormat(locale).format(p.priceHTG)} HTG</p>
      <p className="mt-2 text-xs text-mist">{labels.viewed} {new Date(p.viewedAt).toLocaleString(locale)}</p>
      {/* A full navigation always revalidates with the server. No cached RSC or checkout URL. */}
      <a href={`/produit/${encodeURIComponent(p.slug)}`} className="mt-3 inline-flex min-h-11 items-center text-sm underline">{labels.refresh}</a>
    </li>)}</ul>
    {items.length === 0 && <p className="mt-4 text-sm text-mist">{labels.empty}</p>}
    {items.length > 0 && <button type="button" className="mt-4 min-h-11 text-sm underline" onClick={() => { try { localStorage.removeItem(OFFLINE_KEY); } catch {} setItems([]); }}>{labels.erase}</button>}
  </section>;
}
