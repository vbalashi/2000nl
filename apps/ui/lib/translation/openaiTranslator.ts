import type { ITranslator } from "./ITranslator";
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
    primaryError?: string;
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
const DEFAULT_MAX_RETRIES = 2;

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

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
      const result = await this.withRetries(async () =>
        parseOpenAITranslationResult(
          await this.requestChatContent(
            buildOpenAITranslationMessages(texts, targetLang, context),
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
      lastError = error;
    }

    if (this.fallback) {
      try {
        // Avoid logging inputs; log only high-level diagnostics.
        console.warn("[translation] OpenAI failed; using DeepL fallback", {
          openaiKeyHash,
          model: this.model,
          error: String(lastError),
        });

        const fallbackResult = await this.fallback.translate(texts, targetLang);
        return {
          translations: fallbackResult,
          note: null,
          meta: {
            providerSelected: "openai",
            providerUsed: "deepl",
            usedFallback: true,
            primaryError: String(lastError),
            openaiKeyHash,
            model: this.model,
          },
        };
      } catch (fallbackErr) {
        throw new Error(
          `OpenAI failed (${String(lastError)}) and fallback failed (${String(
            fallbackErr
          )})`
        );
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async translateDictionaryMeaning(
    request: DictionaryMeaningTranslationRequestV1,
  ): Promise<OpenAIDictionaryMeaningTranslationResult> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    try {
      const result = await this.withRetries(async () =>
        parseDictionaryMeaningTranslationResult(
          await this.requestChatContent(
            buildDictionaryMeaningTranslationMessages(request),
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
      if (!this.fallback) throw primaryError;
      const fallbackResult =
        await translateDictionaryMeaningWithGenericProvider(
          this.fallback,
          request,
          {
            providerSelected: "openai",
            providerUsed: "deepl",
            usedFallback: true,
            primaryError: String(primaryError),
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

  private async withRetries<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          await delay(300 * Math.pow(2, attempt));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async requestChatContent(
    messages: OpenAITranslationMessage[],
  ): Promise<string> {
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
      if (this.model.startsWith("gpt-5")) body.reasoning_effort = "none";

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
      if (!response.ok) {
        const responseBody = await response.text().catch(() => "");
        throw new Error(
          `OpenAI error ${response.status}: ${responseBody || response.statusText}`,
        );
      }
      const data = (await response.json()) as OpenAIChatResponse;
      if (data?.error?.message) {
        throw new Error(`OpenAI error: ${data.error.message}`);
      }
      const content = data?.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) {
        throw new Error("OpenAI returned an empty translation");
      }
      return content;
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
