"use client";

import React, { useEffect, useLayoutEffect, useState, useCallback, useMemo } from "react";
import { Joyride, type TooltipRenderProps } from "react-joyride";
import { X, RotateCcw, Flag } from "lucide-react";
import { AppFrame } from "@/components/navigation/AppFrame";
import { TrainingOverview } from "@/components/practice/TrainingOverview";
import { OnboardingSettingsSection, topics } from "./PreviewSettings";
import { readCheckpoint, saveCheckpoint, restorableStage, type BuilderCheckpoint, type PreviewTopic } from "./checkpoint";
import { SettingsDestination } from "@/components/navigation/SettingsDestination";
import { MeaningLearningProgress } from "@/components/practice/MeaningLearningProgress";
import { SenseCardReportSheet } from "@/components/feedback/SenseCardReportSheet";
import { freezeSenseCardDiagnosticSnapshot } from "@/lib/feedback/diagnosticReportClient";
import { PreviewIncomingCollections } from "./PreviewIncomingCollections";
import { acceptIncoming, incomingId, incomingName } from "./incomingFixture";
import { nextPreviewTheme } from "./themeCycle";
import { PreviewCollectionCatalog } from "./PreviewCollectionCatalog";
import { previewMeaningProgress } from "./progressFixture";
import { senseCardQuietAction } from "@/components/training/SenseCardChrome";
import { TrainingDetailsDrawer } from "@/components/training/TrainingDetailsDrawer";
import { LibrarySenseCardGroup } from "@/components/training/library-v2/LibrarySenseCardGroup";
import { buildLibrarySenseCardGroupModel } from "@/components/training/library-v2/librarySenseCardModel";
import { TrainingSenseCardStage } from "@/components/training/v2/TrainingSenseCardStage";
import { buildTrainingSenseCardModel, type TrainingSenseCardContent } from "@/components/training/v2/trainingSenseCardModel";
import { gateBankGroup, gateFurnitureEntry } from "@/lib/platform/fixtures/senseCardV1GateFixture";
import { getStoredOnboardingLanguage, type OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import { languageDisplayName } from "@/lib/languages/languageDisplayName";
import { previewLocales, previewSteps, progressLabel, type PreviewCopy, type PreviewStage } from "./content";
import { readPreviewPreferences, resolvePreviewPreferences, savePreviewPreferences, type PreviewPreferences, type PreviewTranslationLanguage } from "./preferences";
import { JourneyScreens, isLibraryStage, isBuilderStage, isPickerStage, buttonWithText } from "./JourneyScreens";
import { emptyJourney, readJourney, saveJourney, learnMeaning, type Journey } from "./journeyState";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import styles from "./preview.module.css";

type MessageData = { copy: PreviewCopy; progress: string; languageStep: boolean; secondary: boolean; inputStep: boolean; complete: boolean; extrasDone: boolean; known: boolean; onExtras: () => void; onReport: () => void; onPause: () => void; onDone: () => void; intro: boolean; onLanguageNext: () => void; doneText: string };
function TourMessage({ step, tooltipProps }: TooltipRenderProps) {
  const data = step.data as MessageData;
  return <div {...tooltipProps} className={styles.tooltip}>
    <div className={styles.tooltipTop}><span>{data.progress}</span>
      <button className={styles.pauseButton} onClick={data.onPause} aria-label={data.copy.pause}>{data.copy.pause}</button></div>
    <h2>{step.title}</h2><div className={styles.copy}>{step.content}</div>
    {data.intro && <p className={styles.introHint}>{data.copy.pauseIntro}</p>}
    {data.secondary && <p className={styles.secondaryMention}>{data.copy.secondaryMention}</p>}
    {data.complete && !data.extrasDone && <button className={styles.confirm} onClick={data.onExtras}>{data.copy.showExtras}</button>}
    {data.languageStep && <button className={styles.confirm} onClick={data.onLanguageNext}>{data.copy.continue}</button>}
    {data.known ? <><p className={styles.instruction}>{data.copy.knownHint}</p><button className={styles.confirm} onClick={data.onReport}>{data.copy.nextReport}</button></> : data.complete ? <button className={styles.confirm} onClick={data.onDone}>{data.doneText}</button>
      : <p className={styles.instruction}>{data.languageStep ? data.copy.confirmHint : data.inputStep ? data.copy.actionHint : data.copy.clickHint}</p>}
  </div>;
}

const sampleFinanceTranslations: Record<string, string> = { en: "bank", nl: "bank", ru: "банк", de: "Bank", fr: "banque", es: "banco" };
const sampleWordTranslations: Record<string, string> = { en: "bench · sofa", nl: "zitbank", ru: "скамья · диван", de: "Sitzbank · Sofa", fr: "banc · canapé", es: "banco · sofá" };
function withoutTranslations(nodes: TrainingSenseCardContent[]): TrainingSenseCardContent[] {
  return nodes.map(node => ({ ...node, translation: undefined, literalTranslation: undefined, children: withoutTranslations(node.children) }));
}

export function OnboardingPreview() {
  const [preferences, setPreferences] = useState<PreviewPreferences>(() => resolvePreviewPreferences(null));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPane, setSettingsPane] = useState<"home" | "languages" | "appearance">("home");
  const [systemDark, setSystemDark] = useState(false);
  useEffect(()=>{const media=window.matchMedia("(prefers-color-scheme: dark)"); const changed=()=>setSystemDark(media.matches);changed();media.addEventListener("change",changed);return()=>media.removeEventListener("change",changed);},[]);
  const [themeMode, setThemeMode] = useState<"light" | "dark" | "system">("light");
  const [topicQueue, setTopicQueue] = useState<PreviewTopic[]>([]);
  const [builderCheckpoint, setBuilderCheckpoint] = useState<BuilderCheckpoint | null>(null);
  const [statsEntryId, setStatsEntryId] = useState(gateFurnitureEntry.entryId);
  const [statsOpen, setStatsOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<PreviewStage>("interface");
  const [revealed, setRevealed] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [audioNotice, setAudioNotice] = useState(false);
  const [running, setRunning] = useState(true);
  const [notice, setNotice] = useState<keyof PreviewCopy | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [journey, setJourney] = useState<Journey>(emptyJourney);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [selectedTrainingId, setSelectedTrainingId] = useState("preview-dilum");
  const [preparedFor, setPreparedFor] = useState("");
  const [modalPortal, setModalPortal] = useState<HTMLElement | null>(null);
  const [sessionCompleted, setSessionCompleted] = useState(0);
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(null);
  const language = preferences.interfaceLanguage;
  const copy = previewLocales[language];
  const ui = getUiMessages(language);
  const settingsTour = ["appearance-section", "appearance-choice", "appearance-done", "languages-section", "languages-choice"].includes(stage);
  const catalogStage = stage.startsWith("sharing-");
  const incomingStage = stage.startsWith("incoming-");
  const languageStep = stage === "interface" || stage === "translation";

  useEffect(() => {
    // Read an available saved app language, but never write app/account keys.
    try { setPreferences(readPreviewPreferences(window.localStorage, getStoredOnboardingLanguage())); }
    catch { setPreferences(resolvePreviewPreferences(null)); }
    try { setJourney(readJourney(window.localStorage)); } catch { /* isolated preview storage */ }
    try {
      const checkpoint = readCheckpoint(window.localStorage);
      if (checkpoint) {
        setStage(restorableStage(checkpoint.stage)); setRunning(checkpoint.running); setRevealed(checkpoint.revealed);
        setSelectedEntryId(checkpoint.selectedEntryId); setCollectionId(checkpoint.collectionId);
        setSelectedTrainingId(checkpoint.selectedTrainingId); setEditingTrainingId(checkpoint.editingTrainingId);
        setSessionCompleted(checkpoint.sessionCompleted); setBuilderCheckpoint(checkpoint.builder);
        setThemeMode(checkpoint.theme); setSettingsPane(checkpoint.pane); setTopicQueue(checkpoint.topics);
        setDetailsOpen(checkpoint.running && checkpoint.stage === "details-return");
        setSettingsOpen(!checkpoint.running || ["appearance-section","appearance-choice","appearance-done","languages-section","languages-choice"].includes(checkpoint.stage));
      }
    } catch { /* preview remains restartable without storage */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const saved = saveCheckpoint(window.localStorage, { version: 1, stage, running, revealed,
      selectedEntryId, collectionId, selectedTrainingId, editingTrainingId, sessionCompleted,
      builder: builderCheckpoint, pane: settingsPane, theme: themeMode, topics: topicQueue });
    if (!saved) setSaveError(true);
  }, [ready, stage, running, revealed, selectedEntryId, collectionId, selectedTrainingId, editingTrainingId, sessionCompleted, builderCheckpoint, settingsPane, themeMode, topicQueue]);
  const rememberBuilder = useCallback((snapshot: BuilderCheckpoint) => setBuilderCheckpoint(snapshot), []);
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = language;
    return () => { document.documentElement.lang = previous; };
  }, [language]);
  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      const selector = stage === "interface" ? "#preview-interface select" : stage === "translation" ? "#preview-translation select" : null;
      if (selector) document.querySelector<HTMLSelectElement>(selector)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [stage, ready]);

  useLayoutEffect(() => {
    const selector = isPickerStage(stage) ? "#preview-collections dialog" : stage === "training-name" ? "#preview-builder dialog" : stage === "details-return" ? "#preview-details dialog" : null;
    setModalPortal(selector ? document.querySelector<HTMLElement>(selector) : null);
  }, [stage, detailsOpen, ready]);
  const commitJourney = (next: Journey) => {
    let saved = false;
    try { saved = saveJourney(window.localStorage, next); } catch { /* denied storage */ }
    setSaveError(!saved);
    if (saved) setJourney(next);
    return saved;
  };
  const persist = (next: PreviewPreferences) => {
    let saved = false;
    try { saved = savePreviewPreferences(window.localStorage, next); } catch { /* storage may be denied */ }
    setSaveError(!saved);
    return saved;
  };
  const choose = (patch: Partial<PreviewPreferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    persist(next);
  };
  const confirm = (next: PreviewStage) => { if (persist(preferences)) { setStage(next); setNotice(null); } };
  const replay = () => { setBuilderCheckpoint(null); setTopicQueue([]); setSettingsOpen(false); setStatsOpen(false);  setRunning(false); setStage("interface"); setDetailsOpen(false); setReportOpen(false); setAudioNotice(false); setRevealed(false); setNotice(null); setSelectedTrainingId("preview-dilum"); requestAnimationFrame(() => setRunning(true)); };
  const start = (id = "preview-dilum") => { setSelectedTrainingId(id); setSessionCompleted(0); setAudioNotice(false); setStage("card"); setRevealed(false); setNotice(null); };
  const showExtras = () => { setRunning(false); setSettingsPane("home"); setSettingsOpen(true); };
  const pauseTour = () => { setRunning(false); setDetailsOpen(false); setSettingsPane("home"); setSettingsOpen(true); };
  const resumeTour = () => { if(stage === "appearance-choice" || stage === "appearance-done") setSettingsPane("appearance"); if(stage === "languages-choice") setSettingsPane("languages"); setStage(restorableStage(stage)); setSettingsOpen(settingsTour || languageStep); setDetailsOpen(stage === "details-return"); setRunning(true); };
  const openTopic = (topic: PreviewTopic) => {
    setSettingsOpen(false); setNotice(null); setRunning(true); setStatsOpen(false);
    if (topic === "collections") { setStage("go-library"); setDetailsOpen(false); }
    if (topic === "card") { setSelectedTrainingId("preview-dilum"); setRevealed(true); setStage("audio"); }
    if (topic === "stats") { setSelectedEntryId(gateFurnitureEntry.entryId); setStage("extra-stats"); }
    if (topic === "incoming") { setStage("go-incoming-library"); }
    if (topic === "sharing") { setStage("go-sharing-library"); }
    if (topic === "languages" || topic === "appearance") { setSettingsPane(topic); setStage(topic === "appearance" ? "go-settings" : "go-settings-languages"); }
  };
  const finishTopic = () => {
    setRunning(false); setDetailsOpen(false); setStatsOpen(false);
    if (topicQueue.length) { const [next, ...rest] = topicQueue; setTopicQueue(rest); openTopic(next); }
    else { setStage("basic-complete"); setSettingsPane("home"); setSettingsOpen(true); }
  };
  const spec = previewSteps.find(step => step.id === stage)!;
  const getTarget = useCallback(() => {
    const b = ui.builder;
    const entrySelector = `#preview-meaning [data-entry-id="${selectedEntryId}"]`;
    if (stage === "incoming-received") return buttonWithText("#preview-incoming", language === "ru" ? "Добавленные мной" : language === "nl" ? "Door mij toegevoegd" : "Added by me", true);
    if (stage === "incoming-add") return buttonWithText("#preview-incoming", language === "ru" ? "Добавить по ссылке / коду" : language === "nl" ? "Toevoegen via link / code" : "Add by link / code");
    if (stage === "incoming-input") return buttonWithText("#preview-incoming", language === "ru" ? "Проверить приглашение" : language === "nl" ? "Uitnodiging controleren" : "Check invitation");
    if (stage === "incoming-preview") return buttonWithText("#preview-incoming", language === "ru" ? "Добавить в библиотеку" : language === "nl" ? "Toevoegen aan bibliotheek" : "Add to library");
    if (stage === "incoming-accepted") return buttonWithText("#preview-incoming", language === "ru" ? "Посмотреть слова" : language === "nl" ? "Woorden bekijken" : "View words");
    if (stage === "incoming-list") return buttonWithText("#preview-incoming", journey.collections.find(collection=>collection.id===incomingId)?.name??incomingName(language));
    if (stage === "extra-incoming") return buttonWithText("#preview-library-tabs", language === "ru" ? "Общий доступ" : language === "nl" ? "Gedeeld" : "Shared");
    if (stage === "go-incoming-library") return buttonWithText("nav[aria-label]", ui.navigation.library);
    if (stage === "extra-stats") return Array.from(document.querySelectorAll<HTMLElement>(`#preview-meaning [data-entry-id="${selectedEntryId}"] [data-testid=meaning-learning-progress-trigger]`)).find(button => button.getClientRects().length > 0) ?? null;
    if (stage === "extra-stats-view") return document.querySelector<HTMLElement>(`#preview-progress dialog button[aria-label="${ui.learningProgress.close}"]`);
    if (stage === "interface") return document.querySelector<HTMLElement>(`#preview-settings button[aria-label="${ui.settings.interfaceLanguage}"]`);
    if (stage === "translation" || stage === "languages-choice") return document.querySelector<HTMLElement>(`#preview-settings [role=group][aria-label="${ui.settings.translationLanguage}"]`);
    if (stage === "appearance-section") return buttonWithText("#preview-settings nav", ui.settings.appearance);
    if (stage === "languages-section") return buttonWithText("#preview-settings nav", ui.settings.languages);
    if (stage === "appearance-choice" || stage === "appearance-done") return document.querySelector<HTMLElement>(`#preview-settings [role=group][aria-label="${ui.settings.colourMode}"]`);
    if (stage === "go-settings" || stage === "go-settings-languages") return document.querySelector<HTMLElement>(`header button[aria-label="${ui.settings.title}"]`);
    if (stage === "go-sharing-library") return buttonWithText("nav[aria-label]", ui.navigation.library);
    if (stage === "extra-sharing") return buttonWithText("#preview-library-tabs", language === "ru" ? "Коллекции" : language === "nl" ? "Collecties" : "Collections");
    if (stage === "sharing-menu") return buttonWithText("[role=menu]", language === "ru" ? "Общий доступ" : language === "nl" ? "Delen" : "Share");
    if (stage.startsWith("sharing-") && stage !== "sharing-more") {
      const labels = {ru:{create:"Создать ссылку просмотра",copyLink:"Копировать ссылку",copyCode:"Копировать код",confirm:"Подтвердить",close:"Закрыть общий доступ",done:"Закрыть"},en:{create:"Create view-only link",copyLink:"Copy link",copyCode:"Copy code",confirm:"Confirm",close:"Close shared access",done:"Close"},nl:{create:"Alleen-lezenlink maken",copyLink:"Link kopiëren",copyCode:"Code kopiëren",confirm:"Bevestigen",close:"Gedeelde toegang sluiten",done:"Sluiten"}}[language];
      return buttonWithText("#preview-sharing-dialog", stage === "sharing-copy-link" ? labels.copyLink : stage === "sharing-copy-code" ? labels.copyCode : stage === "sharing-create" ? labels.create : stage === "sharing-link" ? labels.close : (stage === "sharing-done" || stage === "sharing-sent") ? labels.done : labels.confirm);
    }
    if (stage === "basic-complete") return buttonWithText("#preview-overview", ui.trainingOverview.create);
    if (stage === "card") return document.querySelector<HTMLElement>(`#preview-card button[aria-label="${platformV2Message(language, "senseCard.answer.show")}"]`);
    if (stage === "audio") return document.querySelector<HTMLElement>(`#preview-card button[aria-label="${platformV2Message(language, "senseCard.audio.play")}"]`);
    if (stage === "details-open") return document.querySelector<HTMLElement>(`#preview-card button[aria-label="${platformV2Message(language, "senseCard.wordDetails.open")}"]`);
    if (stage === "details-return") return Array.from(document.querySelectorAll<HTMLElement>(`#preview-details dialog button[aria-label="${platformV2Message(language, "common.close")}"]`)).find(button => button.getClientRects().length > 0) ?? null;
    if (stage === "extra-known") return buttonWithText("#preview-card", platformV2Message(language, "senseCard.known.mark"));
    if (stage === "answer") return buttonWithText("#preview-card", platformV2Message(language, "senseCard.learning.start"));
    if (stage === "go-library") return buttonWithText("nav", ui.navigation.library);
    if (stage === "go-training") return buttonWithText("nav", ui.navigation.training);
    if (stage === "collections") return document.querySelector<HTMLElement>(`${entrySelector} [data-testid='library-service-actions'] button`);
    if (stage === "new-collection") return document.querySelector<HTMLElement>("#preview-collections dialog");
    if (stage === "create-training") return buttonWithText("#preview-overview", ui.trainingOverview.create);
    if (stage === "source-open") return buttonWithText("#preview-builder", b.source, true);
    if (stage === "source-pick") {
      const collection = journey.collections.find(c => c.id === collectionId) ?? journey.collections[0];
      return collection ? document.querySelector<HTMLElement>(`#preview-builder button[aria-label="${CSS.escape(collection.name)}"]`) : null;
    }
    if (stage === "exercise-open") return buttonWithText("#preview-builder", b.exercises, true);
    if (stage === "direction-pick") return buttonWithText("#preview-builder", ui.trainingOverview.direction.Direct, true);
    if (stage === "save-training") return buttonWithText("#preview-builder", b.save);
    if (stage === "complete") {
      const name = journey.trainings.at(-1)?.name;
      return Array.from(document.querySelectorAll<HTMLElement>("#preview-overview h3")).find(h => h.textContent === name)?.parentElement?.parentElement ?? null;
    }
    return document.querySelector<HTMLElement>(spec.target);
  }, [stage, language, selectedEntryId, collectionId, journey.collections, journey.trainings, spec.target, ui]);
  const target = getTarget;
  const preparationKey = `${stage}:${language}:${Boolean(modalPortal)}`;
  useEffect(() => {
    let cancelled = false;
    setPreparedFor("");
    const prepareTarget = async () => {
      // A real destination may reveal its section in a child effect after navigation.
      let element = getTarget();
      for (let frame = 0; frame < 180 && (!element || !element.getClientRects().length); frame++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (cancelled) return;
        element = getTarget();
      }
      if (!element || cancelled) return;
      // A target can keep its own size while its expanding ancestor moves it.
      // Joyride observes target resizing, so settle ancestor transitions first.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const transitions = document.getAnimations().filter(animation => {
        const node = (animation.effect as KeyframeEffect | null)?.target;
        return node instanceof Element && node.contains(element) && animation.playState === "running";
      });
      await Promise.allSettled(transitions.map(animation => animation.finished));
      element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      // Wait for stable geometry after scrolling before Joyride measures.
      let previous = "", stable = 0;
      for (let frame = 0; frame < 40 && stable < 3; frame++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const rect = element.getBoundingClientRect();
        const current = [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(":");
        stable = current === previous ? stable + 1 : 0;
        previous = current;
      }
      if (!cancelled) setPreparedFor(preparationKey);
    };
    if (ready && (!settingsOpen || settingsTour || languageStep)) void prepareTarget();
    return () => { cancelled = true; };
  }, [getTarget, preparationKey, ready, detailsOpen, settingsOpen, settingsTour, languageStep]);
  const step = { target, title: stage === "extra-stats" ? copy.statsTitle.replace("{status}", getTarget()?.textContent?.trim() ?? ui.learningProgress.new) : copy[spec.title].replace("{section}", ui.settings.appearance), content: copy[spec.body].replace("{section}", ui.settings.appearance), placement: spec.placement,
    spotlightTarget: ["card", "answer"].includes(stage) ? "#preview-card" : stage === "meaning" ? "#preview-meaning [data-testid=library-sense-card-scroll-region]" : undefined,
    data: { copy, progress: progressLabel(language, stage), languageStep, secondary: stage === "translation", inputStep: ["search", "meaning", "new-collection", "collection-name", "training-name"].includes(stage), complete: stage === "basic-complete" || stage === "complete" || stage === "extras-complete" || stage === "appearance-done" || stage === "languages-choice" || stage === "theme-shortcut-done" || stage === "incoming-words", extrasDone: stage === "extras-complete" || stage === "appearance-done" || stage === "languages-choice" || stage === "theme-shortcut-done" || stage === "incoming-words", known: stage === "extra-known", onExtras: showExtras, onReport: () => setStage("extra-report"), onPause: pauseTour, onDone: () => { if(stage === "appearance-done") {setSettingsOpen(false);setStage("theme-shortcut");return;} if ((stage === "basic-complete" || stage === "complete") && !topicQueue.length) { setRunning(false); setSettingsOpen(false); } else finishTopic(); }, intro: stage === "interface", onLanguageNext: () => confirm(stage === "interface" ? "translation" : "overview"), doneText: stage === "appearance-done" ? copy.continue : copy.done } satisfies MessageData };
  const training = {
    id: "preview-dilum", name: "Dilum NL", language: languageDisplayName(language, "nl"),
    description: `${ui.trainingOverview.exerciseType.Words} · ${ui.trainingOverview.direction.Direct}`,
    summary: `${languageDisplayName(language, "nl")} · ${ui.trainingOverview.exerciseType.Words} · ${ui.trainingOverview.direction.Direct}`,
    completedToday: 0, meaningCount: 12, sessionSize: 10, cardFilter: "both" as const, canLaunch: true,
  };
  const selectedTraining = journey.trainings.find(t => t.id === selectedTrainingId);
  const sessionCollection = selectedTraining && journey.collections.find(c => `user:${c.id}` === selectedTraining.draft.listValue);
  const sessionEntry = gateBankGroup.entries.find(entry => entry.kind === "sense-card" && entry.entryId === sessionCollection?.entryIds[0]);
  const cardEntry = sessionEntry?.kind === "sense-card" ? sessionEntry : gateFurnitureEntry;
  const initialModel = buildTrainingSenseCardModel({ group: gateBankGroup, entry: cardEntry, interfaceLanguage: language });
  // Synthetic content; no account repositories, training controller or learning writes.
  const model = { ...initialModel, repeatCount: 0, reviewCapabilities: [],
    entryTranslation: preferences.translationLanguage === "off" ? undefined : cardEntry.entryId === gateFurnitureEntry.entryId ? sampleWordTranslations[preferences.translationLanguage] : sampleFinanceTranslations[preferences.translationLanguage],
    entryTranslationAlternatives: [], requestTranslationCapability: undefined,
    definitions: preferences.translationLanguage === "ru" ? initialModel.definitions : withoutTranslations(initialModel.definitions),
    examples: preferences.translationLanguage === "ru" ? initialModel.examples : withoutTranslations(initialModel.examples),
    learnCapability: { actionId: "start-learning", elementId: "preview-learn", messageKey: "senseCard.learning.start",
      target: { kind: "sense-card", entryId: cardEntry.entryId, cardTypeId: "word-to-definition", stateRevision: "preview-state" } } as NonNullable<typeof initialModel.learnCapability> };

  const playSampleAudio = () => {
    setAudioNotice(true);
    if (stage === "audio") setStage("details-open");
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(`de ${model.headword}`);
    speech.lang = "nl-NL";
    const voice = window.speechSynthesis.getVoices().find(item => item.lang.startsWith("nl") && item.localService);
    if (voice) speech.voice = voice;
    window.speechSynthesis.speak(speech);
  };

  const progressSnapshot = useMemo(()=>previewMeaningProgress(statsEntryId, journey.learnedEntryIds.includes(statsEntryId)),[statsEntryId,journey.learnedEntryIds]);
  const reportSnapshot = useMemo(()=>freezeSenseCardDiagnosticSnapshot({route:"training",group:gateBankGroup,entry:cardEntry}),[cardEntry]);
  const ownedCollections = journey.collections.filter(collection=>collection.ownership!=="received");
  const sharingCollection = ownedCollections.find(collection => collection.id === collectionId) ?? ownedCollections[0];
  const receivedSource = journey.collections.find(collection=>collection.id===incomingId);
  const savedItems = journey.trainings.map(saved => ({ ...training, id: saved.id, name: saved.name,
    description: `${journey.collections.find(c => `user:${c.id}` === saved.draft.listValue)?.name ?? ""} · ${saved.draft.modes.map(mode => mode === "word-to-definition" ? ui.trainingOverview.direction.Direct : ui.trainingOverview.direction.Reverse).join(" + ")}`,
    summary: `${languageDisplayName(language, "nl")} · ${journey.collections.find(c => `user:${c.id}` === saved.draft.listValue)?.name ?? ""}`,
  }));
  const mainId = stage === "complete" || stage === "basic-complete" ? training.id : selectedTrainingId;
  const sessionName = savedItems.find(item => item.id === selectedTrainingId)?.name ?? training.name;
  const sessionStage = ["card", "audio", "details-open", "details-return", "answer", "exit", "extra-known", "extra-report", "extras-complete"].includes(stage);
  if (!ready) return null;
  return <div className={`${theme.theme} ${styles.root} ${themeMode === "dark" || themeMode === "system" && systemDark ? "dark" : ""}`} data-colour-mode={themeMode === "system" ? systemDark ? "dark" : "light" : themeMode} lang={language} data-preview-stage={stage}>
    <div className={styles.previewBar}><span>{copy.preview}</span>
      <div className={styles.previewActions}><button onClick={replay}><RotateCcw size={14}/>{copy.replay}</button>
      <button onClick={() => { if (commitJourney(emptyJourney())) { setCollectionId(null); setSelectedEntryId(null); replay(); } }}>{copy.resetDemo}</button></div></div>
    {!running && !settingsOpen && <div className={styles.resumeBanner}>{stage === "basic-complete" || stage === "complete" ? copy.tourComplete : copy.paused}<button onClick={resumeTour}>{copy.resume}</button><button onClick={showExtras}>{ui.settings.title}</button></div>}
    <AppFrame activeDestination={languageStep || settingsOpen ? "settings" : isLibraryStage(stage) || catalogStage || incomingStage ? "library" : "training"} settingsActive={languageStep || settingsOpen} interfaceLanguage={language} themePreference={themeMode} immersive={sessionStage && !settingsOpen}
      onNavigate={destination => {
        if (destination === "library") { setSelectedEntryId(null); setStage(stage === "go-sharing-library" ? "extra-sharing" : stage === "go-incoming-library" ? "extra-incoming" : "result"); }
        else if (destination === "training") setStage(stage === "go-training" ? "create-training" : "overview");
        else { setNotice("scope"); setRunning(false); }
      }}
      onCycleTheme={()=>{setThemeMode(nextPreviewTheme);if(stage === "theme-shortcut")setStage("theme-shortcut-done");}} onOpenSettings={()=>{if(stage === "go-settings" || stage === "go-settings-languages") {setSettingsOpen(true);setSettingsPane("home");setStage(stage === "go-settings" ? "appearance-section" : "languages-section");} else pauseTour();}}>
      {(languageStep || settingsOpen) ? <div id="preview-settings" className={styles.settingsDestination}>
        <SettingsDestination open interfaceLanguage={language} themePreference={themeMode} translationLanguage={preferences.translationLanguage === "off" ? null : preferences.translationLanguage}
          initialSection={!running && settingsOpen ? "onboarding" : languageStep ? "languages" : stage === "appearance-section" || stage === "languages-section" ? undefined : settingsPane === "home" ? "onboarding" : settingsPane}
          onSectionChange={section=>{if(section==="appearance"){setSettingsPane("appearance");if(stage==="appearance-section")setStage("appearance-choice");}if(section==="languages"){setSettingsPane("languages");if(stage==="languages-section")setStage("languages-choice");}}}
          onExit={()=>setSettingsOpen(false)} onThemeChange={mode=>{setThemeMode(mode);if(stage==="appearance-choice")setStage("appearance-done");}}
          onInterfaceLanguageChange={value=>{choose({interfaceLanguage:value});}}
          onTranslationLanguageChange={value=>choose({translationLanguage:(value??"off") as PreviewTranslationLanguage})}
          userEmail="demo@example.invalid" onSignOut={()=>{}}
          onboarding={{title:copy.tourName,content:<OnboardingSettingsSection language={language} saveError={saveError} onResume={resumeTour} onRestart={replay} onTopic={topic=>{setTopicQueue([]);openTopic(topic);}} onAll={()=>{setTopicQueue(topics.slice(1));openTopic(topics[0]);}}/>}}/>
      </div> : incomingStage && stage!=="incoming-words" ? <PreviewIncomingCollections language={language} stage={stage} added={Boolean(receivedSource)} sourceName={receivedSource?.name} onAccept={()=>commitJourney(acceptIncoming(journey,language))} onStage={setStage} onWords={()=>setStage("result")} onCollections={()=>setStage("sharing-more")}/>
      : catalogStage ? <PreviewCollectionCatalog language={language} stage={stage} onStage={setStage} onDone={finishTopic} onWords={()=>setStage("extra-sharing")} collection={{id:sharingCollection?.id??"00000000-0000-4000-8000-000000000010",name:sharingCollection?.name??copy.collectionTrainingName,type:"user",item_count:sharingCollection?.entryIds.length??1}}/>
      : (isLibraryStage(stage) || isBuilderStage(stage)) ? <JourneyScreens stage={stage} language={language} translation={preferences.translationLanguage}
        journey={journey} commit={commitJourney} onStage={setStage} selectedEntryId={selectedEntryId} onSelectEntry={setSelectedEntryId}
        collectionId={collectionId} onSelectCollection={setCollectionId} saveError={saveError} restoredBuilder={builderCheckpoint} onBuilderChange={rememberBuilder} onOpenCatalog={()=>setStage("sharing-more")} onOpenShared={()=>setStage("incoming-received")} sourceName={stage === "incoming-words" ? receivedSource?.name : undefined} onPreviewStats={id=>{setStatsEntryId(id);setStatsOpen(true);setStage("extra-stats-view");}} editingTraining={journey.trainings.find(t => t.id === editingTrainingId)}/>
      : !sessionStage ? <div id="preview-overview" className={styles.overview}>
        <TrainingOverview interfaceLanguage={language} state={{ status: "ready", trainings: [training, ...savedItems], mainId,
          availability: { trainingId: mainId, status: "ready", dueToday: 0, totalReviews: 0, stillNew: 12 } }}
          onLaunch={start} onResume={() => start()} onSelect={setSelectedTrainingId} onCreate={() => {
            if (journey.collections.some(c => c.entryIds.length)) { setEditingTrainingId(null); setBuilderCheckpoint(null); setStage("source-open"); setNotice(null); }
            else setNotice("collectionRequired");
          }}
          onEdit={id => { const saved = journey.trainings.find(t => t.id === id); if (saved) { setEditingTrainingId(id); setBuilderCheckpoint(null); setCollectionId(journey.collections.find(c => `user:${c.id}` === saved.draft.listValue)?.id ?? null); setStage("source-open"); } else { setRunning(false); setNotice("editLater"); } }} onRetry={replay}/>
      </div> : <div className={styles.session}>
        <div className={styles.sessionHeader}><span>{sessionName}</span><span>{sessionCompleted} / {sessionCollection?.entryIds.length ?? 10}</span><button id="preview-session-close" aria-label={copy.closeSession} onClick={() => { setRevealed(false); setStage("basic-complete"); }}><X size={18}/></button></div>
        <div id="preview-card" className={styles.card}>
          <TrainingSenseCardStage model={model} mode={selectedTraining?.draft.modes[0] ?? "word-to-definition"} interfaceLanguage={language} side={revealed ? "answer" : "face"}
            reportAction={<button id="preview-report-action" className={senseCardQuietAction()} onClick={() => setReportOpen(true)}><Flag aria-hidden="true" className="h-3.5 w-3.5"/>{platformV2Message(language, "senseCard.report")}</button>}
            onPlayAudio={playSampleAudio} onOpenDetails={() => { setDetailsOpen(true); if (stage === "details-open") setStage("details-return"); }}
            onSideChange={side => { setRevealed(side === "answer"); if (side === "answer") setStage("answer"); }}
            onAction={capability => { if (capability.actionId === "mark-known") { setNotice("knownHint"); return; } if (commitJourney(learnMeaning(journey, cardEntry.entryId))) { setSessionCompleted(1); setStage("exit"); } }}/>
        </div>
        {audioNotice && <p role="status" className={styles.localOnly}>{copy.sampleAudio}</p>}
        <div id="preview-details"><TrainingDetailsDrawer open={detailsOpen} onClose={() => { setDetailsOpen(false); if (stage === "details-return") setStage("extra-known"); }} interfaceLanguage={language}>
          <LibrarySenseCardGroup model={buildLibrarySenseCardGroupModel({ ...gateBankGroup,
            dictionary: { ...gateBankGroup.dictionary, displayName: "Dilum Nederlands" },
            entries: gateBankGroup.entries.map(entry => entry.kind === "sense-card" ? { ...entry,
              card: entry.card ? { ...entry.card, scheduler: { ...entry.card.scheduler, phase: journey.learnedEntryIds.includes(entry.entryId) ? "learning" as const : "not-started" as const, repeatCount: 0 } } : entry.card,
              translation: preferences.translationLanguage === "ru" ? entry.translation : null,
              contentNodes: entry.contentNodes.map(node => ({ ...node, translations: node.translations.filter(t => t.targetLanguageCode === preferences.translationLanguage) })),
            } : entry) }, language)}
            interfaceLanguage={language} contentLanguage="nl" translationLanguage={preferences.translationLanguage === "off" ? undefined : preferences.translationLanguage}
            translationEnabled={preferences.translationLanguage !== "off"} activeMeaningId={cardEntry.entryId} revealActiveMeaning
            inlineGrading={false} onPlayAudio={playSampleAudio} onAction={() => {}}/>
        </TrainingDetailsDrawer></div>
        {reportOpen && <SenseCardReportSheet snapshot={reportSnapshot} interfaceLanguage={language} deliveryEnabled={false} onClose={() => { setReportOpen(false); if (stage === "extra-report") setStage("extras-complete"); }}/>}
      </div>}
      {notice && <p role="status" className={styles.notice}>{copy[notice]}</p>}
      {saveError && !isPickerStage(stage) && stage !== "training-name" && <p role="alert" className={styles.error}>{copy.saveError}</p>}
    </AppFrame>
    <div id="preview-progress">{statsOpen && <MeaningLearningProgress entryId={statsEntryId} language={language} initialProgress={progressSnapshot} onClose={()=>{setStatsOpen(false);finishTopic();}}/>}</div>
    {preparedFor === preparationKey && (!settingsOpen || settingsTour || languageStep) && (!detailsOpen || stage === "details-return") && !reportOpen && <Joyride key={`preview-${stage}:${language}:${Boolean(modalPortal)}`} portalElement={getTarget()?.closest<HTMLElement>("dialog") ?? undefined} run={running} steps={[step]} tooltipComponent={TourMessage}
      onEvent={data => { if (data.status === "skipped" || data.status === "finished") { pauseTour(); } }}
      options={{ skipBeacon: true, hideOverlay: isPickerStage(stage) || stage === "training-name" || stage === "details-return" || stage === "extra-stats-view" || stage.startsWith("sharing-") && stage !== "sharing-more", blockTargetInteraction: false, disableFocusTrap: true, overlayClickAction: false,
        dismissKeyAction: "close", closeButtonAction: "skip", overlayColor: "rgba(24, 19, 34, .52)",
        spotlightPadding: 8, spotlightRadius: 15, arrowColor: "#fff", arrowSize: 8, arrowBase: 16,
        width: 340, zIndex: 10000, skipScroll: true, scrollDuration: 0, primaryColor: "#71608d" }}/> }
  </div>;
}
