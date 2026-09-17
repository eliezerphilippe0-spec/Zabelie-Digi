"use client";
import { useEffect, useState } from "react";
import type { MarketplaceCopy } from "@/lib/marketplace-copy";

export function ConnectivityNotice({ labels }: { labels: Pick<MarketplaceCopy, "disconnected" | "reconnect" | "offlineLink" | "resume"> }) {
  const [state, setState] = useState<"online" | "offline" | "restored">("online");
  useEffect(() => {
    const offline = () => setState("offline");
    const online = () => setState(s => s === "offline" ? "restored" : s);
    if (!navigator.onLine) offline();
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);
  if (state === "online") return null;
  return <aside role="status" className="border-b border-line bg-surface px-5 py-3 text-sm">
    <p>{state === "offline" ? labels.disconnected : labels.reconnect}</p>
    <a className="inline-flex min-h-11 items-center underline" href={state === "offline" ? "/hors-ligne" : "/mes-achats"}>{state === "offline" ? labels.offlineLink : labels.resume}</a>
  </aside>;
}
