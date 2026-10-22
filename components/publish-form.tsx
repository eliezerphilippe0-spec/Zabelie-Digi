"use client";

import type { SellerPricing } from "@/lib/seller-pricing";
import type { Lang } from "@/lib/i18n";
import { useEffect, useRef, useState, type SetStateAction } from "react";
import { isService, type DigitalKind } from "@/lib/product-kind";
import { useRouter } from "next/navigation";
import type { OptionCategorie, OptionSousRayon } from "@/lib/product-categories";
import { NetEstimate, type NetEstimateLabels } from "@/components/net-estimate";
import {
  AiDescriptionHelp,
  type AiHelpLabels,
} from "@/components/ai-description-help";
import type { CreatorTier } from "@/lib/commission";
import { POLICY_PATH } from "@/lib/policy";
import Link from "next/link";
import type { ServiceStarter } from "@/lib/service-starters";
import { serviceStarterDraft } from "@/lib/service-starter-draft";
import { useSessionDraft } from "@/lib/use-session-draft";
import { cleanPublishCategories, initialPublishDraft, publishDraftKey, publishReviewKey, validPublishDraft,
  PUBLISH_DRAFT_LIMITS, type PublishDraft, type PublishFields } from "@/lib/publish-draft";
import { publishDraftCopy } from "@/lib/publish-draft-copy";

export type PublishFormLabels = {
  titlePh: string;
  categoryAria: string;
  categoryEmpty: string;
  subcategoryAria: string;
  subcategoryEmpty: string;
  pricePh: string;
  descriptionPh: string;
  digitalHint: string;
  serviceHint: string;
  deliveryDaysPh: string;
  includesPh: string;
  includesAria: string;
  submit: string;
  submitting: string;
  errorGeneric: string;
  errorNetwork: string;
  footerHint: string;
  net: NetEstimateLabels;
  policyAccept: string;
  policyRead: string;
  policyRequired: string;
  ai: AiHelpLabels;
};

