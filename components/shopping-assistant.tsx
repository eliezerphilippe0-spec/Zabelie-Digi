"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AddToCart } from "@/components/add-to-cart";
import type { Lang } from "@/lib/i18n";
import type { ShoppingCopy } from "@/lib/shopping-ai-copy";
import type { ShoppingIntent, ShoppingResult } from "@/lib/shopping-ai";
import { isTrackedStockKind, isDownloadable, isProductKind, type ProductKind } from "@/lib/product-kind";

const EMPTY: ShoppingIntent = { query: "", need: "", budgetHtg: null, location: "", kind: null };
const FIELD = "mt-2 min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-cloud focus-visible:outline-2 focus-visible:outline-brand";

export function ShoppingAssistant({ lang, labels, conversational, sellerId, kindOptions }: {
  lang: Lang; labels: ShoppingCopy; conversational: boolean; sellerId?: string; kindOptions: { value: ProductKind; label: string }[];
}) {
  const [intent, setIntent] = useState<ShoppingIntent>(EMPTY);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ShoppingResult | null>(null);
  const [turns, setTurns] = useState<{ text: string; user: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const question = result?.question ?? (!intent.query ? "query" : intent.budgetHtg === null ? "budgetHtg" : !intent.need ? "need" : !intent.location ? "location" : null);
  const format = (n: number) => `${new Intl.NumberFormat(lang === "ht" ? "fr-HT" : lang).format(n)} HTG`;

  function edit(patch: Partial<ShoppingIntent>) { setIntent(old => ({ ...old, ...patch })); setResult(null); setError(""); }
  async function request(chat?: string) {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/ai/shopping", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, lang, sellerId, ...(chat ? { message: chat } : {}) }),
        signal: AbortSignal.timeout(30_000) });
      if (!response.ok) { setError(response.status === 429 ? labels.limit : labels.error); return; }
      const data = await response.json() as ShoppingResult;
      setIntent(data.intent); setResult(data);
      if (chat) {
        setTurns(old => [...old, { text: chat, user: true }, { text: data.question ? labels[data.question] : data.recommendations.length ? labels.results : labels.empty, user: false }].slice(-12));
        setMessage("");
      }
    } catch { setError(labels.error); }
    finally { sending.current = false; setBusy(false); }
  }

  return <div className="space-y-8">
    {conversational ? <section className="rounded-2xl border border-line bg-surface p-5" aria-label={labels.title}>
      <p className="mb-4 text-sm text-mist">{labels.privacy}</p>
      <div role="log" aria-live="polite" aria-relevant="additions" className="space-y-3">
        {turns.length ? turns.map((turn, i) => <p key={i} className={`max-w-prose rounded-xl p-3 ${turn.user ? "ml-auto bg-brand/10" : "bg-surface-2"}`}>{turn.text}</p>) : <p className="font-semibold">{labels.query}</p>}
      </div>
      <form onSubmit={e => { e.preventDefault(); if (message.trim()) void request(message.trim()); }} className="mt-5">
        <label htmlFor="shopping-message" className="text-sm font-semibold">{labels.message}</label>
        <textarea id="shopping-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={1000} required disabled={busy} rows={2} className={FIELD} />
        <button disabled={busy} className="mt-3 min-h-11 rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-60">{busy ? labels.searching : labels.send}</button>
      </form>
    </section> : <p className="text-sm text-mist">{labels.chatUnavailable}</p>}

    <section aria-labelledby="shopping-guided-title" className="rounded-2xl border border-line p-5">
      <h2 id="shopping-guided-title" className="text-lg font-bold">{labels.guided}</h2>
      <p className="mt-2 text-sm text-mist">{labels.guidedNote}</p>
      <form onSubmit={e => { e.preventDefault(); void request(); }} className="mt-5">
        <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-semibold">{labels.type}<select value={intent.kind ?? ""} onChange={e => edit({ kind: isProductKind(e.target.value) ? e.target.value : null })} className={FIELD}>
            <option value="">{labels.allTypes}</option>
            {kindOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>
          <label className="text-sm font-semibold">{labels.query}<input value={intent.query} onChange={e => edit({ query: e.target.value })} maxLength={160} required className={FIELD} /></label>
          <label className="text-sm font-semibold">{labels.budgetHtg}<input type="number" min={0} max={2147483647} step={1} value={intent.budgetHtg ?? ""} onChange={e => edit({ budgetHtg: e.target.value === "" ? null : Number(e.target.value) })} required className={FIELD} /></label>
          <label className="text-sm font-semibold">{labels.need}<input value={intent.need} onChange={e => edit({ need: e.target.value })} maxLength={300} required className={FIELD} /></label>
          <label className="text-sm font-semibold">{labels.location}<input value={intent.location} onChange={e => edit({ location: e.target.value })} maxLength={120} required className={FIELD} /></label>
        </fieldset>
        <div className="mt-5 flex flex-wrap gap-3">
          <button disabled={busy} className="min-h-11 rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-60">{busy ? labels.searching : labels.search}</button>
          <button type="button" disabled={busy} onClick={() => { setIntent(EMPTY); setResult(null); setTurns([]); setMessage(""); setError(""); }} className="min-h-11 rounded-xl border border-line px-5 py-3">{labels.reset}</button>
        </div>
      </form>
    </section>
    {error ? <p role="alert" className="text-danger-text">{error} <Link href="/catalogue" className="underline">{labels.catalog}</Link></p> : null}
    {result && question ? <p role="status">{labels[question]}</p> : null}
    {result && !question ? <section aria-labelledby="shopping-results-title" aria-live="polite">
      <h2 id="shopping-results-title" className="text-xl font-bold">{labels.results}</h2>
      {result.recommendations.length ? <>
        <p className="mt-3 text-sm text-mist">{labels.shortlist}</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {result.recommendations.map(p => <article key={p.id} className="min-w-0 rounded-2xl border border-line bg-surface p-5">
            <span className="text-sm font-bold text-accent">{p.position}</span>
            <p className="mt-2 text-xs text-mist">{kindOptions.find(option => option.value === p.kind)?.label}</p>
            <h3 className="mt-2 break-words text-lg font-bold">{p.title}</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="text-mist">{labels.price}</dt><dd className="text-lg font-bold text-accent">{isTrackedStockKind(p.kind) ? `${labels.from} ` : ""}{format(p.priceHtg)}</dd></div>
              <div><dt className="text-mist">{labels.difference}</dt><dd>{p.priceDifferenceHtg > 0 ? "+" : ""}{format(p.priceDifferenceHtg)}</dd></div>
              <div><dt className="text-mist">{labels.matches}</dt><dd>{p.matchedTerms.join(" · ")}</dd></div>
              <div><dt className="text-mist">{labels.reviews}</dt><dd>{p.ratingAverage === null ? labels.noReviews : `${p.ratingAverage}/5 (${p.ratingCount})`}</dd></div>
              <div><dt className="text-mist">{labels.sellerFacts}</dt><dd className="break-words">{p.description || labels.noDescription}</dd></div>
            </dl>
            <Link href={`${lang === "fr" || lang === "ht" ? `/${lang}` : ""}/produit/${encodeURIComponent(p.slug)}`} className="bouton mt-5 block min-h-11 rounded-xl bg-brand px-4 py-3 text-center font-semibold text-on-brand">{labels.choose}</Link>
            <p className="mt-2 text-xs text-mist">{labels.details}</p>
            {isDownloadable(p.kind) ? <p className="mt-2 text-xs text-mist">{labels.digitalNote}</p> : null}
            <AddToCart productId={p.id} labels={{ add: labels.add, adding: labels.adding, added: labels.added, seeCart: labels.seeCart, signin: labels.signin, error: labels.error }} />
          </article>)}
        </div>
        <p className="mt-5 text-sm text-mist">{labels.finalPrice}</p>
        <p className="mt-3 text-sm text-mist">{labels.handover}</p>
      </> : <p className="mt-4 text-mist">{labels.empty} <Link href="/catalogue" className="underline">{labels.catalog}</Link></p>}
    </section> : null}
  </div>;
}
