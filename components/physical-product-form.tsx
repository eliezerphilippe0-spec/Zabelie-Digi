"use client";

import type { SellerPricing } from "@/lib/seller-pricing";
import type { Lang } from "@/lib/i18n";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NetEstimate, type NetEstimateLabels } from "@/components/net-estimate";
import {
  AiDescriptionHelp,
  type AiHelpLabels,
} from "@/components/ai-description-help";
import type { CreatorTier } from "@/lib/commission";
import { POLICY_PATH } from "@/lib/policy";
import {
  compresserImage,
  poidsLisible,
  type Compression,
} from "@/lib/image-compress";
import Link from "next/link";
import { UUID_RE } from "@/lib/collections";
import { KIND_PHYSICAL } from "@/lib/product-kind";
import { publishReviewKey } from "@/lib/publish-draft";
import { publishDraftCopy } from "@/lib/publish-draft-copy";
import { useSessionDraft } from "@/lib/use-session-draft";

/**
 * Création d'un produit physique (chantier B — UI vendeur).
 *
 * Chemin nominal : photo, informations, création du brouillon, revue.
 * Tout le reste est un dépliage optionnel :
 *   - variantes (un filtre à huile n'a ni couleur ni capacité) ;
 *   - compatibilité véhicule (3 taps : marque → modèle → années), affichée
 *     seulement pour les catégories auto/moto.
 *
 * La photo est capturée AVANT la création (input capture) mais envoyée APRÈS
 * (la route cover exige un productId) — le vendeur ne voit qu'une étape.
 *
 * ─── PRÉSENTATION (audit 2026-10-27, M3 · m1 · m7 · M10) ────────────────────
 * Aucune chaîne visible n'est écrite ici : tout arrive traduit en props
 * (`listingLabels`, `specsLabels`, `netLabels`…), composé au serveur par
 * `app/vendre/physique/page.tsx` — `t()` ne s'importe pas dans un composant
 * client (`tests/i18n-client-discipline`). Le formulaire est découpé en quatre
 * cartes numérotées (« 1 sur 4 · Photo »…) avec un indicateur en tête, chaque
 * contrôle fait 44 px de haut au moins, et le champ fichier natif — qui disait
 * « Choose File » dans la langue du NAVIGATEUR — est masqué derrière un
 * libellé-bouton traduit, comme `photo-principale.tsx`.
 * Garde : `tests/formulaire-physique.test.ts`.
 */

type Category = {
  id: string;
  slug: string;
  level: number;
  label_fr: string;
  label_kr: string;
  parent_id: string | null;
  position: number;
};
type VehicleModel = { id: string; kind: "auto" | "moto"; make: string; model: string };
type Variant = { label: string; priceHTG: string; quantity: string };
type Fitment = { modelId: string; yearStart: string; yearEnd: string };

/** Libellés d'une ligne de variante — `{n}` et `{libelle}` remplis ici. */
export type VariantLabels = {
  title: string;
  hint: string;
  group: string;
  name: string;
  namePh: string;
  price: string;
  stock: string;
  remove: string;
  removeNamed: string;
  add: string;
};

/** Libellés du sélecteur de compatibilité — `{annee}`, `{vehicule}` remplis ici. */
export type FitmentLabels = {
  title: string;
  hint: string;
  make: string;
  makeAria: string;
  model: string;
  modelAria: string;
  from: string;
  until: string;
  untilNow: string;
  fromAria: string;
  untilAria: string;
  remove: string;
};

export type PhysicalListingLabels = {
  description: string;
  descriptionHint: string;
  draft: string;
  creating: string;
  draftNote: string;
  saved: string;
  photoFailed: string;
  photoRetry: string;
  photoChoose: string;
  photoPrepareError: string;
  manage: string;
  error: string;
  network: string;
  photoAdd: string;
  photoReplace: string;
  photoPreparing: string;
  photoAlt: string;
  /** `{avant}` et `{apres}` : poids avant et après compression. */
  photoReduced: string;
  /** `{poids}` : poids d'une photo déjà assez légère. */
  photoLight: string;
  titleLabel: string;
  titlePh: string;
  price: string;
  quantity: string;
  category: string;
  choose: string;
  loadError: string;
  reload: string;
  required: string;
  recommended: string;
  optional: string;
  steps: {
    nav: string;
    /** `{n}` et `{total}` : rempli ici, `ETAPES` est la seule source du total. */
    count: string;
    photo: string;
    basics: string;
    details: string;
    save: string;
  };
  variants: VariantLabels;
  fitment: FitmentLabels;
};

const CURRENT_YEAR = new Date().getFullYear();

