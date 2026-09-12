"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { User } from "@supabase/supabase-js";
import Joyride, { Step } from "react-joyride";
import { supabase } from "@/lib/supabaseClient";
import { trainingDebug } from "@/lib/trainingDebug";
import {
  createTrainingScenarioCatalog,
  fetchAvailableLearningLanguages,
  fetchTrainingFilterSources,
  fetchTrainingSessionSnapshot,
  fetchStats,
  updateActiveTrainingScope,
  type TrainingScenarioCatalog,
  type TrainingSessionSnapshot,
} from "@/lib/trainingService";
import type {
  ActiveTrainingScope,
  CardFilter,
  DetailedStats,
  DictionaryEntry,
  TrainingFocusFilter,
  TrainingFilterSource,
  TrainingMode,
  TrainingSessionPlan,
  TrainingSessionSize,
  TrainingWord,
  WordListSummary,
  WordListType,
} from "@/lib/types";
import type { PlatformHeadwordGroupV2 } from "../../../../packages/shared/types/platformV2";
import { useCardParams } from "@/lib/cardParams";
import {
  useTrainingPreferences,
  type ThemePreference,
} from "@/lib/training/useTrainingPreferences";
import { useTrainingAudio } from "@/lib/training/useTrainingAudio";
import { useTrainingOnboarding } from "@/lib/training/useTrainingOnboarding";
import { useTrainingActiveList } from "@/lib/training/useTrainingActiveList";
import {
  TrainingKnownUndoNotice,
  TrainingSenseCardV2Session,
} from "./v2/TrainingSenseCardV2Session";
import { TrainingUsableCandidatesExhausted } from "./v2/TrainingUsableCandidatesExhausted";
import { TrainingUnsupportedMode } from "./v2/TrainingUnsupportedMode";
import {
  TrainingSessionSurface,
  type TrainingSessionNoticeInput,
} from "./v2/TrainingSessionSurface";
import sessionStyles from "./v2/TrainingSessionLayout.module.css";
import { trainingScenarioLabel } from "./v2/trainingSessionLabels";
import { useTrainingSessionPresentation } from "./v2/useTrainingSessionPresentation";
import { useAuthoritativeTrainingSessionPlan } from "./v2/useTrainingSessionPlan";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import { useTrainingTurnSelectionPort } from "./useTrainingTurnSelectionPort";
import { useTrainingTurnController } from "./useTrainingTurnController";
import { getTrainingCardKey } from "@/lib/training/trainingQueue";
import { TrainingDetailsDrawer } from "./TrainingDetailsDrawer";
import { TrainingMoreSenseCardV2Session } from "./library-v2/LibrarySenseCardV2Session";
import type { FooterStatsProps } from "./FooterStats";
import { HotkeyDialog } from "./HotkeyDialog";
import { areTrainingHotkeysSuspended } from "./trainingHotkeys";
import { LanguageSelectionModal } from "./LanguageSelectionModal";
import { AppFrame } from "@/components/navigation/AppFrame";
import { LibraryDestination } from "@/components/navigation/LibraryDestination";
import { SettingsDestination } from "@/components/navigation/SettingsDestination";
import { ReadingPreferencesProvider } from "@/components/reading/ReadingPreferencesProvider";
import { StatisticsDestination } from "@/components/navigation/StatisticsDestination";
import {
  TrainingTodaySetup,
  DEFAULT_SESSION_SIZE,
  type TrainingSetupDraft,
} from "./pilot/TrainingTodaySetup";
import {
  useCommitTrainingPilotDraft,
  useTrainingPilotController,
} from "./pilot/useTrainingPilotController";
import {
  clearTrainingSessionResume,
  readTrainingSessionResume,
  subscribeTrainingSessionInvalidation,
  writeTrainingSessionResume,
} from "@/lib/training/sessionResumeStore";
import {
  TRAINING_HISTORY_DESTINATION,
  type AppDestination,
} from "@/components/navigation/appDestination";
import {
  getOnboardingTranslation,
  type OnboardingLanguage,
} from "@/lib/onboardingI18n";
import {
  beginTrainingUserTransition,
  createTrainingTransitionId,
  markTrainingEntryPresentationStarted,
  registerTrainingEntryTransition,
} from "@/lib/training/trainingTransitionTiming";
import type { TrainingStartupSnapshot } from "@/lib/training/trainingStartupSnapshot";

type Props = {
  user: User;
  startupSnapshot: TrainingStartupSnapshot;
  destination?: AppDestination;
  onRequestDestination: (destination: AppDestination) => void;
  onReturnFromHistory?: () => void;
  onNavigationBlockedChange?: (blocked: boolean) => void;
  trainingTodaySetupEnabled?: boolean;
};

const LazyTrainingHistoryDestination = dynamic(
  () =>
    import("@/components/navigation/TrainingHistoryDestination").then(
      (module) => module.TrainingHistoryDestination,
    ),
  { ssr: false },
);

const DEFAULT_LANGUAGE_OPTIONS = [{ value: "nl", label: "Nederlands" }];

const TRAINING_SESSION_AUTHORITY_POLL_MS = 20_000;

const DEFAULT_TRAINING_FOCUS_FILTER: TrainingFocusFilter = {
  dateWindow: "all",
};

const trainingFilterKey = (filter: TrainingFocusFilter) =>
  JSON.stringify({
    dateWindow: filter.dateWindow,
    daysAgo: filter.daysAgo ?? null,
    sourceKind: filter.sourceKind ?? null,
    sourceId: filter.sourceId ?? null,
    externalId: filter.externalId ?? null,
  });

const fallbackLanguageLabel = (code: string) =>
  code ? code.toUpperCase() : "Onbekend";

const STEP_TARGETS: Array<{
  target: string;
  placement: "center" | "bottom" | "top" | "right" | "left";
}> = [
  { target: "body", placement: "center" },
  { target: "[data-tour='training-card']", placement: "bottom" },
  { target: "[data-tour='rating-buttons']", placement: "top" },
  { target: "[data-tour='card-toolbar']", placement: "right" },
  { target: "[data-tour='settings-button']", placement: "left" },
];

function buildJoyrideSteps(lang: OnboardingLanguage): Step[] {
  const t = getOnboardingTranslation(lang);
  return STEP_TARGETS.map((config, i) => ({
    target: config.target,
    placement: config.placement,
    title: t.onboarding.steps[i].title,
    content: t.onboarding.steps[i].content,
  }));
}

export function TrainingScreen(props: Props) {
  return (
    <ReadingPreferencesProvider userId={props.user.id}>
      <TrainingScreenContent {...props} />
    </ReadingPreferencesProvider>
  );
}

