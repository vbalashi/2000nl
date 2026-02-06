import { ITranslator } from "./ITranslator";

type OpenAITranslatorOptions = {
  apiKey: string;
  apiUrl?: string;
  model?: string;
  fallback?: ITranslator;
  maxRetries?: number;
  timeoutMs?: number;
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
const DEFAULT_MODEL = "gpt-4o-mini";
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

function buildMessages(texts: string[], targetLang: string) {
  const label = targetLanguageLabel(targetLang);
  return [
    {
      role: "system",
      content:
        "You are a translation engine. Translate all input texts faithfully, keeping punctuation and formatting.",
    },
    {
      role: "user",
      content: JSON.stringify({
        targetLanguage: label,
        texts,
        responseFormat: {
          translations: ["string"],
        },
        instructions:
          "Return only valid JSON with a top-level 'translations' array aligned to the input order.",
      }),
    },
  ];
}

function parseTranslations(content: string, expectedCount: number) {
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

  return translations.map((item) => (typeof item === "string" ? item : String(item)));
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
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const attemptTranslate = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            temperature: 0,
            messages: buildMessages(texts, targetLang),
          }),
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

        return parseTranslations(content, texts.length);
      } finally {
        clearTimeout(timeout);
      }
    };

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const translated = await attemptTranslate();
        return Array.isArray(textOrTexts) ? translated : translated[0] ?? "";
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
        const fallbackResult = await this.fallback.translate(texts, targetLang);
        return Array.isArray(textOrTexts) ? fallbackResult : fallbackResult[0] ?? "";
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
}
