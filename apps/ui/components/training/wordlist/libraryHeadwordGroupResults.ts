import type { PlatformHeadwordGroupV2 } from "../../../../../packages/shared/types/platformV2";

export type LibraryHeadwordGroupResult = {
  headwordGroupId: string;
  headword: string;
  homographNumber?: number;
  dictionaryLabel: string;
  partOfSpeechLabels: string[];
  meaningCount: number;
  selectedEntryId: string;
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
      selectedEntryId: representative.entryId,
      group,
    });
  }

  return Array.from(results.values());
}
