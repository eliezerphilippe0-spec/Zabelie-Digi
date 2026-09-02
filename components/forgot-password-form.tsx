"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export type ForgotPasswordLabels = {
  title: string;
  subtitle: string;
  emailPh: string;
  submit: string;
  sending: string;
  success: string;
  back: string;
  errorGeneric: string;
  demoMode: string;
};

export function ForgotPasswordForm({ labels }: { labels: ForgotPasswordLabels }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const supabase = createClient();
      const site = window.location.origin;
      // Message identique succès/échec (pas d'énumération de comptes) : le
      // formulaire ne révèle jamais si l'e-mail existe.
      /* Le lien pointe DIRECTEMENT sur la page de réinitialisation, plus
       * sur /auth/callback (correctif 2026-08-11, « rien ne se passe »).
       * Deux raisons, mesurées :
       *   • /auth/callback ne sait QUE traiter `?code=` (PKCE). Selon le
       *     gabarit d'e-mail du projet, Supabase renvoie les jetons dans le
       *     FRAGMENT (`#access_token=…`) — invisible côté serveur par
       *     construction. La route redirigeait alors sans session, et la
       *     page concluait « lien invalide » ou n'affichait rien ;
       *   • un aller-retour de plus multiplie les occasions de perdre le
       *     cookie `code_verifier` du PKCE, qui est lié à l'ORIGINE — le
       *     couple zabelie.com / www.zabelie.com suffit à le casser.
       * La page cible sait désormais traiter les DEUX formes elle-même. */
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${site}/reinitialiser-mot-de-passe`,
      });
      setDone(true);
    } catch (err) {
      const raw = err instanceof Error ? err.message : labels.errorGeneric;
      setMsg(raw.includes("URL and API key") ? labels.demoMode : labels.errorGeneric);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-grain flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="glass rounded-3xl p-7">
          <h1 className="text-lg font-semibold">{labels.title}</h1>
          {done ? (
            <p className="mt-4 text-sm text-mist">{labels.success}</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-mist">{labels.subtitle}</p>
              <form onSubmit={submit} className="mt-4 space-y-3">
                <input
                  type="email"
                  required
                  placeholder={labels.emailPh}
                  aria-label={labels.emailPh}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? labels.sending : labels.submit}
                </button>
              </form>
              {msg && <p className="mt-4 text-center text-xs text-mist">{msg}</p>}
            </>
          )}
        </div>
        {/* RES-01 : mesuré à 15 px de haut. Sur le chemin de récupération de
            compte — celui d'un utilisateur DÉJÀ bloqué — une sortie de
            secours qu'on rate au pouce est le pire endroit possible. */}
        <p className="mt-6 text-center text-xs text-mist">
          <Link
            href="/connexion"
            className="inline-flex min-h-11 items-center px-2 hover:text-cloud"
          >
            {labels.back}
          </Link>
        </p>
      </div>
    </div>
  );
}
