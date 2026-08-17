import { AdminShell } from "@/components/admin/admin-shell";
import { getCurrentUser } from "@/lib/auth";
import { PickupAdmin } from "./pickup-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Points de retrait — Admin Zabelie" };

/**
 * Répertoire des points de retrait partenaires (docs/37, 0082).
 *
 * Le recrutement des boutiques est un travail d'OPÉRATIONS — cette page ne
 * fait que le porter. Un point naît FERMÉ : il s'ouvre quand l'accord avec
 * la boutique est réel, pas quand la ligne existe. L'acheteur ne voit que
 * les points ouverts (RLS `actif`).
 */
export default async function AdminPickupPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <AdminShell title="Points de retrait" actif="/admin/points-retrait">
        <p className="mt-6 text-sm text-mist">
          Accès réservé. Pour devenir admin :{" "}
          <code>profiles.role = &apos;admin&apos;</code> en base.
        </p>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Points de retrait" actif="/admin/points-retrait">
      <p className="mt-2 text-sm text-mist">
        Le modèle « station » de Jumia, sans le capital : une boutique
        partenaire reçoit les colis. Un point créé est <strong>fermé</strong>{" "}
        par défaut — ouvrez-le quand l&apos;accord est signé. Le câblage
        acheteur (choisir un point à la livraison) viendra quand des points
        existeront.
      </p>
      <PickupAdmin />
    </AdminShell>
  );
}
