import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
  platformCorsPreflight,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import {
  asString,
  performPlatformLookup,
} from "@/lib/platform/platformApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

type AnalyzeSelectionBody = {
  selection?: unknown;
  query?: unknown;
  includeUserState?: unknown;
  actions?: unknown;
};

async function readJson(request: NextRequest): Promise<AnalyzeSelectionBody | null> {
  try {
    return (await request.json()) as AnalyzeSelectionBody;
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
  if (
    body?.actions !== undefined &&
    (!Array.isArray(body.actions) || body.actions.length > 0)
  ) {
    return reply(
      {
        error: "analyze_selection_is_read_only",
        actionsEndpoint: "/api/platform/actions",
      },
      400,
    );
  }

  const query = asString(body?.selection) ?? asString(body?.query) ?? "";
  const includeUserState = body?.includeUserState !== false;

  const lookup = await performPlatformLookup(auth, { query, includeUserState });
  if (lookup.status !== 200) {
    return reply(lookup.payload, lookup.status);
  }

  return reply({
    lookup: lookup.payload,
    actionResults: [],
  });
}
