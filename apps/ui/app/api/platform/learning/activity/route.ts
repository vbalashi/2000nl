import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  getPlatformServiceSupabase,
  jsonNoStore,
  platformCorsPreflight,
  requirePlatformScope,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import {
  parseLearningReadFilters,
  readPlatformLearningActivity,
} from "@/lib/platform/learningReadApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

export async function GET(request: NextRequest) {
  const reply = (payload: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(payload, status));

  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) {
    return withPlatformCors(request, auth);
  }
  const scopeError = requirePlatformScope(auth, "platform:read");
  if (scopeError) return withPlatformCors(request, scopeError);

  const service = getPlatformServiceSupabase();
  if (service instanceof Response) return withPlatformCors(request, service);

  const filters = parseLearningReadFilters(new URL(request.url));
  if ("status" in filters) return reply(filters.payload, filters.status);

  const result = await readPlatformLearningActivity(auth, service, filters);
  return reply(result.payload, result.status);
}
