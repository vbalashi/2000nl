import { beforeEach, describe, expect, test, vi } from "vitest";

const prompts = vi.hoisted(() =>
  new Map<string, string>([
    ["openai_translation_system_v1.txt", "fragment system v1"],
    ["openai_translation_user_instructions_v1.txt", "fragment user v1"],
    ["openai_dictionary_meaning_system_v1.txt", "meaning system v1"],
    ["openai_dictionary_meaning_user_v1.txt", "meaning user v1"],
  ]),
);

vi.mock("@/lib/translation/prompts/promptLoader", () => ({
  loadPromptText: vi.fn((filename: string) => prompts.get(filename) ?? ""),
}));

import {
  getOpenAiDictionaryMeaningPromptFingerprint,
  getOpenAiTranslationPromptFingerprint,
} from "@/lib/translation/prompts/promptFingerprint";

describe("translation prompt fingerprint isolation", () => {
  beforeEach(() => {
    prompts.set("openai_translation_system_v1.txt", "fragment system v1");
    prompts.set("openai_translation_user_instructions_v1.txt", "fragment user v1");
    prompts.set("openai_dictionary_meaning_system_v1.txt", "meaning system v1");
    prompts.set("openai_dictionary_meaning_user_v1.txt", "meaning user v1");
  });

  test("legacy prompt changes do not invalidate dictionary meanings", () => {
    const meaningBefore = getOpenAiDictionaryMeaningPromptFingerprint();
    const fragmentBefore = getOpenAiTranslationPromptFingerprint();
    prompts.set("openai_translation_system_v1.txt", "fragment system v2");

    expect(getOpenAiDictionaryMeaningPromptFingerprint()).toBe(meaningBefore);
    expect(getOpenAiTranslationPromptFingerprint()).not.toBe(fragmentBefore);
  });

  test("meaning prompt changes do not invalidate selected fragments", () => {
    const meaningBefore = getOpenAiDictionaryMeaningPromptFingerprint();
    const fragmentBefore = getOpenAiTranslationPromptFingerprint();
    prompts.set("openai_dictionary_meaning_user_v1.txt", "meaning user v2");

    expect(getOpenAiDictionaryMeaningPromptFingerprint()).not.toBe(
      meaningBefore,
    );
    expect(getOpenAiTranslationPromptFingerprint()).toBe(fragmentBefore);
  });
});
