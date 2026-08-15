import { AdminShell } from "@/components/admin/admin-shell";
import { getCurrentUser } from "@/lib/auth";
import { KycAdmin } from "./kyc-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vérifications — Admin Zabelie" };

/**
 * Revue des dossiers d'identité (docs/35 V-6).
 *
 * La liste et les URLs signées sont chargées par le CLIENT, depuis
 * `/api/admin/kyc` : une URL signée vit cinq minutes, la faire produire au
 * rendu serveur d'une page reviendrait à la périmer avant d'être cliquée.
 * Chaque décision est journalisée dans `zabelie_admin_actions` (0055) par la
 * route — sur un dossier d'identité, savoir qui a décidé est le minimum.
 */
export default async function AdminKycPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <AdminShell title="Vérifications" actif="/admin/kyc">
        <p className="mt-6 text-sm text-mist">
          Accès réservé. Pour devenir admin :{" "}
          <code>profiles.role = &apos;admin&apos;</code> en base.
        </p>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Vérifications" actif="/admin/kyc">
      <p className="mt-2 text-sm text-mist">
        Vérification manuelle des pièces d&apos;identité — aucune API publique
        haïtienne n&apos;existe pour l&apos;automatiser. Les pièces
        s&apos;ouvrent par lien signé, valable cinq minutes, et sont purgées
        après la durée de rétention configurée.
      </p>
      <KycAdmin />
    </AdminShell>
  );
}
