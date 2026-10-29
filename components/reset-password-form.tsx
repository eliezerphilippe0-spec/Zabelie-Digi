"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, createPasswordWriter, createRecoveryClient } from "@/lib/supabase/client";
import { motDePasseDivulgue } from "@/lib/mot-de-passe-divulgue";

export type ResetPasswordLabels = {
  title: string;
  subtitle: string;
  passwordPh: string;
  confirmPh: string;
  mismatch: string;
  passwordLeaked: string;
  submit: string;
  submitting: string;
  success: string;
  invalid: string;
  signinCta: string;
  errorGeneric: string;
};

type Status = "checking" | "ready" | "invalid" | "done";

type Recovery = {
  userId: string;
  tokens: { access_token: string; refresh_token: string };
};

/** Aucun repli sur la session déjà connectée : seuls les jetons obtenus du
 * lien, puis vérifiés par Auth, peuvent ouvrir le formulaire. */
async function openRecovery(): Promise<Recovery | null> {
  const params = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  if ([params, fragment].some(p => ["error", "error_code", "error_description"].some(k => p.has(k)))) return null;
  const code = params.get("code");
  const access_token = fragment.get("access_token");
  const refresh_token = fragment.get("refresh_token");
  if (params.has("code") && !code) return null;
  if (code && (access_token || refresh_token || fragment.has("type"))) return null;
  if (!code && (fragment.get("type") !== "recovery" || !access_token || !refresh_token)) return null;

  const supabase = createRecoveryClient();
  try {
    // Ce client ne détecte pas l'URL : il n'y a qu'un consommateur du code.
    // L'échange garde l'origine et le cookie PKCE du formulaire d'envoi.
    const { data, error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.setSession({ access_token: access_token!, refresh_token: refresh_token! });
    if (error || !data.user || !data.session) return null;
    const tokens = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
    if (!tokens.access_token || !tokens.refresh_token) return null;
    const verified = await supabase.auth.getUser(tokens.access_token);
    if (verified.error || !verified.data.user || verified.data.user.id !== data.user.id
      || verified.data.user.id !== data.session.user.id) return null;
    return { userId: verified.data.user.id, tokens };
  } finally {
    await supabase.auth.dispose();
  }
}

export function ResetPasswordForm({ labels }: { labels: ResetPasswordLabels }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const opening = useRef<Promise<Recovery | null> | null>(null);
  const recovery = useRef<Recovery | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    let vivant = true;
    // StrictMode rejoue l'effet : réutiliser la même opération, sans rejouer
    // un code à usage unique ni conserver de preuve entre deux visites.
    opening.current ??= openRecovery();
    opening.current.catch(() => null).then(result => {
      if (!vivant) return;
      recovery.current = result;
      // Nettoyer aussi les liens refusés, sans journaliser leurs jetons.
      if (window.location.hash || window.location.search) {
        window.history.replaceState({}, "", window.location.pathname);
      }
      setStatus(result ? "ready" : "invalid");
    });

    return () => {
      vivant = false;
      mounted.current = false;
      recovery.current = null;
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const proof = recovery.current;
    if (status !== "ready" || !proof || busy.current) return;
    if (password !== confirm) {
      setMsg(labels.mismatch);
      return;
    }
    busy.current = true;
    setLoading(true);
    setMsg(null);
    let writer: ReturnType<typeof createPasswordWriter> | undefined;
    try {
      // Mot de passe connu des fuites : refusé avant toute écriture
      // (lib/mot-de-passe-divulgue.ts ; `null`, contrôle impossible, laisse passer).
      if (await motDePasseDivulgue(password)) {
        if (mounted.current) setMsg(labels.passwordLeaked);
        return;
      }
      const current = await createClient().auth.getUser();
      if (current.error || current.data.user?.id !== proof.userId) {
        recovery.current = null;
        if (mounted.current) setStatus("invalid");
        return;
      }
      // updateUser lit sa session au moment de l'appel. Le client mémoire
      // garde donc les jetons validés, même si un autre onglet se connecte.
      writer = createPasswordWriter();
      const bound = await writer.auth.setSession(proof.tokens);
      if (bound.error || bound.data.user?.id !== proof.userId || bound.data.session?.user.id !== proof.userId) {
        recovery.current = null;
        if (mounted.current) setStatus("invalid");
        return;
      }
      const { error } = await writer.auth.updateUser({ password });
      if (error) throw error;
      recovery.current = null;
      if (mounted.current) {
        setStatus("done");
        redirectTimer.current = setTimeout(() => router.push("/connexion"), 2000);
      }
    } catch {
      if (mounted.current) setMsg(labels.errorGeneric);
    } finally {
      await writer?.auth.dispose();
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }

  return (
    <main id="main" className="bg-grain flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="glass rounded-3xl p-7">
          <h1 className="text-lg font-semibold">{labels.title}</h1>

          {status === "checking" && <p className="mt-4 text-sm text-mist">…</p>}

          {status === "invalid" && (
            <>
              <p className="mt-4 text-sm text-mist">{labels.invalid}</p>
              <Link
                href="/connexion"
                className="bouton mt-4 inline-block rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand"
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
                  className="w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-accent"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder={labels.confirmPh}
                  aria-label={labels.confirmPh}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? labels.submitting : labels.submit}
                </button>
              </form>
              {msg && <p className="mt-4 text-center text-xs text-mist">{msg}</p>}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
