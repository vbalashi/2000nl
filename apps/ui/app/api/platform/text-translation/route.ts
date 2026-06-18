import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
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

  const config = loadTranslationConfigFromEnv();
  let provider: string;
  let translatedText: string;
  try {
    const resolved = createTranslator(config);
    provider = resolved.provider;
    const translator: any = resolved.translator;
    const sourceLanguageCode = asString(body?.sourceLanguageCode);
    const contextText = asString(body?.contextText);

    if (typeof translator.translateWithContext === "function") {
      [translatedText] = await translator.translateWithContext(
        [text],
        resolvedTargetLanguageCode,
        {
          sourceLanguageCode,
          purpose: asString(body?.purpose),
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
    return reply(
      { status: "failed", error: String(err?.message ?? err ?? "translation_failed") },
      502,
    );
  }

  return reply({
    text,
    translatedText: translatedText ?? "",
    sourceLanguageCode: asString(body?.sourceLanguageCode),
    targetLanguageCode: resolvedTargetLanguageCode,
    purpose: asString(body?.purpose),
    provider,
  });
}
