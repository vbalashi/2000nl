import AdminConsole from "@/components/admin/AdminConsole";
import { adminLegacyDestination, type AdminSearchParams } from "@/lib/admin/consoleRoutes";
import { hasUnifiedAdminArtifact } from "@/lib/admin/unifiedArtifact";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = {
  title: "2000NL Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const unifiedEntry = await hasUnifiedAdminArtifact();
  if (unifiedEntry) {
    const destination = adminLegacyDestination(await searchParams);
    if (destination) redirect(destination);
  }
  return <><style>{"nextjs-portal { display: none !important; }"}</style><AdminConsole unifiedEntry={unifiedEntry} /></>;
}
