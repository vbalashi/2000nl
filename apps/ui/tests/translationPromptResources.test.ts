import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { loadPromptText } from "@/lib/translation/prompts/promptLoader";
import { getOpenAiDictionaryMeaningPromptFingerprint } from "@/lib/translation/prompts/promptFingerprint";
import { dictionaryTranslationProfile } from "@/lib/translation/dictionaryTranslationProfile";

const ownedDirectories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of ownedDirectories.splice(0)) fs.rmSync(directory, { recursive: true });
});

describe("server-side translation prompt resources", () => {
  test("preserves exact configured bytes rather than trimming or changing instructions", () => {
    const text = "  Test-only instructions.\n\n";
    vi.stubEnv("TRANSLATION_PROMPTS_JSON", JSON.stringify({ "resource-test.txt": text }));
    expect(loadPromptText("resource-test.txt")).toBe(text);
  });

  test("keeps the established fingerprint when the same texts move to a secret bundle", () => {
    const profile = dictionaryTranslationProfile();
    const names = [profile.systemFile, profile.userFile, "openai_dictionary_explanation_repair_v1.txt"];
    // Public test runs can inject their test-only bundle; private runs load the
    // actual private resources. This verifies transport, not prompt quality.
    const bundle = Object.fromEntries(names.map(name => [name, loadPromptText(name)]));
    const before = getOpenAiDictionaryMeaningPromptFingerprint();
    vi.stubEnv("TRANSLATION_PROMPTS_JSON", JSON.stringify(bundle));
    expect(getOpenAiDictionaryMeaningPromptFingerprint()).toBe(before);
  });

  test("loads mounted resources and refreshes when bundle content changes", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "2000nl-prompt-resource-"));
    ownedDirectories.push(directory);
    const text = "Fixture text from a mounted secret.\n";
    fs.writeFileSync(path.join(directory, "mounted-test.txt"), text);
    // Vitest 1's stubEnv only accepts strings; register restoration before
    // temporarily removing the variable for the directory-only case.
    vi.stubEnv("TRANSLATION_PROMPTS_JSON", "temporarily-unset");
    delete process.env.TRANSLATION_PROMPTS_JSON;
    vi.stubEnv("TRANSLATION_PROMPTS_DIR", directory);
    expect(loadPromptText("mounted-test.txt")).toBe(text);
    vi.stubEnv("TRANSLATION_PROMPTS_JSON", JSON.stringify({ "mounted-test.txt": "another fixture" }));
    expect(loadPromptText("mounted-test.txt")).toBe("another fixture");
  });

  test("fails closed for missing, invalid or empty secrets without logging their content", () => {
    const secretMarker = "never-include-this-test-marker-in-an-error";
    for (const bundle of [secretMarker, JSON.stringify({ unrelated: secretMarker }), JSON.stringify({ "missing-test.txt": "" })]) {
      vi.stubEnv("TRANSLATION_PROMPTS_JSON", bundle);
      try {
        loadPromptText("missing-test.txt");
        throw new Error("unexpected success");
      } catch (error) {
        expect(String(error)).toMatch(/Translation prompt/);
        expect(String(error)).not.toContain(secretMarker);
      }
    }
    expect(() => loadPromptText("../outside.txt")).toThrow("Invalid translation prompt filename");
  });

});
