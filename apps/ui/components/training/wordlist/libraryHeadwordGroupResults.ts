import type { PlatformHeadwordGroupV2 } from "../../../../../packages/shared/types/platformV2";
import type { DictionaryEntry } from "@/lib/types";

export type LibraryHeadwordGroupResult = {
  headwordGroupId: string;
  headword: string;
  homographNumber?: number;
  dictionaryLabel: string;
  partOfSpeechLabels: string[];
  meaningCount: number;
  detailEntry: DictionaryEntry;
  group: PlatformHeadwordGroupV2;
};

export function buildLibraryHeadwordGroupResults(
  groups: PlatformHeadwordGroupV2[],
): LibraryHeadwordGroupResult[] {
  const results = new Map<string, LibraryHeadwordGroupResult>();

  for (const group of groups) {
    if (results.has(group.headwordGroupId)) continue;

    const partOfSpeechLabels = Array.from(
      new Set(
        group.entries.flatMap((entry) =>
          entry.kind === "sense-card" && entry.partOfSpeech?.sourceValue
            ? [entry.partOfSpeech.sourceValue]
            : [],
        ),
      ),
    );
    const senseEntries = group.entries.filter(
      (entry) => entry.kind === "sense-card",
    );
    const representative = senseEntries[0];
    if (!representative) continue;

    results.set(group.headwordGroupId, {
      headwordGroupId: group.headwordGroupId,
      headword: group.header.text,
      ...(group.header.homographNumber
        ? { homographNumber: group.header.homographNumber }
        : {}),
      dictionaryLabel: group.dictionary.displayName,
      partOfSpeechLabels,
      meaningCount: group.senseCount,
      detailEntry: {
        id: representative.entryId,
        dictionary_id: group.dictionary.dictionaryId,
        dictionary_name: group.dictionary.displayName,
        language_code: group.dictionary.sourceLanguageCode,
        headword: group.header.text,
        part_of_speech: representative.partOfSpeech?.sourceValue,
        meanings_count: group.senseCount,
        raw: {
          meanings: senseEntries.flatMap((entry) => {
            const summary = entry.contentNodes.find(
              (node) => node.contentNodeId === entry.summaryContentNodeId,
            );
            return summary ? [{ definition: summary.text }] : [];
          }),
        },
      },
      group,
    });
  }

  return Array.from(results.values());
}
