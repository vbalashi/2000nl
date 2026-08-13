import { loadPromptText } from "./prompts/promptLoader";
import type { OpenAITranslationMessage } from "./openaiTranslationContract";
import { dictionaryTranslationContext } from "./dictionaryTranslationContext";

export const DICTIONARY_MEANING_TRANSLATION_CONTRACT_VERSION =
  "dictionary-meaning-translation-v1" as const;

export const DICTIONARY_MEANING_TRANSLATION_LIMITS = {
  entryIdCharacters: 128,
  sourceContentFingerprintCharacters: 128,
  languageCodeCharacters: 35,
  headwordCharacters: 120,
  articleCharacters: 32,
  partOfSpeechCharacters: 120,
  partOfSpeechCodeCharacters: 32,
  contentItems: 24,
  contentItemCharacters: 600,
  contentCharacters: 6_000,
  contentTokenUpperBound: 2_500,
  requestStringCharacters: 6_600,
  requestStringTokenUpperBound: 3_000,
  entryTranslationCharacters: 300,
  alternativeTexts: 5,
  contentTranslationCharacters: 1_200,
  noteCharacters: 800,
} as const;

export type DictionaryMeaningContentRole =
  | "definition"
  | "usage-pattern"
  | "example"
  | "idiom"
  | "idiom-explanation"
  | "usage-note";

export type DictionaryMeaningTranslationRequestV1 = {
  contractVersion: typeof DICTIONARY_MEANING_TRANSLATION_CONTRACT_VERSION;
  entryId: string;
  sourceContentFingerprint: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  headword: {
    text: string;
    article: string | null;
    partOfSpeech: string | null;
    partOfSpeechCode: string | null;
  };
  content: Array<{
    fieldId: string;
    role: DictionaryMeaningContentRole;
    text: string;
  }>;
};

export type DictionaryMeaningTranslationResultV1 = {
  entryTranslation: {
    primaryText: string;
    alternativeTexts: string[];
    baseText: string | null;
    note: string | null;
  } | null;
  contentTranslations: Array<{
    fieldId: string;
    text: string;
  }>;
};

