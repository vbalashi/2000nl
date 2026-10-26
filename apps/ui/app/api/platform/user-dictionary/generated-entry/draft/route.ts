import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
  platformCorsPreflight,
  requirePlatformScope,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import {
  draftGeneratedUserDictionaryEntry,
  type GeneratedEntryDraftBody,
} from "@/lib/platform/generatedEntryDraftService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

async function readJson(request: NextRequest): Promise<GeneratedEntryDraftBody | null> {
  try {
    return (await request.json()) as GeneratedEntryDraftBody;
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
  const scopeError = requirePlatformScope(auth, "platform:write");
  if (scopeError) return withPlatformCors(request, scopeError);

  const body = await readJson(request);
  const result = await draftGeneratedUserDictionaryEntry(auth, body);
  return reply(result.payload, result.status);
}
