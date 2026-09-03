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
import { urlDeRetourOAuth, type AuthProvider } from "@/lib/auth-providers";

type Mode = "signin" | "signup";

/** Un fournisseur tiers, avec son libellé déjà traduit côté serveur. */
export type ConnexionProvider = AuthProvider & { label: string };

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
  /** V-19 — séparateur au-dessus des fournisseurs tiers, et leur échec. */
  oauthOr: string;
  errProvider: string;
};

/* Marques des fournisseurs — SVG inline minimaux (préambule Zabelie du skill,
   point 5 : aucune bibliothèque d'icônes). Monochromes sur `currentColor`,
   sauf le « G » de Google, dont les quatre couleurs SONT la marque. */
const MARQUES: Record<AuthProvider["id"], React.ReactNode> = {
  google: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z" />
    </svg>
  ),
  microsoft: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
      <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
      <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
      <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.3l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12z" />
    </svg>
  ),
  apple: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M16.4 12.7c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.2 1-4.1 2.5-1.8 3.1-.5 7.6 1.3 10.1.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.3.8 1.4 0 2.3-1.2 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.9-1.1-2.9-3.9zM14 5.3c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1.1 3 1.1.1 2.3-.6 3-1.4z" />
    </svg>
  ),
};

function ConnexionFormInner({
  labels,
  providers,
}: {
  labels: ConnexionLabels;
  providers: ConnexionProvider[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));
  // BL-121 : /auth/callback redirige ici avec ?erreur=lien_expire quand le
  // lien de confirmation est expiré/déjà consommé — message clair d'entrée.
  // V-19 : ?erreur=fournisseur quand un fournisseur tiers a refusé ou que
  // l'utilisateur a annulé chez lui — même principe, la cause est nommée.
  const erreur = searchParams.get("erreur");
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(
    erreur === "lien_expire"
      ? labels.linkExpired
      : erreur === "fournisseur"
        ? labels.errProvider
        : null
  );
  const [loading, setLoading] = useState(false);

  /* Le fournisseur tiers. `signInWithOAuth` ne rend pas de session : il
     NAVIGUE vers le fournisseur, qui renvoie sur `/auth/callback?code=…`, où
     le serveur échange le code et applique `safeNext`. `next` part donc dans
     l'URL de retour, pas dans l'état React — l'état ne survit pas au voyage.
     Ce qui peut lever ICI (configuration Supabase absente, réseau) passe par
     le même chemin d'erreurs que le formulaire. */
  async function viaFournisseur(p: ConnexionProvider) {
    setLoading(true);
    setMsg(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: p.supabase,
        options: {
          redirectTo: urlDeRetourOAuth(window.location.origin, nextPath),
          ...(p.scopes ? { scopes: p.scopes } : {}),
        },
      });
      if (error) throw error;
    } catch (err) {
      const raw = err instanceof Error ? err.message : labels.errorGeneric;
      if (err instanceof ConfigSupabaseInvalide) {
        console.error("[connexion]", raw);
        setMsg(labels.errConfig);
      } else if (estModeDemo(raw)) {
        setMsg(labels.demoMode);
      } else {
        console.error("[connexion] fournisseur", p.id, raw);
        setMsg(labels.errProvider);
      }
      setLoading(false);
    }
  }

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
      <Link
        href="/"
        className="mb-8 inline-flex min-h-11 items-center justify-center gap-2"
      >
        <BrandMark size={36} />
        <span className="text-lg font-semibold">
          Zabelie
        </span>
      </Link>

      <div className="glass rounded-3xl p-7">
        <div className="mb-6 flex rounded-xl border border-line p-1 text-sm">
          <button
            onClick={() => setMode("signin")}
            className={`min-h-11 flex-1 rounded-lg py-2 transition ${
              mode === "signin" ? "bg-cloud text-ink" : "text-mist"
            }`}
          >
            {labels.tabSignin}
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`min-h-11 flex-1 rounded-lg py-2 transition ${
              mode === "signup" ? "bg-cloud text-ink" : "text-mist"
            }`}
          >
            {labels.tabSignup}
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {/* ÉTIQUETTES VISIBLES — audit UX 2026-09-02 (#4), règle §4.6 du
              skill : « jamais le placeholder comme étiquette ». Le placeholder
              disparaît dès la première lettre ; sur un téléphone, l'utilisateur
              ne sait plus quel champ il remplit. L'étiquette reste. Les mêmes
              chaînes i18n servent : ce sont déjà des noms de champ, pas des
              exemples. `aria-label` tombe — un <label htmlFor> le rend inutile. */}
          {mode === "signup" && (
            <div className="space-y-1">
              <label htmlFor="auth-name" className="block text-sm text-mist">
                {labels.namePh}
              </label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-accent"
              />
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="auth-email" className="block text-sm text-mist">
              {labels.emailPh}
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="auth-password" className="block text-sm text-mist">
              {labels.passwordPh}
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "…" : mode === "signin" ? labels.signinCta : labels.signupCta}
          </button>
        </form>

        {/* V-19 — fournisseurs tiers. RIEN si la liste est vide : un bouton
            vers un fournisseur non activé chez Supabase mène à une page
            d'erreur brute hors de notre interface (lib/auth-providers.ts). */}
        {providers.length > 0 && (
          <div className="mt-5">
            <p className="mb-3 flex items-center gap-3 text-xs text-mist before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
              {labels.oauthOr}
            </p>
            <div className="space-y-2">
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={loading}
                  onClick={() => viaFournisseur(p)}
                  className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-line bg-ink/40 px-4 py-2.5 text-sm text-cloud transition hover:border-accent disabled:opacity-60"
                >
                  {MARQUES[p.id]}
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

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
        <Link href="/" className="inline-flex min-h-11 items-center hover:text-cloud">
          {labels.backHome}
        </Link>
      </p>
    </div>
  );
}

export function ConnexionForm({
  labels,
  providers = [],
}: {
  labels: ConnexionLabels;
  providers?: ConnexionProvider[];
}) {
  return (
    <div className="bg-grain flex min-h-dvh items-center justify-center px-5">
      {/* useSearchParams exige une frontière Suspense (App Router). */}
      <Suspense fallback={null}>
        <ConnexionFormInner labels={labels} providers={providers} />
      </Suspense>
    </div>
  );
}
