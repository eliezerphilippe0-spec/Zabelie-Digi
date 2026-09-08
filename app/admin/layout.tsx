import { redirect } from "next/navigation";
import { getAdminUser, getCurrentUser } from "@/lib/auth";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=%2Fadmin");
  if (user.role !== "admin") redirect("/");
  if (!(await getAdminUser())) redirect("/securite");
  return children;
}
