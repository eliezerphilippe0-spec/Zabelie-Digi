"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyField } from "@/components/copy-field";

/**
 * Libellés résolus CÔTÉ SERVEUR et passés en props. Un composant client
 * n'importe jamais `t()` ni le dictionnaire (`tests/i18n-client-discipline`,
 * règle en tête de `lib/i18n.ts`) : sur un Android d'entrée de gamme en 3G,
 * embarquer le dictionnaire au bundle est exactement le coût qu'on évite.
 * `lienIntro` et `vActuel` arrivent avec leur gabarit `{code}` / `{pct}`,
 * remplacé ici par une substitution de chaîne (jamais `t`).
 */
export type AffiliationLabels = {
  titre: string;
  intro: string;
  bientot: string;
  devenir: string;
  code: string;
  lienTitre: string;
  lienIntro: string; // {code}
  erreur: string;
  copy: string;
  copied: string;
  vTitre: string;
  vIntro: string;
  vBornes: string;
  vPrepa: string;
  vTaux: string;
  vOffrir: string;
  vRetirer: string;
  vActuel: string; // {pct}
  vAucun: string;
  vSansProduit: string;
  vProduitPremier: string;
  pTitre: string;
  pIntro: string;
  pVide: string;
  pTaux: string; // {pct}
  pIndispo: string;
  vEnregistre: string;
  vRetire: string;
  vHorsBornes: string; // {min} {max}
};

export type ProduitAffiliable = {
  id: string;
  title: string;
  slug: string;
  /** Taux offert aujourd'hui, en points de base. `null` = aucune offre. */
  rateBps: number | null;
};

/**
 * Un produit qui offre une commission, vu par l'AFFILIÉ (audit UX-01). Le prix
 * est déjà formaté et le lien déjà fabriqué côté serveur : le client n'embarque
 * ni `formatHTG` (donc pas le jeu de données d'exemple) ni la logique de lien.
 * `lien` est `null` tant que l'affilié n'a pas de code : pas de bouton copier.
 */
export type ProduitCommissionne = {
  id: string;
  title: string;
  prix: string;
  rateBps: number;
  lien: string | null;
};

/**
 * La page affiliation du tableau vendeur (option B, docs/37 §A — migration
 * 0081). DEUX faces, car l'affiliation est un marché à deux côtés :
 *
 *   • PARTAGEUR — devenir affilié, obtenir son lien `?ref=<code>`. Cette face
 *     dépend du programme : tant que `config.actif` est false, l'API répond
 *     503 et on n'affiche que « bientôt ». Le MÊME code s'anime quand le
 *     porteur arme le programme (son signal de lancement), sans toucher au
 *     client.
 *   • VENDEUR (opt-in) — offrir un taux par produit. PERMIS dès maintenant :
 *     c'est de la préparation, rien n'est prélevé tant que le programme est
 *     fermé et qu'aucune attribution n'existe (route `affiliate-rate`).
 *
 * Aucune logique d'argent ici : les montants, la cascade et la maturation
 * vivent en base (0081). Ce composant ne fait que poser des taux et montrer un
 * lien.
 */
