import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchTrainingScenarios,
  startTrainingSession,
  updateActiveTrainingScope,
} from "@/lib/trainingService";
import type { TrainingSession } from "@/lib/trainingService";
import type {
  CardFilter,
  DetailedStats,
  TrainingExerciseFamily,
  TrainingFocusFilter,
  TrainingMode,
  TrainingScenario,
  TrainingSessionSize,
  TrainingSessionPlan,
  WordListSummary,
  WordListType,
} from "@/lib/types";
import type {
  PlatformIdiomExerciseSessionV2,
  PlatformTranslationExerciseSessionV2,
} from "../../../../../packages/shared/types/platformV2";
import type { StartPlatformV2IdiomTrainingSessionInput } from "@/lib/platform/platformV2IdiomExerciseClient";
import type { startPlatformV2TranslationTrainingSession } from "@/lib/platform/platformV2TranslationExerciseClient";
import { platformV2IdiomExercisesEnabled, platformV2TranslationExercisesEnabled } from "@/lib/platform/platformV2Rollout";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type {
  TrainingPilotStatus,
  TrainingSetupDraft,
  TrainingSetupOption,
} from "./TrainingTodaySetup";
import { isTrainingSetupDraftSupported, isTrainingSetupMaterialAvailable } from "./TrainingTodaySetup";
import { measureTrainingTransitionStage } from "@/lib/training/trainingTransitionTiming";
import { deriveTrainingPilotSetupStatus } from "@/lib/training/trainingReadiness";
import {
  isTrainingLoadFailure,
  type LoadNextTrainingTurnResult,
} from "@/lib/training/trainingSelectionOutcome";

type TrainingScope = {
  listId: string | null;
  listType: WordListType | null;
};

export type TrainingSessionStartContext = {
  languageCode: string;
  scope: TrainingScope;
  draft: TrainingSetupDraft;
  focusFilter: TrainingFocusFilter;
};

export type TrainingPilotSession = TrainingSession | PlatformIdiomExerciseSessionV2 | PlatformTranslationExerciseSessionV2;

type CommitPilotDraftParams = {
  userId?: string;
  languageCode: string;
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
    trainingSessionId?: string;
  }) => Promise<LoadNextTrainingTurnResult>;
  startIdiomSession?: (
    input: StartPlatformV2IdiomTrainingSessionInput,
  ) => Promise<PlatformIdiomExerciseSessionV2>;
  startTranslationSession?: typeof startPlatformV2TranslationTrainingSession;
  reportError: (error: string | null) => void;
  onPlanReady?: (plan: TrainingSessionPlan) => void;
  onSessionReady?: (
    session: TrainingPilotSession,
    context: TrainingSessionStartContext,
  ) => void;
};

