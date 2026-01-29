import { DeepLTranslator } from "./deeplTranslator";
import { GeminiTranslator } from "./geminiTranslator";
import { ITranslator } from "./ITranslator";
import { OpenAITranslator } from "./openaiTranslator";
import type { TranslationConfig, TranslationProviderName } from "./types";

type TranslationProviderResult = {
  provider: TranslationProviderName;
  translator: ITranslator;
};

const supportedProviders: TranslationProviderName[] = ["deepl", "openai", "gemini"];

function normalizeProvider(value: string | undefined | null) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "deepl" || normalized === "openai" || normalized === "gemini") {
    return normalized as TranslationProviderName;
  }
  return null;
}

function providerHasKey(provider: TranslationProviderName, apiKeys: TranslationConfig["apiKeys"]) {
  if (provider === "deepl") return Boolean(apiKeys.deepl);
  if (provider === "openai") return Boolean(apiKeys.openai);
  if (provider === "gemini") return Boolean(apiKeys.gemini);
  return false;
}

function instantiateProvider(
  provider: TranslationProviderName,
  config: TranslationConfig
): TranslationProviderResult | null {
  if (!supportedProviders.includes(provider)) return null;
  if (!providerHasKey(provider, config.apiKeys)) return null;

  if (provider === "deepl") {
    return {
      provider,
      translator: new DeepLTranslator({
        apiKey: config.apiKeys.deepl ?? "",
        apiUrl: config.apiUrls?.deepl,
      }),
    };
  }

  if (provider === "openai") {
    const fallback =
      config.fallback === "deepl" && providerHasKey("deepl", config.apiKeys)
        ? new DeepLTranslator({
            apiKey: config.apiKeys.deepl ?? "",
            apiUrl: config.apiUrls?.deepl,
          })
        : undefined;

    return {
      provider,
      translator: new OpenAITranslator({
        apiKey: config.apiKeys.openai ?? "",
        apiUrl: config.apiUrls?.openai,
        model: config.models?.openai,
        fallback,
      }),
    };
  }

  if (provider === "gemini") {
    const fallback =
      config.fallback === "deepl" && providerHasKey("deepl", config.apiKeys)
        ? new DeepLTranslator({
            apiKey: config.apiKeys.deepl ?? "",
            apiUrl: config.apiUrls?.deepl,
          })
        : undefined;

    return {
      provider,
      translator: new GeminiTranslator({
        apiKey: config.apiKeys.gemini ?? "",
        apiUrl: config.apiUrls?.gemini,
        model: config.models?.gemini,
        fallback,
      }),
    };
  }

  return null;
}

export function createTranslator(config: TranslationConfig): TranslationProviderResult {
  const providersToTry = [config.provider, config.fallback].filter(Boolean) as TranslationProviderName[];
  const uniqueProviders = Array.from(new Set(providersToTry));

  for (const provider of uniqueProviders) {
    const instance = instantiateProvider(provider, config);
    if (instance) return instance;
  }

  const checked = uniqueProviders.length ? uniqueProviders.join(", ") : "(none)";
  throw new Error(`No supported translation providers available. Checked: ${checked}`);
}

export function loadTranslationConfigFromEnv(): TranslationConfig {
  const provider = normalizeProvider(process.env.TRANSLATION_PROVIDER) ?? "deepl";
  const fallback = normalizeProvider(process.env.TRANSLATION_FALLBACK) ?? undefined;

  return {
    provider,
    fallback,
    apiKeys: {
      deepl: process.env.DEEPL_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
    },
    apiUrls: {
      deepl: process.env.DEEPL_API_URL,
      openai: process.env.OPENAI_API_URL,
      gemini: process.env.GEMINI_API_URL,
    },
    models: {
      openai: process.env.OPENAI_MODEL,
      gemini: process.env.GEMINI_MODEL,
    },
  };
}
