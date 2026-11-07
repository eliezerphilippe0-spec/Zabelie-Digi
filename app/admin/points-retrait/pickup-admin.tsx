"use client";

import { useEffect, useState } from "react";

type Point = {
  id: string;
  nom: string;
  adresse: string;
  telefon: string | null;
  actif: boolean;
};

/** Liste + création + ouverture/fermeture. Convention admin : français. */
export function PickupAdmin() {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [adresse, setAdresse] = useState("");
  const [telefon, setTelefon] = useState("");
  const [busy, setBusy] = useState(false);

  async function charger() {
    try {
      const r = await fetch("/api/admin/pickup-points");
      const data = await r.json();
      if (!r.ok) {
        setMessage(typeof data.error === "string" ? data.error : "Lecture échouée");
        setPoints([]);
        return;
      }
      setPoints(data.points);
    } catch {
      setMessage("Réseau indisponible");
      setPoints([]);
    }
  }
  useEffect(() => {
    charger();
  }, []);

  async function creer() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/admin/pickup-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", nom, adresse, telefon: telefon || undefined }),
      });
      const data = await r.json();
      if (!r.ok) {
        setMessage(typeof data.error === "string" ? data.error : "Création échouée");
        return;
      }
      setNom("");
      setAdresse("");
      setTelefon("");
      await charger();
    } finally {
      setBusy(false);
    }
  }

  async function basculer(p: Point) {
    setBusy(true);
    try {
      await fetch("/api/admin/pickup-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_active", id: p.id, active: !p.actif }),
      });
      await charger();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-line p-4">
        <p className="text-sm font-semibold text-cloud">Nouveau point</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Nom de la boutique"
            className="champ w-56"
          />
          <input
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            placeholder="Adresse (rue, commune)"
            className="champ w-80"
          />
          <input
            value={telefon}
            onChange={(e) => setTelefon(e.target.value)}
            placeholder="Téléphone (optionnel)"
            className="champ w-44"
          />
          <button
            onClick={creer}
            disabled={busy || !nom.trim() || !adresse.trim()}
            className="bouton bouton-primaire bouton-compact"
          >
            Créer (fermé)
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-danger-text">{message}</p>}

      {points === null ? (
        <p className="text-sm text-mist">Chargement…</p>
      ) : points.length === 0 ? (
        <p className="text-sm text-mist">
          Aucun point. Le répertoire attend le premier accord de boutique.
        </p>
      ) : (
        <ul className="space-y-2">
          {points.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-cloud">
                  {p.nom}{" "}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
                      p.actif ? "bg-brand text-on-brand" : "border border-line text-mist"
                    }`}
                  >
                    {p.actif ? "ouvert" : "fermé"}
                  </span>
                </p>
                <p className="text-xs text-mist">
                  {p.adresse}
                  {p.telefon ? ` · ${p.telefon}` : ""}
                </p>
              </div>
              <button
                onClick={() => basculer(p)}
                disabled={busy}
                className="bouton bouton-secondaire bouton-compact"
              >
                {p.actif ? "Fermer" : "Ouvrir"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
