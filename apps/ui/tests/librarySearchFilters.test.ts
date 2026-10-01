import { expect, test } from "vitest";
import { LIBRARY_PARTS, parseLibraryEntryFilters, libraryEntryMatchesFilters } from "@/lib/platform/librarySearchScope";
test("closed filters canonicalize sets and preserve missing legacy scope", () => {
  expect(parseLibraryEntryFilters(undefined)).toBeUndefined();
  expect(parseLibraryEntryFilters({})).toEqual({ parts: [], article: null });
  expect(parseLibraryEntryFilters({ parts: ["verb", "noun", "noun"], article: "het" })).toEqual({ parts: ["noun", "verb"], article: "het" });
  for (const invalid of [null, [], false, "noun", { parts: null }, { parts: [null] }, { parts: ["Nouns"] }, { parts: ["unknown"] }, { parts: Array(11).fill("noun") }, { article: "de" }, { parts: ["verb"], article: "het" }, { parts: ["noun"], article: "a" }, { parts: [], other: "field" }])
    expect(parseLibraryEntryFilters(invalid)).toBeNull();
});
test("preview matching mirrors all ten DB aliases and noun-only article policy", () => {
  const codes = ["zn", "ww", "bn", "bw", "vnw", "vz", "vw", "tw", "lidw", "tsw"];
  LIBRARY_PARTS.forEach((part, index) => { for (const value of [part, codes[index]])
    expect(libraryEntryMatchesFilters(value, null, { parts: [part], article: null })).toBe(true); });
  const filters = { parts: ["noun", "verb"] as ("noun" | "verb")[], article: "de" as const };
  for (const gender of ["het / de", "de/het"])
    expect(libraryEntryMatchesFilters("zn", gender, filters)).toBe(true);
  for (const gender of ["het", null])
    expect(libraryEntryMatchesFilters("zn", gender, filters)).toBe(false);
  expect(libraryEntryMatchesFilters("ww", null, filters)).toBe(true);
  expect(libraryEntryMatchesFilters("bn", null, filters)).toBe(false);
  expect(libraryEntryMatchesFilters(null, null, { parts: [], article: null })).toBe(true);
});
