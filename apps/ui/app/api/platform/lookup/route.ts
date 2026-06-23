import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  getPlatformServiceSupabase,
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
  languageCode?: unknown;
  contextText?: unknown;
  includeUserState?: unknown;
  includeTranslations?: unknown;
  intent?: unknown;
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
  const languageCode =
    typeof body?.languageCode === "string" ? body.languageCode.trim() : null;
  const contextText =
    typeof body?.contextText === "string" ? body.contextText.trim() : null;
  const intent = typeof body?.intent === "string" ? body.intent.trim() : null;
  const includeUserState = body?.includeUserState !== false;
  const includeTranslations = body?.includeTranslations === true;
  const service = includeTranslations ? getPlatformServiceSupabase() : null;
  if (service instanceof Response) {
    return withPlatformCors(request, service);
  }

  const result = await performPlatformLookup(auth, {
    query,
    includeUserState,
    includeTranslations,
    languageCode,
    contextText,
    intent,
    service,
  });
  return reply(result.payload, result.status);
}
