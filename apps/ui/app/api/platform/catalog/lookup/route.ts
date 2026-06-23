import { NextRequest } from "next/server";
import {
  getCatalogSupabase,
  jsonNoStore,
  platformCorsPreflight,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import { performPlatformCatalogLookup } from "@/lib/platform/platformApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

type CatalogLookupRequestBody = {
  query?: unknown;
  languageCode?: unknown;
  contextText?: unknown;
  includeTranslations?: unknown;
  intent?: unknown;
};

async function readJson(
  request: NextRequest,
): Promise<CatalogLookupRequestBody | null> {
  try {
    return (await request.json()) as CatalogLookupRequestBody;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const reply = (payload: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(payload, status));

  const service = await getCatalogSupabase(request);
  if (service instanceof Response) {
    return withPlatformCors(request, service);
  }

  const body = await readJson(request);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const languageCode =
    typeof body?.languageCode === "string" ? body.languageCode.trim() : null;
  const contextText =
    typeof body?.contextText === "string" ? body.contextText.trim() : null;
  const intent = typeof body?.intent === "string" ? body.intent.trim() : null;
  const includeTranslations = body?.includeTranslations === true;

  const result = await performPlatformCatalogLookup(service, {
    query,
    languageCode,
    contextText,
    includeTranslations,
    intent,
  });
  return reply(result.payload, result.status);
}
