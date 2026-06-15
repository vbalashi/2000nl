import { describe, expect, test } from "vitest";
import {
  isCrossReferenceOnly,
  mapCuratedListSummary,
  mapActiveTrainingScope,
  mapAvailableDictionarySource,
  mapAvailableLearningLanguage,
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

  test("mapDictionaryEntry preserves dictionary and search match metadata", () => {
    expect(
      mapDictionaryEntry({
        id: "word-1",
        dictionary_id: "dict-1",
        dictionary_name: "Van Dale NT2",
        dictionary_slug: "nl-vandale",
        dictionary_kind: "curated",
        language_code: "nl",
        headword: "huis",
        part_of_speech: "zn",
        raw: { meanings: [{ definition: "Een gebouw" }] },
        search_match_group: "exact-headword",
        search_match_label: "Exacte match",
        search_group_rank: 1,
      }),
    ).toEqual({
      id: "word-1",
      dictionary_id: "dict-1",
      dictionary_name: "Van Dale NT2",
      dictionary_slug: "nl-vandale",
      dictionary_kind: "curated",
      language_code: "nl",
      headword: "huis",
      part_of_speech: "zn",
      gender: undefined,
      raw: { meanings: [{ definition: "Een gebouw" }] },
      is_nt2_2000: undefined,
      meanings_count: undefined,
      search_match_group: "exact-headword",
      search_match_label: "Exacte match",
      search_group_rank: 1,
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
      default_scenario_id: null,
      card_policy: "inherit",
      card_type_ids: null,
      type: "curated",
      item_count: 2000,
      is_mixed_language: false,
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
        is_mixed_language: true,
        created_at: "2026-05-16T10:00:00.000Z",
        user_word_list_items: [{ count: 12 }],
      }),
    ).toEqual({
      id: "user-list-1",
      name: "Mijn lijst",
      description: null,
      language_code: "nl",
      primary_language_code: "nl",
      default_scenario_id: null,
      card_policy: "inherit",
      card_type_ids: null,
      type: "user",
      item_count: 12,
      is_mixed_language: true,
      created_at: "2026-05-16T10:00:00.000Z",
    });
  });

  test("available language and dictionary source mappers normalize RPC names", () => {
    expect(
      mapAvailableLearningLanguage({
        code: "en",
        label: "English",
        dictionary_count: 2,
        curated_list_count: 1,
        user_list_count: 3,
        has_training_eligible_lists: true,
      }),
    ).toEqual({
      code: "en",
      label: "English",
      dictionaryCount: 2,
      curatedListCount: 1,
      userListCount: 3,
      hasTrainingEligibleLists: true,
    });

    expect(
      mapAvailableDictionarySource({
        id: "dict-1",
        language_code: "en",
        slug: "en-test-core",
        name: "EN Core Test",
        kind: "curated",
        visibility: "public",
        is_editable: false,
        entry_count: 10,
      }),
    ).toEqual({
      id: "dict-1",
      languageCode: "en",
      slug: "en-test-core",
      name: "EN Core Test",
      kind: "curated",
      visibility: "public",
      isEditable: false,
      entryCount: 10,
    });
  });

  test("mapActiveTrainingScope applies scope defaults and validates enum fields", () => {
    expect(
      mapActiveTrainingScope({
        language_code: "fr",
        active_list_id: "list-fr",
        active_list_type: "curated",
        active_scenario: "understanding",
        card_filter: "new",
        modes_enabled: ["word-to-definition"],
        new_review_ratio: 4,
        has_saved_scope: true,
        is_valid: true,
      }),
    ).toEqual({
      languageCode: "fr",
      activeListId: "list-fr",
      activeListType: "curated",
      activeScenario: "understanding",
      cardFilter: "new",
      modesEnabled: ["word-to-definition"],
      newReviewRatio: 4,
      hasSavedScope: true,
      isValid: true,
    });

    expect(mapActiveTrainingScope({ active_list_type: "other" })).toMatchObject({
      languageCode: "nl",
      activeListId: null,
      activeListType: null,
      cardFilter: "both",
      modesEnabled: ["word-to-definition"],
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
