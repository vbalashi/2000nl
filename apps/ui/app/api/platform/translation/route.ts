import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
  platformCorsPreflight,
  requirePlatformScope,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import { GET as getTranslation } from "@/app/api/translation/route";
import { asString } from "@/lib/platform/platformApi";
import {
  createTranslator,
  loadTranslationConfigFromEnv,
} from "@/lib/translation/translationProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TranslationRequestBody = {
  entryId?: unknown;
  item?: unknown;
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
  if (auth instanceof Response) {
    if (auth.status === 401) {
      return {
        response: jsonNoStore({ error: "authentication_required" }, 401),
      };
    }
    return { response: auth };
  }
  const scopeError = requirePlatformScope(auth, "platform:write");
  if (scopeError) return { response: scopeError };

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
  const item = asRecord(body?.item);
  const explicitTargetLang = asString(body?.targetLang);

  if (!entryId && !item) {
    return reply({ error: "missing_entry_id" }, 400);
  }
  if (explicitTargetLang) {
    const auth = await getAuthenticatedSupabase(request);
    if (auth instanceof Response) {
      const payload = await auth.json().catch(() => null);
      return reply(
        {
          entryId,
          targetLang: explicitTargetLang,
          ...(payload && typeof payload === "object" ? payload : { error: "translation_failed" }),
        },
        auth.status,
      );
    }
    const scopeError = requirePlatformScope(auth, "platform:write");
    if (scopeError) {
      const payload = await scopeError.json().catch(() => null);
      return reply(
        {
          entryId,
          targetLang: explicitTargetLang,
          ...(payload && typeof payload === "object" ? payload : { error: "translation_failed" }),
        },
        scopeError.status,
      );
    }
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

  if (!entryId && item) {
    const draftTranslation = await translateDraftItem(item, targetLang);
    return reply(draftTranslation.payload, draftTranslation.status);
  }
  if (!entryId) {
    return reply({ error: "missing_entry_id" }, 400);
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

async function translateDraftItem(
  item: Record<string, unknown>,
  targetLang: string,
): Promise<{ payload: unknown; status: number }> {
  const entry = asRecord(item.entry) ?? {};
  const content = asRecord(entry.content) ?? {};
  const headword = asString(content.headword) ?? asString(entry.headword);
  const sections = asArray(content.sections)
    .map((section) => asRecord(section))
    .filter((section): section is Record<string, unknown> =>
      Boolean(section && asString(section.text)),
    );
  const texts = [
    ...(headword ? [{ kind: "headword", text: headword }] : []),
    ...sections.map((section) => ({
      kind: asString(section.kind) ?? "meaning",
      text: asString(section.text) ?? "",
    })),
  ];

  if (!texts.length) {
    return { payload: { error: "missing_translatable_content" }, status: 400 };
  }

  let translations: string[];
  try {
    const provider = createTranslator(loadTranslationConfigFromEnv());
    translations = await provider.translator.translate(
      texts.map((item) => item.text),
      targetLang,
    );
  } catch (error) {
    return {
      payload: {
        targetLang,
        status: "failed",
        error: {
          code: "translation_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      },
      status: 502,
    };
  }

  const translated = texts.map((item, index) => ({
    ...item,
    translatedText: translations[index] ?? "",
  }));
  const headwordTranslation =
    translated.find((item) => item.kind === "headword")?.translatedText ?? "";
  const meaningTranslations = translated
    .filter((item) => item.kind === "meaning")
    .map((item) => item.translatedText)
    .filter(Boolean);
  const exampleTranslations = translated
    .filter((item) => item.kind === "example")
    .map((item) => item.translatedText)
    .filter(Boolean);
  const noteTranslation =
    translated.find((item) => item.kind === "note")?.translatedText ?? "";

  return {
    payload: {
      entryId: asString(entry.id) ?? null,
      targetLang,
      status: "ready",
      overlay: {
        ...(headwordTranslation ? { headword: headwordTranslation } : {}),
        meanings: [
          {
            ...(meaningTranslations[0] ? { definition: meaningTranslations[0] } : {}),
            ...(noteTranslation ? { context: noteTranslation } : {}),
            ...(exampleTranslations.length ? { examples: exampleTranslations } : {}),
          },
        ],
        __meta: {
          translationPolicyVersion: "platform-generated-draft-translation-v1",
        },
      },
      translationPolicyVersion: "platform-generated-draft-translation-v1",
    },
    status: 200,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
