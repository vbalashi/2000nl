"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Joyride, { Step } from "react-joyride";
import { supabase } from "@/lib/supabaseClient";
import { trainingDebug } from "@/lib/trainingDebug";
import {
  fetchDictionaryEntry,
  fetchAvailableLearningLanguages,
  fetchNextTrainingWord,
  fetchNextTrainingWordByScenario,
  fetchTrainingFilterSources,
  fetchTrainingWordByLookup,
  fetchStats,
  fetchRecentHistory,
  isTrainingFocusFilterActive,
  updateActiveTrainingScope,
  recordReview,
  recordWordView,
  fetchLastReviewDebug,
  ReviewResult,
} from "@/lib/trainingService";
import type {
  CardFilter,
  DetailedStats,
  DictionaryEntry,
  EntryLearningListMembership,
  QueueTurn,
  TrainingFocusFilter,
  TrainingFilterSource,
  TrainingMode,
  TrainingWord,
  SidebarHistoryItem,
  WordListSummary,
  WordListType,
} from "@/lib/types";
import { BrandLogo } from "@/components/BrandLogo";
import { useCardParams } from "@/lib/cardParams";
import {
  generateReviewTurnId,
  getNextQueueTransition,
  predictNextQueueTurn,
} from "@/lib/training/trainingQueue";
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
  type TrainingV2SessionState,
} from "./v2/TrainingSenseCardV2Session";
import {
  TrainingSessionChrome,
} from "./v2/TrainingSessionChrome";
import { trainingScenarioLabel } from "./v2/trainingSessionLabels";
import { useTrainingSessionPresentation } from "./v2/useTrainingSessionPresentation";
import { platformV2TrainingUiEnabled } from "@/lib/platform/platformV2Rollout";
import {
  clearPlatformV2TrainingClientCaches,
  prefetchPlatformV2TrainingEntry,
  preloadPlatformV2Audio,
  type PlatformV2TrainingActionCapability,
} from "@/lib/platform/platformV2TrainingClient";
import { FirstTimeButtonGroup } from "./FirstTimeButtonGroup";
import { Sidebar, SidebarTab } from "./Sidebar";
import { TrainingSidebarDrawer } from "./TrainingSidebarDrawer";
import { FooterStats } from "./FooterStats";
import { HotkeyDialog } from "./HotkeyDialog";
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

type Props = {
  user: User;
  destination?: AppDestination;
  extendedDestinationsEnabled?: boolean;
  onRequestDestination?: (destination: AppDestination) => void;
  onNavigationBlockedChange?: (blocked: boolean) => void;
  trainingTodaySetupEnabled?: boolean;
};

type AcceptedCardTransition = {
  word: TrainingWord;
  wordMode: TrainingMode;
  currentCardKey: string;
  turnIdForReview: string | null;
  isNextCardOverride: boolean;
  nextQueueTurn: QueueTurn;
  prefetched: TrainingWord | null;
  prefetchedReady: Promise<boolean> | null;
};

type LoadNextWordRequest = {
  excludeWordIds?: string[];
  scope?: { listId?: string | null; listType?: WordListType | null };
  queueTurn?: QueueTurn;
  scenario?: string;
  excludeCardKeys?: string[];
  cardFilter?: CardFilter;
  focusFilter?: TrainingFocusFilter;
};

type LoadNextWordResult = "loaded" | "empty" | "error" | "skipped";

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

const trainingCardKey = (word: TrainingWord, fallbackMode: TrainingMode) =>
  `${word.id}:${word.mode ?? fallbackMode}`;