export function buildDictionaryMeaningTranslationRequest(params: {
  entryId: string;
  sourceContentFingerprint: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  word: unknown;
}): DictionaryMeaningTranslationRequestV1 {
  const word = asRecord(params.word);
  const raw = asRecord(word.raw);
  const meanings = Array.isArray(raw.meanings) ? raw.meanings : [];
  const meaning = asRecord(meanings[0]);
  const partOfSpeechCode =
    typeof word.part_of_speech === "string" ? word.part_of_speech : null;
  const context = dictionaryTranslationContext(partOfSpeechCode);
  const entryId = requiredBoundedString(
    params.entryId,
    "entryId",
    DICTIONARY_MEANING_TRANSLATION_LIMITS.entryIdCharacters,
  );
  const sourceContentFingerprint = requiredBoundedString(
    params.sourceContentFingerprint,
    "sourceContentFingerprint",
    DICTIONARY_MEANING_TRANSLATION_LIMITS.sourceContentFingerprintCharacters,
  );
  const sourceLanguageCode = normalizeSourceLanguageCode(
    params.sourceLanguageCode,
  );
  const targetLanguageCode = normalizeLanguageCode(
    params.targetLanguageCode,
    "targetLanguageCode",
  );
  const headword = requiredTruncatedString(
    word.headword,
    "headword",
    DICTIONARY_MEANING_TRANSLATION_LIMITS.headwordCharacters,
  );
  const article = nullableTruncatedString(
    word.gender,
    DICTIONARY_MEANING_TRANSLATION_LIMITS.articleCharacters,
  );
  const normalizedPartOfSpeech = nullableTruncatedString(
    context.partOfSpeech,
    DICTIONARY_MEANING_TRANSLATION_LIMITS.partOfSpeechCharacters,
  );
  const normalizedPartOfSpeechCode = nullableTruncatedString(
    context.partOfSpeechCode,
    DICTIONARY_MEANING_TRANSLATION_LIMITS.partOfSpeechCodeCharacters,
  );
  const fixedStrings = [
    DICTIONARY_MEANING_TRANSLATION_CONTRACT_VERSION,
    entryId,
    sourceContentFingerprint,
    sourceLanguageCode,
    targetLanguageCode,
    headword,
    article,
    normalizedPartOfSpeech,
    normalizedPartOfSpeechCode,
  ].filter((value): value is string => value !== null);
  const content: DictionaryMeaningTranslationRequestV1["content"] = [];
  let remainingContentCharacters = Math.min(
    DICTIONARY_MEANING_TRANSLATION_LIMITS.contentCharacters,
    DICTIONARY_MEANING_TRANSLATION_LIMITS.requestStringCharacters -
      fixedStrings.reduce((sum, value) => sum + unicodeLength(value), 0),
  );
  let remainingContentTokenUpperBound = Math.min(
    DICTIONARY_MEANING_TRANSLATION_LIMITS.contentTokenUpperBound,
    DICTIONARY_MEANING_TRANSLATION_LIMITS.requestStringTokenUpperBound -
      fixedStrings.reduce((sum, value) => sum + tokenUpperBound(value), 0),
  );
  const push = (
    fieldId: string,
    role: DictionaryMeaningContentRole,
    value: unknown,
  ) => {
    const metadataCharacters = unicodeLength(fieldId) + unicodeLength(role);
    const metadataTokenUpperBound =
      tokenUpperBound(fieldId) + tokenUpperBound(role);
    if (
      content.length >= DICTIONARY_MEANING_TRANSLATION_LIMITS.contentItems ||
      remainingContentCharacters <= metadataCharacters ||
      remainingContentTokenUpperBound <= metadataTokenUpperBound
    ) {
      return;
    }
    const text = boundedString(
      value,
      Math.min(
        DICTIONARY_MEANING_TRANSLATION_LIMITS.contentItemCharacters,
        remainingContentCharacters - metadataCharacters,
      ),
      remainingContentTokenUpperBound - metadataTokenUpperBound,
    );
    if (!text) return;
    content.push({ fieldId, role, text });
    remainingContentCharacters -= metadataCharacters + unicodeLength(text);
    remainingContentTokenUpperBound -=
      metadataTokenUpperBound + tokenUpperBound(text);
  };

  push("definition", "definition", meaning.definition);
  push("usage-pattern", "usage-pattern", meaning.context);
  for (const [index, example] of asArray(meaning.examples).entries()) {
    push(`example:${index}`, "example", example);
  }
  for (const [index, idiomValue] of asArray(meaning.idioms).entries()) {
    if (typeof idiomValue === "string") {
      push(`idiom:${index}`, "idiom", idiomValue);
      continue;
    }
    const idiom = asRecord(idiomValue);
    push(`idiom:${index}`, "idiom", idiom.expression);
    push(
      `idiom:${index}:explanation`,
      "idiom-explanation",
      idiom.explanation,
    );
    for (const [exampleIndex, example] of asArray(idiom.examples).entries()) {
      push(`idiom:${index}:example:${exampleIndex}`, "example", example);
    }
  }
  push("usage-note", "usage-note", meaning.note);

  return {
    contractVersion: DICTIONARY_MEANING_TRANSLATION_CONTRACT_VERSION,
    entryId,
    sourceContentFingerprint,
    sourceLanguageCode,
    targetLanguageCode,
    headword: {
      text: headword,
      article,
      partOfSpeech: normalizedPartOfSpeech,
      partOfSpeechCode: normalizedPartOfSpeechCode,
    },
    content,
  };
}

export function buildDictionaryMeaningTranslationMessages(
  request: DictionaryMeaningTranslationRequestV1,
): OpenAITranslationMessage[] {
  return [
    {
      role: "system",
      content: loadPromptText(
        "openai_dictionary_meaning_system_v1.txt",
      ).trim(),
    },
    {
      role: "user",
      content: JSON.stringify({
        ...request,
        responseFormat: {
          entryTranslation: {
            primaryText: "string",
            alternativeTexts: ["string"],
            baseText: "string | null",
            note: "string | null",
          } as const,
          contentTranslations: [
            {
              fieldId: "string",
              text: "string",
            },
          ],
        },
        instructions: loadPromptText(
          "openai_dictionary_meaning_user_v1.txt",
        ).trim(),
      }),
    },
  ];
}

