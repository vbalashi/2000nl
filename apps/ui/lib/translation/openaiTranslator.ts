import { dictionaryTranslationProfile } from "./dictionaryTranslationProfile";
import { withTranslationRetries, safeProviderRequestId, retryAfterMs, type TranslationAttemptDiagnostic } from "./translationRetry";
import type {
  ITranslator,
  TranslationProviderTextRequest,
} from "./ITranslator";
import crypto from "crypto";
import {
  buildOpenAITranslationMessages,
  parseOpenAITranslationResult,
  type OpenAITranslationContext,
  type OpenAITranslationMessage,
} from "./openaiTranslationContract";
import {
  buildDictionaryMeaningTranslationMessages,
  parseDictionaryMeaningTranslationResult,
  type DictionaryMeaningTranslationRequestV1,
  type DictionaryMeaningTranslationResultV1,
} from "./dictionaryMeaningTranslationContract";
import { translateDictionaryMeaningWithGenericProvider } from "./dictionaryMeaningTranslationService";
import {
  normalizeTranslationProviderError,
  safeTranslationProviderError,
  type TranslationProviderFailure,
} from "./translationProviderFailure";

type OpenAITranslatorOptions = {
  apiKey: string;
  apiUrl?: string;
  model?: string;
  fallback?: ITranslator;
  maxRetries?: number;
  timeoutMs?: number;
};

export type { OpenAITranslationContext } from "./openaiTranslationContract";

export type OpenAITranslationResult = {
  translations: string[];
  literalTranslations?: string[];
  note: string | null;
  // Optional metadata for debugging/observability (never includes input texts).
  meta?: {
    providerSelected: "openai";
    providerUsed: "openai" | "deepl";
    usedFallback: boolean;
    primaryFailure?: TranslationProviderFailure;
    openaiKeyHash?: string;
    model?: string;
  };
};

export type OpenAIDictionaryMeaningTranslationResult =
  DictionaryMeaningTranslationResultV1 & {
    meta: NonNullable<OpenAITranslationResult["meta"]>;
  };

type OpenAIChatResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

const DEFAULT_API_URL = "https://api.openai.com/v1/chat/completions";
// Verified via OpenAI Platform docs (Context7): "gpt-5.2"
const DEFAULT_MODEL = "gpt-5.2";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 3;

function looksLikeAzureOpenAI(apiUrl: string) {
  // Azure OpenAI endpoints commonly use:
  // - https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=...
  // - https://{resource}.openai.azure.com/openai/v1/chat/completions  (OpenAI-compatible v1)
  const url = (apiUrl || "").toLowerCase();
  return url.includes(".openai.azure.com") || url.includes("azure.com/openai/");
}

function resolveChatCompletionsUrl(apiUrl: string) {
  const trimmed = (apiUrl || "").trim();
  if (!trimmed) return trimmed;

  // Support passing a base URL (common when copying "endpoint" values).
  // This keeps behavior backward compatible: if you pass a full endpoint, we use it as-is.
  if (/\/openai\/v1\/?$/i.test(trimmed)) {
    return `${trimmed.replace(/\/+$/, "")}/chat/completions`;
  }
  if (/\/openai\/v1\/?$/.test(trimmed.toLowerCase())) {
    return `${trimmed.replace(/\/+$/, "")}/chat/completions`;
  }
  return trimmed;
}

function keyHash(apiKey: string) {
  if (!apiKey) return "";
  return crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 10);
}

export class OpenAITranslator implements ITranslator {
  private apiKey: string;
  private apiUrl: string;
  private model: string;
  private fallback?: ITranslator;
  private maxRetries: number;
  private timeoutMs: number;

