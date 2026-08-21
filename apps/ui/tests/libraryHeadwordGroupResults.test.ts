import { describe, expect, test } from "vitest";
import { buildLibraryHeadwordGroupResults } from "@/components/training/wordlist/libraryHeadwordGroupResults";
import type { PlatformHeadwordGroupV2 } from "../../../packages/shared/types/platformV2";

const sense = (entryId: string, partOfSpeech: string) => ({
  kind: "sense-card" as const,
  entryId,
  meaningOrdinal: 1,
  partOfSpeech: {
    termId: `part-of-speech:${partOfSpeech}`,
    messageKey: `partOfSpeech.${partOfSpeech}`,
    sourceValue: partOfSpeech,
  },
  card: null,
  contentRevision: `revision-${entryId}`,
  reportContentRevision: null,
  summaryContentNodeId: `definition-${entryId}`,
  contentNodes: [
    {
      contentNodeId: `definition-${entryId}`,
      parentContentNodeId: null,
      kind: "definition" as const,
      order: 0,
      text: `definition for ${entryId}`,
      sourceTextFingerprint: `fingerprint-${entryId}`,
      translations: [],
    },
  ],
  translation: null,
  capabilities: [],
});

const group = (
  headwordGroupId: string,
  dictionaryId: string,
  displayName: string,
  homographNumber: number | undefined,
  entries: ReturnType<typeof sense>[],
): PlatformHeadwordGroupV2 => ({
  headwordGroupId,
  dictionary: {
    dictionaryId,
    sourceLanguageCode: "nl",
    displayName,
    messageKey: `dictionary.${dictionaryId}`,
  },
  header: {
    text: "goed",
    ...(homographNumber ? { homographNumber } : {}),
  },
  senseCount: entries.length,
  entryCount: entries.length,
  indicators: [],
  entries,
});

describe("Library Headword Group results", () => {
  test("returns one goed row per server group and never merges homographs or dictionaries by spelling", () => {
    const vandaleGoed = group(
      "group-vandale-goed-1",
      "dictionary-vandale",
      "Van Dale",
      1,
      [sense("entry-goed-adjective", "bn"), sense("entry-goed-adverb", "bw")],
    );
    const vandaleHomograph = group(
      "group-vandale-goed-2",
      "dictionary-vandale",
      "Van Dale",
      2,
      [sense("entry-goed-noun", "zn")],
    );
    const userDictionaryGoed = group(
      "group-user-goed",
      "dictionary-user",
      "Mijn woordenboek",
      undefined,
      [sense("entry-user-goed", "bn")],
    );

    const results = buildLibraryHeadwordGroupResults([
      vandaleGoed,
      { ...vandaleGoed },
      vandaleHomograph,
      userDictionaryGoed,
    ]);

    expect(results.map((result) => result.headwordGroupId)).toEqual([
      "group-vandale-goed-1",
      "group-vandale-goed-2",
      "group-user-goed",
    ]);
    expect(results[0]).toMatchObject({
      headword: "goed",
      dictionaryLabel: "Van Dale",
      partOfSpeechLabels: ["bn", "bw"],
      meaningCount: 2,
      detailEntry: {
        id: "entry-goed-adjective",
        headword: "goed",
        meanings_count: 2,
      },
    });
    expect(results[1]).toMatchObject({ homographNumber: 2, meaningCount: 1 });
    expect(results[2]).toMatchObject({
      dictionaryLabel: "Mijn woordenboek",
      meaningCount: 1,
    });
  });
});
