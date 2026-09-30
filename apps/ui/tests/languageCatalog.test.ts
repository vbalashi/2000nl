import { expect, test } from "vitest";
import {
  catalogLanguages,
  searchCatalogLanguages,
  catalogLanguageLabel,
} from "@/lib/languages/languageCatalog";
test("ISO aliases resolve the same canonical language independently of interface labels", () => {
  for (const query of ["pl", "pol", "польский", "Polish"])
    expect(
      searchCatalogLanguages(query).some((item) => item.code === "pl"),
    ).toBe(true);
  const spanish = searchCatalogLanguages("es")[0];
  expect(spanish.code).toBe("es");
  expect(catalogLanguageLabel("ru", spanish)).toBe("испанский");
  expect(
    searchCatalogLanguages("espanol").some((item) => item.code === "es"),
  ).toBe(true);
  expect(new Set(catalogLanguages.map((item) => item.code)).size).toBe(
    catalogLanguages.length,
  );
});
test("native aliases and rare language names remain searchable", () => {
  expect(
    searchCatalogLanguages("къарачай").some((item) => item.code === "krc"),
  ).toBe(true);
  expect(
    searchCatalogLanguages("中文").some((item) => item.code === "zh"),
  ).toBe(true);
  expect(searchCatalogLanguages("not-a-language-xyz")).toEqual([]);
});
