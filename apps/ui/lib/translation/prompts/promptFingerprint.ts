import crypto from "crypto";
import { loadPromptText } from "./promptLoader";
import type { TranslationProviderName } from "../types";

function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function getOpenAiTranslationPromptFingerprint() {
  const system = loadPromptText("openai_translation_system_v1.txt");
  const userInstructions = loadPromptText("openai_translation_user_instructions_v1.txt");
  // Include filenames implicitly via concatenation order.
  return sha256([system, userInstructions].join("\n---\n"));
}

export function getTranslationPromptFingerprint(provider: TranslationProviderName) {
  if (provider === "openai") return getOpenAiTranslationPromptFingerprint();
  // DeepL has no app-defined prompt; Gemini prompt is currently code-defined.
  return "builtin_v1";
}