const isPlatformV2TrainingMode = (mode: TrainingMode) =>
  mode === "word-to-definition" || mode === "definition-to-word";

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
  destination = "training",
  extendedDestinationsEnabled = process.env
    .NEXT_PUBLIC_SETTINGS_STATISTICS_DESTINATIONS_V1 === "true",
  onRequestDestination,
  onNavigationBlockedChange,
  trainingTodaySetupEnabled = process.env
    .NEXT_PUBLIC_TRAINING_TODAY_SETUP_V1 === "true",
}: Props) {
  const { wordId, devMode, firstEncounter } = useCardParams();
  const [revealed, setRevealed] = useState(false);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [translationTooltipOpen, setTranslationTooltipOpen] = useState(false);
  const [currentWord, setCurrentWord] = useState<TrainingWord | null>(null);
  const [v2SessionState, setV2SessionState] =
    useState<TrainingV2SessionState>("loading");
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
  } = useTrainingPreferences(user?.id);
  const [currentTrainingLanguage, setCurrentTrainingLanguage] =
    useState(language);
  const [trainingLanguageOptions, setTrainingLanguageOptions] = useState(
    DEFAULT_LANGUAGE_OPTIONS,
  );
  const trainingLanguageManuallyChangedRef = useRef(false);

  useEffect(() => {
    if (!trainingLanguageManuallyChangedRef.current) {
      setCurrentTrainingLanguage(language);
    }
  }, [language]);

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

  const handleTrainingLanguageChange = useCallback((value: string) => {
    trainingLanguageManuallyChangedRef.current = true;
    setCurrentTrainingLanguage(value);
  }, []);

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
  const [recentEntries, setRecentEntries] = useState<SidebarHistoryItem[]>([]);
  const [trainingFocusFilter, setTrainingFocusFilter] =
    useState<TrainingFocusFilter>(DEFAULT_TRAINING_FOCUS_FILTER);
  const [trainingFilterSources, setTrainingFilterSources] = useState<
    TrainingFilterSource[]
  >([]);
  const [trainingLoadError, setTrainingLoadError] = useState<string | null>(
    null,
  );
  const [wordLookupNotice, setWordLookupNotice] = useState<string | null>(null);
  // Sidebar tabs: "recent" for history, "details" for word detail panel
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("recent");
  // Drawer for sidebar (recent/details). On desktop, it is used when sidebar is not pinned.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Entry to show in the details tab (can be current word or a sidebar card)
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
  const [loadingWord, setLoadingWord] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  // `actionLoading` is React state (async to update). Keep a ref for immediate,
  // synchronous guards against double-submit from rapid keypresses/touches.
  const actionLoadingRef = useRef(false);

  useEffect(() => {
    onNavigationBlockedChange?.(actionLoading);
    return () => onNavigationBlockedChange?.(false);
  }, [actionLoading, onNavigationBlockedChange]);
  const currentTurnIdRef = useRef<string | null>(null);
  // Track reviewed cards by entry+mode so another mode for the same entry can
  // still appear in the same session.
  const reviewedInSessionRef = useRef<Set<string>>(new Set());

  const presentWord = useCallback(
    (word: TrainingWord | null) => {
      setCurrentWord(word);
      currentTurnIdRef.current = word ? generateReviewTurnId() : null;
    },
    [setCurrentWord],
  );
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

  // Queue rotation state for round-robin between new and review queues
  const [queueTurn, setQueueTurn] = useState<QueueTurn>("new");
  const [reviewCounter, setReviewCounter] = useState(0);
  const trainingFocusFilterActive =
    isTrainingFocusFilterActive(trainingFocusFilter);
  const trainingFocusFilterKey = trainingFilterKey(trainingFocusFilter);

  const {
    activeList,
    activeListValue,
    applyListLocal,
    availableLists,
    handleListSelectValue,
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
  });

  const appliedDefaultScenarioListRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeTrainingScope) return;
    setActiveScenario(activeTrainingScope.activeScenario, { persist: false });
    setCardFilterPreference(activeTrainingScope.cardFilter, { persist: false });
    setEnabledModes(activeTrainingScope.modesEnabled as TrainingMode[], {
      persist: false,
    });
    setNewReviewRatio(activeTrainingScope.newReviewRatio, { persist: false });
  }, [
    activeTrainingScope,
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
    setActiveScenario(activeList.default_scenario_id, { persist: false });
  }, [
    activeList?.default_scenario_id,
    activeList?.id,
    activeTrainingScope?.hasSavedScope,
    setActiveScenario,
  ]);

  const enabledModesKey = enabledModes.join("|");

  // Session boundary: list selection or mode/scenario changes should reset the
  // session-reviewed set so the new session starts fresh.
  useEffect(() => {
    reviewedInSessionRef.current.clear();
  }, [
    activeScenario,
    currentTrainingLanguage,
    enabledModesKey,
    trainingFocusFilterKey,
    wordListId,
    wordListType,
  ]);

  // Also clear on unmount to avoid leaking state across mounts in tests/dev.
  useEffect(() => {
    const reviewedInSession = reviewedInSessionRef.current;
    return () => {
      reviewedInSession.clear();
    };
  }, []);

  // Ref to prevent race conditions: track if initial load has been done
  const initialLoadDone = useRef(false);
  const statsRequestGenerationRef = useRef(0);
  const historyRequestGenerationRef = useRef(0);
  const lastAppliedTrainingFocusFilterKey = useRef(trainingFocusFilterKey);
  // Ref to prevent concurrent loadNextWord calls
  const loadingInProgress = useRef(false);
  // Ref: when set, present this entry as the next card once without changing
  // the active training scope, viewed list, or list membership.
  const nextCardOverrideWordIdRef = useRef<string | null>(null);
  const nextCardOverrideActiveKeyRef = useRef<string | null>(null);
  const [nextCardOverrideNotice, setNextCardOverrideNotice] = useState<
    string | null
  >(null);
  const autoPlayedAudioCardRef = useRef<string | null>(null);

  // Next-card prefetch state (kept in refs so it never blocks rendering).
  const nextWordPrefetchTokenRef = useRef(0);
  const nextWordPrefetchRef = useRef<{
    forWordId: string;
    forCardKey: string;
    queueTurn: QueueTurn;
    word: TrainingWord | null;
    v2Ready: Promise<boolean> | null;
  } | null>(null);

  // Get the current mode for the active card (from the card itself, or fallback to first enabled mode)
  const currentMode: TrainingMode =
    currentWord?.mode ?? enabledModes[0] ?? "word-to-definition";
  const trainingShellV2Enabled = platformV2TrainingUiEnabled();
  const trainingSessionV2Enabled =
    trainingShellV2Enabled &&
    (currentMode === "word-to-definition" ||
      currentMode === "definition-to-word");
  const v2SessionOwned = Boolean(trainingSessionV2Enabled && currentWord);

  const warmTrainingV2Word = useCallback(
    async (word: TrainingWord, signal?: AbortSignal) => {
      const mode = word.mode ?? enabledModes[0] ?? "word-to-definition";
      if (!trainingShellV2Enabled || !isPlatformV2TrainingMode(mode)) {
        return true;
      }
      try {
        const lookup = await prefetchPlatformV2TrainingEntry({
          cacheOwnerId: user.id,
          entryId: word.id,
          cardTypeId: mode,
          contentLanguageCode: currentTrainingLanguage,
          translationTargetLanguageCode:
            translationLang === "off" ? null : translationLang,
          signal,
        });
        if (signal?.aborted) return false;
        if (lookup.state !== "ready") return false;
        if (lookup.group.header.audio) {
          void preloadPlatformV2Audio({
            cacheOwnerId: user.id,
            capability: lookup.group.header.audio,
            text: lookup.group.header.text,
            signal,
          }).catch(() => {
            // The ready DTO is still useful if optional audio warming fails.
          });
        }
        return true;
      } catch {
        return false;
      }
    }, [
      currentTrainingLanguage,
      enabledModes,
      trainingShellV2Enabled,
      translationLang,
      user.id,
    ],
  );

  useEffect(() => {
    const cacheOwnerId = user?.id;
    return () => {
      if (cacheOwnerId) clearPlatformV2TrainingClientCaches(cacheOwnerId);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!currentWord || currentMode !== "listen-recognize") {
      autoPlayedAudioCardRef.current = null;
      return;
    }

    const cardKey = trainingCardKey(currentWord, currentMode);
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

  const setCardFilter = useCallback(
    (newFilter: CardFilter) => {
      setCardFilterPreference(newFilter, { persist: false });
      persistCurrentTrainingScope({ cardFilter: newFilter });
      // Reset queue rotation when switching to 'both' to start interleave cycle
      if (newFilter === "both") {
        setQueueTurn("new");
        setReviewCounter(0);
      }
    },
    [persistCurrentTrainingScope, setCardFilterPreference],
  );

  const resetFocusQueueState = useCallback(() => {
    reviewedInSessionRef.current.clear();
    nextWordPrefetchRef.current = null;
    nextWordPrefetchTokenRef.current += 1;
    setQueueTurn("new");
    setReviewCounter(0);
  }, []);

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

  // Advance queue turn for round-robin between new and review
  const advanceQueueTurn = useCallback(() => {
    const transition = getNextQueueTransition({
      cardFilter,
      queueTurn,
      reviewCounter,
      newReviewRatio,
    });

    setQueueTurn(transition.queueTurn);
    setReviewCounter(transition.reviewCounter);
    return transition.queueTurn;
  }, [cardFilter, queueTurn, reviewCounter, newReviewRatio]);

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

  const loadStats = useCallback(
    async (
      scope?: { listId?: string | null; listType?: WordListType | null },
      logContext?: string,
      isInitialLoad?: boolean,
    ) => {
      if (!user?.id) {
        return;
      }
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

      // On initial load, capture the fixed Y value for HERHALING
      // This should not change during the session
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

  const loadRecentHistory = useCallback(async () => {
    if (!user?.id) {
      return;
    }
    const generation = (historyRequestGenerationRef.current += 1);
    const history = await fetchRecentHistory(user.id);
    if (generation !== historyRequestGenerationRef.current) return;
    setRecentEntries(history);
  }, [user?.id]);

  const loadNextWord = useCallback(
    async ({
      excludeWordIds = [],
      scope,
      queueTurn: requestedQueueTurn,
      scenario,
      excludeCardKeys = [],
      cardFilter: requestedCardFilter,
      focusFilter,
    }: LoadNextWordRequest = {}): Promise<LoadNextWordResult> => {
      if (!user?.id) {
        return "skipped";
      }

      // Prevent concurrent calls - if already loading, skip this call
      if (loadingInProgress.current) {
        trainingDebug.log(
          "%c loadNextWord skipped (already loading)",
          "color: #f59e0b",
        );
        return "skipped";
      }
      loadingInProgress.current = true;
      setLoadingWord(true);
      setRevealed(false); // Reset reveal state for new word
      setHintRevealed(false); // Reset hint state for new word
      const effectiveListId = scope?.listId ?? wordListId;
      const effectiveListType = scope?.listType ?? wordListType;
      const effectiveList =
        availableLists.find(
          (list) =>
            list.id === effectiveListId &&
            list.type === (effectiveListType ?? "curated"),
        ) ?? activeList;
      const effectiveQueueTurn = requestedQueueTurn ?? queueTurn;
      const effectiveScenario = scenario ?? activeScenario;
      const effectiveCardFilter = requestedCardFilter ?? cardFilter;
      const effectiveFocusFilter = focusFilter ?? trainingFocusFilter;
      const restrictedModes = resolveRestrictedListModes(effectiveList);
      setTrainingLoadError(null);
      try {
        const overrideWordId = nextCardOverrideWordIdRef.current;
        if (overrideWordId) {
          nextCardOverrideWordIdRef.current = null;
          const overrideWord = await fetchTrainingWordByLookup(
            overrideWordId,
            user.id,
          );
          if (overrideWord) {
            // This one-shot override does not ask the scheduler for a new card,
            // so keep the card mode as close as possible to the current training
            // flow. Normal scenario/list selection resumes after this card.
            const mode =
              currentWord?.mode ?? enabledModes[0] ?? "word-to-definition";
            const overrideCardKey = `${overrideWord.id}:${mode}`;
            nextCardOverrideActiveKeyRef.current = overrideCardKey;
            if (!trainingShellV2Enabled || !isPlatformV2TrainingMode(mode)) {
              void recordWordView({
                userId: user.id,
                wordId: overrideWord.id,
                mode,
              });
            }
            const preparedOverrideWord = {
              ...overrideWord,
              ...(typeof firstEncounter === "boolean"
                ? { isFirstEncounter: firstEncounter }
                : {}),
              mode,
              debugStats: { source: "next-card-override", mode },
            };
            const overrideReady = await warmTrainingV2Word(
              preparedOverrideWord,
            );
            if (!overrideReady) {
              nextCardOverrideActiveKeyRef.current = null;
              setNextCardOverrideNotice(
                "Kon dit woord niet laden; probeer het opnieuw.",
              );
              setTrainingLoadError("platform_v2_lookup_failed");
              return "error";
            }
            presentWord(preparedOverrideWord);
            setNextCardOverrideNotice(
              `${overrideWord.headword} is nu de volgende kaart. Daarna gaat normale training verder.`,
            );
            return "loaded";
          }
          setNextCardOverrideNotice(
            "Kon dit woord niet laden; normale training gaat verder.",
          );
          // If we couldn't fetch it, fall back to normal selection.
        }

        // Use scenario-based word selection
        const nextWord = await fetchNextTrainingWordByScenario(
          user.id,
          effectiveScenario,
          excludeWordIds,
          {
            listId: effectiveListId ?? undefined,
            listType: effectiveListType ?? undefined,
          },
          effectiveCardFilter,
          effectiveQueueTurn,
          excludeCardKeys,
          restrictedModes,
          isTrainingFocusFilterActive(effectiveFocusFilter)
            ? effectiveFocusFilter
            : null,
        );
        if (nextWord) {
          // Fire and forget view recording, or await if we want strict consistency
          // Use the mode from the fetched word (or fallback to first enabled mode)
          const wordMode = nextWord.mode ?? enabledModes[0];
          if (!trainingShellV2Enabled || !isPlatformV2TrainingMode(wordMode)) {
            void recordWordView({
              userId: user.id,
              wordId: nextWord.id,
              mode: wordMode,
            });
          }
          const nextWordReady = await warmTrainingV2Word(nextWord);
          if (!nextWordReady) {
            setTrainingLoadError("platform_v2_lookup_failed");
            return "error";
          }
          presentWord(nextWord);
        } else {
          presentWord(null);
        }
        return nextWord ? "loaded" : "empty";
      } catch (error) {
        if (!trainingTodaySetupEnabled) throw error;
        setTrainingLoadError(
          error instanceof Error ? error.message : "training_load_failed",
        );
        return "error";
      } finally {
        loadingInProgress.current = false;
        setLoadingWord(false);
      }
    },
    [
      activeList,
      activeScenario,
      availableLists,
      enabledModes,
      cardFilter,
      currentWord?.mode,
      firstEncounter,
      presentWord,
      queueTurn,
      trainingFocusFilter,
      trainingShellV2Enabled,
      trainingTodaySetupEnabled,
      user?.id,
      wordListId,
      wordListType,
      warmTrainingV2Word,
    ],
  );

  // Background prefetch of the next card while the user is viewing the current card.
  // This is best-effort: any failures fall back to on-demand fetch in handleAction/loadNextWord.
  useEffect(() => {
    if (!user?.id) return;
    if (!currentWord?.id) return;

    const forWordId = currentWord.id;
    const forCardKey = `${currentWord.id}:${currentWord.mode ?? currentMode}`;
    const predictedQueueTurn = predictNextQueueTurn({
      cardFilter,
      queueTurn,
      reviewCounter,
      newReviewRatio,
    });

    // Invalidate any prior prefetch work.
    const token = (nextWordPrefetchTokenRef.current += 1);
    nextWordPrefetchRef.current = {
      forWordId,
      forCardKey,
      queueTurn: predictedQueueTurn,
      word: null,
      v2Ready: null,
    };

    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      try {
        const next = await fetchNextTrainingWordByScenario(
          user.id,
          activeScenario,
          [],
          {
            listId: wordListId ?? undefined,
            listType: wordListType ?? undefined,
          },
          cardFilter,
          predictedQueueTurn,
          [...reviewedInSessionRef.current, forCardKey],
          resolveRestrictedListModes(activeList),
          trainingFocusFilterActive ? trainingFocusFilter : null,
        );

        if (cancelled) return;
        if (nextWordPrefetchTokenRef.current !== token) return;

        const nextMode = next?.mode ?? enabledModes[0] ?? "word-to-definition";
        const v2Ready =
          next &&
          trainingShellV2Enabled &&
          isPlatformV2TrainingMode(nextMode)
            ? warmTrainingV2Word(next, controller.signal)
            : null;
        nextWordPrefetchRef.current = {
          forWordId,
          forCardKey,
          queueTurn: predictedQueueTurn,
          word: next,
          v2Ready,
        };

        if (audioModeEnabled && next) {
          preloadAudioForWord(next);
        }
      } catch {
        // Silent fallback: prefetch isn't critical, loadNextWord will still work.
      }
    };

    void run();

    return () => {
      cancelled = true;
      // Cancel pending prefetch on unmount/navigation by invalidating the token.
      if (nextWordPrefetchTokenRef.current === token) {
        nextWordPrefetchTokenRef.current += 1;
      }
      if (nextWordPrefetchRef.current?.forWordId === forWordId) {
        controller.abort();
        nextWordPrefetchRef.current = null;
      }
    };
  }, [
    activeScenario,
    activeList,
    audioModeEnabled,
    cardFilter,
    currentWord?.id,
    currentWord?.mode,
    currentMode,
    enabledModes,
    newReviewRatio,
    preloadAudioForWord,
    queueTurn,
    reviewCounter,
    trainingFocusFilter,
    trainingFocusFilterActive,
    trainingShellV2Enabled,
    user?.id,
    wordListId,
    wordListType,
    warmTrainingV2Word,
  ]);

  const handleTrainWord = useCallback(
    (wordId: string) => {
      nextCardOverrideWordIdRef.current = wordId;
      setNextCardOverrideNotice("Dit woord wordt als volgende kaart geladen.");
      setShowSettings(false);
      void loadNextWord({
        excludeWordIds: [currentWord?.id].filter((x): x is string =>
          Boolean(x),
        ),
      });
    },
    [currentWord?.id, loadNextWord],
  );

  // ... (keep useEffect for initial load)

  const presentPrefetchedCandidate = useCallback(
    (word: TrainingWord) => {
      setLoadingWord(false);
      setRevealed(false);
      setHintRevealed(false);
      presentWord(word);
      const nextMode = word.mode ?? enabledModes[0] ?? "word-to-definition";
      if (!trainingShellV2Enabled || !isPlatformV2TrainingMode(nextMode)) {
        void recordWordView({
          userId: user.id,
          wordId: word.id,
          mode: nextMode,
        });
      }
      if (audioModeEnabled) preloadAudioForWord(word);
    },
    [
      audioModeEnabled,
      enabledModes,
      preloadAudioForWord,
      presentWord,
      trainingShellV2Enabled,
      user.id,
    ],
  );

  const beginAcceptedCardTransition =
    useCallback((): AcceptedCardTransition | null => {
      if (!user?.id || !currentWord) return null;
      const word = currentWord;
      const wordMode = word.mode ?? enabledModes[0];
      const currentCardKey = trainingCardKey(word, wordMode);
      const transition: AcceptedCardTransition = {
        word,
        wordMode,
        currentCardKey,
        turnIdForReview: currentTurnIdRef.current,
        isNextCardOverride:
          nextCardOverrideActiveKeyRef.current === currentCardKey,
        nextQueueTurn: advanceQueueTurn(),
        prefetched: null,
        prefetchedReady: null,
      };

      reviewedInSessionRef.current.add(currentCardKey);
      const candidate = nextWordPrefetchRef.current;
      if (
        candidate &&
        candidate.forCardKey === currentCardKey &&
        candidate.word
      ) {
        nextWordPrefetchRef.current = null;
        transition.prefetched = candidate.word;
        transition.prefetchedReady = candidate.v2Ready;
        if (!candidate.v2Ready) presentPrefetchedCandidate(candidate.word);
      }

      return transition;
    }, [
      advanceQueueTurn,
      currentWord,
      enabledModes,
      presentPrefetchedCandidate,
      user?.id,
    ]);

  const finishAcceptedCardTransition = useCallback(
    async (
      transition: AcceptedCardTransition,
      options: { statsLabel: string; refreshHistory?: boolean },
    ) => {
      const refreshBackground = Promise.all([
        loadStats(undefined, options.statsLabel),
        options.refreshHistory ? loadRecentHistory() : Promise.resolve(),
      ]).catch((error) => {
        trainingDebug.log("Training counters refresh failed", error);
      });

      if (transition.isNextCardOverride) {
        nextCardOverrideActiveKeyRef.current = null;
        setNextCardOverrideNotice(null);
      }
      if (transition.prefetched && transition.prefetchedReady) {
        const ready = await transition.prefetchedReady.catch(() => false);
        if (ready) {
          presentPrefetchedCandidate(transition.prefetched);
        } else {
          transition.prefetched = null;
        }
      }
      if (!transition.prefetched) {
        await loadNextWord({
          queueTurn: transition.nextQueueTurn,
          excludeCardKeys: [
            ...reviewedInSessionRef.current,
            transition.currentCardKey,
          ],
        });
      }
      void refreshBackground;
    },
    [
      loadNextWord,
      loadRecentHistory,
      loadStats,
      presentPrefetchedCandidate,
    ],
  );

  const handleAction = useCallback(
    async (result: ReviewResult) => {
      if (!user?.id || !currentWord) {
        return;
      }

      if (actionLoadingRef.current) return;
      actionLoadingRef.current = true;
      setActionLoading(true);
      try {
        const transition = beginAcceptedCardTransition();
        if (!transition) return;
        const { turnIdForReview, wordMode } = transition;

        // Capture BEFORE values from current word's debugStats
        const beforeInterval = currentWord.debugStats?.interval;
        const beforeStability = currentWord.debugStats?.ef;
        const cardSource = currentWord.debugStats?.source ?? "unknown";

        // Log before stats
        trainingDebug.log(
          `%c 📊 Stats [BEFORE ${currentWord.headword}]:`,
          "color: #8b5cf6; font-weight: bold;",
          `NIEUW: ${stats.newCardsToday}/${stats.dailyNewLimit}`,
          `| HERHALING: ${stats.reviewCardsDone}/${
            stats.reviewCardsDone + stats.reviewCardsDue
          }`,
          `| TOTAAL: ${stats.totalWordsLearned}/${stats.totalWordsInList}`,
        );

        const updatedStatus = await recordReview({
          userId: user.id,
          wordId: currentWord.id,
          mode: wordMode,
          result,
          turnId: turnIdForReview,
        });

        // Log interval/stability changes to console
        if (
          updatedStatus &&
          ["fail", "hard", "success", "easy"].includes(result)
        ) {
          const afterInterval = updatedStatus.interval;
          const afterStability = updatedStatus.stability;

          const formatDelta = (
            before: number | undefined,
            after: number | null | undefined,
            suffix = "",
          ) => {
            if (before == null && after == null) return null;
            if (before == null) return `→${after?.toFixed(2)}${suffix}`;
            if (after == null) return `${before.toFixed(2)}${suffix}→?`;
            return `${before.toFixed(2)}→${after.toFixed(2)}${suffix}`;
          };

          const intervalDelta = formatDelta(beforeInterval, afterInterval, "d");
          const stabilityDelta = formatDelta(beforeStability, afterStability);

          // Determine if this card graduated (was new/learning, now has interval >= 1 day)
          const wasNew = cardSource === "new";
          const wasLearning = cardSource === "learning";
          const isGraduated = (afterInterval ?? 0) >= 1.0;
          const graduationNote =
            (wasNew || wasLearning) && isGraduated
              ? ` → GRADUATED to review queue`
              : "";

          trainingDebug.log(
            `%c ✓ Review: ${currentWord.headword} (${cardSource} → ${result})`,
            "color: #10b981; font-weight: bold;",
            intervalDelta ? `int:${intervalDelta}` : "",
            stabilityDelta ? `S:${stabilityDelta}` : "",
            graduationNote,
          );

          // Optional FSRS debug: only enabled when explicitly requested.
          // This hits an optional RPC (`get_last_review_debug`) that is not exposed in
          // most environments; calling it unconditionally creates noisy 404s in the
          // browser console and in automation runs.
          const enableFsrsDebug =
            process.env.NODE_ENV !== "production" &&
            process.env.NEXT_PUBLIC_ENABLE_FSRS_DEBUG === "1";
          if (enableFsrsDebug) {
            const debug = await fetchLastReviewDebug({
              userId: user.id,
              wordId: currentWord.id,
              mode: wordMode,
            });
            const meta = debug?.metadata ?? null;
            if (meta) {
              const r =
                typeof meta.retrievability === "number"
                  ? meta.retrievability
                  : undefined;
              const elapsed =
                typeof meta.elapsed_days === "number"
                  ? meta.elapsed_days
                  : undefined;
              const sameDay =
                typeof meta.same_day === "boolean" ? meta.same_day : undefined;
              trainingDebug.log(
                `%c   ↳ FSRS debug:`,
                "color: #6b7280;",
                elapsed != null ? `elapsed=${elapsed.toFixed(4)}d` : "",
                r != null ? `R=${r.toFixed(4)}` : "",
                sameDay != null ? `same_day=${sameDay}` : "",
                debug?.scheduled_at ? `scheduled_at=${debug.scheduled_at}` : "",
                debug?.reviewed_at ? `reviewed_at=${debug.reviewed_at}` : "",
              );
            }
          }

          // Explain what should happen to stats
          if (wasNew) {
            trainingDebug.log(
              `%c   → review_type='new' logged → NIEUW counter should +1`,
              "color: #6b7280;",
            );
          } else {
            trainingDebug.log(
              `%c   → review_type='review' logged → HERHALING done counter should +1`,
              "color: #6b7280;",
            );
          }
        }

        // Add to sidebar history for graded review actions
        if (
          result === "fail" ||
          result === "hard" ||
          result === "success" ||
          result === "easy"
        ) {
          setRecentEntries((prev) => {
            // Compute interval: use FSRS interval, or calculate from learning_due_at for learning phase
            let displayInterval = updatedStatus?.interval ?? undefined;
            if (
              displayInterval == null &&
              updatedStatus?.in_learning &&
              updatedStatus?.learning_due_at
            ) {
              // Calculate interval in days from now to learning_due_at
              const dueAt = new Date(updatedStatus.learning_due_at).getTime();
              const now = Date.now();
              displayInterval = Math.max(
                0,
                (dueAt - now) / (1000 * 60 * 60 * 24),
              );
            }

            // Preserve the original source from the card (new/learning/review/practice/fallback)
            const sourceLabel = currentWord.debugStats?.source ?? "review";

            // Create history item with UPDATED stats from the review, including before values for delta display
            const historyItem: SidebarHistoryItem = {
              id: currentWord.id,
              headword: currentWord.headword,
              part_of_speech: currentWord.part_of_speech,
              gender: currentWord.gender,
              raw: currentWord.raw,
              source: "review",
              result,
              is_nt2_2000: currentWord.is_nt2_2000,
              meanings_count: currentWord.meanings_count,
              stats: {
                click_count:
                  updatedStatus?.clicks ?? currentWord.debugStats?.clicks ?? 0,
                last_seen_at: new Date().toISOString(),
              },
              debugStats: {
                source: sourceLabel,
                mode: wordMode,
                interval: displayInterval,
                reps: updatedStatus?.reps ?? undefined,
                ef: updatedStatus?.stability ?? undefined,
                clicks: updatedStatus?.clicks ?? undefined,
                next_review:
                  updatedStatus?.next_review ??
                  updatedStatus?.learning_due_at ??
                  undefined,
                // Include before values for delta display in sidebar
                previousInterval: beforeInterval,
                previousStability: beforeStability,
              },
            };
            // Prepend
            return [historyItem, ...prev].slice(0, 50); // Keep last 50
          });
        }

        await finishAcceptedCardTransition(transition, {
          statsLabel: `AFTER ${currentWord.headword} (${result})`,
        });
      } finally {
        actionLoadingRef.current = false;
        setActionLoading(false);
      }
    },
    [
      beginAcceptedCardTransition,
      currentWord,
      finishAcceptedCardTransition,
      stats,
      user?.id,
    ],
  );

  const handleFirstTimeStart = useCallback(() => {
    void handleAction("fail");
  }, [handleAction]);

  const handleFirstTimeAlreadyKnow = useCallback(() => {
    void handleAction("hide");
  }, [handleAction]);

  const handleV2ProgressActionAccepted = useCallback(
    async (_capability: PlatformV2TrainingActionCapability) => {
      if (!user?.id || !currentWord || actionLoadingRef.current) return;
      actionLoadingRef.current = true;
      setActionLoading(true);
      try {
        const transition = beginAcceptedCardTransition();
        if (!transition) return;
        await finishAcceptedCardTransition(transition, {
          statsLabel: `AFTER ${currentWord.headword} (platform-v2)`,
          refreshHistory: true,
        });
      } finally {
        actionLoadingRef.current = false;
        setActionLoading(false);
      }
    },
    [
      beginAcceptedCardTransition,
      currentWord,
      finishAcceptedCardTransition,
      user?.id,
    ],
  );

  useEffect(() => {
    // New card => close translation overlay.
    setTranslationTooltipOpen(false);
  }, [currentWord?.id]);

  useEffect(() => {
    if (!user?.id || !listHydrated) {
      return;
    }
    // Prevent double-loading due to loadNextWord changing when queueTurn changes
    if (initialLoadDone.current) {
      return;
    }
    initialLoadDone.current = true;
    if (wordId) {
      nextCardOverrideWordIdRef.current = wordId;
    }
    loadNextWord();
    loadStats(undefined, "INITIAL LOAD", true); // isInitialLoad = true to set fixed Y
    void loadRecentHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, listHydrated, wordId]);

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

  // Show word details in sidebar (or bottom sheet on mobile)
  const handleShowDetails = useCallback((entry: DictionaryEntry) => {
    setDetailEntry(entry);
    setSidebarTab("details");
    setMobileSidebarOpen(true);
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
      if (!actionLoadingRef.current) {
        onRequestDestination("library");
      }
      return;
    }
    setSettingsInitialTab("zoeken");
    setSettingsInitialViewedListScope(null);
    setSettingsAutoFocusWordSearch(true);
    setShowSettings(true);
  }, [onRequestDestination]);

  const openAppSettings = useCallback(() => {
    if (extendedDestinationsEnabled && onRequestDestination) {
      if (!actionLoadingRef.current) {
        onRequestDestination("settings");
      }
      return;
    }
    setSettingsInitialTab("instellingen");
    setSettingsInitialViewedListScope(null);
    setSettingsAutoFocusWordSearch(false);
    setShowSettings(true);
  }, [extendedDestinationsEnabled, onRequestDestination]);

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
      setSidebarTab("details");
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
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (actionLoadingRef.current) return;

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
        // Shift+I: Show word details in sidebar
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

      // Use the current card's mode for the click
      const clickMode = currentWord?.mode ?? enabledModes[0];

      // 1. Try exact match
      const entry = await fetchDictionaryEntry(clickedWord, user.id);

      if (!entry) {
        trainingDebug.log("No dictionary entry found for:", clickedWord);
        setWordLookupNotice(
          dictionaryLookupNotice(onboardingLang, clickedWord),
        );

        setRecentEntries((prev) => {
          const notFoundItem: SidebarHistoryItem = {
            id: `not-found-${clickedWord}-${Date.now()}`,
            headword: clickedWord,
            raw: {},
            source: "click",
            clickedWord: clickedWord,
            debugStats: {
              source: "click",
              mode: clickMode,
            },
          };

          // Dedup: avoid adding the same not-found word if it's already at the top
          if (
            prev.length > 0 &&
            prev[0].headword.toLowerCase() === clickedWord.toLowerCase() &&
            prev[0].id.startsWith("not-found-")
          ) {
            return prev;
          }

          return [notFoundItem, ...prev].slice(0, 50);
        });
        return;
      }

      trainingDebug.log("✅ Found entry:", entry.headword);
      setWordLookupNotice(null);
      setSelectedEntry(entry);
      handleShowDetails(entry);
      setRecentEntries((prev) => {
        const historyItem: SidebarHistoryItem = {
          ...entry,
          source: "click",
          clickedWord: clickedWord,
          is_nt2_2000: entry.is_nt2_2000,
          stats: entry.stats,
          debugStats: {
            source: "click",
            mode: clickMode,
          },
        };
        // Dedup logic? Maybe not for history log style.
        // User wants "history log".
        // But if I click same word twice, do I want two entries?
        // Let's filter out if it's the VERY top one to avoid accidental double clicks.
        if (
          prev.length > 0 &&
          prev[0].id === entry.id &&
          prev[0].source === "click"
        ) {
          return prev;
        }

        return [historyItem, ...prev].slice(0, 50);
      });
    },
    [
      currentWord?.mode,
      enabledModes,
      handleShowDetails,
      onboardingLang,
      user?.id,
    ],
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
      const scope = await persistListChange(list);
      if (!scope) return;
      const nextScenario = list.default_scenario_id ?? activeScenario;
      setActiveScenario(nextScenario, { persist: false });
      persistCurrentTrainingScope({
        listId: list.id,
        listType: list.type,
        activeScenario: nextScenario,
      });
      void loadStats({ listId: list.id, listType: list.type });
      void loadNextWord({
        scope: { listId: list.id, listType: list.type },
        scenario: nextScenario,
      });
    },
    [
      activeScenario,
      loadStats,
      loadNextWord,
      persistCurrentTrainingScope,
      persistListChange,
      setActiveScenario,
    ],
  );

  const handleFooterListChange = useCallback(
    async (value: string) => {
      const scope = await handleListSelectValue(value);
      if (!scope) return;
      const list = availableLists.find(
        (item) => item.id === scope.listId && item.type === scope.listType,
      );
      const nextScenario = list?.default_scenario_id ?? activeScenario;
      setActiveScenario(nextScenario, { persist: false });
      persistCurrentTrainingScope({
        listId: scope.listId,
        listType: scope.listType,
        activeScenario: nextScenario,
      });
      void loadStats(scope);
      void loadNextWord({ scope, scenario: nextScenario });
    },
    [
      activeScenario,
      availableLists,
      handleListSelectValue,
      loadNextWord,
      loadStats,
      persistCurrentTrainingScope,
      setActiveScenario,
    ],
  );

  const handleListsUpdated = useCallback(async () => {
    const reloadForList = (list: WordListSummary) => {
      const nextScenario = list.default_scenario_id ?? activeScenario;
      setActiveScenario(nextScenario, { persist: false });
      persistCurrentTrainingScope({
        listId: list.id,
        listType: list.type,
        activeScenario: nextScenario,
      });
      void loadStats({ listId: list.id, listType: list.type });
      void loadNextWord({
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
    loadNextWord,
    loadStats,
    persistCurrentTrainingScope,
    refreshListsAfterUpdate,
    setActiveScenario,
  ]);

  const handleRecentSelect = (entry: DictionaryEntry) => {
    setSelectedEntry(entry);
  };

  const handleModesChange = useCallback(
    (newModes: TrainingMode[]) => {
      setRevealed(false);
      setEnabledModes(newModes, { persist: false });
      persistCurrentTrainingScope({ modesEnabled: newModes });
    },
    [persistCurrentTrainingScope, setEnabledModes],
  );

  const handleScenarioChange = useCallback(
    (newScenario: string) => {
      trainingDebug.log("[Settings] Changing scenario to:", newScenario);
      setRevealed(false);
      setActiveScenario(newScenario, { persist: false });
      persistCurrentTrainingScope({ activeScenario: newScenario });
      // Load next word with the new scenario
      void loadNextWord({
        scope: { listId: wordListId, listType: wordListType },
        scenario: newScenario,
      });
    },
    [
      setActiveScenario,
      persistCurrentTrainingScope,
      loadNextWord,
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
    if (actionLoadingRef.current) {
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
  }, [canSwipe, handleAction, resetSwipe, showFirstTimeButtons, swipeOffset]);

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
    onCommitDraft: commitPilotSessionDraft,
    onRetry: () => loadNextWord(),
  });
  const handleEnterTrainingSession = useCallback(() => {
    reviewedInSessionRef.current.clear();
  }, []);
  const { cardOrdinal: sessionCardOrdinal } = useTrainingSessionPresentation({
    surface: trainingPilot.surface,
    presentedCardKey: currentWord
      ? trainingCardKey(currentWord, currentMode)
      : null,
    onEnterSession: handleEnterTrainingSession,
  });

  const legacyTrainingCard = (
    <TrainingCard
      word={currentWord}
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
            onContinue={trainingPilot.continueSession}
            onStart={trainingPilot.startSession}
            onRetry={() => void trainingPilot.retry()}
          />
        ) : (
          <>
            <main className="flex grow flex-col items-center overflow-hidden bg-background-light dark:bg-background-dark">
              {/* Content Container: Centered Group (Main + Sidebar side-by-side) */}
              {/* Adjusted max-width and gap to keep things tight and focused */}
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
                        data-training-v2-state={
                          v2SessionOwned ? v2SessionState : undefined
                        }
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
                          {trainingSessionV2Enabled && currentWord ? (
                            <TrainingSenseCardV2Session
                              key={`${user.id}:${currentWord.id}:${currentMode}:${currentTrainingLanguage}:${translationLang}`}
                              cacheOwnerId={user.id}
                              word={currentWord}
                              mode={currentMode}
                              contentLanguageCode={currentTrainingLanguage}
                              translationTargetLanguageCode={
                                translationLang === "off"
                                  ? null
                                  : translationLang
                              }
                              interfaceLanguage={onboardingLang}
                              fallback={legacyTrainingCard}
                              onPlayResolvedAudio={(url, label) =>
                                playAudio(url, label)
                              }
                              onOpenDetails={handleShowCurrentWordDetails}
                              onAvailabilityChange={setV2SessionState}
                              onProgressActionAccepted={
                                handleV2ProgressActionAccepted
                              }
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
                  {!v2SessionOwned ? (
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
          <TrainingKnownUndoNotice interfaceLanguage={onboardingLang} />
        ) : null}

        {wordLookupNotice ? (
          <div
            role="status"
            className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 shadow-xl dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            {wordLookupNotice}
          </div>
        ) : null}

        <TrainingSidebarDrawer
          open={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          title={sidebarTab === "recent" ? "Recent" : "Details"}
          showOnDesktop
        >
          <Sidebar
            selectedEntry={selectedEntry}
            recentEntries={recentEntries}
            onSelectEntry={(entry) => {
              // On mobile: tapping a recent item should actually open its details,
              // otherwise it looks like "nothing happens".
              setSelectedEntry(entry);
              handleShowDetails(entry);
            }}
            onWordClick={handleDefinitionClick}
            detailEntry={detailEntry}
            onShowDetails={handleShowDetails}
            activeTab={sidebarTab}
            onTabChange={setSidebarTab}
            userId={user.id}
            translationLang={translationLang}
            userLists={availableLists.filter((l) => l.type === "user")}
            onListsUpdated={handleListsUpdated}
            onOpenListMembership={openMembershipList}
            onUserDictionaryEntryCreated={handleUserDictionaryEntryCreated}
            onTrainWord={handleTrainWord}
            currentTrainingEntryId={currentWord?.id ?? null}
            onTrainingAction={(result) => void handleAction(result)}
            trainingActionDisabled={!revealed || actionLoading}
          />
        </TrainingSidebarDrawer>

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
