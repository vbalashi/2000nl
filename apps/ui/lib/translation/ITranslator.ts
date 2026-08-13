import type {
  DictionaryMeaningTranslationRequestV1,
  DictionaryMeaningTranslationResultV1,
} from "./dictionaryMeaningTranslationContract";
import type { TranslationProviderFailure } from "./translationProviderFailure";

export type DictionaryMeaningTranslationMeta = {
  providerSelected?: "deepl" | "openai" | "gemini";
  providerUsed?: "deepl" | "openai" | "gemini";
  usedFallback?: boolean;
  primaryFailure?: TranslationProviderFailure;
  openaiKeyHash?: string;
  model?: string;
};

export type DictionaryMeaningTranslationProviderResult =
  DictionaryMeaningTranslationResultV1 & {
    meta?: DictionaryMeaningTranslationMeta;
  };

export type TranslationProviderTextResult = {
  translations: string[];
  note?: string | null;
  literalTranslations?: string[];
  meta?: DictionaryMeaningTranslationMeta;
};

export interface ITranslator {
  translate(text: string, targetLang: string): Promise<string>;
  translate(texts: string[], targetLang: string): Promise<string[]>;
  translateWithMetadata?(
    texts: string[],
    targetLang: string,
  ): Promise<TranslationProviderTextResult>;
  translateDictionaryMeaning?(
    request: DictionaryMeaningTranslationRequestV1,
  ): Promise<DictionaryMeaningTranslationProviderResult>;
}
