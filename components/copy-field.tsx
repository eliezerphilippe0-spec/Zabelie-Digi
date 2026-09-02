"use client";

import { useState } from "react";

/**
 * BL-120 (Wise/Coinbase — chaque instruction de virement a son bouton copier) :
 * un mémo Zelle retapé à la main = risque d'écart de réconciliation. Repli
 * `window.prompt` pour les vieux Android (même pattern que share-buttons).
 */
export function CopyField({
  value,
  label,
  copiedLabel,
}: {
  value: string;
  label: string; // t("common.copy")
  copiedLabel: string; // t("common.copied")
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(label, value);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${label} : ${value}`}
      className="ml-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-mist transition hover:border-accent hover:text-cloud"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
