import type {TrainingFocusFilter} from "@/lib/types";

export const trainingFilterKey = (filter: TrainingFocusFilter) =>
  JSON.stringify({
    reviewTiming: filter.reviewTiming ?? null,
    presentationMode: filter.presentationMode ?? null,
    dateWindow: filter.dateWindow,
    daysAgo: filter.daysAgo ?? null,
    sourceKind: filter.sourceKind ?? null,
    sourceId: filter.sourceId ?? null,
    externalId: filter.externalId ?? null,
    partOfSpeech: [...(filter.partOfSpeech ?? [])].sort(),
    nounArticles: [...(filter.nounArticles ?? [])].sort(),
    dictionaryScope: filter.dictionaryScope
      ? {
          mode: filter.dictionaryScope.mode,
          languageCode: filter.dictionaryScope.languageCode,
          dictionaryIds: [...(filter.dictionaryScope.dictionaryIds ?? [])].sort(),
        }
      : null,
  });

