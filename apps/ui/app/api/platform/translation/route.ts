import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
  platformCorsPreflight,
  requirePlatformScope,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import type { AuthenticatedSupabase } from "@/lib/platform/serverSupabase";
import { asString } from "@/lib/platform/platformApi";
import type { DictionaryLookupPayload } from "@/lib/platform/lookupService";
import { coordinateDictionaryMeaningTranslation } from "@/lib/translation/dictionaryMeaningTranslationCoordinator";
import {
  createTranslator,
  loadTranslationConfigFromEnv,
} from "@/lib/translation/translationProvider";
import { normalizeTranslationProviderError } from "@/lib/translation/translationProviderFailure";

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
): Promise<
  | { targetLang: string; auth: AuthenticatedSupabase }
  | { response: Response }
> {

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

  return { targetLang, auth };
}

export async function POST(request: NextRequest) {
  const startedAt = performance.now();
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
    const targetLang = explicitTargetLang.trim();
    const dbLang = targetLang.replace("_", "-").toLowerCase();
    if (dbLang === "off") {
      return reply({ entryId, targetLang, error: "translation_disabled" }, 400);
    }
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/.test(dbLang)) {
      return reply({ entryId, targetLang, error: "Invalid lang" }, 400);
    }
    if (item) {
      const draftTranslation = await translateDraftItem(item, targetLang);
      return reply(draftTranslation.payload, draftTranslation.status);
    }
    if (!entryId) return reply({ error: "missing_entry_id" }, 400);
    const { data: entry, error } = await auth.supabase.rpc(
      "fetch_dictionary_entry_by_id_gated",
      { p_entry_id: entryId },
    );
    if (error) return reply({ entryId, targetLang, error: error.message }, 500);
    if (!entry?.raw) {
      return reply({ entryId, targetLang, error: "word_entry_not_found" }, 404);
    }
    const result = await coordinateDictionaryMeaningTranslation({
      wordEntryId: entryId,
      word: entry as DictionaryLookupPayload,
      targetLang,
      dbLang,
      force: boolParam(body?.force),
      debug: boolParam(body?.debug),
    });
    const response = reply({ entryId, targetLang, ...result.payload }, result.status);
    response.headers.set("X-Platform-Cache", result.cacheStatus);
    response.headers.set(
      "Server-Timing",
      `route.total;dur=${Math.max(0, performance.now() - startedAt).toFixed(1)}`,
    );
    return response;
  }
  const resolved = await resolveTargetLang(request);
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

  if (item) {
    const draftTranslation = await translateDraftItem(item, targetLang);
    return reply(draftTranslation.payload, draftTranslation.status);
  }
  if (!entryId) {
    return reply({ error: "missing_entry_id" }, 400);
  }

  const dbLang = targetLang.trim().replace("_", "-").toLowerCase();
  const { data: entry, error } = await resolved.auth.supabase.rpc(
    "fetch_dictionary_entry_by_id_gated",
    { p_entry_id: entryId },
  );
  if (error) return reply({ entryId, targetLang, error: error.message }, 500);
  if (!entry?.raw) return reply({ entryId, targetLang, error: "word_entry_not_found" }, 404);
  const result = await coordinateDictionaryMeaningTranslation({
    wordEntryId: entryId,
    word: entry as DictionaryLookupPayload,
    targetLang,
    dbLang,
    force: boolParam(body?.force),
    debug: boolParam(body?.debug),
  });
  const response = reply({ entryId, targetLang, ...result.payload }, result.status);
  response.headers.set("X-Platform-Cache", result.cacheStatus);
  response.headers.set(
    "Server-Timing",
    `route.total;dur=${Math.max(0, performance.now() - startedAt).toFixed(1)}`,
  );
  return response;
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
    const failure = normalizeTranslationProviderError(error).message;
    return {
      payload: {
        targetLang,
        status: "failed",
        error: {
          code: "translation_failed",
          message: failure,
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
