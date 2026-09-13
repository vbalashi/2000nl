import { NextRequest } from "next/server";
import { handlePlatformV2ActionRoute } from "@/lib/platform/platformV2ActionRouteService";
import { platformCorsPreflight } from "@/lib/platform/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  return handlePlatformV2ActionRoute(request, "library");
}
