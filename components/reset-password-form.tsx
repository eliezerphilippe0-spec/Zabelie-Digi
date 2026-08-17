"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type ResetPasswordLabels = {
  title: string;
  subtitle: string;
  passwordPh: string;
  confirmPh: string;
  mismatch: string;
  submit: string;
  submitting: string;
  success: string;
  invalid: string;
  signinCta: string;
  errorGeneric: string;
};

type Status = "checking" | "ready" | "invalid" | "done";

export function ResetPasswordForm({ labels }: { labels: ResetPasswordLabels }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    /* CETTE PAGE OUVRE LA SESSION ELLE-MÊME (correctif 2026-08-11).
     *
     * Elle supposait qu'/auth/callback avait déjà fait le travail. Or ce
     * callback ne traite que la forme PKCE (`?code=`) : quand Supabase
     * renvoie les jetons dans le FRAGMENT (`#access_token=…&type=recovery`),
     * le serveur ne les voit pas — un fragment n'est jamais transmis. Le
     * visiteur atterrissait sans session : « rien ne se passe ».
     *
     * Les deux formes sont désormais couvertes :
     *   • fragment → le client supabase le consomme au chargement
     *     (`detectSessionInUrl`), d'où la seconde lecture après un tick ;
     *   • `?code=` → échange explicite ici, sur la MÊME origine que le
     *     formulaire d'envoi, donc avec son cookie `code_verifier`.
     */
    const supabase = createClient();
    let vivant = true;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code);
        } catch {
          /* Lien expiré ou déjà consommé (double-clic, préfetch d'antivirus
           * de messagerie) : on retombe sur la lecture ci-dessous, qui
           * affichera « lien invalide » — un message, jamais un écran mort. */
        }
      }

      let { data } = await supabase.auth.getUser();
      if (!data.user) {
        // Course avec `detectSessionInUrl` : le fragment peut n'être
        // consommé qu'au tick suivant. Une seule seconde chance, pas une
        // boucle — un écran qui tourne sans fin est pire qu'un refus clair.
        await new Promise((r) => setTimeout(r, 400));
        data = (await supabase.auth.getUser()).data;
      }
      if (!vivant) return;

      // L'URL porte les jetons : on les efface de la barre d'adresse une
      // fois la session ouverte (historique, captures, épaule du voisin).
      if (data.user && (window.location.hash || window.location.search)) {
        window.history.replaceState({}, "", window.location.pathname);
      }
      setStatus(data.user ? "ready" : "invalid");
    })();

    return () => {
      vivant = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMsg(labels.mismatch);
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStatus("done");
      setTimeout(() => router.push("/connexion"), 2000);
    } catch {
      setMsg(labels.errorGeneric);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-grain flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="glass rounded-3xl p-7">
          <h1 className="text-lg font-semibold">{labels.title}</h1>

          {status === "checking" && <p className="mt-4 text-sm text-mist">…</p>}

          {status === "invalid" && (
            <>
              <p className="mt-4 text-sm text-mist">{labels.invalid}</p>
              <Link
                href="/connexion"
                className="mt-4 inline-block rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand"
              >
                {labels.signinCta}
              </Link>
            </>
          )}

          {status === "done" && <p className="mt-4 text-sm text-mist">{labels.success}</p>}

          {status === "ready" && (
            <>
              <p className="mt-2 text-sm text-mist">{labels.subtitle}</p>
              <form onSubmit={submit} className="mt-4 space-y-3">
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder={labels.passwordPh}
                  aria-label={labels.passwordPh}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-violet"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder={labels.confirmPh}
                  aria-label={labels.confirmPh}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-violet"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? labels.submitting : labels.submit}
                </button>
              </form>
              {msg && <p className="mt-4 text-center text-xs text-mist">{msg}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
