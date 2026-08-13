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

export type TranslationProviderTextRequest = {
  texts: string[];
  targetLanguageCode: string;
  sourceLanguageCode?: string;
  purpose?: string;
  contextText?: string | null;
};

export interface ITranslator {
  translateText(
    request: TranslationProviderTextRequest,
  ): Promise<TranslationProviderTextResult>;
  translate(text: string, targetLang: string): Promise<string>;
  translate(texts: string[], targetLang: string): Promise<string[]>;
  translateDictionaryMeaning?(
    request: DictionaryMeaningTranslationRequestV1,
  ): Promise<DictionaryMeaningTranslationProviderResult>;
}
