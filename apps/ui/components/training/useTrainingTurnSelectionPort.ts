"use client";

import { useCallback, useMemo } from "react";
import {
  fetchNextTrainingWordByScenario,
  fetchTrainingWordByLookup,
  isTrainingFocusFilterActive,
  markTrainingSessionMemberUnavailable,
} from "@/lib/trainingService";
import type { TrainingSessionUnavailableReason } from "@/lib/training/selectionService";
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
  allowPractice?: boolean;
  trainingSessionId?: string | null;
};

export type TrainingTurnSelectionPort = {
  selectNext: (request: TrainingTurnSelectionRequest) => Promise<TrainingWord | null>;
  lookupOverride: (wordId: string) => Promise<TrainingWord | null>;
  markUnavailable?: (input: {
    entryId: string;
    cardTypeId: TrainingMode;
    reason: TrainingSessionUnavailableReason;
  }) => Promise<boolean>;
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
  allowPractice: boolean;
  trainingSessionId?: string | null;
  resolveScenarioModes: (
    scenarioId: string,
  ) => Promise<TrainingMode[] | null>;
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
    allowPractice: defaultAllowPractice,
    trainingSessionId: activeTrainingSessionId,
    resolveScenarioModes,
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
      // The finite-session contract is intentionally limited to new/due
      // cards. Future practice tails would make the session count surprising.
      const allowPractice = request.allowPractice ?? defaultAllowPractice;
      // `null` is an explicit boundary signal from a scope replacement: do
      // not fall back to the id captured by this render. Using `??` here
      // could briefly select from the previous latched session while React is
      // applying the replacement state.
      const trainingSessionId =
        request.trainingSessionId === undefined
          ? activeTrainingSessionId
          : request.trainingSessionId;

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
        resolveScenarioModes,
        allowPractice,
        trainingSessionId ?? undefined,
      );
    },
    [
      activeList,
      activeScenario,
      availableLists,
      cardFilter,
      focusFilter,
      defaultAllowPractice,
      activeTrainingSessionId,
      resolveScenarioModes,
      userId,
      wordListId,
      wordListType,
    ],
  );

  const lookupOverride = useCallback(
    (wordId: string) => fetchTrainingWordByLookup(wordId, userId),
    [userId],
  );

  const markUnavailable = useCallback(
    async ({ entryId, cardTypeId, reason }: {
      entryId: string;
      cardTypeId: TrainingMode;
      reason: TrainingSessionUnavailableReason;
    }) => {
      if (!activeTrainingSessionId) return false;
      const result = await markTrainingSessionMemberUnavailable(
        userId,
        activeTrainingSessionId,
        entryId,
        cardTypeId,
        reason,
      );
      return (
        result.status === "unavailable" ||
        result.status === "unavailable-complete"
      );
    },
    [activeTrainingSessionId, userId],
  );

  return useMemo(
    () => ({ selectNext, lookupOverride, markUnavailable }),
    [lookupOverride, markUnavailable, selectNext],
  );
}
