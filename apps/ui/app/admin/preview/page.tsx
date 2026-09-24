import { notFound } from "next/navigation";
import AdminConsolePreview from "@/components/admin/AdminConsolePreview";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = {
  title: "Admin UI Preview",
  robots: { index: false, follow: false },
};

export default function AdminPreviewPage() {
  if (process.env.NODE_ENV !== "development" || process.env.ADMIN_UI_PREVIEW !== "true") {
    notFound();
  }
  return <><style>{"nextjs-portal { display: none !important; }"}</style><AdminConsolePreview /></>;
}