/** Les quatre étapes, dans l'ordre de la page — ids des cartes et des liens. */
const ETAPES = ["photo", "infos", "details", "enregistrer"] as const;

/* Champs : 44 px de haut au moins (M10), rayon des champs de l'échelle
 * (`rounded-xl`, thème « RÈGLE DES RAYONS »), texte posé sur `bg-ink`. */
const CHAMP =
  "mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-line bg-ink px-4 py-2.5 text-base text-cloud disabled:opacity-50";
const CHAMP_PETIT =
  "mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-line bg-ink px-3 py-2 text-sm text-cloud disabled:opacity-50";
/** Trois par rangée à 360 px (~78 px chacun) : « Longueur » doit tenir en placeholder. */
const CHAMP_DIM = CHAMP_PETIT.replace("px-3", "px-2");
const CARTE = "scroll-mt-32 space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-5";
/** Un `<summary>` garde son triangle natif (`display: list-item`) et ses 44 px. */
const RESUME = "min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-cloud";

/** Libellé du rayon dans la langue de l'écran. La route ne sert que `fr` et `kr`. */
function libelleCategorie(c: Category, lang: Lang): string {
  return (lang === "ht" ? c.label_kr : null) || c.label_fr;
}

export function PhysicalProductForm({
  actorId,
  listingLabels,
  tier = "standard",
  rateBpsEnVigueur,
  pricing,
  lang = "fr",
  netLabels,
  policyAccept,
  policyRead,
  aiActif = false,
  aiLabels,
  specsEtendues = false,
  specsLabels,
}: {
  actorId: string;
  listingLabels: PhysicalListingLabels;
  /** Palier réel du vendeur, lu en base — jamais deviné côté client. */
  tier?: CreatorTier;
  /** Taux configuré en base (0066) ; omis → repli sur la constante. */
  rateBpsEnVigueur?: number;
  pricing?: SellerPricing | null;
  lang?: Lang;
  /** Libellés de l'estimation, traduits côté serveur — un montant ne s'affiche jamais en dur. */
  netLabels: NetEstimateLabels;
  /** Libellés de l'attestation, traduits côté serveur. */
  policyAccept: string;
  policyRead: string;
  /** Aide IA à la rédaction — décidé au serveur (`aiProviderDisponible()`). */
  aiActif?: boolean;
  /** Libellés du bouton d'aide, traduits côté serveur. */
  aiLabels: AiHelpLabels;
  /**
   * Marque/matière/état disponibles ? Décidé au SERVEUR (sonde 0074) — les
   * trois champs n'apparaissent que si la base peut les garder : jamais une
   * saisie vendeur perdue en silence.
   */
  specsEtendues?: boolean;
  /** Libellés des caractéristiques, traduits côté serveur. */
  specsLabels: {
    title: string;
    weight: string;
    dims: string;
    length: string;
    width: string;
    height: string;
    brand: string;
    material: string;
    condition: string;
    conditionNef: string;
    conditionDezyem: string;
  };
}) {
  const router = useRouter();
  const mounted = useRef(true);
  const submitting = useRef(false);
  const [review, setReview, clearReview, reviewReady, reviewPersistence] = useSessionDraft<boolean>(
    publishReviewKey(actorId, KIND_PHYSICAL), false,
    (value): value is boolean => typeof value === "boolean", Number.POSITIVE_INFINITY,
  );
  const reviewCopy = publishDraftCopy(lang);
  const [categories, setCategories] = useState<Category[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [compression, setCompression] = useState<Compression | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [description, setDescription] = useState("");

  // Caractéristiques (V-2, docs/35) — cm à l'écran, mm au serveur (entiers).
  const [poidsG, setPoidsG] = useState("");
  const [longCm, setLongCm] = useState("");
  const [largCm, setLargCm] = useState("");
  const [hautCm, setHautCm] = useState("");
  const [marque, setMarque] = useState("");
  const [matiere, setMatiere] = useState("");
  const [etat, setEtat] = useState("");

  const [showVariants, setShowVariants] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [fitment, setFitment] = useState<Fitment[]>([]);

  const [policyOk, setPolicyOk] = useState(false);
  const [busy, setBusy] = useState(false);
  // Once creation succeeds, retries must upload to this draft, never create another.
  const [createdProductId, setCreatedProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Étape où se trouve le focus : l'indicateur en tête la porte en aria-current.
  const [etapeActive, setEtapeActive] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview); };
  }, [photoPreview]);

  useEffect(() => {
    fetch("/api/products/physical")
      .then((r) => {
        if (!r.ok) throw new Error("categories-unavailable");
        return r.json();
      })
      .then((d) => {
        if (!mounted.current) return;
        setCategories(d.categories ?? []);
        setModels(d.models ?? []);
      })
      .catch(() => { if (mounted.current) setLoadError(true); });
  }, []);

  // Arbre aplati → options groupées par département (remontée des parent_id).
  const grouped = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const rootOf = (c: Category): Category => {
      let cur = c;
      while (cur.parent_id) {
        const parent = byId.get(cur.parent_id);
        if (!parent) break;
        cur = parent;
      }
      return cur;
    };
    return categories
      .filter((c) => c.level === 1)
      .map((dep) => ({
        dep,
        children: categories.filter(
          (c) => c.level >= 2 && rootOf(c).id === dep.id
        ),
      }));
  }, [categories]);

  // La compatibilité véhicule n'a de sens que pour l'auto/moto.
  const isAutoCategory = categorySlug.includes("oto") || categorySlug.includes("moto")
    ? true
    : ["filtrasyon", "fren", "batri", "luil", "kouwa", "chen", "aditif", "likid"].some(
        (k) => categorySlug.includes(k)
      );

  /* La compression a lieu À LA SÉLECTION, pas à l'envoi : le vendeur voit le
   * gain AVANT de valider, et l'attente se paie pendant qu'il remplit le
   * reste du formulaire plutôt qu'au moment critique de la soumission. */
  async function selectPhoto(f: File | null) {
    if (!mounted.current) return;
    setPhotoPreview(null);
    setPhoto(null);
    setError(null);
    setCompression(null);
    if (!f) {
      setPhoto(null);
      return;
    }
    setCompressing(true);
    try {
      const c = await compresserImage(f);
      if (!mounted.current) return;
      setPhoto(c.fichier);
      setCompression(c);
      setPhotoPreview(URL.createObjectURL(c.fichier));
    } catch {
      if (mounted.current) setError(listingLabels.photoPrepareError);
    } finally {
      if (mounted.current) setCompressing(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!mounted.current || submitting.current || busy || compressing || createdProductId || !reviewReady || review) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    // Persist only this safety marker, before the server can create a product.
    // A lost response must not turn reload into permission for another POST.
    setReview(true);
    try {
      const res = await fetch("/api/products/physical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedActorId: actorId,
          title,
          description: description || undefined,
          priceHTG: Number(price),
          quantity: Number(quantity),
          categorySlug,
          policyAccepted: policyOk,
          weightGrams: poidsG.trim() ? Number(poidsG) : undefined,
          lengthMm: longCm.trim() ? Number(longCm) * 10 : undefined,
          widthMm: largCm.trim() ? Number(largCm) * 10 : undefined,
          heightMm: hautCm.trim() ? Number(hautCm) * 10 : undefined,
          brand: marque.trim() || undefined,
          material: matiere.trim() || undefined,
          condition: etat || undefined,
          variants: showVariants
            ? variants
                .filter((v) => v.label.trim())
                .map((v) => ({
                  label: v.label,
                  priceHTG: Number(v.priceHTG || price),
                  quantity: Number(v.quantity || 0),
                }))
            : undefined,
          fitment:
            fitment.length > 0
              ? fitment
                  .filter((f) => f.modelId && f.yearStart)
                  .map((f) => ({
                    modelId: f.modelId,
                    yearStart: Number(f.yearStart),
                    yearEnd: f.yearEnd ? Number(f.yearEnd) : undefined,
                  }))
              : undefined,
        }),
      });
      const data = await res.json();
      if (!mounted.current) return;
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : listingLabels.error);
        // Physical fitment can fail with 422 AFTER INSERT and a best-effort
        // rollback, so that status must keep the verification requirement.
        if ([400, 401, 403, 429].includes(res.status)) setReview(false);
        return;
      }
      if (!data || data.ok !== true || typeof data.productId !== "string" || !UUID_RE.test(data.productId)
        || typeof data.slug !== "string" || !/^[a-z0-9-]+$/.test(data.slug)) {
        setError(listingLabels.error);
        return;
      }
      setCreatedProductId(data.productId);
      // Keep the existing draft on upload failure and offer an explicit retry.
      if (photo && !(await uploadPhoto(data.productId, photo))) return;
      if (!mounted.current) return;
      clearReview();
      router.push(`/vendre#produit-${data.productId}`);
    } catch {
      if (mounted.current) setError(listingLabels.network);
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function uploadPhoto(productId: string, file: File): Promise<boolean> {
    try {
      const fd = new FormData();
      fd.append("productId", productId);
      fd.append("file", file);
      const response = await fetch("/api/products/cover", { method: "POST", body: fd });
      if (!mounted.current) return false;
      if (!response.ok) throw new Error("cover-upload-failed");
      return true;
    } catch {
      if (mounted.current) setError(listingLabels.photoFailed);
      return false;
    }
  }

  async function retryPhoto() {
    if (!mounted.current || submitting.current || !createdProductId || !UUID_RE.test(createdProductId) || !photo || busy || compressing) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      if (await uploadPhoto(createdProductId, photo)) {
        if (!mounted.current) return;
        clearReview();
        router.push(`/vendre#produit-${createdProductId}`);
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const storageWarning = reviewReady && reviewPersistence === "unavailable"
    ? <p role="status" className="text-sm text-mist">{reviewCopy.physicalUnavailable}</p>
    : null;

  const apercu = photoPreview ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoPreview}
      alt={listingLabels.photoAlt}
      className="h-24 w-24 shrink-0 rounded-xl border border-line object-cover"
    />
  ) : null;

  if (createdProductId) {
    return (
      <section className="space-y-4 rounded-2xl border border-line bg-surface/40 p-5" aria-labelledby="draft-saved">
        {storageWarning}
        <h2 id="draft-saved" className="font-semibold">{listingLabels.saved}</h2>
        <p className="text-sm text-mist">{listingLabels.draftNote}</p>
        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
        <div>
          <div className="flex items-center gap-4">
            {apercu}
            <ChoixPhoto
              texte={listingLabels.photoChoose}
              disabled={busy || compressing}
              onFile={selectPhoto}
            />
          </div>
          <EtatPhoto compressing={compressing} compression={compression} labels={listingLabels} />
        </div>
        <button type="button" onClick={retryPhoto} disabled={busy || compressing || !photo}
          className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand disabled:opacity-60">
          {busy || compressing ? listingLabels.creating : listingLabels.photoRetry}
        </button>
        <Link href={`/vendre#produit-${createdProductId}`} className="flex min-h-11 items-center text-sm text-mist underline hover:text-cloud">
          {listingLabels.manage}
        </Link>
      </section>
    );
  }

  if (reviewReady && review && !busy) {
    return (
      <section className="space-y-4 rounded-2xl border border-line bg-surface/40 p-5">
        {storageWarning}
        <p role="alert" className="text-sm">{reviewCopy.uncertain}</p>
        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
        <a href="/vendre#mes-produits" className="inline-flex min-h-11 items-center text-sm underline">{reviewCopy.checkProducts}</a>
        <button type="button" className="block min-h-11 text-left text-sm underline"
          onClick={() => {
            setReview(false);
            setPolicyOk(false);
            setError(null);
          }}>{reviewCopy.resume}</button>
      </section>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3 rounded-xl border border-danger/50 bg-surface p-4">
        <p role="alert" className="text-sm text-danger-text">{listingLabels.loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold text-cloud hover:border-cloud"
        >
          {listingLabels.reload}
        </button>
      </div>
    );
  }

  const steps = listingLabels.steps;
  const nomsEtapes = [steps.photo, steps.basics, steps.details, steps.save];
  const compte = (i: number) =>
    steps.count.replace("{n}", String(i + 1)).replace("{total}", String(ETAPES.length));
  /** Titre de carte : « 1 sur 4 · Photo », puis la mention obligatoire/recommandée. */
  const titreEtape = (i: number, mention: string, forte: boolean) => (
    <h2 id={`etape-${ETAPES[i]}-titre`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-bold text-cloud">
      <span className="text-sm font-semibold text-mist">{compte(i)}</span>
      <span aria-hidden="true" className="text-mist">·</span>
      <span>{nomsEtapes[i]}</span>
      <Mention texte={mention} forte={forte} />
    </h2>
  );

  return (
    <form onSubmit={submit} className="space-y-5">
      {storageWarning}
      {/* Progression : où l'on est, et combien il en reste (Baymard, 611).
          Une liste ordonnée de liens vers les cartes ; l'étape qui contient
          le focus porte aria-current="step". Aucune bibliothèque. */}
      <nav aria-label={steps.nav}>
        <ol className="grid grid-cols-4 gap-0.5">
          {ETAPES.map((id, i) => (
            <li key={id} className="min-w-0">
              <a
                href={`#etape-${id}`}
                aria-current={etapeActive === i ? "step" : undefined}
                onClick={() => setEtapeActive(i)}
                className="group flex min-h-11 flex-col items-center gap-1 rounded-lg px-0.5 py-1.5 text-center text-xs leading-tight text-mist hover:text-cloud aria-[current=step]:font-semibold aria-[current=step]:text-cloud"
              >
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-sm font-bold group-aria-[current=step]:border-brand group-aria-[current=step]:bg-brand group-aria-[current=step]:text-on-brand"
                >
                  {i + 1}
                </span>
                <span className="sr-only">{compte(i)} </span>
                <span className="max-w-full break-words hyphens-auto">{nomsEtapes[i]}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <fieldset disabled={busy || !reviewReady || review} className="min-w-0 space-y-5">
      {/* ── 1. PHOTO ─────────────────────────────────────────────────── */}
      <section
        id={`etape-${ETAPES[0]}`}
        aria-labelledby={`etape-${ETAPES[0]}-titre`}
        onFocusCapture={() => setEtapeActive(0)}
        className={CARTE}
      >
        {titreEtape(0, listingLabels.recommended, false)}
        <div>
          <div className="flex items-center gap-4">
            {apercu ?? (
              <div aria-hidden="true" className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-line text-3xl text-mist">
                📷
              </div>
            )}
            <ChoixPhoto
              texte={photo ? listingLabels.photoReplace : listingLabels.photoAdd}
              capture
              disabled={busy || compressing}
              onFile={selectPhoto}
            />
          </div>
          <EtatPhoto compressing={compressing} compression={compression} labels={listingLabels} />
        </div>
      </section>

      {/* ── 2. TITRE + PRIX + QUANTITÉ (+ variantes) ─────────────────── */}
      <section
        id={`etape-${ETAPES[1]}`}
        aria-labelledby={`etape-${ETAPES[1]}-titre`}
        onFocusCapture={() => setEtapeActive(1)}
        className={CARTE}
      >
        {titreEtape(1, listingLabels.required, true)}
        <label className="block">
          <span className="text-sm font-semibold">{listingLabels.titleLabel}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={140}
            placeholder={listingLabels.titlePh}
            className={CHAMP}
          />
        </label>

        {/* `justify-end` : « Kantite ki nan stock » passe sur deux lignes à
            360 px, « Pri (HTG) » non — les deux champs restent alignés. */}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col justify-end">
            <span className="text-sm font-semibold">{listingLabels.price}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required={!showVariants}
              disabled={showVariants}
              aria-describedby={showVariants ? "pp-variantes-note" : "pp-net"}
              placeholder="2500"
              className={CHAMP}
            />
          </label>
          <label className="flex min-w-0 flex-col justify-end">
            <span className="text-sm font-semibold">{listingLabels.quantity}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required={!showVariants}
              disabled={showVariants}
              aria-describedby={showVariants ? "pp-variantes-note" : undefined}
              placeholder="10"
              className={CHAMP}
            />
          </label>
        </div>
        {showVariants ? (
          <p id="pp-variantes-note" className="text-xs text-mist">{listingLabels.variants.hint}</p>
        ) : (
          <div id="pp-net">
            <NetEstimate
              pricing={pricing}
              lang={lang}
              priceHTG={price}
              tier={tier}
              rateBpsEnVigueur={rateBpsEnVigueur}
              labels={netLabels}
            />
          </div>
        )}

        <details
          className="rounded-xl border border-line"
          onToggle={(e) => {
            const open = (e.target as HTMLDetailsElement).open;
            setShowVariants(open);
            if (open && variants.length === 0) {
              setVariants([{ label: "", priceHTG: price, quantity: quantity }]);
            }
          }}
        >
          <summary className={RESUME}>
            {listingLabels.variants.title}{" "}
            <span className="font-normal text-mist">({listingLabels.optional})</span>
          </summary>
          <div className="space-y-3 px-3 pb-4 sm:px-4">
            {variants.map((v, i) => (
              <LigneVariante
                key={i}
                index={i}
                variante={v}
                labels={listingLabels.variants}
                onChange={(patch) => updateAt(setVariants, i, patch)}
                onRemove={() => setVariants((vs) => vs.filter((_, j) => j !== i))}
              />
            ))}
            <button
              type="button"
              onClick={() =>
                setVariants((vs) => [...vs, { label: "", priceHTG: price, quantity: "0" }])
              }
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-semibold text-cloud hover:border-cloud"
            >
              <span aria-hidden="true">+</span>
              {listingLabels.variants.add}
            </button>
          </div>
        </details>
      </section>

      {/* ── 3. CATÉGORIE + DÉTAILS (compatibilité, description, specs) ── */}
      <section
        id={`etape-${ETAPES[2]}`}
        aria-labelledby={`etape-${ETAPES[2]}-titre`}
        onFocusCapture={() => setEtapeActive(2)}
        className={CARTE}
      >
        {titreEtape(2, listingLabels.required, true)}
        <label className="block">
          <span id="product-category-label" className="text-sm font-semibold">{listingLabels.category}</span>
          <select
            aria-labelledby="product-category-label"
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
            required
            className={CHAMP}
          >
            <option value="">{listingLabels.choose}</option>
            {grouped.map(({ dep, children }) => (
              <optgroup key={dep.slug} label={libelleCategorie(dep, lang)}>
                {children.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.level === 3 ? "  " : ""}
                    {libelleCategorie(c, lang)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {/* ── COMPATIBILITÉ VÉHICULE (catégories auto/moto seulement) ──── */}
        {isAutoCategory && (
          <FitmentPicker
            models={models}
            fitment={fitment}
            onChange={setFitment}
            labels={listingLabels.fitment}
            mention={listingLabels.recommended}
          />
        )}

        <div>
          {/* « (optionnel) » est HORS du <label> : le nom accessible du champ
              reste « Description du produit », la mention passe en description. */}
          <label htmlFor="product-description" className="text-sm font-semibold text-cloud">
            {listingLabels.description}
          </label>{" "}
          <span id="description-optional" className="text-sm text-mist">({listingLabels.optional})</span>
          <p id="description-hint" className="mt-1 text-sm text-mist">{listingLabels.descriptionHint}</p>
          <textarea
            id="product-description"
            aria-describedby="description-optional description-hint"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={5000}
            className="mt-2 block w-full min-w-0 rounded-xl border border-line bg-ink px-4 py-3 text-sm text-cloud"
          />
          <div className="mt-3">
            <AiDescriptionHelp
              actif={aiActif}
              title={title}
              category={
                categories.find((c) => c.slug === categorySlug)?.label_fr
              }
              labels={aiLabels}
              onSuggestion={setDescription}
            />
          </div>
        </div>

        {/* ── CARACTÉRISTIQUES (V-2, docs/35) — libellés traduits en props ── */}
        <details className="rounded-xl border border-line">
          <summary className={RESUME}>
            {specsLabels.title}
          </summary>
          <div className="space-y-3 px-4 pb-4">
            <label className="block text-xs text-mist">
              {specsLabels.weight}
              <input
                type="number"
                min={1}
                max={200000}
                value={poidsG}
                onChange={(e) => setPoidsG(e.target.value)}
                className={CHAMP_PETIT}
              />
            </label>
            {/* Trois champs, trois noms : un <label> qui les enveloppait tous
                ne nommait que le premier. */}
            <div role="group" aria-labelledby="pp-dims">
              <p id="pp-dims" className="text-xs text-mist">{specsLabels.dims}</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    [longCm, setLongCm, specsLabels.length],
                    [largCm, setLargCm, specsLabels.width],
                    [hautCm, setHautCm, specsLabels.height],
                  ] as const
                ).map(([v, set, nom], i) => (
                  <input
                    key={i}
                    type="number"
                    min={1}
                    max={1000}
                    value={v}
                    onChange={(e) => set(e.target.value)}
                    aria-label={nom}
                    placeholder={nom}
                    className={CHAMP_DIM}
                  />
                ))}
              </div>
            </div>
            {specsEtendues && (
              <>
                <label className="block text-xs text-mist">
                  {specsLabels.brand}
                  <input
                    maxLength={60}
                    value={marque}
                    onChange={(e) => setMarque(e.target.value)}
                    className={CHAMP_PETIT}
                  />
                </label>
                <label className="block text-xs text-mist">
                  {specsLabels.material}
                  <input
                    maxLength={60}
                    value={matiere}
                    onChange={(e) => setMatiere(e.target.value)}
                    className={CHAMP_PETIT}
                  />
                </label>
                <label className="block text-xs text-mist">
                  {specsLabels.condition}
                  <select
                    value={etat}
                    onChange={(e) => setEtat(e.target.value)}
                    className={CHAMP_PETIT}
                  >
                    <option value="">{listingLabels.choose}</option>
                    <option value="nef">{specsLabels.conditionNef}</option>
                    <option value="dezyem-men">{specsLabels.conditionDezyem}</option>
                  </select>
                </label>
              </>
            )}
          </div>
        </details>
      </section>

      {/* ── 4. ENREGISTRER (attestation + brouillon) ─────────────────── */}
      <section
        id={`etape-${ETAPES[3]}`}
        aria-labelledby={`etape-${ETAPES[3]}-titre`}
        onFocusCapture={() => setEtapeActive(3)}
        className={CARTE}
      >
        {titreEtape(3, listingLabels.required, true)}
        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}

        {/* Attestation : obligatoire, jamais pré-cochée. Placée APRÈS le bouton
            serait invisible sur un écran de 360 px — elle vient donc avant. */}
        <label className="flex items-start gap-3 rounded-xl border border-line bg-ink p-4 text-xs text-mist">
          <input
            type="checkbox"
            required
            checked={policyOk}
            onChange={(e) => setPolicyOk(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>
            {policyAccept}{" "}
            <Link href={POLICY_PATH} className="underline hover:text-cloud">
              {policyRead}
            </Link>
          </span>
        </label>

        <button
          type="submit"
          disabled={busy || compressing || !categorySlug}
          className="min-h-11 w-full rounded-xl bg-brand px-5 py-3.5 font-bold text-on-brand disabled:opacity-60"
        >
          {busy ? listingLabels.creating : listingLabels.draft}
        </button>
        <p className="text-xs text-mist">{listingLabels.draftNote}</p>
      </section>
      </fieldset>
    </form>
  );
}

/** Pastille « obligatoire » / « recommandée » d'une carte d'étape. */
function Mention({ texte, forte }: { texte: string; forte: boolean }) {
  return (
    <span
      className={`ml-auto inline-block rounded-full border border-line px-2 py-0.5 text-xs font-semibold first-letter:uppercase ${forte ? "text-cloud" : "text-mist"}`}
    >
      {texte}
    </span>
  );
}

/**
 * Le champ fichier, sans le « Choose File / No file chosen » du navigateur :
 * input VISUELLEMENT masqué (`sr-only`, jamais `hidden` — il resterait hors
 * d'atteinte du clavier), libellé-bouton traduit, anneau de focus porté par le
 * libellé. Même motif que `components/photo-principale.tsx`.
 */
export function ChoixPhoto({
  texte,
  capture = false,
  disabled,
  onFile,
}: {
  texte: string;
  capture?: boolean;
  disabled: boolean;
  onFile: (f: File | null) => void;
}) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line bg-ink px-4 py-2 text-sm font-semibold text-cloud hover:border-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
      {texte}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture={capture ? "environment" : undefined}
        disabled={disabled}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        className="sr-only"
      />
    </label>
  );
}

/**
 * Le vendeur doit COMPRENDRE que la plateforme travaille pour lui : sans ce
 * retour, une attente d'une seconde ressemble à un bug et le gain reste
 * invisible. Dans SA langue — le kreyòl d'abord — et annoncé (`role="status"`).
 */
export function EtatPhoto({
  compressing,
  compression,
  labels,
}: {
  compressing: boolean;
  compression: Compression | null;
  labels: Pick<PhysicalListingLabels, "photoPreparing" | "photoReduced" | "photoLight">;
}) {
  const [avantGras, apresGras] = labels.photoReduced.split("{apres}");
  return (
    <div role="status" className="text-sm">
      {compressing && (
        <p className="mt-2 text-mist">{labels.photoPreparing}</p>
      )}
      {!compressing && compression && compression.apres < compression.avant && (
        <p className="mt-2 text-success-text">
          {avantGras.replace("{avant}", poidsLisible(compression.avant))}
          <strong>{poidsLisible(compression.apres)}</strong>
          {apresGras}
        </p>
      )}
      {!compressing && compression && compression.apres >= compression.avant && (
        <p className="mt-2 text-mist">
          {labels.photoLight.replace("{poids}", poidsLisible(compression.avant))}
        </p>
      )}
    </div>
  );
}

/**
 * Une variante. Sous `sm` (360 px) : une CARTE — le nom en pleine largeur,
 * puis prix et stock côte à côte, et « retirer » à 44 px. La grille sur une
 * ligne (`1fr 90px 80px 36px`) laissait 56 px au nom, mesuré (audit m1).
 * À partir de `sm`, la rangée revient : le conteneur intérieur passe en
 * `contents` et ses trois enfants rejoignent la grille.
 */
export function LigneVariante({
  index,
  variante,
  labels,
  onChange,
  onRemove,
}: {
  index: number;
  variante: Variant;
  labels: VariantLabels;
  onChange: (patch: Partial<Variant>) => void;
  onRemove: () => void;
}) {
  const n = String(index + 1);
  const nom = variante.label.trim();
  const retirer = nom
    ? labels.removeNamed.replace("{libelle}", nom)
    : labels.remove.replace("{n}", n);
  return (
    <div
      role="group"
      aria-label={labels.group.replace("{n}", n)}
      className="space-y-2 rounded-xl border border-line p-3 sm:grid sm:grid-cols-[minmax(0,1fr)_6rem_5rem_2.75rem] sm:items-end sm:gap-2 sm:space-y-0 sm:border-0 sm:p-0"
    >
      <label className="block min-w-0 text-xs text-mist">
        {labels.name}
        <input
          value={variante.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={labels.namePh}
          className={CHAMP_PETIT}
        />
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] items-end gap-2 sm:contents">
        <label className="block min-w-0 text-xs text-mist">
          {labels.price}
          <input
            type="number"
            min={1}
            value={variante.priceHTG}
            onChange={(e) => onChange({ priceHTG: e.target.value })}
            className={CHAMP_PETIT}
          />
        </label>
        <label className="block min-w-0 text-xs text-mist">
          {labels.stock}
          <input
            type="number"
            min={0}
            value={variante.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            className={CHAMP_PETIT}
          />
        </label>
        <button
          type="button"
          aria-label={retirer}
          onClick={onRemove}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line text-lg text-mist hover:border-cloud hover:text-cloud"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}

/** Sélecteur de compatibilité : marque → modèle → années, 3 taps par ligne. */
export function FitmentPicker({
  models,
  fitment,
  onChange,
  labels,
  mention,
}: {
  models: VehicleModel[];
  fitment: Fitment[];
  onChange: (f: Fitment[]) => void;
  labels: FitmentLabels;
  /** « recommandée » : la compatibilité n'est pas exigée, elle fait vendre. */
  mention: string;
}) {
  const makes = useMemo(
    () => [...new Set(models.map((m) => `${m.kind}:${m.make}`))],
    [models]
  );
  const [make, setMake] = useState("");
  const byMake = models.filter((m) => `${m.kind}:${m.make}` === make);

  const years = useMemo(() => {
    const ys: number[] = [];
    for (let y = CURRENT_YEAR; y >= 1990; y--) ys.push(y);
    return ys;
  }, []);

  return (
    <div className="rounded-xl border border-brand/40 p-4">
      <p className="text-sm font-semibold text-cloud">
        {labels.title}{" "}
        <span className="font-normal text-mist">({mention})</span>
      </p>
      <p className="mt-1 text-xs text-mist">{labels.hint}</p>

      {/* 3 taps : marque → modèle (l'ajout pose années par défaut) → ajuster */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <select
          value={make}
          onChange={(e) => setMake(e.target.value)}
          aria-label={labels.makeAria}
          className={CHAMP_PETIT}
        >
          <option value="">{labels.make}</option>
          {makes.map((mk) => (
            <option key={mk} value={mk}>
              {mk.startsWith("moto:") ? "🏍️ " : "🚗 "}
              {mk.split(":")[1]}
            </option>
          ))}
        </select>
        <select
          value=""
          disabled={!make}
          aria-label={labels.modelAria}
          onChange={(e) => {
            if (!e.target.value) return;
            onChange([
              ...fitment,
              // Années par défaut larges (2000 → aujourd'hui) : ajustables
              // ensuite sur la ligne — l'ajout reste un seul tap.
              { modelId: e.target.value, yearStart: "2000", yearEnd: "" },
            ]);
          }}
          className={CHAMP_PETIT}
        >
          <option value="">{labels.model}</option>
          {byMake.map((m) => (
            <option key={m.id} value={m.id}>
              {m.model}
            </option>
          ))}
        </select>
      </div>

      {/* Un véhicule = une carte : son nom, « retirer » à 44 px, ses années. */}
      {fitment.length > 0 && (
        <ul className="mt-3 space-y-2">
          {fitment.map((f, i) => {
            const m = models.find((x) => x.id === f.modelId);
            const vehicule = m ? `${m.make} ${m.model}` : "?";
            return (
              <li key={i} className="rounded-xl bg-ink p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 text-sm font-semibold text-cloud">{vehicule}</span>
                  <button
                    type="button"
                    aria-label={labels.remove.replace("{vehicule}", vehicule)}
                    onClick={() => onChange(fitment.filter((_, j) => j !== i))}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-lg text-mist hover:text-cloud"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    value={f.yearStart}
                    aria-label={labels.fromAria.replace("{vehicule}", vehicule)}
                    onChange={(e) =>
                      onChange(
                        fitment.map((x, j) => (j === i ? { ...x, yearStart: e.target.value } : x))
                      )
                    }
                    className={CHAMP_PETIT}
                  >
                    {years.map((y) => (
                      <option key={y} value={String(y)}>
                        {labels.from.replace("{annee}", String(y))}
                      </option>
                    ))}
                  </select>
                  <select
                    value={f.yearEnd}
                    aria-label={labels.untilAria.replace("{vehicule}", vehicule)}
                    onChange={(e) =>
                      onChange(
                        fitment.map((x, j) => (j === i ? { ...x, yearEnd: e.target.value } : x))
                      )
                    }
                    className={CHAMP_PETIT}
                  >
                    <option value="">{labels.untilNow}</option>
                    {years.map((y) => (
                      <option key={y} value={String(y)}>
                        {labels.until.replace("{annee}", String(y))}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── utilitaires ──────────────────────────────────────────────────────────────

function updateAt(
  set: React.Dispatch<React.SetStateAction<Variant[]>>,
  i: number,
  patch: Partial<Variant>
) {
  set((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
}
