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
  const provider = normalizeProvider(process.env.TRANSLATION_PROVIDER) ?? "openai";
  const fallback =
    normalizeProvider(process.env.TRANSLATION_FALLBACK) ??
    (provider === "openai" || provider === "gemini" ? "deepl" : undefined);

  // Azure OpenAI support:
  // - Prefer AZURE_OPENAI_* vars when set (common local/prod setup).
  // - If AZURE_OPENAI_API_VERSION is set, use the deployments-style endpoint.
  // - Otherwise use the OpenAI-compatible v1 endpoint at `/openai/v1/` and treat
  //   OPENAI_MODEL (or AZURE_OPENAI_DEPLOYMENT) as the deployment name.
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim() || "";
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY?.trim() || "";
  const azureDeployment =
    process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
    process.env.AZURE_OPENAI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "";
  const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION?.trim() || "";

  const openaiApiUrlFromEnv = process.env.OPENAI_API_URL?.trim() || "";
  const openaiApiUrl =
    openaiApiUrlFromEnv ||
    (azureEndpoint
      ? azureApiVersion && azureDeployment
        ? `${azureEndpoint.replace(/\/+$/, "")}/openai/deployments/${encodeURIComponent(
            azureDeployment
          )}/chat/completions?api-version=${encodeURIComponent(azureApiVersion)}`
        : `${azureEndpoint.replace(/\/+$/, "")}/openai/v1/chat/completions`
      : "");

  // Prefer Azure key when configured (many setups still leave OPENAI_API_KEY set).
  const openaiApiKey = (azureApiKey || process.env.OPENAI_API_KEY?.trim() || "") || undefined;
  const openaiModel =
    azureDeployment || process.env.OPENAI_MODEL?.trim() || undefined;

  return {
    provider,
    fallback,
    apiKeys: {
      deepl: process.env.DEEPL_API_KEY,
      openai: openaiApiKey,
      gemini: process.env.GEMINI_API_KEY,
    },
    apiUrls: {
      deepl: process.env.DEEPL_API_URL,
      openai: openaiApiUrl || undefined,
      gemini: process.env.GEMINI_API_URL,
    },
    models: {
      openai: openaiModel,
      gemini: process.env.GEMINI_MODEL,
    },
  };
}
