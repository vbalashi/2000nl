import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { formatMessage, formatPluralMessage, getInterfaceCatalog, interfaceCatalogs } from "@/lib/i18n/catalog";
import { interfaceLanguages, isInterfaceLanguage, matchInterfaceLanguage } from "@/lib/i18n/registry";
import { detectOnboardingLanguage, getStoredOnboardingLanguage, setOnboardingLanguage } from "@/lib/onboardingI18n";
import { InterfaceLanguageEffect } from "@/components/system/InterfaceLanguageEffect";
import { OfflineBanner } from "@/components/system/OfflineBanner";

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); document.documentElement.lang = "en"; document.documentElement.dir = "ltr"; });

test("the registry owns all enabled catalogs and rejects unregistered languages and object properties", () => {
  expect(Object.keys(interfaceCatalogs).sort()).toEqual(interfaceLanguages.map(language => language.code).sort());
  for (const {code, direction} of interfaceLanguages) {
    expect(isInterfaceLanguage(code)).toBe(true);
    expect(getInterfaceCatalog(code).ui.navigation).toBeDefined();
    expect(["ltr", "rtl"]).toContain(direction);
  }
  expect(isInterfaceLanguage("__proto__")).toBe(false);
  expect(isInterfaceLanguage("zz")).toBe(false);
  expect(matchInterfaceLanguage("RU_ru")).toBe("ru");
});

test("browser detection never takes its interface language from the dictionary translation target", () => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["zz-ZZ", "nl-NL"]);
  expect(detectOnboardingLanguage("ru")).toBe("nl");
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["zz-ZZ"]);
  expect(detectOnboardingLanguage("ru")).toBe("en");
  setOnboardingLanguage("ru");
  expect(getStoredOnboardingLanguage()).toBe("ru");
});

test("document language and offline copy follow a language change, including when storage is blocked", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  render(<><InterfaceLanguageEffect /><OfflineBanner /></>);
  act(() => setOnboardingLanguage("ru"));
  await waitFor(() => expect(document.documentElement.lang).toBe("ru"));
  expect(document.documentElement.dir).toBe("ltr");
  expect(screen.getByRole("status")).toHaveTextContent(getInterfaceCatalog("ru").ui.system.offline);
  vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("Storage denied"); });
  act(() => setOnboardingLanguage("nl"));
  await waitFor(() => expect(document.documentElement.lang).toBe("nl"));
  expect(screen.getByRole("status")).toHaveTextContent(getInterfaceCatalog("nl").ui.system.offline);
});

test("Arabic count forms distinguish zero, one, two, few, many and other", () => {
  const forms = {zero: "zero {count}", one: "one {count}", two: "two {count}", few: "few {count}", many: "many {count}", other: "other {count}"};
  for (const [count, category] of [[0,"zero"], [1,"one"], [2,"two"], [3,"few"], [11,"many"], [100,"other"]] as const) {
    expect(formatPluralMessage("ar", count, forms)).toBe(`${category} ${new Intl.NumberFormat("ar").format(count)}`);
  }
});

test("interpolation keeps replacement text literal and leaves unknown placeholders visible", () => {
  expect(formatMessage("Copy {word}, {word}; {missing}", {word: "$& {literal}"})).toBe("Copy $& {literal}, $& {literal}; {missing}");
});
