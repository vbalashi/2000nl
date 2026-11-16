import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { getAuthenticatedSupabase, jsonNoStore, platformCorsPreflight, requirePlatformScope, withPlatformCors } from "@/lib/platform/serverSupabase";
import { asString } from "@/lib/platform/platformApi";
import { safeTextTranslation, TEXT_TRANSLATION_POLICY_VERSION } from "@/lib/translation/safeTextTranslation";
import { readProviderJson, assertProviderInput, assertTranslationPurpose, providerErrorResponse } from "@/lib/providers/providerSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
const hash = (text: string) => crypto.createHash("sha256").update(text).digest("hex");
export function OPTIONS(request: NextRequest) { return platformCorsPreflight(request); }
export async function POST(request: NextRequest) {
  const reply = (payload: unknown, status = 200) => {
    const response = withPlatformCors(request, jsonNoStore(payload, status));
    const retry = payload && typeof payload === "object" && "retryAfterMs" in payload ? payload.retryAfterMs : null;
    if (typeof retry === "number" && retry > 0) response.headers.set("Retry-After", String(Math.ceil(retry / 1000)));
    return response;
  };
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return withPlatformCors(request, auth);
  const scopeError = requirePlatformScope(auth, "platform:write");
  if (scopeError) return withPlatformCors(request, scopeError);
  let body;
  try { body = await readProviderJson(request, "translation"); } catch (error) { const failure = providerErrorResponse(error); return reply(failure.payload, failure.status); }
  const text = asString(body?.text);
  if (!text) return reply({ error: "missing_text" }, 400);
  const sourceLanguageCode = asString(body?.sourceLanguageCode) ?? "auto";
  const purpose = asString(body?.purpose) ?? "youtube-phrase-practice";
  const contextText = asString(body?.contextText);
  try {
    assertTranslationPurpose(purpose);
    assertProviderInput("translation", [text, ...(contextText ? [contextText] : [])]);
  } catch (error) { const failure = providerErrorResponse(error); return reply(failure.payload, failure.status); }
  let targetLanguageCode = asString(body?.targetLanguageCode);
  if (!targetLanguageCode) {
    const { data, error } = await auth.supabase.from("user_settings").select("translation_lang").eq("user_id", auth.user.id).maybeSingle();
    if (error) return reply({ error: "translation_preference_failed" }, 500);
    targetLanguageCode = data?.translation_lang ?? "en";
  }
  if (targetLanguageCode === "off") return reply({ error: "translation_disabled" }, 400);
  const target = (targetLanguageCode ?? "en").trim().replaceAll("_", "-").toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/.test(target) || (sourceLanguageCode !== "auto" && !/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8}){0,3}$/.test(sourceLanguageCode))) return reply({ error: "invalid_language" }, 400);
  const sourceTextHash = hash(text), contextTextHash = contextText ? hash(contextText) : null;
  // Account-scoped identity: private text artifacts cannot become another account's cache hit.
  const translationId = hash(JSON.stringify({ accountId: auth.user.id, sourceTextHash, contextTextHash, sourceLanguageCode, targetLanguageCode: target, purpose, translationPolicyVersion: TEXT_TRANSLATION_POLICY_VERSION }));
  const base = { translationId, sourceTextHash, ...(contextTextHash ? { contextTextHash } : {}), sourceLanguageCode, targetLanguageCode: target, translationPolicyVersion: TEXT_TRANSLATION_POLICY_VERSION };
  try {
    const work = await safeTextTranslation(auth.user.id, "text", { texts: [text], sourceLanguageCode, targetLanguageCode: target, purpose, contextText });
    if (work.status === "pending") return reply({ ...base, status: "pending", cached: false, retryAfterMs: work.retryAfterMs });
    const result = work.result;
    return reply({ ...base, status: "ready", cached: work.cached, translatedText: result.translations[0],
      ...(result.literalTranslations[0] ? { literalTranslatedText: result.literalTranslations[0] } : {}),
      ...(result.note ? { translatorComment: result.note } : {}), providerUsed: result.providerUsed, usedFallback: result.usedFallback });
  } catch (error) { const failure = providerErrorResponse(error); return reply({ ...base, cached: false, ...failure.payload }, failure.status); }
}
