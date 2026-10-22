import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { lireTableauEssayage } from "@/lib/essayage/admin";
import { EssayageAdmin } from "./essayage-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Essayage virtuel — Admin Zabelie" };

/**
 * Essayage virtuel (docs/74 §2.7, tâche 5.1) : compteur du mois, réglages du
 * pilote (plafond, quota, pause) et vendeurs pilotes. Les gestes passent par
 * `POST /api/admin/essayage`, qui revérifie l'accès et journalise.
 *
 * Tant que la migration 0150 n'est pas appliquée, la base ne répond pas et la
 * page le dit au lieu de casser.
 */
export default async function AdminEssayagePage() {
  const user = await getAdminUser();
  if (!user || user.role !== "admin") {
    return (
      <AdminShell title="Essayage virtuel" actif="/admin/essayage">
        <p className="mt-6 text-sm text-mist">
          Accès réservé. Pour devenir admin : <code>profiles.role = &apos;admin&apos;</code> en base.
        </p>
      </AdminShell>
    );
  }

  const admin = createAdminClient();
  const [tableau, { data: vendeurs }] = await Promise.all([
    lireTableauEssayage(admin),
    admin.from("profiles").select("id, display_name").eq("role", "creator").order("display_name", { ascending: true }).limit(500),
  ]);

  return (
    <AdminShell title="Essayage virtuel" actif="/admin/essayage" userName={user.displayName}>
      <p className="mt-2 text-sm text-mist">
        Le pilote d&apos;essayage : seules les fiches des vendeurs pilotes, dans les sous-rayons ouverts, proposent
        l&apos;essai. Zabelie paie chaque essai ; le plafond du mois coupe l&apos;essayage tout seul, et un essai
        échoué ne compte pas.
      </p>
      {tableau ? (
        <EssayageAdmin
          tableau={tableau}
          vendeurs={((vendeurs ?? []) as { id: string; display_name: string | null }[]).map((v) => ({ id: v.id, nom: v.display_name?.trim() || v.id }))}
        />
      ) : (
        <p role="alert" className="mt-6 text-sm text-danger-text">
          Les données de l&apos;essayage sont illisibles. Si la migration 0150 n&apos;est pas encore appliquée, c&apos;est attendu.
        </p>
      )}
    </AdminShell>
  );
}
