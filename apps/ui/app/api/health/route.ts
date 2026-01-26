import { NextResponse } from "next/server";
import { appVersionInfo } from "@/lib/appVersion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const versionInfo = appVersionInfo();
  const payload = {
    version: versionInfo.version,
    commit: versionInfo.commit,
    uptime: Math.floor(process.uptime()),
    status: "ok",
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
