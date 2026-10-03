import { AdminUsersConsole } from "@/components/admin/AdminUsersConsole";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = { title: "Пользователи · 2000NL Admin", robots: { index: false, follow: false } };

export default function AdminUsersPage() {
  return <><style>{"nextjs-portal { display: none !important; }"}</style><AdminUsersConsole /></>;
}
