import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAvailableLists,
  fetchTrainingScenarios,
} from "@/lib/trainingService";
import type {
  CardFilter,
  DetailedStats,
  DictionaryEntry,
  EntryLearningListMembership,
  TrainingScenario,
  WordListSummary,
  WordListType,
} from "@/lib/types";
import type { TrainingMode } from "@/lib/types";
import type { ThemePreference } from "@/lib/training/useTrainingPreferences";
import { DropUpSelect } from "./DropUpSelect";
import { EffectiveTrainingScopeSummary } from "./EffectiveTrainingScopeSummary";
import {
  createDictionarySearchTabState,
  DictionarySearchTab,
  type DictionarySearchTabState,
} from "./wordlist/DictionarySearchTab";
import { WordListTab } from "./wordlist/WordListTab";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { appVersionInfo } from "@/lib/appVersion";
import type { AudioQuality } from "@/lib/audio/types";

type TabKey = "zoeken" | "lijsten" | "statistieken" | "instellingen";

type ViewedListScope = {
  id: string;
  type: WordListType;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Which tab to show when the modal is opened. Defaults to "instellingen". */
  initialTab?: TabKey;
  /** When opening on "zoeken", focus the query/search input. */
  autoFocusWordSearch?: boolean;
  initialViewedListScope?: ViewedListScope | null;
  onListsUpdated?: () => void;
  themePreference: ThemePreference;
  onThemeChange: (pref: ThemePreference) => void;
  audioQuality: AudioQuality;
  onAudioQualityChange: (quality: AudioQuality) => void;
  onboardingLanguage: OnboardingLanguage;
  onOnboardingLanguageChange: (lang: OnboardingLanguage) => void;
  onStartOnboarding: () => void;
  language: string;
  onLanguageChange: (value: string) => void;
  languageOptions?: Array<{ value: string; label: string }>;
  defaultLanguage: string;
  onDefaultLanguageChange: (value: string) => void;
  translationLang: string | null;
  onTranslationLangChange: (value: string | null) => void;
  wordListId: string | null;
  wordListType: WordListType | null;
  activeTrainingList: WordListSummary | null;
  onMakeActiveForTraining: (value: WordListSummary) => void;
  onUserDictionaryEntryCreated?: (entry: DictionaryEntry) => void;
  /** @deprecated Use activeScenario instead */
  enabledModes: TrainingMode[];
  cardFilter: CardFilter;
  /** @deprecated Use onScenarioChange instead */
  onModesChange: (modes: TrainingMode[]) => void;
  onCardFilterChange: (filter: CardFilter) => void;
  newReviewRatio: number;
  onNewReviewRatioChange: (ratio: number) => void;
  stats: DetailedStats;
  userEmail: string;
  userId: string;
  activeScenario: string;
  onScenarioChange: (scenarioId: string) => void;
  onTrainWord?: (wordId: string) => void;
};

