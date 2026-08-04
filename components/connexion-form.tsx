"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/brand-logo";
import { safeNext } from "@/lib/safe-next";
import { causeAuth, estModeDemo } from "@/lib/auth-erreurs";
import { ConfigSupabaseInvalide } from "@/lib/supabase/config";
import { checkDisplayName } from "@/lib/display-name";

type Mode = "signin" | "signup";

export type ConnexionLabels = {
  tabSignin: string;
  tabSignup: string;
  namePh: string;
  emailPh: string;
  passwordPh: string;
  signinCta: string;
  signupCta: string;
  signupSuccess: string;
  demoMode: string;
  errConfig: string;
  linkExpired: string;
  backHome: string;
  errorGeneric: string;
  forgot: string;
  nameRequired: string;
  nameReserved: string;
  /** Causes d'échec nommées — voir lib/auth-erreurs.ts. */
  errExists: string;
  errCredentials: string;
  errPassword: string;
  errNotConfirmed: string;
  errRate: string;
  errDisabled: string;
  errEmail: string;
  errNetwork: string;
};

function ConnexionFormInner({ labels }: { labels: ConnexionLabels }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));
  // BL-121 : /auth/callback redirige ici avec ?erreur=lien_expire quand le
  // lien de confirmation est expiré/déjà consommé — message clair d'entrée.
  const erreur = searchParams.get("erreur");
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(
    erreur === "lien_expire" ? labels.linkExpired : null
  );
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      // Dans le try : sans Supabase configuré (mode démo), createClient()
      // lève — l'utilisateur doit voir un message, pas un bouton figé.
      const supabase = createClient();
      if (mode === "signup") {
        // Le nom part dans les métadonnées, donc il doit être jugé ICI : la
        // base le remplacerait sans rien dire (0045).
        const verdict = checkDisplayName(name || email.split("@")[0]);
        if (!verdict.ok) {
          setMsg(
            verdict.reason === "brand" ? labels.nameReserved : labels.nameRequired,
          );
          return;
        }
        // Le nom passe par les MÉTADONNÉES du compte, pas seulement par
        // l'insert ci-dessous : c'est la seule voie qui survit à une
        // confirmation par e-mail (aucune session au retour) et c'est ce que
        // lit le déclencheur `zabelie_handle_new_user` (migration 0045).
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: verdict.value } },
        });
        if (error) throw error;
        // Insert de repli, volontairement conservé : tant que 0045 n'est pas
        // appliquée, c'est le SEUL chemin qui crée le profil. Une fois
        // appliquée, la ligne existe déjà et `upsert`+`ignoreDuplicates` en
        // fait un no-op. Le code doit être juste dans les deux états — il est
        // déployé bien avant que la migration ne soit passée à la main.
        if (data.user && data.session) {
          await supabase.from("profiles").upsert(
            {
              id: data.user.id,
              display_name: verdict.value,
              role: "buyer",
            },
            { onConflict: "id", ignoreDuplicates: true },
          );
          router.push(nextPath);
          router.refresh();
          return;
        }
        setMsg(labels.signupSuccess);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push(nextPath);
        router.refresh();
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : labels.errorGeneric;
      // AVANT le mode démo, et c'est l'ordre qui compte : une configuration
      // PRÉSENTE MAIS FAUSSE n'est pas une absence de configuration. Les
      // confondre dirait « mode démo » à quelqu'un dont les variables sont
      // posées — un troisième instrument menteur. Le message brut, qui NOMME
      // la valeur fautive, part au journal ; l'acheteur voit une phrase
      // inoffensive (`lib/supabase/config.ts`).
      if (err instanceof ConfigSupabaseInvalide) {
        console.error("[connexion]", raw);
        setMsg(labels.errConfig);
        return;
      }
      if (estModeDemo(raw)) {
        setMsg(labels.demoMode);
        return;
      }
      // Par CODE d'abord (lib/auth-erreurs.ts). Hors cas connu : le message
      // BRUT, jamais un générique rassurant — masquer une cause inconnue,
      // c'est supprimer la seule information disponible le jour où elle
      // apparaît. C'est ce qui a rendu l'échec d'inscription du 31 juillet
      // indiagnosticable sans accès à la base.
      const cause = causeAuth(
        err as { code?: string | null; message?: string | null },
      );
      const parCause: Record<string, string> = {
        exists: labels.errExists,
        credentials: labels.errCredentials,
        password: labels.errPassword,
        notConfirmed: labels.errNotConfirmed,
        rate: labels.errRate,
        disabled: labels.errDisabled,
        email: labels.errEmail,
        network: labels.errNetwork,
      };
      setMsg(cause ? parCause[cause] : raw);
      // Une adresse déjà inscrite n'est pas un échec : c'est le mauvais
      // onglet. On l'y amène au lieu de laisser refaire la même chose.
      if (cause === "exists") setMode("signin");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <Link href="/" className="mb-8 flex items-center justify-center gap-2">
        <BrandMark size={36} />
        <span className="text-lg font-semibold">
          Zabelie
        </span>
      </Link>

      <div className="glass rounded-3xl p-7">
        <div className="mb-6 flex rounded-xl border border-line p-1 text-sm">
          <button
            onClick={() => setMode("signin")}
            className={`flex-1 rounded-lg py-2 transition ${
              mode === "signin" ? "bg-cloud text-ink" : "text-mist"
            }`}
          >
            {labels.tabSignin}
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-lg py-2 transition ${
              mode === "signup" ? "bg-cloud text-ink" : "text-mist"
            }`}
          >
            {labels.tabSignup}
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              placeholder={labels.namePh}
              aria-label={labels.namePh}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-violet"
            />
          )}
          <input
            type="email"
            required
            placeholder={labels.emailPh}
            aria-label={labels.emailPh}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-violet"
          />
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
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "…" : mode === "signin" ? labels.signinCta : labels.signupCta}
          </button>
        </form>

        {mode === "signin" && (
          <p className="mt-4 text-center text-xs">
            {/* RES-01 : 15 px mesurés. C'est l'ENTRÉE du parcours de
                récupération — quelqu'un qui ne parvient pas à se connecter
                cherche exactement ce lien-là, souvent au pouce, souvent
                agacé. */}
            <Link
              href="/mot-de-passe-oublie"
              className="inline-flex min-h-11 items-center px-2 text-mist hover:text-cloud"
            >
              {labels.forgot}
            </Link>
          </p>
        )}

        {msg && <p className="mt-4 text-center text-xs text-mist">{msg}</p>}
      </div>

      <p className="mt-6 text-center text-xs text-mist">
        <Link href="/" className="hover:text-cloud">
          {labels.backHome}
        </Link>
      </p>
    </div>
  );
}

export function ConnexionForm({ labels }: { labels: ConnexionLabels }) {
  return (
    <div className="bg-grain flex min-h-screen items-center justify-center px-5">
      {/* useSearchParams exige une frontière Suspense (App Router). */}
      <Suspense fallback={null}>
        <ConnexionFormInner labels={labels} />
      </Suspense>
    </div>
  );
}
