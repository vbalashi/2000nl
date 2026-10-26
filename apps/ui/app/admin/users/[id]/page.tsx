import { AdminUsersConsole } from "@/components/admin/AdminUsersConsole";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = { title: "Профиль пользователя · 2000NL Admin", robots: { index: false, follow: false } };

export default async function AdminUserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminUsersConsole userId={id} />;
}