export function SettingsModal({
  open,
  onClose,
  initialTab,
  autoFocusWordSearch,
  initialViewedListScope,
  onListsUpdated,
  themePreference,
  onThemeChange,
  audioQuality,
  onAudioQualityChange,
  onboardingLanguage,
  onOnboardingLanguageChange,
  onStartOnboarding,
  language,
  onLanguageChange,
  languageOptions,
  defaultLanguage,
  onDefaultLanguageChange,
  translationLang,
  onTranslationLangChange,
  wordListId,
  wordListType,
  activeTrainingList,
  onMakeActiveForTraining,
  onUserDictionaryEntryCreated,
  enabledModes,
  cardFilter,
  onModesChange,
  onCardFilterChange,
  newReviewRatio,
  onNewReviewRatioChange,
  stats,
  userEmail,
  userId,
  activeScenario,
  onScenarioChange,
  onTrainWord,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("instellingen");
  const [dictionarySearchState, setDictionarySearchState] =
    useState<DictionarySearchTabState>(() => createDictionarySearchTabState());
  const [lists, setLists] = useState<WordListSummary[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState<string | null>(null);
  const [viewedListScope, setViewedListScope] =
    useState<ViewedListScope | null>(
      wordListId
        ? {
            id: wordListId,
            type: wordListType ?? "curated",
          }
        : null,
  );
  const initialViewedListScopeId = initialViewedListScope?.id;
  const initialViewedListScopeType = initialViewedListScope?.type;
  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const versionInfo = useMemo(() => appVersionInfo(), []);
  const isDictionarySourceList = useCallback(
    (list: WordListSummary) =>
      list.type === "curated" && /^vandale$/i.test(list.name.trim()),
    [],
  );

  const curatedLists = useMemo(
    () => lists.filter((list) => list.type === "curated"),
    [lists]
  );
  const trainingLists = useMemo(
    () => lists.filter((list) => !isDictionarySourceList(list)),
    [lists, isDictionarySourceList],
  );
  const userLists = useMemo(
    () => lists.filter((list) => list.type === "user"),
    [lists]
  );
  const viewedList = useMemo(
    () =>
      viewedListScope
        ? lists.find(
            (list) =>
              list.id === viewedListScope.id && list.type === viewedListScope.type,
          ) ?? null
        : null,
    [lists, viewedListScope],
  );
  const viewedListName = useMemo(() => {
    return viewedList?.name ?? "VanDale 2k";
  }, [viewedList]);
  const activeTrainingListFromLists = useMemo(() => {
    if (!wordListId) return activeTrainingList;
    return (
      lists.find(
        (list) =>
          list.id === wordListId &&
          list.type === (wordListType ?? "curated") &&
          !isDictionarySourceList(list),
      ) ??
      activeTrainingList ??
      null
    );
  }, [activeTrainingList, isDictionarySourceList, lists, wordListId, wordListType]);
  const activeScenarioName =
    scenarios.find((scenario) => scenario.id === activeScenario)?.nameNl ??
    scenarios.find((scenario) => scenario.id === activeScenario)?.nameEn ??
    (activeScenario === "understanding"
      ? "Begrip"
      : activeScenario === "listening"
        ? "Luisteren"
        : activeScenario === "conjugation"
          ? "Vervoegingen"
          : activeScenario);
  const selectDefaultViewedList = useCallback(
    (availableLists: WordListSummary[]) => {
      const active =
        wordListId
          ? availableLists.find(
              (list) =>
                list.id === wordListId &&
                list.type === (wordListType ?? "curated") &&
                !isDictionarySourceList(list),
            )
          : null;
      const primary =
        active ??
        availableLists.find(
          (list) =>
            list.type === "curated" && list.is_primary && !isDictionarySourceList(list),
        ) ??
        availableLists.find((list) => list.type === "curated" && !isDictionarySourceList(list)) ??
        availableLists.find((list) => !isDictionarySourceList(list)) ??
        availableLists[0];

      if (!primary) return;
      setViewedListScope({ id: primary.id, type: primary.type });
    },
    [isDictionarySourceList, wordListId, wordListType],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setActiveTab("instellingen");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab ?? "instellingen");
  }, [open, initialTab]);

  const loadLists = useCallback(async () => {
    try {
      setListsLoading(true);
      setListsError(null);
      const data = await fetchAvailableLists(userId, language);
      setLists(data);

      const viewedListStillAvailable =
        viewedListScope &&
        data.some(
          (list) =>
            list.id === viewedListScope.id && list.type === viewedListScope.type,
        );

      if (!viewedListStillAvailable && data.length > 0) {
        selectDefaultViewedList(data);
      }
    } catch (error) {
      console.error("Error loading lists", error);
      setListsError("Kon lijsten niet laden.");
    } finally {
      setListsLoading(false);
    }
  }, [userId, language, viewedListScope, selectDefaultViewedList]);

  const notifyListsUpdated = useCallback(() => {
    onListsUpdated?.();
  }, [onListsUpdated]);

  const openMembershipList = useCallback(
    (membership: EntryLearningListMembership) => {
      setViewedListScope({
        id: membership.listId,
        type: membership.listType,
      });
      setActiveTab("lijsten");
      setDictionarySearchState((current) => ({
        ...current,
        mobileDetailOpen: false,
      }));
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    void loadLists();
  }, [open, loadLists]);

  // Load training scenarios
  useEffect(() => {
    if (!open) return;
    const loadScenarios = async () => {
      setScenariosLoading(true);
      const data = await fetchTrainingScenarios();
      setScenarios(data);
      setScenariosLoading(false);
    };
    void loadScenarios();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (viewedListScope || !wordListId) return;
    setViewedListScope({
      id: wordListId,
      type: wordListType ?? "curated",
    });
  }, [open, viewedListScope, wordListId, wordListType]);

  useEffect(() => {
    if (!open || !initialViewedListScopeId || !initialViewedListScopeType) return;
    setViewedListScope({
      id: initialViewedListScopeId,
      type: initialViewedListScopeType,
    });
    setActiveTab("lijsten");
  }, [
    initialViewedListScopeId,
    initialViewedListScopeType,
    open,
  ]);

  useEffect(() => {
    if (!viewedList || !isDictionarySourceList(viewedList)) return;
    selectDefaultViewedList(trainingLists);
  }, [viewedList, isDictionarySourceList, selectDefaultViewedList, trainingLists]);

  if (!open) {
    return null;
  }

  const todayTotal = stats.newCardsToday + stats.reviewCardsDone;
  const progressToday = Math.min((stats.newWordsToday / stats.dailyNewLimit) * 100, 100);
  const progressTotal = Math.min(
    (stats.totalWordsLearned / stats.totalWordsInList) * 100,
    100
  );

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: "light", label: "Licht" },
    { value: "dark", label: "Donker" },
    { value: "system", label: "Systeem" },
  ];
  const audioQualityOptions: { value: AudioQuality; label: string }[] = [
    { value: "free", label: "Gratis" },
    { value: "premium", label: "Premium" },
  ];

