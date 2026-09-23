"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Plus } from "lucide-react";
import { TrainingLexicalPreview } from "./TrainingLexicalPreview";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type {
  CardFilter,
  DetailedStats,
  TrainingDateWindow,
  TrainingMode,
  TrainingSessionSize,
} from "@/lib/types";
import { TrainingPilotStatePanel } from "./TrainingPilotStatePanel";
import { TrainingMixPicker, mixStepSelection } from "./TrainingMixPicker";
import { TrainingSessionSizePicker } from "./TrainingSessionSizePicker";
import {
  presetStorageKey,
  readTrainingPresets,
  writeTrainingPresets,
  type TrainingSetupPreset,
} from "./trainingSetupPresets";

export type TrainingPilotStatus =
  "ready" | "preparing" | "loading" | "empty" | "error" | "first-use";

export type TrainingSetupDraft = {
  scenarioId: string;
  modes: TrainingMode[];
  cardFilter: CardFilter;
  listValue: string;
  newReviewRatio: number;
  dateWindow: TrainingDateWindow;
  daysAgo?: number;
  sourceValue: string;
  /** Maximum unique card targets for this session; omitted by old callers. */
  sessionSize?: TrainingSessionSize;
};

export const DEFAULT_SESSION_SIZE: TrainingSessionSize = 10;

export type TrainingSetupOption = {
  value: string;
  label: string;
  modes?: TrainingMode[];
};

export const isTrainingSetupDraftSupported = (
  draft: Pick<TrainingSetupDraft, "scenarioId" | "modes">,
  scenarios: TrainingSetupOption[],
) => {
  const scenario = scenarios.find(
    (option) => option.value === draft.scenarioId,
  );
  return Boolean(
    scenario?.modes?.length &&
    draft.modes.length > 0 &&
    draft.modes.every((mode) => scenario.modes?.includes(mode)),
  );
};

const defaultModesForScenario = (scenario: TrainingSetupOption) => {
  const modes = scenario.modes ?? [];
  if (
    scenario.value === "understanding" &&
    modes.includes("word-to-definition")
  ) {
    return ["word-to-definition"] satisfies TrainingMode[];
  }
  return modes;
};

type Props = {
  userId?: string;
  trainingLanguageCode?: string;
  trainingLanguageOptions?: TrainingSetupOption[];
  trainingLanguageLoading?: boolean;
  onTrainingLanguageChange?: (language: string) => void;
  interfaceLanguage: OnboardingLanguage;
  status: TrainingPilotStatus;
  initialDraft: TrainingSetupDraft;
  stats: DetailedStats;
  scenarios: TrainingSetupOption[];
  lists: TrainingSetupOption[];
  sources: TrainingSetupOption[];
  startPending?: boolean;
  scenarioLoading?: boolean;
  statsStatus?: "pending" | "ready" | "error";
  cardPreparationStatus?: "pending" | "ready" | "error" | "empty";
  startBlocked?: boolean;
  continueDisabled?: boolean;
  onRetryStats?: () => void;
  onRetryCard?: () => void;
  /** A saved local queue was superseded by a deliberate start elsewhere. */
  replacementWarning?: boolean;
  activeSessionLabel?: string;
  onContinue: () => void;
  onStart: (
    draft: TrainingSetupDraft,
  ) => boolean | void | Promise<boolean | void>;
  onRetry: () => void;
};

