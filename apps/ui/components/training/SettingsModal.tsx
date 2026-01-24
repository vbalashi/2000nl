import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAvailableLists,
  fetchTrainingScenarios,
} from "@/lib/trainingService";
import type { CardFilter, DetailedStats, TrainingScenario, WordListSummary, WordListType } from "@/lib/types";
import type { TrainingMode } from "@/lib/types";
import type { ThemePreference } from "./TrainingScreen";
import { DropUpSelect } from "./DropUpSelect";
import { WordListTab } from "./wordlist/WordListTab";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

type TabKey = "woordenlijst" | "statistieken" | "instellingen";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Which tab to show when the modal is opened. Defaults to "instellingen". */
  initialTab?: TabKey;
  /** When opening on "woordenlijst", focus the query/search input. */
  autoFocusWordSearch?: boolean;
  onListsUpdated?: () => void;
  themePreference: ThemePreference;
  onThemeChange: (pref: ThemePreference) => void;
  onboardingLanguage: OnboardingLanguage;
  onOnboardingLanguageChange: (lang: OnboardingLanguage) => void;
  language: string;
  onLanguageChange: (value: string) => void;
  translationLang: string | null;
  onTranslationLangChange: (value: string | null) => void;
  wordListId: string | null;
  wordListType: WordListType | null;
  onListChange: (value: WordListSummary) => void;
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
  onListsUpdated,
  themePreference,
  onThemeChange,
  onboardingLanguage,
  onOnboardingLanguageChange,
  language,
  onLanguageChange,
  translationLang,
  onTranslationLangChange,
  wordListId,
  wordListType,
  onListChange,
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
  const [lists, setLists] = useState<WordListSummary[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(
    wordListId || null
  );
  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(false);

  const curatedLists = useMemo(
    () => lists.filter((list) => list.type === "curated"),
    [lists]
  );
  const userLists = useMemo(
    () => lists.filter((list) => list.type === "user"),
    [lists]
  );
  const selectedList = useMemo(
    () => lists.find((list) => list.id === selectedListId) ?? null,
    [lists, selectedListId]
  );
  const selectedListName = useMemo(() => {
    return selectedList?.name ?? "VanDale 2k";
  }, [selectedList]);

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

      if (!selectedListId && data.length > 0) {
        const primary =
          data.find((list) => list.type === "curated" && list.is_primary) ??
          data[0];
        setSelectedListId(primary.id);
        onListChange(primary);
      }
    } catch (error) {
      console.error("Error loading lists", error);
      setListsError("Kon lijsten niet laden.");
    } finally {
      setListsLoading(false);
    }
  }, [userId, language, selectedListId, onListChange]);

  const notifyListsUpdated = useCallback(() => {
    onListsUpdated?.();
  }, [onListsUpdated]);

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
    if (wordListId) {
      setSelectedListId(wordListId);
    }
  }, [wordListId]);

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

  const cardFilterOptions: { value: CardFilter; label: string }[] = [
    { value: "both", label: "Nieuw + Herhaling" },
    { value: "new", label: "Alleen nieuw" },
    { value: "review", label: "Alleen herhaling" },
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
          <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4 md:px-8 dark:border-slate-800">
            <div>
              <p className="text-[12px] uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                Instellingen & Beheer
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

          <div className="flex items-center gap-4 border-b border-slate-100 px-6 pt-2 text-sm font-semibold text-slate-500 md:px-8 dark:border-slate-800 dark:text-slate-300">
          {(["woordenlijst", "statistieken", "instellingen"] as TabKey[]).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`border-b-2 px-3 py-3 transition-colors ${
                  activeTab === tab
                    ? "border-primary text-slate-900 dark:text-white"
                    : "border-transparent hover:text-slate-800 dark:hover:text-white"
                }`}
              >
                {tab === "woordenlijst"
                  ? "Woordenlijst"
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
            {activeTab === "woordenlijst" ? (
              <WordListTab
                open={open}
                userId={userId}
                language={language}
                onLanguageChange={onLanguageChange}
                translationLang={translationLang}
                wordListType={wordListType}
                curatedLists={curatedLists}
                userLists={userLists}
                listsLoading={listsLoading}
                listsError={listsError}
                selectedListId={selectedListId}
                setSelectedListId={setSelectedListId}
                selectedList={selectedList}
                selectedListName={selectedListName}
                onListChange={onListChange}
                reloadLists={loadLists}
                notifyListsUpdated={notifyListsUpdated}
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
                    Taal instructies
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
                    Trainingsvoorkeuren
                  </p>
                  <div className="mt-3 space-y-4">
                    {/* Scenario selector */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Trainingsscenario
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
                                      actief
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

                    {/* Other settings */}
                    <div className="flex flex-wrap gap-3">
                      <DropUpSelect
                        label="Vertaling"
                        value={translationLang ?? "en"}
                        options={translationLangOptions}
                        onChange={(value) =>
                          onTranslationLangChange(value === "off" ? "off" : value)
                        }
                      />
                      <DropUpSelect
                        label="Kaarten"
                        value={cardFilter}
                        options={cardFilterOptions}
                        onChange={(value) => onCardFilterChange(value as CardFilter)}
                      />
                      <DropUpSelect
                        label="Herhaling ratio"
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
                        label="Taal"
                        value={language}
                        options={[
                          { value: "nl", label: "Nederlands" },
                          { value: "en", label: "English" },
                          { value: "de", label: "Deutsch" },
                          { value: "fr", label: "Français" },
                        ]}
                        onChange={onLanguageChange}
                      />
                      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        <span className="text-xs uppercase text-slate-500 dark:text-slate-400">
                          Actieve lijst
                        </span>
                        <span>{selectedListName}</span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Een scenario bepaalt welke kaarten je traint (bijv. Begrip = Woord↔Definitie in beide richtingen).
                    Een woord is geleerd wanneer alle kaarten in het scenario stabiel genoeg zijn.
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
                    onClick={() => {
                      localStorage.removeItem("onboarding_completed");
                      alert("Tutorial gereset! Ververs de pagina om de rondleiding opnieuw te starten.");
                    }}
                    className="mt-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Tutorial opnieuw starten
                  </button>
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
