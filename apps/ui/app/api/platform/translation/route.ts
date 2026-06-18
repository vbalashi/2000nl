import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
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

async function resolveTargetLang(
  request: NextRequest,
  explicitTargetLang: string | null,
): Promise<{ targetLang: string } | { response: Response }> {
  if (explicitTargetLang) return { targetLang: explicitTargetLang };

  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return { response: auth };

  const { data, error } = await auth.supabase
    .from("user_settings")
    .select("translation_lang")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    return {
      response: jsonNoStore(
        { error: "translation_preference_failed", detail: error.message },
        500,
      ),
    };
  }

  const targetLang = data?.translation_lang ?? "en";
  if (targetLang === "off") {
    return { response: jsonNoStore({ error: "translation_disabled" }, 400) };
  }

  return { targetLang };
}

export async function POST(request: NextRequest) {
  const reply = (payload: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(payload, status));

  const body = await readJson(request);
  const entryId = asString(body?.entryId);
  const explicitTargetLang = asString(body?.targetLang);

  if (!entryId) {
    return reply({ error: "missing_entry_id" }, 400);
  }
  const resolved = await resolveTargetLang(request, explicitTargetLang);
  if ("response" in resolved) {
    const errorResponse = resolved.response;
    const payload = await errorResponse.json().catch(() => null);
    return reply(
      {
        entryId,
        targetLang: explicitTargetLang,
        ...(payload && typeof payload === "object" ? payload : { error: "translation_failed" }),
      },
      errorResponse.status,
    );
  }
  const targetLang = resolved.targetLang;

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
