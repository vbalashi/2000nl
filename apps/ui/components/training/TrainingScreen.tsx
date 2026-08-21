"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Joyride, { Step } from "react-joyride";
import { supabase } from "@/lib/supabaseClient";
import { trainingDebug } from "@/lib/trainingDebug";
import {
  createTrainingScenarioCatalog,
  fetchDictionaryEntry,
  fetchAvailableLearningLanguages,
  fetchTrainingFilterSources,
  fetchStats,
  isTrainingFocusFilterActive,
  updateActiveTrainingScope,
  type ReviewResult,
  type TrainingScenarioCatalog,
} from "@/lib/trainingService";
import type {
  ActiveTrainingScope,
  CardFilter,
  DetailedStats,
  DictionaryEntry,
  EntryLearningListMembership,
  TrainingFocusFilter,
  TrainingFilterSource,
  TrainingMode,
  TrainingWord,
  WordListSummary,
  WordListType,
} from "@/lib/types";
import { BrandLogo } from "@/components/BrandLogo";
import { useCardParams } from "@/lib/cardParams";
import {
  useTrainingPreferences,
  type ThemePreference,
} from "@/lib/training/useTrainingPreferences";
import { useTrainingAudio } from "@/lib/training/useTrainingAudio";
import { useTrainingOnboarding } from "@/lib/training/useTrainingOnboarding";
import { useTrainingActiveList } from "@/lib/training/useTrainingActiveList";
import { TrainingCard } from "./TrainingCard";
import {
  TrainingKnownUndoNotice,
  TrainingSenseCardV2Session,
} from "./v2/TrainingSenseCardV2Session";
import { TrainingUsableCandidatesExhausted } from "./v2/TrainingUsableCandidatesExhausted";
import {
  TrainingSessionChrome,
} from "./v2/TrainingSessionChrome";
import { trainingScenarioLabel } from "./v2/trainingSessionLabels";
import { useTrainingSessionPresentation } from "./v2/useTrainingSessionPresentation";
import { useAuthoritativeTrainingSessionPlan } from "./v2/useTrainingSessionPlan";
import { platformV2TrainingUiEnabled } from "@/lib/platform/platformV2Rollout";
import { useTrainingTurnSelectionPort } from "./useTrainingTurnSelectionPort";
import { useLegacyTrainingReviewPort } from "./useLegacyTrainingReviewPort";
import { useTrainingTurnController } from "./useTrainingTurnController";
import { getTrainingCardKey } from "@/lib/training/trainingQueue";
import { projectTrainingCardPresentation } from "@/lib/training/trainingCardPresentation";
import { FirstTimeButtonGroup } from "./FirstTimeButtonGroup";
import { TrainingDetailsDrawer } from "./TrainingDetailsDrawer";
import { WordDetailPanel } from "./WordDetailPanel";
import { FooterStats } from "./FooterStats";
import { HotkeyDialog } from "./HotkeyDialog";
import { areTrainingHotkeysSuspended } from "./trainingHotkeys";
import { SettingsModal } from "./SettingsModal";
import { LanguageSelectionModal } from "./LanguageSelectionModal";
import {
  AppDestinationNav,
  MobileAppDestinationNav,
} from "@/components/navigation/AppDestinationNav";
import {
  AppUtilityNav,
  type AppUtilityNavProps,
} from "@/components/navigation/AppUtilityNav";
import { LibraryDestination } from "@/components/navigation/LibraryDestination";
import { SettingsDestination } from "@/components/navigation/SettingsDestination";
import { StatisticsDestination } from "@/components/navigation/StatisticsDestination";
import {
  TrainingTodaySetup,
  type TrainingSetupDraft,
} from "./pilot/TrainingTodaySetup";
import {
  useCommitTrainingPilotDraft,
  useTrainingPilotController,
} from "./pilot/useTrainingPilotController";
import type { AppDestination } from "@/components/navigation/appDestination";
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

type Props = {
  user: User;
  initialTransitionId?: string;
  destination?: AppDestination;
  extendedDestinationsEnabled?: boolean;
  onRequestDestination?: (destination: AppDestination) => void;
  onNavigationBlockedChange?: (blocked: boolean) => void;
  trainingTodaySetupEnabled?: boolean;
};

const ACTION_LABELS: Record<
  ReviewResult,
  {
    label: string;
    keyHint: string;
    tone: "fail" | "hard" | "success" | "easy" | "neutral";
  }
> = {
  fail: { label: "Opnieuw", keyHint: "H", tone: "fail" },
  hard: { label: "Moeilijk", keyHint: "J", tone: "hard" },
  success: { label: "Goed", keyHint: "K", tone: "success" },
  easy: { label: "Makkelijk", keyHint: "L", tone: "easy" },
  freeze: { label: "Bevriezen", keyHint: "F", tone: "neutral" },
  hide: { label: "Niet meer tonen", keyHint: "X", tone: "neutral" },
};

const buttonStyles: Record<
  "fail" | "hard" | "success" | "easy" | "neutral",
  string
> = {
  fail: "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/45",
  hard: "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/45",
  success:
    "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/45",
  easy: "bg-green-200 text-green-800 hover:bg-green-300 dark:bg-green-900/40 dark:text-green-200 dark:hover:bg-green-900/55",
  neutral:
    "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900/70",
};

const swipeIndicatorStyles: Record<"left" | "right", string> = {
  left: "border-red-200/70 bg-red-100/80 text-red-700 dark:border-red-900/40 dark:bg-red-900/40 dark:text-red-200",
  right:
    "border-emerald-200/70 bg-emerald-100/80 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/40 dark:text-emerald-200",
};

const mobileActionOrder: Partial<Record<ReviewResult, string>> = {
  fail: "order-1 md:order-1",
  success: "order-2 md:order-3",
  hard: "order-3 md:order-2",
  easy: "order-4 md:order-4",
};

const DEFAULT_LANGUAGE_OPTIONS = [{ value: "nl", label: "Nederlands" }];

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

const dictionaryLookupNotice = (
  language: OnboardingLanguage,
  word: string,
) =>
  ({
    nl: `Geen woordenboekvermelding gevonden voor “${word}”.`,
    en: `No dictionary entry found for “${word}”.`,
    ru: `Словарная статья для «${word}» не найдена.`,
  })[language];

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