export function PublishForm({
  actorId,
  labels,
  categories,
  sousRayons = [],
  tier = "standard",
  rateBpsEnVigueur,
  pricing,
  lang = "fr",
  aiActif = false,
  serviceStarters = [],
  starterLabels,
  kind,
}: {
  actorId: string;
  labels: PublishFormLabels;
  /**
   * Le type choisi par le vendeur sous « Nouveau produit » (fichier ou
   * service). Il se change en choisissant une autre carte, plus ici : un
   * sélecteur dans le formulaire contredisait la carte surlignée (audit
   * du 2026-10-19, UX-06).
   */
  kind: DigitalKind;
  serviceStarters?: ServiceStarter[];
  starterLabels?: { heading: string; hint: string; confirmReplace: string };
  /**
   * Les rayons OUVERTS, lus en base côté serveur (lib/product-categories).
   * En prop et non importés : ce composant est client, et la taxonomie vit
   * en base — l'ancienne liste en dur est précisément ce qui avait créé
   * deux vocabulaires parallèles.
   */
  categories: OptionCategorie[];
  /**
   * Les SOUS-RAYONS actifs de tous les départements (0098), lus en base côté
   * serveur. Le second menu ne montre que ceux du département choisi, et ne
   * s'affiche pas si ce département n'en a aucun — un menu à une seule
   * option « — » n'est pas un choix.
   */
  sousRayons?: OptionSousRayon[];
  /** Palier réel du vendeur, lu en base — jamais deviné côté client. */
  tier?: CreatorTier;
  /** Taux configuré en base (0066) ; omis → repli sur la constante. */
  rateBpsEnVigueur?: number;
  pricing?: SellerPricing | null;
  lang?: Lang;
  /**
   * Aide IA à la rédaction — décidé au SERVEUR (`aiProviderDisponible()`),
   * jamais ici : pas de clé fournisseur posée → pas de bouton.
   */
  aiActif?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policyOk, setPolicyOk] = useState(false);
  const [done, setDone] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const suggestionRevision = useRef(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const draftKey = publishDraftKey(actorId, kind);
  const [draft, setDraft, clearDraft, ready, persistence] = useSessionDraft<PublishDraft>(draftKey,
    initialPublishDraft(actorId, kind), (v): v is PublishDraft => validPublishDraft(v, actorId, kind));
  // This minimal marker outlives the private text's 30-minute expiry. A lost
  // response may hide a COMMIT; expiry must never silently allow another POST.
  const [review, setReview, clearReview, reviewReady, reviewPersistence] = useSessionDraft<boolean>(
    publishReviewKey(actorId, kind), false, (v): v is boolean => typeof v === "boolean", Number.POSITIVE_INFINITY);
  const form = cleanPublishCategories(draft.form, categories, sousRayons);
  const copy = publishDraftCopy(lang);
  const uncertain = draft.verificationRequired || review;
  const locked = loading || !ready || !reviewReady || uncertain || done;

  function setForm(next: SetStateAction<PublishFields>) {
    if (!mounted.current) return;
    setDraft(previous => ({ ...previous, form: typeof next === "function"
      ? next(cleanPublishCategories(previous.form, categories, sousRayons)) : next }));
  }

  function set<K extends keyof typeof PUBLISH_DRAFT_LIMITS>(k: K, v: string) {
    // maxLength does not constrain number inputs; bound the stored strings too.
    if (v.length > PUBLISH_DRAFT_LIMITS[k]) return;
    setForm((f) => ({ ...f, [k]: v }));
  }

  function applyStarter(starter: ServiceStarter) {
    if ((form.title || form.description || form.serviceIncludes || form.priceHTG || form.deliveryDays) &&
        !window.confirm(starterLabels!.confirmReplace)) return;
    setError(null);
    setPolicyOk(false);
    suggestionRevision.current += 1;
    setRevision(suggestionRevision.current);
    setForm(serviceStarterDraft(starter));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked || submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError(null);
    suggestionRevision.current += 1;
    setRevision(suggestionRevision.current);
    // Save synchronously before contacting the server; never replay on reload.
    setReview(true);
    setDraft(previous => ({ ...previous, form, verificationRequired: true }));
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedActorId: actorId,
          title: form.title,
          kind: form.kind,
          category: form.category,
          // 0098 : facultatif — vide = la fiche s'arrête au département.
          categoryId: form.categoryId || undefined,
          description: form.description,
          priceHTG: Number(form.priceHTG),
          policyAccepted: policyOk,
          deliveryDays:
            form.deliveryDays.trim() !== "" ? Number(form.deliveryDays) : null,
          // Un élément par ligne — le serveur reborne (10 max, 140 car.).
          serviceIncludes: form.serviceIncludes
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!mounted.current) return;
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : labels.errorGeneric);
        // These explicit refusals occur before INSERT in the existing route.
        // All other/invalid responses remain ambiguous, including HTTP 500.
        if ([400, 401, 403, 429].includes(res.status)) {
          setReview(false);
          setDraft(previous => ({ ...previous, verificationRequired: false }));
        }
        return;
      }
      // slugify may leave a leading or doubled hyphen after truncation. Keep
      // its existing server contract while excluding URL path delimiters.
      if (!data || typeof data.slug !== "string" || !/^[a-z0-9-]+$/.test(data.slug)
        || !["draft", "published"].includes(data.status)) {
        setError(labels.errorGeneric);
        return;
      }
      setDone(true);
      clearDraft();
      clearReview();
      // BL-103 : un produit « fichier » naît en brouillon (invisible au
      // public tant que le livrable n'est pas uploadé) → on renvoie vers la
      // liste « Mes produits » où se trouve le bouton d'upload.
      router.push(data.status === "draft" ? "/vendre" : `/produit/${data.slug}`);
      router.refresh();
    } catch {
      if (mounted.current) setError(labels.errorNetwork);
    } finally {
      submitting.current = false;
      if (mounted.current) setLoading(false);
    }
  }

  const input =
    "w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-accent";

  if (done) return <p role="status" className="text-sm text-mist">{labels.submitting}</p>;

  return (
    <form onSubmit={submit} className="space-y-3" aria-describedby={error ? "publish-error" : undefined}>
      {ready && reviewReady && <div className="space-y-2 rounded-xl border border-line p-3">
        <p role="status" className="text-xs text-mist">{persistence === "saved" && reviewPersistence === "saved" ? copy.saved : copy.unavailable}</p>
        <button type="button" disabled={locked} className="min-h-11 text-sm underline disabled:opacity-60"
          onClick={() => {
            if (!window.confirm(copy.confirmDiscard)) return;
            suggestionRevision.current += 1;
            setRevision(suggestionRevision.current);
            setDraft(initialPublishDraft(actorId, kind));
            clearDraft();
            setPolicyOk(false);
            setError(null);
          }}>{copy.discard}</button>
      </div>}
      {uncertain && !loading && <div role="alert" className="space-y-2 rounded-xl border border-line p-3 text-sm">
        <p>{copy.uncertain}</p>
        <Link href="/vendre#mes-produits" className="inline-flex min-h-11 items-center underline">{copy.checkProducts}</Link>
        <button type="button" disabled={loading || !ready || !reviewReady} className="block min-h-11 text-left underline disabled:opacity-60"
          onClick={() => {
            setReview(false);
            setDraft(previous => ({ ...previous, verificationRequired: false }));
            setPolicyOk(false);
            setError(null);
          }}>{copy.resume}</button>
      </div>}
      <fieldset disabled={locked} className="min-w-0 space-y-3">
      {/* Les modèles de service : sur le formulaire d'un service seulement.
          Sur celui d'un fichier, ils changeaient la fiche en service. */}
      {starterLabels && isService(form.kind) && serviceStarters.length > 0 && (
        <fieldset className="rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold">{starterLabels.heading}</legend>
          <p className="mb-3 text-xs leading-relaxed text-mist">{starterLabels.hint}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {serviceStarters.map((starter) => (
              <button key={starter.id} type="button" disabled={loading}
                className="min-h-11 rounded-xl border border-line px-3 py-3 text-left text-sm hover:border-accent disabled:opacity-60"
                onClick={() => applyStarter(starter)}>{starter.title}</button>
            ))}
          </div>
        </fieldset>
      )}
      <label className="block space-y-2 text-sm"><span>{labels.titlePh}</span><input
        className={input}
        placeholder={labels.titlePh}
        aria-label={labels.titlePh}
        value={form.title}
        maxLength={PUBLISH_DRAFT_LIMITS.title}
        onChange={(e) => set("title", e.target.value)}
        required
      /></label>
      {/* BL-105 : liste fermée partagée avec le catalogue — un produit est
          toujours atteignable via une puce (fini le texte libre invisible). */}
      <label className="block space-y-2 text-sm"><span>{labels.categoryAria}</span><select
        className={input}
        aria-label={labels.categoryAria}
        value={form.category}
        // Changer de département invalide le sous-rayon : il appartient au
        // précédent, et le serveur le refuserait de toute façon.
        onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, categoryId: "" }))}
        required
      >
        <option value="">{labels.categoryEmpty}</option>
        {categories.map((c) => (
          /* value = label_fr (la clé de jointure du catalogue), texte =
             le libellé traduit. Les confondre rendrait introuvables les
             produits publiés par un vendeur kreyòl. */
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select></label>
      {/* SOUS-RAYON (0098) — le second niveau, pour tout type. Ne s'affiche que
          si le département choisi en a : « Digital & services » propose ses
          feuilles de services (0057) et de recharge (0097) ; un département
          sans enfant actif n'affiche rien. Facultatif : un service peut rester
          au niveau du département, et la route l'accepte tel quel. */}
      {(() => {
        const options = sousRayons.filter((s) => s.departement === form.category);
        if (options.length === 0) return null;
        return (
          <label className="block space-y-2 text-sm"><span>{labels.subcategoryAria}</span><select
            className={input}
            aria-label={labels.subcategoryAria}
            value={form.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
          >
            <option value="">{labels.subcategoryEmpty}</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.chemin}
              </option>
            ))}
          </select></label>
        );
      })()}
      <div className="space-y-1.5">
        <label className="block space-y-2 text-sm"><span>{labels.pricePh}</span><input
          className={input}
          type="number"
          min={0}
          max={2147483647}
          placeholder={labels.pricePh}
          aria-label={labels.pricePh}
          value={form.priceHTG}
          onChange={(e) => set("priceHTG", e.target.value)}
          required
        /></label>
        <NetEstimate
          pricing={pricing}
          lang={lang}
          priceHTG={form.priceHTG}
          tier={tier}
          rateBpsEnVigueur={rateBpsEnVigueur}
          labels={labels.net}
        />
      </div>
      <label className="block space-y-2 text-sm"><span>{labels.descriptionPh}</span><textarea
        className={input}
        rows={4}
        placeholder={labels.descriptionPh}
        aria-label={labels.descriptionPh}
        aria-describedby={!isService(form.kind) ? "digital-description-guide" : undefined}
        value={form.description}
        maxLength={PUBLISH_DRAFT_LIMITS.description}
        onChange={(e) => set("description", e.target.value)}
      /></label>
      {!isService(form.kind) && <p id="digital-description-guide" className="text-xs leading-relaxed text-mist">{labels.digitalHint}</p>}
      <AiDescriptionHelp
        key={revision}
        actif={aiActif}
        title={form.title}
        category={form.category || undefined}
        labels={labels.ai}
        onSuggestion={(texte) => {
          if (suggestionRevision.current === revision) set("description", texte);
        }}
      />
      {isService(form.kind) && (
        <div className="space-y-3 rounded-xl border border-line/60 p-4">
          <p className="text-xs text-mist">{labels.serviceHint}</p>
          <label className="block space-y-2 text-sm"><span>{labels.deliveryDaysPh}</span><input
            className={input}
            type="number"
            min={0}
            max={365}
            placeholder={labels.deliveryDaysPh}
            aria-label={labels.deliveryDaysPh}
            value={form.deliveryDays}
            onChange={(e) => set("deliveryDays", e.target.value)}
          /></label>
          <label className="block space-y-2 text-sm"><span>{labels.includesAria}</span><textarea
            className={input}
            rows={3}
            placeholder={labels.includesPh}
            aria-label={labels.includesAria}
            value={form.serviceIncludes}
            maxLength={PUBLISH_DRAFT_LIMITS.serviceIncludes}
            onChange={(e) => set("serviceIncludes", e.target.value)}
          /></label>
        </div>
      )}
      {/* Attestation : obligatoire, jamais pré-cochée. Le serveur refuse de
          toute façon sans elle — cette case explique, elle ne garde pas. */}
      <label className="flex items-start gap-3 rounded-xl border border-line bg-surface/40 p-4 text-xs text-mist">
        <input
          type="checkbox"
          required
          checked={policyOk}
          onChange={(e) => setPolicyOk(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span>
          {labels.policyAccept}{" "}
          <Link href={POLICY_PATH} className="inline-flex min-h-11 items-center underline hover:text-cloud">
            {labels.policyRead}
          </Link>
        </span>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
      >
        {loading ? labels.submitting : labels.submit}
      </button>
      </fieldset>
      {error && <p id="publish-error" role="alert" className="text-sm text-danger-text">{error}</p>}

      <p className="text-center text-xs text-mist">{labels.footerHint}</p>
    </form>
  );
}