function TrainingScreenContent({
  user,
  startupSnapshot,
  destination = "training",
  onRequestDestination,
  onReturnFromHistory,
  onNavigationBlockedChange,
  trainingTodaySetupEnabled = process.env
    .NEXT_PUBLIC_TRAINING_TODAY_SETUP_V1 === "true",
}: Props) {
  const {
    transitionId: initialTransitionId,
    interfaceLanguage: initialInterfaceLanguage,
    preferences: initialPreferences,
  } = startupSnapshot;
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const previousDestinationRef = useRef(destination);

  useEffect(() => {
    const previousDestination = previousDestinationRef.current;
    previousDestinationRef.current = destination;
    if (
      previousDestination !== TRAINING_HISTORY_DESTINATION ||
      destination !== "training"
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() =>
      historyButtonRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [destination]);

  const trainingScenarioCatalogRef = useRef<TrainingScenarioCatalog | null>(
    null,
  );
  if (!trainingScenarioCatalogRef.current) {
    trainingScenarioCatalogRef.current = createTrainingScenarioCatalog();
  }
  const trainingScenarioCatalog = trainingScenarioCatalogRef.current;
  const { wordId, devMode } = useCardParams();
  const [currentWord, setCurrentWord] = useState<TrainingWord | null>(null);
  const [sessionSize, setSessionSize] =
    useState<TrainingSessionSize>(DEFAULT_SESSION_SIZE);
  const [sessionPlannedTotal, setSessionPlannedTotal] = useState<number | null>(
    null,
  );
  const [latchedSessionPlan, setLatchedSessionPlan] =
    useState<TrainingSessionPlan | null>(null);
  const [sessionConsumedCardKeys, setSessionConsumedCardKeys] = useState<
    string[]
  >([]);
  const [sessionCompletedActions, setSessionCompletedActions] = useState(0);
  const [trainingSessionId, setTrainingSessionId] = useState<string | null>(
    null,
  );
  // The first card load waits for a possible server-backed session resume. A
  // missing or stale resume record is resolved immediately and preserves the
  // ordinary first-use flow.
  const [sessionResumeResolved, setSessionResumeResolved] = useState(
    () =>
      !trainingTodaySetupEnabled ||
      !readTrainingSessionResume(user.id),
  );
  const [sessionResumeError, setSessionResumeError] = useState(false);
  const [sessionReplacementWarning, setSessionReplacementWarning] =
    useState(false);
  const [sessionAuthorityChecking, setSessionAuthorityChecking] =
    useState(false);
  const [platformProgressActionPending, setPlatformProgressActionPending] =
    useState(false);
  const sessionResumeAttemptedRef = useRef(false);
  const sessionResumeGenerationRef = useRef(0);
  const sessionAuthorityValidationRef = useRef(0);
  const platformProgressActionTokenRef = useRef<object | null>(null);
  const handlePlatformProgressActionPendingChange = useCallback(
    (pending: boolean, token: object) => {
      if (pending) {
        platformProgressActionTokenRef.current = token;
        setPlatformProgressActionPending(true);
        return;
      }
      if (platformProgressActionTokenRef.current !== token) return;
      platformProgressActionTokenRef.current = null;
      setPlatformProgressActionPending(false);
    },
    [],
  );
  const resetPlatformProgressActionPending = useCallback(() => {
    platformProgressActionTokenRef.current = null;
    setPlatformProgressActionPending(false);
  }, []);
  const componentMountedRef = useRef(true);
  useEffect(() => {
    componentMountedRef.current = true;
    return () => {
      componentMountedRef.current = false;
    };
  }, []);
  const {
    activeScenario,
    audioQuality,
    cardFilter,
    enabledModes,
    language,
    newReviewRatio,
    themePreference,
    translationLang,
    setActiveScenario,
    setCardFilter: setCardFilterPreference,
    setEnabledModes,
    setNewReviewRatio,
    setTheme,
    setTranslationLang,
  } = useTrainingPreferences(user?.id, initialTransitionId, initialPreferences);
  const [currentTrainingLanguage, setCurrentTrainingLanguage] =
    useState(language);
  const [trainingLanguageOptions, setTrainingLanguageOptions] = useState(
    DEFAULT_LANGUAGE_OPTIONS,
  );
  const trainingLanguageManuallyChangedRef = useRef(false);
  const languageHydrationPendingRef = useRef(false);
  const languageHydrationObservedNotReadyRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const loadTrainingLanguages = async () => {
      const languages = await fetchAvailableLearningLanguages(user.id);
      if (cancelled) return;

      const options = languages.map((item) => ({
        value: item.code,
        label: item.label || fallbackLanguageLabel(item.code),
      }));
      const withCurrent = options.some(
        (option) => option.value === currentTrainingLanguage,
      )
        ? options
        : [
            ...options,
            {
              value: currentTrainingLanguage,
              label: fallbackLanguageLabel(currentTrainingLanguage),
            },
          ];
      setTrainingLanguageOptions(
        withCurrent.length ? withCurrent : DEFAULT_LANGUAGE_OPTIONS,
      );
    };

    void loadTrainingLanguages();
    return () => {
      cancelled = true;
    };
  }, [currentTrainingLanguage, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const loadFilterSources = async () => {
      const sources = await fetchTrainingFilterSources(user.id);
      if (!cancelled) {
        setTrainingFilterSources(sources);
      }
    };

    void loadFilterSources();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const [trainingFocusFilter, setTrainingFocusFilter] =
    useState<TrainingFocusFilter>(DEFAULT_TRAINING_FOCUS_FILTER);
  const [trainingFilterSources, setTrainingFilterSources] = useState<
    TrainingFilterSource[]
  >([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailSelection, setDetailSelection] = useState<{
    entryId: string;
    headword: string;
    contentLanguageCode?: string;
  } | null>(null);
  const [detailInitialGroup, setDetailInitialGroup] =
    useState<PlatformHeadwordGroupV2 | null>(null);
  const [stats, setStats] = useState<DetailedStats>({
    newWordsToday: 0,
    newCardsToday: 0,
    learningStartedToday: 0,
    graduatedNewWordsToday: 0,
    dailyNewLimit: 10,
    reviewWordsDone: 0,
    reviewCardsDone: 0,
    reviewWordsDue: 0,
    reviewCardsDue: 0,
    totalWordsLearned: 0,
    totalWordsInList: 2000,
  });
  // Fixed Y value for HERHALING counter - set once at session start, never changes
  const [initialReviewDue, setInitialReviewDue] = useState<number | null>(null);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const { playAudio } = useTrainingAudio();

  const {
    handleJoyrideCallback,
    handleLanguageSelect,
    isDarkMode,
    onboardingLang,
    runTour,
    saveOnboardingLanguageChoice,
    showLanguageSelection,
  } = useTrainingOnboarding({
    userId: user?.id,
    interfaceLanguage: initialInterfaceLanguage,
    preferences: initialPreferences.preferences,
  });

  useEffect(() => {
    if (devMode) {
      trainingDebug.log("[Training] Dev mode enabled: URL params are active.");
    }
  }, [devMode]);

  useEffect(() => {
    if (!currentWord) return;
    trainingDebug.log(
      `[Training] First encounter: ${currentWord.headword}`,
      currentWord.isFirstEncounter,
    );
  }, [currentWord, currentWord?.id]);

  const trainingFocusFilterKey = trainingFilterKey(trainingFocusFilter);

  const {
    activeList,
    activeListValue,
    applyListLocal,
    availableLists,
    handleListsUpdated: refreshListsAfterUpdate,
    activeTrainingScope,
    listHydrated,
    listOptions,
    persistListChange,
    resolveListValue,
    wordListId,
    wordListLabel,
    wordListType,
  } = useTrainingActiveList({
    userId: user?.id,
    language: currentTrainingLanguage,
    showSettings: destination === "library",
    initialTransitionId,
  });

  const appliedDefaultScenarioListRef = useRef<string | null>(null);
  const lastAppliedActiveTrainingScopeRef = useRef<ActiveTrainingScope | null>(
    null,
  );
  const localTrainingPreferencesRef = useRef({
    activeScenario,
    cardFilter,
    enabledModes,
    newReviewRatio,
  });
  localTrainingPreferencesRef.current = {
    activeScenario,
    cardFilter,
    enabledModes,
    newReviewRatio,
  };

  const enabledModesKey = enabledModes.join("|");

  // Ref to prevent race conditions: track if initial load has been done
  const initialLoadDone = useRef(false);
  const statsRequestGenerationRef = useRef(0);
  const lastAppliedTrainingFocusFilterKey = useRef(trainingFocusFilterKey);
  const lastReloadedLanguageModeScopeRef = useRef(
    `${currentTrainingLanguage}|${enabledModesKey}`,
  );

  // Get the current mode for the active card (from the card itself, or fallback to first enabled mode)
  const currentMode: TrainingMode =
    currentWord?.mode ?? enabledModes[0] ?? "word-to-definition";
  const v2SessionMode =
    currentMode === "word-to-definition" ||
    currentMode === "definition-to-word" ||
    currentMode === "listen-recognize"
      ? currentMode
      : null;
  const v2SessionOwned = Boolean(v2SessionMode && currentWord);

  const persistCurrentTrainingScope = useCallback(
    (
      overrides: {
        listId?: string | null;
        listType?: WordListType | null;
        activeScenario?: string;
        cardFilter?: CardFilter;
        modesEnabled?: TrainingMode[];
        newReviewRatio?: number;
      } = {},
    ) => {
      if (!user?.id) return;
      void updateActiveTrainingScope({
        userId: user.id,
        languageCode: currentTrainingLanguage,
        listId: overrides.listId ?? wordListId,
        listType: overrides.listType ?? wordListType,
        activeScenario: overrides.activeScenario ?? activeScenario,
        cardFilter: overrides.cardFilter ?? cardFilter,
        modesEnabled: overrides.modesEnabled ?? enabledModes,
        newReviewRatio: overrides.newReviewRatio ?? newReviewRatio,
      });
    },
    [
      activeScenario,
      cardFilter,
      currentTrainingLanguage,
      enabledModes,
      newReviewRatio,
      user?.id,
      wordListId,
      wordListType,
    ],
  );

  const loadStats = useCallback(
    async (
      scope?: { listId?: string | null; listType?: WordListType | null },
      logContext?: string,
      isInitialLoad?: boolean,
    ) => {
      if (!user?.id) return;
      const generation = (statsRequestGenerationRef.current += 1);
      const effectiveListId = scope?.listId ?? wordListId;
      const effectiveListType = scope?.listType ?? wordListType;
      const fresh = await fetchStats(
        user.id,
        enabledModes,
        {
          listId: effectiveListId ?? undefined,
          listType: effectiveListType ?? undefined,
        },
        logContext,
      );
      if (generation !== statsRequestGenerationRef.current) return;

      if (isInitialLoad || initialReviewDue === null) {
        const totalReviewDue = fresh.reviewCardsDone + fresh.reviewCardsDue;
        setInitialReviewDue(totalReviewDue);
        trainingDebug.log(
          `%c 📌 Fixed HERHALING Y = ${totalReviewDue} (session start)`,
          "color: #f59e0b; font-weight: bold;",
        );
      }
      setStats(fresh);
    },
    [user?.id, enabledModes, wordListId, wordListType, initialReviewDue],
  );

  const selectionPort = useTrainingTurnSelectionPort({
    userId: user.id,
    activeScenario,
    activeList,
    availableLists,
    wordListId,
    wordListType,
    cardFilter,
    focusFilter: trainingFocusFilter,
    allowPractice: !trainingTodaySetupEnabled,
    trainingSessionId,
    resolveScenarioModes: trainingScenarioCatalog.resolveModes,
  });
  const refreshAfterAccepted = useCallback(
    async ({ statsLabel }: { statsLabel: string }) => {
      await loadStats(undefined, statsLabel);
    },
    [loadStats],
  );
  const recordSessionCardAccepted = useCallback((cardKey: string) => {
    setSessionConsumedCardKeys((current) =>
      current.includes(cardKey) ? current : [...current, cardKey],
    );
    setSessionCompletedActions((current) => current + 1);
  }, []);
  const sessionScopeKey = [
    activeScenario,
    currentTrainingLanguage,
    enabledModesKey,
    cardFilter,
    trainingFocusFilterKey,
    wordListId ?? "",
    wordListType ?? "",
    String(sessionSize),
  ].join("|");
  const {
    loadingWord,
    actionLoading,
    loadError: trainingLoadError,
    acceptedTransitionLoadStalled,
    usableCandidatesExhausted,
    reportLoadError: setTrainingLoadError,
    reportCardLoadFailure,
    retryCardLoadFailure,
    retryAcceptedTransitionLoad,
    nextTransitionId,
    currentPresentationId,
    nextCardOverrideNotice,
    loadNextWord,
    beginSessionScopeChange: beginTrainingTurnScopeChange,
    replaceSessionScopeAndLoad,
    requestNextCardOverride,
    resetFocusQueue,
    resetQueueForFilter,
    preparePlatformProgressAction: prepareV2ProgressAction,
    acceptPlatformProgressAction: handleV2ProgressActionAccepted,
  } = useTrainingTurnController({
    userId: user.id,
    currentWord,
    setCurrentWord,
    enabledModes,
    contentLanguageCode: currentTrainingLanguage,
    translationTargetLanguageCode:
      translationLang === "off" ? null : translationLang,
    cardFilter,
    newReviewRatio,
    recoverLoadErrors: trainingTodaySetupEnabled,
    sessionPlannedTotal,
    sessionConsumedCardKeys,
    sessionCompletedActions,
    trainingSessionId,
    focusFilter: trainingFocusFilter,
    sessionScopeKey,
    selection: selectionPort,
    refreshAfterAccepted,
    onSessionCardAccepted: recordSessionCardAccepted,
  });
  const clearResumeAfterCompletedRetry = useCallback(
    (result: unknown) => {
      if (result === "session-complete" && user?.id) {
        // A confirmed empty session is terminal. Transient retry outcomes
        // keep the resumable record intact for the next attempt.
        clearTrainingSessionResume(user.id);
      }
    },
    [user?.id],
  );
  const retryCardLoadFailureAndPersist = useCallback(async () => {
    const result = await retryCardLoadFailure();
    clearResumeAfterCompletedRetry(result);
    return result;
  }, [clearResumeAfterCompletedRetry, retryCardLoadFailure]);
  const retryAcceptedTransitionLoadAndPersist = useCallback(async () => {
    const result = await retryAcceptedTransitionLoad();
    clearResumeAfterCompletedRetry(result);
    return result;
  }, [clearResumeAfterCompletedRetry, retryAcceptedTransitionLoad]);
  const [presentationResetKey, setPresentationResetKey] = useState(0);
  const navigationBlocked = actionLoading || platformProgressActionPending;
  const currentPresentationIdentity =
    currentWord && currentPresentationId
      ? `${currentPresentationId}:${currentWord.id}:${currentMode}`
      : null;
  const beginSessionScopeChange = useCallback(() => {
    sessionResumeGenerationRef.current += 1;
    resetPlatformProgressActionPending();
    trainingScenarioCatalog.invalidate();
    beginTrainingTurnScopeChange();
    if (user?.id) clearTrainingSessionResume(user.id);
    setPresentationResetKey((key) => key + 1);
    setTrainingSessionId(null);
    setLatchedSessionPlan(null);
    setSessionPlannedTotal(null);
    setSessionConsumedCardKeys([]);
    setSessionCompletedActions(0);
  }, [
    beginTrainingTurnScopeChange,
    resetPlatformProgressActionPending,
    trainingScenarioCatalog,
    user?.id,
  ]);

  useEffect(() => {
    if (
      !trainingLanguageManuallyChangedRef.current &&
      currentTrainingLanguage !== language
    ) {
      beginSessionScopeChange();
      languageHydrationPendingRef.current = true;
      languageHydrationObservedNotReadyRef.current = false;
      setCurrentTrainingLanguage(language);
    }
  }, [beginSessionScopeChange, currentTrainingLanguage, language]);

  useEffect(() => {
    if (!activeTrainingScope) return;
    // On a refresh, the server scope arrives before the persisted session
    // record has been validated. Let resume apply its exact scope first;
    // otherwise this hydration observer could clear the resumable session.
    if (trainingTodaySetupEnabled && !sessionResumeResolved) return;
    if (lastAppliedActiveTrainingScopeRef.current === activeTrainingScope)
      return;
    lastAppliedActiveTrainingScopeRef.current = activeTrainingScope;
    const current = localTrainingPreferencesRef.current;
    const nextModes = activeTrainingScope.modesEnabled as TrainingMode[];
    const scopeChanged =
      current.activeScenario !== activeTrainingScope.activeScenario ||
      current.cardFilter !== activeTrainingScope.cardFilter ||
      current.enabledModes.join("|") !== nextModes.join("|");
    if (scopeChanged) beginSessionScopeChange();
    if (current.activeScenario !== activeTrainingScope.activeScenario) {
      setActiveScenario(activeTrainingScope.activeScenario, { persist: false });
    }
    if (current.cardFilter !== activeTrainingScope.cardFilter) {
      setCardFilterPreference(activeTrainingScope.cardFilter, {
        persist: false,
      });
    }
    if (current.enabledModes.join("|") !== nextModes.join("|")) {
      setEnabledModes(nextModes, { persist: false });
    }
    if (current.newReviewRatio !== activeTrainingScope.newReviewRatio) {
      setNewReviewRatio(activeTrainingScope.newReviewRatio, { persist: false });
    }
  }, [
    activeTrainingScope,
    beginSessionScopeChange,
    setActiveScenario,
    setCardFilterPreference,
    setEnabledModes,
    setNewReviewRatio,
    sessionResumeResolved,
    trainingTodaySetupEnabled,
  ]);

  useEffect(() => {
    if (!activeList?.default_scenario_id) {
      appliedDefaultScenarioListRef.current = null;
      return;
    }
    if (activeTrainingScope?.hasSavedScope) return;
    if (appliedDefaultScenarioListRef.current === activeList.id) return;

    appliedDefaultScenarioListRef.current = activeList.id;
    if (activeScenario !== activeList.default_scenario_id) {
      beginSessionScopeChange();
      setActiveScenario(activeList.default_scenario_id, { persist: false });
      if (initialLoadDone.current) {
        void replaceSessionScopeAndLoad({
          scope: { listId: wordListId, listType: wordListType },
          scenario: activeList.default_scenario_id,
        });
      }
    }
  }, [
    activeList?.default_scenario_id,
    activeList?.id,
    activeScenario,
    activeTrainingScope?.hasSavedScope,
    beginSessionScopeChange,
    replaceSessionScopeAndLoad,
    setActiveScenario,
    wordListId,
    wordListType,
  ]);

  const handleTrainingLanguageChange = useCallback(
    (value: string) => {
      beginSessionScopeChange();
      languageHydrationPendingRef.current = true;
      languageHydrationObservedNotReadyRef.current = false;
      trainingLanguageManuallyChangedRef.current = true;
      setCurrentTrainingLanguage(value);
    },
    [beginSessionScopeChange],
  );

  useEffect(() => {
    const nextKey = `${currentTrainingLanguage}|${enabledModesKey}`;
    if (!sessionResumeResolved) return;
    if (lastReloadedLanguageModeScopeRef.current === nextKey) return;
    if (languageHydrationPendingRef.current) {
      if (!listHydrated) {
        languageHydrationObservedNotReadyRef.current = true;
        return;
      }
      if (!languageHydrationObservedNotReadyRef.current) return;
      languageHydrationPendingRef.current = false;
      languageHydrationObservedNotReadyRef.current = false;
    } else if (!listHydrated) {
      return;
    }
    if (!initialLoadDone.current) return;
    lastReloadedLanguageModeScopeRef.current = nextKey;
    void loadNextWord();
  }, [
    currentTrainingLanguage,
    enabledModesKey,
    listHydrated,
    loadNextWord,
    sessionResumeResolved,
  ]);

  useEffect(() => {
    onNavigationBlockedChange?.(navigationBlocked);
    return () => onNavigationBlockedChange?.(false);
  }, [navigationBlocked, onNavigationBlockedChange]);

  const setCardFilter = useCallback(
    (newFilter: CardFilter) => {
      if (newFilter === cardFilter) return;
      // Card-filter changes leave the current finite session. Clear its id
      // before the next selection so an old session cannot leak across the
      // replacement boundary.
      beginSessionScopeChange();
      setCardFilterPreference(newFilter, { persist: false });
      persistCurrentTrainingScope({ cardFilter: newFilter });
      resetQueueForFilter(newFilter);
      if (initialLoadDone.current) {
        void loadNextWord({
          cardFilter: newFilter,
          trainingSessionId: null,
        });
      }
    },
    [
      beginSessionScopeChange,
      cardFilter,
      loadNextWord,
      persistCurrentTrainingScope,
      resetQueueForFilter,
      setCardFilterPreference,
    ],
  );

  const resetFocusQueueState = useCallback(() => {
    resetFocusQueue();
  }, [resetFocusQueue]);

  // Apply theme to document (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = (pref: ThemePreference) => {
      const useDark =
        pref === "dark" || (pref === "system" && mediaQuery.matches);
      root.classList.toggle("dark", useDark);
    };

    applyTheme(themePreference);

    if (themePreference !== "system") {
      return;
    }

    const handleSystemChange = (event: MediaQueryListEvent) => {
      root.classList.toggle("dark", event.matches);
    };

    mediaQuery.addEventListener("change", handleSystemChange);
    return () => mediaQuery.removeEventListener("change", handleSystemChange);
  }, [themePreference]);

  const handleTrainWord = useCallback(
    (wordId: string) => {
      requestNextCardOverride(wordId);
      void loadNextWord({
        excludeWordIds: [currentWord?.id].filter((x): x is string =>
          Boolean(x),
        ),
      });
    },
    [currentWord?.id, loadNextWord, requestNextCardOverride],
  );

  useEffect(() => {
    const awaitingDefaultScenario = Boolean(
      activeList?.default_scenario_id &&
      !activeTrainingScope?.hasSavedScope &&
      activeScenario !== activeList.default_scenario_id,
    );
    if (
      !user?.id ||
      !listHydrated ||
      awaitingDefaultScenario ||
      !sessionResumeResolved
    ) {
      return;
    }
    // Prevent double-loading due to loadNextWord changing when queueTurn changes
    if (initialLoadDone.current) {
      return;
    }
    initialLoadDone.current = true;
    if (wordId) {
      requestNextCardOverride(wordId, false);
    }
    loadNextWord({ transitionId: initialTransitionId });
    loadStats(undefined, "INITIAL LOAD", true); // isInitialLoad = true to set fixed Y
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeList?.default_scenario_id,
    activeScenario,
    activeTrainingScope?.hasSavedScope,
    user?.id,
    listHydrated,
    initialTransitionId,
    sessionResumeResolved,
    wordId,
  ]);

  useEffect(() => {
    if (
      !user?.id ||
      !listHydrated ||
      !sessionResumeResolved ||
      !initialLoadDone.current
    ) {
      return;
    }
    if (lastAppliedTrainingFocusFilterKey.current === trainingFocusFilterKey) {
      return;
    }
    lastAppliedTrainingFocusFilterKey.current = trainingFocusFilterKey;
    // A focus-filter change is a scope replacement. Explicitly clear the
    // previous finite-session id so the selection port cannot reuse it from
    // the render that initiated the change.
    beginSessionScopeChange();
    void loadNextWord({
      focusFilter: trainingFocusFilter,
      trainingSessionId: null,
    });
  }, [
    beginSessionScopeChange,
    listHydrated,
    loadNextWord,
    sessionResumeResolved,
    trainingFocusFilter,
    trainingFocusFilterKey,
    user?.id,
  ]);

  const handleShowDetails = useCallback(
    (entry: DictionaryEntry) => {
      setDetailInitialGroup(null);
      setDetailSelection({
        entryId: entry.id,
        headword: entry.headword,
        contentLanguageCode: entry.language_code ?? currentTrainingLanguage,
      });
      setDetailsOpen(true);
    },
    [currentTrainingLanguage],
  );

  // Show details for the current training word
  const handleShowCurrentWordDetails = useCallback(
    (details?: {
      group: PlatformHeadwordGroupV2;
      entry: { entryId: string };
    }) => {
      if (!currentWord) return;
      setDetailInitialGroup(details?.group ?? null);
      setDetailSelection({
        entryId: details?.entry?.entryId ?? currentWord.id,
        headword: details?.group?.header.text ?? currentWord.headword,
        contentLanguageCode:
          currentWord.language_code ?? currentTrainingLanguage,
      });
      setDetailsOpen(true);
    },
    [currentTrainingLanguage, currentWord],
  );

  const openSearch = useCallback(() => {
    if (!navigationBlocked) {
      onRequestDestination("library");
    }
  }, [navigationBlocked, onRequestDestination]);

  // Keep the navigation-oriented shortcuts available in the V2 session.
  // Card grading/reveal shortcuts belong to the V2 card itself; this boundary
  // only owns actions that remain valid for the whole Training surface.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (areTrainingHotkeysSuspended() || navigationBlocked) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (
        key === "s" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        openSearch();
        return;
      }
      if (
        key === "i" &&
        event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        handleShowCurrentWordDetails();
        return;
      }
      if (
        event.key === "?" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        setShowHotkeys(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleShowCurrentWordDetails, navigationBlocked, openSearch]);

  const openAppSettings = useCallback(() => {
    if (!navigationBlocked) {
      onRequestDestination("settings");
    }
  }, [navigationBlocked, onRequestDestination]);

  const handleUserDictionaryEntryCreated = useCallback(
    (entry: DictionaryEntry) => {
      setDetailSelection({
        entryId: entry.id,
        headword: entry.headword,
        contentLanguageCode: entry.language_code ?? currentTrainingLanguage,
      });
    },
    [currentTrainingLanguage],
  );

  const cycleThemePreference = useCallback(() => {
    const next =
      themePreference === "light"
        ? "dark"
        : themePreference === "dark"
          ? "system"
          : "light";
    setTheme(next);
  }, [setTheme, themePreference]);

  const handleFooterListChange = useCallback(
    async (value: string) => {
      const list = resolveListValue(value);
      if (!list) return;
      const nextScenario = list?.default_scenario_id ?? activeScenario;
      beginSessionScopeChange();
      const scope = await persistListChange(list, {
        activeScenario: nextScenario,
      });
      if (!scope) return;
      setActiveScenario(nextScenario, { persist: false });
      void loadStats(scope);
      void replaceSessionScopeAndLoad({ scope, scenario: nextScenario });
    },
    [
      activeScenario,
      beginSessionScopeChange,
      replaceSessionScopeAndLoad,
      loadStats,
      persistListChange,
      resolveListValue,
      setActiveScenario,
    ],
  );

  const handleListsUpdated = useCallback(async () => {
    beginSessionScopeChange();
    const reloadForList = (
      list: WordListSummary,
      refreshedScope: ActiveTrainingScope,
    ) => {
      // This exact snapshot belongs to the refresh transaction. The list's
      // default scenario below is authoritative for the replacement request,
      // so the hydration effect must not replay the intermediate snapshot.
      lastAppliedActiveTrainingScopeRef.current = refreshedScope;
      const nextScenario = list.default_scenario_id ?? activeScenario;
      setActiveScenario(nextScenario, { persist: false });
      persistCurrentTrainingScope({
        listId: list.id,
        listType: list.type,
        activeScenario: nextScenario,
      });
      void loadStats({ listId: list.id, listType: list.type });
      void replaceSessionScopeAndLoad({
        scope: { listId: list.id, listType: list.type },
        scenario: nextScenario,
      });
    };

    await refreshListsAfterUpdate({
      onResolvedActiveList: reloadForList,
      onPrimaryFallback: reloadForList,
    });
  }, [
    activeScenario,
    beginSessionScopeChange,
    loadStats,
    replaceSessionScopeAndLoad,
    persistCurrentTrainingScope,
    refreshListsAfterUpdate,
    setActiveScenario,
  ]);

  const handleScenarioChange = useCallback(
    (newScenario: string) => {
      trainingDebug.log("[Settings] Changing scenario to:", newScenario);
      beginSessionScopeChange();
      setActiveScenario(newScenario, { persist: false });
      persistCurrentTrainingScope({ activeScenario: newScenario });
      void replaceSessionScopeAndLoad({
        scope: { listId: wordListId, listType: wordListType },
        scenario: newScenario,
      });
    },
    [
      beginSessionScopeChange,
      setActiveScenario,
      persistCurrentTrainingScope,
      replaceSessionScopeAndLoad,
      wordListId,
      wordListType,
    ],
  );

  const handleCardFilterChange = useCallback(
    (newFilter: CardFilter) => {
      setCardFilter(newFilter);
    },
    [setCardFilter],
  );

  const handleNewReviewRatioChange = useCallback(
    (newRatio: number) => {
      setNewReviewRatio(newRatio, { persist: false });
      persistCurrentTrainingScope({ newReviewRatio: newRatio });
    },
    [persistCurrentTrainingScope, setNewReviewRatio],
  );

  const applyPilotPreferences = useCallback(
    (draft: TrainingSetupDraft) => {
      setActiveScenario(draft.scenarioId, { persist: false });
      setEnabledModes(draft.modes, { persist: false });
      setCardFilterPreference(draft.cardFilter, { persist: false });
      setNewReviewRatio(draft.newReviewRatio, { persist: false });
      setSessionSize(draft.sessionSize ?? DEFAULT_SESSION_SIZE);
    },
    [
      setActiveScenario,
      setCardFilterPreference,
      setEnabledModes,
      setNewReviewRatio,
      setSessionSize,
    ],
  );
  const commitPilotSessionDraft = useCommitTrainingPilotDraft({
    userId: user?.id,
    languageCode: currentTrainingLanguage,
    currentScope: { listId: wordListId, listType: wordListType },
    resolveList: resolveListValue,
    applyListLocally: applyListLocal,
    applyPreferences: applyPilotPreferences,
    applyFocusFilter: setTrainingFocusFilter,
    onPlanReady: (plan) => {
      setSessionConsumedCardKeys([]);
      setSessionCompletedActions(0);
      setSessionPlannedTotal(plan.requestedTotal ?? plan.plannedTotal);
    },
    resetQueue: resetFocusQueueState,
    loadStats: (scope) => void loadStats(scope),
    loadWord: loadNextWord,
    reportError: setTrainingLoadError,
    onSessionReady: (session, context) => {
      setSessionReplacementWarning(false);
      setSessionConsumedCardKeys([]);
      setSessionCompletedActions(0);
      setTrainingSessionId(session.sessionId);
      setLatchedSessionPlan(session);
      // The explicit session-start load below owns this filter. Mark it as
      // already applied so the focus-filter observer does not issue a
      // second, unscoped replacement request after React commits the state.
      lastAppliedTrainingFocusFilterKey.current = trainingFilterKey(
        context.focusFilter,
      );
      writeTrainingSessionResume({
        sessionId: session.sessionId,
        userId: user.id,
        languageCode: context.languageCode,
        listId: context.scope.listId,
        listType: context.scope.listType,
        scenarioId: context.draft.scenarioId,
        modes: context.draft.modes,
        cardFilter: context.draft.cardFilter,
        newReviewRatio: context.draft.newReviewRatio,
        focusFilter: context.focusFilter,
        sessionSize: context.draft.sessionSize ?? DEFAULT_SESSION_SIZE,
      });
    },
  });

  const handleSignOut = async () => {
    // Supabase can return `session_not_found` if the JWT refers to a session
    // that was already revoked/expired server-side. Treat that as a successful
    // sign out and still clear local auth state.
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      const code = (error as unknown as { code?: string }).code;
      if (code !== "session_not_found") {
        console.warn("[Auth] signOut(global) failed:", error);
      }
    }

    // Always clear local session so the UI updates. In practice, Supabase can
    // still reply `session_not_found` here as well; ensure we clear storage
    // regardless.
    const { error: localError } = await supabase.auth.signOut({
      scope: "local",
    });
    if (localError) {
      const code = (localError as unknown as { code?: string }).code;
      if (code !== "session_not_found") {
        console.warn("[Auth] signOut(local) failed:", localError);
      }
    }

    // Fallback: nuke any persisted Supabase auth tokens so we never get stuck
    // "logged in" client-side due to a missing server session record.
    if (typeof window !== "undefined") {
      try {
        for (const k of Object.keys(window.localStorage)) {
          if (k.startsWith("sb-") && k.includes("-auth-token")) {
            window.localStorage.removeItem(k);
          }
        }
      } catch (e) {
        console.warn("[Auth] failed clearing localStorage tokens:", e);
      }

      // Kick the app to a clean state after logout.
      window.location.assign("/");
    }
  };

  const pilotSourceOptions = trainingFilterSources.map((source) => ({
    value: `source:${source.sourceId}`,
    label: source.label,
  }));
  const trainingPilot = useTrainingPilotController({
    enabled: trainingTodaySetupEnabled,
    interfaceLanguage: onboardingLang,
    listHydrated,
    loadingWord,
    hasCurrentWord: Boolean(currentWord),
    loadError: trainingLoadError,
    activeScenario,
    enabledModes,
    cardFilter,
    activeListValue,
    newReviewRatio,
    sessionSize,
    focusFilter: trainingFocusFilter,
    listOptions,
    sourceOptions: pilotSourceOptions,
    initialTransitionId,
    loadTrainingScenarios: trainingScenarioCatalog.fetch,
    onCommitDraft: commitPilotSessionDraft,
    onRetry: async () => {
      if (sessionResumeError) {
        setTrainingLoadError(null);
        setSessionResumeError(false);
        sessionResumeAttemptedRef.current = false;
        return;
      }
      const recovery = await retryCardLoadFailureAndPersist();
      if (recovery === "skipped") await loadNextWord();
    },
  });
  const { resumeSession } = trainingPilot;

  useEffect(() => {
    if (
      !trainingTodaySetupEnabled ||
      !user?.id ||
      sessionResumeResolved ||
      sessionResumeAttemptedRef.current
    ) {
      return;
    }
    sessionResumeAttemptedRef.current = true;
    const resumeGeneration = sessionResumeGenerationRef.current;
    const resolveResume = async () => {
      const record = readTrainingSessionResume(user.id);
      // An ordinary first visit has no resumable session. Resolve immediately
      // instead of waiting for optional list hydration that may not be
      // available on an empty or fixture-backed setup surface.
      if (!record) {
        if (componentMountedRef.current) setSessionResumeResolved(true);
        return;
      }
      // A saved session must still validate its list against the hydrated
      // catalogue before it can be resumed.
      if (!listHydrated) {
        sessionResumeAttemptedRef.current = false;
        return;
      }
      if (
        record.languageCode !== currentTrainingLanguage ||
        (record.listId !== null &&
          !availableLists.some(
            (list) => list.id === record.listId && list.type === record.listType,
          ))
      ) {
        if (record) clearTrainingSessionResume(user.id);
        if (componentMountedRef.current) setSessionResumeResolved(true);
        return;
      }

      let snapshot: TrainingSessionSnapshot | null;
      try {
        snapshot = await fetchTrainingSessionSnapshot(
          user.id,
          record.sessionId,
        );
      } catch {
        if (
          componentMountedRef.current &&
          sessionResumeGenerationRef.current === resumeGeneration
        ) {
          setSessionResumeError(true);
          setTrainingLoadError("training_resume_failed");
        }
        return;
      }
      if (
        !componentMountedRef.current ||
        sessionResumeGenerationRef.current !== resumeGeneration
      ) {
        return;
      }
      const hasRemainingMember = Boolean(
        snapshot?.members.some(
          (member) => !member.consumedAt && !member.unavailableAt,
        ),
      );
      if (!snapshot || !hasRemainingMember) {
        clearTrainingSessionResume(user.id);
        setSessionResumeResolved(true);
        return;
      }

      if (snapshot.runStatus === "superseded") {
        clearTrainingSessionResume(user.id);
        setCurrentWord(null);
        setTrainingSessionId(null);
        setLatchedSessionPlan(null);
        setSessionPlannedTotal(null);
        setSessionConsumedCardKeys([]);
        setSessionCompletedActions(0);
        setSessionReplacementWarning(true);
        setSessionResumeResolved(true);
        return;
      }

      const activeList = record.listId
        ? availableLists.find(
            (list) => list.id === record.listId && list.type === record.listType,
          )
        : null;
      if (activeList) applyListLocal(activeList);
      // Scope hydration was intentionally deferred while resume was pending.
      // Mark the observed server scope as handled before applying the persisted
      // session context so it cannot trigger a second scope reset afterward.
      if (activeTrainingScope) {
        lastAppliedActiveTrainingScopeRef.current = activeTrainingScope;
      }
      setActiveScenario(record.scenarioId, { persist: false });
      setEnabledModes(record.modes, { persist: false });
      setCardFilterPreference(record.cardFilter, { persist: false });
      setNewReviewRatio(record.newReviewRatio, { persist: false });
      setSessionSize(record.sessionSize);
      setTrainingFocusFilter(record.focusFilter);
      setTrainingSessionId(snapshot.sessionId);
      setLatchedSessionPlan(snapshot);
      setSessionPlannedTotal(snapshot.requestedTotal ?? snapshot.plannedTotal);
      setSessionConsumedCardKeys(
        snapshot.members.filter((member) => member.consumedAt).map(
          (member) => `${member.entryId}:${member.cardTypeId}`,
        ),
      );
      setSessionCompletedActions(
        snapshot.completedActions ??
          snapshot.members.filter((member) => member.consumedAt).length,
      );
      // These refs are initialized from the pre-hydration preferences. Align
      // them with the resumed context so hydration does not trigger a second,
      // unscoped load beside the session-bound request below.
      lastReloadedLanguageModeScopeRef.current =
        `${record.languageCode}|${record.modes.join("|")}`;
      lastAppliedTrainingFocusFilterKey.current = trainingFilterKey(
        record.focusFilter,
      );

      // Claim the initial-load slot before requesting the resumed member so
      // the ordinary loader cannot race and create a different selection.
      initialLoadDone.current = true;
      const result = await loadNextWord({
        scope: { listId: record.listId, listType: record.listType },
        queueTurn: "new",
        scenario: record.scenarioId,
        cardFilter: record.cardFilter,
        focusFilter: record.focusFilter,
        trainingSessionId: snapshot.sessionId,
      });
      if (
        !componentMountedRef.current ||
        sessionResumeGenerationRef.current !== resumeGeneration
      ) {
        return;
      }
      if (result === "loaded") {
        setSessionResumeResolved(true);
        resumeSession();
      } else if (
        result === "error" ||
        result === "statement-timeout" ||
        result === "network-error" ||
        result === "selection-error" ||
        result === "request-cancelled" ||
        result === "skipped"
      ) {
        setSessionResumeError(true);
        setTrainingLoadError("training_resume_failed");
      } else {
        clearTrainingSessionResume(user.id);
        setSessionResumeResolved(true);
      }
    };

    void resolveResume();
  }, [
    activeTrainingScope,
    applyListLocal,
    availableLists,
    componentMountedRef,
    currentTrainingLanguage,
    listHydrated,
    loadNextWord,
    sessionResumeResolved,
    setActiveScenario,
    setCardFilterPreference,
    setEnabledModes,
    setNewReviewRatio,
    setTrainingLoadError,
    setTrainingFocusFilter,
    resumeSession,
    sessionResumeError,
    trainingTodaySetupEnabled,
    user?.id,
  ]);
  const previousTrainingSurfaceRef = useRef(trainingPilot.surface);
  const previousTrainingSessionGenerationRef = useRef(
    trainingPilot.sessionGeneration,
  );
  useEffect(() => {
    const enteredSession =
      previousTrainingSurfaceRef.current !== "session" &&
      trainingPilot.surface === "session";
    const restartedSession =
      trainingPilot.surface === "session" &&
      previousTrainingSessionGenerationRef.current !==
        trainingPilot.sessionGeneration;

    previousTrainingSurfaceRef.current = trainingPilot.surface;
    previousTrainingSessionGenerationRef.current =
      trainingPilot.sessionGeneration;

    // TrainingScreen owns queue reset at explicit session boundaries. The
    // presentation hook only derives progress and must never clear accepted
    // cards when late hydration changes its scope key. Do not cancel a card
    // load from this render-only lifecycle observation.
    if (enteredSession || restartedSession) {
      setPresentationResetKey((key) => key + 1);
    }
  }, [
    trainingPilot.sessionGeneration,
    trainingPilot.surface,
  ]);
  const handleContinueTrainingSession = useCallback(() => {
    resetFocusQueueState();
    setPresentationResetKey((key) => key + 1);
    if (currentWord) {
      const transitionId = createTrainingTransitionId();
      beginTrainingUserTransition(transitionId, "continue");
      registerTrainingEntryTransition(currentWord.id, transitionId);
      markTrainingEntryPresentationStarted(currentWord.id);
    }
    trainingPilot.continueSession();
  }, [currentWord, resetFocusQueueState, trainingPilot]);
  const handleTrainingSessionSuperseded = useCallback(() => {
    sessionAuthorityValidationRef.current += 1;
    sessionResumeGenerationRef.current += 1;
    if (user?.id) clearTrainingSessionResume(user.id);
    resetFocusQueueState();
    setCurrentWord(null);
    setTrainingSessionId(null);
    setLatchedSessionPlan(null);
    setSessionPlannedTotal(null);
    setSessionConsumedCardKeys([]);
    setSessionCompletedActions(0);
    setSessionAuthorityChecking(false);
    resetPlatformProgressActionPending();
    setSessionReplacementWarning(true);
    trainingPilot.returnToToday();
  }, [
    resetFocusQueueState,
    resetPlatformProgressActionPending,
    trainingPilot,
    user?.id,
  ]);
  const validateTrainingSessionAuthority = useCallback(async () => {
    if (!user?.id || !trainingSessionId) return;
    const validation = sessionAuthorityValidationRef.current + 1;
    sessionAuthorityValidationRef.current = validation;
    // Do not allow a visible card to accept a grade while the server checks
    // whether another device deliberately replaced its queue.
    setSessionAuthorityChecking(true);
    try {
      const snapshot = await fetchTrainingSessionSnapshot(
        user.id,
        trainingSessionId,
      );
      if (
        !componentMountedRef.current ||
        sessionAuthorityValidationRef.current !== validation
      ) {
        return;
      }
      if (!snapshot || snapshot.runStatus === "superseded") {
        handleTrainingSessionSuperseded();
        return;
      }
      setSessionAuthorityChecking(false);
    } catch {
      // No offline grade queue in this slice. Keep the card non-actionable
      // until a later focus/reconnect check reaches the server.
      if (
        componentMountedRef.current &&
        sessionAuthorityValidationRef.current === validation
      ) {
        setSessionAuthorityChecking(true);
      }
    }
  }, [
    componentMountedRef,
    handleTrainingSessionSuperseded,
    trainingSessionId,
    user?.id,
  ]);
  useEffect(() => {
    if (!trainingSessionId) {
      setSessionAuthorityChecking(false);
      return;
    }
    const onReturn = () => void validateTrainingSessionAuthority();
    const onVisibilityChange = () => {
      if (!document.hidden) onReturn();
    };
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    window.addEventListener("pageshow", onReturn);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const unsubscribeInvalidation = subscribeTrainingSessionInvalidation(
      user.id,
      () => void validateTrainingSessionAuthority(),
    );
    return () => {
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("online", onReturn);
      window.removeEventListener("pageshow", onReturn);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unsubscribeInvalidation();
    };
  }, [trainingSessionId, user.id, validateTrainingSessionAuthority]);
  useEffect(() => {
    if (!trainingSessionId || destination !== "training") return;
    const pollId = window.setInterval(() => {
      if (document.hidden) return;
      void validateTrainingSessionAuthority();
    }, TRAINING_SESSION_AUTHORITY_POLL_MS);
    return () => window.clearInterval(pollId);
  }, [destination, trainingSessionId, validateTrainingSessionAuthority]);
  const exitUnsupportedTrainingMode = useCallback(() => {
    setCurrentWord(null);
    trainingPilot.returnToToday();
  }, [trainingPilot]);
  const trainingSessionPlanScope = React.useMemo(
    () => ({
      listId: wordListId,
      ...(wordListType ? { listType: wordListType } : {}),
      cardFilter,
      trainingFilter: trainingFocusFilter,
      sessionSize,
    }),
    [cardFilter, sessionSize, trainingFocusFilter, wordListId, wordListType],
  );
  const {
    scopeKey: trainingSessionPlanScopeKey,
    snapshot: trainingSessionPlanSnapshot,
  } = useAuthoritativeTrainingSessionPlan({
    active:
      Boolean(trainingTodaySetupEnabled) && trainingPilot.surface === "session",
    sessionGeneration: trainingPilot.sessionGeneration,
    userId: user.id,
    modes: enabledModes,
    scope: trainingSessionPlanScope,
  });
  useEffect(() => {
    if (trainingSessionPlanSnapshot && !trainingSessionId && !latchedSessionPlan) {
      setSessionPlannedTotal(
        trainingSessionPlanSnapshot.plan.requestedTotal ??
          trainingSessionPlanSnapshot.plan.plannedTotal,
      );
    }
  }, [latchedSessionPlan, trainingSessionId, trainingSessionPlanSnapshot]);
  const {
    presentation: sessionPresentation,
    isSubsequentCard: isSubsequentSessionCard,
  } = useTrainingSessionPresentation({
    surface: trainingPilot.surface,
    presentedCardKey: currentWord
      ? getTrainingCardKey(currentWord, currentMode)
      : null,
    consumedCardCount: sessionCompletedActions,
    sessionGeneration: trainingPilot.sessionGeneration,
    scopeKey: trainingSessionPlanScopeKey,
    planSnapshot: trainingSessionPlanSnapshot,
    planOverride: latchedSessionPlan,
    resetKey: presentationResetKey,
  });

  const openTrainingHistory = useCallback(() => {
    onRequestDestination(TRAINING_HISTORY_DESTINATION);
  }, [onRequestDestination]);

  const v2SessionLayoutVisible = Boolean(
    v2SessionOwned &&
    (!trainingTodaySetupEnabled || trainingPilot.surface === "session"),
  );
  const sessionChromeVisible =
    trainingTodaySetupEnabled && trainingPilot.surface === "session";
  const sessionChrome = sessionChromeVisible
    ? {
        interfaceLanguage: onboardingLang,
        scenario: activeScenario,
        mode: currentMode,
        cardFilter,
        presentation: sessionPresentation,
        onHistory: openTrainingHistory,
        historyButtonRef,
        onClose: trainingPilot.returnToToday,
        disabled: navigationBlocked,
      }
    : null;
  const trainingSessionChrome = sessionChrome;
  const trainingSessionFooter: FooterStatsProps = {
    stats,
    cardFilter,
    onCardFilterChange: handleCardFilterChange,
    language: currentTrainingLanguage,
    onLanguageChange: handleTrainingLanguageChange,
    languageOptions: trainingLanguageOptions,
    activeList,
    activeListName: wordListLabel,
    activeListValue,
    listOptions,
    onListChange: handleFooterListChange,
    onOpenSettings: openAppSettings,
    activeScenarioName: trainingScenarioLabel("nl", activeScenario),
    initialReviewDue,
    inlineControlsEnabled: !trainingTodaySetupEnabled,
    compact: v2SessionOwned,
    interfaceLanguage: onboardingLang,
  };
  const trainingSessionNotice: TrainingSessionNoticeInput | null =
    acceptedTransitionLoadStalled
      ? {
          kind: "error",
          message: platformV2Message(
            onboardingLang,
            "senseCard.training.temporaryFailure",
          ),
          retryLabel: platformV2Message(
            onboardingLang,
            "senseCard.training.retry",
          ),
          retryDisabled: actionLoading,
          onRetry: () => void retryAcceptedTransitionLoadAndPersist(),
        }
      : nextCardOverrideNotice
        ? { kind: "status", message: nextCardOverrideNotice }
        : null;
  return (
    <AppFrame
      activeDestination={destination}
      interfaceLanguage={onboardingLang}
      themePreference={themePreference}
      settingsActive={destination === "settings"}
      navigationDisabled={navigationBlocked}
      onNavigate={onRequestDestination}
      onCycleTheme={cycleThemePreference}
      onOpenSettings={openAppSettings}
    >
      <div
        data-training-session-layout={v2SessionLayoutVisible ? "v2" : undefined}
        aria-hidden={destination !== "training"}
        data-training-today-setup={
          trainingTodaySetupEnabled ? "enabled" : "disabled"
        }
        data-training-pilot-surface={trainingPilot.surface}
        className={`${destination === "training" ? "flex" : "hidden"} h-full min-h-0 flex-col overflow-hidden bg-transparent text-slate-900 dark:text-slate-100 ${
          v2SessionLayoutVisible
            ? `font-sense-sans ${sessionStyles.viewport}`
            : "dark:bg-background-dark"
        }`}
      >
        {trainingTodaySetupEnabled && trainingPilot.surface !== "session" ? (
          <TrainingTodaySetup
            interfaceLanguage={onboardingLang}
            status={trainingPilot.status}
            initialDraft={trainingPilot.initialDraft}
            stats={stats}
            scenarios={trainingPilot.scenarioOptions}
            lists={listOptions}
            sources={trainingPilot.sourceOptions}
            startPending={trainingPilot.startPending}
            scenarioLoading={trainingPilot.scenarioLoading}
            replacementWarning={sessionReplacementWarning}
            activeSessionLabel={wordListLabel || undefined}
            onContinue={handleContinueTrainingSession}
            onStart={trainingPilot.startSession}
            onRetry={() => void trainingPilot.retry()}
          />
        ) : v2SessionOwned && currentWord && v2SessionMode ? (
          <TrainingSenseCardV2Session
            key={
              currentPresentationIdentity ??
              `${user.id}:${currentWord.id}:${currentMode}`
            }
            cacheOwnerId={user.id}
            nextTransitionId={nextTransitionId ?? undefined}
            presentationIdentity={currentPresentationIdentity}
            word={currentWord}
            mode={v2SessionMode}
            contentLanguageCode={currentTrainingLanguage}
            translationTargetLanguageCode={
              translationLang === "off" ? null : translationLang
            }
            interfaceLanguage={onboardingLang}
            trainingSessionId={trainingSessionId}
            sessionChrome={trainingSessionChrome}
            sessionFooter={trainingSessionFooter}
            sessionNotice={trainingSessionNotice}
            interactionDisabled={
              navigationBlocked ||
              acceptedTransitionLoadStalled ||
              sessionAuthorityChecking
            }
            focusOnPresentation={isSubsequentSessionCard}
            onPlayResolvedAudio={(url, label) => playAudio(url, label)}
            onOpenDetails={handleShowCurrentWordDetails}
            onProgressActionAccepted={handleV2ProgressActionAccepted}
            onProgressActionStarting={prepareV2ProgressAction}
            onProgressActionPendingChange={
              handlePlatformProgressActionPendingChange
            }
            onTrainingSessionSuperseded={handleTrainingSessionSuperseded}
            onLoadFailure={(failure) => {
              reportCardLoadFailure(currentWord, failure);
            }}
            onRetryAlternative={() => {
              void retryCardLoadFailureAndPersist();
            }}
            onExit={trainingPilot.returnToToday}
          />
        ) : (
          <TrainingSessionSurface
            phase={
              currentWord && !v2SessionMode
                ? "failure"
                : usableCandidatesExhausted
                  ? "failure"
                  : "loading"
            }
            chrome={trainingSessionChrome}
            footer={trainingSessionFooter}
            notice={trainingSessionNotice}
          >
            {currentWord && !v2SessionMode ? (
              <TrainingUnsupportedMode
                interfaceLanguage={onboardingLang}
                onExit={exitUnsupportedTrainingMode}
              />
            ) : usableCandidatesExhausted ? (
              <TrainingUsableCandidatesExhausted
                interfaceLanguage={onboardingLang}
                onExit={trainingPilot.returnToToday}
              />
            ) : (
              <div
                role="status"
                data-testid="training-v2-loading"
                data-training-renderer="v2"
                data-training-v2-state="loading"
                className="mx-auto grid h-full min-h-0 w-full max-w-[760px] flex-1 place-items-center rounded-3xl border border-slate-300 bg-slate-50 px-6 text-sm font-medium text-slate-600 dark:border-slate-600 dark:bg-[#1d222b] dark:text-slate-300"
              >
                {platformV2Message(
                  onboardingLang,
                  "senseCard.training.loading",
                )}
              </div>
            )}
          </TrainingSessionSurface>
        )}
        <TrainingKnownUndoNotice
          interfaceLanguage={onboardingLang}
          currentPresentationIdentity={currentPresentationIdentity}
        />

        <TrainingDetailsDrawer
          interfaceLanguage={onboardingLang}
          open={detailsOpen}
          onClose={() => {
            setDetailsOpen(false);
            setDetailSelection(null);
            setDetailInitialGroup(null);
          }}
        >
          {detailSelection ? (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="min-h-0 flex-1">
                <TrainingMoreSenseCardV2Session
                  entryId={detailSelection.entryId}
                  initialGroup={detailInitialGroup ?? undefined}
                  headword={detailSelection.headword}
                  contentLanguageCode={
                    detailSelection.contentLanguageCode ??
                    currentTrainingLanguage
                  }
                  translationTargetLanguageCode={
                    translationLang === "off" ? null : translationLang
                  }
                  interfaceLanguage={onboardingLang}
                  userId={user.id}
                  userLists={availableLists.filter(
                    (list) => list.type === "user",
                  )}
                  onListsUpdated={handleListsUpdated}
                  onTrainWord={handleTrainWord}
                />
              </div>
            </div>
          ) : null}
        </TrainingDetailsDrawer>

        {/* Language Selection Modal */}
        <LanguageSelectionModal
          open={showLanguageSelection}
          onSelectLanguage={handleLanguageSelect}
        />

        {/* Onboarding Tour */}
        <Joyride
          steps={buildJoyrideSteps(onboardingLang)}
          run={runTour}
          continuous
          showProgress
          showSkipButton
          callback={handleJoyrideCallback}
          locale={getOnboardingTranslation(onboardingLang).onboarding.buttons}
          styles={{
            options: {
              primaryColor: "#3b82f6",
              zIndex: 10000,
              backgroundColor: isDarkMode ? "#1e293b" : "#ffffff",
              textColor: isDarkMode ? "#e2e8f0" : "#1f2937",
              arrowColor: isDarkMode ? "#1e293b" : "#ffffff",
            },
            tooltip: {
              backgroundColor: isDarkMode ? "#1e293b" : "#ffffff",
              color: isDarkMode ? "#e2e8f0" : "#1f2937",
              borderRadius: 8,
            },
            tooltipTitle: {
              color: isDarkMode ? "#f1f5f9" : "#111827",
            },
            tooltipContent: {
              color: isDarkMode ? "#e2e8f0" : "#374151",
            },
            buttonNext: {
              backgroundColor: "#3b82f6",
              color: "#ffffff",
            },
            buttonBack: {
              color: isDarkMode ? "#94a3b8" : "#6b7280",
            },
            buttonSkip: {
              color: isDarkMode ? "#94a3b8" : "#6b7280",
            },
          }}
        />
      </div>
      {showHotkeys && (
        <HotkeyDialog
          interfaceLanguage={onboardingLang}
          onClose={() => setShowHotkeys(false)}
        />
      )}
      <LibraryDestination
        open={destination === "library"}
        userId={user.id}
        language={currentTrainingLanguage}
        translationLang={translationLang}
        interfaceLanguage={onboardingLang}
        lists={availableLists}
        activeList={activeList ?? null}
        onReloadLists={handleListsUpdated}
        onUserDictionaryEntryCreated={handleUserDictionaryEntryCreated}
        onTrainWord={(wordId) => {
          handleTrainWord(wordId);
          onRequestDestination("training");
        }}
      />
      <StatisticsDestination
        open={destination === "statistics"}
        interfaceLanguage={onboardingLang}
        stats={stats}
        onStartTraining={() => onRequestDestination("training")}
      />
      {destination === TRAINING_HISTORY_DESTINATION ? (
        <LazyTrainingHistoryDestination
          open
          userId={user.id}
          interfaceLanguage={onboardingLang}
          onReturnToTraining={
            onReturnFromHistory ?? (() => onRequestDestination("training"))
          }
        />
      ) : null}
      <SettingsDestination
        open={destination === "settings"}
        interfaceLanguage={onboardingLang}
        themePreference={themePreference}
        translationLanguage={translationLang}
        onThemeChange={setTheme}
        onInterfaceLanguageChange={saveOnboardingLanguageChoice}
        onTranslationLanguageChange={setTranslationLang}
        userEmail={user.email ?? ""}
        onSignOut={handleSignOut}
      />
    </AppFrame>
  );
}