  constructor(options: OpenAITranslatorOptions) {
    this.apiKey = options.apiKey;
    this.apiUrl = resolveChatCompletionsUrl(options.apiUrl ?? DEFAULT_API_URL);
    this.model = options.model ?? DEFAULT_MODEL;
    this.fallback = options.fallback;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async translateText(request: TranslationProviderTextRequest) {
    return this.translateWithContextAndNote(
      request.texts,
      request.targetLanguageCode,
      {
        sourceLanguageCode: request.sourceLanguageCode,
        purpose: request.purpose,
        contextText: request.contextText ?? undefined,
      },
    );
  }

  async translateWithContext(
    text: string,
    targetLang: string,
    context?: OpenAITranslationContext
  ): Promise<string>;
  async translateWithContext(
    texts: string[],
    targetLang: string,
    context?: OpenAITranslationContext
  ): Promise<string[]>;
  async translateWithContext(
    textOrTexts: string | string[],
    targetLang: string,
    context: OpenAITranslationContext = {}
  ) {
    const texts = Array.isArray(textOrTexts) ? textOrTexts : [textOrTexts];
    if (texts.length === 0) return Array.isArray(textOrTexts) ? [] : "";
    const result = await this.translateWithContextAndNote(texts, targetLang, context);
    return Array.isArray(textOrTexts) ? result.translations : result.translations[0] ?? "";
  }

  async translateWithContextAndNote(
    texts: string[],
    targetLang: string,
    context: OpenAITranslationContext = {}
  ): Promise<OpenAITranslationResult> {
    if (texts.length === 0) return { translations: [], note: null };
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const openaiKeyHash = keyHash(this.apiKey);
    let lastError: unknown = null;
    try {
      const result = await this.withRetries(async diagnostic =>
        parseOpenAITranslationResult(
          await this.requestChatContent(
            buildOpenAITranslationMessages(texts, targetLang, context),
            diagnostic,
          ),
          texts.length,
        ),
      );
      return {
        ...result,
        meta: {
          providerSelected: "openai" as const,
          providerUsed: "openai" as const,
          usedFallback: false,
          openaiKeyHash,
          model: this.model,
        },
      };
    } catch (error) {
      lastError = normalizeTranslationProviderError(
        error,
        "provider_response_error",
      );
    }

    if (this.fallback) {
      try {
        // Avoid logging inputs; log only high-level diagnostics.
        console.warn("[translation] OpenAI failed; using DeepL fallback", {
          openaiKeyHash,
          model: this.model,
          failure: normalizeTranslationProviderError(lastError).failure,
        });

        const fallbackResult = await this.fallback.translate(texts, targetLang);
        return {
          translations: fallbackResult,
          note: null,
          meta: {
            providerSelected: "openai",
            providerUsed: "deepl",
            usedFallback: true,
            primaryFailure: normalizeTranslationProviderError(lastError).failure,
            openaiKeyHash,
            model: this.model,
          },
        };
      } catch (fallbackErr) {
        throw safeTranslationProviderError("provider_fallback_error", {
          primary: normalizeTranslationProviderError(lastError).failure,
          fallback: normalizeTranslationProviderError(fallbackErr).failure,
        });
      }
    }

    throw normalizeTranslationProviderError(lastError);
  }

  async translateDictionaryMeaning(
    request: DictionaryMeaningTranslationRequestV1,
  ): Promise<OpenAIDictionaryMeaningTranslationResult> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    try {
      const result = await this.withRetries(async diagnostic =>
        parseDictionaryMeaningTranslationResult(
          await this.requestChatContent(
            buildDictionaryMeaningTranslationMessages(request),
            diagnostic,
            true,
          ),
          request,
        ),
      );
      return {
        ...result,
        meta: {
          providerSelected: "openai",
          providerUsed: "openai",
          usedFallback: false,
          openaiKeyHash: keyHash(this.apiKey),
          model: this.model,
        },
      };
    } catch (primaryError) {
      const primaryFailure = normalizeTranslationProviderError(
        primaryError,
        "provider_response_error",
      );
      if (!this.fallback) throw primaryFailure;
      const fallbackResult =
        await translateDictionaryMeaningWithGenericProvider(
          this.fallback,
          request,
          {
            providerSelected: "openai",
            providerUsed: "deepl",
            usedFallback: true,
            primaryFailure: primaryFailure.failure,
            openaiKeyHash: keyHash(this.apiKey),
            model: this.model,
          },
        );
      return {
        ...fallbackResult,
        meta: fallbackResult.meta as NonNullable<
          OpenAITranslationResult["meta"]
        >,
      };
    }
  }