export function TrainingScreen({
  user,
  initialTransitionId,
  destination = "training",
  extendedDestinationsEnabled = process.env
    .NEXT_PUBLIC_SETTINGS_STATISTICS_DESTINATIONS_V1 === "true",
  onRequestDestination,
  onNavigationBlockedChange,
  trainingTodaySetupEnabled = process.env
    .NEXT_PUBLIC_TRAINING_TODAY_SETUP_V1 === "true",
}: Props) {
  const trainingScenarioCatalogRef = useRef<TrainingScenarioCatalog | null>(null);
  if (!trainingScenarioCatalogRef.current) {
    trainingScenarioCatalogRef.current = createTrainingScenarioCatalog();
  }
  const trainingScenarioCatalog = trainingScenarioCatalogRef.current;
  const { wordId, devMode, firstEncounter } = useCardParams();
  const [revealed, setRevealed] = useState(false);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [translationTooltipOpen, setTranslationTooltipOpen] = useState(false);
  const [currentWord, setCurrentWord] = useState<TrainingWord | null>(null);
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
    setAudioQuality,
    setCardFilter: setCardFilterPreference,
    setEnabledModes,
    setLanguage,
    setNewReviewRatio,
    setTheme,
    setTranslationLang,
  } = useTrainingPreferences(user?.id, initialTransitionId);
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

  const [selectedEntry, setSelectedEntry] = useState<DictionaryEntry | null>(
    null,
  );
  const [trainingFocusFilter, setTrainingFocusFilter] =
    useState<TrainingFocusFilter>(DEFAULT_TRAINING_FOCUS_FILTER);
  const [trainingFilterSources, setTrainingFilterSources] = useState<
    TrainingFilterSource[]
  >([]);
  const [wordLookupNotice, setWordLookupNotice] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<DictionaryEntry | null>(null);
  const [stats, setStats] = useState<DetailedStats>({
    newWordsToday: 0,
    newCardsToday: 0,
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
  const showFirstTimeButtons = currentWord?.isFirstEncounter === true;
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    "zoeken" | "lijsten" | "statistieken" | "instellingen"
  >("instellingen");
  const [settingsInitialViewedListScope, setSettingsInitialViewedListScope] =
    useState<{ id: string; type: WordListType } | null>(null);
  const [settingsAutoFocusWordSearch, setSettingsAutoFocusWordSearch] =
    useState(false);
  const {
    audioModeEnabled,
    playAudio,
    playSentenceTTS,
    preloadAudioForWord,
    resolveAudioUrl,
    setAudioModeEnabled,
    ttsLoading,
  } = useTrainingAudio(audioQuality);
  const cardSwipeRef = useRef<HTMLDivElement | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeTrackingRef = useRef(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(
    null,
  );
  const [swipeAnimating, setSwipeAnimating] = useState(false);
  const [swipeActive, setSwipeActive] = useState(false);

  const {
    handleJoyrideCallback,
    handleLanguageSelect,
    isDarkMode,
    onboardingLang,
    runTour,
    saveOnboardingLanguageChoice,
    showLanguageSelection,
    startOnboarding,
  } = useTrainingOnboarding({
    userId: user?.id,
    translationLang,
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

  const toggleHint = useCallback(() => {
    setHintRevealed((prev) => !prev);
  }, []);

  const trainingFocusFilterActive =
    isTrainingFocusFilterActive(trainingFocusFilter);
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
    showSettings,
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
  const autoPlayedAudioCardRef = useRef<string | null>(null);
  const lastReloadedLanguageModeScopeRef = useRef(
    `${currentTrainingLanguage}|${enabledModesKey}`,
  );

  // Get the current mode for the active card (from the card itself, or fallback to first enabled mode)
  const currentMode: TrainingMode =
    currentWord?.mode ?? enabledModes[0] ?? "word-to-definition";
  const trainingShellV2Enabled = platformV2TrainingUiEnabled();
  const trainingSessionV2Enabled =
    trainingShellV2Enabled &&
    (currentMode === "word-to-definition" ||
      currentMode === "definition-to-word");
  const v2SessionOwned = Boolean(trainingSessionV2Enabled && currentWord);

  useEffect(() => {
    if (!currentWord || currentMode !== "listen-recognize") {
      autoPlayedAudioCardRef.current = null;
      return;
    }

    const cardKey = getTrainingCardKey(currentWord, currentMode);
    if (autoPlayedAudioCardRef.current === cardKey) return;
    autoPlayedAudioCardRef.current = cardKey;

    const audioUrl = resolveAudioUrl(currentWord.raw);
    if (audioUrl) {
      playAudio(audioUrl, currentWord.headword);
    }
  }, [currentMode, currentWord, playAudio, resolveAudioUrl]);

  const revealAnswer = useCallback(() => {
    setTranslationTooltipOpen(false);
    setRevealed(true);
  }, []);

  const resetSwipe = useCallback(() => {
    swipeStartRef.current = null;
    swipeTrackingRef.current = false;
    setSwipeOffset(0);
    setSwipeDirection(null);
    setSwipeAnimating(false);
    setSwipeActive(false);
  }, []);

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
    resolveScenarioModes: trainingScenarioCatalog.resolveModes,
  });
  const reviewLegacy = useLegacyTrainingReviewPort({
    userId: user.id,
    stats,
  });
  const resetCardPresentation = useCallback(() => {
    setRevealed(false);
    setHintRevealed(false);
  }, []);
  const refreshAfterAccepted = useCallback(
    async ({ statsLabel }: { statsLabel: string }) => {
      await loadStats(undefined, statsLabel);
    },
    [loadStats],
  );
  const sessionScopeKey = [
    activeScenario,
    currentTrainingLanguage,
    enabledModesKey,
    trainingFocusFilterKey,
    wordListId ?? "",
    wordListType ?? "",
  ].join("|");
  const {
    loadingWord,
    actionLoading,
    loadError: trainingLoadError,
    usableCandidatesExhausted,
    reportLoadError: setTrainingLoadError,
    reportCardLoadFailure,
    retryCardLoadFailure,
    nextTransitionId,
    currentPresentationId,
    nextCardOverrideNotice,
    loadNextWord,
    beginSessionScopeChange: beginTrainingTurnScopeChange,
    replaceSessionScopeAndLoad,
    requestNextCardOverride,
    resetFocusQueue,
    resetQueueForFilter,
    clearReviewedSession,
    submitLegacyReview: handleAction,
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
    firstEncounter,
    trainingShellV2Enabled,
    recoverLoadErrors: trainingTodaySetupEnabled,
    focusFilter: trainingFocusFilter,
    sessionScopeKey,
    selection: selectionPort,
    audioEnabled: audioModeEnabled,
    preloadAudio: preloadAudioForWord,
    resetCardPresentation,
    reviewLegacy,
    refreshAfterAccepted,
  });
  const currentPresentationIdentity =
    currentWord && currentPresentationId
      ? `${currentPresentationId}:${currentWord.id}:${currentMode}`
      : null;
  const beginSessionScopeChange = useCallback(() => {
    trainingScenarioCatalog.invalidate();
    beginTrainingTurnScopeChange();
  }, [beginTrainingTurnScopeChange, trainingScenarioCatalog]);

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
  }, [
    beginSessionScopeChange,
    currentTrainingLanguage,
    language,
  ]);

  useEffect(() => {
    if (!activeTrainingScope) return;
    if (lastAppliedActiveTrainingScopeRef.current === activeTrainingScope) return;
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
      setCardFilterPreference(activeTrainingScope.cardFilter, { persist: false });
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
  }, [currentTrainingLanguage, enabledModesKey, listHydrated, loadNextWord]);

  useEffect(() => {
    onNavigationBlockedChange?.(actionLoading);
    return () => onNavigationBlockedChange?.(false);
  }, [actionLoading, onNavigationBlockedChange]);

  const setCardFilter = useCallback(
    (newFilter: CardFilter) => {
      setCardFilterPreference(newFilter, { persist: false });
      persistCurrentTrainingScope({ cardFilter: newFilter });
      resetQueueForFilter(newFilter);
    },
    [persistCurrentTrainingScope, resetQueueForFilter, setCardFilterPreference],
  );

  const resetFocusQueueState = useCallback(() => {
    resetFocusQueue();
  }, [resetFocusQueue]);

  const handleTrainingDateWindowChange = useCallback(
    (value: string) => {
      resetFocusQueueState();
      setTrainingFocusFilter((current) => ({
        ...current,
        dateWindow:
          value === "today" || value === "yesterday" || value === "daysAgo"
            ? value
            : "all",
        ...(value === "daysAgo"
          ? { daysAgo: current.daysAgo ?? 7 }
          : { daysAgo: undefined }),
      }));
    },
    [resetFocusQueueState],
  );

  const handleTrainingDaysAgoChange = useCallback(
    (value: string) => {
      resetFocusQueueState();
      const daysAgo = Math.max(0, Math.min(365, Number(value) || 0));
      setTrainingFocusFilter((current) => ({
        ...current,
        dateWindow: "daysAgo",
        daysAgo,
      }));
    },
    [resetFocusQueueState],
  );

  const handleTrainingSourceFilterChange = useCallback(
    (value: string) => {
      resetFocusQueueState();
      setTrainingFocusFilter((current) => {
        if (value === "all") {
          return {
            ...current,
            sourceId: undefined,
            sourceKind: undefined,
            externalId: undefined,
          };
        }
        if (value === "kind:youtube") {
          return {
            ...current,
            sourceId: undefined,
            sourceKind: "youtube",
            externalId: undefined,
          };
        }
        if (value.startsWith("source:")) {
          return {
            ...current,
            sourceId: value.slice("source:".length),
            sourceKind: undefined,
            externalId: undefined,
          };
        }
        return current;
      });
    },
    [resetFocusQueueState],
  );

  const clearTrainingFocusFilter = useCallback(() => {
    resetFocusQueueState();
    setTrainingFocusFilter(DEFAULT_TRAINING_FOCUS_FILTER);
  }, [resetFocusQueueState]);

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
      setShowSettings(false);
      void loadNextWord({
        excludeWordIds: [currentWord?.id].filter((x): x is string =>
          Boolean(x),
        ),
      });
    },
    [currentWord?.id, loadNextWord, requestNextCardOverride],
  );

  // ... (keep useEffect for initial load)

  const handleFirstTimeStart = useCallback(() => {
    void handleAction("fail");
  }, [handleAction]);

  const handleFirstTimeAlreadyKnow = useCallback(() => {
    void handleAction("hide");
  }, [handleAction]);

  useEffect(() => {
    // New card => close translation overlay.
    setTranslationTooltipOpen(false);
  }, [currentWord?.id]);

  useEffect(() => {
    const awaitingDefaultScenario = Boolean(
      activeList?.default_scenario_id &&
        !activeTrainingScope?.hasSavedScope &&
        activeScenario !== activeList.default_scenario_id,
    );
    if (!user?.id || !listHydrated || awaitingDefaultScenario) {
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
    wordId,
  ]);

  useEffect(() => {
    if (!user?.id || !listHydrated || !initialLoadDone.current) {
      return;
    }
    if (lastAppliedTrainingFocusFilterKey.current === trainingFocusFilterKey) {
      return;
    }
    lastAppliedTrainingFocusFilterKey.current = trainingFocusFilterKey;
    void loadNextWord();
  }, [listHydrated, loadNextWord, trainingFocusFilterKey, user?.id]);

  const handleShowDetails = useCallback((entry: DictionaryEntry) => {
    setDetailEntry(entry);
    setDetailsOpen(true);
  }, []);

  // Show details for the current training word
  const handleShowCurrentWordDetails = useCallback(() => {
    if (!currentWord) return;
    // Convert TrainingWord to DictionaryEntry
    const entry: DictionaryEntry = {
      id: currentWord.id,
      headword: currentWord.headword,
      part_of_speech: currentWord.part_of_speech,
      gender: currentWord.gender,
      raw: currentWord.raw,
      is_nt2_2000: currentWord.is_nt2_2000,
      meanings_count: currentWord.meanings_count,
    };
    handleShowDetails(entry);
  }, [currentWord, handleShowDetails]);

  const openSearch = useCallback(() => {
    if (onRequestDestination) {
      if (!actionLoading) {
        onRequestDestination("library");
      }
      return;
    }
    setSettingsInitialTab("zoeken");
    setSettingsInitialViewedListScope(null);
    setSettingsAutoFocusWordSearch(true);
    setShowSettings(true);
  }, [actionLoading, onRequestDestination]);

  const openAppSettings = useCallback(() => {
    if (extendedDestinationsEnabled && onRequestDestination) {
      if (!actionLoading) {
        onRequestDestination("settings");
      }
      return;
    }
    setSettingsInitialTab("instellingen");
    setSettingsInitialViewedListScope(null);
    setSettingsAutoFocusWordSearch(false);
    setShowSettings(true);
  }, [actionLoading, extendedDestinationsEnabled, onRequestDestination]);

  const openMembershipList = useCallback(
    (membership: EntryLearningListMembership) => {
      setSettingsInitialTab("lijsten");
      setSettingsInitialViewedListScope({
        id: membership.listId,
        type: membership.listType,
      });
      setSettingsAutoFocusWordSearch(false);
      setShowSettings(true);
    },
    [],
  );

  const handleUserDictionaryEntryCreated = useCallback(
    (entry: DictionaryEntry) => {
      setDetailEntry(entry);
      setSelectedEntry(entry);
    },
    [],
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (areTrainingHotkeysSuspended()) return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (actionLoading) return;

      const normalized = event.key.toLowerCase();

      if (
        v2SessionOwned &&
        (normalized === "t" ||
          normalized === "h" ||
          normalized === "j" ||
          normalized === "k" ||
          normalized === "l" ||
          normalized === "f" ||
          normalized === "x" ||
          (normalized === "i" && !event.shiftKey) ||
          event.key === " ")
      ) {
        return;
      }

      if (normalized === "t") {
        if (!revealed) return;
        event.preventDefault();
        setTranslationTooltipOpen((prev) => !prev);
        return;
      }

      // Arrow keys should not close translation overlay (they're used for scrolling)
      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight"
      ) {
        return;
      }

      if (normalized === "s") {
        event.preventDefault();
        openSearch();
        return;
      }

      if (normalized === "h") {
        void handleAction("fail"); // Again
      } else if (normalized === "j") {
        void handleAction("hard"); // Hard
      } else if (normalized === "k") {
        void handleAction("success"); // Good
      } else if (normalized === "l") {
        void handleAction("easy"); // Easy
      } else if (normalized === "f") {
        void handleAction("freeze");
      } else if (normalized === "x") {
        void handleAction("hide");
      } else if (normalized === "?") {
        setShowHotkeys(true);
      } else if (event.key === "I" && event.shiftKey) {
        // Shift+I: Open the current word's details drawer.
        event.preventDefault();
        handleShowCurrentWordDetails();
      } else if (normalized === "i") {
        // Lowercase i: Toggle hint for W->D mode (shows context + example)
        toggleHint();
      } else if (normalized === " ") {
        // Space key toggles reveal
        event.preventDefault();
        setRevealed((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    actionLoading,
    handleAction,
    handleShowCurrentWordDetails,
    openSearch,
    revealed,
    toggleHint,
    v2SessionOwned,
  ]);

  const handleDefinitionClick = useCallback(
    async (clickedWord: string) => {
      trainingDebug.log("🔍 Word clicked:", clickedWord);
      setTranslationTooltipOpen(false);

      if (!user?.id) {
        trainingDebug.log("❌ No user ID");
        return;
      }

      // 1. Try exact match
      const entry = await fetchDictionaryEntry(clickedWord, user.id);

      if (!entry) {
        trainingDebug.log("No dictionary entry found for:", clickedWord);
        setWordLookupNotice(
          dictionaryLookupNotice(onboardingLang, clickedWord),
        );

        return;
      }

      trainingDebug.log("✅ Found entry:", entry.headword);
      setWordLookupNotice(null);
      setSelectedEntry(entry);
      handleShowDetails(entry);
    },
    [handleShowDetails, onboardingLang, user?.id],
  );

  const handleTrainingWordClick = useCallback(
    async (
      clickedWord: string,
      options?: { forceAudio?: boolean; sentence?: string },
    ) => {
      // Headword always plays audio (forceAudio is set for headword clicks)
      const isHeadwordClick = options?.forceAudio;

      // For non-headword clicks: audio mode ON = play sentence TTS, audio mode OFF = show translation
      if (!isHeadwordClick && !audioModeEnabled) {
        await handleDefinitionClick(clickedWord);
        return;
      }

      // If clicking a word in a sentence context AND audio mode is enabled, play sentence TTS
      if (!isHeadwordClick && options?.sentence && audioModeEnabled) {
        await playSentenceTTS(options.sentence);
        return;
      }

      // Otherwise, play word audio (headword or clicked word)
      let audioUrl: string | undefined;
      if (
        currentWord &&
        clickedWord.toLowerCase() === currentWord.headword.toLowerCase()
      ) {
        audioUrl = resolveAudioUrl(currentWord.raw);
      }

      if (!audioUrl) {
        if (!user?.id) {
          console.error("[Audio] Missing user id for:", clickedWord);
          return;
        }

        const entry = await fetchDictionaryEntry(clickedWord, user.id);
        audioUrl = resolveAudioUrl(entry?.raw ?? null);
      }

      if (!audioUrl) {
        console.error("[Audio] No audio link available for:", clickedWord);
        return;
      }

      playAudio(audioUrl, clickedWord);
    },
    [
      audioModeEnabled,
      currentWord,
      handleDefinitionClick,
      playAudio,
      playSentenceTTS,
      resolveAudioUrl,
      user?.id,
    ],
  );

  const handleMakeActiveTrainingList = useCallback(
    async (list: WordListSummary) => {
      const nextScenario = list.default_scenario_id ?? activeScenario;
      beginSessionScopeChange();
      const scope = await persistListChange(list, {
        activeScenario: nextScenario,
      });
      if (!scope) return;
      setActiveScenario(nextScenario, { persist: false });
      void loadStats({ listId: list.id, listType: list.type });
      void replaceSessionScopeAndLoad({
        scope: { listId: list.id, listType: list.type },
        scenario: nextScenario,
      });
    },
    [
      activeScenario,
      beginSessionScopeChange,
      loadStats,
      replaceSessionScopeAndLoad,
      persistListChange,
      setActiveScenario,
    ],
  );

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

  const handleModesChange = useCallback(
    (newModes: TrainingMode[]) => {
      beginSessionScopeChange();
      setRevealed(false);
      setEnabledModes(newModes, { persist: false });
      persistCurrentTrainingScope({ modesEnabled: newModes });
    },
    [beginSessionScopeChange, persistCurrentTrainingScope, setEnabledModes],
  );

  const handleScenarioChange = useCallback(
    (newScenario: string) => {
      trainingDebug.log("[Settings] Changing scenario to:", newScenario);
      beginSessionScopeChange();
      setRevealed(false);
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
    },
    [
      setActiveScenario,
      setCardFilterPreference,
      setEnabledModes,
      setNewReviewRatio,
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
    resetQueue: resetFocusQueueState,
    loadStats: (scope) => void loadStats(scope),
    loadWord: loadNextWord,
    reportError: setTrainingLoadError,
  });

  const canSwipe =
    revealed && !actionLoading && !loadingWord && Boolean(currentWord);

  const handleCardTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];
      if (!touch) return;

      swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
      swipeTrackingRef.current = false;
      setSwipeAnimating(false);
    },
    [],
  );

  const handleCardTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const start = swipeStartRef.current;
      if (!start) return;

      const touch = event.touches[0];
      if (!touch) return;

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (!swipeTrackingRef.current) {
        if (absX < 6 && absY < 6) return;
        if (absX <= absY) return;
        if (!canSwipe) {
          swipeStartRef.current = null;
          return;
        }

        swipeTrackingRef.current = true;
        setSwipeActive(true);
      }

      if (!swipeTrackingRef.current) return;
      event.preventDefault();

      const cardWidth = cardSwipeRef.current?.offsetWidth ?? 0;
      const maxOffset = cardWidth * 0.6;
      const clamped = Math.max(-maxOffset, Math.min(maxOffset, dx));
      setSwipeOffset(clamped);
      setSwipeDirection(clamped >= 0 ? "right" : "left");
    },
    [canSwipe],
  );

  const handleCardTouchEnd = useCallback(() => {
    if (actionLoading) {
      resetSwipe();
      return;
    }

    const cardWidth = cardSwipeRef.current?.offsetWidth ?? 0;
    const threshold = cardWidth * 0.35;

    if (
      swipeTrackingRef.current &&
      cardWidth > 0 &&
      Math.abs(swipeOffset) >= threshold &&
      canSwipe
    ) {
      const direction = swipeOffset >= 0 ? "right" : "left";
      const result: ReviewResult = showFirstTimeButtons
        ? direction === "right"
          ? "fail"
          : "hide"
        : direction === "right"
          ? "success"
          : "fail";

      setSwipeAnimating(true);
      setSwipeOffset((direction === "right" ? 1 : -1) * cardWidth * 1.1);
      setSwipeDirection(direction);
      setSwipeActive(false);
      swipeTrackingRef.current = false;
      swipeStartRef.current = null;

      void handleAction(result);
      return;
    }

    setSwipeAnimating(true);
    setSwipeOffset(0);
    setSwipeDirection(null);
    setSwipeActive(false);
    swipeTrackingRef.current = false;
    swipeStartRef.current = null;
  }, [
    actionLoading,
    canSwipe,
    handleAction,
    resetSwipe,
    showFirstTimeButtons,
    swipeOffset,
  ]);

  useEffect(() => {
    resetSwipe();
  }, [currentWord?.id, resetSwipe]);

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

  const swipeUi = showFirstTimeButtons
    ? {
        left: {
          label: "Ik ken dit al",
          indicatorClass:
            "border-slate-200/70 bg-slate-100/80 text-slate-700 dark:border-slate-800/60 dark:bg-slate-900/40 dark:text-slate-200",
          tintColor: "rgb(100 116 139)", // slate-500
        },
        right: {
          label: "Begin met leren",
          indicatorClass: swipeIndicatorStyles.right,
          tintColor: "rgb(16 185 129)", // emerald-500
        },
      }
    : {
        left: {
          label: ACTION_LABELS.fail.label,
          indicatorClass: swipeIndicatorStyles.left,
          tintColor: "rgb(239 68 68)", // red-500
        },
        right: {
          label: ACTION_LABELS.success.label,
          indicatorClass: swipeIndicatorStyles.right,
          tintColor: "rgb(16 185 129)", // emerald-500
        },
      };

  const swipeIndicator =
    swipeDirection === "left"
      ? { direction: "left" as const, ...swipeUi.left }
      : swipeDirection === "right"
        ? { direction: "right" as const, ...swipeUi.right }
        : null;
  const swipeThreshold = (cardSwipeRef.current?.offsetWidth ?? 0) * 0.35;
  const swipeProgress =
    swipeThreshold > 0
      ? Math.min(1, Math.abs(swipeOffset) / swipeThreshold)
      : 0;
  // Use swipe distance (scaled by threshold) as the single "intensity" signal
  // for all swipe feedback (indicator, card tint, and button highlight).
  const swipeFeedbackIntensity =
    swipeIndicator && (swipeActive || swipeAnimating) ? swipeProgress : 0;
  const swipeIndicatorOpacity = swipeFeedbackIntensity;
  const swipeTintColor = swipeIndicator?.tintColor ?? null;
  const swipeTintOpacity = swipeFeedbackIntensity * 0.14;
  const swipeCardStyle: React.CSSProperties = {
    transform: `translateX(${swipeOffset}px) rotate(${swipeOffset / 40}deg)`,
    transition: swipeAnimating ? "transform 200ms ease" : "none",
    touchAction: "pan-y",
  };
  const sourceFilterValue = trainingFocusFilter.sourceId
    ? `source:${trainingFocusFilter.sourceId}`
    : trainingFocusFilter.sourceKind === "youtube"
      ? "kind:youtube"
      : "all";
  const activeSourceFilterLabel = trainingFocusFilter.sourceId
    ? trainingFilterSources.find(
        (source) => source.sourceId === trainingFocusFilter.sourceId,
      )?.label
    : trainingFocusFilter.sourceKind === "youtube"
      ? "YouTube"
      : null;
  const dateFilterLabel =
    trainingFocusFilter.dateWindow === "today"
      ? "vandaag"
      : trainingFocusFilter.dateWindow === "yesterday"
        ? "gisteren"
        : trainingFocusFilter.dateWindow === "daysAgo"
          ? `${trainingFocusFilter.daysAgo ?? 7} dagen geleden`
          : null;
  const activeFilterCopy = [dateFilterLabel, activeSourceFilterLabel]
    .filter(Boolean)
    .join(" · ");
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
    focusFilter: trainingFocusFilter,
    listOptions,
    sourceOptions: pilotSourceOptions,
    initialTransitionId,
    loadTrainingScenarios: trainingScenarioCatalog.fetch,
    onCommitDraft: commitPilotSessionDraft,
    onRetry: async () => {
      const recovery = await retryCardLoadFailure();
      if (recovery === "skipped") await loadNextWord();
    },
  });
  const handleContinueTrainingSession = useCallback(() => {
    if (currentWord) {
      const transitionId = createTrainingTransitionId();
      beginTrainingUserTransition(transitionId, "continue");
      registerTrainingEntryTransition(currentWord.id, transitionId);
      markTrainingEntryPresentationStarted(currentWord.id);
    }
    trainingPilot.continueSession();
  }, [currentWord, trainingPilot]);
  const handleEnterTrainingSession = useCallback(() => {
    clearReviewedSession();
  }, [clearReviewedSession]);
  const trainingSessionPlanScope = React.useMemo(
    () => ({
      listId: wordListId,
      ...(wordListType ? { listType: wordListType } : {}),
      cardFilter,
      trainingFilter: trainingFocusFilter,
    }),
    [cardFilter, trainingFocusFilter, wordListId, wordListType],
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
  const {
    cardOrdinal: sessionCardOrdinal,
    isSubsequentCard: isSubsequentSessionCard,
  } = useTrainingSessionPresentation({
    surface: trainingPilot.surface,
    presentedCardKey: currentWord
      ? getTrainingCardKey(currentWord, currentMode)
      : null,
    sessionGeneration: trainingPilot.sessionGeneration,
    scopeKey: trainingSessionPlanScopeKey,
    planSnapshot: trainingSessionPlanSnapshot,
    onEnterSession: handleEnterTrainingSession,
  });

  const legacyTrainingCardPresentation = React.useMemo(
    () =>
      currentWord ? projectTrainingCardPresentation(currentWord) : null,
    [currentWord],
  );
  const legacyTrainingCard = (
    <TrainingCard
      card={legacyTrainingCardPresentation}
      mode={currentMode}
      revealed={revealed}
      hintRevealed={hintRevealed}
      loading={loadingWord}
      highlightedWord={selectedEntry?.headword}
      onWordClick={handleTrainingWordClick}
      userId={user.id}
      translationLang={translationLang}
      translationTooltipOpen={translationTooltipOpen}
      onTranslationTooltipOpenChange={setTranslationTooltipOpen}
      onToggleHint={toggleHint}
      onRequestReveal={revealAnswer}
      onShowDetails={handleShowCurrentWordDetails}
      audioModeEnabled={audioModeEnabled}
      onToggleAudioMode={() => setAudioModeEnabled((prev) => !prev)}
    />
  );

  const destinationUtilityNav = {
    themePreference,
    onCycleTheme: cycleThemePreference,
    onOpenSettings: openAppSettings,
  } satisfies Omit<AppUtilityNavProps, "interfaceLanguage">;

  const v2SessionChromeVisible = Boolean(
    trainingTodaySetupEnabled &&
    trainingSessionV2Enabled &&
    currentWord &&
    trainingPilot.surface === "session",
  );
  return (
    <>
      <div
        aria-hidden={destination !== "training"}
        data-training-today-setup={
          trainingTodaySetupEnabled ? "enabled" : "disabled"
        }
        data-training-pilot-surface={trainingPilot.surface}
        className={`${destination === "training" ? "flex" : "hidden"} h-screen h-[100dvh] flex-col bg-background-light text-slate-900 overflow-hidden dark:bg-background-dark dark:text-slate-100`}
      >
        <header className="relative z-40 grid flex-none grid-cols-[1fr_auto_1fr] items-center border-b border-slate-200 bg-white/80 px-3 py-2.5 md:px-6 md:py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex min-w-0 items-center gap-2 justify-self-start">
            <div className="flex h-9 min-w-0 items-center gap-2 md:h-10">
              <BrandLogo />
            </div>
            {trainingTodaySetupEnabled &&
            trainingPilot.surface === "session" &&
            !v2SessionChromeVisible ? (
              <button
                type="button"
                aria-label="Terug naar Vandaag"
                onClick={trainingPilot.returnToToday}
                className="ml-1 min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span aria-hidden="true">←</span>
                <span className="hidden sm:inline"> Vandaag</span>
              </button>
            ) : null}
          </div>
          {onRequestDestination ? (
            <div className="justify-self-center">
              <AppDestinationNav
                active="training"
                interfaceLanguage={onboardingLang}
                disabled={actionLoading}
                extendedDestinationsEnabled={extendedDestinationsEnabled}
                onNavigate={onRequestDestination}
              />
            </div>
          ) : (
            <div />
          )}
          {destination === "training" ? (
            <AppUtilityNav
              interfaceLanguage={onboardingLang}
              themePreference={themePreference}
              onCycleTheme={cycleThemePreference}
              onOpenSettings={openAppSettings}
            />
          ) : (
            <div />
          )}
        </header>

        {v2SessionChromeVisible ? (
          <TrainingSessionChrome
            interfaceLanguage={onboardingLang}
            scenario={activeScenario}
            mode={currentMode}
            position={sessionCardOrdinal}
            onClose={trainingPilot.returnToToday}
          />
        ) : null}

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
            activeSessionLabel={wordListLabel || undefined}
            onContinue={handleContinueTrainingSession}
            onStart={trainingPilot.startSession}
            onRetry={() => void trainingPilot.retry()}
          />
        ) : (
          <>
            <main className="flex grow flex-col items-center overflow-hidden bg-background-light dark:bg-background-dark">
              {/* Center the training card while preserving its established width. */}
              <div className="flex h-full w-full max-w-[1200px] flex-row justify-center gap-2 px-1 py-3 md:gap-4 md:px-4 lg:gap-6 lg:px-6">
                {/* Left/Main Column: Constrained to max-w-3xl to improve desktop line length */}
                <section className="flex flex-1 w-full max-w-3xl flex-col h-full overflow-visible rounded-3xl bg-transparent">
                  {/* 1. Scrollable Card Area */}
                  <div
                    data-testid="training-card-scroll-region"
                    className={`flex flex-1 flex-col px-2 md:px-4 ${
                      v2SessionOwned
                        ? "min-h-0 overflow-clip"
                        : "overflow-y-auto overflow-x-visible scrollbar-hide"
                    }`}
                  >
                    {/* Card Container */}
                    <div
                      className={`flex flex-col justify-start md:justify-center ${
                        v2SessionOwned
                          ? "h-full min-h-0 py-0"
                          : "min-h-full py-2 md:py-4"
                      }`}
                    >
                      {nextCardOverrideNotice ? (
                        <div
                          role="status"
                          className="mx-auto mb-3 w-full max-w-2xl rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200"
                        >
                          {nextCardOverrideNotice}
                        </div>
                      ) : null}
                      {!trainingShellV2Enabled && !onRequestDestination ? (
                        <div className="mx-auto mb-3 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/50">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                              Periode
                              <select
                                value={trainingFocusFilter.dateWindow}
                                onChange={(event) =>
                                  handleTrainingDateWindowChange(
                                    event.target.value,
                                  )
                                }
                                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                              >
                                <option value="all">Alle dagen</option>
                                <option value="today">Vandaag</option>
                                <option value="yesterday">Gisteren</option>
                                <option value="daysAgo">N dagen geleden</option>
                              </select>
                            </label>
                            {trainingFocusFilter.dateWindow === "daysAgo" ? (
                              <label className="flex w-full flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 md:w-28">
                                Dagen
                                <input
                                  type="number"
                                  min={0}
                                  max={365}
                                  value={trainingFocusFilter.daysAgo ?? 7}
                                  onChange={(event) =>
                                    handleTrainingDaysAgoChange(
                                      event.target.value,
                                    )
                                  }
                                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                />
                              </label>
                            ) : null}
                            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                              Bron
                              <select
                                value={sourceFilterValue}
                                onChange={(event) =>
                                  handleTrainingSourceFilterChange(
                                    event.target.value,
                                  )
                                }
                                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                              >
                                <option value="all">Alle bronnen</option>
                                <option value="kind:youtube">YouTube</option>
                                {trainingFilterSources.map((source) => (
                                  <option
                                    key={source.sourceId}
                                    value={`source:${source.sourceId}`}
                                  >
                                    {source.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {trainingFocusFilterActive ? (
                              <button
                                type="button"
                                onClick={clearTrainingFocusFilter}
                                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 md:self-end"
                              >
                                Wissen
                              </button>
                            ) : null}
                          </div>
                          {trainingFocusFilterActive ? (
                            <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                              Gefilterde training:{" "}
                              {activeFilterCopy || "aangepaste selectie"}.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {trainingFocusFilterActive &&
                      !loadingWord &&
                      !currentWord ? (
                        <div
                          role="status"
                          className="mx-auto mb-3 w-full max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
                        >
                          Geen kaarten gevonden voor{" "}
                          {activeFilterCopy || "dit filter"}.
                        </div>
                      ) : null}
                      {/* Desktop: 16/10 aspect-ratio.
                   Mobile: hybrid height (min + max) so content scrolls *within* the card and buttons stay stable. */}
                      <div
                        data-testid="training-card-frame"
                        className={`mx-auto mb-6 w-full transition-[height] duration-200 md:mb-8 ${
                          v2SessionOwned
                            ? "min-h-0 flex-1 overflow-hidden"
                            : "h-[clamp(360px,55dvh,520px)] min-h-[360px] max-h-[520px] md:aspect-[16/10] md:h-auto md:min-h-[400px]"
                        }`}
                      >
                        <div
                          ref={cardSwipeRef}
                          data-testid="training-card-swipe-wrapper"
                          className={`relative h-full ${
                            v2SessionOwned ? "min-h-0 overflow-hidden" : ""
                          }`}
                          style={swipeCardStyle}
                          onTouchStart={handleCardTouchStart}
                          onTouchMove={handleCardTouchMove}
                          onTouchEnd={handleCardTouchEnd}
                          onTouchCancel={handleCardTouchEnd}
                        >
                          {swipeTintColor && swipeTintOpacity > 0 && (
                            <div
                              className="pointer-events-none absolute inset-0 z-10 rounded-3xl"
                              style={{
                                backgroundColor: swipeTintColor,
                                opacity: swipeTintOpacity,
                              }}
                            />
                          )}
                          {swipeIndicator && (
                            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                              <div
                                className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] shadow-sm ${swipeIndicator.indicatorClass}`}
                                style={{ opacity: swipeIndicatorOpacity }}
                              >
                                {swipeIndicator.label}
                              </div>
                            </div>
                          )}
                          {usableCandidatesExhausted ? (
                            <TrainingUsableCandidatesExhausted
                              interfaceLanguage={onboardingLang}
                              onExit={trainingPilot.returnToToday}
                            />
                          ) : trainingSessionV2Enabled && currentWord ? (
                            <TrainingSenseCardV2Session
                              key={`${user.id}:${currentWord.id}:${currentMode}`}
                              cacheOwnerId={user.id}
                              nextTransitionId={nextTransitionId ?? undefined}
                              presentationIdentity={currentPresentationIdentity}
                              word={currentWord}
                              mode={currentMode}
                              contentLanguageCode={currentTrainingLanguage}
                              translationTargetLanguageCode={
                                translationLang === "off"
                                  ? null
                                  : translationLang
                              }
                              interfaceLanguage={onboardingLang}
                              focusOnPresentation={isSubsequentSessionCard}
                              onPlayResolvedAudio={(url, label) =>
                                playAudio(url, label)
                              }
                              onOpenDetails={handleShowCurrentWordDetails}
                              onProgressActionAccepted={
                                handleV2ProgressActionAccepted
                              }
                              onProgressActionStarting={
                                prepareV2ProgressAction
                              }
                              onLoadFailure={(failure) =>
                                reportCardLoadFailure(currentWord, failure)
                              }
                              onRetryAlternative={() => {
                                void retryCardLoadFailure();
                              }}
                              onExit={trainingPilot.returnToToday}
                            />
                          ) : (
                            <div
                              className="contents"
                              data-training-renderer="legacy"
                              data-training-v2-state={
                                currentMode === "listen-recognize"
                                  ? "listening-mode"
                                  : "pilot-disabled"
                              }
                            >
                              {legacyTrainingCard}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. Fixed Buttons Area (Always Visible) */}
                  {!v2SessionOwned && !usableCandidatesExhausted ? (
                    <div className="flex-none pt-4 pb-2 z-10">
                      {/* Translucent container for buttons */}
                      <div className="w-full rounded-2xl bg-white/50 backdrop-blur-sm p-3 border border-white/20 shadow-lg dark:bg-slate-900/50 dark:border-slate-800/50 transition-all duration-300">
                        <div data-tour="rating-buttons">
                          {revealed ? (
                            <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                              {showFirstTimeButtons ? (
                                <FirstTimeButtonGroup
                                  onStartLearning={handleFirstTimeStart}
                                  onAlreadyKnow={handleFirstTimeAlreadyKnow}
                                  disabled={actionLoading}
                                  swipeDirection={swipeDirection}
                                  swipeIntensity={swipeFeedbackIntensity}
                                />
                              ) : (
                                <div
                                  className={`grid gap-2 md:gap-3 w-full ${
                                    currentMode === "listen-recognize"
                                      ? "grid-cols-2"
                                      : "grid-cols-2 md:grid-cols-4"
                                  }`}
                                >
                                  {(currentMode === "listen-recognize"
                                    ? (["fail", "success"] as ReviewResult[])
                                    : ([
                                        "fail",
                                        "hard",
                                        "success",
                                        "easy",
                                      ] as ReviewResult[])
                                  ).map((actionKey) => {
                                    const defaultAction =
                                      ACTION_LABELS[actionKey];
                                    const label =
                                      currentMode === "listen-recognize" &&
                                      actionKey === "fail"
                                        ? "Niet herkend"
                                        : currentMode === "listen-recognize" &&
                                            actionKey === "success"
                                          ? "Herkend"
                                          : defaultAction.label;
                                    const { keyHint, tone } = defaultAction;
                                    const swipeButtonHighlight =
                                      actionKey === "fail" &&
                                      swipeDirection === "left"
                                        ? swipeFeedbackIntensity
                                        : actionKey === "success" &&
                                            swipeDirection === "right"
                                          ? swipeFeedbackIntensity
                                          : 0;
                                    const swipeButtonRgb =
                                      actionKey === "fail"
                                        ? "239, 68, 68" // red-500
                                        : "16, 185, 129"; // emerald-500
                                    const swipeButtonColor =
                                      actionKey === "fail"
                                        ? "rgb(239 68 68)" // red-500
                                        : "rgb(16 185 129)"; // emerald-500
                                    return (
                                      <button
                                        key={actionKey}
                                        type="button"
                                        disabled={actionLoading}
                                        onClick={() => handleAction(actionKey)}
                                        style={
                                          swipeButtonHighlight > 0
                                            ? {
                                                outline: `2px solid rgba(${swipeButtonRgb}, ${0.65 * swipeButtonHighlight})`,
                                                outlineOffset: 2,
                                              }
                                            : undefined
                                        }
                                        className={`relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl px-3 text-xs md:text-sm font-semibold uppercase tracking-wide transition shadow-sm hover:shadow-md disabled:cursor-wait disabled:opacity-60 ${buttonStyles[tone]} ${mobileActionOrder[actionKey] ?? ""}`}
                                      >
                                        {(actionKey === "fail" ||
                                          actionKey === "success") && (
                                          <span
                                            aria-hidden="true"
                                            className="pointer-events-none absolute inset-0 rounded-xl"
                                            style={{
                                              backgroundColor: swipeButtonColor,
                                              opacity:
                                                0.22 * swipeButtonHighlight,
                                            }}
                                          />
                                        )}
                                        <span className="relative z-10">
                                          {label}
                                        </span>
                                        <span className="relative z-10 text-[10px] md:text-xs font-normal opacity-70">
                                          ({keyHint})
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ) : (
                            /* Show Answer Button - Wide, colored, distinct */
                            <button
                              type="button"
                              onClick={() => {
                                revealAnswer();
                              }}
                              className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20 font-bold uppercase tracking-[0.2em] transition-all hover:bg-blue-500/20 hover:border-blue-500/30 hover:scale-[1.01] active:scale-[0.99] dark:bg-blue-400/10 dark:text-blue-400 dark:border-blue-400/20"
                            >
                              Antwoord Tonen
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>

              </div>
            </main>

            <FooterStats
              stats={stats}
              enabledModes={enabledModes}
              cardFilter={cardFilter}
              onModesChange={handleModesChange}
              onCardFilterChange={handleCardFilterChange}
              language={currentTrainingLanguage}
              onLanguageChange={handleTrainingLanguageChange}
              languageOptions={trainingLanguageOptions}
              activeList={activeList}
              activeListName={wordListLabel}
              activeListValue={activeListValue}
              listOptions={listOptions}
              onListChange={handleFooterListChange}
              onOpenSettings={() => {
                setSettingsInitialViewedListScope(null);
                setShowSettings(true);
              }}
              activeScenarioName={trainingScenarioLabel("nl", activeScenario)}
              initialReviewDue={initialReviewDue}
              inlineControlsEnabled={!trainingTodaySetupEnabled}
              compact={v2SessionOwned}
              interfaceLanguage={onboardingLang}
            />
          </>
        )}

        {trainingTodaySetupEnabled &&
        trainingPilot.surface !== "session" &&
        onRequestDestination ? (
          <MobileAppDestinationNav
            active="training"
            interfaceLanguage={onboardingLang}
            disabled={actionLoading}
            extendedDestinationsEnabled={extendedDestinationsEnabled}
            onNavigate={onRequestDestination}
          />
        ) : null}

        {trainingShellV2Enabled ? (
          <TrainingKnownUndoNotice
            interfaceLanguage={onboardingLang}
            currentPresentationIdentity={currentPresentationIdentity}
          />
        ) : null}

        {wordLookupNotice ? (
          <div
            role="status"
            className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 shadow-xl dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            {wordLookupNotice}
          </div>
        ) : null}

        <TrainingDetailsDrawer
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
        >
          {detailEntry ? (
            <WordDetailPanel
              entry={detailEntry}
              userId={user.id}
              translationLang={translationLang}
              userLists={availableLists.filter((list) => list.type === "user")}
              onListsUpdated={handleListsUpdated}
              onOpenListMembership={openMembershipList}
              onUserDictionaryEntryCreated={handleUserDictionaryEntryCreated}
              onTrainWord={handleTrainWord}
              showHeader
              showActions
              currentTrainingEntryId={currentWord?.id ?? null}
              onTrainingAction={(result) => void handleAction(result)}
              trainingActionDisabled={!revealed || actionLoading}
            />
          ) : null}
        </TrainingDetailsDrawer>

        {showSettings && !extendedDestinationsEnabled && (
          <SettingsModal
            open={showSettings}
            onClose={() => {
              setShowSettings(false);
              setSettingsInitialTab("instellingen");
              setSettingsInitialViewedListScope(null);
              setSettingsAutoFocusWordSearch(false);
            }}
            initialTab={settingsInitialTab}
            autoFocusWordSearch={settingsAutoFocusWordSearch}
            initialViewedListScope={settingsInitialViewedListScope}
            onListsUpdated={handleListsUpdated}
            themePreference={themePreference}
            onThemeChange={setTheme}
            audioQuality={audioQuality}
            onAudioQualityChange={setAudioQuality}
            onboardingLanguage={onboardingLang}
            onOnboardingLanguageChange={saveOnboardingLanguageChoice}
            onStartOnboarding={() => {
              setShowSettings(false);
              setSettingsInitialTab("instellingen");
              setSettingsInitialViewedListScope(null);
              setSettingsAutoFocusWordSearch(false);
              startOnboarding();
            }}
            language={currentTrainingLanguage}
            onLanguageChange={handleTrainingLanguageChange}
            languageOptions={trainingLanguageOptions}
            defaultLanguage={language}
            onDefaultLanguageChange={setLanguage}
            translationLang={translationLang}
            onTranslationLangChange={setTranslationLang}
            wordListId={wordListId}
            wordListType={wordListType}
            activeTrainingList={activeList}
            onMakeActiveForTraining={handleMakeActiveTrainingList}
            onUserDictionaryEntryCreated={handleUserDictionaryEntryCreated}
            enabledModes={enabledModes}
            cardFilter={cardFilter}
            onModesChange={handleModesChange}
            onCardFilterChange={handleCardFilterChange}
            newReviewRatio={newReviewRatio}
            onNewReviewRatioChange={handleNewReviewRatioChange}
            stats={stats}
            userEmail={user.email ?? ""}
            userId={user.id}
            activeScenario={activeScenario}
            onScenarioChange={handleScenarioChange}
            onTrainWord={handleTrainWord}
          />
        )}

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
      {onRequestDestination ? (
        <LibraryDestination
          open={destination === "library"}
          userId={user.id}
          language={currentTrainingLanguage}
          translationLang={translationLang}
          interfaceLanguage={onboardingLang}
          lists={availableLists}
          activeList={activeList ?? null}
          onReloadLists={handleListsUpdated}
          extendedDestinationsEnabled={extendedDestinationsEnabled}
          onNavigate={onRequestDestination}
          utilityNav={destinationUtilityNav}
          onOpenListMembership={(membership) => {
            onRequestDestination("training");
            openMembershipList(membership);
          }}
          onUserDictionaryEntryCreated={handleUserDictionaryEntryCreated}
          onTrainWord={(wordId) => {
            handleTrainWord(wordId);
            onRequestDestination("training");
          }}
        />
      ) : null}
      {onRequestDestination && extendedDestinationsEnabled ? (
        <StatisticsDestination
          open={destination === "statistics"}
          interfaceLanguage={onboardingLang}
          stats={stats}
          onNavigate={onRequestDestination}
          utilityNav={destinationUtilityNav}
        />
      ) : null}
      {onRequestDestination && extendedDestinationsEnabled ? (
        <SettingsDestination
          open={destination === "settings"}
          interfaceLanguage={onboardingLang}
          themePreference={themePreference}
          translationLanguage={translationLang}
          onThemeChange={setTheme}
          onInterfaceLanguageChange={saveOnboardingLanguageChoice}
          onTranslationLanguageChange={setTranslationLang}
          onNavigate={onRequestDestination}
          userEmail={user.email ?? ""}
          onSignOut={handleSignOut}
        />
      ) : null}
    </>
  );
}
