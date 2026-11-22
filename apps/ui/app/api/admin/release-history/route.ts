import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { releaseVersionPattern } from "@/lib/releases/appRelease";
import { readReleaseCatalog, releaseLanguage } from "@/lib/releases/releaseCatalogServer";

export const dynamic = "force-dynamic";
const highestReleaseVersion = "99999999.99999999.99999999";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    await requireAdmin(request, "audit.read");
    const params = new URL(request.url).searchParams;
    const before = params.get("before");
    if (before !== null && !releaseVersionPattern.test(before))
      return NextResponse.json({ error: "invalid_cursor" }, { status: 400, headers });
    const catalog = await readReleaseCatalog(highestReleaseVersion, releaseLanguage(params.get("language")), 25, before, "admin");
    return NextResponse.json(catalog, { headers });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
