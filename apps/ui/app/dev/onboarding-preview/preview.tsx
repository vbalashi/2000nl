"use client";

import React, { useEffect, useLayoutEffect, useState } from "react";
import { Joyride, type TooltipRenderProps } from "react-joyride";
import { X, RotateCcw } from "lucide-react";
import { AppFrame } from "@/components/navigation/AppFrame";
import { TrainingOverview } from "@/components/practice/TrainingOverview";
import { SettingsPanel, SettingsRow } from "@/components/practice/settings/SettingsLayout";
import { TrainingSenseCardStage } from "@/components/training/v2/TrainingSenseCardStage";
import { buildTrainingSenseCardModel, type TrainingSenseCardContent } from "@/components/training/v2/trainingSenseCardModel";
import { gateBankGroup, gateFurnitureEntry, gateSingleSenseGroup } from "@/lib/platform/fixtures/senseCardV1GateFixture";
import { getStoredOnboardingLanguage, type OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import { languageDisplayName } from "@/lib/languages/languageDisplayName";
import { previewLocales, previewSteps, previewLanguageOptions, progressLabel, type PreviewCopy, type PreviewStage } from "./content";
import { readPreviewPreferences, resolvePreviewPreferences, savePreviewPreferences, previewTranslationLanguages, type PreviewPreferences, type PreviewTranslationLanguage } from "./preferences";
import { JourneyScreens, isLibraryStage, isBuilderStage, isPickerStage, buttonWithText } from "./JourneyScreens";
import { emptyJourney, readJourney, saveJourney, learnMeaning, type Journey } from "./journeyState";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import settingsStyle from "@/components/practice/settings/settings.module.css";
import styles from "./preview.module.css";

type MessageData = { copy: PreviewCopy; progress: string; languageStep: boolean; secondary: boolean; inputStep: boolean; complete: boolean };
function TourMessage({ step, tooltipProps, controls }: TooltipRenderProps) {
  const data = step.data as MessageData;
  return <div {...tooltipProps} className={styles.tooltip}>
    <div className={styles.tooltipTop}><span>{data.progress}</span>
      <button onClick={() => controls.skip()} aria-label={data.copy.close}><X size={18}/></button></div>
    <h2>{step.title}</h2><div className={styles.copy}>{step.content}</div>
    {data.secondary && <p className={styles.secondaryMention}>{data.copy.secondaryMention}</p>}
    {data.complete ? <button className={styles.confirm} onClick={() => controls.skip()}>{data.copy.done}</button>
      : <p className={styles.instruction}>{data.languageStep ? data.copy.confirmHint : data.inputStep ? data.copy.actionHint : data.copy.clickHint}</p>}
  </div>;
}

const sampleFinanceTranslations = { en: "bank", nl: "bank", ru: "банк", de: "Bank", fr: "banque", es: "banco" };
const sampleWordTranslations = { en: "bench · sofa", nl: "zitbank", ru: "скамья · диван", de: "Sitzbank · Sofa", fr: "banc · canapé", es: "banco · sofá" };
function withoutTranslations(nodes: TrainingSenseCardContent[]): TrainingSenseCardContent[] {
  return nodes.map(node => ({ ...node, translation: undefined, literalTranslation: undefined, children: withoutTranslations(node.children) }));
}

export function OnboardingPreview() {
  const [preferences, setPreferences] = useState<PreviewPreferences>(() => resolvePreviewPreferences(null));
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<PreviewStage>("interface");
  const [revealed, setRevealed] = useState(false);
  const [running, setRunning] = useState(true);
  const [notice, setNotice] = useState<keyof PreviewCopy | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [journey, setJourney] = useState<Journey>(emptyJourney);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [selectedTrainingId, setSelectedTrainingId] = useState("preview-dilum");
  const [modalPortal, setModalPortal] = useState<HTMLElement | null>(null);
  const [sessionCompleted, setSessionCompleted] = useState(0);
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(null);
  const language = preferences.interfaceLanguage;
  const copy = previewLocales[language];
  const ui = getUiMessages(language);
  const languageStep = stage === "interface" || stage === "translation";

  useEffect(() => {
    // Read an available saved app language, but never write app/account keys.
    try { setPreferences(readPreviewPreferences(window.localStorage, getStoredOnboardingLanguage())); }
    catch { setPreferences(resolvePreviewPreferences(null)); }
    try { setJourney(readJourney(window.localStorage)); } catch { /* isolated preview storage */ }
    setReady(true);
  }, []);
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
    const selector = isPickerStage(stage) ? "#preview-collections dialog" : stage === "training-name" ? "#preview-builder dialog" : null;
    setModalPortal(selector ? document.querySelector<HTMLElement>(selector) : null);
  }, [stage]);
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
  const replay = () => { setRunning(false); setStage("interface"); setRevealed(false); setNotice(null); setSelectedTrainingId("preview-dilum"); requestAnimationFrame(() => setRunning(true)); };
  const start = (id = "preview-dilum") => { setSelectedTrainingId(id); setSessionCompleted(0); setStage("card"); setRevealed(false); setNotice(null); };
  const spec = previewSteps.find(step => step.id === stage)!;
  const getTarget = () => {
    const b = ui.builder;
    const entrySelector = `#preview-meaning [data-entry-id="${selectedEntryId}"]`;
    if (stage === "card") return document.querySelector<HTMLElement>(`#preview-card button[aria-label="${platformV2Message(language, "senseCard.answer.show")}"]`);
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
  };
  const target = getTarget;
  const prepareTarget = async () => {
    const element = getTarget();
    if (!element) return;
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
  };
  const step = { target, title: copy[spec.title], content: copy[spec.body], placement: spec.placement,
    before: prepareTarget,
    spotlightTarget: stage === "meaning" ? "#preview-meaning [data-testid=library-sense-card-scroll-region]" : undefined,
    data: { copy, progress: progressLabel(language, stage), languageStep, secondary: stage === "translation", inputStep: ["search", "meaning", "new-collection", "collection-name", "training-name"].includes(stage), complete: stage === "complete" } satisfies MessageData };
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
  const initialModel = buildTrainingSenseCardModel({ group: gateSingleSenseGroup, entry: cardEntry, interfaceLanguage: language });
  // Synthetic content; no account repositories, training controller or learning writes.
  const model = { ...initialModel, repeatCount: 0, reviewCapabilities: [],
    entryTranslation: preferences.translationLanguage === "off" ? undefined : cardEntry.entryId === gateFurnitureEntry.entryId ? sampleWordTranslations[preferences.translationLanguage] : sampleFinanceTranslations[preferences.translationLanguage],
    entryTranslationAlternatives: [], requestTranslationCapability: undefined,
    definitions: preferences.translationLanguage === "ru" ? initialModel.definitions : withoutTranslations(initialModel.definitions),
    examples: preferences.translationLanguage === "ru" ? initialModel.examples : withoutTranslations(initialModel.examples),
    learnCapability: { actionId: "start-learning", elementId: "preview-learn", messageKey: "senseCard.learning.start",
      target: { kind: "sense-card", entryId: cardEntry.entryId, cardTypeId: "word-to-definition", stateRevision: "preview-state" } } as NonNullable<typeof initialModel.learnCapability> };

  const savedItems = journey.trainings.map(saved => ({ ...training, id: saved.id, name: saved.name,
    description: `${journey.collections.find(c => `user:${c.id}` === saved.draft.listValue)?.name ?? ""} · ${saved.draft.modes.map(mode => mode === "word-to-definition" ? ui.trainingOverview.direction.Direct : ui.trainingOverview.direction.Reverse).join(" + ")}`,
    summary: `${languageDisplayName(language, "nl")} · ${journey.collections.find(c => `user:${c.id}` === saved.draft.listValue)?.name ?? ""}`,
  }));
  const mainId = stage === "complete" ? training.id : selectedTrainingId;
  const sessionName = savedItems.find(item => item.id === selectedTrainingId)?.name ?? training.name;
  const sessionStage = ["card", "answer", "exit"].includes(stage);
  if (!ready) return null;
  return <div className={`${theme.theme} ${styles.root}`} lang={language} data-preview-stage={stage}>
    <div className={styles.previewBar}><span>{copy.preview}</span>
      <div className={styles.previewActions}><button onClick={replay}><RotateCcw size={14}/>{copy.replay}</button>
      <button onClick={() => { if (commitJourney(emptyJourney())) { setCollectionId(null); setSelectedEntryId(null); replay(); } }}>{copy.resetDemo}</button></div></div>
    <AppFrame activeDestination={languageStep ? "settings" : isLibraryStage(stage) ? "library" : "training"} settingsActive={languageStep} interfaceLanguage={language} themePreference="system" immersive={sessionStage}
      onNavigate={destination => {
        if (destination === "library") { setSelectedEntryId(null); setStage("search"); }
        else if (destination === "training") setStage(stage === "go-training" ? "create-training" : "overview");
        else { setNotice("scope"); setRunning(false); }
      }}
      onCycleTheme={() => { setNotice("themeLater"); setRunning(false); }} onOpenSettings={replay}>
      {languageStep ? <div className={styles.languages}>
        <h1>{ui.settings.languages}</h1>
        <SettingsPanel title={ui.settings.title}>
          <div id="preview-interface" className={styles.languageTarget}>
            <SettingsRow title={ui.settings.interfaceLanguage} hint={copy.interfaceHint} className={styles.languageRow}>
              <select className={settingsStyle.select} aria-label={ui.settings.interfaceLanguage} value={language}
                onChange={event => choose({ interfaceLanguage: event.target.value as OnboardingLanguage })}>
                {previewLanguageOptions.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
              {stage === "interface" && <button className={styles.confirm} onClick={() => confirm("translation")}>{copy.interfaceConfirm}</button>}
            </SettingsRow>
            {stage === "interface" && saveError && <p role="alert" className={styles.error}>{copy.saveError}</p>}
          </div>
          <div id="preview-translation" className={styles.languageTarget}>
            <SettingsRow title={ui.settings.translationLanguage} className={styles.languageRow}>
              <select className={settingsStyle.select} aria-label={ui.settings.translationLanguage} value={preferences.translationLanguage}
                onChange={event => choose({ translationLanguage: event.target.value as PreviewTranslationLanguage })}>
                <option value="off">{ui.settings.off}</option>
                {previewTranslationLanguages.map(code => <option key={code} value={code}>{languageDisplayName(language, code)}</option>)}
              </select>
              {stage === "translation" && <button className={styles.confirm} onClick={() => confirm("overview")}>{copy.translationConfirm}</button>}
            </SettingsRow>
            {stage === "translation" && saveError && <p role="alert" className={styles.error}>{copy.saveError}</p>}
          </div>
          <SettingsRow title={ui.settings.secondaryTranslationLanguage} hint={copy.secondaryMention} className={styles.languageRow}>
            <span className={styles.later}>{copy.later}</span>
          </SettingsRow>
        </SettingsPanel>
        <p className={styles.localOnly}>{copy.localOnly}</p>
      </div> : (isLibraryStage(stage) || isBuilderStage(stage)) ? <JourneyScreens stage={stage} language={language} translation={preferences.translationLanguage}
        journey={journey} commit={commitJourney} onStage={setStage} selectedEntryId={selectedEntryId} onSelectEntry={setSelectedEntryId}
        collectionId={collectionId} onSelectCollection={setCollectionId} saveError={saveError} editingTraining={journey.trainings.find(t => t.id === editingTrainingId)}/>
      : !sessionStage ? <div id="preview-overview" className={styles.overview}>
        <TrainingOverview interfaceLanguage={language} state={{ status: "ready", trainings: [training, ...savedItems], mainId,
          availability: { trainingId: mainId, status: "ready", dueToday: 0, totalReviews: 0, stillNew: 12 } }}
          onLaunch={start} onResume={() => start()} onSelect={setSelectedTrainingId} onCreate={() => {
            if (journey.collections.some(c => c.entryIds.length)) { setEditingTrainingId(null); setStage("source-open"); setNotice(null); }
            else setNotice("collectionRequired");
          }}
          onEdit={id => { const saved = journey.trainings.find(t => t.id === id); if (saved) { setEditingTrainingId(id); setCollectionId(journey.collections.find(c => `user:${c.id}` === saved.draft.listValue)?.id ?? null); setStage("source-open"); } else { setRunning(false); setNotice("editLater"); } }} onRetry={replay}/>
      </div> : <div className={styles.session}>
        <div className={styles.sessionHeader}><span>{sessionName}</span><span>{sessionCompleted} / {sessionCollection?.entryIds.length ?? 10}</span><button id="preview-session-close" aria-label={copy.closeSession} onClick={() => { setRevealed(false); setStage("go-library"); }}><X size={18}/></button></div>
        <div id="preview-card" className={styles.card}>
          <TrainingSenseCardStage model={model} mode={selectedTraining?.draft.modes[0] ?? "word-to-definition"} interfaceLanguage={language} side={revealed ? "answer" : "face"}
            onSideChange={side => { setRevealed(side === "answer"); if (side === "answer") setStage("answer"); }}
            onAction={() => { if (commitJourney(learnMeaning(journey, cardEntry.entryId))) { setSessionCompleted(1); setRevealed(false); setStage("exit"); } }}/>
        </div>
      </div>}
      {notice && <p role="status" className={styles.notice}>{copy[notice]}</p>}
      {saveError && !isPickerStage(stage) && stage !== "training-name" && <p role="alert" className={styles.error}>{copy.saveError}</p>}
    </AppFrame>
    <Joyride key={`preview-${stage}:${language}:${Boolean(modalPortal)}`} portalElement={modalPortal ?? undefined} run={running} steps={[step]} tooltipComponent={TourMessage}
      onEvent={data => { if (data.status === "skipped" || data.status === "finished") setRunning(false); }}
      options={{ skipBeacon: true, hideOverlay: isPickerStage(stage) || stage === "training-name", blockTargetInteraction: false, disableFocusTrap: true, overlayClickAction: false,
        dismissKeyAction: "close", closeButtonAction: "skip", overlayColor: "rgba(24, 19, 34, .52)",
        spotlightPadding: 8, spotlightRadius: 15, arrowColor: "#fff", arrowSize: 8, arrowBase: 16,
        width: 340, zIndex: 10000, skipScroll: true, scrollDuration: 0, primaryColor: "#71608d" }}/>
  </div>;
}