type PilotControllerParams = {
  enabled: boolean;
  translationTargetLanguageCode?: string | null;
  interfaceLanguage: OnboardingLanguage;
  setupPrerequisites: "pending" | "ready" | "error";
  activeScenario: string;
  enabledModes: TrainingMode[];
  cardFilter: CardFilter;
  activeListValue: string;
  newReviewRatio: number;
  sessionSize: TrainingSessionSize;
  focusFilter: TrainingFocusFilter;
  listOptions: TrainingSetupOption[];
  dictionaryOptions: TrainingSetupOption[];
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
  resolveList,
  applyListLocally,
  applyPreferences,
  applyFocusFilter,
  resetQueue,
  loadStats,
  loadWord,
  startIdiomSession,
  startTranslationSession,
  reportError,
  onPlanReady,
  onSessionReady,
}: CommitPilotDraftParams) {
  const startRequestRef = useRef<{ key: string; requestId: string } | null>(
    null,
  );
  return useCallback(
    async (draft: TrainingSetupDraft) => {
      if (!userId) return false;
      const collectionMode = !draft.materialMode || draft.materialMode === "collection";
      const selectedList = collectionMode ? resolveList(draft.listValue) : null;
      if (collectionMode && !selectedList) {
        reportError("training_material_unavailable");
        return false;
      }
      if (draft.materialMode === "selected-dictionaries" && !draft.dictionaryIds?.length) {
        reportError("training_material_unavailable");
        return false;
      }
      const scope: TrainingScope = selectedList
        ? { listId: selectedList.id, listType: selectedList.type }
        : { listId: null, listType: null };
      const dictionaryScope: TrainingFocusFilter["dictionaryScope"] =
        draft.materialMode === "all-dictionaries"
          ? { mode: "all", languageCode }
          : draft.materialMode === "selected-dictionaries"
            ? { mode: "selected", languageCode, dictionaryIds: draft.dictionaryIds ?? [] }
            : undefined;
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
        ...(draft.partOfSpeech?.length
          ? { partOfSpeech: [...new Set(draft.partOfSpeech)].sort() }
          : {}),
        ...(draft.nounArticles?.length
          ? { nounArticles: [...new Set(draft.nounArticles)].sort() }
          : {}),
        ...(dictionaryScope ? { dictionaryScope } : {}),
      };

      const result = await updateActiveTrainingScope({
        userId,
        languageCode,
        listId: scope.listId,
        listType: scope.listType,
        // Idiom exercises own a separate server queue. Keep the persisted
        // ordinary scope valid while the draft carries the family boundary.
        activeScenario: draft.family === "meaning" ? draft.scenarioId : "understanding",
        cardFilter: draft.cardFilter,
        modesEnabled: draft.modes,
        newReviewRatio: draft.newReviewRatio,
      });
      if (result.error) {
        reportError("training_scope_update_failed");
        return false;
      }

      const startKey = JSON.stringify({
        scope,
        family: draft.family ?? "meaning",
        modes: draft.modes,
        cardFilter: draft.cardFilter,
        newReviewRatio: draft.newReviewRatio,
        focusFilter,
        sessionSize: draft.sessionSize,
      });
      if (startRequestRef.current?.key !== startKey) {
        startRequestRef.current = {
          key: startKey,
          requestId: crypto.randomUUID(),
        };
      }
      if (draft.family === "idiom") {
        if (!startIdiomSession) {
          reportError("training_idiom_unavailable");
          return false;
        }
        let idiomSession: PlatformIdiomExerciseSessionV2;
        try {
          idiomSession = await startIdiomSession({
            userId,
            direction: draft.modes.includes("definition-to-word") ? "reverse" : "direct",
            sessionSize: typeof draft.sessionSize === "number" ? draft.sessionSize : 10,
            requestId: startRequestRef.current.requestId,
            listId: scope.listId,
            listType: scope.listType ?? "curated",
            cardFilter: draft.cardFilter,
            trainingFilter: focusFilter,
            newReviewRatio: draft.newReviewRatio,
          });
        } catch (error) {
          reportError(
            error instanceof Error && error.message === "training_material_unavailable"
              ? "training_material_unavailable"
              : "training_idiom_start_failed",
          );
          return false;
        }
        startRequestRef.current = null;
        onSessionReady?.(idiomSession, {
          languageCode,
          scope,
          draft,
          focusFilter,
        });
        onPlanReady?.({
          requestedTotal: idiomSession.requestedTotal,
          plannedNew: idiomSession.plannedNew,
          plannedReview: idiomSession.plannedReview,
          plannedPractice: idiomSession.plannedPractice,
          plannedTotal: idiomSession.plannedTotal,
          plannedAt: idiomSession.plannedAt,
        });
        reportError(null);
        if (selectedList) applyListLocally(selectedList);
        applyPreferences(draft);
        applyFocusFilter(focusFilter);
        resetQueue();
        loadStats(scope);
        return true;
      }
      if (draft.family === "sentence") {
        if (!startTranslationSession) {
          reportError("training_sentences_unavailable");
          return false;
        }
        let translationSession: PlatformTranslationExerciseSessionV2;
        try {
          translationSession = await startTranslationSession({
            userId,
            sessionSize: typeof draft.sessionSize === "number" ? draft.sessionSize : 10,
            requestId: startRequestRef.current.requestId,
            listId: scope.listId,
            listType: scope.listType ?? "curated",
            cardFilter: draft.cardFilter,
            trainingFilter: focusFilter,
            newReviewRatio: draft.newReviewRatio,
          });
        } catch (error) {
          reportError(error instanceof Error && error.message === "training_material_unavailable" ? "training_material_unavailable" : "training_sentences_start_failed");
          return false;
        }
        startRequestRef.current = null;
        onSessionReady?.(translationSession, { languageCode, scope, draft, focusFilter });
        onPlanReady?.({ requestedTotal: translationSession.requestedTotal, plannedNew: translationSession.plannedNew, plannedReview: translationSession.plannedReview, plannedPractice: 0, plannedTotal: translationSession.plannedTotal, plannedAt: translationSession.plannedAt });
        reportError(null);
        if (selectedList) applyListLocally(selectedList);
        applyPreferences(draft);
        applyFocusFilter(focusFilter);
        resetQueue();
        loadStats(scope);
        return true;
      }
      let session: TrainingSession | null;
      try {
        session = await startTrainingSession(userId, draft.family === "word-in-context" ? ["definition-to-word"] : draft.modes, {
          listId: scope.listId,
          listType: scope.listType ?? undefined,
          cardFilter: draft.cardFilter,
          newReviewRatio: draft.newReviewRatio,
          trainingFilter: draft.family === "word-in-context"
            ? { ...focusFilter, presentationMode: "word-in-context" }
            : focusFilter,
          sessionSize: draft.sessionSize,
        }, startRequestRef.current.requestId);
      } catch (error) {
        if (error instanceof Error && error.message === "training_material_unavailable") {
          reportError("training_material_unavailable");
          return false;
        }
        throw error;
      }
      if (!session) {
        reportError("training_plan_unavailable");
        return false;
      }
      if (session.runStatus === "superseded") {
        startRequestRef.current = null;
        reportError("training_session_superseded");
        return false;
      }
      startRequestRef.current = null;
      onSessionReady?.(session, {
        languageCode,
        scope,
        draft,
        focusFilter,
      });
      onPlanReady?.(session);

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
        trainingSessionId: session.sessionId,
      });
      if (isTrainingLoadFailure(loadResult)) reportError("training_load_failed");
      return loadResult === "loaded";
    },
    [
      applyFocusFilter,
      applyListLocally,
      applyPreferences,
      languageCode,
      loadStats,
      loadWord,
      onPlanReady,
      onSessionReady,
      reportError,
      resetQueue,
      resolveList,
      startIdiomSession,
      startTranslationSession,
      userId,
    ],
  );
}

