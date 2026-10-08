"use client";
import {useAccountMaterial} from "@/components/practice/material/AccountMaterialProvider";
import {useTrainingAvailability} from "@/lib/training/availability/useTrainingAvailability";
import { useNewTrainingMaterial } from "@/components/practice/material/useNewTrainingMaterial";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { mixStepSelection } from "./TrainingMixPicker";
import { useAccountTrainingSetups } from "@/lib/training/setups/useAccountTrainingSetups";
import {readLastSelectedTraining, resolveHighlightedTraining, writeLastSelectedTraining} from "@/lib/training/setups/lastSelected";
import {hasUnsavedTrainingChanges} from "@/lib/training/setups/unsavedChanges";
import type { SavedTraining } from "@/lib/training/setups/model";
import { getUiMessages } from "@/lib/uiMessages";
import {TrainingScreenTransition} from "./TrainingScreenTransition";
import {ApprovedTrainingBuilder} from "./ApprovedTrainingBuilder";
import {AccountTrainingOverview, type OwnedTrainingOverviewSession} from "./AccountTrainingOverview";

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
    contextLanguageNeeded: "Choose a translation language in Settings to use this exercise.",
    allDictionaries: "All accessible dictionaries",
    partialDictionaryAccess: "Some selected dictionaries are unavailable; this session will use only those you can access.",
    loadingDictionaries: "Loading dictionaries…",
    start: "Start training",
    starting: "Starting…",
    loading: "Loading Training",
    materialUnavailable: "Selected material is unavailable. Choose another before starting.",
    chooseGoal: "Choose a training goal",
    resumePending: "Checking your saved session…",
    resumeError: "Your saved session could not be checked.",
    retryResume: "Retry session check",
    cardError: "The next card could not be prepared. You can retry or adjust the setup.",
    retryCard: "Retry card preparation",
  },
  nl: {
    contextLanguageNeeded: "Kies een vertaaltaal in Instellingen voor deze oefening.",
    allDictionaries: "Alle toegankelijke woordenboeken",
    partialDictionaryAccess: "Sommige gekozen woordenboeken zijn niet beschikbaar; deze sessie gebruikt alleen de toegankelijke.",
    loadingDictionaries: "Woordenboeken laden…",
    start: "Training starten",
    starting: "Starten…",
    loading: "Training laden",
    materialUnavailable: "Het gekozen materiaal is niet beschikbaar. Kies ander materiaal voordat je start.",
    chooseGoal: "Kies een trainingsdoel",
    resumePending: "Je opgeslagen sessie wordt gecontroleerd…",
    resumeError: "Je opgeslagen sessie kon niet worden gecontroleerd.",
    retryResume: "Sessiecontrole opnieuw proberen",
    cardError: "De volgende kaart kon niet worden voorbereid. Probeer opnieuw of pas de selectie aan.",
    retryCard: "Kaart opnieuw voorbereiden",
  },
  ru: {
    contextLanguageNeeded: "Для этого упражнения выберите язык перевода в настройках.",
    allDictionaries: "Все доступные словари",
    partialDictionaryAccess: "Некоторые выбранные словари недоступны; сессия использует только те, к которым есть доступ.",
    loadingDictionaries: "Загружаем словари…",
    start: "Начать тренировку",
    starting: "Запускаем…",
    loading: "Загрузка тренировки",
    materialUnavailable: "Выбранный материал недоступен. Перед запуском выберите другой.",
    chooseGoal: "Выберите цель тренировки",
    resumePending: "Проверяем сохранённую сессию…",
    resumeError: "Не удалось проверить сохранённую сессию.",
    retryResume: "Повторить проверку сессии",
    cardError: "Не удалось подготовить карточку. Повторите попытку или измените настройки.",
    retryCard: "Повторить подготовку карточки",
  },
} satisfies Record<OnboardingLanguage, Record<string, unknown>>;

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
    enabled:screen === "today" && !startPending && account.status === "ready" && material.status === "ready" &&
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

  const draftScenarioSupported = isTrainingSetupDraftSupported(
    draft,
    scenarios,
  );
  const draftMaterialAvailable = isTrainingSetupMaterialAvailable(draft, lists, dictionaries);

  const activeFamily = familyForDraft(draft);
  const selectedScenario = scenarios.find((option) => option.value === draft.scenarioId);
  const selectedList = draft.materialMode === "all-dictionaries"
    ? dictionariesLoading ? t.loadingDictionaries : t.allDictionaries
    : draft.materialMode === "selected-dictionaries"
      ? dictionariesLoading ? t.loadingDictionaries : (draft.dictionaryIds ?? [])
          .map((id) => dictionaries.find((source) => source.value === id)?.label)
          .filter(Boolean)
          .join(", ") || t.materialUnavailable
      : lists.find((option) => option.value === draft.listValue)?.label;
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
    const preset: SavedTraining = {
      id: copyName !== undefined ? crypto.randomUUID() : editingPresetId ?? crypto.randomUUID(),
      name: (copyName?.trim() || (trainingName?.trim() || selectedList || getUiMessages(interfaceLanguage).builder.customTraining)).slice(0, 160),
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

  if (screen === "today") {
    return <TrainingScreenTransition screen="today"><AccountTrainingOverview availability={availability} onAvailabilityRetry={availabilityResult.reload} selectedTrainingId={selectedTrainingId} ownerId={userId} emptyTraining={emptyTraining} onEarlyReview={training=>void requestStart({...training.draft,cardFilter:"review"},training.name,{trainingId:training.id,reviewTiming:"early"})} interfaceLanguage={interfaceLanguage} languageCode={trainingLanguageCode??"nl"}
      languageOptions={trainingLanguageOptions} lists={lists} dictionaries={dictionaries} scenarios={scenarios}
      snapshot={account.snapshot} accountStatus={account.status} initialDraft={initialDraft}
      ownedSession={hasOwnedSession?ownedSession:undefined} activeSessionLabel={activeSessionLabel}
      launchPending={startPending} pending={startPending||scenarioLoading||Boolean(selectedIntent)} ready={!startBlocked&&!trainingLanguageLoading}
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

  return <TrainingScreenTransition screen="setup"><ApprovedTrainingBuilder
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

}
