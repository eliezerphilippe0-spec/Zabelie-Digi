"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = ["draft", "published", "archived"] as const;

/**
 * Message de repli — utilisé UNIQUEMENT quand le serveur n'en fournit aucun.
 *
 * ⚠️ Il ne doit jamais masquer un message du serveur : celui-ci sait POURQUOI
 * il refuse (« ce produit est un fichier et n'a aucun livrable téléversé… »),
 * l'écran ne le sait pas. Un repli qui gagne est un repli qui ment.
 */
const REFUS_SANS_MOTIF =
  "Changement refusé par le serveur, sans motif transmis.";

export function AdminProductRow({
  id,
  title,
  seller,
  status,
}: {
  id: string;
  title: string;
  seller: string;
  status: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function change(next: string) {
    const prev = value;
    setValue(next);
    setSaving(true);
    setErreur(null);
    try {
      const res = await fetch("/api/admin/product-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: id, status: next }),
      });

      if (!res.ok) {
        /* ⚠️ LE REFUS SE DIT, IL NE S'AVALE PAS.
         *
         * Avant le 2026-08-21, cette branche faisait `setValue(prev)` et RIEN
         * d'autre. Le sélecteur revenait à sa valeur précédente, aucun message
         * n'apparaissait, et le porteur l'a vécu ainsi : « quand je clique sur
         * published, cela ne reste pas ».
         *
         * Or le serveur écrivait déjà un motif complet et utile — « Ce produit
         * est un fichier et n'a aucun livrable téléversé. Publier reviendrait à
         * le mettre en vente sans rien à remettre. » — et cet écran le jetait.
         *
         * C'est le motif que le dépôt traque partout : l'échec se présente
         * comme une ABSENCE. Rien ne casse, rien ne s'affiche, et l'utilisateur
         * conclut que le bouton ne marche pas. La porte de `0059` faisait son
         * travail ; c'est ici que le travail se perdait. */
        const motif = await res
          .json()
          .then((c: { error?: string }) => c?.error)
          .catch(() => undefined);
        setValue(prev);
        setErreur(motif || REFUS_SANS_MOTIF);
      } else {
        router.refresh();
      }
    } catch {
      /* Réseau coupé — le terrain, pas l'exception. On distingue ce cas d'un
         refus serveur : l'un se réessaie tel quel, l'autre demande une
         action. Les confondre enverrait un vendeur téléverser un livrable
         alors que sa 3G est simplement tombée. */
      setValue(prev);
      setErreur("Connexion interrompue — réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          <p className="text-xs text-mist">par {seller}</p>
        </div>
        <select
          value={value}
          disabled={saving}
          onChange={(e) => change(e.target.value)}
          className="shrink-0 rounded-lg border border-line bg-ink/40 px-3 py-1.5 text-xs outline-none focus:border-violet disabled:opacity-60"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {erreur && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-danger px-3 py-2 text-xs leading-relaxed text-danger-text"
        >
          {erreur}
        </p>
      )}
    </li>
  );
}
