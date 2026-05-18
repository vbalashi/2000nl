import { describe, expect, test } from "vitest";
import {
  isCrossReferenceOnly,
  mapCuratedListSummary,
  mapDictionaryEntry,
  mapEventTypeToResult,
  mapScenario,
  mapUserListSummary,
  normalizeRaw,
} from "@/lib/training/wordMappers";

describe("training word mappers", () => {
  test("normalizeRaw parses JSON string raw values", () => {
    expect(
      normalizeRaw(
        JSON.stringify({
          headword: "huis",
          meanings: [{ definition: "Een gebouw" }],
        }),
      ),
    ).toEqual({
      headword: "huis",
      meanings: [{ definition: "Een gebouw" }],
    });
  });

  test("normalizeRaw falls back to an empty object for invalid or empty values", () => {
    expect(normalizeRaw("{not json")).toEqual({});
    expect(normalizeRaw(null)).toEqual({});
    expect(normalizeRaw(undefined)).toEqual({});
  });

  test("normalizeRaw passes object raw values through", () => {
    const raw = { headword: "lopen", meanings: [{ definition: "gaan" }] };

    expect(normalizeRaw(raw)).toBe(raw);
  });

  test("isCrossReferenceOnly detects entries with only a cross reference", () => {
    expect(
      isCrossReferenceOnly({ cross_reference: "zie huis", meanings: [] }),
    ).toBe(true);
    expect(
      isCrossReferenceOnly({
        cross_reference: "zie huis",
        meanings: [{ definition: "Een gebouw" }],
      }),
    ).toBe(false);
    expect(isCrossReferenceOnly({ cross_reference: "zie huis" })).toBe(false);
  });

  test("mapDictionaryEntry normalizes raw and converts nullable fields to undefined", () => {
    expect(
      mapDictionaryEntry({
        id: "word-1",
        headword: "huis",
        part_of_speech: null,
        gender: null,
        raw: "{\"meanings\":[{\"definition\":\"Een gebouw\"}]}",
        is_nt2_2000: true,
      }),
    ).toEqual({
      id: "word-1",
      headword: "huis",
      part_of_speech: undefined,
      gender: undefined,
      raw: { meanings: [{ definition: "Een gebouw" }] },
      is_nt2_2000: true,
    });
  });

  test("mapCuratedListSummary maps count and primary metadata", () => {
    expect(
      mapCuratedListSummary({
        id: "curated-1",
        name: "NT2",
        description: "Core words",
        language_code: "nl",
        primary_language_code: "nl",
        is_primary: true,
        word_list_items: [{ count: 2000 }],
      }),
    ).toEqual({
      id: "curated-1",
      name: "NT2",
      description: "Core words",
      language_code: "nl",
      primary_language_code: "nl",
      type: "curated",
      item_count: 2000,
      is_primary: true,
    });
  });

  test("mapUserListSummary maps count and created timestamp", () => {
    expect(
      mapUserListSummary({
        id: "user-list-1",
        name: "Mijn lijst",
        description: null,
        language_code: "nl",
        primary_language_code: null,
        created_at: "2026-05-16T10:00:00.000Z",
        user_word_list_items: [{ count: 12 }],
      }),
    ).toEqual({
      id: "user-list-1",
      name: "Mijn lijst",
      description: null,
      language_code: "nl",
      primary_language_code: "nl",
      type: "user",
      item_count: 12,
      created_at: "2026-05-16T10:00:00.000Z",
    });
  });

  test("list summary mappers leave missing counts undefined", () => {
    expect(mapCuratedListSummary({ id: "c", name: "C" }).item_count).toBe(
      undefined,
    );
    expect(mapUserListSummary({ id: "u", name: "U" }).item_count).toBe(
      undefined,
    );
  });

  test("mapScenario applies defaults", () => {
    expect(
      mapScenario({
        id: "understanding",
        name_en: "Understanding",
      }),
    ).toEqual({
      id: "understanding",
      nameEn: "Understanding",
      nameNl: undefined,
      description: undefined,
      cardModes: [],
      graduationThreshold: 21,
      enabled: true,
      sortOrder: 0,
    });
  });

  test("mapEventTypeToResult maps review events and defaults to neutral", () => {
    expect(mapEventTypeToResult("review_fail")).toBe("fail");
    expect(mapEventTypeToResult("review_hard")).toBe("hard");
    expect(mapEventTypeToResult("review_success")).toBe("success");
    expect(mapEventTypeToResult("review_easy")).toBe("easy");
    expect(mapEventTypeToResult("definition_click")).toBe("neutral");
  });
});