export function parseDictionaryMeaningTranslationResult(
  content: string,
  request: DictionaryMeaningTranslationRequestV1,
): DictionaryMeaningTranslationResultV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned invalid dictionary meaning JSON");
  }

  const payload = strictRecord(parsed, [
    "entryTranslation",
    "contentTranslations",
  ], "response");
  let entryTranslation: DictionaryMeaningTranslationResultV1["entryTranslation"] = null;
  if (payload.entryTranslation !== null) {
    const entry = strictRecord(
      payload.entryTranslation,
      ["primaryText", "alternativeTexts", "baseText", "note"],
      "entryTranslation",
    );
    const primaryText = requiredBoundedString(
      entry.primaryText,
      "entryTranslation.primaryText",
      DICTIONARY_MEANING_TRANSLATION_LIMITS.entryTranslationCharacters,
    );
    if (!Array.isArray(entry.alternativeTexts)) {
      throw new Error("entryTranslation.alternativeTexts must be an array");
    }
    if (
      entry.alternativeTexts.length >
      DICTIONARY_MEANING_TRANSLATION_LIMITS.alternativeTexts
    ) {
      throw new Error("entryTranslation.alternativeTexts exceeds the limit");
    }
    const alternativeTexts = entry.alternativeTexts.map((value, index) =>
      requiredBoundedString(
        value,
        `entryTranslation.alternativeTexts[${index}]`,
        DICTIONARY_MEANING_TRANSLATION_LIMITS.entryTranslationCharacters,
      ),
    );
    const normalizedAlternatives = new Set<string>();
    for (const alternative of alternativeTexts) {
      const normalized = alternative.toLocaleLowerCase();
      if (
        normalized === primaryText.toLocaleLowerCase() ||
        normalizedAlternatives.has(normalized)
      ) {
        throw new Error("entryTranslation.alternativeTexts must be unique");
      }
      normalizedAlternatives.add(normalized);
    }
    entryTranslation = {
      primaryText,
      alternativeTexts,
      baseText: nullableBoundedString(
        entry.baseText,
        "entryTranslation.baseText",
        DICTIONARY_MEANING_TRANSLATION_LIMITS.entryTranslationCharacters,
      ),
      note: nullableBoundedString(
        entry.note,
        "entryTranslation.note",
        DICTIONARY_MEANING_TRANSLATION_LIMITS.noteCharacters,
      ),
    };
  }

  if (!Array.isArray(payload.contentTranslations)) {
    throw new Error("contentTranslations must be an array");
  }
  if (payload.contentTranslations.length !== request.content.length) {
    throw new Error("contentTranslations must align with request content");
  }
  const contentTranslations = payload.contentTranslations.map((value, index) => {
    const item = strictRecord(value, ["fieldId", "text"], `contentTranslations[${index}]`);
    const fieldId = requiredString(
      item.fieldId,
      `contentTranslations[${index}].fieldId`,
    );
    if (fieldId !== request.content[index].fieldId) {
      throw new Error("contentTranslations must align with request content");
    }
    return {
      fieldId,
      text: requiredBoundedString(
        item.text,
        `contentTranslations[${index}].text`,
        DICTIONARY_MEANING_TRANSLATION_LIMITS.contentTranslationCharacters,
      ),
    };
  });

  return {
    entryTranslation,
    contentTranslations,
  };
}

function strictRecord(
  value: unknown,
  keys: string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${label} must contain exactly ${keys.join(", ")}`);
  }
  return record;
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requiredBoundedString(value: unknown, label: string, limit: number) {
  const text = requiredString(value, label);
  if (unicodeLength(text) > limit) {
    throw new Error(`${label} exceeds the ${limit}-character limit`);
  }
  return text;
}

function requiredTruncatedString(value: unknown, label: string, limit: number) {
  const text = boundedString(value, limit);
  if (!text) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return text;
}

function nullableBoundedString(value: unknown, label: string, limit: number) {
  if (value === null) return null;
  return requiredBoundedString(value, label, limit);
}

function nullableTruncatedString(value: unknown, limit: number) {
  const text = boundedString(value, limit);
  return text || null;
}

function normalizeLanguageCode(value: unknown, label: string) {
  const normalized = requiredBoundedString(
    value,
    label,
    DICTIONARY_MEANING_TRANSLATION_LIMITS.languageCodeCharacters,
  )
    .replace(/_/g, "-")
    .toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/.test(normalized)) {
    throw new Error(`${label} must be a supported language-code shape`);
  }
  return normalized;
}

function normalizeSourceLanguageCode(value: unknown) {
  try {
    return normalizeLanguageCode(value, "sourceLanguageCode");
  } catch {
    return "und";
  }
}

function boundedString(
  value: unknown,
  characterLimit: number,
  tokenLimit = Number.POSITIVE_INFINITY,
) {
  if (typeof value !== "string" || characterLimit <= 0 || tokenLimit <= 0) {
    return "";
  }
  const text = value.trim();
  if (!text) return "";
  const output: string[] = [];
  let tokens = 0;
  for (const character of Array.from(text).slice(0, characterLimit)) {
    const characterTokens = tokenUpperBound(character);
    if (tokens + characterTokens > tokenLimit) break;
    output.push(character);
    tokens += characterTokens;
  }
  return output.join("");
}

function unicodeLength(value: string) {
  return Array.from(value).length;
}

export function tokenUpperBound(value: string) {
  return new TextEncoder().encode(value).length;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