export function useTrainingPilotController({
  enabled,
  translationTargetLanguageCode,
  interfaceLanguage,
  setupPrerequisites,
  activeScenario,
  enabledModes,
  cardFilter,
  activeListValue,
  newReviewRatio,
  sessionSize,
  focusFilter,
  listOptions,
  dictionaryOptions,
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
  const [exerciseFamily, setExerciseFamily] = useState<TrainingExerciseFamily>("meaning");
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

  const status = deriveTrainingPilotSetupStatus({
    prerequisites: setupPrerequisites,
    hasAvailableLists: listOptions.length > 0 || dictionaryOptions.length > 0,
  });

  const initialDraft: TrainingSetupDraft = {
    family: exerciseFamily,
    // The ordinary scope remains persisted as `understanding` while an idiom
    // run is active. The setup draft must still point at the idiom scenario so
    // presets round-trip through validation and can be started again.
    scenarioId: exerciseFamily === "idiom" ? "idiom" : exerciseFamily === "sentence" ? "sentences" : activeScenario,
    modes: enabledModes,
    cardFilter,
    listValue: activeListValue,
    materialMode: focusFilter.dictionaryScope?.mode === "all"
      ? "all-dictionaries"
      : focusFilter.dictionaryScope?.mode === "selected"
        ? "selected-dictionaries"
        : "collection",
    dictionaryIds: focusFilter.dictionaryScope?.dictionaryIds ?? [],
    newReviewRatio,
    sessionSize,
    dateWindow: focusFilter.dateWindow,
    daysAgo: focusFilter.daysAgo,
    sourceValue: focusFilter.sourceId
      ? `source:${focusFilter.sourceId}`
      : focusFilter.sourceKind === "youtube"
        ? "kind:youtube"
        : "all",
    partOfSpeech: focusFilter.partOfSpeech ?? [],
    nounArticles: focusFilter.nounArticles ?? [],
  };

  const scenarioOptions = useMemo<TrainingSetupOption[]>(() => {
    if (!scenariosResolved) return [];
    const options = scenarios
      .filter((scenario) => scenario.id === "understanding")
      .map((scenario) => ({
        value: scenario.id,
        label:
          interfaceLanguage === "nl"
            ? scenario.nameNl || scenario.nameEn
            : scenario.nameEn || scenario.nameNl || scenario.id,
        modes: scenario.cardModes.filter(isTrainingMode),
      }));
    if (platformV2IdiomExercisesEnabled()) {
      options.push({
        value: "idiom",
        label: interfaceLanguage === "nl" ? "Uitdrukkingen" : interfaceLanguage === "ru" ? "Идиомы" : "Idioms",
        modes: ["word-to-definition", "definition-to-word"],
      });
    }
    if (platformV2TranslationExercisesEnabled() && translationTargetLanguageCode) {
      options.push({ value: "sentences", label: interfaceLanguage === "nl" ? "Voorbeeldzinnen" : interfaceLanguage === "ru" ? "Примеры предложений" : "Example sentences", modes: ["word-to-definition"] });
    }
    return options;
  }, [interfaceLanguage, scenarios, scenariosResolved, translationTargetLanguageCode]);

  const startSession = useCallback(
    async (draft: TrainingSetupDraft) => {
      const scenarioSupported = isTrainingSetupDraftSupported(
        draft,
        scenarioOptions,
      );
      if (!scenariosResolved || !scenarioSupported || !isTrainingSetupMaterialAvailable(draft, listOptions, dictionaryOptions) || startPendingRef.current) {
        return false;
      }
      startPendingRef.current = true;
      setStartPending(true);
      try {
        const committed = await onCommitDraft(draft);
        if (committed) {
          setExerciseFamily(draft.family ?? "meaning");
          setSessionGeneration((generation) => generation + 1);
          setSurface("session");
        }
        return committed;
      } finally {
        startPendingRef.current = false;
        setStartPending(false);
      }
    },
    [dictionaryOptions, listOptions, onCommitDraft, scenarioOptions, scenariosResolved],
  );

  const continueSession = useCallback(() => {
    setSessionGeneration((generation) => generation + 1);
    setSurface("session");
  }, []);
  const resumeSession = useCallback(() => setSurface("session"), []);
  const returnToToday = useCallback(() => setSurface("today"), []);
  const setExerciseFamilyForResume = useCallback(
    (family: TrainingExerciseFamily) => setExerciseFamily(family),
    [],
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
    continueSession,
    resumeSession,
    returnToToday,
    setExerciseFamilyForResume,
    startSession,
    retry: onRetry,
  };
}
