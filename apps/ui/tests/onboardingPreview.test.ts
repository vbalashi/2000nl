import { describe, expect, test, vi } from "vitest";
import { previewLocales, previewSteps, progressLabel } from "@/app/dev/onboarding-preview/content";
import { PREVIEW_PREFERENCES_KEY, readPreviewPreferences, resolvePreviewPreferences, savePreviewPreferences } from "@/app/dev/onboarding-preview/preferences";

describe("onboarding preview language contract", () => {
  test.each(["en", "nl", "ru"] as const)("keeps supported saved interface %s", language => {
    expect(resolvePreviewPreferences(null, language).interfaceLanguage).toBe(language);
  });

  test.each([undefined, null, "de", "EN", "", { language: "ru" }])("uses English for unsupported or missing saved choice %j", value => {
    expect(resolvePreviewPreferences(null, value).interfaceLanguage).toBe("en");
  });

  test("preview choice survives reload separately from account and legacy keys", () => {
    const values = new Map<string, string>([["onboarding_language", "nl"], ["unrelated", "keep"]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(savePreviewPreferences(storage, { version: 1, interfaceLanguage: "ru", translationLanguage: "off" })).toBe(true);
    expect(readPreviewPreferences(storage, "nl")).toEqual({ version: 1, interfaceLanguage: "ru", translationLanguage: "off" });
    expect(values.get("onboarding_language")).toBe("nl");
    expect(values.get("unrelated")).toBe("keep");
    expect([...values.keys()].filter(key => key !== "onboarding_language" && key !== "unrelated")).toEqual([PREVIEW_PREFERENCES_KEY]);
  });

  test("interface and translation languages remain independent", () => {
    expect(resolvePreviewPreferences({ version: 1, interfaceLanguage: "nl", translationLanguage: "ru" })).toEqual({ version: 1, interfaceLanguage: "nl", translationLanguage: "ru" });
  });

  test("corrupt storage falls back to the saved app language", () => {
    expect(readPreviewPreferences({ getItem: () => "broken", setItem: vi.fn() }, "ru").interfaceLanguage).toBe("ru");
    expect(resolvePreviewPreferences({ version: 99, interfaceLanguage: "nl", translationLanguage: "off" }, "en")).toEqual({ version: 1, interfaceLanguage: "en", translationLanguage: "en" });
  });

  test("storage failure is surfaced instead of reporting a saved choice", () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error("denied"); } };
    expect(savePreviewPreferences(storage, resolvePreviewPreferences(null))).toBe(false);
  });

  test("every locale covers all stable step keys and controls", () => {
    const keys = Object.keys(previewLocales.en).sort();
    for (const language of ["en", "nl", "ru"] as const) {
      const copy = previewLocales[language];
      expect(Object.keys(copy).sort()).toEqual(keys);
      expect(Object.values(copy).every(value => value.trim().length > 0)).toBe(true);
      for (const step of previewSteps) {
        expect(copy[step.title]).toBeTruthy();
        expect(copy[step.body]).toBeTruthy();
        expect(progressLabel(language, step.id)).not.toMatch(/\{(?:step|total)\}/);
      }
    }
  });
});