const copy = {
  en: {
    language: "Training language",
    material: "Material",
    changeMaterial: "Change material",
    eyebrowToday: "TRAINING · STUDY DAY",
    greeting: "Good morning",
    completed: (count: number) => `${count} cards completed this study day`,
    queueSummary: (reviews: number, introduced: number) =>
      `${reviews} reviews due · ${introduced} new this study day`,
    active: "ACTIVE SESSION",
    activeFallback: "Current training",
    continue: "Continue session",
    quick: "Quick start",
    adjust: "Adjust training",
    startCurrent: "Start current setup",
    setupEyebrow: "TRAINING · SETUP",
    setupHeading: "Build your session",
    back: "Back to Today",
    selection: "Selection",
    pool: "WHAT'S INCLUDED",
    plan: "HOW THIS SESSION RUNS",
    family: "Exercise type",
    words: "Words",
    idioms: "Idioms",
    sentences: "Example sentences",
    unavailable: "Coming when this training path is ready",
    lexicalUnavailable: "Part of speech and de/het filters need a server-side candidate filter before they can start a real session.",
    partOfSpeech: "Part of speech",
    noun: "Noun",
    verb: "Verb",
    adjective: "Adjective",
    adverb: "Adverb",
    moreParts: "Show more parts of speech",
    anyArticle: "Any",
    nounArticle: "Noun article",
    answerMode: "Answer mode",
    selfRate: "Reveal & self-rate",
    typed: "Type the answer",
    selfRateHelp: "Reveal the answer, then rate Again / Hard / Good / Easy.",
    directionHelp: "Select one or both word-card directions.",
    activity: "Recent activity",
    activityHelp: "Optional: narrow by event date and source; this does not mean forgotten words only.",
    materialHelp: "Choose a dictionary or one collection.",
    goal: "Training goal",
    meaning: "Meaning",
    reverse: "Reverse",
    listening: "Listening",
    soon: "Soon",
    mix: "Review ↔ new rhythm",
    new: "New",
    review: "Reviews",
    both: "Both",
    list: "Collection",
    source: "Source",
    date: "Time window",
    allDates: "All time",
    today: "Today",
    yesterday: "Yesterday",
    allSources: "All sources",
    youtube: "YouTube",
    start: "Start training",
    startHere: "Start training here",
    replacementWarning: "This will reset training on another device.",
    starting: "Starting…",
    ratioOption: (value: number) => `1 new : ${value} reviews`,
    reviewsOnly: "Reviews only",
    newOnly: "New only",
    mixHelp: "Target rhythm; the actual mix depends on available cards.",
    sessionSize: "Session size",
    exercises: (count: number) => `${count} exercises`,
    allDueHelp: "Selecting this switches the mix to Reviews only; new cards are not included.",
    fiveCards: "5 cards",
    tenCards: "10 cards",
    allDueToday: "All due",
    daysAgo: "Days ago",
    loading: "Loading Training",
    chooseGoal: "Choose a training goal",
    presets: "Saved presets",
    noPresets: "No presets saved on this device yet.",
    editPreset: "Edit",
    startPreset: "Start",
    savePreset: "Save preset",
    updatePreset: "Update preset",
    savedOnDevice: "Saved on this device",
    saveFailed: "Could not save this preset on this device.",
    statsLoading: "Loading progress…",
    statsError: "Progress could not be loaded.",
    cardPending: "Preparing your next card…",
    cardError: "The next card could not be prepared. You can retry or adjust the setup.",
    cardEmpty: "No card is ready for this setup yet. Adjust it or start a session.",
    retryProgress: "Retry progress",
    retryCard: "Retry card preparation",
  },
  nl: {
    language: "Leertaal",
    material: "Materiaal",
    changeMaterial: "Materiaal wijzigen",
    eyebrowToday: "TRAINING · STUDIEDAG",
    greeting: "Goedemorgen",
    completed: (count: number) => `${count} kaarten deze studiedag afgerond`,
    queueSummary: (reviews: number, introduced: number) =>
      `${reviews} herhalingen klaar · ${introduced} nieuw deze studiedag`,
    active: "ACTIEVE SESSIE",
    activeFallback: "Huidige training",
    continue: "Sessie doorgaan",
    quick: "Snel starten",
    adjust: "Training aanpassen",
    startCurrent: "Huidige selectie starten",
    setupEyebrow: "TRAINING · INSTELLEN",
    setupHeading: "Stel je sessie samen",
    back: "Terug naar Vandaag",
    selection: "Selectie",
    pool: "WAT TRAIN JE",
    plan: "ZO WERKT DE SESSIE",
    family: "Oefentype",
    words: "Woorden",
    idioms: "Uitdrukkingen",
    sentences: "Voorbeeldzinnen",
    unavailable: "Beschikbaar zodra deze training klaar is",
    lexicalUnavailable: "Woordsoort en de/het vereisen eerst een serverfilter voor oefenkandidaten.",
    partOfSpeech: "Woordsoort",
    noun: "Zelfstandig naamwoord",
    verb: "Werkwoord",
    adjective: "Bijvoeglijk naamwoord",
    adverb: "Bijwoord",
    moreParts: "Meer woordsoorten tonen",
    anyArticle: "Alle",
    nounArticle: "Lidwoord",
    answerMode: "Antwoordvorm",
    selfRate: "Tonen en zelf beoordelen",
    typed: "Antwoord typen",
    selfRateHelp: "Toon het antwoord en kies Again / Hard / Good / Easy.",
    directionHelp: "Kies één of beide richtingen voor woordkaarten.",
    activity: "Recente activiteit",
    activityHelp: "Optioneel: filter op datum en bron; dit selecteert niet alleen vergeten woorden.",
    materialHelp: "Kies een woordenboek of één collectie.",
    goal: "Trainingsdoel",
    meaning: "Betekenis",
    reverse: "Omgekeerd",
    listening: "Luisteren",
    soon: "Binnenkort",
    mix: "Ritme herhaling ↔ nieuw",
    new: "Nieuw",
    review: "Herhaling",
    both: "Beide",
    list: "Collectie",
    source: "Bron",
    date: "Periode",
    allDates: "Alle tijd",
    today: "Vandaag",
    yesterday: "Gisteren",
    allSources: "Alle bronnen",
    youtube: "YouTube",
    start: "Training starten",
    startHere: "Training hier starten",
    replacementWarning: "Hiermee wordt de training op een ander apparaat gereset.",
    starting: "Starten…",
    ratioOption: (value: number) => `1 nieuw : ${value} ${value === 1 ? "herhaling" : "herhalingen"}`,
    reviewsOnly: "Alleen herhalen",
    newOnly: "Alleen nieuw",
    mixHelp: "Streepritme; de verhouding hangt af van beschikbare kaarten.",
    sessionSize: "Sessiegrootte",
    exercises: (count: number) => `${count} oefeningen`,
    allDueHelp: "Dit schakelt over naar alleen herhalingen; nieuwe kaarten tellen niet mee.",
    fiveCards: "5 kaarten",
    tenCards: "10 kaarten",
    allDueToday: "Alles wat moet",
    daysAgo: "Dagen geleden",
    loading: "Training laden",
    chooseGoal: "Kies een trainingsdoel",
    presets: "Bewaarde presets",
    noPresets: "Nog geen presets op dit apparaat.",
    editPreset: "Bewerken",
    startPreset: "Starten",
    savePreset: "Preset bewaren",
    updatePreset: "Preset bijwerken",
    savedOnDevice: "Op dit apparaat bewaard",
    saveFailed: "Kon de preset niet op dit apparaat bewaren.",
    statsLoading: "Voortgang laden…",
    statsError: "Voortgang kon niet worden geladen.",
    cardPending: "Je volgende kaart wordt voorbereid…",
    cardError: "De volgende kaart kon niet worden voorbereid. Probeer opnieuw of pas de selectie aan.",
    cardEmpty: "Er staat nog geen kaart klaar. Pas de selectie aan of start een sessie.",
    retryProgress: "Voortgang opnieuw laden",
    retryCard: "Kaart opnieuw voorbereiden",
  },
  ru: {
    language: "Язык тренировки",
    material: "Материал",
    changeMaterial: "Изменить материал",
    eyebrowToday: "ТРЕНИРОВКА · УЧЕБНЫЙ ДЕНЬ",
    greeting: "Доброе утро",
    completed: (count: number) => `За учебный день завершено карточек: ${count}`,
    queueSummary: (reviews: number, introduced: number) =>
      `Повторений к выполнению: ${reviews} · новых за учебный день: ${introduced}`,
    active: "АКТИВНАЯ СЕССИЯ",
    activeFallback: "Текущая тренировка",
    continue: "Продолжить сессию",
    quick: "Быстрый старт",
    adjust: "Настроить тренировку",
    startCurrent: "Начать с текущими настройками",
    setupEyebrow: "ТРЕНИРОВКА · НАСТРОЙКА",
    setupHeading: "Соберите сессию",
    back: "Назад к экрану Сегодня",
    selection: "Выбор",
    pool: "ЧТО ТРЕНИРУЕМ",
    plan: "КАК ПРОЙДЁТ СЕССИЯ",
    family: "Тип упражнения",
    words: "Слова",
    idioms: "Идиомы",
    sentences: "Примеры предложений",
    unavailable: "Появится, когда сценарий будет готов",
    lexicalUnavailable: "Для частей речи и de/het нужен серверный фильтр кандидатов перед запуском сессии.",
    partOfSpeech: "Часть речи",
    noun: "Существительное",
    verb: "Глагол",
    adjective: "Прилагательное",
    adverb: "Наречие",
    moreParts: "Показать другие части речи",
    anyArticle: "Любой",
    nounArticle: "Артикль существительных",
    answerMode: "Способ ответа",
    selfRate: "Показать и оценить",
    typed: "Ввести ответ",
    selfRateHelp: "Откройте ответ и оцените: Again / Hard / Good / Easy.",
    directionHelp: "Выберите одно или оба направления для карточек со словами.",
    activity: "Недавняя активность",
    activityHelp: "Можно сузить по дате и источнику; это не выбор только забытых слов.",
    materialHelp: "Выберите словарь или одну коллекцию.",
    goal: "Цель тренировки",
    meaning: "Значение",
    reverse: "Обратные",
    listening: "Аудирование",
    soon: "Скоро",
    mix: "Ритм повторений ↔ новых",
    new: "Новые",
    review: "Повторения",
    both: "Оба",
    list: "Коллекция",
    source: "Источник",
    date: "Период",
    allDates: "За всё время",
    today: "Сегодня",
    yesterday: "Вчера",
    allSources: "Все источники",
    youtube: "YouTube",
    start: "Начать тренировку",
    startHere: "Начать тренировку здесь",
    replacementWarning: "Это сбросит тренировку на другом устройстве.",
    starting: "Запускаем…",
    ratioOption: (value: number) => `1 новая : ${value} ${value === 1 ? "повторение" : value === 5 ? "повторений" : "повторения"}`,
    reviewsOnly: "Только повторы",
    newOnly: "Только новые",
    mixHelp: "Целевой ритм; состав зависит от доступных карточек.",
    sessionSize: "Размер сессии",
    exercises: (count: number) => `${count} упражнений`,
    allDueHelp: "Этот вариант переключает состав на повторы; новые карточки не входят.",
    fiveCards: "5 карточек",
    tenCards: "10 карточек",
    allDueToday: "Все доступные повторы",
    daysAgo: "Дней назад",
    loading: "Загрузка тренировки",
    chooseGoal: "Выберите цель тренировки",
    presets: "Сохранённые пресеты",
    noPresets: "На этом устройстве пока нет пресетов.",
    editPreset: "Изменить",
    startPreset: "Начать",
    savePreset: "Сохранить пресет",
    updatePreset: "Обновить пресет",
    savedOnDevice: "Сохранено на этом устройстве",
    saveFailed: "Не удалось сохранить пресет на этом устройстве.",
    statsLoading: "Загружаем статистику…",
    statsError: "Не удалось загрузить статистику.",
    cardPending: "Подготавливаем следующую карточку…",
    cardError: "Не удалось подготовить карточку. Повторите попытку или измените настройки.",
    cardEmpty: "Пока нет готовой карточки. Измените настройки или начните сессию.",
    retryProgress: "Повторить загрузку статистики",
    retryCard: "Повторить подготовку карточки",
  },
} satisfies Record<OnboardingLanguage, Record<string, unknown>>;

