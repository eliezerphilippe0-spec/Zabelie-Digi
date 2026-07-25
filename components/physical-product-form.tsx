"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Création d'un produit physique (chantier B — UI vendeur).
 *
 * Chemin nominal : PHOTO → PRIX → QUANTITÉ → PUBLIER, en moins d'une minute.
 * Tout le reste est un dépliage optionnel :
 *   - variantes (un filtre à huile n'a ni couleur ni capacité) ;
 *   - compatibilité véhicule (3 taps : marque → modèle → années), affichée
 *     seulement pour les catégories auto/moto.
 *
 * La photo est capturée AVANT la création (input capture) mais envoyée APRÈS
 * (la route cover exige un productId) — le vendeur ne voit qu'une étape.
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

const CURRENT_YEAR = new Date().getFullYear();

export function PhysicalProductForm() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [description, setDescription] = useState("");

  const [showVariants, setShowVariants] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [fitment, setFitment] = useState<Fitment[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/products/physical")
      .then((r) => r.json())
      .then((d) => {
        setCategories(d.categories ?? []);
        setModels(d.models ?? []);
      })
      .catch(() => setLoadError(true));
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

  function selectPhoto(f: File | null) {
    setPhoto(f);
    setPhotoPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return f ? URL.createObjectURL(f) : null;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/products/physical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          priceHTG: Number(price),
          quantity: Number(quantity),
          categorySlug,
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
      if (!res.ok) {
        setError(data.error ?? "Création échouée.");
        return;
      }
      // La photo part maintenant (best-effort : le produit existe même si
      // l'upload échoue — le vendeur peut la reprendre depuis sa fiche).
      if (photo) {
        const fd = new FormData();
        fd.append("productId", data.productId);
        fd.append("file", photo);
        await fetch("/api/products/cover", { method: "POST", body: fd }).catch(
          () => undefined
        );
      }
      router.push(`/produit/${data.slug}`);
    } catch {
      setError("Connexion impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <p className="rounded-xl border border-danger/50 bg-surface/60 p-4 text-sm text-danger-text">
        Impossible de charger les catégories. Vérifiez la connexion puis rechargez.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* ── 1. PHOTO ─────────────────────────────────────────────────── */}
      <label className="block">
        <span className="text-sm font-semibold">Photo du produit</span>
        <div className="mt-2 flex items-center gap-4">
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoPreview}
              alt="Aperçu"
              className="h-24 w-24 rounded-xl border border-line object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-line text-3xl text-mist">
              📷
            </div>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(e) => selectPhoto(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </div>
      </label>

      {/* ── 2. TITRE + PRIX + QUANTITÉ ───────────────────────────────── */}
      <label className="block">
        <span className="text-sm font-semibold">Titre</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={140}
          placeholder="Ex. Plaquettes de frein avant Corolla"
          className="mt-1 w-full rounded-xl border border-line bg-ink px-4 py-3"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-semibold">Prix (HTG)</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required={!showVariants}
            disabled={showVariants}
            placeholder="2500"
            className="mt-1 w-full rounded-xl border border-line bg-ink px-4 py-3 disabled:opacity-50"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Quantité en stock</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required={!showVariants}
            disabled={showVariants}
            placeholder="10"
            className="mt-1 w-full rounded-xl border border-line bg-ink px-4 py-3 disabled:opacity-50"
          />
        </label>
      </div>

      {/* ── 3. CATÉGORIE ─────────────────────────────────────────────── */}
      <label className="block">
        <span className="text-sm font-semibold">Catégorie</span>
        <select
          value={categorySlug}
          onChange={(e) => setCategorySlug(e.target.value)}
          required
          className="mt-1 w-full rounded-xl border border-line bg-ink px-4 py-3"
        >
          <option value="">Choisir…</option>
          {grouped.map(({ dep, children }) => (
            <optgroup key={dep.slug} label={`${dep.label_fr} · ${dep.label_kr}`}>
              {children.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.level === 3 ? "  " : ""}
                  {c.label_fr}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {/* ── COMPATIBILITÉ VÉHICULE (catégories auto/moto seulement) ──── */}
      {isAutoCategory && (
        <FitmentPicker models={models} fitment={fitment} onChange={setFitment} />
      )}

      {/* ── DÉPLIAGES OPTIONNELS ─────────────────────────────────────── */}
      <details className="rounded-xl border border-line bg-surface/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-cloud">
          Description (optionnel)
        </summary>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={5000}
          className="mt-3 w-full rounded-xl border border-line bg-ink px-4 py-3 text-sm"
        />
      </details>

      <details
        className="rounded-xl border border-line bg-surface/40 p-4"
        onToggle={(e) => {
          const open = (e.target as HTMLDetailsElement).open;
          setShowVariants(open);
          if (open && variants.length === 0) {
            setVariants([{ label: "", priceHTG: price, quantity: quantity }]);
          }
        }}
      >
        <summary className="cursor-pointer text-sm font-semibold text-cloud">
          Variantes — tailles, couleurs, contenances (optionnel)
        </summary>
        <div className="mt-3 space-y-3">
          {variants.map((v, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_80px_36px] items-end gap-2">
              <label className="text-xs text-mist">
                Libellé
                <input
                  value={v.label}
                  onChange={(e) => updateAt(setVariants, i, { label: e.target.value })}
                  placeholder="Ex. 250 ml / Rouge / M"
                  className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-mist">
                Prix
                <input
                  type="number"
                  min={1}
                  value={v.priceHTG}
                  onChange={(e) => updateAt(setVariants, i, { priceHTG: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-mist">
                Stock
                <input
                  type="number"
                  min={0}
                  value={v.quantity}
                  onChange={(e) => updateAt(setVariants, i, { quantity: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                aria-label="Retirer la variante"
                onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}
                className="h-9 rounded-lg border border-line text-mist"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setVariants((vs) => [...vs, { label: "", priceHTG: price, quantity: "0" }])
            }
            className="rounded-lg border border-line px-3 py-1.5 text-sm"
          >
            + Ajouter une variante
          </button>
        </div>
      </details>

      {error && <p className="text-sm text-danger-text">{error}</p>}

      {/* ── 4. PUBLIER ───────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={busy || !categorySlug}
        className="w-full rounded-xl bg-brand px-5 py-3.5 font-bold text-ink disabled:opacity-60"
      >
        {busy ? "Publication…" : "Publier le produit"}
      </button>
    </form>
  );
}

/** Sélecteur de compatibilité : marque → modèle → années, 3 taps par ligne. */
function FitmentPicker({
  models,
  fitment,
  onChange,
}: {
  models: VehicleModel[];
  fitment: Fitment[];
  onChange: (f: Fitment[]) => void;
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
    <div className="rounded-xl border border-brand/40 bg-surface/40 p-4">
      <p className="text-sm font-semibold">Compatibilité véhicule</p>
      <p className="mt-1 text-xs text-mist">
        Une pièce sans compatibilité est presque invendable — et l&apos;acheteur a
        déjà payé quand il découvre l&apos;erreur. Ajoutez chaque véhicule
        compatible.
      </p>

      {fitment.length > 0 && (
        <ul className="mt-3 space-y-1">
          {fitment.map((f, i) => {
            const m = models.find((x) => x.id === f.modelId);
            return (
              <li
                key={i}
                className="flex items-center justify-between rounded-lg bg-ink px-3 py-2 text-sm"
              >
                <span>
                  {m ? `${m.make} ${m.model}` : "?"} · {f.yearStart}
                  {f.yearEnd ? `–${f.yearEnd}` : "+"}
                </span>
                <button
                  type="button"
                  aria-label="Retirer"
                  onClick={() => onChange(fitment.filter((_, j) => j !== i))}
                  className="text-mist"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 3 taps : marque → modèle (l'ajout pose années par défaut) → ajuster */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <select
          value={make}
          onChange={(e) => setMake(e.target.value)}
          className="rounded-lg border border-line bg-ink px-3 py-2 text-sm"
        >
          <option value="">Marque…</option>
          {makes.map((mk) => (
            <option key={mk} value={mk}>
              {mk.startsWith("moto:") ? "🏍 " : "🚗 "}
              {mk.split(":")[1]}
            </option>
          ))}
        </select>
        <select
          value=""
          disabled={!make}
          onChange={(e) => {
            if (!e.target.value) return;
            onChange([
              ...fitment,
              // Années par défaut larges (2000 → aujourd'hui) : ajustables
              // ensuite sur la ligne — l'ajout reste un seul tap.
              { modelId: e.target.value, yearStart: "2000", yearEnd: "" },
            ]);
          }}
          className="rounded-lg border border-line bg-ink px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="">Modèle…</option>
          {byMake.map((m) => (
            <option key={m.id} value={m.id}>
              {m.model}
            </option>
          ))}
        </select>
      </div>

      {fitment.length > 0 && (
        <div className="mt-2 space-y-2">
          {fitment.map((f, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <select
                value={f.yearStart}
                onChange={(e) =>
                  onChange(
                    fitment.map((x, j) => (j === i ? { ...x, yearStart: e.target.value } : x))
                  )
                }
                className="rounded-lg border border-line bg-ink px-3 py-2 text-xs"
              >
                {years.map((y) => (
                  <option key={y} value={String(y)}>
                    depuis {y}
                  </option>
                ))}
              </select>
              <select
                value={f.yearEnd}
                onChange={(e) =>
                  onChange(
                    fitment.map((x, j) => (j === i ? { ...x, yearEnd: e.target.value } : x))
                  )
                }
                className="rounded-lg border border-line bg-ink px-3 py-2 text-xs"
              >
                <option value="">jusqu&apos;à aujourd&apos;hui</option>
                {years.map((y) => (
                  <option key={y} value={String(y)}>
                    jusqu&apos;à {y}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
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