export function AffiliationManager({
  labels,
  dormant,
  code,
  baseUrl,
  minPct,
  maxPct,
  produits,
  commissionnes,
}: {
  labels: AffiliationLabels;
  dormant: boolean;
  code: string | null;
  baseUrl: string;
  minPct: number;
  maxPct: number;
  produits: ProduitAffiliable[];
  /** `null` = lecture impossible (distinct de « aucun produit »). */
  commissionnes: ProduitCommissionne[] | null;
}) {
  const router = useRouter();
  /* Le code vient du serveur (`code`) ; `codeInscrit` ne couvre que l'instant
   * entre la réponse du POST et la fin du `router.refresh()`. Un seul état
   * local figé sur la prop initiale ignorerait le code que le serveur renvoie
   * ensuite, et la liste des produits resterait sans lien. */
  const [codeInscrit, setCodeInscrit] = useState<string | null>(null);
  const monCode = code ?? codeInscrit;
  const [inscription, setInscription] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function devenir() {
    setInscription(true);
    setErreur(null);
    try {
      const res = await fetch("/api/affiliate", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.code) {
        setErreur(labels.erreur);
        return;
      }
      setCodeInscrit(data.code as string);
      router.refresh();
    } catch {
      setErreur(labels.erreur);
    } finally {
      setInscription(false);
    }
  }

  return (
    <div className="mt-6 space-y-8">
      {/* ── PARTAGEUR ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="affil-partageur" className="rounded-2xl border border-line bg-surface/60 p-5">
        <h2 id="affil-partageur" className="text-lg font-semibold">{labels.titre}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">{labels.intro}</p>

        {dormant ? (
          <p className="mt-4 rounded-xl border border-line bg-ink/30 px-4 py-3 text-sm text-mist">
            {labels.bientot}
          </p>
        ) : monCode ? (
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs text-mist">{labels.code}</p>
              <p className="code-lisible mt-1 text-lg font-extrabold text-accent">{monCode}</p>
            </div>
            <div>
              <p className="text-xs text-mist">{labels.lienTitre}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1 break-all text-sm">
                <span className="select-all">{`${baseUrl}/?ref=${monCode}`}</span>
                <CopyField
                  value={`${baseUrl}/?ref=${monCode}`}
                  label={labels.copy}
                  copiedLabel={labels.copied}
                />
              </p>
              <p className="mt-1 text-xs text-mist">{labels.lienIntro.replace("{code}", monCode)}</p>
            </div>

            {/* ── PRODUITS QUI RAPPORTENT (UX-01) ────────────────────────────
                Option B : seul un produit portant un taux rapporte. Sans cette
                liste l'affilié partage à l'aveugle un lien qui n'attribue rien. */}
            <div className="pt-2">
              <h3 className="text-sm font-semibold">{labels.pTitre}</h3>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-mist">{labels.pIntro}</p>
              {commissionnes === null ? (
                <p role="status" className="mt-3 text-sm text-mist">{labels.pIndispo}</p>
              ) : commissionnes.length === 0 ? (
                <p className="mt-3 text-sm text-mist">{labels.pVide}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {commissionnes.map((p) => (
                    <li key={p.id} className="rounded-xl border border-line bg-surface/60 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{p.title}</p>
                          <p className="mt-0.5 text-xs text-mist">
                            <span className="numeric">{p.prix}</span>
                            {" · "}
                            {labels.pTaux.replace("{pct}", String(p.rateBps / 100))}
                          </p>
                        </div>
                        {p.lien && (
                          <CopyField value={p.lien} label={labels.copy} copiedLabel={labels.copied} />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <button
              type="button"
              onClick={devenir}
              disabled={inscription}
              className="min-h-11 rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
            >
              {inscription ? "…" : labels.devenir}
            </button>
          </div>
        )}
        {erreur && <p role="alert" className="mt-2 text-xs text-danger-text">{erreur}</p>}
      </section>

      {/* ── VENDEUR (opt-in, option B) ────────────────────────────────────── */}
      <section aria-labelledby="affil-vendeur" className="rounded-2xl border border-line bg-surface/60 p-5">
        <h2 id="affil-vendeur" className="text-lg font-semibold">{labels.vTitre}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">{labels.vIntro}</p>
        <p className="mt-1 text-xs text-mist">{labels.vBornes}</p>
        {/* Préparation permise : poser un taux dormant ne prélève rien. */}
        {dormant && (
          <p className="mt-3 rounded-xl border border-line bg-ink/30 px-4 py-3 text-xs text-mist">
            {labels.vPrepa}
          </p>
        )}

        {produits.length === 0 ? (
          <p className="mt-4 text-sm text-mist">
            {labels.vSansProduit}{" "}
            <a href="/vendre" className="text-cloud underline">
              {labels.vProduitPremier}
            </a>
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {produits.map((p) => (
              <li
                key={p.id}
                className="rounded-xl border border-line bg-surface/60 px-4 py-3"
              >
                <ProduitTaux labels={labels} produit={p} minPct={minPct} maxPct={maxPct} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Une ligne produit : le taux offert et les deux gestes (offrir / retirer).
 * L'entrée est en POURCENTAGE ; l'API et la base travaillent en points de base
 * (× 100). Les bornes de l'input doublent la garde SQL (ZB081) — un refus de
 * borne revient quand même avec son message exact.
 */
function ProduitTaux({
  labels,
  produit,
  minPct,
  maxPct,
}: {
  labels: AffiliationLabels;
  produit: ProduitAffiliable;
  minPct: number;
  maxPct: number;
}) {
  const router = useRouter();
  const actuelPct = produit.rateBps !== null ? produit.rateBps / 100 : null;
  const [pct, setPct] = useState<number>(actuelPct ?? minPct);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /* Le retour affirmatif (audit UX-02). Sur une 3G lente, `router.refresh()`
   * met du temps à changer « Commission : X % » : sans message, le vendeur se
   * demande si son geste a pris. L'état survit au refresh (même `key`). */
  const [ok, setOk] = useState<string | null>(null);

  async function offrir() {
    setLoading(true);
    setErreur(null);
    setOk(null);
    try {
      const res = await fetch("/api/products/affiliate-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: produit.id, rateBps: Math.round(pct * 100) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        /* Jamais le texte du serveur (audit SEC-02) : seul le CODE ZB081 est
         * lu, et le message vient des libellés, dans la langue du vendeur,
         * avec les bornes que la page connaît déjà. */
        setErreur(
          data?.code === "ZB081"
            ? labels.vHorsBornes.replace("{min}", String(minPct)).replace("{max}", String(maxPct))
            : labels.erreur
        );
        return;
      }
      setOk(labels.vEnregistre);
      router.refresh();
    } catch {
      setErreur(labels.erreur);
    } finally {
      setLoading(false);
    }
  }

  async function retirer() {
    setLoading(true);
    setErreur(null);
    setOk(null);
    try {
      const res = await fetch("/api/products/affiliate-rate", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: produit.id }),
      });
      if (!res.ok) {
        setErreur(labels.erreur);
        return;
      }
      setOk(labels.vRetire);
      router.refresh();
    } catch {
      setErreur(labels.erreur);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{produit.title}</p>
          <p className="mt-0.5 text-xs text-mist">
            {actuelPct !== null
              ? labels.vActuel.replace("{pct}", String(actuelPct))
              : labels.vAucun}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-20">
            <label className="text-xs text-mist" htmlFor={`taux-${produit.id}`}>
              {labels.vTaux}
            </label>
            <input
              id={`taux-${produit.id}`}
              type="number"
              min={minPct}
              max={maxPct}
              step={1}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-line bg-surface/60 px-3 py-2 text-sm text-cloud focus:border-brand/60 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={offrir}
            disabled={loading}
            className="min-h-11 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "…" : labels.vOffrir}
          </button>
          {actuelPct !== null && (
            <button
              type="button"
              onClick={retirer}
              disabled={loading}
              className="min-h-11 rounded-xl border border-line px-3 py-2 text-xs font-medium text-mist transition hover:border-brand/50 hover:text-cloud disabled:opacity-60"
            >
              {labels.vRetirer}
            </button>
          )}
        </div>
      </div>
      {erreur && <p role="alert" className="mt-2 text-xs text-danger-text">{erreur}</p>}
      {ok && !erreur && <p role="status" className="mt-2 text-xs text-success-text">{ok}</p>}
    </div>
  );
}
