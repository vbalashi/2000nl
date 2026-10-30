import { withTrainingDiagnostics } from "@/lib/diagnostics/server";
import { NextRequest } from "next/server";
import { handlePlatformV2ActionRoute } from "@/lib/platform/platformV2ActionRouteService";
import { platformCorsPreflight } from "@/lib/platform/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

async function handlePOST(request: NextRequest) {
  return handlePlatformV2ActionRoute(request, "training");
}

export const POST = withTrainingDiagnostics("/api/platform/v2/actions", handlePOST);
