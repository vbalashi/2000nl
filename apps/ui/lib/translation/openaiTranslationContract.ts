import { loadPromptText } from "./prompts/promptLoader";

export type OpenAITranslationContext = {
  partOfSpeech?: string | null;
  partOfSpeechCode?: string | null;
  sourceLanguageCode?: string | null;
  purpose?: string | null;
  contextText?: string | null;
};

export type ParsedOpenAITranslationResult = {
  translations: string[];
  literalTranslations?: string[];
  note: string | null;
};

export type OpenAITranslationMessage = {
  role: "system" | "user";
  content: string;
};

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

export function buildOpenAITranslationMessages(
  texts: string[],
  targetLang: string,
  context?: OpenAITranslationContext,
): OpenAITranslationMessage[] {
  const label = targetLanguageLabel(targetLang);
  const pos = context?.partOfSpeech?.trim() || null;
  const posCode = context?.partOfSpeechCode?.trim() || null;
  const sourceLanguageCode = context?.sourceLanguageCode?.trim() || null;
  const purpose = context?.purpose?.trim() || null;
  const contextText = context?.contextText?.trim() || null;

  const systemPrompt =
    loadPromptText("openai_translation_system_v1.txt").trim() ||
    "You are a translation engine. Translate all input texts faithfully, keeping punctuation and formatting. If partOfSpeech is provided, use it to disambiguate the headword sense. Also provide a brief contextual note (1-2 sentences) about the most common meaning of the headword vs its meaning in the specific example/context, when different.";
  const userInstructions =
    loadPromptText("openai_translation_user_instructions_v1.txt").trim() ||
    "Return only valid JSON with top-level keys: 'translations' (array aligned to input order) and 'note' (string or null). Keep 'note' to 1-2 sentences max; use null if no meaningful note applies.";

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: JSON.stringify({
        targetLanguage: label,
        targetLanguageCode: targetLang,
        commentLanguage: label,
        sourceLanguageCode,
        purpose,
        partOfSpeech: pos,
        partOfSpeechCode: posCode,
        texts,
        contextText,
        responseFormat: {
          translations: ["string"],
          literalTranslations: ["string"],
          note: "string | null",
        },
        instructions: userInstructions,
      }),
    },
  ];
}

export function parseOpenAITranslationResult(
  content: string,
  expectedCount: number,
): ParsedOpenAITranslationResult {
  let payload: unknown;
  try {
    payload = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned invalid JSON");
  }

  const record = asRecord(payload);
  const translations = record.translations;
  if (!Array.isArray(translations)) {
    throw new Error("OpenAI response missing translations array");
  }
  if (translations.length !== expectedCount) {
    throw new Error(
      `OpenAI returned ${translations.length} translations for ${expectedCount} inputs`,
    );
  }

  const literalTranslationsRaw = record.literalTranslations;
  const literalTranslations = Array.isArray(literalTranslationsRaw)
    ? literalTranslationsRaw.map((item) =>
        typeof item === "string" ? item : String(item),
      )
    : undefined;
  const noteRaw = record.note;
  const note =
    typeof noteRaw === "string" ? noteRaw.trim().slice(0, 800) : null;

  return {
    translations: translations.map((item) =>
      typeof item === "string" ? item : String(item),
    ),
    ...(literalTranslations?.length === expectedCount
      ? { literalTranslations }
      : {}),
    note: note && note.length > 0 ? note : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
