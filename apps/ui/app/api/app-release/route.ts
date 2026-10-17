import { NextResponse } from "next/server";
import { appVersionInfo } from "@/lib/appVersion";
import announcement from "@/config/release-announcement.json";
import { parseAppRelease } from "@/lib/releases/appRelease";
export const dynamic = "force-dynamic";
export function GET() {
  const { version, commit, buildTimestamp } = appVersionInfo();
  const release = parseAppRelease({
    schemaVersion: 1,
    build: { version, commit, buildTimestamp },
    announcement,
  });
  return NextResponse.json(release, {
    headers: { "Cache-Control": "no-store" },
  });
}