const actionClass =
  "min-h-10 rounded-lg border px-3 py-2 text-[15px] font-semibold leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400";

function ChoiceButton({
  active,
  label,
  shortLabel,
  onClick,
  disabled = false,
}: {
  active: boolean;
  label: string;
  shortLabel?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`${actionClass} flex-1 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 dark:disabled:border-slate-800 dark:disabled:bg-slate-900/40 dark:disabled:text-slate-400 ${
        active
          ? "border-indigo-500 bg-indigo-500/20 text-indigo-950 dark:text-indigo-100"
          : "border-slate-200 bg-white/70 text-slate-700 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"
      }`}
    >
      {shortLabel ? (
        <>
          <span className="md:hidden">{label}</span>
          <span className="hidden md:inline">{shortLabel}</span>
        </>
      ) : label}
    </button>
  );
}

export function TrainingTodaySetup({
  userId,
  trainingLanguageCode,
  trainingLanguageOptions = [{ value: "nl", label: "Nederlands" }],
  trainingLanguageLoading = false,
  onTrainingLanguageChange,
  interfaceLanguage,
  status,
  initialDraft,
  stats,
  scenarios,
  lists,
  sources,
  startPending = false,
  scenarioLoading = false,
  statsStatus = "ready",
  cardPreparationStatus = "ready",
  startBlocked = false,
  continueDisabled = false,
  onRetryStats,
  onRetryCard,
  replacementWarning = false,
  activeSessionLabel,
  onContinue,
  onStart,
  onRetry,
}: Props) {
  const t = copy[interfaceLanguage];
  const [screen, setScreen] = useState<"today" | "setup">("today");
  const [draft, setDraft] = useState({
    ...initialDraft,
    sessionSize: initialDraft.sessionSize ?? DEFAULT_SESSION_SIZE,
  });
  const [presets, setPresets] = useState<TrainingSetupPreset[]>([]);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetMessage, setPresetMessage] = useState("");
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const storageKey =
    userId && trainingLanguageCode
      ? presetStorageKey(userId, trainingLanguageCode)
      : null;

  useEffect(() => {
    setPresets(storageKey ? readTrainingPresets(storageKey) : []);
  }, [storageKey]);

  useEffect(() => {
    if (pendingLanguage === trainingLanguageCode && !trainingLanguageLoading) {
      setDraft({ ...initialDraft, sessionSize: initialDraft.sessionSize ?? DEFAULT_SESSION_SIZE });
      setEditingPresetId(null);
      setPresetMessage("");
      setPendingLanguage(null);
    }
  }, [pendingLanguage, trainingLanguageCode, trainingLanguageLoading, initialDraft]);

  useEffect(() => {
    if (screen === "today") {
      setDraft({
        ...initialDraft,
        sessionSize: initialDraft.sessionSize ?? DEFAULT_SESSION_SIZE,
      });
    }
  }, [initialDraft, screen]);

  useEffect(() => {
    if (replacementWarning) setScreen("setup");
  }, [replacementWarning]);

  useEffect(() => {
    if (screen !== "setup" || scenarioLoading || scenarios.length === 0) return;
    const selectedScenario = scenarios.find(
      (option) => option.value === draft.scenarioId,
    );
    if (
      selectedScenario?.value === "understanding" &&
      isTrainingSetupDraftSupported(draft, scenarios)
    )
      return;
    const nextScenario =
      scenarios.find((option) => option.value === "understanding") ??
      selectedScenario ??
      scenarios[0];
    setDraft((current) => ({
      ...current,
      scenarioId: nextScenario.value,
      modes: defaultModesForScenario(nextScenario),
    }));
  }, [draft, scenarioLoading, scenarios, screen]);

  const initialScenarioSupported = isTrainingSetupDraftSupported(
    initialDraft,
    scenarios,
  );
  const draftScenarioSupported = isTrainingSetupDraftSupported(
    draft,
    scenarios,
  );

  const completed = stats.newCardsToday + stats.reviewCardsDone;
  const selectedModeLabels = [
    draft.modes.includes("word-to-definition") ? t.meaning : null,
    draft.modes.includes("definition-to-word") ? t.reverse : null,
  ].filter(Boolean);
  const selectedList = lists.find(
    (option) => option.value === draft.listValue,
  )?.label;
  const selectionSummary = useMemo(
    () =>
      [
        trainingLanguageCode?.toUpperCase(),
        draft.cardFilter === "both"
          ? t.ratioOption(draft.newReviewRatio)
          : draft.cardFilter === "new"
            ? t.newOnly
            : t.reviewsOnly,
        selectedModeLabels.join(" + "),
        selectedList,
      ]
        .filter(Boolean)
        .join(" · "),
    [draft.cardFilter, draft.newReviewRatio, selectedList, selectedModeLabels, t, trainingLanguageCode],
  );

  const openSetup = () => {
    setEditingPresetId(null);
    setPresetMessage("");
    setDraft({
      ...initialDraft,
      sessionSize: initialDraft.sessionSize ?? DEFAULT_SESSION_SIZE,
    });
    setScreen("setup");
  };

  const savePreset = () => {
    if (!storageKey || !draftScenarioSupported || trainingLanguageLoading || pendingLanguage) return;
    const sizeLabel = draft.sessionSize === "all-due-today"
      ? t.allDueToday
      : t.exercises(draft.sessionSize);
    const mixLabel = draft.cardFilter === "both"
      ? t.ratioOption(draft.newReviewRatio)
      : draft.cardFilter === "new"
        ? t.newOnly
        : t.reviewsOnly;
    const presetName = `${selectedList ?? t.list} · ${t.words} · ${mixLabel} · ${sizeLabel}`;
    const preset: TrainingSetupPreset = {
      id: editingPresetId ?? crypto.randomUUID(),
      name: presetName,
      draft,
    };
    const next = editingPresetId
      ? presets.map((item) => item.id === editingPresetId ? preset : item)
      : [preset, ...presets];
    if (writeTrainingPresets(storageKey, next)) {
      setPresets(next);
      setEditingPresetId(preset.id);
      setPresetMessage(t.savedOnDevice);
    } else {
      setPresetMessage(t.saveFailed);
    }
  };

  const requestStart = async (nextDraft: TrainingSetupDraft) => {
    if (trainingLanguageLoading || pendingLanguage || startBlocked) return;
    const started = await onStart(nextDraft);
    if (started === false) setScreen("today");
  };

  if (screen === "today" && status !== "ready") {
    return status === "error" ? (
      <TrainingPilotStatePanel
        interfaceLanguage={interfaceLanguage}
        status={status}
        context="training"
        onRetry={onRetry}
      />
    ) : status === "empty" || status === "first-use" ? (
      <TrainingPilotStatePanel
        interfaceLanguage={interfaceLanguage}
        status={status}
        context="training"
        onSetUp={openSetup}
      />
    ) : (
      <TrainingPilotStatePanel
        interfaceLanguage={interfaceLanguage}
        status={status === "preparing" ? "preparing" : "loading"}
        context="training"
      />
    );
  }

  if (screen === "today") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto w-full max-w-4xl space-y-7">
          <header>
            <p className="font-mono text-xs font-bold tracking-[0.22em] text-slate-500 dark:text-slate-400">
              {t.eyebrowToday}
            </p>
            <h1 className="mt-2 text-3xl font-medium text-slate-950 dark:text-white md:text-4xl">
              {t.greeting}
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {statsStatus === "ready"
                ? t.completed(completed)
                : statsStatus === "pending"
                  ? t.statsLoading
                  : t.statsError}
            </p>
            {statsStatus === "error" && onRetryStats ? (
              <button type="button" onClick={onRetryStats} className="mt-2 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                {t.retryProgress}
              </button>
            ) : null}
          </header>

          <section className="rounded-2xl border border-indigo-500/60 bg-indigo-500/10 p-5 md:p-7">
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
              {t.active}
            </p>
            <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                  {activeSessionLabel || t.activeFallback}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {selectionSummary}
                </p>
              </div>
              <button
                type="button"
                onClick={onContinue}
                disabled={continueDisabled}
                className={`${actionClass} shrink-0 border-indigo-500 bg-indigo-500 text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-950`}
              >
                {t.continue} <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>

          <section className="pt-1">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                {t.quick}
              </h2>
              <button
                type="button"
                onClick={openSetup}
                className="min-h-10 text-sm font-semibold text-indigo-600 dark:text-indigo-300"
              >
                {t.adjust}
              </button>
            </div>
            <div className="mt-4">
              <p className="font-semibold text-slate-950 dark:text-white">
                {selectionSummary}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {statsStatus === "ready"
                  ? t.queueSummary(stats.reviewCardsDue, stats.newWordsToday)
                  : statsStatus === "pending"
                    ? t.statsLoading
                    : t.statsError}
              </p>
            </div>
            {cardPreparationStatus !== "ready" ? (
              <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                <p
                  role={cardPreparationStatus === "error" ? "alert" : "status"}
                  aria-live="polite"
                >
                  {cardPreparationStatus === "pending"
                    ? t.cardPending
                    : cardPreparationStatus === "error"
                      ? t.cardError
                      : t.cardEmpty}
                </p>
                {cardPreparationStatus === "error" && onRetryCard ? (
                  <button type="button" onClick={onRetryCard} className="mt-1 font-semibold text-indigo-600 dark:text-indigo-300">
                    {t.retryCard}
                  </button>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => void requestStart(initialDraft)}
              disabled={
                startPending || scenarioLoading || startBlocked || !initialScenarioSupported
              }
              className={`${actionClass} mt-4 w-full border-indigo-500 bg-indigo-500/15 text-indigo-900 hover:bg-indigo-500/25 disabled:cursor-wait disabled:opacity-60 dark:text-indigo-100`}
            >
              {startPending
                ? t.starting
                : scenarioLoading
                  ? t.loading
                  : initialScenarioSupported
                    ? t.startCurrent
                    : t.chooseGoal}
            </button>
          </section>
          {storageKey ? (
            <section aria-label={t.presets} className="pt-1">
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                {t.presets}
              </h2>
              {presets.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {t.noPresets}
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {presets.map((preset) => {
                    const supported = isTrainingSetupDraftSupported(preset.draft, scenarios);
                    return (
                      <div key={preset.id} className="flex items-center gap-2 rounded-xl bg-slate-100/70 p-2 dark:bg-slate-900/55">
                        <span className="min-w-0 flex-1 truncate px-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                          {preset.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setDraft({ ...preset.draft, sessionSize: preset.draft.sessionSize ?? DEFAULT_SESSION_SIZE });
                            setEditingPresetId(preset.id);
                            setPresetMessage("");
                            setScreen("setup");
                          }}
                          className="min-h-10 rounded-lg px-3 text-sm font-semibold text-indigo-700 dark:text-indigo-300"
                        >
                          {t.editPreset}
                        </button>
                        <button
                          type="button"
                          disabled={!supported || startPending || scenarioLoading}
                          onClick={() => void requestStart(preset.draft)}
                          className="min-h-10 rounded-lg bg-indigo-500 px-3 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {t.startPreset}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </div>
    );
  }

  const understandingScenario = scenarios.find(
    (option) => option.value === "understanding",
  );
  const toggleMode = (mode: TrainingMode) => {
    if (!understandingScenario?.modes?.includes(mode)) return;
    setDraft((current) => {
      const active = current.modes.includes(mode);
      if (active && current.modes.length === 1) return current;
      return {
        ...current,
        scenarioId: understandingScenario.value,
        modes: active
          ? current.modes.filter((candidate) => candidate !== mode)
          : [...current.modes, mode],
      };
    });
  };
  const changeMix = (index: number) =>
    setDraft((current) => {
      const selection = mixStepSelection(index, current.newReviewRatio);
      return {
        ...current,
        ...selection,
        sessionSize:
          selection.cardFilter !== "review" && current.sessionSize === "all-due-today"
            ? DEFAULT_SESSION_SIZE
            : current.sessionSize,
      };
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-40 md:px-8 md:pt-8">
      <div className="mx-auto w-full max-w-5xl">
        <button
          type="button"
          aria-label={t.back}
          onClick={() => setScreen("today")}
          className="flex min-h-10 items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300"
        >
          <ArrowLeft size={16} aria-hidden="true" /> {t.back}
        </button>
        <h1 className="sr-only">
          {t.setupHeading}
        </h1>
        {cardPreparationStatus !== "ready" ? (
          <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            <p
              role={cardPreparationStatus === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {cardPreparationStatus === "pending"
                ? t.cardPending
                : cardPreparationStatus === "error"
                  ? t.cardError
                  : t.cardEmpty}
            </p>
            {cardPreparationStatus === "error" && onRetryCard ? (
              <button type="button" onClick={onRetryCard} className="mt-1 font-semibold text-indigo-600 dark:text-indigo-300">
                {t.retryCard}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3">
          <label htmlFor="training-setup-language" className="text-sm font-semibold text-slate-950 dark:text-white">{t.language}</label>
          <div className="relative mt-2">
            <select
              id="training-setup-language"
              value={trainingLanguageCode ?? "nl"}
              disabled={trainingLanguageLoading || !onTrainingLanguageChange || startPending}
              onChange={(event) => {
                if (event.target.value === trainingLanguageCode) return;
                setPendingLanguage(event.target.value);
                onTrainingLanguageChange?.(event.target.value);
              }}
              className="h-11 w-full appearance-none rounded-lg border border-slate-200 bg-slate-100/70 px-9 text-center text-sm font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white"
            >
              {trainingLanguageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5 text-slate-500" />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-x-6">
          <fieldset className="order-3 min-w-0">
            <legend className="text-sm font-semibold text-slate-950 dark:text-white">
              {t.family}
            </legend>
            <div className="mt-2 flex gap-2">
              <ChoiceButton active label={t.words} onClick={() => undefined} />
              <ChoiceButton active={false} disabled label={t.idioms} onClick={() => undefined} />
            </div>
            <div className="mt-2 flex gap-2">
              <ChoiceButton active={false} disabled label={t.sentences} onClick={() => undefined} />
              <ChoiceButton active={false} disabled label={t.listening} onClick={() => undefined} />
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t.unavailable}
            </p>
          </fieldset>
          <TrainingLexicalPreview languageCode={trainingLanguageCode ?? "nl"} interfaceLanguage={interfaceLanguage} />
          <fieldset className="order-8 min-w-0">
            <legend className="text-sm font-semibold text-slate-950 dark:text-white">
              {t.goal}
            </legend>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t.directionHelp}
            </p>
            <div className="mt-2 flex gap-2">
              {scenarioLoading ? (
                <p
                  role="status"
                  className="text-sm text-slate-500 dark:text-slate-400"
                >
                  {t.loading}
                </p>
              ) : null}
              {understandingScenario?.modes?.includes("word-to-definition") ? (
                <ChoiceButton
                  active={draft.modes.includes("word-to-definition")}
                  label={t.meaning}
                  onClick={() => toggleMode("word-to-definition")}
                />
              ) : null}
              {understandingScenario?.modes?.includes("definition-to-word") ? (
                <ChoiceButton
                  active={draft.modes.includes("definition-to-word")}
                  label={t.reverse}
                  onClick={() => toggleMode("definition-to-word")}
                />
              ) : null}
            </div>
          </fieldset>

          <div className="order-6 min-w-0">
            <TrainingMixPicker
              cardFilter={draft.cardFilter}
              ratio={draft.newReviewRatio}
              onChange={changeMix}
              label={t.mix}
              reviewsOnly={t.reviewsOnly}
              newOnly={t.newOnly}
              ratioLabel={t.ratioOption}
              help={t.mixHelp}
            />
          </div>

          <fieldset className="order-9 min-w-0">
            <legend className="text-sm font-semibold text-slate-950 dark:text-white">
              {t.answerMode}
            </legend>
            <div className="mt-2 flex gap-2">
              <ChoiceButton active label={t.selfRate} onClick={() => undefined} />
              <ChoiceButton active={false} disabled label={t.typed} onClick={() => undefined} />
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t.selfRateHelp}
            </p>
          </fieldset>

          <section className="order-2 min-w-0 text-sm font-semibold text-slate-950 dark:text-white">
            <h2>{t.material}</h2>
            <p className="mt-2 inline-flex max-w-full items-center rounded-full border border-indigo-400 bg-indigo-500/10 px-3 py-1 text-sm text-indigo-800 dark:text-indigo-200">
              <span className="truncate">{lists.find((option) => option.value === draft.listValue)?.label ?? t.loading}</span>
            </p>
            <div className="relative mt-2 flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100/70 text-slate-600 focus-within:ring-2 focus-within:ring-indigo-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
              <Plus size={14} aria-hidden="true" />
              <span aria-hidden="true">{t.changeMaterial}</span>
            <select
              aria-label={t.list}
              value={draft.listValue}
              disabled={trainingLanguageLoading || Boolean(pendingLanguage) || startPending}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  listValue: event.target.value,
                }))
              }
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
            >
              {lists.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            </div>
            <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
              {t.materialHelp}
            </span>
          </section>

          <details className="order-10 min-w-0 rounded-lg bg-slate-100/70 px-3 py-2 dark:bg-slate-900/50">
          <summary className="min-h-8 cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t.activity}
          </summary>
          <p className="mb-3 mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {t.activityHelp}
          </p>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t.source}
            <select
              aria-label={t.source}
              value={draft.sourceValue}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  sourceValue: event.target.value,
                }))
              }
              className="mt-2 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="all">{t.allSources}</option>
              <option value="kind:youtube">{t.youtube}</option>
              {sources.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t.date}
            <select
              aria-label={t.date}
              value={draft.dateWindow}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dateWindow: event.target.value as TrainingDateWindow,
                }))
              }
              className="mt-2 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="all">{t.allDates}</option>
              <option value="today">{t.today}</option>
              <option value="yesterday">{t.yesterday}</option>
              <option value="daysAgo">{t.daysAgo}</option>
            </select>
            {draft.dateWindow === "daysAgo" ? (
              <input
                aria-label={t.daysAgo}
                type="number"
                min={0}
                max={365}
                value={draft.daysAgo ?? 7}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    daysAgo: Math.max(
                      0,
                      Math.min(365, Number(event.target.value) || 0),
                    ),
                  }))
                }
                className="mt-3 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
              />
            ) : null}
          </label>
          </details>
        </div>

        <section className="mt-6 pb-4">
          <TrainingSessionSizePicker
            value={draft.sessionSize}
            onChange={(sessionSize) =>
              setDraft((current) => ({
                ...current,
                sessionSize,
                ...(sessionSize === "all-due-today" ? { cardFilter: "review" as const } : {}),
              }))
            }
            label={t.sessionSize}
            exercisesLabel={t.exercises}
            allDueLabel={t.allDueToday}
            allDueHelp={t.allDueHelp}
          />
        </section>
      </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 shrink-0 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">
            {selectionSummary} · {draft.sessionSize === "all-due-today" ? t.allDueToday : t.exercises(draft.sessionSize)}
          </p>
          <div className="flex w-full shrink-0 gap-2 sm:w-auto sm:min-w-80">
            {storageKey ? (
              <button
                type="button"
                onClick={savePreset}
                disabled={!draftScenarioSupported || trainingLanguageLoading || Boolean(pendingLanguage)}
                className={`${actionClass} min-w-0 flex-[0.75] border-slate-300 bg-white text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200`}
              >
                {editingPresetId ? t.updatePreset : t.savePreset}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void requestStart(draft)}
              disabled={
                startPending || scenarioLoading || startBlocked || !draftScenarioSupported || trainingLanguageLoading || Boolean(pendingLanguage)
              }
              className={`${actionClass} min-w-0 flex-[1.25] border-indigo-500 bg-indigo-500 text-white hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-60 dark:text-slate-950`}
            >
              {startPending
                ? t.starting
                : scenarioLoading
                  ? t.loading
                  : draftScenarioSupported
                    ? replacementWarning
                      ? t.startHere
                      : t.start
                    : t.chooseGoal}
            </button>
          </div>
        </div>
        {presetMessage || replacementWarning ? (
          <p role="status" className="mx-auto mt-1 w-full max-w-5xl text-xs text-slate-500 dark:text-slate-400">
            {presetMessage || t.replacementWarning}
          </p>
        ) : null}
      </div>
    </div>
  );
}
