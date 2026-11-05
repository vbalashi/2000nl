import { NextResponse } from "next/server";
import { appVersionInfo } from "@/lib/appVersion";
import { parseAppRelease } from "@/lib/releases/appRelease";
import {
  readReleaseCatalog,
  releaseLanguage,
} from "@/lib/releases/releaseCatalogServer";
export const dynamic = "force-dynamic";
export async function GET(request?: Request) {
  const { version, commit, buildTimestamp } = appVersionInfo();
  const language = releaseLanguage(
    request ? new URL(request.url).searchParams.get("language") : null,
  );
  // Release identity must remain available even if editorial storage is temporarily unavailable.
  let historyStatus: "ready" | "unavailable" = "ready";
  const catalog = await readReleaseCatalog(version, language).catch(() => {
    historyStatus = "unavailable";
    return { items: [], nextVersion: null };
  });
  const current = catalog.items.find((item) => item.version === version);
  const release = parseAppRelease({
    schemaVersion: 1,
    build: { version, commit, buildTimestamp },
    announcement: current ?? null,
    history: catalog.items,
    historyStatus,
  });
  return NextResponse.json(release, {
    headers: { "Cache-Control": "no-store" },
  });
}
