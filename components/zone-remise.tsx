"use client";

import { useState } from "react";
import type { ZoneOption } from "@/components/profile-form";
import { reserveZoneRemise, zoneEffective } from "@/lib/zone-remise";

/**
 * « Où le vendeur doit-il remettre ? » — la zone de REMISE de la commande (0161).
 *
 * Tous les libellés arrivent en props, résolus côté serveur : un composant client
 * ne lit pas le cookie de langue (tests/i18n-client-discipline.test.ts).
 *
 * Ce n'est pas la zone de l'acheteur : un acheteur de la diaspora commande pour un
 * proche resté en Haïti. Elle se choisit à chaque commande (le cookie de zone ne la
 * préremplit pas : la politique ne le déclare que pour classer les offres), et un
 * département seul ne vaut rien (commune minimum, comme la base).
 *
 * La réserve « le vendeur ne déclare pas livrer ici » est une INFORMATION : elle
 * n'empêche ni le choix ni l'achat — le vendeur peut accepter une zone qu'il n'a
 * pas déclarée, et un vendeur qui n'a rien déclaré n'a pas de réserve du tout.
 */
export type ZoneRemiseLabels = {
  title: string;
  hint: string;
  depatman: string;
  komin: string;
  katye: string;
  allDepatman: string;
  allKomin: string;
  /** Département choisi sans commune. */
  needKomin: string;
  /** Le vendeur a déclaré des zones et aucune ne recouvre celle-ci. */
  notCovered: string;
};

const SELECT = "min-h-11 w-full rounded-xl border border-line bg-ink/40 px-3 text-sm outline-none focus:border-accent";

export function ZoneRemise({ zones, couverture, labels, disabled, onChange }: {
  zones: ZoneOption[];
  /** Zones que le vendeur DÉCLARE desservir ; vide = rien déclaré (aucune réserve). */
  couverture: string[];
  labels: ZoneRemiseLabels;
  disabled?: boolean;
  onChange: (zoneId: string | null) => void;
}) {
  const [sel, setSel] = useState({ departement: "", commune: "", quartier: "" });
  const communes = zones.filter((z) => z.level === "komin" && z.parent_id === sel.departement);
  const quartiers = zones.filter((z) => z.level === "katye" && z.parent_id === sel.commune);
  const effective = zoneEffective(zones, sel.departement, sel.commune, sel.quartier);

  function maj(prochain: typeof sel) {
    setSel(prochain);
    onChange(zoneEffective(zones, prochain.departement, prochain.commune, prochain.quartier));
  }

  return (
    <fieldset className="mb-5 space-y-3 rounded-xl border border-line p-4" disabled={disabled}>
      <legend className="px-1 text-sm font-semibold">{labels.title}</legend>
      <p className="text-xs text-mist">{labels.hint}</p>
      <select className={SELECT} value={sel.departement} aria-label={labels.depatman}
        onChange={(e) => maj({ departement: e.target.value, commune: "", quartier: "" })}>
        <option value="">{labels.depatman}</option>
        {zones.filter((z) => z.level === "depatman").map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
      </select>
      {sel.departement && communes.length > 0 ? (
        <select className={SELECT} value={sel.commune} aria-label={labels.komin}
          onChange={(e) => maj({ ...sel, commune: e.target.value, quartier: "" })}>
          <option value="">{labels.allDepatman}</option>
          {communes.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
        </select>
      ) : null}
      {sel.commune && quartiers.length > 0 ? (
        <select className={SELECT} value={sel.quartier} aria-label={labels.katye}
          onChange={(e) => maj({ ...sel, quartier: e.target.value })}>
          <option value="">{labels.allKomin}</option>
          {quartiers.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
        </select>
      ) : null}
      {sel.departement && !sel.commune ? <p role="status" className="text-xs text-mist">{labels.needKomin}</p> : null}
      {reserveZoneRemise(zones, couverture, effective) ? (
        <p role="status" className="rounded-lg border border-line p-3 text-xs text-mist">{labels.notCovered}</p>
      ) : null}
    </fieldset>
  );
}
