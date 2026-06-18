import { NextRequest } from "next/server";
import crypto from "crypto";
import {
  getAuthenticatedSupabase,
  getPlatformServiceSupabase,
  jsonNoStore,
  platformCorsPreflight,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import {
  createTranslator,
  loadTranslationConfigFromEnv,
} from "@/lib/translation/translationProvider";
import { asString } from "@/lib/platform/platformApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TextTranslationBody = {
  text?: unknown;
  sourceLanguageCode?: unknown;
  targetLanguageCode?: unknown;
  purpose?: unknown;
  contextText?: unknown;
};

const TRANSLATION_POLICY_VERSION = "platform-text-translation-v1";
const TEXT_TRANSLATION_CACHE_COLUMNS =
  "translation_id, status, translated_text, error_message, provider, source_text_hash, context_text_hash, source_language_code, target_language_code, purpose, translation_policy_version";

type TextTranslationCacheRow = {
  translation_id: string;
  status: string;
  translated_text: string | null;
  error_message: string | null;
  provider?: string | null;
  source_text_hash: string;
  context_text_hash?: string | null;
  source_language_code: string;
  target_language_code: string;
  purpose?: string | null;
  translation_policy_version: string;
};

async function readJson(request: NextRequest): Promise<TextTranslationBody | null> {
  try {
    return (await request.json()) as TextTranslationBody;
  } catch {
    return null;
  }
}

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

function artifactResponse(row: TextTranslationCacheRow, cached = true) {
  return {
    translationId: row.translation_id,
    status: row.status,
    sourceTextHash: row.source_text_hash,
    ...(row.context_text_hash ? { contextTextHash: row.context_text_hash } : {}),
    sourceLanguageCode: row.source_language_code,
    targetLanguageCode: row.target_language_code,
    ...(row.translated_text ? { translatedText: row.translated_text } : {}),
    translationPolicyVersion: row.translation_policy_version,
    cached,
    ...(row.error_message ? { error: row.error_message } : {}),
  };
}

export async function POST(request: NextRequest) {
  const reply = (payload: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(payload, status));

  const body = await readJson(request);
  const text = asString(body?.text);
  if (!text) {
    return reply({ error: "missing_text" }, 400);
  }

  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) {
    return withPlatformCors(request, auth);
  }

  let targetLanguageCode = asString(body?.targetLanguageCode);
  if (!targetLanguageCode) {
    const { data, error } = await auth.supabase
      .from("user_settings")
      .select("translation_lang")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) {
      return reply(
        { error: "translation_preference_failed", detail: error.message },
        500,
      );
    }
    targetLanguageCode = data?.translation_lang ?? "en";
  }

  if (targetLanguageCode === "off") {
    return reply({ error: "translation_disabled" }, 400);
  }
  const resolvedTargetLanguageCode: string = targetLanguageCode || "en";

  const sourceLanguageCode = asString(body?.sourceLanguageCode) ?? "auto";
  const purpose = asString(body?.purpose) ?? "youtube-phrase-practice";
  const contextText = asString(body?.contextText);
  const sourceTextHash = crypto.createHash("sha256").update(text).digest("hex");
  const contextTextHash = contextText
    ? crypto.createHash("sha256").update(contextText).digest("hex")
    : null;
  const translationId = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        sourceTextHash,
        contextTextHash,
        sourceLanguageCode,
        targetLanguageCode: resolvedTargetLanguageCode,
        purpose,
        translationPolicyVersion: TRANSLATION_POLICY_VERSION,
      }),
    )
    .digest("hex");

  const service = getPlatformServiceSupabase();
  if (service instanceof Response) {
    return withPlatformCors(request, service);
  }

  const { data: cachedRow, error: cacheReadError } = await service.supabase
    .from("platform_text_translations")
    .select(TEXT_TRANSLATION_CACHE_COLUMNS)
    .eq("translation_id", translationId)
    .maybeSingle();

  if (cacheReadError) {
    return reply(
      { error: "text_translation_cache_read_failed", detail: cacheReadError.message },
      500,
    );
  }

  if (cachedRow) {
    return reply(artifactResponse(cachedRow as TextTranslationCacheRow));
  }

  const { data: insertedRow, error: cacheInsertError } = await service.supabase
    .from("platform_text_translations")
    .upsert(
      {
        translation_id: translationId,
        source_text_hash: sourceTextHash,
        source_language_code: sourceLanguageCode,
        target_language_code: resolvedTargetLanguageCode,
        purpose,
        translation_policy_version: TRANSLATION_POLICY_VERSION,
        context_text_hash: contextTextHash,
        status: "pending",
      },
      { onConflict: "translation_id", ignoreDuplicates: true },
    )
    .select(TEXT_TRANSLATION_CACHE_COLUMNS)
    .maybeSingle();

  if (cacheInsertError) {
    return reply(
      { error: "text_translation_cache_write_failed", detail: cacheInsertError.message },
      500,
    );
  }

  if (!insertedRow) {
    const { data: concurrentRow, error: concurrentReadError } = await service.supabase
      .from("platform_text_translations")
      .select(TEXT_TRANSLATION_CACHE_COLUMNS)
      .eq("translation_id", translationId)
      .maybeSingle();

    if (concurrentReadError) {
      return reply(
        {
          error: "text_translation_cache_read_failed",
          detail: concurrentReadError.message,
        },
        500,
      );
    }
    if (concurrentRow) {
      return reply(artifactResponse(concurrentRow as TextTranslationCacheRow));
    }
  }

  const config = loadTranslationConfigFromEnv();
  let provider: string;
  let translatedText: string;
  try {
    const resolved = createTranslator(config);
    provider = resolved.provider;
    const translator: any = resolved.translator;

    if (typeof translator.translateWithContext === "function") {
      [translatedText] = await translator.translateWithContext(
        [text],
        resolvedTargetLanguageCode,
        {
          sourceLanguageCode,
          purpose,
          contextText,
        },
      );
    } else {
      [translatedText] = await resolved.translator.translate(
        [text],
        resolvedTargetLanguageCode,
      );
    }
  } catch (err: any) {
    const errorMessage = String(err?.message ?? err ?? "translation_failed");
    await service.supabase
      .from("platform_text_translations")
      .update({
        status: "failed",
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("translation_id", translationId);

    return reply(
      {
        translationId,
        status: "failed",
        sourceTextHash,
        ...(contextTextHash ? { contextTextHash } : {}),
        sourceLanguageCode,
        targetLanguageCode: resolvedTargetLanguageCode,
        translationPolicyVersion: TRANSLATION_POLICY_VERSION,
        cached: false,
        error: errorMessage,
      },
      502,
    );
  }

  const { error: cacheUpdateError } = await service.supabase
    .from("platform_text_translations")
    .update({
      status: "ready",
      translated_text: translatedText ?? "",
      provider,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("translation_id", translationId);

  if (cacheUpdateError) {
    return reply(
      { error: "text_translation_cache_update_failed", detail: cacheUpdateError.message },
      500,
    );
  }

  return reply({
    translationId,
    status: "ready",
    sourceTextHash,
    ...(contextTextHash ? { contextTextHash } : {}),
    sourceLanguageCode,
    targetLanguageCode: resolvedTargetLanguageCode,
    translatedText: translatedText ?? "",
    translationPolicyVersion: TRANSLATION_POLICY_VERSION,
    cached: false,
  });
}
