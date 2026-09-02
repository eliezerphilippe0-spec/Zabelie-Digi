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
  reqHint: string;
  reqPh: string;
  reqBtn: string;
  reqOk: string;
  reqDup: string;
  reqErr: string;
};

/** Étiquettes des cinq champs de base — fournies par la page, en langue de
 *  session. Elles étaient en français EN DUR ici (audit UX 2026-09-02, #4). */
export type ProfileLabels = {
  name: string;
  avatar: string;
  country: string;
  department: string;
  bio: string;
  optional: string;
};

export function ProfileForm({
  initial,
  zones = [],
  zoneLabels,
  labels,
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
  labels: ProfileLabels;
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

  // PR-Z4 (Z-C) : le katye manquant se PROPOSE — rien ne naît côté client,
  // la demande part en modération (/api/zones/request, table 0070).
  const [reqNom, setReqNom] = useState("");
  const [reqMsg, setReqMsg] = useState<string | null>(null);
  const [reqBusy, setReqBusy] = useState(false);

  async function demanderKatye() {
    if (!zk || reqNom.trim().length < 2 || !zoneLabels) return;
    setReqBusy(true);
    setReqMsg(null);
    try {
      const res = await fetch("/api/zones/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kominId: zk, nom: reqNom.trim() }),
      });
      if (res.ok) {
        setReqMsg(zoneLabels.reqOk);
        setReqNom("");
      } else if (res.status === 409) {
        setReqMsg(zoneLabels.reqDup);
      } else {
        setReqMsg(zoneLabels.reqErr);
      }
    } catch {
      setReqMsg(zoneLabels.reqErr);
    } finally {
      setReqBusy(false);
    }
  }

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
      {/* Étiquettes VISIBLES au-dessus de chaque champ (audit UX 2026-09-02,
          #4 ; skill §4.6 « jamais le placeholder comme étiquette »), et en
          langue de session : « Nom d'affichage », « Pays », « Bio — présente
          ton talent » étaient en français en dur — un vendeur kreyòl
          remplissait un formulaire qu'il ne pouvait pas lire. */}
      <div className="space-y-1">
        <label htmlFor="profil-nom" className="block text-sm text-mist">
          {labels.name}
        </label>
        <input
          id="profil-nom"
          className={input}
          value={form.display_name}
          onChange={(e) => set("display_name", e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="profil-avatar" className="block text-sm text-mist">
          {labels.avatar}
        </label>
        <input
          id="profil-avatar"
          className={input}
          inputMode="url"
          value={form.avatar_url}
          onChange={(e) => set("avatar_url", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="profil-pays" className="block text-sm text-mist">
          {labels.country} <span className="text-mist/80">({labels.optional})</span>
        </label>
        <select
          id="profil-pays"
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
        >
          <option value="">—</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {form.country_code === "HT" && (
        <div className="space-y-1">
          <label htmlFor="profil-departement" className="block text-sm text-mist">
            {labels.department} <span className="text-mist/80">({labels.optional})</span>
          </label>
          <select
            id="profil-departement"
            className={input}
            value={form.region_code}
            onChange={(e) => set("region_code", e.target.value)}
          >
            <option value="">—</option>
            {HT_DEPARTMENTS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor="profil-bio" className="block text-sm text-mist">
          {labels.bio}
        </label>
        <textarea
          id="profil-bio"
          className={input}
          rows={3}
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
        />
      </div>

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

          {/* Katye manquant → demande modérée (PR-Z4, Z-C). Visible dès
              qu'une komin est choisie : c'est là qu'on découvre le manque. */}
          {zk && (
            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-xs text-mist">{zoneLabels.reqHint}</p>
              <div className="flex gap-2">
                <input
                  className={input}
                  maxLength={80}
                  placeholder={zoneLabels.reqPh}
                  value={reqNom}
                  onChange={(e) => setReqNom(e.target.value)}
                />
                <button
                  type="button"
                  onClick={demanderKatye}
                  disabled={reqBusy || reqNom.trim().length < 2}
                  className="whitespace-nowrap rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-cloud transition hover:border-violet disabled:opacity-60"
                >
                  {reqBusy ? "…" : zoneLabels.reqBtn}
                </button>
              </div>
              {reqMsg && <p className="text-xs text-mist">{reqMsg}</p>}
            </div>
          )}
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
