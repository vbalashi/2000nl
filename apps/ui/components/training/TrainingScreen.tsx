"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchDictionaryEntry,
  fetchNextTrainingWord,
  fetchNextTrainingWordByScenario,
  fetchTrainingWordById,
  fetchStats,
  fetchRecentHistory,
  fetchActiveList,
  fetchListSummaryById,
  fetchAvailableLists,
  updateActiveList,
  recordDefinitionClick,
  recordReview,
  recordWordView,
  fetchLastReviewDebug,
  fetchUserPreferences,
  updateUserPreferences,
  ReviewResult,
} from "@/lib/trainingService";
import type {
  CardFilter,
  DetailedStats,
  DictionaryEntry,
  QueueTurn,
  TrainingMode,
  TrainingWord,
  SidebarHistoryItem,
  WordListSummary,
  WordListType,
} from "@/lib/types";
import { BrandLogo } from "@/components/BrandLogo";
import { TrainingCard } from "./TrainingCard";
import { Sidebar, SidebarTab } from "./Sidebar";
import { TrainingSidebarDrawer } from "./TrainingSidebarDrawer";
import { FooterStats } from "./FooterStats";
import { HotkeyDialog } from "./HotkeyDialog";
import { SettingsModal } from "./SettingsModal";

type Props = {
  user: User;
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

export type ThemePreference = "light" | "dark" | "system";

export function TrainingScreen({ user }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [translationTooltipOpen, setTranslationTooltipOpen] = useState(false);
  const [currentWord, setCurrentWord] = useState<TrainingWord | null>(null);
  const [enabledModes, setEnabledModesState] = useState<TrainingMode[]>([
    "word-to-definition",
  ]);
  const [cardFilter, setCardFilterState] = useState<CardFilter>("both");
  const [selectedEntry, setSelectedEntry] = useState<DictionaryEntry | null>(
    null
  );
  const [recentEntries, setRecentEntries] = useState<SidebarHistoryItem[]>([]);
  // Sidebar tabs: "recent" for history, "details" for word detail panel
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("recent");
  // Drawer for sidebar (recent/details). On desktop, it is used when sidebar is not pinned.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [trainingSidebarPinned, setTrainingSidebarPinnedState] = useState(false);
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
  const [language, setLanguageState] = useState("nl");
  const [wordListId, setWordListId] = useState<string | null>(null);
  const [wordListType, setWordListType] = useState<WordListType | null>(null);
  const [wordListLabel, setWordListLabel] = useState<string>("");
  const [availableLists, setAvailableLists] = useState<WordListSummary[]>([]);
  const [loadingWord, setLoadingWord] = useState(true);
  const [listHydrated, setListHydrated] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    "woordenlijst" | "statistieken" | "instellingen"
  >("instellingen");
  const [settingsAutoFocusWordSearch, setSettingsAutoFocusWordSearch] =
    useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [themePreference, setThemePreference] =
    useState<ThemePreference>("system");
  const [translationLang, setTranslationLangState] = useState<string | null>(
    null
  );
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const toggleHint = useCallback(() => {
    setHintRevealed((prev) => !prev);
  }, []);

  // Queue rotation state for round-robin between new and review queues
  const [queueTurn, setQueueTurn] = useState<QueueTurn>("new");
  const [reviewCounter, setReviewCounter] = useState(0);
  const [newReviewRatio, setNewReviewRatioState] = useState(2);

  // Scenario-based training
  const [activeScenario, setActiveScenarioState] =
    useState<string>("understanding");

  // Ref to prevent race conditions: track if initial load has been done
  const initialLoadDone = useRef(false);
  // Ref to prevent concurrent loadNextWord calls
  const loadingInProgress = useRef(false);
  // Ref: when set, force this word as the *next* card once.
  const forcedNextWordIdRef = useRef<string | null>(null);

  // Get the current mode for the active card (from the card itself, or fallback to first enabled mode)
  const currentMode: TrainingMode =
    currentWord?.mode ?? enabledModes[0] ?? "word-to-definition";

  const revealAnswer = useCallback(() => {
    setTranslationTooltipOpen(false);
    setRevealed(true);
  }, []);

  const refreshAvailableLists = useCallback(async () => {
    if (!user?.id) return;
    const lists = await fetchAvailableLists(user.id, language);
    setAvailableLists(lists);
  }, [language, user?.id]);

  // Load user preferences from Supabase
  useEffect(() => {
    if (!user?.id) return;

    const loadPreferences = async () => {
      const prefs = await fetchUserPreferences(user.id);
      console.log("[Settings] Loaded preferences from Supabase:", prefs);
      setThemePreference(prefs.themePreference);
      setEnabledModesState(prefs.modesEnabled);
      setCardFilterState(prefs.cardFilter);
      setLanguageState(prefs.languageCode);
      setNewReviewRatioState(prefs.newReviewRatio);
      setActiveScenarioState(prefs.activeScenario);
      setTranslationLangState(prefs.translationLang);
      setTrainingSidebarPinnedState(Boolean(prefs.trainingSidebarPinned));
    };

    void loadPreferences();
  }, [user?.id]);

  const setTrainingSidebarPinned = useCallback(
    (pinned: boolean) => {
      setTrainingSidebarPinnedState(pinned);
      if (user?.id) {
        void updateUserPreferences({
          userId: user.id,
          trainingSidebarPinned: pinned,
        });
      }
    },
    [user?.id]
  );

  const toggleTrainingSidebarPinned = useCallback(() => {
    setTrainingSidebarPinnedState((prev) => {
      const next = !prev;
      if (user?.id) {
        void updateUserPreferences({
          userId: user.id,
          trainingSidebarPinned: next,
        });
      }
      return next;
    });

    if (typeof window !== "undefined") {
      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      // Switching pin state should close the drawer to avoid double UI.
      if (isDesktop) {
        setMobileSidebarOpen(false);
      }
    }
  }, [user?.id]);

  const toggleRecentPanel = useCallback(() => {
    if (typeof window === "undefined") return;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;

    if (isDesktop) {
      // Desktop: toggle the pinned sidebar on/off (persisted).
      setSidebarTab("recent");
      toggleTrainingSidebarPinned();
      return;
    }

    // Mobile/tablet: toggle the drawer open/closed (not persisted).
    setSidebarTab("recent");
    setMobileSidebarOpen((prev) => !prev);
  }, [toggleTrainingSidebarPinned]);

  // Wrapper to persist enabled modes to Supabase
  const setEnabledModes = useCallback(
    (newModes: TrainingMode[]) => {
      console.log("[Settings] Saving modes to Supabase:", newModes);
      setEnabledModesState(newModes);
      if (user?.id) {
        void updateUserPreferences({ userId: user.id, modesEnabled: newModes });
      }
    },
    [user?.id]
  );

  // Wrapper to persist card filter to Supabase
  const setCardFilter = useCallback(
    (newFilter: CardFilter) => {
      console.log("[Settings] Saving card filter to Supabase:", newFilter);
      setCardFilterState(newFilter);
      // Reset queue rotation when switching to 'both' to start interleave cycle
      if (newFilter === "both") {
        setQueueTurn("new");
        setReviewCounter(0);
      }
      if (user?.id) {
        void updateUserPreferences({ userId: user.id, cardFilter: newFilter });
      }
    },
    [user?.id]
  );

  // Wrapper to persist language to Supabase
  const setLanguage = useCallback(
    (newLanguage: string) => {
      console.log("[Settings] Saving language to Supabase:", newLanguage);
      setLanguageState(newLanguage);
      if (user?.id) {
        void updateUserPreferences({
          userId: user.id,
          languageCode: newLanguage,
        });
      }
    },
    [user?.id]
  );

  // Wrapper to persist theme to Supabase
  const setTheme = useCallback(
    (newTheme: ThemePreference) => {
      console.log("[Settings] Saving theme to Supabase:", newTheme);
      setThemePreference(newTheme);
      if (user?.id) {
        void updateUserPreferences({
          userId: user.id,
          themePreference: newTheme,
        });
      }
    },
    [user?.id]
  );

  // Wrapper to persist new/review ratio to Supabase
  const setNewReviewRatio = useCallback(
    (newRatio: number) => {
      console.log("[Settings] Saving new/review ratio to Supabase:", newRatio);
      setNewReviewRatioState(newRatio);
      if (user?.id) {
        void updateUserPreferences({
          userId: user.id,
          newReviewRatio: newRatio,
        });
      }
    },
    [user?.id]
  );

  // Wrapper to persist translation language preference to Supabase
  const setTranslationLang = useCallback(
    (newLang: string | null) => {
      console.log(
        "[Settings] Saving translation language to Supabase:",
        newLang
      );
      setTranslationLangState(newLang);
      if (user?.id) {
        void updateUserPreferences({
          userId: user.id,
          translationLang: newLang,
        });
      }
    },
    [user?.id]
  );

  // Wrapper to persist active scenario to Supabase
  const setActiveScenario = useCallback(
    (newScenario: string) => {
      console.log(
        "[Settings] Saving active scenario to Supabase:",
        newScenario
      );
      setActiveScenarioState(newScenario);
      if (user?.id) {
        void updateUserPreferences({
          userId: user.id,
          activeScenario: newScenario,
        });
      }
    },
    [user?.id]
  );

  // Advance queue turn for round-robin between new and review
  const advanceQueueTurn = useCallback(() => {
    // Only use round-robin when card filter is 'both'
    if (cardFilter !== "both") {
      setQueueTurn("auto");
      return;
    }

    if (queueTurn === "new") {
      // After a new card, switch to review queue
      setQueueTurn("review");
      setReviewCounter(0);
    } else {
      // After a review card, count up and potentially switch to new
      const nextCount = reviewCounter + 1;
      if (nextCount >= newReviewRatio) {
        setQueueTurn("new");
        setReviewCounter(0);
      } else {
        setReviewCounter(nextCount);
      }
    }
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

  useEffect(() => {
    if (!user?.id) return;
    const hydrateActiveList = async () => {
      const active = await fetchActiveList(user.id);
      if (active.listId) {
        const listType = active.listType ?? "curated";
        const resolved = await fetchListSummaryById({
          userId: user.id,
          listId: active.listId,
          listType,
        });

        if (!resolved) {
          // list no longer exists (or not accessible) → will auto-select primary via effect
          await updateActiveList({
            userId: user.id,
            listId: null,
            listType: null,
          });
          setWordListId(null);
          setWordListType(null);
          setWordListLabel("");
          setListHydrated(true);
          return;
        }

        setWordListId(resolved.id);
        setWordListType(resolved.type);
        setWordListLabel(resolved.name);
      } else {
        // No active list saved → will auto-select primary via effect
        setWordListId(null);
        setWordListType(null);
        setWordListLabel("");
      }
      setListHydrated(true);
    };
    void hydrateActiveList();
  }, [user?.id]);

  useEffect(() => {
    void refreshAvailableLists();
  }, [refreshAvailableLists, showSettings]);

  // Auto-select primary list when lists load and no list is selected
  useEffect(() => {
    if (listHydrated && !wordListId && availableLists.length > 0) {
      const primary = availableLists[0];
      setWordListId(primary.id);
      setWordListType(primary.type);
      setWordListLabel(primary.name);
    }
  }, [listHydrated, wordListId, availableLists]);

  const loadStats = useCallback(
    async (
      scope?: { listId?: string | null; listType?: WordListType | null },
      logContext?: string,
      isInitialLoad?: boolean
    ) => {
      if (!user?.id) {
        return;
      }
      const effectiveListId = scope?.listId ?? wordListId;
      const effectiveListType = scope?.listType ?? wordListType;
      const fresh = await fetchStats(
        user.id,
        enabledModes,
        {
          listId: effectiveListId ?? undefined,
          listType: effectiveListType ?? undefined,
        },
        logContext
      );

      // On initial load, capture the fixed Y value for HERHALING
      // This should not change during the session
      if (isInitialLoad || initialReviewDue === null) {
        const totalReviewDue = fresh.reviewCardsDone + fresh.reviewCardsDue;
        setInitialReviewDue(totalReviewDue);
        console.log(
          `%c 📌 Fixed HERHALING Y = ${totalReviewDue} (session start)`,
          "color: #f59e0b; font-weight: bold;"
        );
      }

      setStats(fresh);
    },
    [user?.id, enabledModes, wordListId, wordListType, initialReviewDue]
  );

  const loadRecentHistory = useCallback(async () => {
    if (!user?.id) {
      return;
    }
    const history = await fetchRecentHistory(user.id);
    setRecentEntries(history);
  }, [user?.id]);

  const loadNextWord = useCallback(
    async (
      excludeWordIds: string[] = [],
      scope?: { listId?: string | null; listType?: WordListType | null },
      overrideQueueTurn?: QueueTurn
    ) => {
      if (!user?.id) {
        return;
      }

      // Prevent concurrent calls - if already loading, skip this call
      if (loadingInProgress.current) {
        console.log(
          "%c loadNextWord skipped (already loading)",
          "color: #f59e0b"
        );
        return;
      }
      loadingInProgress.current = true;
      setLoadingWord(true);
      setRevealed(false); // Reset reveal state for new word
      setHintRevealed(false); // Reset hint state for new word
      const effectiveListId = scope?.listId ?? wordListId;
      const effectiveListType = scope?.listType ?? wordListType;
      const effectiveQueueTurn = overrideQueueTurn ?? queueTurn;
      try {
        const forcedId = forcedNextWordIdRef.current;
        if (forcedId) {
          forcedNextWordIdRef.current = null;
          const forced = await fetchTrainingWordById(forcedId);
          if (forced) {
            const mode = enabledModes[0] ?? "word-to-definition";
            void recordWordView({ userId: user.id, wordId: forced.id, mode });
            setCurrentWord({
              ...forced,
              mode,
              debugStats: { source: "forced", mode },
            });
            return;
          }
          // If we couldn't fetch it, fall back to normal selection.
        }

        // Use scenario-based word selection
        const nextWord = await fetchNextTrainingWordByScenario(
          user.id,
          activeScenario,
          excludeWordIds,
          {
            listId: effectiveListId ?? undefined,
            listType: effectiveListType ?? undefined,
          },
          cardFilter,
          effectiveQueueTurn
        );
        if (nextWord) {
          // Fire and forget view recording, or await if we want strict consistency
          // Use the mode from the fetched word (or fallback to first enabled mode)
          const wordMode = nextWord.mode ?? enabledModes[0];
          void recordWordView({
            userId: user.id,
            wordId: nextWord.id,
            mode: wordMode,
          });
          setCurrentWord(nextWord);
        } else {
          setCurrentWord(null);
        }
      } finally {
        loadingInProgress.current = false;
        setLoadingWord(false);
      }
    },
    [
      activeScenario,
      enabledModes,
      cardFilter,
      queueTurn,
      user?.id,
      wordListId,
      wordListType,
    ]
  );

  const handleTrainWord = useCallback(
    (wordId: string) => {
      forcedNextWordIdRef.current = wordId;
      setShowSettings(false);
      void loadNextWord(
        [currentWord?.id].filter((x): x is string => Boolean(x))
      );
    },
    [currentWord?.id, loadNextWord]
  );

  // ... (keep useEffect for initial load)

  const handleAction = useCallback(
    async (result: ReviewResult) => {
      // Any action (button or hotkey) should close the translation overlay.
      setTranslationTooltipOpen(false);
      if (!user?.id || !currentWord) {
        return;
      }

      // Use the mode from the current word (which was set when the word was fetched)
      const wordMode = currentWord.mode ?? enabledModes[0];

      // Capture BEFORE values from current word's debugStats
      const beforeInterval = currentWord.debugStats?.interval;
      const beforeStability = currentWord.debugStats?.ef;
      const cardSource = currentWord.debugStats?.source ?? "unknown";

      // Log before stats
      console.log(
        `%c 📊 Stats [BEFORE ${currentWord.headword}]:`,
        "color: #8b5cf6; font-weight: bold;",
        `NIEUW: ${stats.newCardsToday}/${stats.dailyNewLimit}`,
        `| HERHALING: ${stats.reviewCardsDone}/${
          stats.reviewCardsDone + stats.reviewCardsDue
        }`,
        `| TOTAAL: ${stats.totalWordsLearned}/${stats.totalWordsInList}`
      );

      setActionLoading(true);
      const updatedStatus = await recordReview({
        userId: user.id,
        wordId: currentWord.id,
        mode: wordMode,
        result,
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
          suffix = ""
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

        console.log(
          `%c ✓ Review: ${currentWord.headword} (${cardSource} → ${result})`,
          "color: #10b981; font-weight: bold;",
          intervalDelta ? `int:${intervalDelta}` : "",
          stabilityDelta ? `S:${stabilityDelta}` : "",
          graduationNote
        );

        // FSRS debug: elapsed days, retrievability R, same-day flag (from DB log metadata)
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
          console.log(
            `%c   ↳ FSRS debug:`,
            "color: #6b7280;",
            elapsed != null ? `elapsed=${elapsed.toFixed(4)}d` : "",
            r != null ? `R=${r.toFixed(4)}` : "",
            sameDay != null ? `same_day=${sameDay}` : "",
            debug?.scheduled_at ? `scheduled_at=${debug.scheduled_at}` : "",
            debug?.reviewed_at ? `reviewed_at=${debug.reviewed_at}` : ""
          );
        }

        // Explain what should happen to stats
        if (wasNew) {
          console.log(
            `%c   → review_type='new' logged → NIEUW counter should +1`,
            "color: #6b7280;"
          );
        } else {
          console.log(
            `%c   → review_type='review' logged → HERHALING done counter should +1`,
            "color: #6b7280;"
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
              (dueAt - now) / (1000 * 60 * 60 * 24)
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

      // Advance the queue turn for round-robin
      advanceQueueTurn();

      await loadStats(undefined, `AFTER ${currentWord.headword} (${result})`);
      await loadNextWord([currentWord.id]);
      setActionLoading(false);
    },
    [
      advanceQueueTurn,
      currentWord,
      enabledModes,
      loadNextWord,
      loadStats,
      stats,
      user?.id,
    ]
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
    loadNextWord();
    loadStats(undefined, "INITIAL LOAD", true); // isInitialLoad = true to set fixed Y
    void loadRecentHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, listHydrated]);

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

  const openMobileRecent = useCallback(() => {
    // Kept for backwards compatibility with existing handlers.
    toggleRecentPanel();
  }, [toggleRecentPanel]);

  const openMobileSidebarTab = useCallback((tab: SidebarTab) => {
    if (typeof window === "undefined") return;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    // On desktop, only open the drawer when the sidebar is NOT pinned.
    if (isDesktop && trainingSidebarPinned) return;
    setSidebarTab(tab);
    setMobileSidebarOpen(true);
  }, [trainingSidebarPinned]);

  const openSearch = useCallback(() => {
    setSettingsInitialTab("woordenlijst");
    setSettingsAutoFocusWordSearch(true);
    setShowSettings(true);
  }, []);

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

      const normalized = event.key.toLowerCase();

      if (normalized === "t") {
        if (!revealed) return;
        event.preventDefault();
        setTranslationTooltipOpen((prev) => !prev);
        return;
      }

      if (normalized === "r") {
        // Toggle Recent panel:
        // - Desktop: show/hide sidebar (persisted)
        // - Tablet/mobile: open/close drawer
        event.preventDefault();
        toggleRecentPanel();
        return;
      }

      if (normalized === "escape") {
        setTranslationTooltipOpen(false);
        return;
      }

      // Any other hotkey closes translation overlay.
      if (translationTooltipOpen) {
        setTranslationTooltipOpen(false);
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
    translationTooltipOpen,
  ]);

  const handleDefinitionClick = useCallback(
    async (clickedWord: string) => {
      console.log("🔍 Word clicked:", clickedWord);
      setTranslationTooltipOpen(false);

      if (!user?.id) {
        console.log("❌ No user ID");
        return;
      }

      // Use the current card's mode for the click
      const clickMode = currentWord?.mode ?? enabledModes[0];

      // 1. Try exact match
      const entry = await fetchDictionaryEntry(clickedWord, user.id);

      if (!entry) {
        // Word not found in dictionary - still add to sidebar with "not found" indicator
        console.log("No dictionary entry found for:", clickedWord);

        // On mobile, open the Recent drawer so the user sees that something happened.
        openMobileSidebarTab("recent");

        // Add a placeholder entry to the sidebar showing the word wasn't found
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

      console.log("✅ Found entry:", entry.headword);
      setSelectedEntry(entry);
      // On mobile, open the Recent drawer so the user sees that something happened.
      openMobileSidebarTab("recent");
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
      await recordDefinitionClick({
        userId: user.id,
        wordId: entry.id,
        mode: clickMode,
      });
    },
    [currentWord?.mode, enabledModes, openMobileSidebarTab, user?.id]
  );

  const handleListChange = useCallback(
    async (list: WordListSummary) => {
      setWordListId(list.id);
      setWordListType(list.type);
      setWordListLabel(list.name);

      if (user?.id) {
        await updateActiveList({
          userId: user.id,
          listId: list.id,
          listType: list.type,
        });
      }

      void loadStats({ listId: list.id, listType: list.type });
      void loadNextWord([], { listId: list.id, listType: list.type });
    },
    [user?.id, loadStats, loadNextWord]
  );

  // When no list is selected, use the first available (primary) list
  const activeListValue = wordListId
    ? `${wordListType ?? "curated"}:${wordListId}`
    : availableLists[0]
    ? `${availableLists[0].type}:${availableLists[0].id}`
    : "";

  const listOptions = availableLists.map((list) => ({
    value: `${list.type}:${list.id}`,
    label: list.name,
  }));

  const handleFooterListChange = useCallback(
    async (value: string) => {
      const [type, id] = value.split(":");
      const found = availableLists.find((l) => l.id === id && l.type === type);
      if (found) {
        await handleListChange(found);
      }
    },
    [availableLists, handleListChange]
  );

  const handleListsUpdated = useCallback(async () => {
    // After create/delete in SettingsModal, refresh options and re-hydrate active list
    // so the footer dropdown can't show stale (deleted) lists.
    if (!user?.id) return;
    const lists = await fetchAvailableLists(user.id, language);
    setAvailableLists(lists);

    const active = await fetchActiveList(user.id);
    if (active.listId) {
      const listType = active.listType ?? "curated";
      const resolved = await fetchListSummaryById({
        userId: user.id,
        listId: active.listId,
        listType,
      });

      if (resolved) {
        setWordListId(resolved.id);
        setWordListType(resolved.type);
        setWordListLabel(resolved.name);
        void loadStats({ listId: resolved.id, listType: resolved.type });
        void loadNextWord([], { listId: resolved.id, listType: resolved.type });
        return;
      }
      // List no longer exists, fall through to select primary
    }

    // No active list or list was deleted - select primary list
    const primary = lists[0];
    if (primary) {
      await updateActiveList({
        userId: user.id,
        listId: primary.id,
        listType: primary.type,
      });
      setWordListId(primary.id);
      setWordListType(primary.type);
      setWordListLabel(primary.name);
      void loadStats({ listId: primary.id, listType: primary.type });
      void loadNextWord([], { listId: primary.id, listType: primary.type });
    }
  }, [language, loadNextWord, loadStats, user?.id]);

  const handleRecentSelect = (entry: DictionaryEntry) => {
    setSelectedEntry(entry);
  };

  const handleModesChange = useCallback(
    (newModes: TrainingMode[]) => {
      setRevealed(false);
      setEnabledModes(newModes);
    },
    [setEnabledModes]
  );

  const handleScenarioChange = useCallback(
    (newScenario: string) => {
      console.log("[Settings] Changing scenario to:", newScenario);
      setRevealed(false);
      setActiveScenario(newScenario);
      // Load next word with the new scenario
      void loadNextWord([], { listId: wordListId, listType: wordListType });
    },
    [setActiveScenario, loadNextWord, wordListId, wordListType]
  );

  const handleCardFilterChange = useCallback(
    (newFilter: CardFilter) => {
      setCardFilter(newFilter);
    },
    [setCardFilter]
  );

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
    const { error: localError } = await supabase.auth.signOut({ scope: "local" });
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

  useEffect(() => {
    if (!accountMenuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!accountMenuRef.current) return;
      if (accountMenuRef.current.contains(target)) return;
      setAccountMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  const themeTitle =
    themePreference === "light"
      ? "Thema: Licht"
      : themePreference === "dark"
      ? "Thema: Donker"
      : "Thema: Systeem";

  const renderThemeIcon = () => {
    if (themePreference === "dark") {
      return (
        <svg
          className="h-5 w-5 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
          />
        </svg>
      );
    }

    if (themePreference === "system") {
      // Sun/moon split icon with diagonal divider
      return (
        <svg
          className="h-5 w-5 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {/* Sun half (left side) */}
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v1m0 0a8 8 0 010 16m0-16a8 8 0 000 16m0 0v1"
          />
          {/* Sun rays on left */}
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4.22 4.22l.7.7M3 12h1M4.22 19.78l.7-.7"
          />
          {/* Diagonal divider */}
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M6 18L18 6"
          />
          {/* Moon on right side */}
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 12a4 4 0 01-4 4"
            fill="currentColor"
            fillOpacity={0.3}
          />
        </svg>
      );
    }

    return (
      <svg
        className="w-5 h-5 pointer-events-none"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    );
  };

  return (
    <div className="flex h-screen h-[100dvh] flex-col bg-background-light text-slate-900 overflow-hidden dark:bg-background-dark dark:text-slate-100">
      <header className="relative z-40 flex flex-none items-center justify-between border-b border-slate-200 bg-white/80 px-3 py-2 md:px-6 md:py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 min-w-0 items-center gap-2 md:h-10">
            <div
              role="button"
              tabIndex={0}
              title={themeTitle}
              aria-label={themeTitle}
              className="relative z-10 flex shrink-0 items-center justify-center h-9 w-9 md:h-10 md:w-10 rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm cursor-pointer transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={cycleThemePreference}
              onKeyDown={(e) => e.key === "Enter" && cycleThemePreference()}
            >
              {renderThemeIcon()}
              <span className="absolute inset-0 rounded-full" />
            </div>
            <BrandLogo />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
          <div
            role="button"
            tabIndex={0}
            title="Zoeken"
            aria-label="Zoeken"
            className="relative z-10 flex shrink-0 items-center justify-center h-9 w-9 md:h-10 md:w-10 rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm cursor-pointer transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            onClick={openSearch}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              openSearch();
            }}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span className="absolute inset-0 rounded-full" />
          </div>

          <div
            role="button"
            tabIndex={0}
            title="Instellingen"
            aria-label="Instellingen"
            className="relative z-10 hidden md:flex shrink-0 items-center justify-center h-9 w-9 md:h-10 md:w-10 rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm cursor-pointer transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            onClick={() => {
              setSettingsInitialTab("instellingen");
              setSettingsAutoFocusWordSearch(false);
              setShowSettings(true);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              setSettingsInitialTab("instellingen");
              setSettingsAutoFocusWordSearch(false);
              setShowSettings(true);
            }}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="absolute inset-0 rounded-full" />
          </div>

          <div
            role="button"
            tabIndex={0}
            title="Hotkeys"
            aria-label="Hotkeys"
            className="relative z-10 flex shrink-0 items-center justify-center h-9 w-9 md:h-10 md:w-10 rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm cursor-pointer transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            onClick={() => setShowHotkeys(true)}
            onKeyDown={(e) => e.key === "Enter" && setShowHotkeys(true)}
          >
            <span className="text-base font-semibold">?</span>
            <span className="absolute inset-0 rounded-full" />
          </div>

          {/* Mobile-only: open Recent/Details drawer */}
          <div
            role="button"
            tabIndex={0}
            title={trainingSidebarPinned ? "Sidebar verbergen" : "Sidebar tonen"}
            aria-label={trainingSidebarPinned ? "Sidebar verbergen" : "Sidebar tonen"}
            className={`relative z-10 flex shrink-0 items-center justify-center h-9 w-9 md:h-10 md:w-10 rounded-full border shadow-sm cursor-pointer transition ${
              trainingSidebarPinned
                ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-900/25 dark:text-blue-200 dark:hover:bg-blue-900/35"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            }`}
            onClick={toggleRecentPanel}
            onKeyDown={(e) => e.key === "Enter" && toggleRecentPanel()}
          >
            <svg
              className="h-5 w-5 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 2"
              />
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
            </svg>
            <span className="absolute inset-0 rounded-full" />
          </div>

          <div ref={accountMenuRef} className="relative z-50">
            <button
              type="button"
              title="Account"
              aria-label="Account"
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              className="relative z-10 flex shrink-0 items-center justify-center h-9 w-9 md:h-10 md:w-10 rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm cursor-pointer transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={() => setAccountMenuOpen((v) => !v)}
            >
              <svg
                className="h-5 w-5 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 21a9 9 0 110-18 9 9 0 010 18z"
                />
              </svg>
              <span className="absolute inset-0 rounded-full" />
            </button>

            {accountMenuOpen && (
              <div
                role="menu"
                aria-label="Account menu"
                className="absolute right-0 mt-2 z-50 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 backdrop-blur dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                    Ingelogd als
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {user.email}
                  </p>
                </div>
                <div className="border-t border-slate-100 dark:border-slate-800" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setAccountMenuOpen(false);
                    await handleSignOut();
                  }}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                >
                  Afmelden
                  <span className="text-xs font-bold uppercase tracking-wide opacity-60">
                    ↵
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex grow flex-col items-center overflow-hidden bg-background-light dark:bg-background-dark">
        {/* Content Container: Centered Group (Main + Sidebar side-by-side) */}
        {/* Adjusted max-width and gap to keep things tight and focused */}
        <div className="flex h-full w-full max-w-[1200px] flex-row justify-center gap-2 px-1 py-3 md:gap-4 md:px-4 lg:gap-6 lg:px-6">
          {/* Left/Main Column: Constrained to max-w-2xl to match Card width exactly */}
          <section className="flex flex-1 w-full max-w-2xl flex-col h-full overflow-visible rounded-3xl bg-transparent">
            {/* 1. Scrollable Card Area */}
            <div className="flex-1 overflow-y-auto overflow-x-visible scrollbar-hide flex flex-col px-2 md:px-4">
              {/* Card Container */}
              <div className="flex min-h-full flex-col justify-start md:justify-center py-2 md:py-4">
                {/* 16/10 Aspect Ratio Card on desktop, auto on mobile */}
                <div className="mx-auto w-full h-auto min-h-[350px] md:aspect-[16/10] md:min-h-[400px] mb-6 md:mb-8">
                  <TrainingCard
                    word={currentWord}
                    mode={currentMode}
                    revealed={revealed}
                    hintRevealed={hintRevealed}
                    loading={loadingWord}
                    highlightedWord={selectedEntry?.headword}
                    onWordClick={handleDefinitionClick}
                    userId={user.id}
                    translationLang={translationLang}
                    translationTooltipOpen={translationTooltipOpen}
                    onTranslationTooltipOpenChange={setTranslationTooltipOpen}
                    onToggleHint={toggleHint}
                    onRequestReveal={revealAnswer}
                    onShowDetails={handleShowCurrentWordDetails}
                  />
                </div>
              </div>
            </div>

            {/* 2. Fixed Buttons Area (Always Visible) */}
            <div className="flex-none pt-4 pb-2 z-10">
              {/* Translucent container for buttons */}
              <div className="w-full rounded-2xl bg-white/50 backdrop-blur-sm p-3 border border-white/20 shadow-lg dark:bg-slate-900/50 dark:border-slate-800/50 transition-all duration-300">
                {revealed ? (
                  <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {/* Primary Actions Only (Thinner) */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 w-full">
                      {(
                        ["fail", "hard", "success", "easy"] as ReviewResult[]
                      ).map((actionKey) => {
                        const { label, keyHint, tone } =
                          ACTION_LABELS[actionKey];
                        return (
                          <button
                            key={actionKey}
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleAction(actionKey)}
                            className={`flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs md:text-sm font-semibold uppercase tracking-wide transition shadow-sm hover:shadow-md disabled:cursor-wait disabled:opacity-60 ${buttonStyles[tone]}`}
                          >
                            <span>{label}</span>
                            <span className="text-[10px] md:text-xs font-normal opacity-70">
                              ({keyHint})
                            </span>
                          </button>
                        );
                      })}
                    </div>
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
          </section>

          {/* Sidebar Section: Fixed Width, adjacent to Main */}
          {trainingSidebarPinned && (
            <aside className="hidden h-full w-[300px] shrink-0 flex-col lg:flex xl:w-[350px]">
              <Sidebar
                selectedEntry={selectedEntry}
                recentEntries={recentEntries}
                onSelectEntry={handleRecentSelect}
                onWordClick={handleDefinitionClick}
                detailEntry={detailEntry}
                onShowDetails={handleShowDetails}
                activeTab={sidebarTab}
                onTabChange={setSidebarTab}
                userId={user.id}
                translationLang={translationLang}
                userLists={availableLists.filter((l) => l.type === "user")}
                onListsUpdated={handleListsUpdated}
                onTrainWord={handleTrainWord}
                currentTrainingEntryId={currentWord?.id ?? null}
                onTrainingAction={(result) => void handleAction(result)}
                trainingActionDisabled={!revealed || actionLoading}
              />
            </aside>
          )}
        </div>
      </main>

      <FooterStats
        stats={stats}
        enabledModes={enabledModes}
        cardFilter={cardFilter}
        onModesChange={handleModesChange}
        onCardFilterChange={handleCardFilterChange}
        language={language}
        onLanguageChange={setLanguage}
        activeListName={wordListLabel}
        activeListValue={activeListValue}
        listOptions={listOptions}
        onListChange={handleFooterListChange}
        onOpenSettings={() => setShowSettings(true)}
        activeScenarioName={
          activeScenario === "understanding"
            ? "Begrip"
            : activeScenario === "listening"
            ? "Luisteren"
            : activeScenario === "conjugation"
            ? "Vervoegingen"
            : activeScenario
        }
        initialReviewDue={initialReviewDue}
      />

      <TrainingSidebarDrawer
        open={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        title={sidebarTab === "recent" ? "Recent" : "Details"}
        showOnDesktop={!trainingSidebarPinned}
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
          onTrainWord={handleTrainWord}
          currentTrainingEntryId={currentWord?.id ?? null}
          onTrainingAction={(result) => void handleAction(result)}
          trainingActionDisabled={!revealed || actionLoading}
        />
      </TrainingSidebarDrawer>

      {showHotkeys && <HotkeyDialog onClose={() => setShowHotkeys(false)} />}
      {showSettings && (
        <SettingsModal
          open={showSettings}
          onClose={() => {
            setShowSettings(false);
            setSettingsInitialTab("instellingen");
            setSettingsAutoFocusWordSearch(false);
          }}
          initialTab={settingsInitialTab}
          autoFocusWordSearch={settingsAutoFocusWordSearch}
          onListsUpdated={handleListsUpdated}
          themePreference={themePreference}
          onThemeChange={setTheme}
          language={language}
          onLanguageChange={setLanguage}
          translationLang={translationLang}
          onTranslationLangChange={setTranslationLang}
          wordListId={wordListId}
          wordListType={wordListType}
          onListChange={handleListChange}
          enabledModes={enabledModes}
          cardFilter={cardFilter}
          onModesChange={handleModesChange}
          onCardFilterChange={handleCardFilterChange}
          newReviewRatio={newReviewRatio}
          onNewReviewRatioChange={setNewReviewRatio}
          stats={stats}
          userEmail={user.email ?? ""}
          userId={user.id}
          activeScenario={activeScenario}
          onScenarioChange={handleScenarioChange}
          onTrainWord={handleTrainWord}
        />
      )}
    </div>
  );
}