  private async withRetries<T>(operation: (diagnostic: TranslationAttemptDiagnostic) => Promise<T>): Promise<T> {
    return withTranslationRetries(operation, {
      maxRetries: this.maxRetries,
      classify: error => normalizeTranslationProviderError(error, "provider_response_error").failure.code,
      log: event => console.info("[translation] attempt", event),
    });
  }

  private async requestChatContent(
    messages: OpenAITranslationMessage[],
    diagnostic: TranslationAttemptDiagnostic,
    dictionary = false,
  ): Promise<string> {
    if (/^[a-zA-Z0-9._-]{1,100}$/.test(this.model)) diagnostic.model = this.model;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const isAzure = looksLikeAzureOpenAI(this.apiUrl);
    try {
      const includeModel = !isAzure || !/\/openai\/deployments\//i.test(this.apiUrl);
      const body: Record<string, unknown> = {
        temperature: 0,
        messages,
      };
      if (includeModel) body.model = this.model;
      if (dictionary && dictionaryTranslationProfile().id !== "legacy") {
        const profile = dictionaryTranslationProfile();
        if (this.model !== profile.model) throw safeTranslationProviderError("provider_response_error", null);
        delete body.temperature;
        Object.assign(body, profile.requestSettings);
      } else if (this.model.startsWith("gpt-5")) body.reasoning_effort = "none";

      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(isAzure
            ? { "api-key": this.apiKey }
            : { Authorization: `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      diagnostic.stage = "response";
      diagnostic.status = response.status;
      diagnostic.requestId = safeProviderRequestId(response.headers?.get("x-request-id") ?? response.headers?.get("apim-request-id") ?? null);
      diagnostic.retryAfterMs = retryAfterMs(response.headers?.get("retry-after") ?? null);
      if (!response.ok) {
        diagnostic.reason = "http_status";
        const responseBody = await response.text().catch(() => "");
        throw safeTranslationProviderError("provider_http_error", {
          status: response.status,
          diagnostic: responseBody || response.statusText,
        });
      }
      let data: OpenAIChatResponse;
      try { data = (await response.json()) as OpenAIChatResponse; }
      catch { diagnostic.reason = "invalid_json"; throw safeTranslationProviderError("provider_response_error", null); }
      if (data?.error?.message) {
        diagnostic.reason = "provider_reported_error";
        throw safeTranslationProviderError(
          "provider_response_error",
          data.error.message,
        );
      }
      const usage = (data as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
      if (Number.isInteger(usage?.prompt_tokens) && usage!.prompt_tokens! >= 0) diagnostic.inputTokens = usage!.prompt_tokens;
      if (Number.isInteger(usage?.completion_tokens) && usage!.completion_tokens! >= 0) diagnostic.outputTokens = usage!.completion_tokens;
      if (data?.choices?.[0]?.finish_reason && data.choices[0].finish_reason !== "stop") {
        diagnostic.reason = "incomplete";
        throw safeTranslationProviderError("provider_response_error", null);
      }
      const content = data?.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) {
        diagnostic.reason = "empty_content";
        throw safeTranslationProviderError("provider_empty_response", "empty");
      }
      diagnostic.stage = "contract";
      return content;
    } catch (error) {
      if (controller.signal.aborted) {
        diagnostic.reason = "timeout";
        throw safeTranslationProviderError("provider_timeout", error);
      }
      if (diagnostic.stage === "request") diagnostic.reason = "network";
      throw normalizeTranslationProviderError(error, diagnostic.stage === "request" ? "provider_network_error" : "provider_response_error");
    } finally {
      clearTimeout(timeout);
    }
  }

  async translate(text: string, targetLang: string): Promise<string>;
  async translate(texts: string[], targetLang: string): Promise<string[]>;
  async translate(
    textOrTexts: string | string[],
    targetLang: string
  ): Promise<string | string[]> {
    return this.translateWithContext(textOrTexts as any, targetLang);
  }
}
