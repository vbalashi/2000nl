import AdminConsole from "@/components/admin/AdminConsole";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = {
  title: "2000NL Admin",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <><style>{"nextjs-portal { display: none !important; }"}</style><AdminConsole /></>;
}
