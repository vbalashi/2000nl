import { ITranslator, type TranslationProviderTextResult } from "./ITranslator";
import crypto from "crypto";
import {
  normalizeTranslationProviderError,
  safeTranslationProviderError,
} from "./translationProviderFailure";

type GeminiTranslatorOptions = {
  apiKey: string;
  apiUrl?: string;
  model?: string;
  fallback?: ITranslator;
  maxRetries?: number;
  timeoutMs?: number;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

const DEFAULT_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-1.5-flash";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 2;

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  "en-us": "English",
  "en-gb": "English",
  nl: "Dutch",
  ru: "Russian",
};

function normalizeLang(lang: string) {
  return lang.trim().toLowerCase().replace("_", "-");
}

function targetLanguageLabel(targetLang: string) {
  const normalized = normalizeLang(targetLang);
  return LANGUAGE_LABELS[normalized] ?? targetLang.trim();
}

function buildPrompt(texts: string[], targetLang: string) {
  const label = targetLanguageLabel(targetLang);
  return JSON.stringify({
    targetLanguage: label,
    texts,
    responseFormat: {
      translations: ["string"],
    },
    instructions:
      "Return only valid JSON with a top-level 'translations' array aligned to the input order.",
  });
}

function parseTranslations(content: string, expectedCount: number) {
  let payload: any = null;
  try {
    payload = JSON.parse(content);
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  const translations = payload?.translations;
  if (!Array.isArray(translations)) {
    throw new Error("Gemini response missing translations array");
  }
  if (translations.length !== expectedCount) {
    throw new Error(
      `Gemini returned ${translations.length} translations for ${expectedCount} inputs`
    );
  }

  return translations.map((item) => (typeof item === "string" ? item : String(item)));
}

function resolveEndpoint(apiUrl: string | undefined, model: string) {
  if (!apiUrl?.trim()) {
    return `${DEFAULT_API_URL}/${model}:generateContent`;
  }

  const trimmed = apiUrl.trim();
  if (trimmed.includes("{model}")) {
    return trimmed.replace("{model}", model);
  }
  if (trimmed.endsWith(":generateContent")) {
    return trimmed;
  }
  return `${trimmed.replace(/\/+$/, "")}/${model}:generateContent`;
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function keyHash(apiKey: string) {
  if (!apiKey) return "";
  return crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 10);
}

export class GeminiTranslator implements ITranslator {
  private apiKey: string;
  private apiUrl: string;
  private model: string;
  private fallback?: ITranslator;
  private maxRetries: number;
  private timeoutMs: number;

  constructor(options: GeminiTranslatorOptions) {
    this.apiKey = options.apiKey;
    this.apiUrl = options.apiUrl ?? DEFAULT_API_URL;
    this.model = options.model ?? DEFAULT_MODEL;
    this.fallback = options.fallback;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async translate(text: string, targetLang: string): Promise<string>;
  async translate(texts: string[], targetLang: string): Promise<string[]>;
  async translate(textOrTexts: string | string[], targetLang: string) {
    const texts = Array.isArray(textOrTexts) ? textOrTexts : [textOrTexts];
    if (texts.length === 0) return Array.isArray(textOrTexts) ? [] : "";
    const result = await this.translateWithMetadata(texts, targetLang);
    return Array.isArray(textOrTexts)
      ? result.translations
      : result.translations[0] ?? "";
  }

  async translateWithMetadata(
    texts: string[],
    targetLang: string,
  ): Promise<TranslationProviderTextResult> {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const geminiKeyHash = keyHash(this.apiKey);
    const attemptTranslate = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const endpoint = resolveEndpoint(this.apiUrl, this.model);
        const url = new URL(endpoint);
        if (!url.searchParams.has("key")) {
          url.searchParams.set("key", this.apiKey);
        }

        const res = await fetch(url.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: buildPrompt(texts, targetLang),
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
            },
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw safeTranslationProviderError("provider_http_error", {
            status: res.status,
            diagnostic: body || res.statusText,
          });
        }

        const data = (await res.json()) as GeminiResponse;
        if (data?.error?.message) {
          throw safeTranslationProviderError(
            "provider_response_error",
            data.error.message,
          );
        }

        const content =
          data?.candidates?.[0]?.content?.parts?.map((part) => part?.text ?? "").join("") ??
          "";
        if (!content.trim()) {
          throw safeTranslationProviderError("provider_empty_response", "empty");
        }

        return parseTranslations(content, texts.length);
      } catch (error) {
        if (controller.signal.aborted) {
          throw safeTranslationProviderError("provider_timeout", error);
        }
        throw normalizeTranslationProviderError(error, "provider_network_error");
      } finally {
        clearTimeout(timeout);
      }
    };

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const translated = await attemptTranslate();
        return {
          translations: translated,
          meta: {
            providerSelected: "gemini",
            providerUsed: "gemini",
            usedFallback: false,
            model: this.model,
          },
        };
      } catch (err) {
        lastError = normalizeTranslationProviderError(
          err,
          "provider_response_error",
        );
        if (attempt < this.maxRetries) {
          await delay(300 * Math.pow(2, attempt));
          continue;
        }
      }
    }

    if (this.fallback) {
      try {
        console.warn("[translation] Gemini failed; using DeepL fallback", {
          geminiKeyHash,
          model: this.model,
          failure: normalizeTranslationProviderError(lastError).failure,
        });
        const fallbackResult = await this.fallback.translate(texts, targetLang);
        const translations = Array.isArray(fallbackResult)
          ? fallbackResult
          : [fallbackResult];
        return {
          translations,
          meta: {
            providerSelected: "gemini",
            providerUsed: "deepl",
            usedFallback: true,
            primaryFailure: normalizeTranslationProviderError(lastError).failure,
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
}
