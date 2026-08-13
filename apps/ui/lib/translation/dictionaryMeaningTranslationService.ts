import type {
  DictionaryMeaningTranslationProviderResult,
  ITranslator,
} from "./ITranslator";
import crypto from "crypto";
import {
  parseDictionaryMeaningTranslationResult,
  type DictionaryMeaningTranslationRequestV1,
} from "./dictionaryMeaningTranslationContract";
import { buildDictionaryMeaningTranslationArtifact } from "./dictionaryMeaningTranslationArtifact";

export function dictionaryMeaningTranslationFingerprint(params: {
  request: DictionaryMeaningTranslationRequestV1;
  pipelineVersion: string;
  provider: string;
  promptFingerprint: string;
}) {
  return crypto.createHash("sha256").update(JSON.stringify(params)).digest("hex");
}

export function dictionaryMeaningTranslatedPaths(
  request: DictionaryMeaningTranslationRequestV1,
): Array<Array<string | number>> {
  return [
    ["headword"],
    ...request.content.map((item) => {
      if (item.fieldId === "definition") return ["meanings", 0, "definition"];
      if (item.fieldId === "usage-pattern") return ["meanings", 0, "context"];
      if (item.fieldId === "usage-note") return ["meanings", 0, "note"];
      const example = item.fieldId.match(/^example:(\d+)$/);
      if (example) return ["meanings", 0, "examples", Number(example[1])];
      const idiom = item.fieldId.match(/^idiom:(\d+)$/);
      if (idiom) {
        return ["meanings", 0, "idioms", Number(idiom[1]), "expression"];
      }
      const explanation = item.fieldId.match(/^idiom:(\d+):explanation$/);
      if (explanation) {
        return ["meanings", 0, "idioms", Number(explanation[1]), "explanation"];
      }
      const idiomExample = item.fieldId.match(/^idiom:(\d+):example:(\d+)$/);
      if (idiomExample) {
        return [
          "meanings",
          0,
          "idioms",
          Number(idiomExample[1]),
          "examples",
          Number(idiomExample[2]),
        ];
      }
      return ["content", item.fieldId];
    }),
  ];
}

export async function translateDictionaryMeaning(
  translator: ITranslator,
  request: DictionaryMeaningTranslationRequestV1,
): Promise<DictionaryMeaningTranslationProviderResult> {
  if (translator.translateDictionaryMeaning) {
    return translator.translateDictionaryMeaning(request);
  }
  return translateDictionaryMeaningWithGenericProvider(translator, request);
}

export async function translateDictionaryMeaningWithGenericProvider(
  translator: ITranslator,
  request: DictionaryMeaningTranslationRequestV1,
  meta: DictionaryMeaningTranslationProviderResult["meta"] = {},
): Promise<DictionaryMeaningTranslationProviderResult> {
  const sourceHeadword = [request.headword.article, request.headword.text]
    .filter(Boolean)
    .join(" ");
  const texts = [sourceHeadword, ...request.content.map((item) => item.text)];
  const providerResult = await translator.translateText({
    texts,
    targetLanguageCode: request.targetLanguageCode,
    sourceLanguageCode: request.sourceLanguageCode,
    purpose: "dictionary-meaning",
  });
  const translated = providerResult.translations;
  const values = Array.isArray(translated) ? translated : [translated];
  if (values.length !== request.content.length + 1) {
    throw new Error("Generic provider returned an unaligned meaning translation");
  }
  const result = {
    entryTranslation: {
      primaryText: values[0],
      alternativeTexts: [],
      baseText: values[0],
      note: null,
    },
    contentTranslations: request.content.map((item, index) => ({
      fieldId: item.fieldId,
      text: values[index + 1],
    })),
  };
  return {
    ...parseDictionaryMeaningTranslationResult(JSON.stringify(result), request),
    meta: {
      ...(providerResult?.meta ?? {}),
      ...meta,
    },
  };
}

export async function resolveDictionaryMeaningTranslation(
  translator: ITranslator,
  request: DictionaryMeaningTranslationRequestV1,
) {
  const result = await translateDictionaryMeaning(translator, request);
  return {
    overlay: buildDictionaryMeaningTranslationArtifact(result),
    note: result.entryTranslation?.note ?? null,
    meta: result.meta ?? {},
  };
}
