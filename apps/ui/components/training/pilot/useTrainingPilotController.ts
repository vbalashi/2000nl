import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchTrainingScenarios,
  updateActiveTrainingScope,
} from "@/lib/trainingService";
import type {
  CardFilter,
  DetailedStats,
  TrainingFocusFilter,
  TrainingMode,
  TrainingScenario,
  WordListSummary,
  WordListType,
} from "@/lib/types";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type {
  TrainingPilotStatus,
  TrainingSetupDraft,
  TrainingSetupOption,
} from "./TrainingTodaySetup";
import { isTrainingSetupDraftSupported } from "./TrainingTodaySetup";
import { measureTrainingTransitionStage } from "@/lib/training/trainingTransitionTiming";
import {
  isTrainingLoadFailure,
  type LoadNextTrainingTurnResult,
} from "../useTrainingTurnController";

type TrainingScope = {
  listId: string | null;
  listType: WordListType | null;
};

type CommitPilotDraftParams = {
  userId?: string;
  languageCode: string;
  currentScope: TrainingScope;
  resolveList: (value: string) => WordListSummary | null;
  applyListLocally: (list: WordListSummary) => void;
  applyPreferences: (draft: TrainingSetupDraft) => void;
  applyFocusFilter: (filter: TrainingFocusFilter) => void;
  resetQueue: () => void;
  loadStats: (scope: TrainingScope) => void;
  loadWord: (request: {
    scope: TrainingScope;
    queueTurn: "new";
    scenario: string;
    cardFilter: CardFilter;
    focusFilter: TrainingFocusFilter;
  }) => Promise<LoadNextTrainingTurnResult>;
  reportError: (error: string | null) => void;
};

type PilotControllerParams = {
  enabled: boolean;
  interfaceLanguage: OnboardingLanguage;
  listHydrated: boolean;
  loadingWord: boolean;
  hasCurrentWord: boolean;
  loadError: string | null;
  activeScenario: string;
  enabledModes: TrainingMode[];
  cardFilter: CardFilter;
  activeListValue: string;
  newReviewRatio: number;
  focusFilter: TrainingFocusFilter;
  listOptions: TrainingSetupOption[];
  sourceOptions: TrainingSetupOption[];
  onCommitDraft: (draft: TrainingSetupDraft) => Promise<boolean>;
  onRetry: () => Promise<unknown> | void;
  initialTransitionId?: string;
  loadTrainingScenarios?: () => Promise<TrainingScenario[]>;
};

const isTrainingMode = (value: string): value is TrainingMode =>
  value === "word-to-definition" ||
  value === "definition-to-word" ||
  value === "listen-recognize";

export function useCommitTrainingPilotDraft({
  userId,
  languageCode,
  currentScope,
  resolveList,
  applyListLocally,
  applyPreferences,
  applyFocusFilter,
  resetQueue,
  loadStats,
  loadWord,
  reportError,
}: CommitPilotDraftParams) {
  return useCallback(
    async (draft: TrainingSetupDraft) => {
      if (!userId) return false;
      const selectedList = resolveList(draft.listValue);
      const scope: TrainingScope = selectedList
        ? { listId: selectedList.id, listType: selectedList.type }
        : currentScope;
      const focusFilter: TrainingFocusFilter = {
        dateWindow: draft.dateWindow,
        ...(draft.dateWindow === "daysAgo"
          ? { daysAgo: draft.daysAgo ?? 7 }
          : {}),
        ...(draft.sourceValue.startsWith("source:")
          ? { sourceId: draft.sourceValue.slice("source:".length) }
          : draft.sourceValue === "kind:youtube"
            ? { sourceKind: "youtube" }
            : {}),
      };

      const result = await updateActiveTrainingScope({
        userId,
        languageCode,
        listId: scope.listId,
        listType: scope.listType,
        activeScenario: draft.scenarioId,
        cardFilter: draft.cardFilter,
        modesEnabled: draft.modes,
        newReviewRatio: draft.newReviewRatio,
      });
      if (result.error) {
        reportError("training_scope_update_failed");
        return false;
      }

      reportError(null);
      if (selectedList) applyListLocally(selectedList);
      applyPreferences(draft);
      applyFocusFilter(focusFilter);
      resetQueue();
      loadStats(scope);
      const loadResult = await loadWord({
        scope,
        queueTurn: "new",
        scenario: draft.scenarioId,
        cardFilter: draft.cardFilter,
        focusFilter,
      });
      if (isTrainingLoadFailure(loadResult)) reportError("training_load_failed");
      return loadResult === "loaded";
    },
    [
      applyFocusFilter,
      applyListLocally,
      applyPreferences,
      currentScope,
      languageCode,
      loadStats,
      loadWord,
      reportError,
      resetQueue,
      resolveList,
      userId,
    ],
  );
}

