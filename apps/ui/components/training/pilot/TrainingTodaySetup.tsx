"use client";
import {useAccountMaterial} from "@/components/practice/material/AccountMaterialProvider";
import {useTrainingAvailability} from "@/lib/training/availability/useTrainingAvailability";
import { useNewTrainingMaterial } from "@/components/practice/material/useNewTrainingMaterial";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Plus } from "lucide-react";
import { TrainingLexicalPreview } from "./TrainingLexicalPreview";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type {
  CardFilter,
  DetailedStats,
  DutchNounArticle,
  DutchTrainingPartOfSpeech,
  TrainingDateWindow,
  TrainingExerciseFamily,
  TrainingMode,
  TrainingSessionSize,
} from "@/lib/types";
import { TrainingPilotStatePanel } from "./TrainingPilotStatePanel";
import { TrainingMixPicker, mixStepSelection } from "./TrainingMixPicker";
import { TrainingSessionSizePicker } from "./TrainingSessionSizePicker";
import { useAccountTrainingSetups } from "@/lib/training/setups/useAccountTrainingSetups";
import {readLastSelectedTraining, resolveHighlightedTraining, writeLastSelectedTraining} from "@/lib/training/setups/lastSelected";
import {hasUnsavedTrainingChanges} from "@/lib/training/setups/unsavedChanges";
import type { SavedTraining } from "@/lib/training/setups/model";
import { getUiMessages } from "@/lib/uiMessages";
import { SavedTrainingControls } from "@/components/practice/SavedTrainingControls";
import {trainingPresentationV1Enabled} from "@/lib/platform/platformV2Rollout";
import {TrainingScreenTransition} from "./TrainingScreenTransition";
import {ApprovedTrainingBuilder} from "./ApprovedTrainingBuilder";
import {AccountTrainingOverview, type OwnedTrainingOverviewSession} from "./AccountTrainingOverview";
import practiceTheme from "@/components/practice/ui/practiceTheme.module.css";

export type TrainingPilotStatus =
  "ready" | "preparing" | "loading" | "empty" | "error" | "first-use";

import type { TrainingSetupDraft } from "@/lib/training/setups/types";
export type { TrainingSetupDraft } from "@/lib/training/setups/types";

export const DEFAULT_SESSION_SIZE: TrainingSessionSize = 10;
/** A material chosen elsewhere (Statistics); opens the builder, never starts a run by itself. */
export type TrainingMaterialIntent = {
  key: number;
  userId: string;
  languageCode: string;
  material: Pick<TrainingSetupDraft, "materialMode"> & Partial<Pick<TrainingSetupDraft, "listValue" | "dictionaryIds">>;
};

export type {TrainingSetupOption} from "@/lib/training/setups/availability";
import type {TrainingSetupOption} from "@/lib/training/setups/availability";

export {isTrainingSetupDraftSupported, isTrainingSetupMaterialAvailable} from "@/lib/training/setups/availability";
import {isTrainingSetupPaused, isTrainingSetupDraftSupported, isTrainingSetupMaterialAvailable} from "@/lib/training/setups/availability";

const defaultModesForScenario = (scenario: TrainingSetupOption) => {
  const modes = scenario.modes ?? [];
  if (scenario.value === "idiom" && modes.includes("word-to-definition")) {
    return ["word-to-definition"] satisfies TrainingMode[];
  }
  if (
    scenario.value === "understanding" &&
    modes.includes("word-to-definition")
  ) {
    return ["word-to-definition"] satisfies TrainingMode[];
  }
  return modes;
};

const familyForDraft = (draft: Pick<TrainingSetupDraft, "family">): TrainingExerciseFamily =>
  draft.family ?? "meaning";

