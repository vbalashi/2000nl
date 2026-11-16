import { providerOutputTokenLimit } from "../providers/providerTransport";
import { assertProviderInput, assertTranslationPurpose, providerWorkIdentity, runProviderWork } from "../providers/providerSafety";
import { createTranslator, loadTranslationConfigFromEnv } from "./translationProvider";
import { getTranslationPromptFingerprint } from "./prompts/promptFingerprint";
import { normalizeTranslationProviderError, safeTranslationProviderError } from "./translationProviderFailure";
import type { TranslationProviderTextRequest } from "./ITranslator";

export const TEXT_TRANSLATION_POLICY_VERSION = "platform-text-translation-v3";
export async function safeTextTranslation(accountId: string, kind: "text" | "draft", request: TranslationProviderTextRequest) {
  assertTranslationPurpose(request.purpose ?? "youtube-phrase-practice");
  const characters = assertProviderInput("translation", [...request.texts, ...(request.contextText ? [request.contextText] : [])]);
  const outputTokenLimit = providerOutputTokenLimit();
  const config = loadTranslationConfigFromEnv();
  const { provider, translator } = createTranslator(config);
  const identity = providerWorkIdentity([
    TEXT_TRANSLATION_POLICY_VERSION, accountId, kind, request, provider,
    config.models, config.apiUrls, config.fallback, outputTokenLimit, getTranslationPromptFingerprint(provider),
  ]);
  return runProviderWork({
    kind, identity, accountId, inputCharacters: characters,
    failureCode: error => normalizeTranslationProviderError(error).failure.code,
    execute: async () => {
      const result = await translator.translateText(request);
      if (!Array.isArray(result?.translations) || result.translations.length !== request.texts.length || result.translations.some(text => typeof text !== "string" || !text.trim())
        || Buffer.byteLength(JSON.stringify(result), "utf8") > 524_288) throw safeTranslationProviderError("provider_response_error", null);
      return {
        translations: result.translations,
        literalTranslations: result.literalTranslations ?? [],
        note: result.note ?? null,
        providerUsed: result.meta?.providerUsed ?? provider,
        usedFallback: result.meta?.usedFallback === true,
      };
    },
  });
}