export function useTrainingPilotController({
  enabled,
  interfaceLanguage,
  listHydrated,
  loadingWord,
  hasCurrentWord,
  loadError,
  activeScenario,
  enabledModes,
  cardFilter,
  activeListValue,
  newReviewRatio,
  focusFilter,
  listOptions,
  sourceOptions,
  onCommitDraft,
  onRetry,
  initialTransitionId,
  loadTrainingScenarios = fetchTrainingScenarios,
}: PilotControllerParams) {
  const [surface, setSurface] = useState<"today" | "session">(() =>
    enabled ? "today" : "session",
  );
  const [sessionGeneration, setSessionGeneration] = useState(() =>
    enabled ? 0 : 1,
  );
  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [scenariosResolved, setScenariosResolved] = useState(false);
  const [startPending, setStartPending] = useState(false);
  const startPendingRef = useRef(false);
  const initialScenarioTransitionIdRef = useRef(initialTransitionId);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const loadScenarios = async () => {
      try {
        const loaded = await loadTrainingScenarios();
        if (!cancelled) {
          setScenarios(loaded.filter((scenario) => scenario.enabled));
        }
      } catch {
        if (!cancelled) setScenarios([]);
      } finally {
        if (!cancelled) setScenariosResolved(true);
      }
    };
    const scenarioTransitionId = initialScenarioTransitionIdRef.current;
    initialScenarioTransitionIdRef.current = undefined;
    void (scenarioTransitionId
      ? measureTrainingTransitionStage(
          scenarioTransitionId,
          "training.scenarios",
          loadScenarios,
        )
      : loadScenarios());
    return () => {
      cancelled = true;
    };
  }, [enabled, loadTrainingScenarios]);

  const status: TrainingPilotStatus = loadError
    ? "error"
    : !listHydrated || (loadingWord && !hasCurrentWord)
      ? "loading"
      : listOptions.length === 0
        ? "first-use"
        : !hasCurrentWord
          ? "empty"
          : "ready";

  const initialDraft: TrainingSetupDraft = {
    scenarioId: activeScenario,
    modes: enabledModes,
    cardFilter,
    listValue: activeListValue,
    newReviewRatio,
    dateWindow: focusFilter.dateWindow,
    daysAgo: focusFilter.daysAgo,
    sourceValue: focusFilter.sourceId
      ? `source:${focusFilter.sourceId}`
      : focusFilter.sourceKind === "youtube"
        ? "kind:youtube"
        : "all",
  };

  const scenarioOptions = useMemo<TrainingSetupOption[]>(() => {
    if (!scenariosResolved) return [];
    return scenarios
      .filter((scenario) => scenario.id === "understanding")
      .map((scenario) => ({
        value: scenario.id,
        label:
          interfaceLanguage === "nl"
            ? scenario.nameNl || scenario.nameEn
            : scenario.nameEn || scenario.nameNl || scenario.id,
        modes: scenario.cardModes.filter(isTrainingMode),
      }));
  }, [interfaceLanguage, scenarios, scenariosResolved]);

  const startSession = useCallback(
    async (draft: TrainingSetupDraft) => {
      const scenarioSupported = isTrainingSetupDraftSupported(
        draft,
        scenarioOptions,
      );
      if (!scenariosResolved || !scenarioSupported || startPendingRef.current) {
        return false;
      }
      startPendingRef.current = true;
      setStartPending(true);
      try {
        const committed = await onCommitDraft(draft);
        if (committed) {
          setSessionGeneration((generation) => generation + 1);
          setSurface("session");
        }
        return committed;
      } finally {
        startPendingRef.current = false;
        setStartPending(false);
      }
    },
    [onCommitDraft, scenarioOptions, scenariosResolved],
  );

  return {
    surface,
    sessionGeneration,
    status,
    initialDraft,
    scenarioOptions,
    sourceOptions,
    startPending,
    scenarioLoading: !scenariosResolved,
    continueSession: () => {
      setSessionGeneration((generation) => generation + 1);
      setSurface("session");
    },
    returnToToday: () => setSurface("today"),
    startSession,
    retry: onRetry,
  };
}
