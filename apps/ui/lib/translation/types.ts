export type TranslationProviderName = "deepl" | "openai" | "gemini";

export type TranslationConfig = {
  provider: TranslationProviderName;
  apiKeys: {
    deepl?: string;
    openai?: string;
    gemini?: string;
  };
  fallback?: TranslationProviderName;
  apiUrls?: {
    deepl?: string;
    openai?: string;
    gemini?: string;
  };
  models?: {
    openai?: string;
    gemini?: string;
  };
};
