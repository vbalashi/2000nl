import { AdminUsersConsole } from "@/components/admin/AdminUsersConsole";
import { adminUserDestination } from "@/lib/admin/consoleRoutes";
import { hasUnifiedAdminArtifact } from "@/lib/admin/unifiedArtifact";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = { title: "Профиль пользователя · 2000NL Admin", robots: { index: false, follow: false } };

export default async function AdminUserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (await hasUnifiedAdminArtifact()) redirect(adminUserDestination(id));
  return <AdminUsersConsole userId={id} />;
}
