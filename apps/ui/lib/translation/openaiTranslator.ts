import { ITranslator } from "./ITranslator";

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

function buildMessages(texts: string[], targetLang: string, context?: OpenAITranslationContext) {
  const label = targetLanguageLabel(targetLang);
  const pos = context?.partOfSpeech?.trim() || null;
  const posCode = context?.partOfSpeechCode?.trim() || null;

  return [
    {
      role: "system",
      content:
        "You are a translation engine. Translate all input texts faithfully, keeping punctuation and formatting. If partOfSpeech is provided, use it to disambiguate the headword sense. Also provide a brief contextual note (1-2 sentences) about the most common meaning of the headword vs its meaning in the specific example/context, when different.",
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
        instructions:
          "Return only valid JSON with top-level keys: 'translations' (array aligned to input order) and 'note' (string or null). Keep 'note' to 1-2 sentences max; use null if no meaningful note applies.",
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
  };
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

    const attemptTranslate = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const body: Record<string, any> = {
          model: this.model,
          temperature: 0,
          messages: buildMessages(texts, targetLang, context),
        };
        // GPT-5.x supports reasoning_effort; keep it off for translation.
        if (this.model.startsWith("gpt-5")) {
          body.reasoning_effort = "none";
        }

        const res = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
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
        return await attemptTranslate();
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
        return {
          translations: fallbackResult,
          note: null,
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
