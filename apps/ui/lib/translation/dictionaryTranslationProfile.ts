export type DictionaryTranslationProfileName = "luna6" | "gpt41" | "legacy";
/** A single profile selects model, prompt and cache identity; rollback is explicit. */
export function dictionaryTranslationProfile() {
  const selected = process.env.DICTIONARY_TRANSLATION_PROFILE?.trim() || "luna6";
  if (selected !== "luna6" && selected !== "gpt41" && selected !== "legacy") throw new Error("invalid_dictionary_translation_profile");
  const id: DictionaryTranslationProfileName = selected;
  return {
    id,
    model: id === "luna6" ? "gpt-6-luna" : "gpt-4.1",
    envPrefix: id === "luna6" ? "AZURE_OPENAI_GPT6_LUNA" : "AZURE_OPENAI",
    systemFile: id === "legacy" ? "openai_dictionary_meaning_system_v1.txt" : `openai_dictionary_meaning_${id === "luna6" ? "luna6_v5" : "gpt41_v4"}_system.txt`,
    userFile: id === "legacy" ? "openai_dictionary_meaning_user_v1.txt" : `openai_dictionary_meaning_${id === "luna6" ? "luna6_v5" : "gpt41_v4"}_user.txt`,
    requestSettings: id === "luna6" ? { reasoning_effort: "low" as const, max_completion_tokens: 2200 } : { temperature: 0, max_tokens: 2200 },
  };
}
