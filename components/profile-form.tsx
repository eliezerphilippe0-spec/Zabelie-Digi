"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COUNTRIES } from "@/lib/geo/countries";
import { HT_DEPARTMENTS } from "@/lib/geo/haiti";

/** Une zone telle que le serveur la sert au client : libellé déjà localisé. */
export type ZoneOption = {
  id: string;
  parent_id: string | null;
  level: "depatman" | "komin" | "katye";
  label: string;
};

export type ZoneLabels = {
  title: string;
  hint: string;
  depatman: string;
  komin: string;
  katye: string;
  pwen: string;
  pwenPh: string;
  all: string;
};

export function ProfileForm({
  initial,
  zones = [],
  zoneLabels,
}: {
  initial: {
    display_name: string;
    bio: string;
    avatar_url: string;
    country_code: string;
    region_code: string;
    zone_id: string;
    pwen_repe: string;
  };
  zones?: ZoneOption[];
  zoneLabels?: ZoneLabels;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // PR-Z3 (docs/33 §4) : la cascade Depatman → Komin → Katye, reconstituée
  // depuis la zone déclarée (komin ou katye — jamais un depatman seul,
  // ZB069). La liste vient du serveur, libellés déjà localisés.
  const parId = new Map(zones.map((z) => [z.id, z]));
  const initiale = parId.get(initial.zone_id);
  const [zq, setZq] = useState(initiale?.level === "katye" ? initiale.id : "");
  const [zk, setZk] = useState(
    initiale?.level === "komin"
      ? initiale.id
      : initiale?.level === "katye"
        ? (initiale.parent_id ?? "")
        : "",
  );
  const [zd, setZd] = useState(parId.get(zk)?.parent_id ?? "");
  const komins = zones.filter((z) => z.level === "komin" && z.parent_id === zd);
  const katyes = zones.filter((z) => z.level === "katye" && z.parent_id === zk);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // La zone déclarée = la plus profonde choisie, komin MINIMUM : un
        // depatman seul ne suffit pas (ZB069) et vaut « pas de zone ».
        // `zone_id` part TOUJOURS, même vide : c'est ce qui déclenche le
        // trigger de cohérence côté base (zone posée → region_code dérivé ;
        // zone vide → le département saisi ci-dessous reste maître).
        body: JSON.stringify({ ...form, zone_id: zq || zk || "" }),
      });
      const data = await res.json();
      setMsg(res.ok ? "Profil mis à jour." : (data.error ?? "Échec."));
      if (res.ok) router.refresh();
    } catch {
      setMsg("Connexion impossible.");
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-xl border border-line bg-ink/40 px-4 py-3 text-sm outline-none focus:border-violet";

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        className={input}
        placeholder="Nom d'affichage"
        value={form.display_name}
        onChange={(e) => set("display_name", e.target.value)}
        required
      />
      <input
        className={input}
        placeholder="URL de l'avatar (optionnel)"
        value={form.avatar_url}
        onChange={(e) => set("avatar_url", e.target.value)}
      />
      <select
        className={input}
        value={form.country_code}
        onChange={(e) => {
          const country = e.target.value;
          // Le département n'existe qu'en Haïti : on le réinitialise sinon.
          setForm((f) => ({
            ...f,
            country_code: country,
            region_code: country === "HT" ? f.region_code : "",
          }));
        }}
        aria-label="Pays"
      >
        <option value="">Pays (optionnel)</option>
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
      {form.country_code === "HT" && (
        <select
          className={input}
          value={form.region_code}
          onChange={(e) => set("region_code", e.target.value)}
          aria-label="Département"
        >
          <option value="">Département (optionnel)</option>
          {HT_DEPARTMENTS.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </select>
      )}
      <textarea
        className={input}
        rows={3}
        placeholder="Bio — présente ton talent"
        value={form.bio}
        onChange={(e) => set("bio", e.target.value)}
      />

      {/* « Ki kote ou ye ? » (PR-Z3) — visible seulement si la liste des
          zones est arrivée (0069 en base) ET les libellés fournis. */}
      {zones.length > 0 && zoneLabels && (
        <fieldset className="space-y-3 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold">{zoneLabels.title}</legend>
          <p className="text-xs text-mist">{zoneLabels.hint}</p>
          <select
            className={input}
            value={zd}
            aria-label={zoneLabels.depatman}
            onChange={(e) => {
              setZd(e.target.value);
              setZk("");
              setZq("");
            }}
          >
            <option value="">{zoneLabels.all}</option>
            {zones
              .filter((z) => z.level === "depatman")
              .map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
          </select>
          {komins.length > 0 && (
            <select
              className={input}
              value={zk}
              aria-label={zoneLabels.komin}
              onChange={(e) => {
                setZk(e.target.value);
                setZq("");
              }}
            >
              <option value="">{zoneLabels.komin}</option>
              {komins.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
          )}
          {katyes.length > 0 && (
            <select
              className={input}
              value={zq}
              aria-label={zoneLabels.katye}
              onChange={(e) => setZq(e.target.value)}
            >
              <option value="">{zoneLabels.katye}</option>
              {katyes.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
          )}
          <input
            className={input}
            maxLength={200}
            placeholder={zoneLabels.pwenPh}
            aria-label={zoneLabels.pwen}
            value={form.pwen_repe}
            onChange={(e) => set("pwen_repe", e.target.value)}
          />
        </fieldset>
      )}
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-cloud px-5 py-2.5 text-sm font-semibold text-ink transition hover:opacity-90 disabled:opacity-60"
      >
        {loading ? "…" : "Enregistrer"}
      </button>
      {msg && <p className="text-xs text-mist">{msg}</p>}
    </form>
  );
}