type Props = {
  emptyTraining?:{trainingId:string;message:string;canReviewAhead?:boolean};
  userId?: string;
  trainingLanguageCode?: string;
  trainingLanguageOptions?: TrainingSetupOption[];
  trainingLanguageLoading?: boolean;
  onTrainingLanguageChange?: (language: string) => void;
  interfaceLanguage: OnboardingLanguage;
  translationTargetLanguageCode?: string | null;
  status: TrainingPilotStatus;
  startError?: string | null;
  initialDraft: TrainingSetupDraft;
  onStartupReady?: () => void;
  initialView?: "today" | "setup";
  stats: DetailedStats;
  scenarios: TrainingSetupOption[];
  lists: TrainingSetupOption[];
  dictionaries?: TrainingSetupOption[];
  dictionariesLoading?: boolean;
  sources: TrainingSetupOption[];
  startPending?: boolean;
  scenarioLoading?: boolean;
  statsStatus?: "pending" | "ready" | "error";
  sessionResumeStatus?: "pending" | "ready" | "error";
  cardPreparationStatus?: "idle" | "pending" | "ready" | "error" | "empty";
  startBlocked?: boolean;
  continueDisabled?: boolean;
  onRetryStats?: () => void;
  onRetryResume?: () => void;
  onRetryCard?: () => void;
  /** A saved local queue was superseded by a deliberate start elsewhere. */
  replacementWarning?: boolean;
  hasOwnedSession?: boolean;
  activeSessionLabel?: string;
  ownedSession?: OwnedTrainingOverviewSession;
  onContinue: () => void;
  onLoadTraining?: (training: SavedTraining) => void;
  materialIntent?: TrainingMaterialIntent | null;
  onMaterialIntentConsumed?: () => void;
  onStart: (
    draft: TrainingSetupDraft,
    sessionName?: string,
    options?:import("./useTrainingPilotController").TrainingStartOptions,
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
    wordInContext: "Translation",
    contextLanguageNeeded: "Choose a translation language in Settings to use this exercise.",
    unavailable: "Coming when this training path is ready",
    lexicalUnavailable: "Choose one or more parts of speech. With no selection, all parts of speech are included.",
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
    idiomDirectionHelp: "Choose one or both directions for idiom exercises.",
    activity: "Recent activity",
    activityHelp: "Optional: narrow by event date and source; this does not mean forgotten words only.",
    materialHelp: "Choose a dictionary or one collection.",
    allDictionaries: "All accessible dictionaries",
    chosenDictionaries: "Selected dictionaries",
    selectDictionary: "Choose dictionaries",
    partialDictionaryAccess: "Some selected dictionaries are unavailable; this session will use only those you can access.",
    loadingDictionaries: "Loading dictionaries…",
    dictionaryQueueDeferred: "The exact cards are selected when you start.",
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
    collectionMode: "One collection",
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
    materialUnavailable: "Selected material is unavailable. Choose another before starting.",
    chooseGoal: "Choose a training goal",
    editPreset: "Edit",
    startPreset: "Start",
    statsLoading: "Loading progress…",
    statsError: "Progress could not be loaded.",
    resumePending: "Checking your saved session…",
    resumeError: "Your saved session could not be checked.",
    retryResume: "Retry session check",
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
    wordInContext: "Vertaling",
    contextLanguageNeeded: "Kies een vertaaltaal in Instellingen voor deze oefening.",
    unavailable: "Beschikbaar zodra deze training klaar is",
    lexicalUnavailable: "Kies een of meer woordsoorten. Zonder selectie worden alle woordsoorten meegenomen.",
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
    idiomDirectionHelp: "Kies één of beide richtingen voor uitdrukkingen.",
    activity: "Recente activiteit",
    activityHelp: "Optioneel: filter op datum en bron; dit selecteert niet alleen vergeten woorden.",
    materialHelp: "Kies een woordenboek of één collectie.",
    allDictionaries: "Alle toegankelijke woordenboeken",
    chosenDictionaries: "Gekozen woordenboeken",
    selectDictionary: "Kies woordenboeken",
    partialDictionaryAccess: "Sommige gekozen woordenboeken zijn niet beschikbaar; deze sessie gebruikt alleen de toegankelijke.",
    loadingDictionaries: "Woordenboeken laden…",
    dictionaryQueueDeferred: "De exacte kaarten worden gekozen wanneer je start.",
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
    collectionMode: "Eén collectie",
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
    materialUnavailable: "Het gekozen materiaal is niet beschikbaar. Kies ander materiaal voordat je start.",
    chooseGoal: "Kies een trainingsdoel",
    editPreset: "Bewerken",
    startPreset: "Starten",
    statsLoading: "Voortgang laden…",
    statsError: "Voortgang kon niet worden geladen.",
    resumePending: "Je opgeslagen sessie wordt gecontroleerd…",
    resumeError: "Je opgeslagen sessie kon niet worden gecontroleerd.",
    retryResume: "Sessiecontrole opnieuw proberen",
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
    wordInContext: "Перевод",
    contextLanguageNeeded: "Для этого упражнения выберите язык перевода в настройках.",
    unavailable: "Появится, когда сценарий будет готов",
    lexicalUnavailable: "Выберите одну или несколько частей речи. Без выбора включены все части речи.",
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
    idiomDirectionHelp: "Для идиом выберите одно или оба направления.",
    activity: "Недавняя активность",
    activityHelp: "Можно сузить по дате и источнику; это не выбор только забытых слов.",
    materialHelp: "Выберите словарь или одну коллекцию.",
    allDictionaries: "Все доступные словари",
    chosenDictionaries: "Выбранные словари",
    selectDictionary: "Выберите словари",
    partialDictionaryAccess: "Некоторые выбранные словари недоступны; сессия использует только те, к которым есть доступ.",
    loadingDictionaries: "Загружаем словари…",
    dictionaryQueueDeferred: "Точные карточки будут выбраны при запуске.",
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
    collectionMode: "Одна коллекция",
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
    materialUnavailable: "Выбранный материал недоступен. Перед запуском выберите другой.",
    chooseGoal: "Выберите цель тренировки",
    editPreset: "Изменить",
    startPreset: "Начать",
    statsLoading: "Загружаем статистику…",
    statsError: "Не удалось загрузить статистику.",
    resumePending: "Проверяем сохранённую сессию…",
    resumeError: "Не удалось проверить сохранённую сессию.",
    retryResume: "Повторить проверку сессии",
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
  emptyTraining,
  trainingLanguageCode,
  trainingLanguageOptions: readableLanguageOptions = [{ value: "nl", label: "Nederlands" }],
  trainingLanguageLoading = false,
  onTrainingLanguageChange,
  interfaceLanguage,
  translationTargetLanguageCode,
  status,
  startError,
  initialDraft,
  initialView = "today",
  onStartupReady,
  stats,
  scenarios,
  lists: readableLists,
  dictionaries: readableDictionaries = [],
  dictionariesLoading = false,
  sources,
  startPending = false,
  scenarioLoading = false,
  statsStatus = "ready",
  sessionResumeStatus = "ready",
  cardPreparationStatus = "ready",
  startBlocked: externalStartBlocked = false,
  continueDisabled = false,
  onRetryStats,
  onRetryResume,
  onRetryCard,
  replacementWarning = false,
  hasOwnedSession = true,
  activeSessionLabel,
  ownedSession,
  onContinue,
  onLoadTraining,
  materialIntent = null,
  onMaterialIntentConsumed,
  onStart,
  onRetry,
}: Props) {
  const material = useNewTrainingMaterial({
    languageCode: trainingLanguageCode, interfaceLanguage,
    languages: readableLanguageOptions, lists: readableLists, dictionaries: readableDictionaries,
  });
  const {languages: trainingLanguageOptions, lists, dictionaries} = material;
  const startBlocked = externalStartBlocked || material.status !== "ready";
  const materialCopy = getUiMessages(interfaceLanguage).materialPreferences;
  const materialNotice = material.status === "ready"
    ? !material.currentLanguageAllowed ? <p role="status">{copy[interfaceLanguage].materialUnavailable}</p> : null
    : <p role={material.status === "error" ? "alert" : "status"}>
      {material.status === "error" ? materialCopy.loadError : materialCopy.loading}
      {material.status === "error" && <button type="button" onClick={material.reload}>{materialCopy.retry}</button>}
    </p>;
  const t = copy[interfaceLanguage];
  const [screen, setScreen] = useState<"today" | "setup">(initialView);
  const [draft, setDraft] = useState({
    ...initialDraft,
    sessionSize: initialDraft.sessionSize ?? DEFAULT_SESSION_SIZE,
  });
  const account = useAccountTrainingSetups(userId);
  // Report actionable readiness, including errors; never hide recovery behind startup.
  const startupSettled = status !== "preparing" && status !== "loading" &&
    (status !== "ready" || (material.status !== "loading" && account.status !== "loading"));
  useEffect(() => { if (startupSettled) onStartupReady?.(); }, [startupSettled, onStartupReady]);
  const accountCopy = getUiMessages(interfaceLanguage).accountTrainingSetups;
  const presets = account.snapshot.document.trainings.filter(item => item.languageCode === trainingLanguageCode);
  const canSaveAccount = Boolean(userId && trainingLanguageCode);
  const [highlighted, setHighlighted] = useState<{ownerId:string|undefined;id:string|null}>(()=>({ownerId:userId,id:readLastSelectedTraining(userId)}));
  const selectedTrainingId = resolveHighlightedTraining(account.snapshot.document.trainings,
    highlighted.ownerId === userId ? highlighted.id : readLastSelectedTraining(userId), account.snapshot.document.mainTrainingId);
  const selectedTraining = account.snapshot.document.trainings.find(training=>training.id===selectedTrainingId);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const accountMaterial = useAccountMaterial();
  const availabilityRecipe = selectedTraining ?? (!account.snapshot.document.trainings.length ? {languageCode:trainingLanguageCode??"nl",draft:initialDraft} : null);
  const availabilityResult = useTrainingAvailability({ownerId:userId??null,recipe:availabilityRecipe,
    enabled:trainingPresentationV1Enabled() && screen === "today" && account.status === "ready" && material.status === "ready" &&
      Boolean(availabilityRecipe && availabilityRecipe.languageCode === trainingLanguageCode && !pendingLanguage && !isTrainingSetupPaused(availabilityRecipe.draft)),
    refresh:JSON.stringify([account.snapshot.revision,accountMaterial?.snapshot?.revision,ownedSession?.id,ownedSession?.completed,stats.reviewCardsDone,stats.newCardsToday,translationTargetLanguageCode])});
  const availability = availabilityRecipe ? {trainingId:selectedTrainingId??"current-setup",status:availabilityResult.status === "ready"?"ready" as const:availabilityResult.status === "error"?"error" as const:"loading" as const,
    dueToday:availabilityResult.status === "ready"?availabilityResult.value.dueToday:null,
    totalReviews:availabilityResult.status === "ready"?availabilityResult.value.totalReviews:null,
    stillNew:availabilityResult.status === "ready"?availabilityResult.value.newCards:null} : undefined;
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const editingTraining = presets.find(item => item.id === editingPresetId);
  const [trainingName, setTrainingName] = useState<string|null>(null);
  const [presetMessage, setPresetMessage] = useState("");
  const [selectedIntent, setSelectedIntent] = useState<{id:string;userId:string|undefined;language:string;action:"edit"|"load"|"launch"}|null>(null);


  const editorOwner=useRef(userId);
  useEffect(() => {
    if(editorOwner.current===userId)return;
    editorOwner.current=userId;
    setEditingPresetId(null);setSelectedIntent(null);setTrainingName(null);setPresetMessage("");setPendingLanguage(null);
    setDraft({...initialDraft,sessionSize:initialDraft.sessionSize??DEFAULT_SESSION_SIZE});setScreen("today");
  }, [userId, initialDraft]);

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
    if (screen !== "setup" || scenarioLoading || scenarios.length === 0 || isTrainingSetupPaused(draft)) return;
    const selectedScenario = scenarios.find(
      (option) => option.value === draft.scenarioId,
    );
    if (selectedScenario && isTrainingSetupDraftSupported(draft, scenarios))
      return;
    const nextScenario =
      scenarios.find((option) => option.value === (familyForDraft(draft) === "idiom" ? "idiom" : familyForDraft(draft) === "sentence" ? "sentences" : "understanding")) ??
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
  const initialMaterialAvailable = isTrainingSetupMaterialAvailable(initialDraft, lists, dictionaries);
  const draftMaterialAvailable = isTrainingSetupMaterialAvailable(draft, lists, dictionaries);

  const completed = stats.newCardsToday + stats.reviewCardsDone;
  const activeFamily = familyForDraft(draft);
  const selectedScenario = scenarios.find((option) => option.value === draft.scenarioId);
  const selectedModeLabels = [
    draft.modes.includes("word-to-definition") ? t.meaning : null,
    draft.modes.includes("definition-to-word") ? t.reverse : null,
  ].filter(Boolean);
  const selectedList = draft.materialMode === "all-dictionaries"
    ? dictionariesLoading ? t.loadingDictionaries : t.allDictionaries
    : draft.materialMode === "selected-dictionaries"
      ? dictionariesLoading ? t.loadingDictionaries : (draft.dictionaryIds ?? [])
          .map((id) => dictionaries.find((source) => source.value === id)?.label)
          .filter(Boolean)
          .join(", ") || t.materialUnavailable
      : lists.find((option) => option.value === draft.listValue)?.label;
  const selectionSummary = useMemo(
    () =>
      [
        trainingLanguageCode?.toUpperCase(),
        draft.cardFilter === "both"
          ? t.ratioOption(draft.newReviewRatio)
          : draft.cardFilter === "new"
            ? t.newOnly
            : t.reviewsOnly,
        activeFamily === "idiom" ? t.idioms : activeFamily === "sentence" ? t.sentences : activeFamily === "word-in-context" ? t.wordInContext : null,
        selectedModeLabels.join(" + "),
        selectedList,
      ]
        .filter(Boolean)
        .join(" · "),
    [activeFamily, draft.cardFilter, draft.newReviewRatio, selectedList, selectedModeLabels, t, trainingLanguageCode],
  );

  const openSetup = () => {
    setSelectedIntent(null);
    setTrainingName(null);
    setEditingPresetId(null);
    setPresetMessage("");
    setDraft({
      ...initialDraft,
      sessionSize: initialDraft.sessionSize ?? DEFAULT_SESSION_SIZE,
    });
    setScreen("setup");
  };

  const savePreset = async (copyName?: string) => {
    if (!canSaveAccount || !trainingLanguageCode || account.status !== "ready" || account.pending || !draftScenarioSupported || !draftMaterialAvailable || trainingLanguageLoading || pendingLanguage) return false;
    const sizeLabel = draft.sessionSize === "all-due-today"
      ? t.allDueToday
      : t.exercises(draft.sessionSize);
    const mixLabel = draft.cardFilter === "both"
      ? t.ratioOption(draft.newReviewRatio)
      : draft.cardFilter === "new"
        ? t.newOnly
        : t.reviewsOnly;
    const presetName = `${selectedList ?? t.list} · ${activeFamily === "idiom" ? t.idioms : activeFamily === "sentence" ? t.sentences : activeFamily === "word-in-context" ? t.wordInContext : t.words} · ${mixLabel} · ${sizeLabel}`;
    const preset: SavedTraining = {
      id: copyName !== undefined ? crypto.randomUUID() : editingPresetId ?? crypto.randomUUID(),
      name: (copyName?.trim() || (trainingPresentationV1Enabled() ? trainingName?.trim() || selectedList || getUiMessages(interfaceLanguage).builder.customTraining : presetName)).slice(0, 160),
      languageCode: trainingLanguageCode,
      draft,
    };
    const result = await account.save(preset, copyName !== undefined || editingPresetId === null);
    if (result === "unavailable") return false;
    if (result === "saved") {
      setEditingPresetId(preset.id);
      setTrainingName(preset.name);
      setPresetMessage("");
    } else {
      setPresetMessage(result === "conflict" ? accountCopy.conflict : accountCopy.saveFailed);
    }
    return result === "saved";
  };

  const accountAction = async (action: () => Promise<string>) => {
    const result = await action();
    if (result === "unavailable") return false;
    setPresetMessage(result === "saved" ? "" : result === "conflict" ? accountCopy.conflict : accountCopy.saveFailed);
    return result === "saved";
  };

  const requestStart = useCallback(async (nextDraft: TrainingSetupDraft, sessionName?: string, options?:import("./useTrainingPilotController").TrainingStartOptions) => {
    if (isTrainingSetupPaused(nextDraft) || trainingLanguageLoading || pendingLanguage || startBlocked || !material.currentLanguageAllowed || !isTrainingSetupMaterialAvailable(nextDraft, lists, dictionaries)) return;
    if (nextDraft.family === "word-in-context" && translationTargetLanguageCode === null) return;
    const started = await (options?onStart(nextDraft,sessionName,options):sessionName?onStart(nextDraft,sessionName):onStart(nextDraft));
    if (started === false) setScreen("today");
  }, [trainingLanguageLoading, pendingLanguage, startBlocked, material.currentLanguageAllowed, lists, dictionaries, translationTargetLanguageCode, onStart]);

  useEffect(() => {
    if (!selectedIntent || selectedIntent.userId !== userId || selectedIntent.language !== trainingLanguageCode || trainingLanguageLoading || scenarioLoading || pendingLanguage || account.status !== "ready" || (selectedIntent.action === "launch" && startBlocked)) return;
    const selected = account.snapshot.document.trainings.find(item => item.id === selectedIntent.id && item.languageCode === trainingLanguageCode);
    setSelectedIntent(null);
    if (!selected) { setPresetMessage(accountCopy.conflict); return; }
    if (selectedIntent.action === "edit") {
      setDraft({...selected.draft,sessionSize:selected.draft.sessionSize??DEFAULT_SESSION_SIZE});
      setTrainingName(selected.name);
      setEditingPresetId(selected.id); setPresetMessage(""); setScreen("setup");
    } else if (selectedIntent.action === "load") {
      onLoadTraining?.(selected);
    } else if (!isTrainingSetupMaterialAvailable(selected.draft,lists,dictionaries)) {
      setPresetMessage(t.materialUnavailable);
    } else if (isTrainingSetupDraftSupported(selected.draft,scenarios)) {
      void requestStart(selected.draft, selected.name,{trainingId:selected.id});
    } else setPresetMessage(t.chooseGoal);
  }, [selectedIntent, userId, trainingLanguageCode, trainingLanguageLoading, scenarioLoading, pendingLanguage, account.status, account.snapshot.document.trainings, startBlocked, accountCopy.conflict, scenarios, lists, dictionaries, requestStart, onLoadTraining, t.chooseGoal, t.materialUnavailable]);

  const handledMaterialIntent = useRef<number | null>(null);
  useEffect(() => {
    if (!materialIntent || handledMaterialIntent.current === materialIntent.key) return;
    const finish = () => { handledMaterialIntent.current = materialIntent.key; onMaterialIntentConsumed?.(); };
    if (materialIntent.userId !== userId) { finish(); return; }
    if (material.status !== "ready") return;
    if (!trainingLanguageOptions.some(option => option.value === materialIntent.languageCode)) {
      finish(); setPresetMessage(t.materialUnavailable); return;
    }
    if (materialIntent.languageCode !== trainingLanguageCode) {
      if (pendingLanguage !== materialIntent.languageCode) {
        setPendingLanguage(materialIntent.languageCode);
        onTrainingLanguageChange?.(materialIntent.languageCode);
      }
      return;
    }
    if (trainingLanguageLoading || pendingLanguage) return;
    finish();
    setSelectedIntent(null); setTrainingName(null); setEditingPresetId(null); setPresetMessage("");
    setDraft({ ...initialDraft, sessionSize: initialDraft.sessionSize ?? DEFAULT_SESSION_SIZE, ...materialIntent.material });
    setScreen("setup");
  }, [materialIntent, onMaterialIntentConsumed, userId, material.status, trainingLanguageOptions, trainingLanguageCode, trainingLanguageLoading, pendingLanguage, onTrainingLanguageChange, initialDraft, t.materialUnavailable]);

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

  if (screen === "today" && trainingPresentationV1Enabled()) {
    return <TrainingScreenTransition screen="today"><AccountTrainingOverview availability={availability} onAvailabilityRetry={availabilityResult.reload} selectedTrainingId={selectedTrainingId} ownerId={userId} emptyTraining={emptyTraining} onEarlyReview={training=>void requestStart({...training.draft,cardFilter:"review"},training.name,{trainingId:training.id,reviewTiming:"early"})} interfaceLanguage={interfaceLanguage} languageCode={trainingLanguageCode??"nl"}
      languageOptions={trainingLanguageOptions} lists={lists} dictionaries={dictionaries} scenarios={scenarios}
      snapshot={account.snapshot} accountStatus={account.status} initialDraft={initialDraft}
      ownedSession={hasOwnedSession?ownedSession:undefined} activeSessionLabel={activeSessionLabel}
      pending={startPending||scenarioLoading||Boolean(selectedIntent)} ready={!startBlocked&&!trainingLanguageLoading}
      continueDisabled={continueDisabled} materialUnavailable={t.materialUnavailable} partialMaterialNotice={t.partialDictionaryAccess} setupUnavailable={t.chooseGoal}
      translationUnavailable={t.contextLanguageNeeded} translationLanguage={translationTargetLanguageCode}
      onCreate={openSetup} onDefaultLaunch={()=>void requestStart(initialDraft)} onContinue={onContinue}
      onRetry={()=>void account.reload()} onSelect={(training,action)=>{
        if (!(action === "launch" ? trainingLanguageOptions : readableLanguageOptions).some(option=>option.value===training.languageCode)) { setPresetMessage(t.materialUnavailable); return; }
        if(action==="load" || action==="launch") {
          setHighlighted({ownerId:userId,id:training.id});
          writeLastSelectedTraining(userId,training.id);
        }
        setSelectedIntent({id:training.id,userId,language:training.languageCode,action});
        if(training.languageCode!==trainingLanguageCode)onTrainingLanguageChange?.(training.languageCode);
      }}>
      {materialNotice}
      {presetMessage&&<p role="status">{presetMessage}</p>}
      {sessionResumeStatus!=="ready"&&<p role={sessionResumeStatus==="error"?"alert":"status"}>{sessionResumeStatus==="pending"?t.resumePending:t.resumeError}{sessionResumeStatus==="error"&&<button onClick={onRetryResume}>{t.retryResume}</button>}</p>}
      {cardPreparationStatus==="error"&&<p role="alert">{t.cardError}<button onClick={onRetryCard}>{t.retryCard}</button></p>}
    </AccountTrainingOverview></TrainingScreenTransition>;
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

          {hasOwnedSession ? (
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
          ) : null}

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
                {initialDraft.materialMode && initialDraft.materialMode !== "collection"
                  ? t.dictionaryQueueDeferred
                  : statsStatus === "ready"
                    ? t.queueSummary(stats.reviewCardsDue, stats.newWordsToday)
                  : statsStatus === "pending"
                    ? t.statsLoading
                    : t.statsError}
              </p>
            </div>
            {sessionResumeStatus !== "ready" ? (
              <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                <p
                  role={sessionResumeStatus === "error" ? "alert" : "status"}
                  aria-live="polite"
                >
                  {sessionResumeStatus === "pending" ? t.resumePending : t.resumeError}
                </p>
                {sessionResumeStatus === "error" && onRetryResume ? (
                  <button type="button" onClick={onRetryResume} className="mt-1 font-semibold text-indigo-600 dark:text-indigo-300">
                    {t.retryResume}
                  </button>
                ) : null}
              </div>
            ) : null}
            {cardPreparationStatus !== "ready" && cardPreparationStatus !== "idle" ? (
              <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                <p
                  role={cardPreparationStatus === "error" ? "alert" : "status"}
                  aria-live="polite"
                >
                  {cardPreparationStatus === "pending"
                    ? t.cardPending
                    : cardPreparationStatus === "error"
                      ? startError === "training_material_unavailable" ? t.materialUnavailable : t.cardError
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
                startPending || scenarioLoading || startBlocked || !initialScenarioSupported || !initialMaterialAvailable
              }
              className={`${actionClass} mt-4 w-full border-indigo-500 bg-indigo-500/15 text-indigo-900 hover:bg-indigo-500/25 disabled:cursor-wait disabled:opacity-60 dark:text-indigo-100`}
            >
              {startPending
                ? t.starting
                : scenarioLoading
                  ? t.loading
                  : !initialScenarioSupported
                    ? t.chooseGoal
                    : !initialMaterialAvailable
                      ? dictionariesLoading && initialDraft.materialMode && initialDraft.materialMode !== "collection"
                        ? t.loadingDictionaries
                        : t.materialUnavailable
                      : t.startCurrent}
            </button>
          </section>
          {canSaveAccount ? (
            <section aria-label={getUiMessages(interfaceLanguage).trainingOverview.saved} className="pt-1">
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                {getUiMessages(interfaceLanguage).trainingOverview.saved}
              </h2>
              {presetMessage && <p role="status" className="mt-2 text-sm">{presetMessage}</p>}
              {account.status === "loading" ? <p role="status" className="mt-2 text-sm">{accountCopy.loading}</p> : null}
              {account.status === "error" ? <div role="alert" className="mt-2 text-sm">
                <p>{accountCopy.loadFailed}</p><button type="button" onClick={() => void account.reload()}>{accountCopy.retry}</button>
              </div> : null}
              {account.status === "ready" && presets.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {accountCopy.empty}
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {presets.map((preset) => {
                    const supported = isTrainingSetupDraftSupported(preset.draft, scenarios);
                    const materialAvailable = isTrainingSetupMaterialAvailable(preset.draft, lists, dictionaries);
                    const missingSelectedDictionary = preset.draft.materialMode === "selected-dictionaries" &&
                      preset.draft.dictionaryIds?.some((id) => !dictionaries.some((source) => source.value === id));
                    return (
                      <div key={preset.id} className="flex items-center gap-2 rounded-xl bg-slate-100/70 p-2 dark:bg-slate-900/55">
                        <span className="min-w-0 flex-1 truncate px-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                          {preset.name}{account.snapshot.document.mainTrainingId === preset.id && <span className="ml-2 text-xs font-normal">· {getUiMessages(interfaceLanguage).builder.mainTraining}</span>}
                        </span>
                        {missingSelectedDictionary && !dictionariesLoading ? (
                          <span className="text-xs text-amber-700 dark:text-amber-300">
                            {materialAvailable ? t.partialDictionaryAccess : t.materialUnavailable}
                          </span>
                        ) : !materialAvailable ? (
                          <span className="text-xs text-amber-700 dark:text-amber-300">
                            {dictionariesLoading && preset.draft.materialMode && preset.draft.materialMode !== "collection" ? t.loadingDictionaries : t.materialUnavailable}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setDraft({ ...preset.draft, sessionSize: preset.draft.sessionSize ?? DEFAULT_SESSION_SIZE });
                            setTrainingName(preset.name);
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
                          disabled={account.status !== "ready" || !supported || !materialAvailable || startPending || scenarioLoading}
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
  const idiomScenario = scenarios.find((option) => option.value === "idiom");
  const selectFamily = (family: TrainingExerciseFamily) => {
  const scenario = family === "idiom" ? idiomScenario : family === "sentence" ? scenarios.find((option) => option.value === "sentences") : understandingScenario;
    if (!scenario) return;
    setDraft((current) => ({
      ...current,
      family,
      scenarioId: scenario.value,
      modes: family === "word-in-context" ? ["definition-to-word"] : defaultModesForScenario(scenario),
      ...(family !== "meaning" && current.sessionSize === "all-due-today"
        ? { sessionSize: DEFAULT_SESSION_SIZE }
        : {}),
    }));
  };
  const toggleMode = (mode: TrainingMode) => {
    if (!selectedScenario?.modes?.includes(mode)) return;
    setDraft((current) => {
      const active = current.modes.includes(mode);
      if (activeFamily === "word-in-context") return current;
      if (activeFamily !== "meaning" && activeFamily !== "idiom") {
        return {
          ...current,
          scenarioId: selectedScenario.value,
          modes: [mode],
        };
      }
      if (active && current.modes.length === 1) return current;
      return {
        ...current,
        scenarioId: selectedScenario.value,
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

  if (trainingPresentationV1Enabled()) return <TrainingScreenTransition screen="setup"><ApprovedTrainingBuilder
    interfaceLanguage={interfaceLanguage} draft={draft} languageCode={trainingLanguageCode??"nl"} languageOptions={trainingLanguageOptions}
    lists={lists} dictionaries={dictionaries} sources={sources} scenarios={scenarios}
    languagePending={trainingLanguageLoading||Boolean(pendingLanguage)||startPending} dictionariesLoading={dictionariesLoading} translationLanguage={translationTargetLanguageCode}
    name={trainingName??selectedList??""} onNameChange={setTrainingName} onLanguageChange={language=>{if(language!==trainingLanguageCode){setPendingLanguage(language);onTrainingLanguageChange?.(language);}}}
    onDraftChange={setDraft} onSelectFamily={selectFamily} onToggleMode={toggleMode} onMixChange={changeMix} onBack={()=>setScreen("today")}
    hasUnsavedChanges={hasUnsavedTrainingChanges(editingTraining,{name:trainingName??selectedList??"",languageCode:pendingLanguage??trainingLanguageCode??"nl",draft})}
    editing={Boolean(editingPresetId)} onSave={()=>savePreset()} onSaveAs={name=>savePreset(name)}
    onDelete={editingTraining?async()=>{const removed=await accountAction(()=>account.remove(editingTraining.id));if(removed){setEditingPresetId(null);setScreen("today");}return removed;}:undefined}
    deletionChangesMain={Boolean(editingTraining && account.snapshot.document.mainTrainingId===editingTraining.id && account.snapshot.document.trainings.length>1)} deleteDisabled={account.pending||account.status!=="ready"}
    onBeginSave={()=>setPresetMessage("")} onStart={()=>void requestStart(draft, trainingName?.trim() || undefined, editingPresetId?{trainingId:editingPresetId}:undefined)} canSave={canSaveAccount}
    saveDisabled={account.status!=="ready"||account.pending||!draftScenarioSupported||!draftMaterialAvailable||trainingLanguageLoading||Boolean(pendingLanguage)}
    startDisabled={startPending||scenarioLoading||startBlocked||!material.currentLanguageAllowed||!draftScenarioSupported||!draftMaterialAvailable||trainingLanguageLoading||Boolean(pendingLanguage)}
    saveLabel={editingPresetId?({en:"Save changes",nl:"Wijzigingen opslaan",ru:"Сохранить изменения"})[interfaceLanguage]:accountCopy.save} startLabel={startPending?t.starting:scenarioLoading?t.loading:!draftScenarioSupported?t.chooseGoal:!draftMaterialAvailable?t.materialUnavailable:t.start}
    saveNotice={presetMessage} notice={<>
      {materialNotice}
      {presetMessage&&<p role="status">{presetMessage}</p>}
      {sessionResumeStatus==="error"&&<p role="alert">{t.resumeError}<button onClick={onRetryResume}>{t.retryResume}</button></p>}
      {cardPreparationStatus==="error"&&<p role="alert">{t.cardError}<button onClick={onRetryCard}>{t.retryCard}</button></p>}
    </>}/></TrainingScreenTransition>
  ;

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
        {trainingPresentationV1Enabled()&&<label className="mt-4 block text-sm">
          {getUiMessages(interfaceLanguage).builder.trainingName}
          <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" maxLength={160}
            value={trainingName??selectedList??""} onChange={event=>setTrainingName(event.target.value)} placeholder={getUiMessages(interfaceLanguage).builder.namePlaceholder}/>
        </label>}
        {sessionResumeStatus !== "ready" ? (
          <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            <p
              role={sessionResumeStatus === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {sessionResumeStatus === "pending" ? t.resumePending : t.resumeError}
            </p>
            {sessionResumeStatus === "error" && onRetryResume ? (
              <button type="button" onClick={onRetryResume} className="mt-1 font-semibold text-indigo-600 dark:text-indigo-300">
                {t.retryResume}
              </button>
            ) : null}
          </div>
        ) : null}
        {cardPreparationStatus !== "ready" && cardPreparationStatus !== "idle" ? (
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
              <ChoiceButton active={activeFamily === "meaning"} label={t.words} onClick={() => selectFamily("meaning")} />
              <ChoiceButton
                active={activeFamily === "idiom"}
                disabled={!idiomScenario}
                label={t.idioms}
                onClick={() => selectFamily("idiom")}
              />
            </div>
            <div className="mt-2 flex gap-2">
              <ChoiceButton active={activeFamily === "word-in-context"} disabled={!understandingScenario?.modes?.includes("definition-to-word") || translationTargetLanguageCode === null} label={t.wordInContext} onClick={() => selectFamily("word-in-context")} />
              <ChoiceButton active={false} disabled label={t.listening} onClick={() => undefined} />
            </div>
            {translationTargetLanguageCode === null ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t.contextLanguageNeeded}</p> : null}
            {!idiomScenario ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.unavailable}</p>
            ) : null}
          </fieldset>
          <TrainingLexicalPreview
            languageCode={trainingLanguageCode ?? "nl"}
            interfaceLanguage={interfaceLanguage}
            selectedParts={draft.partOfSpeech ?? []}
            selectedArticles={draft.nounArticles ?? []}
            onPartToggle={(partOfSpeech) =>
              setDraft((current) => {
                const selected = current.partOfSpeech ?? [];
                const next = selected.includes(partOfSpeech)
                  ? selected.filter((item) => item !== partOfSpeech)
                  : [...selected, partOfSpeech];
                return {
                  ...current,
                  partOfSpeech: next,
                  nounArticles: next.includes("zn")
                    ? current.nounArticles ?? []
                    : [],
                };
              })
            }
            onArticleToggle={(article) =>
              setDraft((current) => {
                const selected = current.nounArticles ?? [];
                return {
                  ...current,
                  nounArticles: selected.includes(article)
                    ? selected.filter((item) => item !== article)
                    : [...selected, article],
                };
              })
            }
          />
          <fieldset className="order-8 min-w-0">
            <legend className="text-sm font-semibold text-slate-950 dark:text-white">
              {t.goal}
            </legend>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {activeFamily === "idiom" ? t.idiomDirectionHelp : t.directionHelp}
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
              {activeFamily !== "word-in-context" && selectedScenario?.modes?.includes("word-to-definition") ? (
                <ChoiceButton
                  active={draft.modes.includes("word-to-definition")}
                  label={t.meaning}
                  onClick={() => toggleMode("word-to-definition")}
                />
              ) : null}
              {selectedScenario?.modes?.includes("definition-to-word") ? (
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
              <span className="truncate">{selectedList ?? t.materialUnavailable}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ChoiceButton
                active={!draft.materialMode || draft.materialMode === "collection"}
                label={t.collectionMode}
                onClick={() => setDraft((current) => ({ ...current, materialMode: "collection" }))}
              />
              <ChoiceButton
                active={draft.materialMode === "all-dictionaries"}
                label={t.allDictionaries}
                onClick={() => setDraft((current) => ({ ...current, materialMode: "all-dictionaries" }))}
              />
              <ChoiceButton
                active={draft.materialMode === "selected-dictionaries"}
                label={t.chosenDictionaries}
                onClick={() => setDraft((current) => ({ ...current, materialMode: "selected-dictionaries" }))}
              />
            </div>
            {!draft.materialMode || draft.materialMode === "collection" ? (
              <div className="relative mt-2 flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100/70 text-slate-600 focus-within:ring-2 focus-within:ring-indigo-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                <Plus size={14} aria-hidden="true" />
                <span aria-hidden="true">{t.changeMaterial}</span>
                <select
                  aria-label={t.list}
                  value={draft.listValue}
                  disabled={trainingLanguageLoading || Boolean(pendingLanguage) || startPending}
                  onChange={(event) => setDraft((current) => ({ ...current, listValue: event.target.value }))}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
                >
                  {!draftMaterialAvailable && draft.listValue ? (
                    <option value={draft.listValue} disabled>{t.materialUnavailable}</option>
                  ) : null}
                  {lists.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            ) : draft.materialMode === "selected-dictionaries" ? (
              <fieldset className="mt-2 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <legend className="sr-only">{t.selectDictionary}</legend>
                {dictionaries.map((source) => (
                  <label key={source.value} className="flex min-h-10 items-center gap-2 font-normal">
                    <input
                      type="checkbox"
                      checked={draft.dictionaryIds?.includes(source.value) ?? false}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        dictionaryIds: event.target.checked
                          ? [...new Set([...(current.dictionaryIds ?? []), source.value])]
                          : (current.dictionaryIds ?? []).filter((id) => id !== source.value),
                      }))}
                    />
                    {source.label}
                  </label>
                ))}
                {!dictionariesLoading && (draft.dictionaryIds ?? []).some((id) => !dictionaries.some((source) => source.value === id)) ? (
                  <p role="status" className="text-xs font-normal text-amber-700 dark:text-amber-300">{t.partialDictionaryAccess}</p>
                ) : null}
              </fieldset>
            ) : null}
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
            allowAllDueToday={activeFamily === "meaning"}
          />
        </section>
        {editingTraining && <div className={practiceTheme.theme} data-colour-mode="app">
          <SavedTrainingControls name={editingTraining.name} language={interfaceLanguage}
            main={account.snapshot.document.mainTrainingId === editingTraining.id}
            hasOthers={account.snapshot.document.trainings.length > 1}
            pending={account.pending || account.status !== "ready"}
            onMain={() => accountAction(() => account.makeMain(editingTraining.id))}
            onDelete={async () => {
              const removed = await accountAction(() => account.remove(editingTraining.id));
              if (removed) { setEditingPresetId(null); setScreen("today"); }
              return removed;
            }} />
        </div>}
      </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 shrink-0 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">
            {selectionSummary} · {draft.sessionSize === "all-due-today" ? t.allDueToday : t.exercises(draft.sessionSize)}
          </p>
          <div className="flex w-full shrink-0 gap-2 sm:w-auto sm:min-w-80">
            {canSaveAccount ? (
              <button
                type="button"
                onClick={() => void savePreset()}
                disabled={account.status !== "ready" || account.pending || !draftScenarioSupported || !draftMaterialAvailable || trainingLanguageLoading || Boolean(pendingLanguage)}
                className={`${actionClass} min-w-0 flex-[0.75] border-slate-300 bg-white text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200`}
              >
                {editingPresetId ? accountCopy.update : accountCopy.save}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void requestStart(draft)}
              disabled={
                startPending || scenarioLoading || startBlocked || !draftScenarioSupported || !draftMaterialAvailable || trainingLanguageLoading || Boolean(pendingLanguage)
              }
              className={`${actionClass} min-w-0 flex-[1.25] border-indigo-500 bg-indigo-500 text-white hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-60 dark:text-slate-950`}
            >
              {startPending
                ? t.starting
                : scenarioLoading
                  ? t.loading
                  : !draftScenarioSupported
                    ? t.chooseGoal
                    : !draftMaterialAvailable
                      ? dictionariesLoading && draft.materialMode && draft.materialMode !== "collection"
                        ? t.loadingDictionaries
                        : t.materialUnavailable
                      : replacementWarning
                        ? t.startHere
                        : t.start}
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
