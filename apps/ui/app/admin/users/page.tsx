import { AdminUsersConsole } from "@/components/admin/AdminUsersConsole";
import { adminUserDestination } from "@/lib/admin/consoleRoutes";
import { hasUnifiedAdminArtifact } from "@/lib/admin/unifiedArtifact";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = { title: "Пользователи · 2000NL Admin", robots: { index: false, follow: false } };

export default async function AdminUsersPage() {
  if (await hasUnifiedAdminArtifact()) redirect(adminUserDestination());
  return <AdminUsersConsole />;
}
