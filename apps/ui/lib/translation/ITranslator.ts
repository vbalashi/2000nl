import type {
  DictionaryMeaningTranslationRequestV1,
  DictionaryMeaningTranslationResultV1,
} from "./dictionaryMeaningTranslationContract";

export type DictionaryMeaningTranslationMeta = {
  providerSelected?: "deepl" | "openai" | "gemini";
  providerUsed?: "deepl" | "openai" | "gemini";
  usedFallback?: boolean;
  primaryError?: string;
  openaiKeyHash?: string;
  model?: string;
};

export type DictionaryMeaningTranslationProviderResult =
  DictionaryMeaningTranslationResultV1 & {
    meta?: DictionaryMeaningTranslationMeta;
  };

export interface ITranslator {
  translate(text: string, targetLang: string): Promise<string>;
  translate(texts: string[], targetLang: string): Promise<string[]>;
  translateDictionaryMeaning?(
    request: DictionaryMeaningTranslationRequestV1,
  ): Promise<DictionaryMeaningTranslationProviderResult>;
}
