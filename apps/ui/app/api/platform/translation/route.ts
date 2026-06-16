import { NextRequest } from "next/server";
import {
  jsonNoStore,
  platformCorsPreflight,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import { GET as getTranslation } from "@/app/api/translation/route";
import { asString } from "@/lib/platform/platformApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TranslationRequestBody = {
  entryId?: unknown;
  targetLang?: unknown;
  force?: unknown;
  debug?: unknown;
};

async function readJson(request: NextRequest): Promise<TranslationRequestBody | null> {
  try {
    return (await request.json()) as TranslationRequestBody;
  } catch {
    return null;
  }
}

function boolParam(value: unknown) {
  return value === true || value === "true" || value === "1";
}

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  const reply = (payload: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(payload, status));

  const body = await readJson(request);
  const entryId = asString(body?.entryId);
  const targetLang = asString(body?.targetLang);

  if (!entryId) {
    return reply({ error: "missing_entry_id" }, 400);
  }
  if (!targetLang) {
    return reply({ error: "missing_target_lang" }, 400);
  }

  const url = new URL(request.url);
  url.pathname = "/api/translation";
  url.search = "";
  url.searchParams.set("word_id", entryId);
  url.searchParams.set("lang", targetLang);
  if (boolParam(body?.force)) url.searchParams.set("force", "1");
  if (boolParam(body?.debug)) url.searchParams.set("debug", "1");

  const translationResponse = await getTranslation(
    new NextRequest(url, {
      method: "GET",
      headers: request.headers,
    }),
  );
  const payload = await translationResponse.json().catch(() => null);

  return reply(
    {
      entryId,
      targetLang,
      ...(payload && typeof payload === "object" ? payload : { error: "translation_failed" }),
    },
    translationResponse.status,
  );
}
