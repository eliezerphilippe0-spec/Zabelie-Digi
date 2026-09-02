"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MESSAGE_MAX } from "@/lib/messagerie";

/**
 * Le champ d'envoi — une seule forme pour les deux usages.
 *
 * `productId` → première question depuis la fiche produit (le fil se crée).
 * `conversationId` → réponse dans un fil ouvert.
 *
 * ⚠️ AUCUNE CHAÎNE EN DUR ICI. Tous les libellés arrivent en props, résolus
 * côté serveur : c'est la règle du dépôt (`tests/i18n-chaines-en-dur.test.ts`),
 * et c'est ce qui évite qu'un vendeur kreyòl lise du français au milieu d'un
 * écran traduit.
 */
export function MessageForm({
  productId,
  conversationId,
  labels,
}: {
  productId?: string;
  conversationId?: string;
  labels: {
    placeholder: string;
    send: string;
    sending: string;
    sent: string;
    warn: string;
  };
}) {
  const router = useRouter();
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    const corps = texte.trim();
    if (!corps || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, conversationId, body: corps }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        conversationId?: string;
      };
      if (!res.ok) {
        /* Le message du serveur, DÉJÀ TRADUIT (`lib/api-erreur.ts`). Le repli
         * ne l'écrase jamais : c'est le défaut corrigé le 2026-08-21 sur la
         * publication, où un refus muet laissait le vendeur sans motif. */
        setErreur(data.error || labels.send);
        return;
      }
      setTexte("");
      setEnvoye(true);
      /* Le fil est rendu côté SERVEUR : c'est `refresh()` qui le remet à jour,
       * pas un état local. Un message ajouté à la main dans le DOM afficherait
       * ce que le client CROIT avoir envoyé, pas ce que la base a accepté. */
      if (conversationId) router.refresh();
      else if (data.conversationId) router.push(`/messages/${data.conversationId}`);
    } catch {
      setErreur(labels.send);
    } finally {
      setEnvoi(false);
    }
  }

  const reste = MESSAGE_MAX - texte.length;

  return (
    <form onSubmit={envoyer} className="mt-4">
      <textarea
        value={texte}
        onChange={(e) => setTexte(e.target.value.slice(0, MESSAGE_MAX))}
        placeholder={labels.placeholder}
        /* Composeur de conversation : le placeholder est la convention
           (WhatsApp), mais il ne nomme le champ pour personne d'autre que
           l'œil. `aria-label` le nomme pour le reste. */
        aria-label={labels.placeholder}
        rows={3}
        className="min-h-11 w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-base outline-none focus:border-violet"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        {/* Le compteur n'apparaît que près de la borne : affiché en
            permanence, il transforme un champ de conversation en formulaire. */}
        <span className="text-xs text-mist">
          {reste < 200 ? `${reste}` : " "}
        </span>
        <button
          type="submit"
          disabled={envoi || texte.trim().length === 0}
          className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand disabled:opacity-60"
        >
          {envoi ? labels.sending : labels.send}
        </button>
      </div>
      {erreur && <p className="mt-2 text-sm text-danger-text">{erreur}</p>}
      {envoye && !erreur && <p className="mt-2 text-sm text-success-text">{labels.sent}</p>}
      {/* ⚠️ LE RAPPEL EST TOUJOURS VISIBLE, pas seulement au premier message.
          C'est la seule mesure prise contre la désintermédiation (`0090` §5) :
          on informe, on n'empêche pas. Le masquer après la première fois
          reviendrait à ne prévenir que ceux qui n'en ont pas encore besoin. */}
      <p className="mt-3 text-xs text-mist">{labels.warn}</p>
    </form>
  );
}
