import { loadPromptText } from "./prompts/promptLoader";
import type { OpenAITranslationMessage } from "./openaiTranslationContract";
import { dictionaryTranslationContext } from "./dictionaryTranslationContext";

export const DICTIONARY_MEANING_TRANSLATION_CONTRACT_VERSION =
  "dictionary-meaning-translation-v1" as const;

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
  const content: DictionaryMeaningTranslationRequestV1["content"] = [];
  const push = (
    fieldId: string,
    role: DictionaryMeaningContentRole,
    value: unknown,
  ) => {
    if (typeof value !== "string" || !value.trim()) return;
    content.push({ fieldId, role, text: value.trim() });
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
    entryId: params.entryId,
    sourceContentFingerprint: params.sourceContentFingerprint,
    sourceLanguageCode: params.sourceLanguageCode,
    targetLanguageCode: params.targetLanguageCode,
    headword: {
      text: requiredString(word.headword, "headword"),
      article:
        typeof word.gender === "string" && word.gender.trim()
          ? word.gender.trim()
          : null,
      partOfSpeech: context.partOfSpeech ?? null,
      partOfSpeechCode: context.partOfSpeechCode ?? null,
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
    const primaryText = requiredString(
      entry.primaryText,
      "entryTranslation.primaryText",
    );
    if (!Array.isArray(entry.alternativeTexts)) {
      throw new Error("entryTranslation.alternativeTexts must be an array");
    }
    const alternativeTexts = entry.alternativeTexts.map((value, index) =>
      requiredString(value, `entryTranslation.alternativeTexts[${index}]`),
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
      baseText: nullableString(entry.baseText, "entryTranslation.baseText"),
      note: nullableString(entry.note, "entryTranslation.note"),
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
      text: requiredString(item.text, `contentTranslations[${index}].text`),
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

function nullableString(value: unknown, label: string) {
  if (value === null) return null;
  return requiredString(value, label);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
