"use client";

import { useCallback, useMemo } from "react";
import {
  fetchNextTrainingWordByScenario,
  fetchTrainingWordByLookup,
  isTrainingFocusFilterActive,
} from "@/lib/trainingService";
import type {
  CardFilter,
  QueueTurn,
  TrainingFocusFilter,
  TrainingMode,
  TrainingWord,
  WordListSummary,
  WordListType,
} from "@/lib/types";

export type TrainingTurnSelectionRequest = {
  excludeWordIds?: string[];
  scope?: { listId?: string | null; listType?: WordListType | null };
  queueTurn: QueueTurn;
  scenario?: string;
  excludeCardKeys?: string[];
  cardFilter?: CardFilter;
  focusFilter?: TrainingFocusFilter;
};

export type TrainingTurnSelectionPort = {
  selectNext: (request: TrainingTurnSelectionRequest) => Promise<TrainingWord | null>;
  lookupOverride: (wordId: string) => Promise<TrainingWord | null>;
};

type Inputs = {
  userId: string;
  activeScenario: string;
  activeList: WordListSummary | null;
  availableLists: WordListSummary[];
  wordListId: string | null;
  wordListType: WordListType | null;
  cardFilter: CardFilter;
  focusFilter: TrainingFocusFilter;
};

const SUPPORTED_LIST_CARD_MODES = new Set<TrainingMode>([
  "word-to-definition",
  "definition-to-word",
  "listen-recognize",
]);

const resolveRestrictedListModes = (
  list?: WordListSummary | null,
): TrainingMode[] | undefined => {
  if (list?.card_policy !== "restrict") return undefined;
  return (list.card_type_ids ?? []).filter((mode): mode is TrainingMode =>
    SUPPORTED_LIST_CARD_MODES.has(mode as TrainingMode),
  );
};

export function useTrainingTurnSelectionPort(input: Inputs): TrainingTurnSelectionPort {
  const {
    userId,
    activeScenario,
    activeList,
    availableLists,
    wordListId,
    wordListType,
    cardFilter,
    focusFilter,
  } = input;

  const selectNext = useCallback(
    async (request: TrainingTurnSelectionRequest) => {
      const effectiveListId = request.scope?.listId ?? wordListId;
      const effectiveListType = request.scope?.listType ?? wordListType;
      const effectiveList =
        availableLists.find(
          (list) =>
            list.id === effectiveListId &&
            list.type === (effectiveListType ?? "curated"),
        ) ?? activeList;
      const effectiveFocusFilter = request.focusFilter ?? focusFilter;

      return fetchNextTrainingWordByScenario(
        userId,
        request.scenario ?? activeScenario,
        request.excludeWordIds ?? [],
        {
          listId: effectiveListId ?? undefined,
          listType: effectiveListType ?? undefined,
        },
        request.cardFilter ?? cardFilter,
        request.queueTurn,
        request.excludeCardKeys ?? [],
        resolveRestrictedListModes(effectiveList),
        isTrainingFocusFilterActive(effectiveFocusFilter)
          ? effectiveFocusFilter
          : null,
      );
    },
    [
      activeList,
      activeScenario,
      availableLists,
      cardFilter,
      focusFilter,
      userId,
      wordListId,
      wordListType,
    ],
  );

  const lookupOverride = useCallback(
    (wordId: string) => fetchTrainingWordByLookup(wordId, userId),
    [userId],
  );

  return useMemo(
    () => ({ selectNext, lookupOverride }),
    [lookupOverride, selectNext],
  );
}
