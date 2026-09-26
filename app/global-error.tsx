"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LANG_COOKIE, isLang, type Lang } from "@/lib/i18n";
import { errLabels } from "@/lib/i18n-erreur";
import { estEchecDeChargement, rechargerUneFois, stockageSession } from "@/lib/rechargement-chunk";

/**
 * Frontière d'erreur de la RACINE — elle remplace `app/layout.tsx` quand c'est
 * lui qui casse, par exemple quand son propre fichier JS n'a pas pu être chargé
 * (mesuré le 2026-09-26 sur zabelie.com : `app/layout-….js`). Sans elle, Next
 * affichait son écran par défaut, en anglais. Elle doit porter `<html>` et
 * `<body>`, et ne peut compter sur aucune feuille de style : styles en ligne.
 * Mêmes libellés et même logique que `app/error.tsx`.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [lang, setLang] = useState<Lang>("fr");
  useEffect(() => {
    const raw = document.cookie.split("; ").find((c) => c.startsWith(`${LANG_COOKIE}=`))?.split("=")[1];
    if (isLang(raw)) setLang(raw);
  }, []);
  useEffect(() => {
    console.error("[zabelie] frontière d'erreur racine", error.digest ?? "", error);
  }, [error]);
  const echecDeChargement = estEchecDeChargement(error);
  useEffect(() => {
    if (echecDeChargement) rechargerUneFois(stockageSession(), Date.now(), () => window.location.reload());
  }, [echecDeChargement]);

  const l = errLabels(lang);
  return (
    <html lang={lang}>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#faf8f5", color: "#17123a" }}>
        <main id="main" style={{ maxWidth: 420, margin: "0 auto", padding: "96px 20px", textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>{l.title}</h1>
          <p style={{ marginTop: 12, color: "#5c5a57", lineHeight: 1.5 }}>{l.body}</p>
          {error.digest && <p style={{ marginTop: 8, fontFamily: "monospace", fontSize: 12, color: "#5c5a57" }}>{error.digest}</p>}
          <button
            type="button"
            onClick={echecDeChargement ? () => window.location.reload() : reset}
            style={{ marginTop: 32, minHeight: 44, padding: "12px 24px", borderRadius: 12, border: 0, background: "#e0580f", color: "#17123a", fontSize: 14, fontWeight: 700 }}
          >
            {l.retry}
          </button>
          <p style={{ marginTop: 16 }}>
            <Link href="/" style={{ display: "inline-block", minHeight: 44, lineHeight: "44px", color: "#17123a" }}>{l.home}</Link>
          </p>
        </main>
      </body>
    </html>
  );
}
