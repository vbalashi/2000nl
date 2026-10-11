import { dictionaryTranslationProfile } from "../dictionaryTranslationProfile";
import crypto from "crypto";
import { loadPromptText } from "./promptLoader";
import type { TranslationProviderName } from "../types";

function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function getOpenAiTranslationPromptFingerprint() {
  const system = loadPromptText("openai_translation_system_v1.txt");
  const userInstructions = loadPromptText("openai_translation_user_instructions_v1.txt");
  return sha256([system, userInstructions].join("\n---\n"));
}

export function getOpenAiDictionaryMeaningPromptFingerprint() {
  const profile = dictionaryTranslationProfile();
  const meaningSystem = loadPromptText(profile.systemFile);
  const meaningInstructions = loadPromptText(profile.userFile);
  // Preserve exact legacy cache identity for a full rollback.
  const prompt = [meaningSystem, meaningInstructions].join("\n---\n");
  return sha256(profile.id === "legacy" ? prompt : JSON.stringify({ model: profile.model, settings: profile.requestSettings, prompt }));
}

export function getDictionaryMeaningPromptFingerprint(
  provider: TranslationProviderName,
) {
  if (provider === "openai") {
    return getOpenAiDictionaryMeaningPromptFingerprint();
  }
  return "builtin_dictionary_meaning_v1";
}

export function getTranslationPromptFingerprint(provider: TranslationProviderName) {
  if (provider === "openai") return getOpenAiTranslationPromptFingerprint();
  // DeepL has no app-defined prompt; Gemini prompt is currently code-defined.
  return "builtin_v1";
}
