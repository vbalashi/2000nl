import { ITranslator } from "./ITranslator";
import { loadPromptText } from "./prompts/promptLoader";
import crypto from "crypto";

type OpenAITranslatorOptions = {
  apiKey: string;
  apiUrl?: string;
  model?: string;
  fallback?: ITranslator;
  maxRetries?: number;
  timeoutMs?: number;
};

export type OpenAITranslationContext = {
  partOfSpeech?: string | null;
  partOfSpeechCode?: string | null;
};

export type OpenAITranslationResult = {
  translations: string[];
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

function buildMessages(texts: string[], targetLang: string, context?: OpenAITranslationContext) {
  const label = targetLanguageLabel(targetLang);
  const pos = context?.partOfSpeech?.trim() || null;
  const posCode = context?.partOfSpeechCode?.trim() || null;

  const systemPrompt =
    loadPromptText("openai_translation_system_v1.txt").trim() ||
    "You are a translation engine. Translate all input texts faithfully, keeping punctuation and formatting. If partOfSpeech is provided, use it to disambiguate the headword sense. Also provide a brief contextual note (1-2 sentences) about the most common meaning of the headword vs its meaning in the specific example/context, when different.";
  const userInstructions =
    loadPromptText("openai_translation_user_instructions_v1.txt").trim() ||
    "Return only valid JSON with top-level keys: 'translations' (array aligned to input order) and 'note' (string or null). Keep 'note' to 1-2 sentences max; use null if no meaningful note applies.";

  return [
    {
      role: "system",
      content:
        systemPrompt,
    },
    {
      role: "user",
      content: JSON.stringify({
        targetLanguage: label,
        partOfSpeech: pos,
        partOfSpeechCode: posCode,
        texts,
        responseFormat: {
          translations: ["string"],
          note: "string | null",
        },
        instructions: userInstructions,
      }),
    },
  ];
}

function parseTranslationResult(content: string, expectedCount: number): OpenAITranslationResult {
  let payload: any = null;
  try {
    payload = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned invalid JSON");
  }

  const translations = payload?.translations;
  if (!Array.isArray(translations)) {
    throw new Error("OpenAI response missing translations array");
  }
  if (translations.length !== expectedCount) {
    throw new Error(
      `OpenAI returned ${translations.length} translations for ${expectedCount} inputs`
    );
  }

  const noteRaw = payload?.note;
  const note =
    typeof noteRaw === "string" ? noteRaw.trim().slice(0, 800) : null;

  return {
    translations: translations.map((item) =>
      typeof item === "string" ? item : String(item)
    ),
    note: note && note.length > 0 ? note : null,
    meta: {
      providerSelected: "openai",
      providerUsed: "openai",
      usedFallback: false,
    },
  };
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
    const isAzure = looksLikeAzureOpenAI(this.apiUrl);
    const attemptTranslate = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const includeModel = !isAzure || !/\/openai\/deployments\//i.test(this.apiUrl);
        const body: Record<string, any> = {
          temperature: 0,
          messages: buildMessages(texts, targetLang, context),
        };
        if (includeModel) body.model = this.model;
        // GPT-5.x supports reasoning_effort; keep it off for translation.
        if (this.model.startsWith("gpt-5")) {
          body.reasoning_effort = "none";
        }

        const res = await fetch(this.apiUrl, {
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

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`OpenAI error ${res.status}: ${body || res.statusText}`);
        }

        const data = (await res.json()) as OpenAIChatResponse;
        if (data?.error?.message) {
          throw new Error(`OpenAI error: ${data.error.message}`);
        }

        const content = data?.choices?.[0]?.message?.content ?? "";
        if (!content.trim()) {
          throw new Error("OpenAI returned an empty translation");
        }

        return parseTranslationResult(content, texts.length);
      } finally {
        clearTimeout(timeout);
      }
    };

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await attemptTranslate();
        return {
          ...result,
          meta: {
            providerSelected: "openai",
            providerUsed: "openai",
            usedFallback: false,
            openaiKeyHash,
            model: this.model,
          },
        };
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries) {
          await delay(300 * Math.pow(2, attempt));
          continue;
        }
      }
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

  async translate(text: string, targetLang: string): Promise<string>;
  async translate(texts: string[], targetLang: string): Promise<string[]>;
  async translate(
    textOrTexts: string | string[],
    targetLang: string
  ): Promise<string | string[]> {
    return this.translateWithContext(textOrTexts as any, targetLang);
  }
}
