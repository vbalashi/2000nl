import { notFound } from "next/navigation";
import { UpdatesPreview } from "./preview";
import { GET } from "@/app/api/app-release/route";
import { parseAppRelease } from "@/lib/releases/appRelease";
import { releaseLanguage } from "@/lib/releases/releaseCatalogServer";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ language?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const language = releaseLanguage((await searchParams).language);
  const response = await GET(
    new Request(`http://localhost/api/app-release?language=${language}`),
  );
  return (
    <UpdatesPreview
      release={parseAppRelease(await response.json())}
      language={language}
    />
  );
}
