export type DictionaryTranslationProfileName =
  | "luna6" | "luna6-v5" | "luna6-v6" | "luna6-v7" | "luna6-v8" | "luna6-v9"
  | "gpt41" | "legacy";
const lunaPrompts = {
  luna6: "luna6_v8", "luna6-v5": "luna6_v5", "luna6-v6": "luna6_v6",
  "luna6-v7": "luna6_v7", "luna6-v8": "luna6_v8", "luna6-v9": "luna6_v9",
} as const;
/** A single profile selects model, prompt and cache identity; rollback is explicit. */
export function dictionaryTranslationProfile() {
  const selected = process.env.DICTIONARY_TRANSLATION_PROFILE?.trim() || "luna6";
  if (!(Object.hasOwn(lunaPrompts, selected) || selected === "gpt41" || selected === "legacy")) {
    throw new Error("invalid_dictionary_translation_profile");
  }
  const id = selected as DictionaryTranslationProfileName;
  const luna = id !== "gpt41" && id !== "legacy";
  const prompt = luna ? lunaPrompts[id as keyof typeof lunaPrompts] : "gpt41_v4";
  return {
    id,
    model: luna ? "gpt-6-luna" : "gpt-4.1",
    envPrefix: luna ? "AZURE_OPENAI_GPT6_LUNA" : "AZURE_OPENAI",
    literalIdioms: luna && id !== "luna6-v5",
    systemFile: id === "legacy" ? "openai_dictionary_meaning_system_v1.txt" : `openai_dictionary_meaning_${prompt}_system.txt`,
    userFile: id === "legacy" ? "openai_dictionary_meaning_user_v1.txt" : `openai_dictionary_meaning_${prompt}_user.txt`,
    requestSettings: luna
      ? { reasoning_effort: id === "luna6" ? "high" as const : "low" as const, max_completion_tokens: 2200, ...(id !== "luna6-v5" ? { response_format: { type: "json_object" as const } } : {}) }
      : { temperature: 0, max_tokens: 2200 },
  };
}
