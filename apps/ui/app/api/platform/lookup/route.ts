import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
  platformCorsPreflight,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import { performPlatformLookup } from "@/lib/platform/platformApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

type LookupRequestBody = {
  query?: unknown;
  includeUserState?: unknown;
};

async function readJson(request: NextRequest): Promise<LookupRequestBody | null> {
  try {
    return (await request.json()) as LookupRequestBody;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const reply = (payload: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(payload, status));

  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) {
    return withPlatformCors(request, auth);
  }

  const body = await readJson(request);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const includeUserState = body?.includeUserState !== false;

  const result = await performPlatformLookup(auth, { query, includeUserState });
  return reply(result.payload, result.status);
}
