import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
  platformCorsPreflight,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import {
  asString,
  performPlatformAction,
  performPlatformLookup,
  type PlatformActionBody,
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
  const query = asString(body?.selection) ?? asString(body?.query) ?? "";
  const includeUserState = body?.includeUserState !== false;

  const lookup = await performPlatformLookup(auth, { query, includeUserState });
  if (lookup.status !== 200) {
    return reply(lookup.payload, lookup.status);
  }

  const actions = Array.isArray(body?.actions) ? body.actions : [];
  const actionResults = [];
  for (const actionBody of actions) {
    const result = await performPlatformAction(
      auth,
      actionBody as PlatformActionBody,
    );
    actionResults.push({
      status: result.status,
      body: result.payload,
    });

    if (result.status >= 400) {
      return reply(
        {
          lookup: lookup.payload,
          actionResults,
        },
        result.status,
      );
    }
  }

  return reply({
    lookup: lookup.payload,
    actionResults,
  });
}