const cardFilterOptions: { value: CardFilter; label: string }[] = [
    { value: "both", label: "Nieuw + Herhaling" },
    { value: "new", label: "Alleen nieuw" },
    { value: "review", label: "Alleen herhaling" },
  ];
  const cardTypeOptions: { value: TrainingMode; label: string }[] = [
    { value: "word-to-definition", label: "Woord -> definitie" },
    { value: "definition-to-word", label: "Definitie -> woord" },
    { value: "listen-recognize", label: "Luisterkaart" },
  ];

  const translationLangOptions: { value: string; label: string }[] = [
    // Use an explicit sentinel so we can distinguish "off" from legacy NULLs.
    { value: "off", label: "Uit (geen vertaling)" },
    { value: "ru", label: "Русский" },
    { value: "en", label: "English" },
    { value: "de", label: "Deutsch" },
    { value: "fr", label: "Français" },
    { value: "uk", label: "Українська" },
  ];

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal container: full overlay on desktop, centered card on mobile */}
      <div
        className="absolute inset-0 z-50 flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 md:inset-6 lg:inset-8"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Sticky header + tabs */}
        <div className="sticky top-0 z-10 flex-shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-4 sm:px-6 md:px-8 dark:border-slate-800">
            <div>
              <p className="text-[12px] uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                Woorden en lijsten
              </p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">
                {userEmail}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-10 w-10 rounded-full border border-slate-200 text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span className="sr-only">Sluit</span>
              <svg
                className="mx-auto h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-slate-100 px-4 pt-2 text-sm font-semibold text-slate-500 sm:gap-4 sm:px-6 md:px-8 dark:border-slate-800 dark:text-slate-300">
          {(["zoeken", "lijsten", "statistieken", "instellingen"] as TabKey[]).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 whitespace-nowrap border-b-2 px-2 py-3 transition-colors sm:px-3 ${
                  activeTab === tab
                    ? "border-primary text-slate-900 dark:text-white"
                    : "border-transparent hover:text-slate-800 dark:hover:text-white"
                }`}
              >
                {tab === "zoeken"
                  ? "Zoeken"
                  : tab === "lijsten"
                  ? "Lijsten"
                  : tab === "statistieken"
                  ? "Statistieken"
                  : "Instellingen"}
              </button>
            )
          )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6 sm:py-6 md:px-8">
          <div className="h-full w-full overflow-hidden">
            {activeTab === "zoeken" ? (
              <DictionarySearchTab
                open={open}
                userId={userId}
                language={language}
                translationLang={translationLang}
                userLists={userLists}
                viewedListId={viewedListScope?.id ?? null}
                viewedList={viewedList}
                viewedListName={viewedListName}
                reloadLists={loadLists}
                notifyListsUpdated={notifyListsUpdated}
                onOpenListMembership={openMembershipList}
                onUserDictionaryEntryCreated={onUserDictionaryEntryCreated}
                onTrainWord={onTrainWord}
                autoFocusQuery={Boolean(autoFocusWordSearch)}
                searchState={dictionarySearchState}
                onSearchStateChange={setDictionarySearchState}
              />
            ) : null}

            {activeTab === "lijsten" ? (
              <WordListTab
                open={open}
                userId={userId}
                language={language}
                onLanguageChange={onLanguageChange}
                languageOptions={languageOptions}
                translationLang={translationLang}
                curatedLists={curatedLists}
                userLists={userLists}
                listsLoading={listsLoading}
                listsError={listsError}
                viewedListId={viewedListScope?.id ?? null}
                viewedListType={viewedListScope?.type ?? null}
                onViewedListChange={(list) =>
                  setViewedListScope({ id: list.id, type: list.type })
                }
                viewedList={viewedList}
                viewedListName={viewedListName}
                activeTrainingList={activeTrainingListFromLists}
                onMakeActiveForTraining={onMakeActiveForTraining}
                reloadLists={loadLists}
                notifyListsUpdated={notifyListsUpdated}
                onOpenListMembership={openMembershipList}
                onUserDictionaryEntryCreated={onUserDictionaryEntryCreated}
                onTrainWord={onTrainWord}
                autoFocusQuery={Boolean(autoFocusWordSearch)}
              />
            ) : null}

            {activeTab === "statistieken" ? (
              <div className="h-full overflow-y-auto pr-1">
                <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                      Vandaag
                    </p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                      {todayTotal} kaarten
                    </p>
                    <div className="mt-2 flex gap-4 text-xs text-slate-600 dark:text-slate-400">
                      <span>Nieuw: {stats.newWordsToday}/{stats.dailyNewLimit}</span>
                      <span>Herhaling: {stats.reviewCardsDone}</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-blue-500 dark:bg-blue-400"
                        style={{ width: `${progressToday}%` }}
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                      Totaal geleerd
                    </p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                      {stats.totalWordsLearned} / {stats.totalWordsInList}
                    </p>
                    <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                        style={{ width: `${progressTotal}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">
                    Aandachtspunten
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                    <li>Streef naar 10 woorden per dag.</li>
                    <li>Gebruik de hotkeys om sneller te beoordelen.</li>
                    <li>Wissel tussen Woord ↔ Definitie als afwisseling.</li>
                  </ul>
                </div>
                </div>
              </div>
            ) : null}

            {activeTab === "instellingen" ? (
              <div className="h-full overflow-y-auto pr-1">
                <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">
                    Thema
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {themeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onThemeChange(option.value)}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          themePreference === option.value
                            ? "border-primary bg-primary/10 text-slate-900 dark:text-white"
                            : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">
                    Audio kwaliteit
                  </p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Premium gebruikt de geconfigureerde premium TTS-provider voor zinsuitspraak.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {audioQualityOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onAudioQualityChange(option.value)}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          audioQuality === option.value
                            ? "border-primary bg-primary/10 text-slate-900 dark:text-white"
                            : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        }`}
                      >
                        {option.label}
                        {audioQuality === option.value ? (
                          <span className="ml-2 text-[10px] uppercase text-primary dark:text-primary-light">
                            actief
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">
                    Interface- en instructietaal
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { value: "en" as OnboardingLanguage, label: "English" },
                      { value: "ru" as OnboardingLanguage, label: "Русский" },
                      { value: "nl" as OnboardingLanguage, label: "Nederlands" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onOnboardingLanguageChange(option.value)}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          onboardingLanguage === option.value
                            ? "border-primary bg-primary/10 text-slate-900 dark:text-white"
                            : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">
                    Standaard trainingsvoorkeuren
                  </p>
                  <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Huidige training
                    </p>
                    <EffectiveTrainingScopeSummary
                      activeList={activeTrainingListFromLists}
                      activeScenarioName={activeScenarioName}
                      cardFilter={cardFilter}
                      language={language}
                      className="mt-2"
                    />
                    <button
                      type="button"
                      onClick={() => setActiveTab("lijsten")}
                      className="mt-3 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Wijzig trainingslijst in Lijsten
                    </button>
                  </div>
                  <div className="mt-3 space-y-4">
                    {/* Scenario selector */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Standaard trainingsscenario
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {scenariosLoading ? (
                          <span className="text-xs text-slate-500">Laden...</span>
                        ) : (
                          scenarios
                            .filter((s) => s.enabled)
                            .map((scenario) => {
                              const isActive = activeScenario === scenario.id;
                              return (
                                <button
                                  key={scenario.id}
                                  type="button"
                                  onClick={() => onScenarioChange(scenario.id)}
                                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                    isActive
                                      ? "border-primary bg-primary/10 text-slate-900 dark:text-white"
                                      : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                  }`}
                                >
                                  {scenario.nameNl || scenario.nameEn}
                                  {isActive && (
                                    <span className="ml-2 text-[10px] uppercase text-primary dark:text-primary-light">
                                      standaard
                                    </span>
                                  )}
                                </button>
                              );
                            })
                        )}
                      </div>
                      {scenarios.find((s) => s.id === activeScenario)?.description && (
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          {scenarios.find((s) => s.id === activeScenario)?.description}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Standaard kaarttypen
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {cardTypeOptions.map((option) => {
                          const enabled = enabledModes.includes(option.value);
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                const next = enabled
                                  ? enabledModes.filter((mode) => mode !== option.value)
                                  : [...enabledModes, option.value];
                                onModesChange(next.length ? next : [option.value]);
                              }}
                              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                enabled
                                  ? "border-primary bg-primary/10 text-slate-900 dark:text-white"
                                  : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Standaard zoekwoordenboeken
                      </p>
                      <div className="inline-flex rounded-full border border-primary bg-primary/10 px-4 py-2 text-sm font-semibold text-slate-900 dark:text-white">
                        VanDale woordenboek
                      </div>
                    </div>

                    {/* Other settings */}
                    <div className="flex flex-wrap gap-3">
                      <DropUpSelect
                        label="Vertaaltaal"
                        value={translationLang ?? "en"}
                        options={translationLangOptions}
                        onChange={(value) =>
                          onTranslationLangChange(value === "off" ? "off" : value)
                        }
                      />
                      <DropUpSelect
                        label="Standaard nieuw/herhaling"
                        value={cardFilter}
                        options={cardFilterOptions}
                        onChange={(value) => onCardFilterChange(value as CardFilter)}
                      />
                      <DropUpSelect
                        label="Standaard herhalingmix"
                        value={String(newReviewRatio)}
                        options={[
                          { value: "1", label: "1:1 (1 nieuw, 1 herhaling)" },
                          { value: "2", label: "1:2 (1 nieuw, 2 herhalingen)" },
                          { value: "3", label: "1:3 (1 nieuw, 3 herhalingen)" },
                          { value: "5", label: "1:5 (1 nieuw, 5 herhalingen)" },
                        ]}
                        onChange={(value) => onNewReviewRatioChange(parseInt(value, 10))}
                      />
                      <DropUpSelect
                        label="Standaard leertaal"
                        value={defaultLanguage}
                        options={
                          languageOptions?.length
                            ? languageOptions
                            : [{ value: "nl", label: "Nederlands" }]
                        }
                        onChange={onDefaultLanguageChange}
                      />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Deze waarden zijn je standaardvoorkeuren voor nieuwe sessies en snelle wijzigingen.
                    Lijstspecifieke instellingen blijven in Lijsten.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">
                    Tutorial
                  </p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    De introductie-tour laat je de belangrijkste functies zien bij je eerste bezoek.
                  </p>
                  <button
                    type="button"
                    onClick={onStartOnboarding}
                    className="mt-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Tutorial opnieuw starten
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">
                    Over 2000nl
                  </p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {versionInfo.display}
                  </p>
                </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
